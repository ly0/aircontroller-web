"use client";

import { useEffect, useState, useRef } from "react";
import { ImageItem } from "@/types";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageViewerProps {
  image: ImageItem;
  images?: ImageItem[];
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (direction: "prev" | "next") => void;
  onDownload?: () => void;
}

export function ImageViewer({
  image,
  images = [],
  isOpen,
  onClose,
  onNavigate,
  onDownload,
}: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIndex = images.findIndex((img) => img.id === image.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  // Reset state when image changes
  useEffect(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, [image.id]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "+":
        case "=":
          handleZoomIn();
          break;
        case "-":
          handleZoomOut();
          break;
        case "ArrowLeft":
          if (hasPrev && onNavigate) onNavigate("prev");
          break;
        case "ArrowRight":
          if (hasNext && onNavigate) onNavigate("next");
          break;
        case "r":
        case "R":
          handleRotateRight();
          break;
        case "0":
          resetTransform();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, hasPrev, hasNext, onNavigate]);

  // Handle mouse wheel zoom
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((prev) => Math.max(0.1, Math.min(5, prev + delta)));
    };

    const container = containerRef.current;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [isOpen]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(5, prev + 0.2));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.1, prev - 0.2));
  };

  const handleRotateLeft = () => {
    setRotation((prev) => prev - 90);
  };

  const handleRotateRight = () => {
    setRotation((prev) => prev + 90);
  };

  const resetTransform = () => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  if (!isOpen) return null;

  // Get the full-size image URL
  const imageUrl = image.url || image.thumbnailUrl || "";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-white">
          <span className="text-sm font-medium">{image.name}</span>
          {image.width && image.height && (
            <span className="text-xs text-gray-400">
              {image.width} × {image.height}
            </span>
          )}
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
            title="Zoom Out (-)"
          >
            <ZoomOut className="h-5 w-5" />
          </button>

          <button
            onClick={handleZoomIn}
            className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
            title="Zoom In (+)"
          >
            <ZoomIn className="h-5 w-5" />
          </button>

          <span className="text-sm text-white/70 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={handleRotateLeft}
            className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
            title="Rotate Left"
          >
            <RotateCcw className="h-5 w-5" />
          </button>

          <button
            onClick={handleRotateRight}
            className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
            title="Rotate Right (R)"
          >
            <RotateCw className="h-5 w-5" />
          </button>

          <button
            onClick={resetTransform}
            className="px-3 py-2 rounded-lg hover:bg-white/10 text-white text-sm transition-colors"
            title="Reset (0)"
          >
            Reset
          </button>

          <div className="w-px h-6 bg-white/20" />

          {onDownload && (
            <>
              <button
                onClick={onDownload}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-white text-sm transition-colors"
                title="Download Image"
              >
                <Download className="h-4 w-4" />
                Download
              </button>

              <div className="w-px h-6 bg-white/20" />
            </>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            ref={imageRef}
            src={imageUrl}
            alt={image.name || "Image"}
            className={cn(
              "max-w-none transition-transform",
              isDragging ? "cursor-grabbing" : "cursor-grab"
            )}
            style={{
              transform: `scale(${scale}) rotate(${rotation}deg) translate(${position.x / scale}px, ${position.y / scale}px)`,
              userSelect: "none",
            }}
            draggable={false}
          />
        </div>

        {/* Navigation arrows */}
        {onNavigate && hasPrev && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("prev");
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            title="Previous (←)"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {onNavigate && hasNext && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("next");
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            title="Next (→)"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Bottom info */}
      {images.length > 0 && (
        <div className="px-4 py-2 bg-black/50 backdrop-blur-sm text-center">
          <span className="text-sm text-white/70">
            {currentIndex + 1} / {images.length}
          </span>
        </div>
      )}
    </div>
  );
}
