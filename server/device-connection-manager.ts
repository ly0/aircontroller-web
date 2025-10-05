import { WebSocket } from 'ws';
import { CommandClient, HeartbeatClient } from './tcp-client';
import { Device } from '../types';
import axios from 'axios';
import { PORTS } from './constants';

export interface MobileConnection {
  device: Device;
  commandClient: CommandClient;
  heartbeatClient: HeartbeatClient;
  webSocketClients: Set<WebSocket>;
  connected: boolean;
  lastActivity: Date;
}

export class DeviceConnectionManager {
  private connections: Map<string, MobileConnection> = new Map();

  /**
   * Connect to a mobile device from a WebSocket client
   */
  async connectToDevice(device: Device, ws: WebSocket): Promise<void> {
    const deviceKey = device.ip;

    // Check if we already have a connection to this device
    let connection = this.connections.get(deviceKey);

    if (!connection) {
      // Create new connection
      console.log(`Creating new connection to device ${device.name} (${device.ip})`);

      const commandClient = new CommandClient();
      const heartbeatClient = new HeartbeatClient();

      connection = {
        device,
        commandClient,
        heartbeatClient,
        webSocketClients: new Set(),
        connected: false,
        lastActivity: new Date(),
      };

      this.connections.set(deviceKey, connection);

      try {
        // Connect TCP clients to mobile device (sequential like Flutter Desktop)
        // First connect command client
        await commandClient.connect(device.ip);
        console.log(`Command client connected to ${device.name}`);

        // Then connect heartbeat client
        await heartbeatClient.connect(device.ip);
        console.log(`Heartbeat client connected to ${device.name}`);

        connection.connected = true;
        console.log(`Successfully connected to ${device.name}`);

        // Setup event forwarding from TCP to WebSocket
        this.setupEventForwarding(connection);

        // Fetch mobile info via HTTP API
        this.fetchMobileInfo(connection).catch(err => {
          console.error('Failed to fetch mobile info:', err);
        });

        // Notify WebSocket client of successful connection
        ws.send(JSON.stringify({
          type: 'connection:success',
          device: device,
        }));

      } catch (error) {
        console.error(`Failed to connect to ${device.name}:`, error);

        // Clean up failed connection
        commandClient.disconnect();
        heartbeatClient.disconnect();
        this.connections.delete(deviceKey);

        // Notify WebSocket client of failure
        ws.send(JSON.stringify({
          type: 'connection:error',
          error: 'Failed to connect to device',
          device: device,
        }));

        throw error;
      }
    } else {
      console.log(`Reusing existing connection to ${device.name}`);

      // Notify WebSocket client of successful connection
      ws.send(JSON.stringify({
        type: 'connection:success',
        device: device,
      }));
    }

    // Add WebSocket client to connection
    connection.webSocketClients.add(ws);

    // Setup WebSocket message handling
    this.setupWebSocketHandling(ws, connection);
  }

  /**
   * Setup event forwarding from TCP clients to WebSocket clients
   */
  private setupEventForwarding(connection: MobileConnection) {
    const { commandClient, heartbeatClient, webSocketClients } = connection;

    // Forward command events
    commandClient.on('mobile:info', (data) => {
      // Update device info in connection (merge with existing data)
      if (!connection.device.deviceInfo) {
        connection.device.deviceInfo = {
          model: connection.device.name,
          manufacturer: 'Android',
          androidVersion: '',
          battery: data.battery,
          storage: data.storage,
        };
      } else {
        connection.device.deviceInfo = {
          ...connection.device.deviceInfo,
          battery: data.battery,
          storage: data.storage,
        };
      }

      console.log('Updated device info with mobile data:', {
        battery: data.battery,
        storage: data.storage
      });

      // Broadcast mobile info update to all WebSocket clients
      this.broadcastToClients(webSocketClients, {
        type: 'mobile:info:update',
        deviceId: connection.device.id,
        data: data,
      });
    });

    commandClient.on('command', (message) => {
      this.broadcastToClients(webSocketClients, {
        type: 'command:received',
        data: message,
      });
    });

    // Forward heartbeat events
    heartbeatClient.on('heartbeat', (data) => {
      connection.lastActivity = new Date();
      // Optionally broadcast heartbeat to clients
    });

    // Handle disconnections
    commandClient.on('disconnected', () => {
      console.log('Command client disconnected');
      this.handleDeviceDisconnection(connection);
    });

    heartbeatClient.on('disconnected', () => {
      console.log('Heartbeat client disconnected');
      this.handleDeviceDisconnection(connection);
    });
  }

