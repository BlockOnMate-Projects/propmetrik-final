/**
 * Image Processing Service
 * 
 * Handles image compression, thumbnail generation, and optimization
 * for report photos.
 * 
 * Phase 3: Photo Upload & Management
 */

import sharp from 'sharp';
import { logger } from '../../utils/logger';
import { uploadFile, getPresignedDownloadUrl } from '../../database/minio';

// =====================================================
// CONFIGURATION
// =====================================================

const MINIO_PHOTOS_BUCKET = process.env.MINIO_PHOTOS_BUCKET || 'propmetrik-report-photos';

const IMAGE_CONFIG = {
  thumbnail: {
    width: 300,
    height: 200,
    fit: 'cover' as const,
  },
  medium: {
    width: 800,
    height: 600,
    fit: 'inside' as const,
  },
  full: {
    maxWidth: 2000,
    maxHeight: 1500,
    quality: 85,
  },
  compression: {
    jpeg: { quality: 85, mozjpeg: true },
    png: { compressionLevel: 9, palette: true },
    webp: { quality: 85 },
  },
};

// =====================================================
// TYPES
// =====================================================

export interface ProcessedImage {
  original: {
    buffer: Buffer;
    storageKey: string;
    url?: string;
    width: number;
    height: number;
    size: number;
    format: string;
  };
  thumbnail: {
    buffer: Buffer;
    storageKey: string;
    url?: string;
    width: number;
    height: number;
    size: number;
  };
  medium?: {
    buffer: Buffer;
    storageKey: string;
    url?: string;
    width: number;
    height: number;
    size: number;
  };
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
  orientation?: number;
}

// =====================================================
// SERVICE
// =====================================================

