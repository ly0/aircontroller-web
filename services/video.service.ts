/**
 * Video Service - HTTP-based service for fetching videos
 * This replaces the WebSocket-based approach for more reliable communication
 */

import { VideoItem } from '@/types';
import { getWebSocketUrl } from '@/lib/ws-url';

class VideoService {
  /**
   * Get the base URL dynamically
   */
  private async getBaseUrl(): Promise<string> {
    if (process.env.NEXT_PUBLIC_WS_URL) {
      return process.env.NEXT_PUBLIC_WS_URL;
    }
    return await getWebSocketUrl();
  }

  /**
   * Get videos from the server (which will proxy to device if connected)
   */
  async getVideos(page?: number, pageSize?: number): Promise<VideoItem[]> {
    try {
      const baseUrl = await this.getBaseUrl();
      const params = new URLSearchParams();
      if (page !== undefined) {
        params.append('page', String(page));
      }
      if (pageSize !== undefined) {
        params.append('pageSize', String(pageSize));
      }

      const url = `${baseUrl}/api/videos${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch videos: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching videos:', error);
      throw error;
    }
  }

  /**
   * Download video files (single or multiple)
   * If multiple videos are provided, they will be downloaded as a ZIP file
   */
  async downloadVideos(videoPaths: string[], deviceIp: string): Promise<void> {
    try {
      // Prepare the paths parameter (JSON encoded array)
      const pathsJson = JSON.stringify(videoPaths);
      const pathsParam = encodeURIComponent(pathsJson);

      // Construct download URL using the same /stream/download API as images
      const downloadUrl = `http://${deviceIp}:9527/stream/download?paths=${pathsParam}`;

      // Create a temporary anchor element to trigger download
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.style.display = 'none';

      // Set download filename
      if (videoPaths.length === 1) {
        // Single file - use the original filename
        const fileName = videoPaths[0].split('/').pop() || 'video';
        anchor.download = fileName;
      } else {
        // Multiple files - will be a ZIP
        const timestamp = Date.now();
        anchor.download = `videos_${timestamp}.zip`;
      }

      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (error) {
      console.error('Error downloading videos:', error);
      throw error;
    }
  }

  /**
   * Download a single video file
   */
  async downloadVideo(videoPath: string, deviceIp: string): Promise<void> {
    return this.downloadVideos([videoPath], deviceIp);
  }

  /**
   * Delete a video file
   * Note: This still uses WebSocket service for file operations
   */
  async deleteVideo(videoPath: string): Promise<void> {
    // This would be implemented to delete via HTTP
    // For now, we'll keep using the WebSocket service for deletions
    const { wsService } = await import('./websocket-native.service');
    return wsService.deleteFile(videoPath);
  }
}

// Export singleton instance
export const videoService = new VideoService();
