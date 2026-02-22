/**
 * Short-Stay Metrics Service
 * 
 * AirDNA-style analytics for short-term rental market.
 * Computes occupancy, ADR, RevPAR metrics from short_stay_listings + short_stay_availability tables.
 * 
 * @module services/analytics/shortStayMetricsService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

interface MetricsQuery {
  neighborhood?: string;
  city: string;
  platform: string;
  property_type: string;
  start_month?: string;
  end_month?: string;
  limit: number;
}

interface TrendsQuery {
  neighborhood: string;
  months: number;
}

interface CompetitiveQuery {
  listing_id: string;
  platform: string;
}

class ShortStayMetricsService {
  /**
   * Get short-stay rental metrics (occupancy, ADR, RevPAR)
   * Computed from short_stay_listings + short_stay_availability
   */
  async getMetrics(query: MetricsQuery) {
    const { neighborhood, city, platform, limit } = query;

    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (city) {
        conditions.push(`l.city = $${idx++}`);
        params.push(city);
      }
      if (neighborhood) {
        conditions.push(`l.neighborhood = $${idx++}`);
        params.push(neighborhood);
      }
      if (platform && platform !== 'all') {
        conditions.push(`l.platform = $${idx++}`);
        params.push(platform);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const sql = `
        SELECT 
          COALESCE(l.neighborhood, l.city, 'Unknown') as neighborhood,
          DATE_TRUNC('month', a.check_date)::date::text as month,
          l.platform,
          COUNT(DISTINCT l.id)::int as listing_count,
          ROUND(AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END)::numeric, 2) as avg_occupancy_rate,
          ROUND(AVG(COALESCE(a.price_per_night_usd, 0))::numeric, 2) as avg_daily_rate,
          ROUND((AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) * AVG(COALESCE(a.price_per_night_usd, 0)))::numeric, 2) as avg_revpar,
          ROUND(MIN(COALESCE(a.price_per_night_usd, 0))::numeric, 2) as min_price_usd,
          ROUND(MAX(COALESCE(a.price_per_night_usd, 0))::numeric, 2) as max_price_usd,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(a.price_per_night_usd, 0))::numeric, 2) as median_price_usd
        FROM short_stay_listings l
        JOIN short_stay_availability a ON a.listing_id = l.id
        ${whereClause}
        GROUP BY COALESCE(l.neighborhood, l.city, 'Unknown'), DATE_TRUNC('month', a.check_date), l.platform
        ORDER BY month DESC
        LIMIT $${idx}
      `;
      params.push(limit || 24);

      const result = await pool.query(sql, params);
      return result.rows;
    } catch (err: any) {
      logger.error('Failed to get short-stay metrics', { error: err.message });
      return [];
    }
  }

  /**
   * Get neighborhood benchmarks — aggregated from availability data
   */
  async getNeighborhoodBenchmarks(city: string) {
    try {
      const result = await pool.query(
        `SELECT 
          COALESCE(l.neighborhood, l.city, 'Unknown') as neighborhood,
          ROUND(AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END)::numeric, 4) as avg_occupancy_rate,
          ROUND(AVG(COALESCE(a.price_per_night_usd, 0))::numeric, 2) as avg_daily_rate,
          ROUND((AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) * AVG(COALESCE(a.price_per_night_usd, 0)))::numeric, 2) as avg_revpar,
          COUNT(DISTINCT l.id)::int as listing_count
        FROM short_stay_listings l
        JOIN short_stay_availability a ON a.listing_id = l.id
        WHERE l.city = $1 OR $1 IS NULL
        GROUP BY COALESCE(l.neighborhood, l.city, 'Unknown')
        ORDER BY avg_revpar DESC`,
        [city]
      );
      return result.rows;
    } catch (err: any) {
      logger.error('Failed to get neighborhood benchmarks', { error: err.message });
      return [];
    }
  }

  /**
   * Get occupancy trends for a specific neighborhood
   */
  async getOccupancyTrends(query: TrendsQuery) {
    try {
      const result = await pool.query(
        `SELECT 
          DATE_TRUNC('month', a.check_date)::date::text as month,
          ROUND(AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END)::numeric, 4) as avg_occupancy_rate,
          ROUND(AVG(COALESCE(a.price_per_night_usd, 0))::numeric, 2) as avg_daily_rate,
          ROUND((AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) * AVG(COALESCE(a.price_per_night_usd, 0)))::numeric, 2) as avg_revpar,
          COUNT(DISTINCT l.id)::int as listing_count
        FROM short_stay_listings l
        JOIN short_stay_availability a ON a.listing_id = l.id
        WHERE l.neighborhood = $1
        GROUP BY DATE_TRUNC('month', a.check_date)
        ORDER BY month DESC
        LIMIT $2`,
        [query.neighborhood, query.months]
      );
      return result.rows;
    } catch (err: any) {
      logger.error('Failed to get occupancy trends', { error: err.message });
      return [];
    }
  }

  /**
   * Compare a listing against neighborhood averages
   */
  async getCompetitiveSetAnalysis(query: CompetitiveQuery) {
    try {
      const result = await pool.query(
        `WITH listing AS (
          SELECT l.*, 
            ROUND(AVG(COALESCE(a.price_per_night_usd, 0))::numeric, 2) as avg_price,
            ROUND(AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END)::numeric, 4) as occupancy_rate
          FROM short_stay_listings l
          LEFT JOIN short_stay_availability a ON a.listing_id = l.id
          WHERE l.platform = $1 AND l.external_id = $2
          GROUP BY l.id
        ),
        neighborhood_avg AS (
          SELECT 
            ROUND(AVG(COALESCE(a.price_per_night_usd, 0))::numeric, 2) as neighborhood_avg_adr,
            ROUND(AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END)::numeric, 4) as neighborhood_avg_occupancy,
            ROUND((AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) * AVG(COALESCE(a.price_per_night_usd, 0)))::numeric, 2) as neighborhood_avg_revpar
          FROM short_stay_listings l2
          JOIN short_stay_availability a ON a.listing_id = l2.id
          WHERE l2.neighborhood = (SELECT neighborhood FROM listing LIMIT 1)
        )
        SELECT listing.*, neighborhood_avg.*
        FROM listing, neighborhood_avg`,
        [query.platform, query.listing_id]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err: any) {
      logger.error('Failed to get competitive set analysis', { error: err.message });
      return null;
    }
  }

  /**
   * Get neighborhoods with high investment potential
   */
  async getInvestmentOpportunities(city: string) {
    try {
      const result = await pool.query(
        `SELECT 
          COALESCE(l.neighborhood, l.city, 'Unknown') as neighborhood,
          ROUND(AVG(COALESCE(a.price_per_night_usd, 0))::numeric, 2) as avg_daily_rate,
          ROUND(AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END)::numeric, 4) as avg_occupancy_rate,
          ROUND((AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) * AVG(COALESCE(a.price_per_night_usd, 0)))::numeric, 2) as avg_revpar,
          COUNT(DISTINCT l.id)::int as listing_count,
          CASE 
            WHEN (AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) * AVG(COALESCE(a.price_per_night_usd, 0))) > 100 
              AND AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) > 0.7 THEN 'High'
            WHEN (AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) * AVG(COALESCE(a.price_per_night_usd, 0))) > 60 
              AND AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) > 0.5 THEN 'Medium'
            ELSE 'Low'
          END AS investment_grade
        FROM short_stay_listings l
        JOIN short_stay_availability a ON a.listing_id = l.id
        WHERE l.city = $1 OR $1 IS NULL
        GROUP BY COALESCE(l.neighborhood, l.city, 'Unknown')
        ORDER BY avg_revpar DESC`,
        [city]
      );
      return result.rows;
    } catch (err: any) {
      logger.error('Failed to get investment opportunities', { error: err.message });
      return [];
    }
  }

  /**
   * Refresh short-stay metrics (no-op — we compute live from raw tables)
   */
  async refreshMetrics() {
    logger.info('Short-stay metrics computed live from raw tables; no materialized view to refresh');
  }
}

export const shortStayMetricsService = new ShortStayMetricsService();
