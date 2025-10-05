import { NextResponse } from 'next/server';

// Mock device data for testing
const mockDevice = {
  id: "mock_device_001",
  name: "Test Android Phone",
  ip: "192.168.1.100",
  port: 8080,
  type: "android" as const,
  deviceInfo: {
    model: "Pixel 7 Pro",
    manufacturer: "Google",
    androidVersion: "14",
    storage: {
      total: 128 * 1024 * 1024 * 1024, // 128GB
      used: 45 * 1024 * 1024 * 1024,   // 45GB
      free: 83 * 1024 * 1024 * 1024,   // 83GB
    },
    battery: 85,
  }
};

export async function GET() {
  // Simulate network discovery delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Return mock device info
  return NextResponse.json(mockDevice);
}

export async function POST() {
  // Simulate device connection
  await new Promise(resolve => setTimeout(resolve, 1000));

  return NextResponse.json({
    connected: true,
    message: "Successfully connected to device"
  });
}