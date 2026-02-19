/**
 * Geocoding Service
 * Address standardization and geocoding using Mapbox/Google Maps APIs
 */

import crypto from 'crypto';
import { query } from '../../database';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { GeocodingResult, GeocodingCacheEntry, RegionCode } from './types';

// Ghana's bounding box for validation
const GHANA_BOUNDS = {
  minLat: 4.5,
  maxLat: 11.5,
  minLng: -3.5,
  maxLng: 1.5,
};

// Region center points for fallback and validation
const REGION_CENTERS: Record<RegionCode, { lat: number; lng: number }> = {
  greater_accra: { lat: 5.6037, lng: -0.1870 },
  kumasi_metro: { lat: 6.6884, lng: -1.6244 },
  eastern: { lat: 6.1500, lng: -0.5000 },
  western_cluster: { lat: 5.0500, lng: -1.7500 },
  northern_cluster: { lat: 9.4000, lng: -0.8500 },
};

export class GeocodingService {
  private mapboxToken: string | undefined;
  private googleApiKey: string | undefined;

  constructor() {
    this.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    this.googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  }

  /**
   * Hash an address for cache lookup
   */
  private hashAddress(address: string): string {
    const normalized = this.normalizeAddress(address);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Normalize an address for consistent processing
   */
  normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s,.-]/g, '')
      .replace(/\b(st|street|rd|road|ave|avenue|dr|drive|ln|lane|blvd|boulevard)\b/gi, (match) => {
        const abbrev: Record<string, string> = {
          st: 'street', street: 'street',
          rd: 'road', road: 'road',
          ave: 'avenue', avenue: 'avenue',
          dr: 'drive', drive: 'drive',
          ln: 'lane', lane: 'lane',
          blvd: 'boulevard', boulevard: 'boulevard',
        };
        return abbrev[match.toLowerCase()] || match;
      })
      .trim();
  }

  /**
   * Check if coordinates are within Ghana
   */
  isWithinGhana(lat: number, lng: number): boolean {
    return (
      lat >= GHANA_BOUNDS.minLat &&
      lat <= GHANA_BOUNDS.maxLat &&
      lng >= GHANA_BOUNDS.minLng &&
      lng <= GHANA_BOUNDS.maxLng
    );
  }

  /**
   * Determine region from coordinates
   */
  getRegionFromCoordinates(lat: number, lng: number): RegionCode | null {
    // Simple region detection based on coordinates
    // In production, use PostGIS with actual region boundaries
    
    if (!this.isWithinGhana(lat, lng)) {
      return null;
    }

    // Greater Accra region (approximate bounds)
    if (lat >= 5.4 && lat <= 6.0 && lng >= -0.5 && lng <= 0.3) {
      return 'greater_accra';
    }

    // Kumasi/Ashanti (approximate bounds)
    if (lat >= 6.0 && lat <= 7.5 && lng >= -2.5 && lng <= -0.5) {
      return 'kumasi_metro';
    }

    // Eastern region
    if (lat >= 5.5 && lat <= 7.0 && lng >= -1.0 && lng <= 0.5) {
      return 'eastern';
    }

    // Western cluster (Western, Central, Western North)
    if (lat >= 4.5 && lat <= 7.0 && lng >= -3.5 && lng <= -1.5) {
      return 'western_cluster';
    }

    // Northern cluster (everything else north)
    if (lat >= 7.0) {
      return 'northern_cluster';
    }

    return null;
  }

  /**
   * Check cache for existing geocoding result
   */
  async checkCache(address: string): Promise<GeocodingCacheEntry | null> {
    const hash = this.hashAddress(address);
    
    const result = await query<GeocodingCacheEntry>(
      `SELECT * FROM geocoding_cache 
       WHERE address_hash = $1 
         AND is_valid = true
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [hash]
    );

    if (result.rows[0]) {
      // Update hit count
      await query(
        `UPDATE geocoding_cache 
         SET hit_count = hit_count + 1, last_used_at = NOW()
         WHERE id = $1`,
        [result.rows[0].id]
      );
      return result.rows[0];
    }

    return null;
  }

  /**
   * Store geocoding result in cache
   */
  async cacheResult(
    address: string,
    result: GeocodingResult,
    rawResponse?: Record<string, unknown>
  ): Promise<void> {
    const hash = this.hashAddress(address);
    const normalized = this.normalizeAddress(address);

    // Set expiry based on confidence (higher confidence = longer cache)
    const expiryDays = result.confidence >= 0.9 ? 365 : result.confidence >= 0.7 ? 90 : 30;

    await query(
      `INSERT INTO geocoding_cache (
        address_input, address_normalized, address_hash,
        latitude, longitude, location,
        street_address, neighborhood, district, region, postal_code, country,
        confidence, match_type, provider, provider_place_id,
        raw_response, expires_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, ST_SetSRID(ST_MakePoint($5, $4), 4326),
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, NOW() + INTERVAL '1 day' * $17
      )
      ON CONFLICT (address_hash) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        location = EXCLUDED.location,
        confidence = EXCLUDED.confidence,
        raw_response = EXCLUDED.raw_response,
        updated_at = NOW(),
        expires_at = EXCLUDED.expires_at,
        is_valid = true`,
      [
        address, normalized, hash,
        result.latitude, result.longitude,
        result.street_address, result.neighborhood, result.district, result.region,
        result.postal_code, result.country,
        result.confidence, result.match_type, result.provider, result.provider_place_id,
        rawResponse ? JSON.stringify(rawResponse) : null, expiryDays,
      ]
    );
  }

  /**
   * Geocode an address using Mapbox
   */
  async geocodeWithMapbox(address: string): Promise<GeocodingResult | null> {
    if (!this.mapboxToken) {
      logger.warn('Mapbox token not configured');
      return null;
    }

    try {
      const encodedAddress = encodeURIComponent(`${address}, Ghana`);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${this.mapboxToken}&country=GH&limit=1`;

      const response = await fetch(url);
      
      if (!response.ok) {
        logger.error('Mapbox API error', { status: response.status });
        return null;
      }

      const data = await response.json() as {
        features?: Array<{
          id: string;
          center: [number, number];
          place_name?: string;
          relevance?: number;
          accuracy?: string;
          context?: Array<{ id: string; text: string }>;
        }>;
      };
      
      if (!data.features || data.features.length === 0) {
        return null;
      }

      const feature = data.features[0];
      const [lng, lat] = feature.center;

      if (!this.isWithinGhana(lat, lng)) {
        logger.warn('Geocoding result outside Ghana', { address, lat, lng });
        return null;
      }

      // Extract address components from context
      const context = feature.context || [];
      const getContext = (type: string) => 
        context.find((c: { id: string; text: string }) => c.id.startsWith(type))?.text || null;

      const result: GeocodingResult = {
        latitude: lat,
        longitude: lng,
        street_address: feature.place_name?.split(',')[0] || null,
        neighborhood: getContext('neighborhood') || getContext('locality'),
        district: getContext('district') || getContext('place'),
        region: getContext('region'),
        postal_code: getContext('postcode'),
        country: 'Ghana',
        confidence: feature.relevance || 0.5,
        match_type: this.mapMatchType(feature.accuracy),
        provider: 'mapbox',
        provider_place_id: feature.id,
      };

      // Cache the result
      try {
        await this.cacheResult(address, result, data as Record<string, unknown>);
      } catch (cacheError) {
        logger.warn('Geocode cache write failed (result still returned)', { 
          error: cacheError instanceof Error ? cacheError.message : String(cacheError),
          address,
        });
      }

      return result;
    } catch (error) {
      logger.error('Mapbox geocoding failed', { error: error instanceof Error ? error.message : String(error), address });
      return null;
    }
  }

  /**
   * Geocode an address using Google Maps
   */
  async geocodeWithGoogle(address: string): Promise<GeocodingResult | null> {
    if (!this.googleApiKey) {
      logger.warn('Google Maps API key not configured');
      return null;
    }

    try {
      const encodedAddress = encodeURIComponent(`${address}, Ghana`);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${this.googleApiKey}&region=gh`;

      const response = await fetch(url);
      
      if (!response.ok) {
        logger.error('Google Maps API error', { status: response.status });
        return null;
      }

      const data = await response.json() as {
        status: string;
        results?: Array<{
          place_id: string;
          geometry: {
            location: { lat: number; lng: number };
            location_type?: string;
          };
          address_components?: Array<{
            types: string[];
            long_name: string;
          }>;
        }>;
      };
      
      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        return null;
      }

      const result = data.results[0];
      const { lat, lng } = result.geometry.location;

      if (!this.isWithinGhana(lat, lng)) {
        logger.warn('Geocoding result outside Ghana', { address, lat, lng });
        return null;
      }

      // Extract address components
      const getComponent = (type: string) =>
        result.address_components?.find((c: { types: string[]; long_name: string }) => 
          c.types.includes(type)
        )?.long_name || null;

      const geocodingResult: GeocodingResult = {
        latitude: lat,
        longitude: lng,
        street_address: getComponent('route'),
        neighborhood: getComponent('neighborhood') || getComponent('sublocality'),
        district: getComponent('administrative_area_level_2'),
        region: getComponent('administrative_area_level_1'),
        postal_code: getComponent('postal_code'),
        country: 'Ghana',
        confidence: this.googleConfidence(result.geometry.location_type),
        match_type: this.googleMatchType(result.geometry.location_type),
        provider: 'google',
        provider_place_id: result.place_id,
      };

      // Cache the result
      try {
        await this.cacheResult(address, geocodingResult, data as Record<string, unknown>);
      } catch (cacheError) {
        logger.warn('Geocode cache write failed (result still returned)', {
          error: cacheError instanceof Error ? cacheError.message : String(cacheError),
          address,
        });
      }

      return geocodingResult;
    } catch (error) {
      logger.error('Google geocoding failed', { error: error instanceof Error ? error.message : String(error), address });
      return null;
    }
  }

  /**
   * Main geocoding method - tries cache, then providers in order
   */
  async geocode(address: string): Promise<GeocodingResult | null> {
    // Check cache first
    const cached = await this.checkCache(address);
    if (cached) {
      logger.debug('Geocoding cache hit', { address });
      return {
        latitude: cached.latitude!,
        longitude: cached.longitude!,
        street_address: cached.street_address,
        neighborhood: cached.neighborhood,
        district: cached.district,
        region: cached.region,
        postal_code: cached.postal_code,
        country: cached.country,
        confidence: cached.confidence!,
        match_type: cached.match_type as GeocodingResult['match_type'],
        provider: cached.provider as GeocodingResult['provider'],
        provider_place_id: cached.provider_place_id,
      };
    }

    // Try Mapbox first (usually better for African addresses)
    let result = await this.geocodeWithMapbox(address);
    
    // Fall back to Google if Mapbox fails
    if (!result) {
      result = await this.geocodeWithGoogle(address);
    }

    if (result) {
      logger.info('Geocoded address', { 
        address, 
        provider: result.provider,
        confidence: result.confidence 
      });
    } else {
      logger.warn('Failed to geocode address', { address });
    }

    return result;
  }

  /**
   * Batch geocode multiple addresses
   */
  async geocodeBatch(addresses: string[]): Promise<Map<string, GeocodingResult | null>> {
    const results = new Map<string, GeocodingResult | null>();

    for (const address of addresses) {
      const result = await this.geocode(address);
      results.set(address, result);
      
      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
    if (!this.isWithinGhana(lat, lng)) {
      return null;
    }

    // Check cache for nearby coordinates
    const cached = await query<GeocodingCacheEntry>(
      `SELECT * FROM geocoding_cache 
       WHERE ST_DWithin(
         location, 
         ST_SetSRID(ST_MakePoint($2, $1), 4326),
         0.0005  -- ~50 meters
       )
       AND is_valid = true
       ORDER BY ST_Distance(location, ST_SetSRID(ST_MakePoint($2, $1), 4326))
       LIMIT 1`,
      [lat, lng]
    );

    if (cached.rows[0]) {
      return {
        latitude: lat,
        longitude: lng,
        street_address: cached.rows[0].street_address,
        neighborhood: cached.rows[0].neighborhood,
        district: cached.rows[0].district,
        region: cached.rows[0].region,
        postal_code: cached.rows[0].postal_code,
        country: 'Ghana',
        confidence: 0.8,
        match_type: 'approximate',
        provider: cached.rows[0].provider as GeocodingResult['provider'],
        provider_place_id: null,
      };
    }

    // Try Mapbox reverse geocoding
    if (this.mapboxToken) {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${this.mapboxToken}&limit=1`;
        const response = await fetch(url);
        const data = await response.json() as {
          features?: Array<{
            id: string;
            text?: string;
            relevance?: number;
            context?: Array<{ id: string; text: string }>;
          }>;
        };

        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const context = feature.context || [];
          const getContext = (type: string) => 
            context.find((c: { id: string; text: string }) => c.id.startsWith(type))?.text || null;

          return {
            latitude: lat,
            longitude: lng,
            street_address: feature.text || null,
            neighborhood: getContext('neighborhood') || getContext('locality'),
            district: getContext('district') || getContext('place'),
            region: getContext('region'),
            postal_code: getContext('postcode'),
            country: 'Ghana',
            confidence: feature.relevance || 0.7,
            match_type: 'exact',
            provider: 'mapbox',
            provider_place_id: feature.id,
          };
        }
      } catch (error) {
        logger.error('Reverse geocoding failed', { error, lat, lng });
      }
    }

    return null;
  }

  /**
   * Map Mapbox accuracy to match type
   */
  private mapMatchType(accuracy?: string): GeocodingResult['match_type'] {
    switch (accuracy) {
      case 'rooftop': return 'exact';
      case 'parcel': return 'exact';
      case 'point': return 'exact';
      case 'interpolation': return 'interpolated';
      case 'intersection': return 'interpolated';
      default: return 'approximate';
    }
  }

  /**
   * Map Google location type to match type
   */
  private googleMatchType(locationType?: string): GeocodingResult['match_type'] {
    switch (locationType) {
      case 'ROOFTOP': return 'exact';
      case 'RANGE_INTERPOLATED': return 'interpolated';
      case 'GEOMETRIC_CENTER': return 'centroid';
      default: return 'approximate';
    }
  }

  /**
   * Convert Google location type to confidence score
   */
  private googleConfidence(locationType?: string): number {
    switch (locationType) {
      case 'ROOFTOP': return 0.95;
      case 'RANGE_INTERPOLATED': return 0.8;
      case 'GEOMETRIC_CENTER': return 0.6;
      default: return 0.4;
    }
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanupCache(): Promise<number> {
    const result = await query(
      `DELETE FROM geocoding_cache WHERE expires_at < NOW()`
    );
    const deleted = result.rowCount || 0;
    if (deleted > 0) {
      logger.info('Cleaned up expired geocoding cache entries', { deleted });
    }
    return deleted;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    total_entries: number;
    total_hits: number;
    by_provider: Record<string, number>;
    avg_confidence: number;
  }> {
    const result = await query<{
      total_entries: string;
      total_hits: string;
      avg_confidence: string;
    }>(
      `SELECT 
         COUNT(*) as total_entries,
         SUM(hit_count) as total_hits,
         AVG(confidence) as avg_confidence
       FROM geocoding_cache
       WHERE is_valid = true`
    );

    const byProviderResult = await query<{ provider: string; count: string }>(
      `SELECT provider, COUNT(*) as count 
       FROM geocoding_cache 
       WHERE is_valid = true 
       GROUP BY provider`
    );

    const row = result.rows[0];
    return {
      total_entries: parseInt(row.total_entries, 10),
      total_hits: parseInt(row.total_hits || '0', 10),
      by_provider: byProviderResult.rows.reduce((acc, r) => {
        acc[r.provider] = parseInt(r.count, 10);
        return acc;
      }, {} as Record<string, number>),
      avg_confidence: parseFloat(row.avg_confidence || '0'),
    };
  }
}

export const geocodingService = new GeocodingService();
