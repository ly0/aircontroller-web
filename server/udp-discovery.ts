import dgram from 'dgram';
import os from 'os';
import {
  PORTS,
  isValidDiscoveryPacket,
  parseDiscoveryPacket,
  buildDiscoveryResponse,
  ParsedDevice
} from './constants';

export interface DiscoveryOptions {
  deviceName?: string;
  onDeviceDiscovered?: (device: ParsedDevice) => void;
  onError?: (error: Error) => void;
}

export class UDPDiscoveryServer {
  private udpSocket: dgram.Socket | null = null;
  private deviceName: string;
  private onDeviceDiscovered?: (device: ParsedDevice) => void;
  private onError?: (error: Error) => void;
  private discoveredDevices: Map<string, ParsedDevice> = new Map();

  constructor(options: DiscoveryOptions = {}) {
    this.deviceName = options.deviceName || os.hostname();
    this.onDeviceDiscovered = options.onDeviceDiscovered;
    this.onError = options.onError;
  }

  /**
   * Start listening for UDP broadcast packets
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create UDP socket
        this.udpSocket = dgram.createSocket('udp4');

        // Handle errors
        this.udpSocket.on('error', (err) => {
          console.error('UDP socket error:', err);
          this.onError?.(err);
          this.udpSocket?.close();
          reject(err);
        });

        // Handle incoming messages
        this.udpSocket.on('message', (msg, rinfo) => {
          this.handleDiscoveryPacket(msg, rinfo);
        });

        // Bind to discovery port
        this.udpSocket.bind(PORTS.SEARCH, '0.0.0.0', () => {
          console.log(`UDP discovery server listening on port ${PORTS.SEARCH}`);

          // Enable broadcast receiving
          this.udpSocket?.setBroadcast(true);

          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming discovery packet from mobile device
   */
  private handleDiscoveryPacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const data = msg.toString();
      console.log(`Received UDP packet from ${rinfo.address}:${rinfo.port}: ${data}`);

      // Validate and parse the packet
      if (!isValidDiscoveryPacket(data)) {
        console.log('Invalid discovery packet received');
        return;
      }

      const device = parseDiscoveryPacket(data);
      if (!device) {
        console.log('Failed to parse discovery packet');
        return;
      }

      // Update device IP if not provided in packet
      if (!device.ip || device.ip === '0.0.0.0') {
        device.ip = rinfo.address;
      }

      // Store discovered device
      const deviceKey = `${device.ip}_${device.name}`;
      if (!this.discoveredDevices.has(deviceKey)) {
        this.discoveredDevices.set(deviceKey, device);
        console.log(`New device discovered: ${device.name} (${device.ip})`);

        // Notify listener
        this.onDeviceDiscovered?.(device);
      }

      // Send response back to mobile device
      this.sendDiscoveryResponse(rinfo.address);
    } catch (error) {
      console.error('Error handling discovery packet:', error);
      this.onError?.(error as Error);
    }
  }

  /**
   * Send discovery response to mobile device
   */
  private sendDiscoveryResponse(targetAddress: string): void {
    try {
      const localIp = this.getLocalIPAddress();
      // Use Web platform code (6) instead of OS platform code
      const platformCode = 6; // Web platform
      const response = `search_msg_received#RBIDoKFHLX9frYTh#${platformCode}#${this.deviceName}#${localIp}`;
      const responseBuffer = Buffer.from(response);

      this.udpSocket?.send(
        responseBuffer,
        0,
        responseBuffer.length,
        PORTS.SEARCH,
        targetAddress,
        (err) => {
          if (err) {
            console.error('Error sending discovery response:', err);
            this.onError?.(err);
          } else {
            console.log(`Sent discovery response to ${targetAddress}: ${response}`);
          }
        }
      );
    } catch (error) {
      console.error('Error in sendDiscoveryResponse:', error);
      this.onError?.(error as Error);
    }
  }

  /**
   * Get the local IP address of the machine
   */
  private getLocalIPAddress(): string {
    const networkInterfaces = os.networkInterfaces();

    for (const interfaceName of Object.keys(networkInterfaces)) {
      const interfaces = networkInterfaces[interfaceName];
      if (!interfaces) continue;

      for (const iface of interfaces) {
        // Skip internal (127.0.0.1) and non-IPv4 addresses
        if (iface.internal || iface.family !== 'IPv4') continue;

        // Return the first valid external IPv4 address
        return iface.address;
      }
    }

    return '127.0.0.1';
  }

  /**
   * Broadcast our own discovery packet (for testing or active discovery)
   */
  async broadcastDiscovery(): Promise<void> {
    if (!this.udpSocket) {
      throw new Error('UDP socket not initialized');
    }

    const localIp = this.getLocalIPAddress();
    const response = buildDiscoveryResponse(this.deviceName, localIp);
    const buffer = Buffer.from(response);

    // Get broadcast address
    const broadcastAddress = this.getBroadcastAddress();

    return new Promise((resolve, reject) => {
      this.udpSocket?.send(
        buffer,
        0,
        buffer.length,
        PORTS.SEARCH,
        broadcastAddress,
        (err) => {
          if (err) {
            console.error('Error broadcasting discovery:', err);
            reject(err);
          } else {
            console.log(`Broadcast discovery packet to ${broadcastAddress}`);
            resolve();
          }
        }
      );
    });
  }

  /**
   * Get the broadcast address for the current network
   */
  private getBroadcastAddress(): string {
    const networkInterfaces = os.networkInterfaces();

    for (const interfaceName of Object.keys(networkInterfaces)) {
      const interfaces = networkInterfaces[interfaceName];
      if (!interfaces) continue;

      for (const iface of interfaces) {
        if (iface.internal || iface.family !== 'IPv4') continue;

        // Calculate broadcast address
        const ip = iface.address.split('.');
        const netmask = iface.netmask.split('.');

        const broadcast = ip.map((octet, index) => {
          const ipOctet = parseInt(octet, 10);
          const netmaskOctet = parseInt(netmask[index], 10);
          return (ipOctet | (~netmaskOctet & 0xff)).toString();
        }).join('.');

        return broadcast;
      }
    }

    return '255.255.255.255';
  }

  /**
   * Get list of discovered devices
   */
  getDiscoveredDevices(): ParsedDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  /**
   * Clear discovered devices
   */
  clearDiscoveredDevices(): void {
    this.discoveredDevices.clear();
  }

  /**
   * Stop the discovery server
   */
  stop(): void {
    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = null;
      console.log('UDP discovery server stopped');
    }
  }
}