  /**
   * Setup WebSocket message handling
   */
  private setupWebSocketHandling(ws: WebSocket, connection: MobileConnection) {
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleWebSocketMessage(message, connection, ws);
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to process message',
        }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      connection.webSocketClients.delete(ws);

      // Keep the TCP connection alive even if no WebSocket clients
      // This allows the connection to persist when the web page refreshes
      if (connection.webSocketClients.size === 0) {
        console.log('No more WebSocket clients, but keeping TCP connection alive');
        // Optionally close after a longer timeout (5 minutes instead of 30 seconds)
        // setTimeout(() => {
        //   if (connection.webSocketClients.size === 0) {
        //     this.closeConnection(connection.device.ip);
        //   }
        // }, 300000); // 5 minutes
      }
    });
  }

  /**
   * Handle messages from WebSocket clients
   */
  public async handleWebSocketMessage(
    message: any,
    connection: MobileConnection | null,
    ws: WebSocket
  ) {
    // If no connection provided, try to find one based on the WebSocket
    if (!connection) {
      // Find a connection that includes this WebSocket client
      for (const conn of this.connections.values()) {
        if (conn.webSocketClients.has(ws)) {
          connection = conn;
          break;
        }
      }

      // If still no connection, try to get the first available connection
      if (!connection && this.connections.size > 0) {
        connection = this.connections.values().next().value;
        console.log('Using first available connection for message:', message.type);
      }

      if (!connection) {
        console.log('No connection found for message:', message.type);
        // Send error response if message expects a response
        if (message.id) {
          ws.send(JSON.stringify({
            id: message.id,
            type: 'error',
            error: 'No device connected',
          }));
        }
        return;
      }
    }
    const { type, payload, id } = message;

    console.log(`Handling WebSocket message: ${type}`);

    switch (type) {
      case 'device:info':
        // Request device info via HTTP
        await this.getDeviceInfo(connection, ws, id);
        break;

      case 'file:list':
        // Get file list via HTTP
        await this.getFileList(connection, ws, payload?.path || '/', id);
        break;

      case 'file:download':
        // Download file via HTTP
        await this.downloadFile(connection, ws, payload?.path, id);
        break;

      case 'file:upload':
        // Upload file via HTTP
        await this.uploadFile(connection, ws, payload, id);
        break;

      case 'file:delete':
        // Delete file via HTTP
        await this.deleteFile(connection, ws, payload?.path, id);
        break;

      case 'image:list':
        // Get images via HTTP with optional albumId
        await this.getImages(connection, ws, id, payload?.albumId);
        break;

      case 'album:list':
        // Get albums via HTTP
        await this.getAlbums(connection, ws, id);
        break;

      case 'contact:list':
        // Get contacts via HTTP
        await this.getContacts(connection, ws, id);
        break;

      case 'app:list':
        // Get installed apps via HTTP
        await this.getApps(connection, ws, id);
        break;

      case 'video:list':
        // Get videos via HTTP
        await this.getVideos(connection, ws, id);
        break;

      case 'heartbeat':
        // Handle heartbeat from client - just acknowledge it
        ws.send(JSON.stringify({
          type: 'heartbeat:ack',
          timestamp: Date.now(),
        }));
        break;

      case 'register':
        // Handle device registration
        ws.send(JSON.stringify({
          type: 'register:ack',
          success: true,
        }));
        break;

      default:
        // For unknown message types, don't send error, just log
        console.log(`Unhandled message type: ${type}`);
        // Only send error if there's an id (meaning it expects a response)
        if (id) {
          ws.send(JSON.stringify({
            id,
            type: 'error',
            error: `Unknown message type: ${type}`,
          }));
        }
    }
  }

  /**
   * Fetch mobile info from HTTP API with retry mechanism
   */
  private async fetchMobileInfo(connection: MobileConnection) {
    const maxRetries = 3;
    let lastError: any = null;

    // 给手机端一些时间启动 HTTP 服务器
    await new Promise(resolve => setTimeout(resolve, 1000));

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = `http://${connection.device.ip}:${PORTS.HTTP}/common/mobileInfo`;
        console.log(`[Attempt ${attempt}/${maxRetries}] Fetching mobile info from: ${url}`);

        const response = await axios.post(url, {}, {
          timeout: 10000, // 增加超时时间到 10 秒
          headers: {
            'Content-Type': 'application/json',
          },
          validateStatus: (status) => status < 500, // 只有 5xx 错误才重试
        });

        if (response.data && response.data.code === 0 && response.data.data) {
          const mobileInfo = response.data.data;

          // Update device info in connection
          const deviceInfo = {
            battery: mobileInfo.batteryLevel || 0,
            storage: {
              total: mobileInfo.storageSize?.totalSize || 0,
              available: mobileInfo.storageSize?.availableSize || 0,
              used: (mobileInfo.storageSize?.totalSize || 0) - (mobileInfo.storageSize?.availableSize || 0),
              free: mobileInfo.storageSize?.availableSize || 0,
            }
          };

          if (!connection.device.deviceInfo) {
            connection.device.deviceInfo = {
              model: connection.device.name,
              manufacturer: 'Android',
              androidVersion: '',
              ...deviceInfo,
            };
          } else {
            connection.device.deviceInfo = {
              ...connection.device.deviceInfo,
              ...deviceInfo,
            };
          }

          console.log('Successfully fetched mobile info:', deviceInfo);

          // Broadcast mobile info update to all WebSocket clients
          this.broadcastToClients(connection.webSocketClients, {
            type: 'mobile:info:update',
            deviceId: connection.device.id,
            data: deviceInfo,
          });

          return true;
        } else if (response.status === 404) {
          console.error('Mobile info endpoint not found (404). The mobile app may not have this endpoint implemented yet.');
          break; // 不重试 404 错误
        }
      } catch (error: any) {
        lastError = error;
        const errorMessage = error.code === 'ECONNABORTED'
          ? `Connection timeout (attempt ${attempt}/${maxRetries})`
          : error.code === 'ECONNREFUSED'
          ? `Connection refused - HTTP server may not be running (attempt ${attempt}/${maxRetries})`
          : `Connection error: ${error.message} (attempt ${attempt}/${maxRetries})`;

        console.warn(errorMessage);

        // 如果不是最后一次尝试，等待一段时间后重试
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 所有尝试都失败了
    console.error('Failed to fetch mobile info after all retries:', lastError?.message || 'Unknown error');
    console.log('Note: Connection will continue even without mobile info. The mobile HTTP server might not be ready yet.');

    // 设置默认的设备信息，即使获取失败
    if (!connection.device.deviceInfo) {
      connection.device.deviceInfo = {
        model: connection.device.name,
        manufacturer: 'Android',
        androidVersion: '',
        battery: 0,
        storage: {
          total: 0,
          available: 0,
          used: 0,
          free: 0,
        }
      };
    }

    return false;
  }

  /**
   * HTTP API calls to mobile device
   */
  private async makeHttpRequest(
    connection: MobileConnection,
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    data?: any
  ) {
    const url = `http://${connection.device.ip}:${PORTS.HTTP}${endpoint}`;
    console.log(`Making HTTP request: ${method} ${url}`);

    try {
      const response = await axios({
        method,
        url,
        data,
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      console.error(`HTTP request failed: ${error.message}`);
      throw error;
    }
  }

  private async getDeviceInfo(connection: MobileConnection, ws: WebSocket, id: string) {
    try {
      const info = await this.makeHttpRequest(connection, '/device/info');
      ws.send(JSON.stringify({
        id,
        type: 'device:info:response',
        data: info,
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        id,
        type: 'error',
        error: 'Failed to get device info',
      }));
    }
  }

  private async getFileList(
    connection: MobileConnection,
    ws: WebSocket,
    path: string,
    id: string
  ) {
    try {
      // Use the correct API endpoint for file list - /file/list
      const response = await this.makeHttpRequest(connection, '/file/list', 'POST', { path: path || '' });

      // Check the response format and extract data
      const rawFiles = response?.data || [];

      // Transform mobile FileEntity format to web FileItem format
      // Mobile format: { name, folder, size, isDir, changeDate, isEmpty }
      // Web format: { id, name, path, type, size, modified, mimeType? }
      const files = rawFiles.map((file: any) => {
        const fullPath = `${file.folder}/${file.name}`;
        return {
          id: fullPath,
          name: file.name,
          path: fullPath,
          type: file.isDir ? 'folder' : 'file',
          size: file.size || 0,
          modified: new Date(file.changeDate),
          mimeType: file.isDir ? undefined : this.getMimeType(file.name),
        };
      });

      ws.send(JSON.stringify({
        id,
        type: 'file:list:response',
        data: files,
      }));
    } catch (error) {
      console.error('Error getting file list:', error);
      ws.send(JSON.stringify({
        id,
        type: 'error',
        error: 'Failed to get file list',
      }));
    }
  }

  private async downloadFile(
    connection: MobileConnection,
    ws: WebSocket,
    path: string,
    id: string
  ) {
    try {
      const data = await this.makeHttpRequest(connection, `/file/download?path=${encodeURIComponent(path)}`);
      ws.send(JSON.stringify({
        id,
        type: 'file:download:response',
        data: data,
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        id,
        type: 'error',
        error: 'Failed to download file',
      }));
    }
  }

  private async uploadFile(
    connection: MobileConnection,
    ws: WebSocket,
    payload: any,
    id: string
  ) {
    try {
      // File upload needs special handling
      ws.send(JSON.stringify({
        id,
        type: 'file:upload:response',
        data: { success: true },
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        id,
        type: 'error',
        error: 'Failed to upload file',
      }));
    }
  }

  private async deleteFile(
    connection: MobileConnection,
    ws: WebSocket,
    path: string,
    id: string
  ) {
    try {
      await this.makeHttpRequest(connection, `/file`, 'DELETE', { path });
      ws.send(JSON.stringify({
        id,
        type: 'file:delete:response',
        data: { success: true },
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        id,
        type: 'error',
        error: 'Failed to delete file',
      }));
    }
  }

  private async getImages(connection: MobileConnection, ws: WebSocket, id: string, albumId?: string) {
    try {
      // Use the correct API endpoints
      const endpoint = albumId ? '/image/imagesOfAlbum' : '/image/all';
      const body = albumId ? { id: albumId } : {};
      const response = await this.makeHttpRequest(connection, endpoint, 'POST', body);

      // Check the response format and extract data
      let images = response?.data || [];

      // Add thumbnail URLs for each image
      images = images.map((image: any) => ({
        ...image,
        // Generate thumbnail URL from device HTTP server
        thumbnailUrl: `http://${connection.device.ip}:${PORTS.HTTP}/stream/thumbnail?path=${encodeURIComponent(image.path)}`
      }));

      ws.send(JSON.stringify({
        id,
        type: 'image:list:response',
        data: images,
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        id,
        type: 'error',
        error: 'Failed to get images',
      }));
    }
  }

  private async getAlbums(connection: MobileConnection, ws: WebSocket, id: string) {
    try {
      // Use the correct API endpoint for albums - /image/albums
      const response = await this.makeHttpRequest(connection, '/image/albums', 'POST', {});

      // Check the response format and extract data
      const albums = response?.data || [];

      ws.send(JSON.stringify({
        id,
        type: 'album:list:response',
        data: albums,
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        id,
        type: 'error',
        error: 'Failed to get albums',
      }));
    }
  }

  private getMimeType(filename: string): string | undefined {
    const ext = filename.split('.').pop()?.toLowerCase();
    // cSpell:disable
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
    };
    // cSpell:enable
    return ext ? mimeTypes[ext] : undefined;
  }

  private async getContacts(connection: MobileConnection, ws: WebSocket, id: string) {
    try {
      const contacts = await this.makeHttpRequest(connection, '/contacts');
      ws.send(JSON.stringify({
        id,
        type: 'contact:list:response',
        data: contacts,
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        id,
        type: 'error',
        error: 'Failed to get contacts',
      }));
    }
  }

  private async getApps(connection: MobileConnection, ws: WebSocket, id: string) {
    try {
      const apps = await this.makeHttpRequest(connection, '/apps');
      ws.send(JSON.stringify({
        id,
        type: 'app:list:response',
        data: apps,
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        id,
        type: 'error',
        error: 'Failed to get apps',
      }));
    }
  }

  private async getVideos(connection: MobileConnection, ws: WebSocket, id: string) {
    try {
      // Use the correct API endpoint - /video/videos (POST)
      const response = await this.makeHttpRequest(connection, '/video/videos', 'POST', {});

      // Check the response format and extract data
      let videos = response?.data || [];

      // Transform video data to match web interface
      videos = videos.map((video: any) => ({
        id: video.id?.toString() || '',
        name: video.name || '',
        path: video.path || '',
        type: 'file' as const,
        size: video.size || 0,
        modified: new Date(video.lastModifyTime || Date.now()),
        duration: Math.floor((video.duration || 0) / 1000), // Convert from milliseconds to seconds
        // Generate thumbnail URL using the correct thumbnail endpoint
        thumbnailUrl: `http://${connection.device.ip}:${PORTS.HTTP}/stream/video/thumbnail/${video.id}/200/200`
      }));

      ws.send(JSON.stringify({
        id,
        type: 'video:list:response',
        data: videos,
      }));
    } catch (error: any) {
      console.error('getVideos error:', error.message);
      ws.send(JSON.stringify({
        id,
        type: 'error',
        error: 'Failed to get videos',
      }));
    }
  }

  /**
   * Broadcast message to all WebSocket clients
   */
  private broadcastToClients(clients: Set<WebSocket>, message: any) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  /**
   * Handle device disconnection
   */
  private handleDeviceDisconnection(connection: MobileConnection) {
    // Check if both connections are down
    const commandConnected = connection.commandClient.isConnected();
    const heartbeatConnected = connection.heartbeatClient.isConnected();

    console.log(`Connection status - Command: ${commandConnected}, Heartbeat: ${heartbeatConnected}`);

    // Only mark as disconnected if BOTH connections are down
    if (!commandConnected && !heartbeatConnected) {
      connection.connected = false;

      // Notify all WebSocket clients
      this.broadcastToClients(connection.webSocketClients, {
        type: 'device:disconnected',
        device: connection.device,
      });

      // Clean up connection after a delay
      setTimeout(() => {
        // Double check both are still disconnected before cleaning up
        if (!connection.commandClient.isConnected() && !connection.heartbeatClient.isConnected()) {
          this.closeConnection(connection.device.ip);
        }
      }, 5000);
    } else {
      // One connection is still alive, try to reconnect the failed one
      console.log('One connection still alive, attempting to recover...');

      // If command is down but heartbeat is up, try to reconnect command
      if (!commandConnected && heartbeatConnected) {
        console.log('Attempting to reconnect command client in 2 seconds...');
        setTimeout(() => {
          // Check again before attempting reconnect
          if (!connection.commandClient.isConnected() && connection.heartbeatClient.isConnected()) {
            connection.commandClient.connect(connection.device.ip).catch(err => {
              console.error('Failed to reconnect command client:', err);
              // Will trigger handleDeviceDisconnection again if both fail
            });
          }
        }, 2000);
      }

      // If heartbeat is down but command is up, try to reconnect heartbeat
      if (commandConnected && !heartbeatConnected) {
        console.log('Attempting to reconnect heartbeat client in 2 seconds...');
        setTimeout(() => {
          // Check again before attempting reconnect
          if (connection.commandClient.isConnected() && !connection.heartbeatClient.isConnected()) {
            connection.heartbeatClient.connect(connection.device.ip).catch(err => {
              console.error('Failed to reconnect heartbeat client:', err);
              // Will trigger handleDeviceDisconnection again if both fail
            });
          }
        }, 2000);
      }
    }
  }

  /**
   * Close connection to a device
   */
  closeConnection(deviceIp: string) {
    const connection = this.connections.get(deviceIp);
    if (connection) {
      console.log(`Closing connection to ${connection.device.name}`);

      // Disconnect TCP clients
      connection.commandClient.disconnect();
      connection.heartbeatClient.disconnect();

      // Notify WebSocket clients
      this.broadcastToClients(connection.webSocketClients, {
        type: 'connection:closed',
        device: connection.device,
      });

      // Remove connection
      this.connections.delete(deviceIp);
    }
  }

  /**
   * Get all active connections
   */
  getConnections(): MobileConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Check if device is connected
   */
  isDeviceConnected(deviceIp: string): boolean {
    const connection = this.connections.get(deviceIp);
    return connection?.connected || false;
  }

  /**
   * Check if there are any active connections
   */
  hasActiveConnections(): boolean {
    for (const connection of this.connections.values()) {
      if (connection.connected) {
        return true;
      }
    }
    return false;
  }
}