import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const portFilePath = path.join(process.cwd(), '.ws-port');

    // Check if port file exists
    if (!fs.existsSync(portFilePath)) {
      return NextResponse.json(
        { error: 'WebSocket server not running' },
        { status: 503 }
      );
    }

    // Read port from file
    const port = parseInt(fs.readFileSync(portFilePath, 'utf-8').trim(), 10);

    if (isNaN(port)) {
      return NextResponse.json(
        { error: 'Invalid port number' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      port,
      wsUrl: `ws://localhost:${port}`,
    });
  } catch (error) {
    console.error('Failed to read WebSocket port:', error);
    return NextResponse.json(
      { error: 'Failed to read WebSocket port' },
      { status: 500 }
    );
  }
}
