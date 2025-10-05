"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useDeviceStore } from "@/store/device.store";
import {
  Image,
  Video,
  Music,
  FolderOpen,
  Users,
  Package,
  Wifi,
  WifiOff,
  Smartphone
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "Images",
    description: "Browse and manage photos",
    icon: Image,
    href: "/images",
    color: "text-blue-500",
    bgColor: "bg-blue-50",
  },
  {
    title: "Videos",
    description: "Watch and organize videos",
    icon: Video,
    href: "/videos",
    color: "text-purple-500",
    bgColor: "bg-purple-50",
  },
  {
    title: "Music",
    description: "Play and manage music",
    icon: Music,
    href: "/music",
    color: "text-green-500",
    bgColor: "bg-green-50",
  },
  {
    title: "Files",
    description: "Browse file system",
    icon: FolderOpen,
    href: "/files",
    color: "text-orange-500",
    bgColor: "bg-orange-50",
  },
  {
    title: "Contacts",
    description: "Manage contacts",
    icon: Users,
    href: "/contacts",
    color: "text-pink-500",
    bgColor: "bg-pink-50",
  },
  {
    title: "Apps",
    description: "Manage installed apps",
    icon: Package,
    href: "/apps",
    color: "text-indigo-500",
    bgColor: "bg-indigo-50",
  },
];

export default function Home() {
  const { selectedDevice } = useDeviceStore();

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Welcome to AirController</h1>
          <p className="mt-2 text-muted-foreground">
            Manage your Android phone wirelessly from your computer
          </p>
        </div>

        {/* Connection Status Card */}
        <div className="mb-8 rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {selectedDevice ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <Wifi className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Connected Device</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedDevice.name} • {selectedDevice.ip}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                    <WifiOff className="h-6 w-6 text-gray-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">No Device Connected</h2>
                    <p className="text-sm text-muted-foreground">
                      Connect a device to start managing your phone
                    </p>
                  </div>
                </>
              )}
            </div>

            {selectedDevice && selectedDevice.deviceInfo && (
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground">Battery</p>
                  <p className="font-semibold">{selectedDevice.deviceInfo.battery}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Storage</p>
                  <p className="font-semibold">
                    {Math.round(selectedDevice.deviceInfo.storage.free / 1024 / 1024 / 1024)}GB free
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.href}
                href={feature.href}
                className={cn(
                  "group relative overflow-hidden rounded-lg border bg-card p-6",
                  "transition-all hover:shadow-md",
                  !selectedDevice && "pointer-events-none opacity-50"
                )}
              >
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-lg",
                    feature.bgColor
                  )}>
                    <Icon className={cn("h-6 w-6", feature.color)} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{feature.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Quick Stats */}
        {selectedDevice && selectedDevice.deviceInfo && (
          <div className="mt-8 rounded-lg border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">Device Information</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Model</p>
                <p className="mt-1 font-semibold">{selectedDevice.deviceInfo.model}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Manufacturer</p>
                <p className="mt-1 font-semibold">{selectedDevice.deviceInfo.manufacturer}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Android Version</p>
                <p className="mt-1 font-semibold">{selectedDevice.deviceInfo.androidVersion}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Storage Used</p>
                <p className="mt-1 font-semibold">
                  {Math.round(selectedDevice.deviceInfo.storage.used / 1024 / 1024 / 1024)}GB /
                  {Math.round(selectedDevice.deviceInfo.storage.total / 1024 / 1024 / 1024)}GB
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Getting Started */}
        {!selectedDevice && (
          <div className="mt-8 rounded-lg border border-dashed bg-gray-50 p-8 text-center">
            <Smartphone className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Get Started</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              1. Install AirController app on your Android phone<br />
              2. Connect your phone and computer to the same network<br />
              3. Click the device button above to connect
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}