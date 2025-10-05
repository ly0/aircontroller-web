import { Device } from '@/types';

const STORAGE_KEY = 'aircontroller_connected_device';

export class DevicePersistenceService {
  /**
   * Save connected device to localStorage
   */
  saveConnectedDevice(device: Device): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(device));
      console.log('Device saved to localStorage:', device.name);
    } catch (error) {
      console.error('Failed to save device to localStorage:', error);
    }
  }

  /**
   * Get connected device from localStorage
   */
  getConnectedDevice(): Device | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const device = JSON.parse(stored);
        console.log('Device loaded from localStorage:', device.name);
        return device;
      }
    } catch (error) {
      console.error('Failed to load device from localStorage:', error);
    }
    return null;
  }

  /**
   * Clear connected device from localStorage
   */
  clearConnectedDevice(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      console.log('Device cleared from localStorage');
    } catch (error) {
      console.error('Failed to clear device from localStorage:', error);
    }
  }

  /**
   * Check if we have a saved device
   */
  hasConnectedDevice(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }
}

export const devicePersistence = new DevicePersistenceService();
