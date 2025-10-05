import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import cors from 'cors';
import { Device } from '../types';
import { UDPDiscoveryServer } from './udp-discovery';
import { DeviceConnectionManager } from './device-connection-manager';
import { PORTS } from './constants';
import os from 'os';
import fs from 'fs';
import path from 'path';

const app = express();
// Use port 0 to let the system assign an available port, or use env/default
const PORT = process.env.WS_PORT || 0;

// Store actual assigned port
let actualPort: number = 0;

// Middleware - Configure CORS to allow all origins during development
app.use(cors({
  origin: '*', // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store connected devices
const connectedDevices = new Map<string, {
  device: Device;
  ws: WebSocket;
  lastPing: number;
}>();

// Initialize Device Connection Manager
const deviceConnectionManager = new DeviceConnectionManager();

// Initialize UDP Discovery Server
const udpDiscovery = new UDPDiscoveryServer({
  deviceName: os.hostname() || 'AirController Server',
  onDeviceDiscovered: (device) => {
    console.log('Device discovered via UDP:', device);

    // Convert to our Device type format
    const discoveredDevice: Device = {
      id: `device_${device.ip.replace(/\./g, '_')}`,
      name: device.name,
      ip: device.ip,
      port: PORTS.HTTP,
      type: device.platform === 1 ? 'android' : 'ios',
      status: 'discovered',
      // Set initial deviceInfo with placeholder values, will be updated by CMD_UPDATE_MOBILE_INFO
      deviceInfo: {
        model: device.name,
        manufacturer: device.platform === 1 ? 'Android' : 'iOS',
        androidVersion: '',
        storage: {
          total: 0,
          used: 0,
          free: 0,
        },
        battery: 0,
      },
    };

    // Broadcast to all connected WebSocket clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'device:discovered',
          device: discoveredDevice,
        }));
      }
    });
  },
  onError: (error) => {
    console.error('UDP Discovery error:', error);
  },
});

// Device discovery endpoint
app.get('/api/discover', (req, res) => {
  // Get devices from UDP discovery
  const udpDevices = udpDiscovery.getDiscoveredDevices().map((device) => ({
    id: `device_${device.ip.replace(/\./g, '_')}`,
    name: device.name,
    ip: device.ip,
    port: PORTS.HTTP,
    type: device.platform === 1 ? 'android' : 'ios',
    status: 'discovered',
    // Set initial deviceInfo with placeholder values, will be updated by CMD_UPDATE_MOBILE_INFO
    deviceInfo: {
      model: device.name,
      manufacturer: device.platform === 1 ? 'Android' : 'iOS',
      androidVersion: '',
      storage: {
        total: 0,
        used: 0,
        free: 0,
      },
      battery: 0,
    },
  }));

  // Combine with connected devices
  const connectedDevicesList = Array.from(connectedDevices.values()).map(({ device }) => ({
    ...device,
    status: 'connected',
  }));

  // Merge and deduplicate by IP
  const allDevices = new Map();
  [...udpDevices, ...connectedDevicesList].forEach((device) => {
    allDevices.set(device.ip, device);
  });

  res.json(Array.from(allDevices.values()));
});

// Device info endpoint (for device discovery)
app.get('/device/info', (req, res) => {
  res.json({
    id: 'server_001',
    name: 'AirController Server',
    port: actualPort,
    type: 'server',
  });
});

// WebSocket port endpoint (for frontend to discover the port)
app.get('/api/ws-port', (req, res) => {
  res.json({
    port: actualPort,
    wsUrl: `ws://localhost:${actualPort}`,
  });
});

// Check connection status endpoint
app.get('/api/connection/status', (req, res) => {
  const connections = deviceConnectionManager.getConnections();
  const connectedDevices = connections.map(conn => ({
    device: {
      ...conn.device,
      // Include the latest device info
      deviceInfo: conn.device.deviceInfo,
    },
    connected: conn.connected,
    lastActivity: conn.lastActivity,
  }));

  res.json({
    hasConnection: connections.length > 0 && connections.some(c => c.connected),
    devices: connectedDevices,
  });
});

// Connect endpoint
app.post('/connect', (req, res) => {
  const { clientId, clientName, deviceIp } = req.body;
  console.log(`Connection request from ${clientName} (${clientId}) for device ${deviceIp}`);

  // Check if already connected to this device
  if (deviceConnectionManager.isDeviceConnected(deviceIp)) {
    res.json({
      success: true,
      message: 'Already connected to device',
      alreadyConnected: true
    });
  } else {
    res.json({
      success: true,
      message: 'Connection will be established',
      alreadyConnected: false
    });
  }
});

