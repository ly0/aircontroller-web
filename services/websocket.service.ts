import { io, Socket } from 'socket.io-client';
import { Device } from '@/types';

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<string, Set<Function>> = new Map();

  connect(deviceIp: string, port: number = 8080) {
    if (this.socket?.connected) {
      this.disconnect();
    }

    const url = `ws://${deviceIp}:${port}`;

    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    this.setupEventHandlers();

    return new Promise<void>((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not initialized'));

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        reject(error);
      });

      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);
    });
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.emit('disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    });

    // Connection events
    this.socket.on('connection:success', (data) => {
      this.emit('connection:success', data);
    });

    this.socket.on('connection:error', (data) => {
      this.emit('connection:error', data);
    });

    // Device-specific events
    this.socket.on('device:info', (data) => {
      this.emit('device:info', data);
    });

    this.socket.on('file:list', (data) => {
      this.emit('file:list', data);
    });

    this.socket.on('transfer:progress', (data) => {
      this.emit('transfer:progress', data);
    });

    this.socket.on('heartbeat', () => {
      this.socket?.emit('heartbeat:ack');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
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

  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach(callback => callback(...args));
  }

  // Send raw socket message
  send(event: string, data: any) {
    if (!this.socket?.connected) {
      throw new Error('Not connected to server');
    }
    // For Socket.io, the event is sent as the first parameter
    // and the data as the second parameter
    this.socket.emit(event, JSON.stringify(data));
  }

  // Send commands to device
  sendCommand(command: string, data?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to device'));
        return;
      }

      // Generate a unique ID for this request
      const messageId = `${command}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const timeout = setTimeout(() => {
        // Clean up listener
        this.socket?.off(`${command}:response`);
        reject(new Error('Command timeout'));
      }, 30000);

      // Set up one-time listener for the response
      this.socket.once(`${command}:response`, (response: any) => {
        clearTimeout(timeout);

        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.data || response);
        }
      });

      // Send the command with the payload
      this.socket.emit(command, {
        id: messageId,
        ...data
      });
    });
  }

  // File operations
  async getFileList(path: string = '/') {
    return this.sendCommand('file:list', { path });
  }

  async downloadFile(path: string) {
    return this.sendCommand('file:download', { path });
  }

  async uploadFile(file: File, targetPath: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetPath', targetPath);

    return this.sendCommand('file:upload', formData);
  }

  async deleteFile(path: string) {
    return this.sendCommand('file:delete', { path });
  }

  // Image operations
  async getImages(albumId?: string) {
    return this.sendCommand('image:list', { albumId });
  }

  async getAlbums() {
    return this.sendCommand('album:list');
  }

  // Contact operations
  async getContacts() {
    return this.sendCommand('contact:list');
  }

  async updateContact(contact: any) {
    return this.sendCommand('contact:update', contact);
  }

  // App operations
  async getInstalledApps() {
    return this.sendCommand('app:list');
  }

  async uninstallApp(packageName: string) {
    return this.sendCommand('app:uninstall', { packageName });
  }
}

export const wsService = new WebSocketService();
export default wsService;