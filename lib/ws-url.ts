/**
 * Get the WebSocket server URL dynamically
 */
export async function getWebSocketUrl(): Promise<string> {
  try {
    const response = await fetch('/api/ws-port');
    if (response.ok) {
      const data = await response.json();
      return `http://localhost:${data.port}`;
    }
  } catch (error) {
    console.error('Failed to fetch WebSocket port:', error);
  }

  // Fallback to environment variable or default
  return process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080';
}

/**
 * Cache for WebSocket port to avoid multiple API calls
 */
let cachedPort: number | null = null;

export async function getWebSocketPort(): Promise<number> {
  if (cachedPort) {
    return cachedPort;
  }

  try {
    const response = await fetch('/api/ws-port');
    if (response.ok) {
      const data = await response.json();
      cachedPort = data.port;
      return cachedPort;
    }
  } catch (error) {
    console.error('Failed to fetch WebSocket port:', error);
  }

  // Fallback
  return 8080;
}