// Image API endpoints
app.get('/api/images', async (req, res) => {
  try {
    const { albumId, page, pageSize } = req.query;

    // Check if we have active device connections
    if (deviceConnectionManager.hasActiveConnections()) {
      // Get the first active connection
      const connections = deviceConnectionManager.getConnections();
      const activeConnection = connections.find(conn => conn.connected);

      if (activeConnection) {
        try {
          // Use the correct endpoint based on whether we have an albumId
          const endpoint = albumId
            ? `http://${activeConnection.device.ip}:${PORTS.HTTP}/image/imagesOfAlbum`
            : `http://${activeConnection.device.ip}:${PORTS.HTTP}/image/all`;

          // Build request body
          const body: any = albumId ? { id: String(albumId) } : {};

          // Add pagination parameters if provided
          if (page !== undefined && pageSize !== undefined) {
            body.page = Number(page);
            body.pageSize = Number(pageSize);
          }

          console.log('Fetching images from device:', { endpoint, body });

          // Make HTTP request to device to get images
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Private-Network': 'true'
            },
            body: JSON.stringify(body),
          });

          if (response.ok) {
            const data = await response.json();
            console.log('Device response:', {
              success: data.success,
              code: data.code,
              dataLength: data.data?.length
            });

            const images = data.data || [];

            // Transform images to match our frontend interface
            // The device returns: id, mimeType, path, width, height, modifyTime, createTime, size
            const imagesWithThumbnails = images.map((image: any) => {
              // Extract filename from path
              const pathParts = image.path.split('/');
              const name = pathParts[pathParts.length - 1];

              return {
                id: String(image.id),
                name: name,
                path: image.path,
                type: 'file' as const,
                size: image.size || 0,
                modified: new Date(image.modifyTime || Date.now()),
                mimeType: image.mimeType || 'image/jpeg',
                width: image.width || 0,
                height: image.height || 0,
                // Use the correct thumbnail URL format with image ID
                thumbnailUrl: `http://${activeConnection.device.ip}:${PORTS.HTTP}/stream/image/thumbnail/${image.id}/400/400`,
                // Full-size image URL using path parameter (matching desktop implementation)
                url: `http://${activeConnection.device.ip}:${PORTS.HTTP}/stream/file?path=${encodeURIComponent(image.path)}`
              };
            });

            console.log(`Returning ${imagesWithThumbnails.length} images`);
            res.json(imagesWithThumbnails);
            return;
          } else {
            console.error('Device responded with error:', response.status, response.statusText);
          }
        } catch (error) {
          console.error('Failed to fetch images from device:', error);
        }
      }
    }

    // Return empty array if no device connected - don't use mock data
    console.log('No active device connection, returning empty array');
    res.json([]);
  } catch (error) {
    console.error('Error in /api/images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

app.get('/api/albums', async (req, res) => {
  try {
    // Check if we have active device connections
    if (deviceConnectionManager.hasActiveConnections()) {
      // Get the first active connection
      const connections = deviceConnectionManager.getConnections();
      const activeConnection = connections.find(conn => conn.connected);

      if (activeConnection) {
        try {
          console.log('Fetching albums from device:', activeConnection.device.ip);

          // Make HTTP request to device to get albums
          const response = await fetch(`http://${activeConnection.device.ip}:${PORTS.HTTP}/image/albums`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Private-Network': 'true'
            },
            body: JSON.stringify({}),
          });

          if (response.ok) {
            const data = await response.json();
            console.log('Albums response:', {
              success: data.success,
              code: data.code,
              dataLength: data.data?.length
            });

            // Transform albums to match our frontend interface
            // The device returns: id, name, photoNum, coverImageId, path
            const albums = (data.data || []).map((album: any) => ({
              id: String(album.id),
              name: album.name,
              count: album.photoNum || 0,
              coverImageId: album.coverImageId,
              path: album.path
            }));

            console.log(`Returning ${albums.length} albums`);
            res.json(albums);
            return;
          } else {
            console.error('Device responded with error:', response.status, response.statusText);
          }
        } catch (error) {
          console.error('Failed to fetch albums from device:', error);
        }
      }
    }

    // Return empty array if no device connected - don't use mock data
    console.log('No active device connection, returning empty albums array');
    res.json([]);
  } catch (error) {
    console.error('Error in /api/albums:', error);
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

// Video API endpoints
app.get('/api/videos', async (req, res) => {
  try {
    const { page, pageSize } = req.query;

    // Check if we have active device connections
    if (deviceConnectionManager.hasActiveConnections()) {
      // Get the first active connection
      const connections = deviceConnectionManager.getConnections();
      const activeConnection = connections.find(conn => conn.connected);

      if (activeConnection) {
        try {
          const endpoint = `http://${activeConnection.device.ip}:${PORTS.HTTP}/video/videos`;

          // Build request body with pagination parameters if provided
          const body: any = {};
          if (page !== undefined && pageSize !== undefined) {
            body.page = Number(page);
            body.pageSize = Number(pageSize);
          }

          console.log('Fetching videos from device:', { endpoint, body });

          // Make HTTP request to device to get videos
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Private-Network': 'true'
            },
            body: JSON.stringify(body),
          });

          if (response.ok) {
            const data = await response.json();
            console.log('Device response:', {
              success: data.success,
              code: data.code,
              dataLength: data.data?.length
            });

            const videos = data.data || [];

            // Transform videos to match our frontend interface
            const videosWithThumbnails = videos.map((video: any) => {
              // Extract filename from path
              const pathParts = video.path.split('/');
              const name = pathParts[pathParts.length - 1];

              return {
                id: String(video.id),
                name: name,
                path: video.path,
                type: 'file' as const,
                size: video.size || 0,
                modified: new Date(video.modifyTime || Date.now()),
                mimeType: video.mimeType || 'video/mp4',
                width: video.width || 0,
                height: video.height || 0,
                duration: video.duration || 0,
                // Use the correct thumbnail URL format with video ID
                thumbnailUrl: `http://${activeConnection.device.ip}:${PORTS.HTTP}/stream/video/thumbnail/${video.id}/400/400`
              };
            });

            console.log(`Returning ${videosWithThumbnails.length} videos`);
            res.json(videosWithThumbnails);
            return;
          } else {
            console.error('Device responded with error:', response.status, response.statusText);
          }
        } catch (error) {
          console.error('Failed to fetch videos from device:', error);
        }
      }
    }

    // Return empty array if no device connected
    console.log('No active device connection, returning empty array');
    res.json([]);
  } catch (error) {
    console.error('Error in /api/videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress || 'unknown';
  console.log(`New WebSocket connection from ${clientIp}`);

  let deviceId: string | null = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      let { type, payload, id } = message;

      // Log incoming message for debugging
      console.log('Received message:', { type, hasPayload: !!payload, hasId: !!id });

      // Handle messages from websocket.service.ts which wrap the actual command
      // If the message has a nested type in payload, extract it
      if (message.payload && message.payload.type) {
        type = message.payload.type;
        payload = message.payload.payload;
        id = message.payload.id || message.id;
      }

      switch (type) {
        case 'connect:device':
          // Handle device connection request from web client
          const deviceToConnect = message.device || payload;
          console.log('>>> CONNECT:DEVICE case matched, device:', deviceToConnect);
          try {
            // Connect to device via TCP and manage the connection
            // This will handle sending connection:success or connection:error
            await deviceConnectionManager.connectToDevice(deviceToConnect, ws);
            console.log('>>> Device connection initiated successfully');
          } catch (error) {
            console.error('>>> Failed to connect to device:', error);
            // Send connection error response
            ws.send(JSON.stringify({
              type: 'connection:error',
              error: error instanceof Error ? error.message : 'Connection failed'
            }));
          }
          break;

        case 'register':
          // Register device (for backward compatibility)
          deviceId = payload.id;
          connectedDevices.set(deviceId, {
            device: payload,
            ws,
            lastPing: Date.now(),
          });
          console.log(`Device registered: ${payload.name} (${deviceId})`);

          // Send acknowledgment
          ws.send(JSON.stringify({
            type: 'register:ack',
            success: true,
          }));
          break;

        case 'heartbeat':
          // Update last ping time
          if (deviceId && connectedDevices.has(deviceId)) {
            const device = connectedDevices.get(deviceId)!;
            device.lastPing = Date.now();

            // Send heartbeat acknowledgment
            ws.send(JSON.stringify({
              type: 'heartbeat:ack',
              timestamp: Date.now(),
            }));
          }
          break;

        case 'device:info':
          // Send device information
          ws.send(JSON.stringify({
            id,
            type: 'device:info:response',
            data: mockDeviceInfo(),
          }));
          break;

        case 'file:list':
          // Forward to device connection manager to get real data from device
          await deviceConnectionManager.handleWebSocketMessage(message, null, ws);
          break;

        case 'image:list':
          // Forward to device connection manager to get real data from device
          await deviceConnectionManager.handleWebSocketMessage(message, null, ws);
          break;

        case 'album:list':
          // Forward to device connection manager to get real data from device
          await deviceConnectionManager.handleWebSocketMessage(message, null, ws);
          break;

        case 'contact:list':
          // Send contact list
          ws.send(JSON.stringify({
            id,
            type: 'contact:list:response',
            data: mockContactList(),
          }));
          break;

        case 'app:list':
          // Send app list
          ws.send(JSON.stringify({
            id,
            type: 'app:list:response',
            data: mockAppList(),
          }));
          break;

        // video:list is now handled by deviceConnectionManager (removed mock)

        default:
          console.log(`>>> DEFAULT case hit for type: ${type}, hasId: ${!!id}`);
          // Forward unknown messages to device connection manager
          // This handles messages like file:list, image:list, etc.
          if (id) {
            // Message expects a response, might be forwarded to device
            deviceConnectionManager.handleWebSocketMessage(message, null, ws).catch(err => {
              console.error('Failed to handle message:', err);
            });
          } else {
            console.log(`Unknown message type: ${type}`);
          }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process message',
      }));
    }
  });

  ws.on('close', () => {
    if (deviceId) {
      connectedDevices.delete(deviceId);
      console.log(`Device disconnected: ${deviceId}`);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Send initial connection success
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to AirController server',
  }));
});

