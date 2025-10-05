/**
 * Network ports used for device communication
 */
export const PORTS = {
  SEARCH: 20000,      // UDP - Device discovery/broadcast
  CMD: 20001,         // TCP - Command exchange
  HEARTBEAT: 20002,   // TCP - Connection keepalive
  HTTP: 9527,         // HTTP - File transfer and API
  WS: 8080,          // WebSocket - Real-time communication (our addition)
} as const;

/**
 * Platform codes for device identification
 */
export const PLATFORM = {
  ANDROID: 1,
  IOS: 2,
  MACOS: 3,
  LINUX: 4,
  WINDOWS: 5,
  WEB: 6,  // Added for web client
} as const;

/**
 * Command prefixes and validation strings
 */
export const PROTOCOL = {
  // Discovery protocol
  CMD_SEARCH_PREFIX: 'search#',
  CMD_SEARCH_RES_PREFIX: 'search_msg_received#',
  RANDOM_STR_SEARCH: 'a2w0nuNyiD6vYogF',
  RANDOM_STR_RES_SEARCH: 'RBIDoKFHLX9frYTh',

  // Command types
  CMD_UPDATE_MOBILE_INFO: 1,
  CMD_REPORT_DESKTOP_INFO: 2,

  // Heartbeat
  HEARTBEAT_INTERVAL: 2000,  // 2 seconds
  HEARTBEAT_TIMEOUT: 5000,   // 5 seconds
} as const;

/**
 * Get platform code based on current OS
 */
export function getPlatformCode(): number {
  const platform = process.platform;
  switch (platform) {
    case 'darwin':
      return PLATFORM.MACOS;
    case 'linux':
      return PLATFORM.LINUX;
    case 'win32':
      return PLATFORM.WINDOWS;
    default:
      return PLATFORM.WEB;
  }
}

/**
 * Validate incoming discovery packet
 */
export function isValidDiscoveryPacket(data: string): boolean {
  return data.startsWith(
    `${PROTOCOL.CMD_SEARCH_PREFIX}${PROTOCOL.RANDOM_STR_SEARCH}#`
  );
}

/**
 * Parse discovery packet from mobile device
 */
export interface ParsedDevice {
  platform: number;
  name: string;
  ip: string;
}

export function parseDiscoveryPacket(data: string): ParsedDevice | null {
  if (!isValidDiscoveryPacket(data)) {
    return null;
  }

  const prefix = `${PROTOCOL.CMD_SEARCH_PREFIX}${PROTOCOL.RANDOM_STR_SEARCH}#`;
  const deviceStr = data.substring(prefix.length);
  const parts = deviceStr.split('#');

  if (parts.length < 3) {
    return null;
  }

  return {
    platform: parseInt(parts[0], 10),
    name: parts[1],
    ip: parts[2],
  };
}

/**
 * Build discovery response packet
 */
export function buildDiscoveryResponse(
  deviceName: string,
  localIp: string
): string {
  const platformCode = getPlatformCode();
  return `${PROTOCOL.CMD_SEARCH_RES_PREFIX}${PROTOCOL.RANDOM_STR_RES_SEARCH}#${platformCode}#${deviceName}#${localIp}`;
}