class ImageProcessingService {
  /**
   * Process an uploaded image: optimize, generate thumbnail, and upload to storage
   */
  async processImage(
    buffer: Buffer,
    reportId: string,
    photoId: string,
    filename: string
  ): Promise<ProcessedImage> {
    logger.info('Processing image', { reportId, photoId, filename, size: buffer.length });

    try {
      // Get original image metadata
      const metadata = await this.getMetadata(buffer);

      // Determine output format
      const outputFormat = this.getOutputFormat(metadata.format);

      // Process original (optimize and resize if too large)
      const originalResult = await this.optimizeOriginal(buffer, outputFormat);

      // Generate thumbnail
      const thumbnailResult = await this.generateThumbnail(buffer, outputFormat);

      // Generate medium size for preview
      const mediumResult = await this.generateMedium(buffer, outputFormat);

      // Upload all versions to storage
      const basePath = `reports/${reportId}/photos/${photoId}`;
      const ext = outputFormat === 'jpeg' ? 'jpg' : outputFormat;

      // Upload original
      const originalKey = `${basePath}/original.${ext}`;
      await uploadFile(MINIO_PHOTOS_BUCKET, originalKey, originalResult.buffer, `image/${outputFormat}`);

      // Upload thumbnail
      const thumbnailKey = `${basePath}/thumbnail.${ext}`;
      await uploadFile(MINIO_PHOTOS_BUCKET, thumbnailKey, thumbnailResult.buffer, `image/${outputFormat}`);

      // Upload medium
      const mediumKey = `${basePath}/medium.${ext}`;
      await uploadFile(MINIO_PHOTOS_BUCKET, mediumKey, mediumResult.buffer, `image/${outputFormat}`);

      logger.info('Image processing complete', {
        reportId,
        photoId,
        originalSize: buffer.length,
        optimizedSize: originalResult.buffer.length,
        thumbnailSize: thumbnailResult.buffer.length,
        compressionRatio: ((1 - originalResult.buffer.length / buffer.length) * 100).toFixed(1) + '%',
      });

      return {
        original: {
          buffer: originalResult.buffer,
          storageKey: originalKey,
          width: originalResult.width,
          height: originalResult.height,
          size: originalResult.buffer.length,
          format: outputFormat,
        },
        thumbnail: {
          buffer: thumbnailResult.buffer,
          storageKey: thumbnailKey,
          width: thumbnailResult.width,
          height: thumbnailResult.height,
          size: thumbnailResult.buffer.length,
        },
        medium: {
          buffer: mediumResult.buffer,
          storageKey: mediumKey,
          width: mediumResult.width,
          height: mediumResult.height,
          size: mediumResult.buffer.length,
        },
      };
    } catch (error: any) {
      logger.error('Image processing failed', {
        reportId,
        photoId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get image metadata
   */
  async getMetadata(buffer: Buffer): Promise<ImageMetadata> {
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      size: buffer.length,
      hasAlpha: metadata.hasAlpha || false,
      orientation: metadata.orientation,
    };
  }

  /**
   * Optimize original image
   */
  private async optimizeOriginal(
    buffer: Buffer,
    outputFormat: 'jpeg' | 'png' | 'webp'
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    let pipeline = sharp(buffer)
      .rotate() // Auto-rotate based on EXIF
      .resize(IMAGE_CONFIG.full.maxWidth, IMAGE_CONFIG.full.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });

    // Apply format-specific compression
    switch (outputFormat) {
      case 'jpeg':
        pipeline = pipeline.jpeg(IMAGE_CONFIG.compression.jpeg);
        break;
      case 'png':
        pipeline = pipeline.png(IMAGE_CONFIG.compression.png);
        break;
      case 'webp':
        pipeline = pipeline.webp(IMAGE_CONFIG.compression.webp);
        break;
    }

    const result = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  }

  /**
   * Generate thumbnail image
   */
  private async generateThumbnail(
    buffer: Buffer,
    outputFormat: 'jpeg' | 'png' | 'webp'
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    let pipeline = sharp(buffer)
      .rotate()
      .resize(IMAGE_CONFIG.thumbnail.width, IMAGE_CONFIG.thumbnail.height, {
        fit: IMAGE_CONFIG.thumbnail.fit,
        position: 'center',
      });

    // Always use JPEG for thumbnails (smaller size)
    pipeline = pipeline.jpeg({ quality: 80 });

    const result = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  }

  /**
   * Generate medium-sized image for preview
   */
  private async generateMedium(
    buffer: Buffer,
    outputFormat: 'jpeg' | 'png' | 'webp'
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    let pipeline = sharp(buffer)
      .rotate()
      .resize(IMAGE_CONFIG.medium.width, IMAGE_CONFIG.medium.height, {
        fit: IMAGE_CONFIG.medium.fit,
        withoutEnlargement: true,
      });

    switch (outputFormat) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: 85 });
        break;
      case 'png':
        pipeline = pipeline.png({ compressionLevel: 8 });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality: 85 });
        break;
    }

    const result = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  }

  /**
   * Determine best output format
   */
  private getOutputFormat(inputFormat: string): 'jpeg' | 'png' | 'webp' {
    switch (inputFormat.toLowerCase()) {
      case 'png':
        return 'png';
      case 'webp':
        return 'webp';
      default:
        return 'jpeg';
    }
  }

  /**
   * Get signed URLs for all image versions
   */
  async getImageUrls(
    storageKey: string,
    expiresIn: number = 3600
  ): Promise<{ original: string; thumbnail: string; medium: string }> {
    const basePath = storageKey.replace(/\/[^/]+$/, '');
    const ext = storageKey.split('.').pop() || 'jpg';

    const [originalUrl, thumbnailUrl, mediumUrl] = await Promise.all([
      getPresignedDownloadUrl(MINIO_PHOTOS_BUCKET, `${basePath}/original.${ext}`, expiresIn),
      getPresignedDownloadUrl(MINIO_PHOTOS_BUCKET, `${basePath}/thumbnail.${ext}`, expiresIn),
      getPresignedDownloadUrl(MINIO_PHOTOS_BUCKET, `${basePath}/medium.${ext}`, expiresIn),
    ]);

    return {
      original: originalUrl,
      thumbnail: thumbnailUrl,
      medium: mediumUrl,
    };
  }

  /**
   * Validate image file
   */
  async validateImage(buffer: Buffer, maxSizeMB: number = 10): Promise<{ valid: boolean; error?: string }> {
    // Check file size
    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      return { valid: false, error: `Image size (${sizeMB.toFixed(1)}MB) exceeds maximum (${maxSizeMB}MB)` };
    }

    // Check if it's a valid image
    try {
      const metadata = await sharp(buffer).metadata();
      
      const allowedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff'];
      if (!metadata.format || !allowedFormats.includes(metadata.format)) {
        return { valid: false, error: `Invalid image format: ${metadata.format}` };
      }

      // Check minimum dimensions
      if ((metadata.width || 0) < 100 || (metadata.height || 0) < 100) {
        return { valid: false, error: 'Image too small. Minimum 100x100 pixels required.' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid or corrupted image file' };
    }
  }

  /**
   * Extract EXIF data from image
   */
  async extractExif(buffer: Buffer): Promise<Record<string, any>> {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        space: metadata.space,
        channels: metadata.channels,
        depth: metadata.depth,
        density: metadata.density,
        hasProfile: metadata.hasProfile,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
        exif: metadata.exif ? 'present' : 'none',
      };
    } catch (error) {
      return {};
    }
  }
}

// Export singleton instance
export const imageProcessingService = new ImageProcessingService();
