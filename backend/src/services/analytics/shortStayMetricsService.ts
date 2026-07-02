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
import { gssGlss7Service, type TourismDemandType } from '../data-hub/scrapers/gssGlss7Service';
import { gssMiegService } from '../data-hub/scrapers/gssMiegService';

/**
 * Ghana city → GLSS7 region key. GLSS7 predates the 2019 region split, so cities
 * map to the old 10-region keys the tourism table is stored under. Factual
 * geography, not an assumption.
 */
const CITY_TO_GLSS7_REGION: Record<string, string> = {
  accra: 'greater_accra', tema: 'greater_accra', 'greater accra': 'greater_accra',
  kumasi: 'ashanti', obuasi: 'ashanti', ashanti: 'ashanti',
  takoradi: 'western', 'sekondi-takoradi': 'western', sekondi: 'western', western: 'western',
  'cape coast': 'central', 'cape-coast': 'central', central: 'central',
  ho: 'volta', volta: 'volta',
  koforidua: 'eastern', eastern: 'eastern',
  sunyani: 'brong_ahafo', techiman: 'brong_ahafo', 'brong ahafo': 'brong_ahafo',
  tamale: 'northern', northern: 'northern',
  bolgatanga: 'upper_east', 'upper east': 'upper_east',
  wa: 'upper_west', 'upper west': 'upper_west',
};

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

      // ADR/RevPAR average only PRICED nights (price > 0). Availability rows without a
      // scraped rate are calendar placeholders, not $0 nights — including them as zeros
      // wrongly crushes ADR. Occupancy uses all rows (booked ÷ total). Neighborhood is
      // INITCAP-normalised so "Osu"/"osu" collapse into one group.
      const sql = `
        SELECT
          INITCAP(COALESCE(l.neighborhood, l.city, 'Unknown')) as neighborhood,
          DATE_TRUNC('month', a.check_date)::date::text as month,
          l.platform,
          COUNT(DISTINCT l.id)::int as listing_count,
          ROUND(AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END)::numeric, 2) as avg_occupancy_rate,
          ROUND(AVG(a.price_per_night_usd) FILTER (WHERE a.price_per_night_usd > 0)::numeric, 2) as avg_daily_rate,
          ROUND((AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) * COALESCE(AVG(a.price_per_night_usd) FILTER (WHERE a.price_per_night_usd > 0), 0))::numeric, 2) as avg_revpar,
          ROUND(MIN(a.price_per_night_usd) FILTER (WHERE a.price_per_night_usd > 0)::numeric, 2) as min_price_usd,
          ROUND(MAX(a.price_per_night_usd) FILTER (WHERE a.price_per_night_usd > 0)::numeric, 2) as max_price_usd,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY a.price_per_night_usd) FILTER (WHERE a.price_per_night_usd > 0)::numeric, 2) as median_price_usd,
          COUNT(*) FILTER (WHERE a.price_per_night_usd > 0)::int as priced_night_count
        FROM short_stay_listings l
        JOIN short_stay_availability a ON a.listing_id = l.id
        ${whereClause}
        GROUP BY INITCAP(COALESCE(l.neighborhood, l.city, 'Unknown')), DATE_TRUNC('month', a.check_date), l.platform
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
          INITCAP(COALESCE(l.neighborhood, l.city, 'Unknown')) as neighborhood,
          ROUND(AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END)::numeric, 4) as avg_occupancy_rate,
          ROUND(AVG(a.price_per_night_usd) FILTER (WHERE a.price_per_night_usd > 0)::numeric, 2) as avg_daily_rate,
          ROUND((AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) * COALESCE(AVG(a.price_per_night_usd) FILTER (WHERE a.price_per_night_usd > 0), 0))::numeric, 2) as avg_revpar,
          COUNT(DISTINCT l.id)::int as listing_count
        FROM short_stay_listings l
        JOIN short_stay_availability a ON a.listing_id = l.id
        WHERE l.city = $1 OR $1 IS NULL
        GROUP BY INITCAP(COALESCE(l.neighborhood, l.city, 'Unknown'))
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
          ROUND(AVG(a.price_per_night_usd) FILTER (WHERE a.price_per_night_usd > 0)::numeric, 2) as avg_daily_rate,
          ROUND((AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) * COALESCE(AVG(a.price_per_night_usd) FILTER (WHERE a.price_per_night_usd > 0), 0))::numeric, 2) as avg_revpar,
          COUNT(DISTINCT l.id)::int as listing_count
        FROM short_stay_listings l
        JOIN short_stay_availability a ON a.listing_id = l.id
        WHERE INITCAP(l.neighborhood) = INITCAP($1)
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
        `WITH agg AS (
          SELECT
            INITCAP(COALESCE(l.neighborhood, l.city, 'Unknown')) as neighborhood,
            AVG(a.price_per_night_usd) FILTER (WHERE a.price_per_night_usd > 0) as adr,
            AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END) as occ,
            COUNT(DISTINCT l.id)::int as listing_count
          FROM short_stay_listings l
          JOIN short_stay_availability a ON a.listing_id = l.id
          WHERE l.city = $1 OR $1 IS NULL
          GROUP BY INITCAP(COALESCE(l.neighborhood, l.city, 'Unknown'))
        )
        SELECT
          neighborhood,
          ROUND(COALESCE(adr, 0)::numeric, 2) as avg_daily_rate,
          ROUND(occ::numeric, 4) as avg_occupancy_rate,
          ROUND((occ * COALESCE(adr, 0))::numeric, 2) as avg_revpar,
          listing_count,
          CASE
            WHEN (occ * COALESCE(adr, 0)) > 100 AND occ > 0.7 THEN 'High'
            WHEN (occ * COALESCE(adr, 0)) > 60  AND occ > 0.5 THEN 'Medium'
            ELSE 'Low'
          END AS investment_grade
        FROM agg
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
   * Tourism-demand context for a city (Slice 4). Maps the city to its GLSS7
   * region and returns the demand-type classification (business/leisure/mixed)
   * from real GLSS7 domestic-tourism data, plus the latest MIEG Services YoY as
   * macro context and — only when there are enough overlapping monthly points —
   * a REAL Pearson correlation between the city's monthly RevPAR and Services
   * MIEG. Returns nulls (not a fabricated coefficient) when data is thin.
   */
  async getTourismContext(city: string): Promise<{
    region: string | null;
    tourism_demand_type: TourismDemandType | null;
    domestic_overnight_visitors: number | null;
    visitor_share_pct: number | null;
    mieg_services_yoy: number | null;
    revpar_mieg_correlation: number | null;
    correlation_months: number;
  }> {
    const empty = {
      region: null, tourism_demand_type: null, domestic_overnight_visitors: null,
      visitor_share_pct: null, mieg_services_yoy: null, revpar_mieg_correlation: null,
      correlation_months: 0,
    };
    try {
      const region = city ? (CITY_TO_GLSS7_REGION[city.trim().toLowerCase()] ?? null) : null;

      const [tourismByRegion, miegLatest] = await Promise.all([
        gssGlss7Service.getTourismByRegion(),
        gssMiegService.getLatestMieg(),
      ]);

      const tourism = region ? tourismByRegion[region] ?? null : null;

      // Latest Services MIEG YoY — find the Services variable key case-insensitively
      // (stored label form may vary, e.g. 'Services_MIEG').
      const servicesKey = Object.keys(miegLatest).find((k) => /service/i.test(k));
      const miegServicesYoy = servicesKey ? miegLatest[servicesKey]?.growth_yoy_pct ?? null : null;

      // Real RevPAR ↔ Services-MIEG correlation (only with ≥6 overlapping months).
      const { r, n } = await this.computeRevparMiegCorrelation(city);

      return {
        region,
        tourism_demand_type: tourism?.tourism_demand_type ?? null,
        domestic_overnight_visitors: tourism?.domestic_overnight_visitors ?? null,
        visitor_share_pct: tourism?.visitor_share_pct ?? null,
        mieg_services_yoy: miegServicesYoy,
        revpar_mieg_correlation: r,
        correlation_months: n,
      };
    } catch (err: any) {
      logger.warn('Failed to get tourism context', { error: err.message });
      return empty;
    }
  }

  /**
   * Pearson correlation between a city's monthly RevPAR and the monthly Services
   * MIEG YoY over overlapping months. Returns { r: null, n } when fewer than 6
   * overlapping months exist — we never fabricate a coefficient from thin data.
   */
  private async computeRevparMiegCorrelation(city: string): Promise<{ r: number | null; n: number }> {
    try {
      const res = await pool.query<{ revpar: string; services_yoy: string }>(
        `WITH revpar AS (
           SELECT DATE_TRUNC('month', a.check_date)::date AS month,
                  AVG(CASE WHEN a.is_available = false THEN 1.0 ELSE 0.0 END)
                    * AVG(COALESCE(a.price_per_night_usd, 0)) AS revpar
           FROM short_stay_listings l
           JOIN short_stay_availability a ON a.listing_id = l.id
           WHERE ($1::text IS NULL OR l.city = $1)
           GROUP BY 1
         ),
         mieg AS (
           SELECT period_date::date AS month, growth_yoy_pct AS services_yoy
           FROM gss_mieg_monthly
           WHERE variable ILIKE '%service%' AND growth_yoy_pct IS NOT NULL
         )
         SELECT r.revpar::text AS revpar, m.services_yoy::text AS services_yoy
         FROM revpar r
         JOIN mieg m ON m.month = r.month
         WHERE r.revpar IS NOT NULL`,
        [city || null],
      );
      const pairs = res.rows
        .map((row) => ({ x: parseFloat(row.revpar), y: parseFloat(row.services_yoy) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      const n = pairs.length;
      if (n < 6) return { r: null, n };

      const mean = (vals: number[]) => vals.reduce((s, v) => s + v, 0) / vals.length;
      const mx = mean(pairs.map((p) => p.x));
      const my = mean(pairs.map((p) => p.y));
      let cov = 0, vx = 0, vy = 0;
      for (const p of pairs) {
        const dx = p.x - mx, dy = p.y - my;
        cov += dx * dy; vx += dx * dx; vy += dy * dy;
      }
      if (vx < 1e-12 || vy < 1e-12) return { r: null, n };
      const r = Math.round((cov / Math.sqrt(vx * vy)) * 100) / 100;
      return { r, n };
    } catch {
      return { r: null, n: 0 };
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
