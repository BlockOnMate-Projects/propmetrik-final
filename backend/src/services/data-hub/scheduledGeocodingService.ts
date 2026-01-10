/**
 * Scheduled Geocoding Service
 * 
 * Periodically checks for properties without coordinates and geocodes them.
 * This ensures all properties eventually get geocoded regardless of ingestion method.
 * 
 * The service runs as part of the queue worker and processes properties in batches.
 */

import { logger } from '../../utils/logger';
import { query, pool } from '../../database';
import { GeocodingService } from './geocodingService';

interface GeocodingStats {
  pending: number;
  processed: number;
  success: number;
  failed: number;
  skipped: number;
}

export class ScheduledGeocodingService {
  private geocodingService: GeocodingService;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.geocodingService = new GeocodingService();
  }

  /**
   * Start the scheduled geocoding service
   * @param intervalMinutes - How often to check for properties to geocode (default: 5 minutes)
   */
  start(intervalMinutes: number = 5): void {
    if (this.intervalId) {
      logger.warn('Scheduled geocoding service is already running');
      return;
    }

    logger.info('Starting scheduled geocoding service', { intervalMinutes });
    
    // Run immediately on start
    this.runGeocodingCycle().catch(err => {
      logger.error('Initial geocoding cycle failed', { error: err });
    });

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runGeocodingCycle().catch(err => {
        logger.error('Scheduled geocoding cycle failed', { error: err });
      });
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the scheduled geocoding service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Scheduled geocoding service stopped');
    }
  }

  /**
   * Run a single geocoding cycle
   */
  async runGeocodingCycle(batchSize: number = 50, delayMs: number = 100): Promise<GeocodingStats> {
    if (this.isRunning) {
      logger.debug('Geocoding cycle already in progress, skipping');
      return { pending: 0, processed: 0, success: 0, failed: 0, skipped: 0 };
    }

    this.isRunning = true;
    const stats: GeocodingStats = { pending: 0, processed: 0, success: 0, failed: 0, skipped: 0 };

    try {
      // Get count of properties needing geocoding
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM properties 
         WHERE latitude IS NULL AND address_street IS NOT NULL`
      );
      stats.pending = parseInt(countResult.rows[0]?.count || '0', 10);

      if (stats.pending === 0) {
        logger.debug('No properties need geocoding');
        return stats;
      }

      logger.info('Starting geocoding cycle', { pendingCount: stats.pending, batchSize });

      // Get batch of properties to geocode
      const properties = await query<{
        id: string;
        address_street: string | null;
        address_city: string | null;
        region: string | null;
        landmark: string | null;
        title: string | null;
      }>(
        `SELECT id, address_street, address_city, region, landmark, title
         FROM properties 
         WHERE latitude IS NULL AND address_street IS NOT NULL
         ORDER BY created_at DESC
         LIMIT $1`,
        [batchSize]
      );

      for (const property of properties.rows) {
        const address = this.buildAddressString(property);
        
        if (!address) {
          stats.skipped++;
          continue;
        }

        try {
          const result = await this.geocodingService.geocode(address);
          
          if (result && result.latitude && result.longitude) {
            await query(
              `UPDATE properties 
               SET latitude = $1::numeric(10,8), 
                   longitude = $2::numeric(11,8),
                   updated_at = NOW()
               WHERE id = $3::uuid`,
              [result.latitude, result.longitude, property.id]
            );
            stats.success++;
            logger.debug('Property geocoded', { 
              propertyId: property.id, 
              lat: result.latitude, 
              lng: result.longitude,
              confidence: result.confidence 
            });
          } else {
            stats.failed++;
            logger.debug('Geocoding returned no results', { propertyId: property.id, address });
          }
        } catch (error) {
          stats.failed++;
          logger.warn('Geocoding failed for property', { 
            propertyId: property.id, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }

        stats.processed++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      logger.info('Geocoding cycle completed', stats);
      return stats;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Build address string from property fields
   */
  private buildAddressString(property: {
    address_street: string | null;
    address_city: string | null;
    region: string | null;
    landmark: string | null;
    title: string | null;
  }): string | null {
    const parts: string[] = [];

    if (property.address_street) {
      parts.push(property.address_street);
    }

    if (property.landmark && property.landmark !== property.address_street) {
      parts.push(property.landmark);
    }

    if (property.address_city) {
      parts.push(property.address_city);
    }

    if (property.region) {
      const regionMap: Record<string, string> = {
        'greater_accra': 'Greater Accra',
        'ashanti': 'Ashanti',
        'kumasi_metro': 'Kumasi',
        'eastern': 'Eastern Region',
        'western': 'Western Region',
        'western_cluster': 'Western Region',
        'central': 'Central Region',
        'northern': 'Northern Region',
        'northern_cluster': 'Northern Region',
        'volta': 'Volta Region',
        'upper_east': 'Upper East Region',
        'upper_west': 'Upper West Region',
      };
      parts.push(regionMap[property.region] || property.region.replace(/_/g, ' '));
    }

    if (parts.length === 0 && property.title) {
      return property.title;
    }

    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Get current geocoding statistics
   */
  async getStats(): Promise<{
    total: number;
    withCoordinates: number;
    withoutCoordinates: number;
    percentageGeocoded: number;
  }> {
    const result = await query<{ total: string; with_coords: string }>(
      `SELECT 
         COUNT(*) as total,
         COUNT(latitude) as with_coords
       FROM properties`
    );

    const total = parseInt(result.rows[0]?.total || '0', 10);
    const withCoordinates = parseInt(result.rows[0]?.with_coords || '0', 10);

    return {
      total,
      withCoordinates,
      withoutCoordinates: total - withCoordinates,
      percentageGeocoded: total > 0 ? Math.round((withCoordinates / total) * 100 * 10) / 10 : 0,
    };
  }
}

// Export singleton instance
export const scheduledGeocodingService = new ScheduledGeocodingService();
