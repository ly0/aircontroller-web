import { Device } from '@/types';
import { getWebSocketUrl, getWebSocketPort } from '@/lib/ws-url';

class DeviceDiscoveryService {
  private ws: WebSocket | null = null;
  private discoveryCallbacks: Set<(device: Device) => void> = new Set();
  private discoveredDevices: Map<string, Device> = new Map();
  private isDiscovering = false;

  async startDiscovery(onDeviceFound?: (device: Device) => void) {
    if (onDeviceFound) {
      this.discoveryCallbacks.add(onDeviceFound);
    }

    if (this.isDiscovering) {
      // Already discovering, just add the callback
      // Send already discovered devices to new callback
      if (onDeviceFound) {
        this.discoveredDevices.forEach(device => onDeviceFound(device));
      }
      return;
    }

    this.isDiscovering = true;
    console.log('Starting device discovery...');

    try {
      // First, fetch already discovered devices from the server
      await this.fetchDiscoveredDevices();

      // Then, connect to WebSocket for real-time updates
      await this.connectWebSocket();
    } catch (error) {
      console.error('Failed to start discovery:', error);
      this.isDiscovering = false;
      // Don't throw or reject - just continue without WebSocket updates
    }
  }

  private async fetchDiscoveredDevices() {
    try {
      const serverUrl = await getWebSocketUrl();
      const response = await fetch(`${serverUrl}/api/discover`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const devices = await response.json();
      console.log('Fetched discovered devices:', devices);

      devices.forEach((deviceData: any) => {
        const device: Device = {
          id: deviceData.id,
          name: deviceData.name,
          ip: deviceData.ip,
          port: deviceData.port,
          type: deviceData.type,
          status: deviceData.status || 'discovered',
          lastSeen: new Date(),
          deviceInfo: deviceData.deviceInfo,
        };

        // Store and notify
        this.discoveredDevices.set(device.ip, device);
        this.discoveryCallbacks.forEach(callback => callback(device));
      });
    } catch (error) {
      console.error('Error fetching discovered devices:', error);
    }
  }

  private async connectWebSocket() {
    const port = await getWebSocketPort();
    return new Promise<void>((resolve, reject) => {
      try {
        // Connect to the WebSocket server
        this.ws = new WebSocket(`ws://localhost:${port}`);

        this.ws.onopen = () => {
          console.log('Connected to discovery WebSocket');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.type === 'device:discovered') {
              console.log('New device discovered via WebSocket:', message.device);

              const device: Device = {
                id: message.device.id,
                name: message.device.name,
                ip: message.device.ip,
                port: message.device.port,
                type: message.device.type,
                status: message.device.status || 'discovered',
                lastSeen: new Date(),
                deviceInfo: message.device.deviceInfo,
              };

              // Check if we already have this device
              if (!this.discoveredDevices.has(device.ip)) {
                this.discoveredDevices.set(device.ip, device);
                this.discoveryCallbacks.forEach(callback => callback(device));
              } else {
                // Update existing device
                const existingDevice = this.discoveredDevices.get(device.ip)!;
                Object.assign(existingDevice, device);
                existingDevice.lastSeen = new Date();
              }
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          // Don't reject here - WebSocket will trigger onclose
        };

        this.ws.onclose = () => {
          console.log('Discovery WebSocket closed');
          this.isDiscovering = false;

          // Only reject if we haven't connected yet
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            reject(new Error('Failed to connect to WebSocket'));
          } else {
            resolve(); // Connection was successful but closed later
          }

          // Attempt to reconnect after 5 seconds if we should still be discovering
          if (this.discoveryCallbacks.size > 0) {
            setTimeout(() => {
              if (this.discoveryCallbacks.size > 0) {
                this.connectWebSocket().catch(console.error);
              }
            }, 5000);
          }
        };

        // Set a connection timeout
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  stopDiscovery() {
    console.log('Stopping device discovery');
    this.discoveryCallbacks.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isDiscovering = false;
  }

  getDiscoveredDevices(): Device[] {
    return Array.from(this.discoveredDevices.values());
  }

  clearDiscoveredDevices() {
    this.discoveredDevices.clear();
  }

  async connectToDevice(device: Device): Promise<boolean> {
    try {
      // Send connection request to the server
      const serverUrl = await getWebSocketUrl();
      const response = await fetch(`${serverUrl}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: this.getClientId(),
          clientName: 'AirController Web',
          deviceIp: device.ip,
        }),
      });

      if (!response.ok) {
        throw new Error(`Connection failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Device connection result:', result);

      return result.success || false;
    } catch (error) {
      console.error('Connection error:', error);
      return false;
    }
  }

  private getClientId(): string {
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
      clientId = `web_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem('clientId', clientId);
    }
    return clientId;
  }
}

export const discoveryService = new DeviceDiscoveryService();
export default discoveryService;