// Heartbeat check interval
setInterval(() => {
  const now = Date.now();
  const timeout = 30000; // 30 seconds

  for (const [deviceId, { lastPing }] of connectedDevices.entries()) {
    if (now - lastPing > timeout) {
      console.log(`Device timeout: ${deviceId}`);
      connectedDevices.delete(deviceId);
    }
  }
}, 10000);

// Mock data functions
function mockDeviceInfo() {
  return {
    model: 'Pixel 7 Pro',
    manufacturer: 'Google',
    androidVersion: '14',
    storage: {
      total: 128 * 1024 * 1024 * 1024,
      used: 45 * 1024 * 1024 * 1024,
      free: 83 * 1024 * 1024 * 1024,
    },
    battery: 85,
  };
}

function mockFileList(path: string) {
  return [
    {
      id: '1',
      name: 'Documents',
      path: `${path}/Documents`,
      type: 'folder',
      size: 0,
      modified: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Pictures',
      path: `${path}/Pictures`,
      type: 'folder',
      size: 0,
      modified: new Date().toISOString(),
    },
    {
      id: '3',
      name: 'sample.pdf',
      path: `${path}/sample.pdf`,
      type: 'file',
      size: 1024 * 1024 * 2,
      modified: new Date().toISOString(),
      mimeType: 'application/pdf',
    },
  ];
}

