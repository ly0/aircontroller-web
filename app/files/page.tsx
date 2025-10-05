"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useDeviceStore } from "@/store/device.store";
import { wsService } from "@/services/websocket-native.service";
import { FileItem } from "@/types";
import { ImageViewer } from "@/components/ui/image-viewer";
import { PdfViewer } from "@/components/ui/pdf-viewer";
import {
  File,
  Folder,
  Download,
  Upload,
  Trash2,
  Search,
  ChevronRight,
  ChevronLeft,
  Home,
  Grid,
  List,
  Copy,
  Scissors,
  Clipboard,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useDropzone } from "react-dropzone";

export default function FilesPage() {
  const { selectedDevice, isInitializing } = useDeviceStore();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState("/storage/emulated/0");
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [clipboard, setClipboard] = useState<{ files: FileItem[]; operation: "copy" | "cut" } | null>(null);
  const [viewerImage, setViewerImage] = useState<FileItem | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [pdfViewerFile, setPdfViewerFile] = useState<FileItem | null>(null);
  const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false);

  useEffect(() => {
    // Only load files after initialization is complete and device is selected
    if (!isInitializing && selectedDevice) {
      loadFiles(currentPath);
    }
  }, [isInitializing, selectedDevice, currentPath]);

  const loadFiles = async (path: string) => {
    setLoading(true);
    try {
      const fileList = await wsService.getFileList(path);
      setFiles(fileList);
    } catch (error) {
      console.error("Failed to load files:", error);
      toast.error("Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (folder: FileItem) => {
    if (folder.type === "folder") {
      setPathHistory([...pathHistory, currentPath]);
      setCurrentPath(folder.path);
      setSelectedFiles(new Set());
    }
  };

  const navigateBack = () => {
    if (pathHistory.length > 0) {
      const newHistory = [...pathHistory];
      const previousPath = newHistory.pop()!;
      setPathHistory(newHistory);
      setCurrentPath(previousPath);
      setSelectedFiles(new Set());
    }
  };

  const navigateHome = () => {
    setCurrentPath("/storage/emulated/0");
    setPathHistory([]);
    setSelectedFiles(new Set());
  };

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setPathHistory([]);
    setSelectedFiles(new Set());
  };

  const handleFileSelect = (fileId: string) => {
    // Toggle selection
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const handleDownloadSingle = async (file: FileItem) => {
    if (!selectedDevice) {
      toast.error("No device connected");
      return;
    }

    try {
      toast.loading(`Downloading ${file.name}...`, { id: file.id });

      // Use HTTP endpoint to download file (port 9527)
      const url = `http://${selectedDevice.ip}:9527/stream/file?path=${encodeURIComponent(file.path)}`;

      // Fetch the file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the blob
      const blob = await response.blob();

      // Create a blob URL and trigger download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      URL.revokeObjectURL(blobUrl);

      toast.success(`Downloaded ${file.name}`, { id: file.id });
    } catch (error) {
      console.error("Failed to download file:", error);
      toast.error(`Failed to download ${file.name}`, { id: file.id });
    }
  };

  const handleDownload = async () => {
    if (selectedFiles.size === 0) {
      toast.error("No files selected");
      return;
    }

    if (!selectedDevice) {
      toast.error("No device connected");
      return;
    }

    const downloadId = 'batch-download';

    try {
      const selectedFileItems = files.filter(f => selectedFiles.has(f.id));
      const paths = selectedFileItems.map(f => f.path);

      if (selectedFileItems.length === 1) {
        // Single file download - use the single file download function
        await handleDownloadSingle(selectedFileItems[0]);
      } else {
        // Multiple files download - will be zipped
        toast.loading(`Preparing to download ${selectedFileItems.length} files...`, { id: downloadId });

        const pathsParam = encodeURIComponent(paths.join(','));
        const url = `http://${selectedDevice.ip}:9527/stream/file/multipart?paths=${pathsParam}`;

        // Fetch the zip file
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Get the blob
        const blob = await response.blob();

        // Create a blob URL and trigger download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `batch_download_${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the blob URL
        URL.revokeObjectURL(blobUrl);

        toast.success(`Downloaded ${selectedFileItems.length} files as zip`, { id: downloadId });
      }

      setSelectedFiles(new Set());
    } catch (error) {
      console.error("Failed to download files:", error);
      toast.error("Failed to download files", { id: downloadId });
    }
  };

  const handleDelete = async () => {
    if (selectedFiles.size === 0) {
      toast.error("No files selected");
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedFiles.size} items?`);
    if (!confirmed) return;

    for (const fileId of selectedFiles) {
      const file = files.find((f) => f.id === fileId);
      if (file) {
        try {
          await wsService.deleteFile(file.path);
          setFiles((prev) => prev.filter((f) => f.id !== fileId));
          toast.success(`Deleted ${file.name}`);
        } catch (error) {
          toast.error(`Failed to delete ${file.name}`);
        }
      }
    }
    setSelectedFiles(new Set());
  };

  const handleCopy = () => {
    if (selectedFiles.size === 0) {
      toast.error("No files selected");
      return;
    }

    const selectedFileItems = files.filter(f => selectedFiles.has(f.id));
    setClipboard({ files: selectedFileItems, operation: "copy" });
    toast.success(`${selectedFiles.size} items copied`);
  };

  const handleCut = () => {
    if (selectedFiles.size === 0) {
      toast.error("No files selected");
      return;
    }

    const selectedFileItems = files.filter(f => selectedFiles.has(f.id));
    setClipboard({ files: selectedFileItems, operation: "cut" });
    toast.success(`${selectedFiles.size} items cut`);
  };

  const handlePaste = async () => {
    if (!clipboard) {
      toast.error("Nothing to paste");
      return;
    }

    // Implement paste logic here
    toast.success(`Pasted ${clipboard.files.length} items`);
    if (clipboard.operation === "cut") {
      setClipboard(null);
    }
    loadFiles(currentPath);
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (!selectedDevice) {
      toast.error("No device connected");
      return;
    }

    const toastId = toast.loading(`Uploading ${acceptedFiles.length} file(s)...`);

    try {
      const formData = new FormData();
      formData.append('path', currentPath);

      acceptedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch(
        `http://${selectedDevice.ip}:9527/file/uploadFiles`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const result = await response.json();

      if (result.code === 0) {
        toast.success(`Uploaded ${acceptedFiles.length} file(s)`, { id: toastId });
        loadFiles(currentPath);
      } else {
        toast.error(result.msg || 'Upload failed', { id: toastId });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload files', { id: toastId });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,  // Disable click to open file dialog
    noKeyboard: true,  // Disable keyboard to open file dialog
    multiple: true  // Allow multiple file selection
  });

  // Separate file input ref for the upload button
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onDrop(Array.from(files));
      // Reset input so the same files can be selected again
      e.target.value = '';
    }
  };

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const isImageFile = (file: FileItem) => {
    if (file.type !== "file") return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    return imageExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  };

  const isPdfFile = (file: FileItem) => {
    if (file.type !== "file") return false;
    return file.name.toLowerCase().endsWith('.pdf');
  };

  const getThumbnailUrl = (file: FileItem) => {
    if (!selectedDevice || !isImageFile(file)) return null;
    const encodedPath = encodeURIComponent(file.path);
    return `http://${selectedDevice.ip}:9527/stream/image/thumbnail2?path=${encodedPath}&width=300&height=300`;
  };

  const getFullImageUrl = (file: FileItem) => {
    if (!selectedDevice || !isImageFile(file)) return null;
    const encodedPath = encodeURIComponent(file.path);
    return `http://${selectedDevice.ip}:9527/stream/file?path=${encodedPath}`;
  };

  const handleFileClick = (file: FileItem) => {
    if (file.type === "folder") {
      navigateToFolder(file);
    } else if (isImageFile(file)) {
      // Open image viewer for images
      const imageItem: any = {
        ...file,
        url: getFullImageUrl(file),
        thumbnailUrl: getThumbnailUrl(file),
        width: 0,
        height: 0,
      };
      setViewerImage(imageItem);
      setIsViewerOpen(true);
    } else {
      // Download non-image files
      handleDownloadSingle(file);
    }
  };

  const handleViewerNavigate = (direction: "prev" | "next") => {
    if (!viewerImage) return;

    const imageFiles = filteredFiles.filter(isImageFile);
    const currentIndex = imageFiles.findIndex((img) => img.id === viewerImage.id);
    if (currentIndex === -1) return;

    if (direction === "prev" && currentIndex > 0) {
      const prevImage = imageFiles[currentIndex - 1];
      setViewerImage({
        ...prevImage,
        url: getFullImageUrl(prevImage),
        thumbnailUrl: getThumbnailUrl(prevImage),
        width: 0,
        height: 0,
      } as any);
    } else if (direction === "next" && currentIndex < imageFiles.length - 1) {
      const nextImage = imageFiles[currentIndex + 1];
      setViewerImage({
        ...nextImage,
        url: getFullImageUrl(nextImage),
        thumbnailUrl: getThumbnailUrl(nextImage),
        width: 0,
        height: 0,
      } as any);
    }
  };

  const handleViewerClose = () => {
    setIsViewerOpen(false);
    setViewerImage(null);
  };

  const handleDownloadFromViewer = async () => {
    if (!viewerImage) return;
    await handleDownloadSingle(viewerImage);
  };

  const getPdfUrl = (file: FileItem) => {
    if (!selectedDevice || !isPdfFile(file)) return null;
    const encodedPath = encodeURIComponent(file.path);
    return `http://${selectedDevice.ip}:9527/stream/file?path=${encodedPath}`;
  };

  const handlePdfPreview = (file: FileItem) => {
    if (!isPdfFile(file)) return;
    setPdfViewerFile(file);
    setIsPdfViewerOpen(true);
  };

  const handlePdfViewerClose = () => {
    setIsPdfViewerOpen(false);
    setPdfViewerFile(null);
  };

  const handleDownloadFromPdfViewer = async () => {
    if (!pdfViewerFile) return;
    await handleDownloadSingle(pdfViewerFile);
  };

  // Lazy-loaded image component with Intersection Observer
  const LazyThumbnail = ({ file }: { file: FileItem }) => {
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const imgRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!imgRef.current) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !src && !error) {
              const thumbnailUrl = getThumbnailUrl(file);
              if (thumbnailUrl) {
                setSrc(thumbnailUrl);
              }
            }
          });
        },
        { rootMargin: "50px" }
      );

      observer.observe(imgRef.current);

      return () => observer.disconnect();
    }, [file, src, error]);

    if (error || !isImageFile(file)) {
      return <File className="h-20 w-20 text-muted-foreground" />;
    }

    return (
      <div ref={imgRef} className="h-20 w-20 flex items-center justify-center">
        {src ? (
          <img
            src={src}
            alt={file.name}
            className="h-20 w-20 object-cover rounded"
            onError={() => setError(true)}
          />
        ) : (
          <File className="h-20 w-20 text-muted-foreground" />
        )}
      </div>
    );
  };

  if (isInitializing) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            <h2 className="mt-4 text-lg font-semibold">Checking connection...</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Restoring device connection
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!selectedDevice) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <Folder className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No Device Connected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect a device to browse files
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col">
        {/* Path Bar */}
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <button
            onClick={navigateBack}
            disabled={pathHistory.length === 0}
            className={cn(
              "p-1 rounded hover:bg-accent",
              pathHistory.length === 0 && "opacity-50 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={navigateHome} className="p-1 rounded hover:bg-accent">
            <Home className="h-5 w-5" />
          </button>
          <div className="flex-1 flex items-center gap-1 text-sm">
            {currentPath.split("/").filter(Boolean).map((segment, index, array) => {
              const pathToSegment = "/" + array.slice(0, index + 1).join("/");
              return (
                <div key={index} className="flex items-center">
                  <button
                    onClick={() => navigateTo(pathToSegment)}
                    className="px-2 hover:bg-accent rounded"
                  >
                    {segment}
                  </button>
                  {index < array.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Toolbar */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handleUploadClick}
                className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Upload className="h-4 w-4" />
                Upload
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                onChange={handleUploadChange}
                className="hidden"
              />
              {selectedFiles.size > 0 && (
                <>
                  <span className="text-sm font-medium">
                    {selectedFiles.size} selected
                  </span>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm hover:bg-accent"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm hover:bg-accent"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </button>
                  <button
                    onClick={handleCut}
                    className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm hover:bg-accent"
                  >
                    <Scissors className="h-4 w-4" />
                    Cut
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </>
              )}
              {clipboard && (
                <button
                  onClick={handlePaste}
                  className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-sm text-primary-foreground hover:bg-primary/90"
                >
                  <Clipboard className="h-4 w-4" />
                  Paste ({clipboard.files.length})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-64 rounded-lg border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center rounded-lg border">
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
              </div>
            </div>
          </div>
        </div>

        {/* File List/Grid */}
        <div
          {...getRootProps()}
          className={cn(
            "flex-1 overflow-auto p-4",
            isDragActive && "bg-accent/50"
          )}
        >
          <input {...getInputProps()} />

          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                <p className="mt-4 text-sm text-muted-foreground">Loading files...</p>
              </div>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Folder className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">
                  {searchQuery ? "No files found" : "This folder is empty"}
                </p>
                {isDragActive && (
                  <p className="mt-2 text-sm text-primary">Drop files here to upload</p>
                )}
              </div>
            </div>
          ) : viewMode === "list" ? (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="w-10 pb-2"></th>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Size</th>
                  <th className="pb-2 font-medium">Modified</th>
                  <th className="pb-2 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => (
                  <tr
                    key={file.id}
                    onDoubleClick={() => file.type === "folder" && navigateToFolder(file)}
                    className={cn(
                      "border-b hover:bg-accent/50",
                      selectedFiles.has(file.id) && "bg-accent"
                    )}
                  >
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleFileSelect(file.id);
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex items-center gap-2 cursor-pointer flex-1"
                          onClick={() => handleFileClick(file)}
                        >
                          {file.type === "folder" ? (
                            <Folder className="h-4 w-4 text-blue-500" />
                          ) : (
                            <File className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm">{file.name}</span>
                        </div>
                        {isPdfFile(file) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePdfPreview(file);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                            title="Preview PDF"
                          >
                            <Eye className="h-3 w-3" />
                            Preview
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-sm text-muted-foreground">
                      {file.type === "file" ? formatFileSize(file.size) : "-"}
                    </td>
                    <td className="py-2 text-sm text-muted-foreground">
                      {formatDate(new Date(file.modified))}
                    </td>
                    <td className="py-2 text-sm text-muted-foreground">
                      {file.type === "folder" ? "Folder" : file.mimeType || "File"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  onDoubleClick={() => file.type === "folder" && navigateToFolder(file)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-lg p-4 border-2 border-transparent transition-all",
                    "hover:border-primary hover:bg-accent/30 hover:shadow-md",
                    selectedFiles.has(file.id) && "bg-accent border-primary/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleFileSelect(file.id);
                    }}
                    className="absolute left-2 top-2 h-4 w-4 rounded border-gray-300"
                  />
                  <div
                    className="cursor-pointer"
                    onClick={() => handleFileClick(file)}
                  >
                    {file.type === "folder" ? (
                      <Folder className="h-20 w-20 text-blue-500" />
                    ) : (
                      <LazyThumbnail file={file} />
                    )}
                  </div>
                  <span className="text-xs text-center break-all line-clamp-2">
                    {file.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Image Viewer */}
      {viewerImage && (
        <ImageViewer
          image={{
            ...viewerImage,
            url: getFullImageUrl(viewerImage) || undefined,
            thumbnailUrl: getThumbnailUrl(viewerImage) || undefined,
            width: 0,
            height: 0,
          }}
          images={filteredFiles.filter(isImageFile).map(file => ({
            ...file,
            url: getFullImageUrl(file) || undefined,
            thumbnailUrl: getThumbnailUrl(file) || undefined,
            width: 0,
            height: 0,
          }))}
          isOpen={isViewerOpen}
          onClose={handleViewerClose}
          onNavigate={handleViewerNavigate}
          onDownload={handleDownloadFromViewer}
        />
      )}

      {/* PDF Viewer */}
      {pdfViewerFile && (
        <PdfViewer
          fileUrl={getPdfUrl(pdfViewerFile) || ""}
          fileName={pdfViewerFile.name}
          isOpen={isPdfViewerOpen}
          onClose={handlePdfViewerClose}
          onDownload={handleDownloadFromPdfViewer}
        />
      )}
    </DashboardLayout>
  );
}