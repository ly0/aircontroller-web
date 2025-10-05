"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useDeviceStore } from "@/store/device.store";
import { videoService } from "@/services/video.service";
import { VideoItem } from "@/types";
import {
  Play,
  Pause,
  Download,
  Trash2,
  Search,
  Film,
  Clock,
  Grid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export default function VideosPage() {
  const { selectedDevice, isInitializing } = useDeviceStore();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadVideos = async (page: number = 1, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const videoList = await videoService.getVideos(page, PAGE_SIZE);

      if (append) {
        setVideos((prev) => [...prev, ...videoList]);
      } else {
        setVideos(videoList);
      }

      // If we got fewer videos than PAGE_SIZE, we've reached the end
      setHasMore(videoList.length === PAGE_SIZE);
      setCurrentPage(page);
    } catch (error) {
      console.error("Failed to load videos:", error);
      if (!append) {
        setVideos([]);
        toast.error("Failed to load videos");
      }
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreVideos = useCallback(() => {
    if (!loading && !loadingMore && hasMore) {
      console.log('loadMoreVideos called, currentPage:', currentPage);
      loadVideos(currentPage + 1, true);
    }
  }, [loading, loadingMore, hasMore, currentPage]);

  useEffect(() => {
    // Only load videos after initialization is complete and device is selected
    if (!isInitializing && selectedDevice) {
      loadVideos();
    }
  }, [isInitializing, selectedDevice]);

  // Set up IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !scrollContainerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry.isIntersecting && hasMore && !loadingMore) {
          console.log('IntersectionObserver triggered');
          loadMoreVideos();
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.1,
        rootMargin: '100px',
      }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect();
    };
  }, [loadMoreVideos, hasMore, loadingMore]);

  const handleVideoSelect = (videoId: string) => {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedVideos(newSelected);
  };

  const handlePlayVideo = (video: VideoItem) => {
    if (!selectedDevice) {
      toast.error("No device connected");
      return;
    }
    setPlayingVideo(video);
    setShowPlayer(true);
  };

  const handleClosePlayer = () => {
    setShowPlayer(false);
    setPlayingVideo(null);
  };

  const handleDownload = async () => {
    if (selectedVideos.size === 0) {
      toast.error("No videos selected");
      return;
    }

    if (!selectedDevice) {
      toast.error("No device connected");
      return;
    }

    try {
      // Collect all video paths
      const videoPaths: string[] = [];
      for (const videoId of selectedVideos) {
        const video = videos.find((v) => v.id === videoId);
        if (video) {
          videoPaths.push(video.path);
        }
      }

      if (videoPaths.length === 0) {
        toast.error("No valid videos to download");
        return;
      }

      // Download all videos at once (will be a ZIP if multiple)
      await videoService.downloadVideos(videoPaths, selectedDevice.ip);

      if (videoPaths.length === 1) {
        toast.success("Video downloaded");
      } else {
        toast.success(`${videoPaths.length} videos downloaded as ZIP`);
      }

      setSelectedVideos(new Set());
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download videos");
    }
  };

  const handleDelete = async () => {
    // Note: Video delete API is not available in the mobile backend
    toast.error("Delete function is not available for videos");
    return;

    // Commented out until backend supports video deletion
    /*
    if (selectedVideos.size === 0) {
      toast.error("No videos selected");
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedVideos.size} videos?`);
    if (!confirmed) return;

    for (const videoId of selectedVideos) {
      const video = videos.find((v) => v.id === videoId);
      if (video) {
        try {
          await wsService.deleteFile(video.path);
          setVideos((prev) => prev.filter((v) => v.id !== videoId));
          toast.success(`Deleted ${video.name}`);
        } catch (error) {
          toast.error(`Failed to delete ${video.name}`);
        }
      }
    }
    setSelectedVideos(new Set());
    */
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) {
      return `${gb.toFixed(1)} GB`;
    }
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const filteredVideos = videos.filter((video) =>
    video.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!selectedDevice) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <Film className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No Device Connected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect a device to view videos
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b p-6">
            <h1 className="text-2xl font-bold">Videos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {videos.length} videos • {formatFileSize(videos.reduce((acc, v) => acc + v.size, 0))}
            </p>
          </div>

          {/* Toolbar */}
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {selectedVideos.size > 0 && (
                  <>
                    <span className="text-sm font-medium">
                      {selectedVideos.size} selected
                    </span>
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
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
                    placeholder="Search videos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 w-64 rounded-lg border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

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

          {/* Videos Grid/List */}
          <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <p className="mt-4 text-sm text-muted-foreground">Loading videos...</p>
                </div>
              </div>
            ) : filteredVideos.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Film className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">No videos found</p>
                </div>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {filteredVideos.map((video) => (
                  <div
                    key={video.id}
                    className={cn(
                      "group relative cursor-pointer overflow-hidden rounded-lg border bg-card",
                      "transition-all hover:shadow-md",
                      selectedVideos.has(video.id) && "ring-2 ring-primary"
                    )}
                  >
                    <div
                      className="relative aspect-video bg-black"
                      onClick={() => handlePlayVideo(video)}
                    >
                      {video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt={video.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Film className="h-8 w-8 text-gray-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="h-12 w-12 text-white" />
                      </div>
                      <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                        {formatDuration(video.duration)}
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium">{video.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatFileSize(video.size)}
                      </p>
                    </div>

                    {/* Selection Checkbox */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVideoSelect(video.id);
                      }}
                      className={cn(
                        "absolute left-2 top-2 h-5 w-5 rounded border-2 bg-white",
                        selectedVideos.has(video.id)
                          ? "border-primary bg-primary"
                          : "border-gray-300"
                      )}
                    >
                      {selectedVideos.has(video.id) && (
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
                {filteredVideos.map((video) => (
                  <div
                    key={video.id}
                    className={cn(
                      "flex items-center gap-4 rounded-lg border bg-card p-4",
                      "cursor-pointer transition-all hover:shadow-md",
                      selectedVideos.has(video.id) && "ring-2 ring-primary"
                    )}
                  >
                    <div
                      className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded bg-black"
                      onClick={() => handlePlayVideo(video)}
                    >
                      {video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt={video.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Film className="h-6 w-6 text-gray-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity">
                        <Play className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{video.name}</p>
                      <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(video.duration)}
                        </span>
                        <span>{formatFileSize(video.size)}</span>
                      </div>
                    </div>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVideoSelect(video.id);
                      }}
                      className={cn(
                        "h-5 w-5 rounded border-2",
                        selectedVideos.has(video.id)
                          ? "border-primary bg-primary"
                          : "border-gray-300"
                      )}
                    >
                      {selectedVideos.has(video.id) && (
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

            {/* Infinite scroll trigger */}
            {!loading && filteredVideos.length > 0 && (
              <div
                ref={loadMoreRef}
                className="flex items-center justify-center py-8"
              >
                {loadingMore && (
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    <span className="text-sm text-muted-foreground">
                      Loading more videos...
                    </span>
                  </div>
                )}
                {!hasMore && !loadingMore && (
                  <span className="text-sm text-muted-foreground">
                    No more videos
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>

      {/* Video Player Modal */}
      {showPlayer && playingVideo && selectedDevice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={handleClosePlayer}
        >
          <div
            className="relative w-full max-w-6xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={handleClosePlayer}
              className="absolute -top-12 right-0 text-white hover:text-gray-300"
            >
              <svg
                className="h-8 w-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* Video title */}
            <div className="mb-3 text-white">
              <h2 className="text-xl font-semibold">{playingVideo.name}</h2>
              <p className="text-sm text-gray-300">
                {formatDuration(playingVideo.duration)} • {formatFileSize(playingVideo.size)}
              </p>
            </div>

            {/* Video player */}
            <video
              controls
              autoPlay
              className="w-full max-h-[80vh] rounded-lg bg-black"
              src={`http://${selectedDevice.ip}:9527/video/item/${playingVideo.id}`}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      )}
    </>
  );
}