function mockImageList(albumId?: string) {
  // Different image sets for different albums
  const albumConfigs: Record<string, { prefix: string; folder: string; count: number; startId: number }> = {
    camera: { prefix: 'IMG', folder: 'Camera', count: 20, startId: 0 },
    screenshots: { prefix: 'Screenshot', folder: 'Screenshots', count: 15, startId: 100 },
    downloads: { prefix: 'Download', folder: 'Download', count: 10, startId: 200 },
    whatsapp: { prefix: 'WhatsApp Image', folder: 'WhatsApp/Media/WhatsApp Images', count: 25, startId: 300 },
  };

  // Default to camera if no album specified or unknown album
  const config = albumId && albumConfigs[albumId] ? albumConfigs[albumId] : albumConfigs.camera;

  // If "all images" (no albumId), combine some images from each album
  if (!albumId) {
    const allImages = [];
    let imgIndex = 0;
    for (const [key, cfg] of Object.entries(albumConfigs)) {
      const albumImages = Array.from({ length: Math.min(5, cfg.count) }, (_, i) => ({
        id: `img_${imgIndex++}`,
        name: `${cfg.prefix}_${cfg.startId + i}.jpg`,
        path: `/storage/emulated/0/DCIM/${cfg.folder}/${cfg.prefix}_${cfg.startId + i}.jpg`,
        type: 'file',
        size: Math.random() * 5 * 1024 * 1024,
        modified: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        width: 1920,
        height: 1080,
        thumbnailUrl: `https://picsum.photos/200/200?random=${cfg.startId + i}`,
        albumId: key,
      }));
      allImages.push(...albumImages);
    }
    return allImages;
  }

  // Return images for specific album
  return Array.from({ length: config.count }, (_, i) => ({
    id: `img_${config.startId + i}`,
    name: `${config.prefix}_${config.startId + i}.jpg`,
    path: `/storage/emulated/0/DCIM/${config.folder}/${config.prefix}_${config.startId + i}.jpg`,
    type: 'file',
    size: Math.random() * 5 * 1024 * 1024,
    modified: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    width: 1920,
    height: 1080,
    thumbnailUrl: `https://picsum.photos/200/200?random=${config.startId + i}`,
    albumId,
  }));
}

