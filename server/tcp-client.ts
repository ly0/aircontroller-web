import net from 'net';
import { EventEmitter } from 'events';
import { PORTS, PROTOCOL, getPlatformCode } from './constants';
import os from 'os';

export interface DeviceConnection extends EventEmitter {
  connect(deviceIp: string): Promise<void>;
  disconnect(): void;
  sendCommand(cmd: number, data?: any): void;
  isConnected(): boolean;
}

/**
 * TCP Command Client - connects to mobile device's command server on port 20001
 */
export class CommandClient extends EventEmitter implements DeviceConnection {
  private socket: net.Socket | null = null;
  private deviceIp: string = '';
  private isConnectedFlag = false;

  async connect(deviceIp: string): Promise<void> {
    this.deviceIp = deviceIp;

    return new Promise((resolve, reject) => {
      console.log(`Connecting to command server at ${deviceIp}:${PORTS.CMD}`);

      // Clean up any existing socket
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.destroy();
      }

      this.socket = new net.Socket();
      let connectionResolved = false;

      // Set initial connection timeout only
      const connectionTimeout = setTimeout(() => {
        if (!this.isConnectedFlag) {
          this.socket?.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      // Handle connection
      this.socket.connect(PORTS.CMD, deviceIp, () => {
        console.log(`Connected to command server at ${deviceIp}:${PORTS.CMD}`);
        clearTimeout(connectionTimeout);
        this.isConnectedFlag = true;
        connectionResolved = true;
        this.emit('connected');

        // Send desktop info immediately after connection
        this.reportDesktopInfo();

        // Remove socket timeout after successful connection
        this.socket?.setTimeout(0);

        resolve();
      });

      // Handle incoming data
      this.socket.on('data', (data) => {
        try {
          const dataStr = data.toString();
          console.log('Raw command data received:', dataStr);
          console.log('Data length:', dataStr.length);
          console.log('Data bytes:', data);

          const message = JSON.parse(dataStr);
          console.log('Parsed command:', JSON.stringify(message, null, 2));
          this.handleCommand(message);
        } catch (error) {
          console.error('Failed to parse command:', error);
          console.error('Raw data that failed to parse:', data.toString());
        }
      });

      // Handle errors
      this.socket.on('error', (error) => {
        console.error('Command socket error:', error);
        this.isConnectedFlag = false;
        this.emit('error', error);

        // Only reject if connection hasn't been established yet
        if (!connectionResolved) {
          reject(error);
        } else {
          // Connection was established but later failed
          // Emit disconnected event to trigger reconnection
          this.emit('disconnected');
        }
      });

      // Handle close
      this.socket.on('close', () => {
        console.log('Command socket closed');
        this.isConnectedFlag = false;
        this.emit('disconnected');
      });

      // Handle timeout (shouldn't happen after connection)
      this.socket.on('timeout', () => {
        console.log('Command socket timeout (unexpected)');
        // Don't destroy socket here, let heartbeat handle disconnection
      });
    });
  }

  private handleCommand(message: any) {
    const { cmd, data } = message;

    switch (cmd) {
      case PROTOCOL.CMD_UPDATE_MOBILE_INFO:
        console.log('Mobile device info updated:', data);
        // Parse mobile info according to Flutter model structure
        const mobileInfo = {
          battery: data.batteryLevel || 0,
          storage: {
            total: data.storageSize?.totalSize || 0,
            available: data.storageSize?.availableSize || 0,
            used: (data.storageSize?.totalSize || 0) - (data.storageSize?.availableSize || 0),
            free: data.storageSize?.availableSize || 0,
          }
        };
        this.emit('mobile:info', mobileInfo);
        break;

      default:
        console.log('Unknown command:', cmd);
        this.emit('command', message);
    }
  }

  private reportDesktopInfo() {
    const deviceInfo = {
      cmd: PROTOCOL.CMD_REPORT_DESKTOP_INFO,
      data: {
        name: os.hostname() || 'AirController Server',
        platform: 6, // 3 is fixed number and can't be modified.
        ip: this.getLocalIP(),
        version: '1.0.0',
      }
    };

    this.sendCommand(deviceInfo.cmd, deviceInfo.data);
  }

  private getLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if ('IPv4' === iface.family && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  sendCommand(cmd: number, data?: any) {
    if (!this.isConnectedFlag || !this.socket) {
      console.error('Not connected to command server');
      return;
    }

    const message = JSON.stringify({ cmd, data });  // No delimiter - mobile server doesn't expect it
    console.log('Sending command:', message);

    this.socket.write(message);
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnectedFlag = false;
  }

  isConnected(): boolean {
    return this.isConnectedFlag;
  }
}

/**
 * TCP Heartbeat Client - maintains connection with mobile device on port 20002
 */
export class HeartbeatClient extends EventEmitter implements DeviceConnection {
  private socket: net.Socket | null = null;
  private deviceIp: string = '';
  private isConnectedFlag = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;
  private lastHeartbeatValue = -1; // Start at -1 so first heartbeat is 0
  private lastHeartbeatTime = 0;
  private waitingForResponse = false;
  private readonly HEARTBEAT_TIMEOUT = 5000; // 5 seconds timeout

  async connect(deviceIp: string): Promise<void> {
    this.deviceIp = deviceIp;
    this.lastHeartbeatValue = -1; // Reset to -1 so first heartbeat is 0
    this.lastHeartbeatTime = 0;
    this.waitingForResponse = false;

    return new Promise((resolve, reject) => {
      console.log(`Connecting to heartbeat server at ${deviceIp}:${PORTS.HEARTBEAT}`);

      // Clean up any existing socket
      if (this.socket) {
        this.stopHeartbeat();
        this.socket.removeAllListeners();
        this.socket.destroy();
      }

      this.socket = new net.Socket();
      let connectionResolved = false;

      // Set timeout
      this.socket.setTimeout(10000);

      // Handle connection
      this.socket.connect(PORTS.HEARTBEAT, deviceIp, () => {
        console.log(`Connected to heartbeat server at ${deviceIp}:${PORTS.HEARTBEAT}`);
        this.isConnectedFlag = true;
        connectionResolved = true;
        this.emit('connected');

        // Remove socket timeout after successful connection
        this.socket?.setTimeout(0);

        // Send first heartbeat immediately
        this.sendHeartbeat();

        resolve();
      });

      // Handle incoming data
      this.socket.on('data', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('Heartbeat response:', message);

          // Stop timeout timer when response received
          this.stopTimeoutTimer();
          this.waitingForResponse = false;

          // Update heartbeat value from response
          this.lastHeartbeatValue = message.value || 0;

          // Schedule next heartbeat after 2 seconds
          setTimeout(() => {
            if (this.isConnectedFlag) {
              this.sendHeartbeat();
            }
          }, 2000);

          this.emit('heartbeat', message);
        } catch (error) {
          // Heartbeat might be plain text
          console.log('Heartbeat data:', data.toString());
        }
      });

      // Handle errors
      this.socket.on('error', (error) => {
        console.error('Heartbeat socket error:', error);
        this.isConnectedFlag = false;
        this.stopHeartbeat();
        this.emit('error', error);

        // Only reject if connection hasn't been established yet
        if (!connectionResolved) {
          reject(error);
        } else {
          // Connection was established but later failed
          // Emit disconnected event to trigger reconnection
          this.emit('disconnected');
        }
      });

      // Handle close
      this.socket.on('close', () => {
        console.log('Heartbeat socket closed');
        this.isConnectedFlag = false;
        this.stopHeartbeat();
        this.emit('disconnected');
      });

      // Handle timeout
      this.socket.on('timeout', () => {
        console.log('Heartbeat socket timeout (during connection)');
        // Only destroy during initial connection
        if (!this.isConnectedFlag) {
          this.socket?.destroy();
          if (!connectionResolved) {
            reject(new Error('Connection timeout'));
          }
        }
        // After connection is established, ignore timeouts
      });
    });
  }

  private sendHeartbeat() {
    if (!this.isConnectedFlag || !this.socket || this.waitingForResponse) {
      return;
    }

    // Increment heartbeat value
    const heartbeat = {
      ip: this.getLocalIP(),
      value: this.lastHeartbeatValue + 1,
      time: Date.now()
    };

    const message = JSON.stringify(heartbeat);  // No delimiter - mobile server doesn't expect it
    console.log('Sending heartbeat:', message);
    this.socket.write(message);

    this.waitingForResponse = true;
    this.lastHeartbeatTime = Date.now();

    // Start timeout timer
    this.startTimeoutTimer();
  }

  private startTimeoutTimer() {
    this.stopTimeoutTimer();

    this.timeoutTimer = setTimeout(() => {
      console.log('Heartbeat timeout - no response received');
      this.emit('timeout');

      // Disconnect on timeout
      if (this.isConnectedFlag) {
        this.disconnect();
        this.emit('disconnected');
      }
    }, this.HEARTBEAT_TIMEOUT);
  }

  private stopTimeoutTimer() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.stopTimeoutTimer();
  }

  private getLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if ('IPv4' === iface.family && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  sendCommand(cmd: number, data?: any) {
    // Heartbeat client doesn't send commands
    console.warn('Heartbeat client does not support commands');
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnectedFlag = false;
  }

  isConnected(): boolean {
    return this.isConnectedFlag;
  }
}