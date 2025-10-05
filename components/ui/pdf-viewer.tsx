"use client";

import { X, Download, ZoomIn, ZoomOut, Hand, RotateCw, RotateCcw } from "lucide-react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { Viewport, ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { Scroller, ScrollPluginPackage, ScrollStrategy } from "@embedpdf/plugin-scroll/react";
import { LoaderPluginPackage } from "@embedpdf/plugin-loader/react";
import { RenderLayer, RenderPluginPackage } from "@embedpdf/plugin-render/react";
import {
  InteractionManagerPluginPackage,
  GlobalPointerProvider,
  PagePointerProvider
} from "@embedpdf/plugin-interaction-manager/react";
import { SelectionPluginPackage, SelectionLayer } from "@embedpdf/plugin-selection/react";
import { ZoomPluginPackage, ZoomMode, useZoom } from "@embedpdf/plugin-zoom/react";
import { TilingPluginPackage, TilingLayer } from "@embedpdf/plugin-tiling/react";
import { RotatePluginPackage, Rotate, useRotateCapability } from "@embedpdf/plugin-rotate/react";
import { PanPluginPackage, usePan } from "@embedpdf/plugin-pan/react";

interface PdfViewerProps {
  fileUrl: string;
  fileName: string;
  isOpen: boolean;
  onClose: () => void;
  onDownload?: () => void;
}

// PDF Controls Component (must be inside EmbedPDF context)
function PdfControls({
  fileName,
  onDownload,
  onClose
}: {
  fileName: string;
  onDownload?: () => void;
  onClose: () => void;
}) {
  const zoom = useZoom();
  const { provides: panProvider, isPanning } = usePan();
  const { provides: rotateProvider } = useRotateCapability();

  const handleZoomIn = () => {
    if (zoom.provides) {
      zoom.provides.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (zoom.provides) {
      zoom.provides.zoomOut();
    }
  };

  const handleTogglePan = () => {
    if (panProvider) {
      panProvider.togglePan();
    }
  };

  const handleRotateClockwise = () => {
    if (rotateProvider) {
      rotateProvider.rotateForward();
    }
  };

  const handleRotateCounterClockwise = () => {
    if (rotateProvider) {
      rotateProvider.rotateBackward();
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-white">
        <span className="text-sm font-medium">{fileName}</span>
      </div>

      {/* Control buttons */}
      <div className="flex items-center gap-2">
        {/* Pan control */}
        <button
          onClick={handleTogglePan}
          className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
            isPanning ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white'
          }`}
          title="Toggle Pan Mode"
          disabled={!panProvider}
        >
          <Hand className="h-4 w-4" />
        </button>

        <div className="w-px h-6 bg-white/20" />

        {/* Zoom controls */}
        <button
          onClick={handleZoomOut}
          className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors disabled:opacity-50"
          title="Zoom Out"
          disabled={!zoom.provides}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={handleZoomIn}
          className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors disabled:opacity-50"
          title="Zoom In"
          disabled={!zoom.provides}
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        <div className="w-px h-6 bg-white/20" />

        {/* Rotate controls */}
        <button
          onClick={handleRotateCounterClockwise}
          className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors disabled:opacity-50"
          title="Rotate Counter-Clockwise"
          disabled={!rotateProvider}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={handleRotateClockwise}
          className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors disabled:opacity-50"
          title="Rotate Clockwise"
          disabled={!rotateProvider}
        >
          <RotateCw className="h-4 w-4" />
        </button>

        {onDownload && (
          <>
            <div className="w-px h-6 bg-white/20" />
            <button
              onClick={onDownload}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-white text-sm transition-colors"
              title="Download PDF"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          </>
        )}

        <div className="w-px h-6 bg-white/20" />

        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
          title="Close (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function PdfViewer({
  fileUrl,
  fileName,
  isOpen,
  onClose,
  onDownload,
}: PdfViewerProps) {
  // Initialize the PDF engine
  const { engine, isLoading, error } = usePdfiumEngine();

  if (!isOpen) return null;

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center">
        <div className="text-white">Error loading PDF: {error.message}</div>
      </div>
    );
  }

  if (isLoading || !engine) {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center">
        <div className="text-white">Loading PDF Engine...</div>
      </div>
    );
  }

  // Create plugins with dynamic URL
  const plugins = [
    createPluginRegistration(LoaderPluginPackage, {
      loadingOptions: {
        type: "url",
        pdfFile: {
          id: fileName,
          url: fileUrl,
        },
      },
    }),
    createPluginRegistration(ViewportPluginPackage, {
      viewportGap: 10,
    }),
    createPluginRegistration(ScrollPluginPackage, {
      strategy: ScrollStrategy.Vertical,
    }),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(TilingPluginPackage, {
      tileSize: 768,
      overlapPx: 2.5,
      extraRings: 0,
    }),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(RotatePluginPackage),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(SelectionPluginPackage),
    createPluginRegistration(PanPluginPackage),
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ pluginsReady }) => (
          <>
            {/* Top toolbar with controls */}
            <PdfControls
              fileName={fileName}
              onDownload={onDownload}
              onClose={onClose}
            />

            {/* PDF container */}
            <div className="flex-1 overflow-hidden bg-gray-800">
              <GlobalPointerProvider>
                <Viewport className="h-full w-full select-none overflow-auto bg-gray-800">
                  {pluginsReady ? (
                    <Scroller
                      renderPage={({ pageIndex, scale, width, height, document, rotation }) => (
                        <Rotate key={document?.id} pageSize={{ width, height }}>
                          <PagePointerProvider
                            rotation={rotation}
                            scale={scale}
                            pageWidth={width}
                            pageHeight={height}
                            pageIndex={pageIndex}
                          >
                            <RenderLayer pageIndex={pageIndex} scale={scale} className="pointer-events-none" />
                            <TilingLayer
                              pageIndex={pageIndex}
                              scale={scale}
                              className="pointer-events-none"
                            />
                            <SelectionLayer pageIndex={pageIndex} scale={scale} />
                          </PagePointerProvider>
                        </Rotate>
                      )}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-white">Loading plugins...</div>
                    </div>
                  )}
                </Viewport>
              </GlobalPointerProvider>
            </div>
          </>
        )}
      </EmbedPDF>
    </div>
  );
}
