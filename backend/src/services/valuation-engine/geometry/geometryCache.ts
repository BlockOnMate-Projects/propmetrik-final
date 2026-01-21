/**
 * Geometry Caching Service
 * 
 * Redis-based caching for Blender-generated geometry to reduce regeneration latency.
 * Implements cache key hashing, TTL management, and hit/miss statistics.
 * 
 * @module services/geometry/geometryCache
 * @version 1.0.0
 * @since Phase 5 - Week 14
 */

import { createHash } from 'crypto';
import { logger } from '../../../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface BlenderGeometryResult {
  version: string;
  geometry_hash: string;
  generated_at: string;
  measurements: {
    gfa_sqm: number;
    nia_sqm: number;
    efficiency_ratio: number;
    wall_area_sqm: number;
    external_perimeter_m: number;
  };
  walls: any[];
  rooms: any[];
  floors: any[];
  openings: any[];
  fabric_projection: any;
  validation: any;
  processing_time_ms: number;
  blender_version: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hit_rate: number;
  cached_items: number;
  memory_usage_bytes: number;
  last_reset: string;
}

export interface CacheEntry {
  geometry: BlenderGeometryResult;
  cached_at: string;
  design_intent_hash: string;
  ttl_seconds: number;
  access_count: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const GEOMETRY_CACHE_TTL = 3600; // 1 hour default
const CACHE_PREFIX = 'geometry:';
const STATS_KEY = 'geometry:cache:stats';
const MAX_CACHE_SIZE_MB = 500; // Maximum cache size in MB

// ============================================================================
// REDIS CLIENT INTERFACE
// ============================================================================

interface RedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  del(key: string): Promise<void>;
  hincrby(key: string, field: string, increment: number): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  keys(pattern: string): Promise<string[]>;
  ttl(key: string): Promise<number>;
  info(section: string): Promise<string>;
}

// ============================================================================
// GEOMETRY CACHE SERVICE
// ============================================================================

export class GeometryCacheService {
  private redis: RedisClient;
  private ttlSeconds: number;

