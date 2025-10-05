"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useDeviceStore } from "@/store/device.store";
import { wsService } from "@/services/websocket-native.service";
import { imageService } from "@/services/image.service";
import { OptimizedImageGrid } from "@/components/ui/optimized-image-grid";
import { ImageViewer } from "@/components/ui/image-viewer";
import { ImageItem } from "@/types";
import {
  Grid,
  List,
  Download,
  Trash2,
  Search,
  FolderOpen,
  Image as ImageIcon,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export default function ImagesPage() {
  const { selectedDevice, isInitializing } = useDeviceStore();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [viewerImage, setViewerImage] = useState<ImageItem | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const PAGE_SIZE = 50;

  useEffect(() => {
    // Only load images after initialization is complete and device is selected
    if (!isInitializing && selectedDevice) {
      loadAlbums();
      loadImages();
    }
  }, [isInitializing, selectedDevice]);

  const loadAlbums = async () => {
    try {
      const albumList = await imageService.getAlbums();
      setAlbums(albumList);
    } catch (error) {
      console.error("Failed to load albums:", error);
      // Don't show error toast for albums, just fail silently
    }
  };

  const loadImages = async (albumId?: string, page: number = 1, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const imageList = await imageService.getImages(albumId, page, PAGE_SIZE);

      if (append) {
        setImages((prev) => [...prev, ...imageList]);
      } else {
        setImages(imageList);
      }

      // If we got fewer images than PAGE_SIZE, we've reached the end
      setHasMore(imageList.length === PAGE_SIZE);
      setCurrentPage(page);
    } catch (error) {
      console.error("Failed to load images:", error);
      if (!append) {
        setImages([]);
      }
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleAlbumSelect = (albumId: string | null) => {
    setSelectedAlbum(albumId);
    setCurrentPage(1);
    setHasMore(true);
    loadImages(albumId || undefined, 1, false);
  };

  const loadMoreImages = () => {
    if (!loading && !loadingMore && hasMore) {
      loadImages(selectedAlbum || undefined, currentPage + 1, true);
    }
  };

  const handleImageSelect = (imageId: string) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(imageId)) {
      newSelected.delete(imageId);
    } else {
      newSelected.add(imageId);
    }
    setSelectedImages(newSelected);
  };

  const handleDownload = async () => {
    if (selectedImages.size === 0) {
      toast.error("No images selected");
      return;
    }

    if (!selectedDevice) {
      toast.error("No device connected");
      return;
    }

    try {
      // Collect all image paths
      const imagePaths: string[] = [];
      for (const imageId of selectedImages) {
        const image = images.find((img) => img.id === imageId);
        if (image) {
          imagePaths.push(image.path);
        }
      }

      if (imagePaths.length === 0) {
        toast.error("No valid images to download");
        return;
      }

      // Download all images at once (will be a ZIP if multiple)
      await imageService.downloadImages(imagePaths, selectedDevice.ip);

      if (imagePaths.length === 1) {
        toast.success("Image downloaded");
      } else {
        toast.success(`${imagePaths.length} images downloaded as ZIP`);
      }

      setSelectedImages(new Set());
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download images");
    }
  };

  const handleDelete = async () => {
    if (selectedImages.size === 0) {
      toast.error("No images selected");
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedImages.size} images?`);
    if (!confirmed) return;

    for (const imageId of selectedImages) {
      const image = images.find((img) => img.id === imageId);
      if (image) {
        try {
          await imageService.deleteImage(image.path);
          setImages((prev) => prev.filter((img) => img.id !== imageId));
          toast.success(`Deleted ${image.name}`);
        } catch (error) {
          toast.error(`Failed to delete ${image.name}`);
        }
      }
    }
    setSelectedImages(new Set());
  };

  const filteredImages = images.filter((image) =>
    image.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleImageClick = (image: ImageItem) => {
    setViewerImage(image);
    setIsViewerOpen(true);
  };

  const handleViewerNavigate = (direction: "prev" | "next") => {
    if (!viewerImage) return;

    const currentIndex = filteredImages.findIndex((img) => img.id === viewerImage.id);
    if (currentIndex === -1) return;

    if (direction === "prev" && currentIndex > 0) {
      setViewerImage(filteredImages[currentIndex - 1]);
    } else if (direction === "next" && currentIndex < filteredImages.length - 1) {
      setViewerImage(filteredImages[currentIndex + 1]);
    }
  };

  const handleViewerClose = () => {
    setIsViewerOpen(false);
    setViewerImage(null);
  };

  if (!selectedDevice) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No Device Connected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect a device to view images
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-full">
        {/* Sidebar with Albums */}
        <div className="w-64 border-r bg-background p-4 flex flex-col">
          <h2 className="mb-4 text-lg font-semibold">Albums</h2>
          <div className="space-y-1 flex-1 overflow-auto">
            <button
              onClick={() => handleAlbumSelect(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm",
                "hover:bg-accent transition-colors",
                selectedAlbum === null && "bg-primary/10 text-primary"
              )}
            >
              <FolderOpen className="h-4 w-4" />
              All Images
            </button>
            {albums.map((album) => (
              <button
                key={album.id}
                onClick={() => handleAlbumSelect(album.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  "hover:bg-accent transition-colors",
                  selectedAlbum === album.id && "bg-primary/10 text-primary"
                )}
              >
                <FolderOpen className="h-4 w-4" />
                <span className="truncate">{album.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {album.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {selectedImages.size > 0 && (
                  <>
                    <button
                      onClick={() => setSelectedImages(new Set())}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Clear selection
                    </button>
                    <span className="text-sm font-medium">
                      {selectedImages.size} selected
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search images..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 w-64 rounded-lg border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Actions */}
                {selectedImages.size > 0 && (
                  <>
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

          {/* Images Grid/List */}
          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Loading images...
                  </p>
                </div>
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    No images found
                  </p>
                </div>
              </div>
            ) : (
              <OptimizedImageGrid
                images={filteredImages}
                selectedImages={selectedImages}
                onImageSelect={handleImageSelect}
                onImageClick={handleImageClick}
                viewMode={viewMode}
                onLoadMore={loadMoreImages}
                loadingMore={loadingMore}
                hasMore={hasMore}
              />
            )}
          </div>
        </div>
      </div>

      {/* Image Viewer */}
      {viewerImage && (
        <ImageViewer
          image={viewerImage}
          images={filteredImages}
          isOpen={isViewerOpen}
          onClose={handleViewerClose}
          onNavigate={handleViewerNavigate}
        />
      )}
    </DashboardLayout>
  );
}