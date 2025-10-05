/**
 * Image Service - HTTP-based service for fetching images and albums
 * This replaces the WebSocket-based approach for more reliable communication
 */

import { ImageItem, Album } from '@/types';
import { getWebSocketUrl } from '@/lib/ws-url';

class ImageService {
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
   * Get images from the server (which will proxy to device if connected)
   */
  async getImages(albumId?: string, page?: number, pageSize?: number): Promise<ImageItem[]> {
    try {
      const baseUrl = await this.getBaseUrl();
      const params = new URLSearchParams();
      if (albumId) {
        params.append('albumId', albumId);
      }
      if (page !== undefined) {
        params.append('page', String(page));
      }
      if (pageSize !== undefined) {
        params.append('pageSize', String(pageSize));
      }

      const url = `${baseUrl}/api/images${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch images: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching images:', error);
      throw error;
    }
  }

  /**
   * Get albums from the server (which will proxy to device if connected)
   */
  async getAlbums(): Promise<Album[]> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/api/albums`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch albums: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching albums:', error);
      throw error;
    }
  }

  /**
   * Download image files (single or multiple)
   * If multiple images are provided, they will be downloaded as a ZIP file
   */
  async downloadImages(imagePaths: string[], deviceIp: string): Promise<void> {
    try {
      // Prepare the paths parameter (JSON encoded array)
      const pathsJson = JSON.stringify(imagePaths);
      const pathsParam = encodeURIComponent(pathsJson);

      // Construct download URL
      const downloadUrl = `http://${deviceIp}:9527/stream/download?paths=${pathsParam}`;

      // Create a temporary anchor element to trigger download
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.style.display = 'none';

      // Set download filename
      if (imagePaths.length === 1) {
        // Single file - use the original filename
        const fileName = imagePaths[0].split('/').pop() || 'image';
        anchor.download = fileName;
      } else {
        // Multiple files - will be a ZIP
        const timestamp = Date.now();
        anchor.download = `images_${timestamp}.zip`;
      }

      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (error) {
      console.error('Error downloading images:', error);
      throw error;
    }
  }

  /**
   * Download a single image file
   */
  async downloadImage(imagePath: string, deviceIp: string): Promise<void> {
    return this.downloadImages([imagePath], deviceIp);
  }

  /**
   * Delete an image file
   * Note: This still uses WebSocket service for file operations
   */
  async deleteImage(imagePath: string): Promise<void> {
    // This would be implemented to delete via HTTP
    // For now, we'll keep using the WebSocket service for deletions
    const { wsService } = await import('./websocket-native.service');
    return wsService.deleteFile(imagePath);
  }
}

// Export singleton instance
export const imageService = new ImageService();