  constructor(redisClient: RedisClient, ttlSeconds: number = GEOMETRY_CACHE_TTL) {
    this.redis = redisClient;
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Generate a hash from design intent for cache key
   */
  hashDesignIntent(designIntent: any): string {
    const normalized = JSON.stringify(designIntent, Object.keys(designIntent).sort());
    return createHash('sha256').update(normalized).digest('hex').substring(0, 32);
  }

  /**
   * Get cached geometry if available
   */
  async getCachedGeometry(designIntentHash: string): Promise<BlenderGeometryResult | null> {
    try {
      const cacheKey = `${CACHE_PREFIX}${designIntentHash}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        await this.redis.hincrby(STATS_KEY, 'hits', 1);

        const entry: CacheEntry = JSON.parse(cached);

        logger.debug('Geometry cache hit', {
          hash: designIntentHash,
          cached_at: entry.cached_at,
          access_count: entry.access_count + 1,
        });

        // Update access count (fire and forget)
        entry.access_count += 1;
        this.redis.setex(cacheKey, this.ttlSeconds, JSON.stringify(entry)).catch(() => { });

        return entry.geometry;
      }

      await this.redis.hincrby(STATS_KEY, 'misses', 1);
      logger.debug('Geometry cache miss', { hash: designIntentHash });

      return null;
    } catch (error) {
      logger.error('Error getting cached geometry', { error, hash: designIntentHash });
      return null;
    }
  }

  /**
   * Cache geometry result
   */
  async cacheGeometry(
    designIntentHash: string,
    geometry: BlenderGeometryResult,
    customTtl?: number
  ): Promise<void> {
    try {
      const cacheKey = `${CACHE_PREFIX}${designIntentHash}`;
      const ttl = customTtl || this.ttlSeconds;

      const entry: CacheEntry = {
        geometry,
        cached_at: new Date().toISOString(),
        design_intent_hash: designIntentHash,
        ttl_seconds: ttl,
        access_count: 0,
      };

      await this.redis.setex(cacheKey, ttl, JSON.stringify(entry));

      logger.debug('Geometry cached', {
        hash: designIntentHash,
        ttl_seconds: ttl,
        geometry_hash: geometry.geometry_hash,
      });
    } catch (error) {
      logger.error('Error caching geometry', { error, hash: designIntentHash });
    }
  }

  /**
   * Invalidate cached geometry
   */
  async invalidate(designIntentHash: string): Promise<void> {
    try {
      const cacheKey = `${CACHE_PREFIX}${designIntentHash}`;
      await this.redis.del(cacheKey);

      logger.debug('Geometry cache invalidated', { hash: designIntentHash });
    } catch (error) {
      logger.error('Error invalidating cache', { error, hash: designIntentHash });
    }
  }

  /**
   * Invalidate all cached geometry for a valuation
   * (Useful when design intent changes significantly)
   */
  async invalidateForValuation(valuationId: string): Promise<number> {
    try {
      const pattern = `${CACHE_PREFIX}valuation:${valuationId}:*`;
      const keys = await this.redis.keys(pattern);

      for (const key of keys) {
        await this.redis.del(key);
      }

      logger.info('Invalidated geometry cache for valuation', {
        valuationId,
        keys_deleted: keys.length,
      });

      return keys.length;
    } catch (error) {
      logger.error('Error invalidating valuation cache', { error, valuationId });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const stats = await this.redis.hgetall(STATS_KEY);
      const hits = parseInt(stats?.hits || '0', 10);
      const misses = parseInt(stats?.misses || '0', 10);
      const total = hits + misses;

      // Count cached items
      const keys = await this.redis.keys(`${CACHE_PREFIX}*`);
      const cachedItems = keys.filter(k => !k.includes(':stats')).length;

      // Get memory usage (approximate)
      let memoryUsage = 0;
      try {
        const info = await this.redis.info('memory');
        const match = info.match(/used_memory:(\d+)/);
        if (match) {
          memoryUsage = parseInt(match[1], 10);
        }
      } catch {
        // Memory info not available
      }

      return {
        hits,
        misses,
        hit_rate: total > 0 ? hits / total : 0,
        cached_items: cachedItems,
        memory_usage_bytes: memoryUsage,
        last_reset: stats?.last_reset || 'never',
      };
    } catch (error) {
      logger.error('Error getting cache stats', { error });
      return {
        hits: 0,
        misses: 0,
        hit_rate: 0,
        cached_items: 0,
        memory_usage_bytes: 0,
        last_reset: 'error',
      };
    }
  }

  /**
   * Reset cache statistics
   */
  async resetStats(): Promise<void> {
    try {
      await this.redis.del(STATS_KEY);
      await this.redis.hincrby(STATS_KEY, 'hits', 0);
      await this.redis.hincrby(STATS_KEY, 'misses', 0);

      logger.info('Cache statistics reset');
    } catch (error) {
      logger.error('Error resetting cache stats', { error });
    }
  }

  /**
   * Warm cache with pre-computed geometry
   * (Useful for frequently accessed valuations)
   */
  async warmCache(
    entries: Array<{ designIntent: any; geometry: BlenderGeometryResult }>
  ): Promise<number> {
    let warmed = 0;

    for (const entry of entries) {
      const hash = this.hashDesignIntent(entry.designIntent);
      await this.cacheGeometry(hash, entry.geometry);
      warmed++;
    }

    logger.info('Cache warmed', { entries_warmed: warmed });
    return warmed;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let cacheInstance: GeometryCacheService | null = null;

export function getGeometryCacheService(redisClient?: RedisClient): GeometryCacheService {
  if (!cacheInstance && redisClient) {
    cacheInstance = new GeometryCacheService(redisClient);
  }

  if (!cacheInstance) {
    throw new Error('GeometryCacheService not initialized. Provide Redis client.');
  }

  return cacheInstance;
}

export function initGeometryCacheService(redisClient: RedisClient, ttlSeconds?: number): GeometryCacheService {
  cacheInstance = new GeometryCacheService(redisClient, ttlSeconds);
  return cacheInstance;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate cache key for valuation-specific geometry
 */
export function getValuationCacheKey(valuationId: string, version: number): string {
  return `valuation:${valuationId}:v${version}`;
}

/**
 * Check if geometry should be cached (size limits)
 */
export function shouldCache(geometry: BlenderGeometryResult): boolean {
  const serialized = JSON.stringify(geometry);
  const sizeBytes = Buffer.byteLength(serialized, 'utf8');
  const sizeMB = sizeBytes / (1024 * 1024);

  // Don't cache if single entry is too large (> 10MB)
  if (sizeMB > 10) {
    logger.warn('Geometry too large to cache', { sizeMB });
    return false;
  }

  return true;
}
