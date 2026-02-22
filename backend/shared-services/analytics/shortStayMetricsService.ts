/**
 * Short-Stay Metrics Service
 * 
 * Calculates AirDNA-style metrics for short-term rental market analysis:
 * - Occupancy Rate
 * - ADR (Average Daily Rate)
 * - RevPAR (Revenue Per Available Room)
 * - Market benchmarks by neighborhood
 * 
 * Data source: short_stay_listings + short_stay_availability tables
 */

import { query } from '../../src/database';
import { logger } from '../../src/utils/logger';
import { occupancyCalculator } from './occupancyCalculator';

interface ShortStayMetrics {
  neighborhood: string;
  city: string;
  platform: string;
  property_type: string;
  metric_month: string;
  total_listings: number;
  occupancy_rate: number;
  adr_usd: number;
  revpar_usd: number;
  median_price_usd: number;
  min_price_usd: number;
  max_price_usd: number;
}

interface NeighborhoodBenchmark {
  neighborhood: string;
  city: string;
  avg_occupancy_rate: number;
  avg_adr_usd: number;
  avg_revpar_usd: number;
  total_active_listings: number;
  data_freshness: string;
}

export class ShortStayMetricsService {
  /**
   * Get short-stay metrics for a specific neighborhood and time period
   */
  async getMetrics(params: {
    neighborhood?: string;
    city?: string;
    platform?: 'airbnb' | 'booking_com' | 'all';
    property_type?: 'entire_home' | 'private_room' | 'shared_room' | 'all';
    start_month?: string;
    end_month?: string;
    limit?: number;
  }): Promise<ShortStayMetrics[]> {
    const {
      neighborhood,
      city = 'Accra',
      platform = 'all',
      property_type = 'all',
      start_month,
      end_month,
      limit = 12, // Default to 12 months
    } = params;

    try {
      // Build WHERE clause
      const whereConditions: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (neighborhood) {
        whereConditions.push(`neighborhood = $${paramIndex++}`);
        queryParams.push(neighborhood);
      }

      if (city) {
        whereConditions.push(`city = $${paramIndex++}`);
        queryParams.push(city);
      }

      if (platform !== 'all') {
        whereConditions.push(`platform = $${paramIndex++}`);
        queryParams.push(platform);
      }

      if (property_type !== 'all') {
        whereConditions.push(`property_type = $${paramIndex++}`);
        queryParams.push(property_type);
      }

      if (start_month) {
        whereConditions.push(`metric_month >= $${paramIndex++}::date`);
        queryParams.push(start_month);
      }

      if (end_month) {
        whereConditions.push(`metric_month <= $${paramIndex++}::date`);
        queryParams.push(end_month);
      }

      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      queryParams.push(limit);

      const sql = `
        SELECT 
          neighborhood,
          city,
          platform,
          property_type,
          metric_month::text,
          total_listings,
          occupancy_rate,
          adr_usd,
          revpar_usd,
          median_price_usd,
          min_price_usd,
          max_price_usd
        FROM short_stay_metrics
        ${whereClause}
        ORDER BY metric_month DESC, neighborhood, platform
        LIMIT $${paramIndex}
      `;

      const result = await query<ShortStayMetrics>(sql, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get short-stay metrics', { error, params });
      throw error;
    }
  }

  /**
   * Get neighborhood benchmarks (current month averages)
   */
  async getNeighborhoodBenchmarks(city: string = 'Accra'): Promise<NeighborhoodBenchmark[]> {
    try {
      const sql = `
        WITH current_metrics AS (
          SELECT 
            neighborhood,
            city,
            AVG(occupancy_rate) as avg_occupancy_rate,
            AVG(adr_usd) as avg_adr_usd,
            AVG(revpar_usd) as avg_revpar_usd,
            MAX(metric_month) as latest_month
          FROM short_stay_metrics
          WHERE city = $1
            AND metric_month >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
          GROUP BY neighborhood, city
        ),
        active_listings AS (
          SELECT 
            neighborhood,
            COUNT(*) as total_active_listings
          FROM short_stay_listings
          WHERE city = $1 AND is_active = TRUE
          GROUP BY neighborhood
        )
        SELECT 
          cm.neighborhood,
          cm.city,
          ROUND(cm.avg_occupancy_rate, 2) as avg_occupancy_rate,
          ROUND(cm.avg_adr_usd, 2) as avg_adr_usd,
          ROUND(cm.avg_revpar_usd, 2) as avg_revpar_usd,
          COALESCE(al.total_active_listings, 0) as total_active_listings,
          cm.latest_month::text as data_freshness
        FROM current_metrics cm
        LEFT JOIN active_listings al ON cm.neighborhood = al.neighborhood
        ORDER BY cm.avg_revpar_usd DESC
      `;

      const result = await query<NeighborhoodBenchmark>(sql, [city]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get neighborhood benchmarks', { error, city });
      throw error;
    }
  }

  /**
    * Calculate and refresh occupancy metrics
    * 
    * This is called after new availability data is scraped.
    * Refreshes the materialized view.
    */
  /**
    * Calculate and refresh occupancy metrics
    * 
    * This is called after new availability data is scraped.
    * Aggregates daily snapshots and refreshes the materialized view.
    */
  async refreshMetrics(neighborhood?: string): Promise<void> {
    try {
      logger.info('Refreshing short-stay metrics...');

      // 1. Fetch relevant availability snapshots to log verification
      // In a real production system, this step would compute derived tables
      // For now, we rely on the SQL materialized view logic, but we log validation

      const sql = `
        SELECT 
            l.neighborhood,
            date_trunc('month', s.check_date) as month,
            count(*) as total_days,
            count(*) filter (where s.is_available = false) as booked_days,
            avg(s.price_per_night_usd) filter (where s.is_available = false) as avg_adr
        FROM short_stay_availability s
        JOIN short_stay_listings l ON s.listing_id = l.id
        ${neighborhood ? 'WHERE l.neighborhood = $1' : ''}
        GROUP BY 1, 2
      `;

      const result = await query(sql, neighborhood ? [neighborhood] : []);

      // Log calculated metrics for verification
      for (const row of result.rows) {
        const occupancy = row.total_days > 0 ? (row.booked_days / row.total_days) * 100 : 0;
        const revpar = (row.avg_adr * occupancy) / 100;

        logger.info(`Metric Verification for ${row.neighborhood} (${row.month}): Occ=${occupancy.toFixed(1)}%, ADR=$${Number(row.avg_adr).toFixed(0)}, RevPAR=$${revpar.toFixed(0)}`);
      }

      await query('REFRESH MATERIALIZED VIEW short_stay_metrics');
      logger.info('Short-stay metrics view refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh short-stay metrics', { error });
      throw error;
    }
  }

  /**
   * Get occupancy trends for a neighborhood over time
   */
  async getOccupancyTrends(params: {
    neighborhood: string;
    months?: number;
  }): Promise<Array<{ month: string; occupancy_rate: number; adr_usd: number }>> {
    const { neighborhood, months = 12 } = params;

    try {
      const sql = `
        SELECT 
          metric_month::text as month,
          ROUND(AVG(occupancy_rate), 2) as occupancy_rate,
          ROUND(AVG(adr_usd), 2) as adr_usd
        FROM short_stay_metrics
        WHERE neighborhood = $1
          AND metric_month >= DATE_TRUNC('month', NOW() - INTERVAL '${months} months')
        GROUP BY metric_month
        ORDER BY metric_month ASC
      `;

      const result = await query(sql, [neighborhood]);
      return result.rows as Array<{ month: string; occupancy_rate: number; adr_usd: number }>;
    } catch (error) {
      logger.error('Failed to get occupancy trends', { error, params });
      throw error;
    }
  }

  /**
   * Get competitive set analysis
   * Compare a specific listing against neighborhood averages
   */
  async getCompetitiveSetAnalysis(params: {
    listing_id: string;
    platform: string;
  }): Promise<{
    listing: any;
    neighborhood_avg_occupancy: number;
    neighborhood_avg_adr: number;
    listing_vs_market_occupancy: number;
    listing_vs_market_adr: number;
  } | null> {
    const { listing_id, platform } = params;

    try {
      // Get listing details
      const listingResult = await query(
        `SELECT * FROM short_stay_listings WHERE external_id = $1 AND platform = $2`,
        [listing_id, platform]
      );

      if (listingResult.rows.length === 0) {
        return null;
      }

      const listing = listingResult.rows[0];

      // Calculate listing's occupancy and ADR (last 30 days)
      const listingMetricsResult = await query(
        `
        SELECT 
          COUNT(*) FILTER (WHERE is_available = FALSE) as booked_nights,
          COUNT(*) as total_nights,
          AVG(price_per_night_usd) FILTER (WHERE is_available = FALSE) as avg_adr
        FROM short_stay_availability
        WHERE listing_id = $1
          AND check_date >= NOW() - INTERVAL '30 days'
        `,
        [listing.id]
      );

      const listingMetrics = listingMetricsResult.rows[0];
      const listingOccupancy = listingMetrics.total_nights > 0
        ? (listingMetrics.booked_nights / listingMetrics.total_nights) * 100
        : 0;
      const listingADR = parseFloat(listingMetrics.avg_adr || '0');

      // Get neighborhood averages
      const neighborhoodResult = await query(
        `
        SELECT 
          AVG(occupancy_rate) as avg_occupancy,
          AVG(adr_usd) as avg_adr
        FROM short_stay_metrics
        WHERE neighborhood = $1
          AND metric_month = DATE_TRUNC('month', NOW())
        `,
        [listing.neighborhood]
      );

      const neighborhoodAvg = neighborhoodResult.rows[0] || { avg_occupancy: 0, avg_adr: 0 };

      return {
        listing,
        neighborhood_avg_occupancy: parseFloat(neighborhoodAvg.avg_occupancy || '0'),
        neighborhood_avg_adr: parseFloat(neighborhoodAvg.avg_adr || '0'),
        listing_vs_market_occupancy: listingOccupancy - parseFloat(neighborhoodAvg.avg_occupancy || '0'),
        listing_vs_market_adr: listingADR - parseFloat(neighborhoodAvg.avg_adr || '0'),
      };
    } catch (error) {
      logger.error('Failed to get competitive set analysis', { error, params });
      throw error;
    }
  }

  /**
   * Get investment opportunity score
   * Identifies neighborhoods with high RevPAR and low competition
   */
  async getInvestmentOpportunities(city: string = 'Accra'): Promise<Array<{
    neighborhood: string;
    avg_revpar_usd: number;
    active_listings: number;
    opportunity_score: number;
  }>> {
    try {
      const sql = `
        WITH neighborhood_stats AS (
          SELECT 
            neighborhood,
            AVG(revpar_usd) as avg_revpar,
            COUNT(DISTINCT platform || '-' || external_id) as active_listings
          FROM short_stay_metrics m
          INNER JOIN short_stay_listings l ON m.neighborhood = l.neighborhood
          WHERE m.city = $1
            AND m.metric_month >= DATE_TRUNC('month', NOW() - INTERVAL '3 months')
            AND l.is_active = TRUE
          GROUP BY neighborhood
        )
        SELECT 
          neighborhood,
          ROUND(avg_revpar, 2) as avg_revpar_usd,
          active_listings::int,
          -- High RevPAR + Low competition = High opportunity
          ROUND(
            (avg_revpar / NULLIF((SELECT MAX(avg_revpar) FROM neighborhood_stats), 0) * 50) +
            ((1 - (active_listings::float / NULLIF((SELECT MAX(active_listings) FROM neighborhood_stats), 0))) * 50),
            2
          ) as opportunity_score
        FROM neighborhood_stats
        WHERE avg_revpar > 0
        ORDER BY opportunity_score DESC
      `;

      const result = await query(sql, [city]);
      return result.rows as Array<{
        neighborhood: string;
        avg_revpar_usd: number;
        active_listings: number;
        opportunity_score: number;
      }>;
    } catch (error) {
      logger.error('Failed to get investment opportunities', { error, city });
      throw error;
    }
  }
}

export const shortStayMetricsService = new ShortStayMetricsService();
