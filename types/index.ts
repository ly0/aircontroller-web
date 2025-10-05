export interface Device {
  id: string;
  name: string;
  ip: string;
  port: number;
  type: 'android' | 'ios';
  status: 'connected' | 'disconnected' | 'connecting';
  lastSeen: Date;
  deviceInfo?: DeviceInfo;
}

export interface DeviceInfo {
  model: string;
  manufacturer: string;
  androidVersion?: string;
  iosVersion?: string;
  storage: {
    total: number;
    used: number;
    free: number;
  };
  battery: number;
}

export interface FileItem {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number;
  modified: Date;
  mimeType?: string;
  thumbnail?: string;
}

export interface ImageItem extends FileItem {
  width: number;
  height: number;
  thumbnailUrl?: string;
  url?: string;
}

export interface VideoItem extends FileItem {
  duration: number;
  thumbnailUrl?: string;
}

export interface Album {
  id: string;
  name: string;
  count: number;
}

export interface Contact {
  id: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
  avatar?: string;
}

export interface AppInfo {
  id: string;
  name: string;
  packageName: string;
  version: string;
  icon?: string;
  size: number;
  installTime: Date;
}

export interface TransferTask {
  id: string;
  type: 'upload' | 'download';
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'failed';
  speed?: number;
  remainingTime?: number;
}