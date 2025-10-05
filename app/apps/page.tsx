"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useDeviceStore } from "@/store/device.store";
import { wsService } from "@/services/websocket-native.service";
import { AppInfo } from "@/types";
import {
  Package,
  Download,
  Trash2,
  Search,
  Filter,
  Info,
  Grid,
  List,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export default function AppsPage() {
  const { selectedDevice, isInitializing } = useDeviceStore();
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "system" | "user">("all");
  const [sortBy, setSortBy] = useState<"name" | "size" | "date">("name");

  useEffect(() => {
    // Only load apps after initialization is complete and device is selected
    if (!isInitializing && selectedDevice) {
      loadApps();
    }
  }, [isInitializing, selectedDevice]);

  const loadApps = async () => {
    setLoading(true);
    try {
      const appList = await wsService.getInstalledApps();
      setApps(appList);
    } catch (error) {
      console.error("Failed to load apps:", error);
      toast.error("Failed to load apps");
    } finally {
      setLoading(false);
    }
  };

  const handleAppSelect = (appId: string) => {
    const newSelected = new Set(selectedApps);
    if (newSelected.has(appId)) {
      newSelected.delete(appId);
    } else {
      newSelected.add(appId);
    }
    setSelectedApps(newSelected);
  };

  const handleUninstallApps = async () => {
    if (selectedApps.size === 0) {
      toast.error("No apps selected");
      return;
    }

    const confirmed = window.confirm(`Uninstall ${selectedApps.size} apps?`);
    if (!confirmed) return;

    for (const appId of selectedApps) {
      const app = apps.find((a) => a.id === appId);
      if (app) {
        try {
          await wsService.uninstallApp(app.packageName);
          setApps((prev) => prev.filter((a) => a.id !== appId));
          toast.success(`Uninstalled ${app.name}`);
        } catch (error) {
          toast.error(`Failed to uninstall ${app.name}`);
        }
      }
    }
    setSelectedApps(new Set());
  };

  const handleBackupApps = async () => {
    if (selectedApps.size === 0) {
      toast.error("No apps selected");
      return;
    }

    for (const appId of selectedApps) {
      const app = apps.find((a) => a.id === appId);
      if (app) {
        try {
          await wsService.sendCommand("app:backup", { packageName: app.packageName });
          toast.success(`Backed up ${app.name}`);
        } catch (error) {
          toast.error(`Failed to backup ${app.name}`);
        }
      }
    }
    setSelectedApps(new Set());
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  };

  const sortedApps = [...apps].sort((a, b) => {
    switch (sortBy) {
      case "size":
        return b.size - a.size;
      case "date":
        return new Date(b.installTime).getTime() - new Date(a.installTime).getTime();
      case "name":
      default:
        return a.name.localeCompare(b.name);
    }
  });

  const filteredApps = sortedApps.filter((app) => {
    const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          app.packageName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    switch (filterType) {
      case "system":
        return app.packageName.startsWith("com.android") ||
               app.packageName.startsWith("com.google");
      case "user":
        return !app.packageName.startsWith("com.android") &&
               !app.packageName.startsWith("com.google");
      default:
        return true;
    }
  });

  if (!selectedDevice) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No Device Connected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect a device to manage apps
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b p-6">
          <h1 className="text-2xl font-bold">Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {apps.length} apps installed • {formatFileSize(apps.reduce((acc, a) => acc + a.size, 0))}
          </p>
        </div>

        {/* Toolbar */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedApps.size > 0 && (
                <>
                  <span className="text-sm font-medium">
                    {selectedApps.size} selected
                  </span>
                  <button
                    onClick={handleBackupApps}
                    className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <Download className="h-4 w-4" />
                    Backup
                  </button>
                  <button
                    onClick={handleUninstallApps}
                    className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                    Uninstall
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search apps..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-64 rounded-lg border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Apps</option>
                <option value="user">User Apps</option>
                <option value="system">System Apps</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="name">Name</option>
                <option value="size">Size</option>
                <option value="date">Install Date</option>
              </select>

              {/* View Mode */}
              <div className="flex items-center rounded-lg border">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5",
                    viewMode === "grid"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Grid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-1.5",
                    viewMode === "list"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Apps Grid/List */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                <p className="mt-4 text-sm text-muted-foreground">Loading apps...</p>
              </div>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">No apps found</p>
              </div>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredApps.map((app) => (
                <div
                  key={app.id}
                  onClick={() => handleAppSelect(app.id)}
                  className={cn(
                    "group relative cursor-pointer rounded-lg border bg-card p-4",
                    "transition-all hover:shadow-md",
                    selectedApps.has(app.id) && "ring-2 ring-primary"
                  )}
                >
                  <div className="flex flex-col items-center gap-2">
                    {app.icon ? (
                      <img
                        src={app.icon}
                        alt={app.name}
                        className="h-12 w-12 rounded-xl"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Package className="h-6 w-6 text-primary" />
                      </div>
                    )}
                    <p className="text-center text-sm font-medium line-clamp-2">
                      {app.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {app.version}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(app.size)}
                    </p>
                  </div>

                  {/* Selection Checkbox */}
                  <div
                    className={cn(
                      "absolute right-2 top-2 h-5 w-5 rounded border-2 bg-white",
                      selectedApps.has(app.id)
                        ? "border-primary bg-primary"
                        : "border-gray-300"
                    )}
                  >
                    {selectedApps.has(app.id) && (
                      <svg
                        className="h-full w-full text-white"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredApps.map((app) => (
                <div
                  key={app.id}
                  onClick={() => handleAppSelect(app.id)}
                  className={cn(
                    "flex items-center gap-4 rounded-lg border bg-card p-4",
                    "cursor-pointer transition-all hover:shadow-md",
                    selectedApps.has(app.id) && "ring-2 ring-primary"
                  )}
                >
                  {app.icon ? (
                    <img
                      src={app.icon}
                      alt={app.name}
                      className="h-12 w-12 rounded-xl"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{app.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {app.packageName}
                    </p>
                    <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                      <span>v{app.version}</span>
                      <span>{formatFileSize(app.size)}</span>
                      <span>Installed {formatDate(new Date(app.installTime))}</span>
                    </div>
                  </div>

                  {/* Selection Checkbox */}
                  <div
                    className={cn(
                      "h-5 w-5 rounded border-2",
                      selectedApps.has(app.id)
                        ? "border-primary bg-primary"
                        : "border-gray-300"
                    )}
                  >
                    {selectedApps.has(app.id) && (
                      <svg
                        className="h-full w-full text-white"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}