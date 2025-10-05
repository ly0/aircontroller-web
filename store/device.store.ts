import { create } from 'zustand';
import { Device } from '@/types';

interface DeviceStore {
  devices: Device[];
  selectedDevice: Device | null;
  isScanning: boolean;
  isInitializing: boolean;
  addDevice: (device: Device) => void;
  removeDevice: (deviceId: string) => void;
  updateDevice: (deviceId: string, updates: Partial<Device>) => void;
  selectDevice: (device: Device | null) => void;
  setScanning: (scanning: boolean) => void;
  setInitializing: (initializing: boolean) => void;
  clearDevices: () => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  selectedDevice: null,
  isScanning: false,
  isInitializing: true,

  addDevice: (device) =>
    set((state) => ({
      devices: [...state.devices.filter((d) => d.id !== device.id), device],
    })),

  removeDevice: (deviceId) =>
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== deviceId),
      selectedDevice: state.selectedDevice?.id === deviceId ? null : state.selectedDevice,
    })),

  updateDevice: (deviceId, updates) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, ...updates } : d
      ),
      selectedDevice:
        state.selectedDevice?.id === deviceId
          ? { ...state.selectedDevice, ...updates }
          : state.selectedDevice,
    })),

  selectDevice: (device) => set({ selectedDevice: device }),

  setScanning: (scanning) => set({ isScanning: scanning }),

  setInitializing: (initializing) => set({ isInitializing: initializing }),

  clearDevices: () => set({ devices: [], selectedDevice: null }),
}))