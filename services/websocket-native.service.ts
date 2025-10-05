import { Device, DeviceInfo, FileItem, ImageItem, Album, Contact, AppInfo, VideoItem } from '@/types';

interface MessageHandler {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class WebSocketNativeService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private messageHandlers: Map<string, MessageHandler> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private shouldReconnect = true;
  private lastUrl: string | null = null;

  async connect(deviceIp: string, port?: number): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect();
    }

    // If no port is provided, fetch it from the API
    let actualPort = port;
    if (!actualPort) {
      try {
        const response = await fetch('/api/ws-port');
        if (response.ok) {
          const data = await response.json();
          actualPort = data.port;
          console.log('WebSocket server port discovered:', actualPort);
        } else {
          throw new Error('Failed to discover WebSocket server port');
        }
      } catch (error) {
        console.error('Failed to fetch WebSocket port:', error);
        throw new Error('WebSocket server not available');
      }
    }

    const url = `ws://${deviceIp}:${actualPort}`;
    this.lastUrl = url;
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;  // Reset reconnect attempts on successful connection
        this.stopReconnect();  // Stop any pending reconnection attempts
        this.startHeartbeat();
        this.emit('connected');
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.stopHeartbeat();
        this.emit('disconnected');

        // Attempt to reconnect if not manually disconnected
        if (this.shouldReconnect) {
          this.attemptReconnect();
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      // Connection timeout
      setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.lastUrl) {
      console.log('Max reconnection attempts reached or no URL to reconnect to');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Exponential backoff, max 30s

    console.log(`Attempting to reconnect (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);

    this.reconnectInterval = setTimeout(() => {
      if (this.shouldReconnect && this.lastUrl) {
        const [, host] = this.lastUrl.match(/ws:\/\/([^:]+):(\d+)/) || [];
        if (host) {
          // Don't pass port, let it be auto-discovered
          this.connect(host).catch(err => {
            console.error('Reconnection failed:', err);
            // Will trigger another reconnect attempt via onclose handler
          });
        }
      }
    }, delay);
  }

  private stopReconnect() {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data);

      switch (data.type) {
        case 'connected':
          console.log('Connected to server:', data.message);
          break;

        case 'register:ack':
          console.log('Device registered successfully');
          break;

        case 'heartbeat:ack':
          // Heartbeat acknowledged
          break;

        case 'device:discovered':
          console.log('New device discovered via UDP:', data.device);
          // Notify device discovery listeners
          this.emit('device:discovered', data.device);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('device:discovered', { detail: data.device }));
          }
          break;

        case 'connection:success':
          console.log('Device connection successful:', data.device);
          this.emit('connection:success', data);
          break;

        case 'connection:error':
          console.log('Device connection failed:', data.error);
          this.emit('connection:error', data);
          break;

        case 'device:disconnected':
          console.log('Device disconnected:', data.device);
          this.emit('device:disconnected', data.device);
          break;

        case 'mobile:info:update':
          console.log('Mobile info updated:', data);
          this.emit('mobile:info:update', data);
          // Also dispatch custom event for device store
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mobile:info:update', { detail: data }));
          }
          break;

        case 'device:info:response':
        case 'file:list:response':
        case 'image:list:response':
        case 'album:list:response':
        case 'contact:list:response':
        case 'app:list:response':
        case 'video:list:response':
          if (data.id && this.messageHandlers.has(data.id)) {
            const handler = this.messageHandlers.get(data.id)!;
            clearTimeout(handler.timeout);
            handler.resolve(data.data);
            this.messageHandlers.delete(data.id);
          }
          break;

        case 'error':
          if (data.id && this.messageHandlers.has(data.id)) {
            const handler = this.messageHandlers.get(data.id)!;
            clearTimeout(handler.timeout);
            handler.reject(new Error(data.error || 'Unknown error'));
            this.messageHandlers.delete(data.id);
          }
          break;

        default:
          console.log('Unknown message type:', data.type);
          // Check if it's a response to a pending request
          if (data.id && this.messageHandlers.has(data.id)) {
            const handler = this.messageHandlers.get(data.id)!;
            clearTimeout(handler.timeout);
            handler.resolve(data);
            this.messageHandlers.delete(data.id);
          }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 5000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  disconnect() {
    this.shouldReconnect = false;  // Prevent auto-reconnect on manual disconnect
    this.stopHeartbeat();
    this.stopReconnect();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
    this.messageHandlers.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Event emitter methods
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach(callback => callback(...args));
  }

  // Send raw message (for connect:device and other special messages)
  send(_type: string, data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to server');
    }
    this.ws.send(JSON.stringify(data));
  }

  // Send message to device
  private sendMessage<T = any>(type: string, payload?: any): Promise<T> {
    // Special handling for connect:device - doesn't need a response handler
    if (type === 'connect:device') {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('Not connected to server'));
      }

      const message = {
        type,
        payload
      };

      this.ws.send(JSON.stringify(message));
      // Return a resolved promise since we handle connection response via events
      return Promise.resolve({} as T);
    }

    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to device'));
        return;
      }

      const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      const timeout = setTimeout(() => {
        this.messageHandlers.delete(id);
        reject(new Error(`Request timeout: ${type}`));
      }, 30000);

      this.messageHandlers.set(id, {
        resolve,
        reject,
        timeout
      });

      const message = {
        id,
        type,
        payload
      };

      this.ws.send(JSON.stringify(message));
    });
  }

  // Register device
  async registerDevice(device: Device): Promise<void> {
    await this.sendMessage('register', device);
  }

  // Device info
  async getDeviceInfo(): Promise<DeviceInfo> {
    return this.sendMessage('device:info');
  }

  // File operations
  async getFileList(path: string = '/'): Promise<FileItem[]> {
    return this.sendMessage('file:list', { path });
  }

  async downloadFile(path: string): Promise<any> {
    return this.sendMessage('file:download', { path });
  }

  async uploadFile(file: File, targetPath: string): Promise<void> {
    // For file upload, we'll need to handle it differently
    // This might require using HTTP endpoint instead
    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetPath', targetPath);

    return this.sendMessage('file:upload', {
      name: file.name,
      size: file.size,
      targetPath
    });
  }

  async deleteFile(path: string): Promise<void> {
    return this.sendMessage('file:delete', { path });
  }

  // Image operations
  async getImages(albumId?: string): Promise<ImageItem[]> {
    return this.sendMessage('image:list', { albumId });
  }

  async getAlbums(): Promise<Album[]> {
    return this.sendMessage('album:list');
  }

  // Video operations
  async getVideos(): Promise<VideoItem[]> {
    return this.sendMessage('video:list');
  }

  // Contact operations
  async getContacts(): Promise<Contact[]> {
    return this.sendMessage('contact:list');
  }

  async updateContact(contact: Contact): Promise<void> {
    return this.sendMessage('contact:update', contact);
  }

  async deleteContact(contactId: string): Promise<void> {
    return this.sendMessage('contact:delete', { id: contactId });
  }

  // App operations
  async getInstalledApps(): Promise<AppInfo[]> {
    return this.sendMessage('app:list');
  }

  async uninstallApp(packageName: string): Promise<void> {
    return this.sendMessage('app:uninstall', { packageName });
  }

  async backupApp(packageName: string): Promise<void> {
    return this.sendMessage('app:backup', { packageName });
  }

  // Generic send command (for flexibility)
  async sendCommand<T = any>(command: string, data?: any): Promise<T> {
    return this.sendMessage(command, data);
  }
}

// Export singleton instance
export const wsService = new WebSocketNativeService();
export default wsService;