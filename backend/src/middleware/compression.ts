/**
 * API Response Compression Middleware
 * 
 * Provides gzip and brotli compression for API responses to reduce bandwidth.
 * Targets 70% size reduction for JSON responses.
 * 
 * @module middleware/compression
 * @version 1.0.0
 * @since Phase 5 - Week 14
 */

import { Request, Response, NextFunction } from 'express';
import { createGzip, createBrotliCompress, constants } from 'zlib';
import { Transform } from 'stream';
import { logger } from '../utils/logger';

// ============================================================================
// CONFIGURATION
// ============================================================================

const COMPRESSION_CONFIG = {
  // Minimum response size to compress (bytes)
  threshold: 1024, // 1KB
  
  // Compression levels
  gzip: {
    level: 6, // 1-9, higher = more compression
  },
  
  brotli: {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 4, // 0-11, 4 is good balance
    },
  },
  
  // Content types to compress
  compressibleTypes: [
    'application/json',
    'text/plain',
    'text/html',
    'text/css',
    'application/javascript',
    'image/svg+xml',
  ],
  
  // Paths to exclude from compression
  excludePaths: [
    '/health',
    '/api/v1/upload', // Binary uploads
    '/api/v1/download', // Already compressed files
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if content type is compressible
 */
function isCompressible(contentType: string | undefined): boolean {
  if (!contentType) return false;
  
  return COMPRESSION_CONFIG.compressibleTypes.some(type => 
    contentType.toLowerCase().includes(type.toLowerCase())
  );
}

/**
 * Check if path should be excluded
 */
function isExcludedPath(path: string): boolean {
  return COMPRESSION_CONFIG.excludePaths.some(excluded => 
    path.startsWith(excluded)
  );
}

/**
 * Get preferred compression based on Accept-Encoding header
 */
function getPreferredCompression(acceptEncoding: string | undefined): 'br' | 'gzip' | null {
  if (!acceptEncoding) return null;
  
  // Prefer Brotli if supported
  if (acceptEncoding.includes('br')) {
    return 'br';
  }
  
  if (acceptEncoding.includes('gzip')) {
    return 'gzip';
  }
  
  return null;
}

// ============================================================================
// COMPRESSION MIDDLEWARE
// ============================================================================

/**
 * Express middleware for response compression
 */
export function compressionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip excluded paths
  if (isExcludedPath(req.path)) {
    return next();
  }
  
  // Check for Accept-Encoding header
  const acceptEncoding = req.headers['accept-encoding'] as string | undefined;
  const compression = getPreferredCompression(acceptEncoding);
  
  if (!compression) {
    return next();
  }
  
  // Store original methods
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const originalJson = res.json.bind(res);
  
  let compressionStream: Transform | null = null;
  let shouldCompress = false;
  let responseData: Buffer[] = [];
  
  // Override res.json for automatic compression
  res.json = function(data: any) {
    const json = JSON.stringify(data);
    const buffer = Buffer.from(json, 'utf8');
    
    // Check threshold
    if (buffer.length < COMPRESSION_CONFIG.threshold) {
      res.setHeader('Content-Type', 'application/json');
      return originalEnd(json);
    }
    
    shouldCompress = true;
    
    // Create compression stream
    if (compression === 'br') {
      compressionStream = createBrotliCompress(COMPRESSION_CONFIG.brotli);
      res.setHeader('Content-Encoding', 'br');
    } else {
      compressionStream = createGzip({ level: COMPRESSION_CONFIG.gzip.level });
      res.setHeader('Content-Encoding', 'gzip');
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.removeHeader('Content-Length'); // Length changes after compression
    res.setHeader('Vary', 'Accept-Encoding');
    
    // Collect compressed chunks
    const chunks: Buffer[] = [];
    
    compressionStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    compressionStream.on('end', () => {
      const compressed = Buffer.concat(chunks);
      
      // Log compression stats
      const originalSize = buffer.length;
      const compressedSize = compressed.length;
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
      
      logger.debug('Response compressed', {
        path: req.path,
        encoding: compression,
        original_size: originalSize,
        compressed_size: compressedSize,
        compression_ratio: `${ratio}%`,
      });
      
      res.setHeader('Content-Length', compressed.length);
      res.setHeader('X-Compression-Ratio', ratio);
      originalEnd(compressed);
    });
    
    compressionStream.on('error', (error) => {
      logger.error('Compression error', { error, path: req.path });
      // Fall back to uncompressed
      res.removeHeader('Content-Encoding');
      res.setHeader('Content-Length', buffer.length);
      originalEnd(json);
    });
    
    // Write data to compression stream
    compressionStream.end(buffer);
    
    return res;
  };
  
  next();
}

// ============================================================================
// STATISTICS TRACKING
// ============================================================================

interface CompressionStats {
  requests_compressed: number;
  requests_skipped: number;
  total_original_bytes: number;
  total_compressed_bytes: number;
  average_compression_ratio: number;
  encoding_breakdown: {
    gzip: number;
    brotli: number;
    none: number;
  };
}

let compressionStats: CompressionStats = {
  requests_compressed: 0,
  requests_skipped: 0,
  total_original_bytes: 0,
  total_compressed_bytes: 0,
  average_compression_ratio: 0,
  encoding_breakdown: {
    gzip: 0,
    brotli: 0,
    none: 0,
  },
};

export function getCompressionStats(): CompressionStats {
  return { ...compressionStats };
}

export function resetCompressionStats(): void {
  compressionStats = {
    requests_compressed: 0,
    requests_skipped: 0,
    total_original_bytes: 0,
    total_compressed_bytes: 0,
    average_compression_ratio: 0,
    encoding_breakdown: {
      gzip: 0,
      brotli: 0,
      none: 0,
    },
  };
}

// ============================================================================
// GEOMETRY-SPECIFIC COMPRESSION
// ============================================================================

/**
 * Compress geometry response with optimized settings
 * (Geometry JSON is highly compressible due to repetitive structure)
 */
export async function compressGeometryResponse(
  geometry: any,
  encoding: 'gzip' | 'br' = 'gzip'
): Promise<{ data: Buffer; ratio: number }> {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(geometry);
    const buffer = Buffer.from(json, 'utf8');
    const originalSize = buffer.length;
    
    const chunks: Buffer[] = [];
    let stream: Transform;
    
    if (encoding === 'br') {
      stream = createBrotliCompress({
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 6, // Higher quality for geometry
        },
      });
    } else {
      stream = createGzip({ level: 7 }); // Higher level for geometry
    }
    
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => {
      const compressed = Buffer.concat(chunks);
      const ratio = (1 - compressed.length / originalSize) * 100;
      resolve({ data: compressed, ratio });
    });
    stream.on('error', reject);
    
    stream.end(buffer);
  });
}

// ============================================================================
// EXPRESS APP INTEGRATION
// ============================================================================

/**
 * Apply compression middleware to Express app
 * 
 * Usage:
 *   import { applyCompression } from './middleware/compression';
 *   applyCompression(app);
 */
export function applyCompression(app: any): void {
  // Use compression middleware for all routes
  app.use(compressionMiddleware);
  
  logger.info('Compression middleware enabled', {
    threshold: COMPRESSION_CONFIG.threshold,
    supported_encodings: ['gzip', 'br'],
  });
}

export default compressionMiddleware;
