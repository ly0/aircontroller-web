"use client";

import { ImageItem } from "@/types";
import { LazyImage } from "./lazy-image";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface OptimizedImageGridProps {
  images: ImageItem[];
  selectedImages: Set<string>;
  onImageSelect: (imageId: string) => void;
  onImageClick?: (image: ImageItem) => void;
  viewMode: "grid" | "list";
  onLoadMore?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
}

export function OptimizedImageGrid({
  images,
  selectedImages,
  onImageSelect,
  onImageClick,
  viewMode,
  onLoadMore,
  loadingMore,
  hasMore,
}: OptimizedImageGridProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Set up IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!onLoadMore || !loadMoreRef.current || !scrollContainerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry.isIntersecting && hasMore && !loadingMore) {
          console.log('Loading more images via IntersectionObserver');
          onLoadMore();
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
  }, [onLoadMore, hasMore, loadingMore]);

  // 渲染单个图片项 - 每个图片独立加载，避免批量等待
  const renderImageItem = (image: ImageItem) => {
    if (viewMode === "grid") {
      return (
        <div
          key={image.id}
          onClick={() => onImageClick?.(image)}
          className={cn(
            "group relative cursor-pointer overflow-hidden rounded-lg border bg-card",
            "transition-all hover:shadow-md",
            selectedImages.has(image.id) && "ring-2 ring-primary"
          )}
          style={{
            minHeight: "200px", // 保持占位高度，避免布局跳动
          }}
        >
          <div className="aspect-square bg-gray-100">
            {image.thumbnailUrl ? (
              <LazyImage
                src={image.thumbnailUrl}
                alt={image.name || "Image"}
                rootMargin="1000px" // 提前 1000px 开始加载，确保滑动流畅
                threshold={0.01}
                placeholder={
                  <div className="flex h-full items-center justify-center">
                    <div className="h-8 w-8 animate-pulse rounded bg-gray-300" />
                  </div>
                }
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="p-2">
            <p className="truncate text-xs">{image.name || 'Unnamed'}</p>
          </div>

          {/* Selection Checkbox */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onImageSelect(image.id);
            }}
            className={cn(
              "absolute left-2 top-2 h-5 w-5 rounded border-2 bg-white cursor-pointer",
              "hover:scale-110 transition-transform",
              selectedImages.has(image.id)
                ? "border-primary bg-primary"
                : "border-gray-300 hover:border-gray-400"
            )}
          >
            {selectedImages.has(image.id) && (
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
      );
    } else {
      // List view
      return (
        <div
          key={image.id}
          onClick={() => onImageClick?.(image)}
          className={cn(
            "flex items-center gap-4 rounded-lg border bg-card p-4",
            "cursor-pointer transition-all hover:shadow-md",
            selectedImages.has(image.id) && "ring-2 ring-primary"
          )}
        >
          {/* Selection Checkbox */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onImageSelect(image.id);
            }}
            className={cn(
              "h-5 w-5 rounded border-2 bg-white cursor-pointer flex-shrink-0",
              "hover:scale-110 transition-transform",
              selectedImages.has(image.id)
                ? "border-primary bg-primary"
                : "border-gray-300 hover:border-gray-400"
            )}
          >
            {selectedImages.has(image.id) && (
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

          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-gray-100">
            {image.thumbnailUrl ? (
              <LazyImage
                src={image.thumbnailUrl}
                alt={image.name || "Image"}
                rootMargin="1000px" // 提前 1000px 开始加载
                threshold={0.01}
                placeholder={
                  <div className="flex h-full items-center justify-center">
                    <div className="h-6 w-6 animate-pulse rounded bg-gray-300" />
                  </div>
                }
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium">{image.name || 'Unnamed'}</p>
            <p className="text-sm text-muted-foreground">
              {image.size ? `${Math.round(image.size / 1024)} KB` : 'Unknown size'} • {image.width && image.height ? `${image.width} × ${image.height}` : 'Unknown dimensions'}
            </p>
          </div>
        </div>
      );
    }
  };

  return (
    <div ref={scrollContainerRef} className="h-full overflow-auto">
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {images.map((image) => renderImageItem(image))}
        </div>
      ) : (
        <div className="space-y-2 p-4">
          {images.map((image) => renderImageItem(image))}
        </div>
      )}

      {/* Infinite scroll trigger */}
      {images.length > 0 && onLoadMore && (
        <div
          ref={loadMoreRef}
          className="flex items-center justify-center py-8"
        >
          {loadingMore && (
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
              <span className="text-sm text-muted-foreground">
                Loading more images...
              </span>
            </div>
          )}
          {!hasMore && !loadingMore && (
            <span className="text-sm text-muted-foreground">
              No more images
            </span>
          )}
        </div>
      )}
    </div>
  );
}