function mockAlbumList() {
  return [
    { id: 'camera', name: 'Camera', count: 125 },
    { id: 'screenshots', name: 'Screenshots', count: 43 },
    { id: 'downloads', name: 'Downloads', count: 67 },
    { id: 'whatsapp', name: 'WhatsApp Images', count: 234 },
  ];
}

function mockContactList() {
  const names = ['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Eve Wilson'];
  return names.map((name, i) => ({
    id: `contact_${i}`,
    name,
    phoneNumbers: [`+1234567${8900 + i}`],
    emails: [`${name.toLowerCase().replace(' ', '.')}@example.com`],
  }));
}

function mockAppList() {
  const apps = [
    { name: 'WhatsApp', packageName: 'com.whatsapp', size: 65 },
    { name: 'Instagram', packageName: 'com.instagram.android', size: 45 },
    { name: 'Chrome', packageName: 'com.android.chrome', size: 120 },
    { name: 'YouTube', packageName: 'com.google.android.youtube', size: 85 },
    { name: 'Gmail', packageName: 'com.google.android.gm', size: 35 },
  ];

  return apps.map((app, i) => ({
    id: `app_${i}`,
    name: app.name,
    packageName: app.packageName,
    version: '1.0.0',
    size: app.size * 1024 * 1024,
    installTime: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    icon: `https://picsum.photos/100/100?random=${i + 100}`,
  }));
}

function mockVideoList() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `video_${i}`,
    name: `VID_${2000 + i}.mp4`,
    path: `/storage/emulated/0/DCIM/Camera/VID_${2000 + i}.mp4`,
    type: 'file',
    size: Math.random() * 100 * 1024 * 1024,
    modified: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
    duration: Math.floor(Math.random() * 300) + 30,
    thumbnailUrl: `https://picsum.photos/320/180?random=${i + 200}`,
  }));
}

// Start server
server.listen(PORT, async () => {
  // Get the actual port assigned by the system
  const address = server.address();
  if (address && typeof address === 'object') {
    actualPort = address.port;
  } else {
    actualPort = PORT as number;
  }

  console.log(`WebSocket server running on port ${actualPort}`);
  console.log(`HTTP endpoints available at http://localhost:${actualPort}`);
  console.log(`WebSocket endpoint: ws://localhost:${actualPort}`);
  console.log(`Port discovery endpoint: http://localhost:${actualPort}/api/ws-port`);

  // Write port to file so Next.js can read it
  const portFilePath = path.join(process.cwd(), '.ws-port');
  fs.writeFileSync(portFilePath, actualPort.toString(), 'utf-8');
  console.log(`Port written to ${portFilePath}`);

  // Start UDP discovery server
  try {
    await udpDiscovery.start();
    console.log(`UDP discovery server started on port ${PORTS.SEARCH}`);

    // Periodically clear old discovered devices (every 30 seconds)
    setInterval(() => {
      const devicesBefore = udpDiscovery.getDiscoveredDevices().length;
      udpDiscovery.clearDiscoveredDevices();
      console.log(`Cleared ${devicesBefore} discovered devices from cache`);
    }, 30000);
  } catch (error) {
    console.error('Failed to start UDP discovery server:', error);
  }
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('Shutting down servers...');
  udpDiscovery.stop();
  server.close();

  // Clean up port file
  const portFilePath = path.join(process.cwd(), '.ws-port');
  try {
    if (fs.existsSync(portFilePath)) {
      fs.unlinkSync(portFilePath);
      console.log('Port file cleaned up');
    }
  } catch (error) {
    console.error('Failed to clean up port file:', error);
  }

  process.exit(0);
});