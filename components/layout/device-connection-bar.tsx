"use client";

import { useEffect, useState } from "react";
import { useDeviceStore } from "@/store/device.store";
import { discoveryService } from "@/services/discovery.service";
import { wsService } from "@/services/websocket-native.service";
import { devicePersistence } from "@/services/device-persistence.service";
import {
  Wifi,
  WifiOff,
  Search,
  ChevronDown,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { getWebSocketUrl } from "@/lib/ws-url";

export function DeviceConnectionBar() {
  const {
    devices,
    selectedDevice,
    isScanning,
    addDevice,
    selectDevice,
    updateDevice,
    setScanning,
    setInitializing,
  } = useDeviceStore();

  const [showDeviceList, setShowDeviceList] = useState(false);

  useEffect(() => {
    // Check if backend already has a connection
    checkExistingConnection();
    startDiscovery();

    return () => {
      discoveryService.stopDiscovery();
    };
  }, []); // Empty dependency array - only run once on mount

  useEffect(() => {
    // Listen for mobile info updates
    const handleMobileInfoUpdate = (event: CustomEvent) => {
      const { deviceId, data } = event.detail;
      if (selectedDevice && selectedDevice.id === deviceId) {
        // Update device info with mobile info (merge with existing)
        const updatedDeviceInfo = selectedDevice.deviceInfo ? {
          ...selectedDevice.deviceInfo,
          battery: data.battery,
          storage: data.storage,
        } : {
          model: selectedDevice.name,
          manufacturer: 'Android',
          androidVersion: '',
          battery: data.battery,
          storage: data.storage,
        };

        updateDevice(deviceId, {
          deviceInfo: updatedDeviceInfo
        });
      }
    };

    window.addEventListener('mobile:info:update', handleMobileInfoUpdate as EventListener);

    return () => {
      window.removeEventListener('mobile:info:update', handleMobileInfoUpdate as EventListener);
    };
  }, [selectedDevice?.id, updateDevice]); // Only re-run when device ID changes

  const checkExistingConnection = async () => {
    setInitializing(true);
    try {
      // First, try to restore from localStorage
      const savedDevice = devicePersistence.getConnectedDevice();

      // Query backend for current connection status
      const wsUrl = await getWebSocketUrl();
      const response = await fetch(`${wsUrl}/api/connection/status`);
      const data = await response.json();

      // Check if we have an active connection on backend
      if (data.hasConnection && data.devices.length > 0) {
        const backendDevice = data.devices[0];

        // If we have a saved device, check if it matches the backend connection
        if (savedDevice && savedDevice.ip === backendDevice.device.ip) {
          console.log('Restored device from localStorage matches backend connection');
        } else if (savedDevice) {
          console.log('Saved device does not match backend, using backend device instead');
        }

        // Update store with connected device from backend
        const deviceWithInfo = {
          ...backendDevice.device,
          deviceInfo: backendDevice.device.deviceInfo || backendDevice.device.deviceInfo,
        };
        addDevice(deviceWithInfo);
        updateDevice(deviceWithInfo.id, {
          status: "connected",
          deviceInfo: deviceWithInfo.deviceInfo
        });
        selectDevice(deviceWithInfo);

        // Save to localStorage
        devicePersistence.saveConnectedDevice(deviceWithInfo);

        // Connect WebSocket if not connected
        if (!wsService.isConnected()) {
          await wsService.connect('localhost');
        }

        console.log('Restored connection to device:', deviceWithInfo.name);
      } else {
        // No backend connection, clear localStorage if we had a saved device
        if (savedDevice) {
          console.log('Saved device is no longer connected, clearing localStorage');
          devicePersistence.clearConnectedDevice();
        }
      }
    } catch (error) {
      console.error('Failed to check connection status:', error);
      // On error, clear localStorage to be safe
      devicePersistence.clearConnectedDevice();
    } finally {
      setInitializing(false);
    }
  };

  const startDiscovery = async () => {
    setScanning(true);
    await discoveryService.startDiscovery((device) => {
      addDevice(device);
    });
    setTimeout(() => setScanning(false), 10000);
  };

  const connectToDevice = async (device: any) => {
    try {
      updateDevice(device.id, { status: "connecting" });
      setShowDeviceList(false);

      // First, check if backend already has this device connected
      const wsUrl = await getWebSocketUrl();
      const checkResponse = await fetch(`${wsUrl}/api/connection/status`);
      const statusData = await checkResponse.json();

      const isAlreadyConnected = statusData.devices.some((d: any) =>
        d.device.ip === device.ip && d.connected
      );

      if (isAlreadyConnected) {
        // Already connected on backend, just update frontend state
        console.log('Device already connected on backend');
        updateDevice(device.id, { status: "connected" });
        selectDevice(device);

        // Save to localStorage
        devicePersistence.saveConnectedDevice(device);

        // Connect WebSocket if needed
        if (!wsService.isConnected()) {
          await wsService.connect('localhost', 8080);
        }

        toast.success(`Connected to ${device.name}`);
        return;
      }

      // Not connected, establish new connection
      if (!wsService.isConnected()) {
        console.log('Connecting to WebSocket server...');
        await wsService.connect('localhost');
      }

      // Create promise to wait for response
      const connectionPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          wsService.off('connection:success', onSuccess);
          wsService.off('connection:error', onError);
          reject(new Error('Connection timeout'));
        }, 15000);

        const onSuccess = (data: any) => {
          clearTimeout(timeout);
          wsService.off('connection:error', onError);
          resolve(data);
        };

        const onError = (data: any) => {
          clearTimeout(timeout);
          wsService.off('connection:success', onSuccess);
          reject(new Error(data.error || 'Connection failed'));
        };

        wsService.on('connection:success', onSuccess);
        wsService.on('connection:error', onError);
      });

      // Send connection request
      console.log('Sending connection request for device:', device);
      // Send the connect:device message - just send the device data directly
      wsService.send('connect:device', {
        type: 'connect:device',
        device: device
      });

      // Wait for response
      await connectionPromise;

      updateDevice(device.id, { status: "connected" });
      selectDevice(device);

      // Save connected device to localStorage
      devicePersistence.saveConnectedDevice(device);

      toast.success(`Connected to ${device.name}`);
    } catch (error: any) {
      console.error("Connection error:", error);
      updateDevice(device.id, { status: "disconnected" });
      toast.error(error.message || `Failed to connect to ${device.name}`);
    }
  };

  const disconnectDevice = () => {
    if (selectedDevice) {
      wsService.disconnect();
      updateDevice(selectedDevice.id, { status: "disconnected" });
      selectDevice(null);

      // Clear localStorage
      devicePersistence.clearConnectedDevice();

      toast.success("Disconnected");
    }
  };

  return (
    <div className="relative h-14 border-b bg-background px-4">
      <div className="flex h-full items-center justify-between">
        {/* Connection Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {selectedDevice ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {selectedDevice
                ? `Connected to ${selectedDevice.name}`
                : "No device connected"}
            </span>
          </div>

          {selectedDevice && (
            <button
              onClick={disconnectDevice}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Device Selector */}
        <div className="flex items-center gap-2">
          {isScanning && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Scanning...
            </div>
          )}

          <button
            onClick={() => setShowDeviceList(!showDeviceList)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
              "hover:bg-accent transition-colors"
            )}
          >
            <Smartphone className="h-4 w-4" />
            <span>{devices.length} devices</span>
            <ChevronDown className="h-4 w-4" />
          </button>

          <button
            onClick={startDiscovery}
            disabled={isScanning}
            className={cn(
              "rounded-lg border p-1.5",
              "hover:bg-accent transition-colors",
              isScanning && "opacity-50 cursor-not-allowed"
            )}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Device List Dropdown */}
      {showDeviceList && (
        <div className="absolute right-4 top-full z-50 mt-1 w-80 rounded-lg border bg-background shadow-lg">
          <div className="p-2">
            {devices.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No devices found. Make sure your phone and computer are on the
                same network.
              </div>
            ) : (
              <div className="space-y-1">
                {devices.map((device) => (
                  <button
                    key={device.id}
                    onClick={() => connectToDevice(device)}
                    disabled={device.status === "connecting"}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm",
                      "hover:bg-accent transition-colors",
                      device.id === selectedDevice?.id && "bg-primary/10",
                      device.status === "connecting" && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-4 w-4" />
                      <div className="text-left">
                        <div className="font-medium">{device.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {device.ip}
                        </div>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        device.status === "connected" && "bg-green-500",
                        device.status === "connecting" && "bg-yellow-500 animate-pulse",
                        device.status === "disconnected" && "bg-gray-400"
                      )}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}