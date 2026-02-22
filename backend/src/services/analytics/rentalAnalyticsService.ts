/**
 * Rental Analytics Service (Phase 3)
 *
 * Analytics.md Section 4.3 — RentalMarketAnalytics:
 *   - Average & median rental yields by region / property type
 *   - Rent benchmarks (by bedrooms, per sqm, vacancy)
 *   - Rental price trends (time-series of rental transaction values)
 *   - Lease term analytics from tenancies
 *   - Gross & net yield calculation
 *
 * Sources: property_transactions, tenancies, property_income,
 *          rental_market_benchmarks, market_cap_rate_benchmarks,
 *          rental_yield_analytics (snapshot table from migration 158)
 *
 * @module services/analytics/rentalAnalyticsService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

// ====================================================================
// TYPES
// ====================================================================

export interface RentalSummary {
  region: string;
  property_type: string;
  avg_rent_monthly: number;
  median_rent_monthly: number;
  avg_rent_per_sqm: number;
  rental_transaction_count: number;
  gross_yield_pct: number;
  vacancy_rate_pct: number;
  rent_by_bedrooms: Record<string, number>;
}

export interface RentalYieldDetail {
  region: string;
  property_type: string;
  gross_yield: number;
  net_yield: number;
  cap_rate: number;
  avg_property_value: number;
  avg_annual_rent: number;
  vacancy_rate: number;
  rent_growth_rate: number;
}

export interface RentalTrend {
  period: string;
  avg_rent: number;
  median_rent: number;
  count: number;
}

export interface RentalBenchmarkRow {
  area_name: string;
  property_type: string;
  listing_count: number;
  avg_rent_monthly: number;
  median_rent_monthly: number;
  avg_rent_per_sqm: number;
  vacancy_rate_estimate: number | null;
  rent_by_bedrooms: Record<string, number>;
}

interface RentalFilterOpts {
  region?: string;
  propertyType?: string;
  months?: number;
}

// ====================================================================
// SERVICE
// ====================================================================

class RentalAnalyticsService {
  // ------------------------------------------------------------------
  // RENTAL SUMMARY
  // ------------------------------------------------------------------

  /**
   * Summary of rental market: avg/median rent, yield, vacancy per region & type.
   */
  async getRentalSummary(opts: RentalFilterOpts): Promise<RentalSummary[]> {
    return this.computeRentalSummaryLive(opts);
  }

  private async computeRentalSummaryLive(opts: RentalFilterOpts): Promise<RentalSummary[]> {
    // Try transaction-based summary first
    try {
      const months = opts.months || 12;
      const params: any[] = [months];
      let idx = 2;
      let txnWhere = '';
      if (opts.region) {
        txnWhere += ` AND LOWER(pt.property_region::text) = LOWER($${idx++})`;
        params.push(opts.region);
      }
      if (opts.propertyType) {
        txnWhere += ` AND LOWER(pt.property_type::text) = LOWER($${idx++})`;
        params.push(opts.propertyType);
      }

      const sql = `
        WITH rental_txns AS (
          SELECT
            pt.property_region::text AS region,
            COALESCE(pt.property_type::text, 'residential') AS property_type,
            COUNT(*) AS txn_count,
            ROUND(AVG(pt.final_price)::numeric, 2) AS avg_rent,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pt.final_price)::numeric, 2) AS median_rent,
            ROUND(AVG(pt.price_per_sqm)::numeric, 2) AS avg_rent_sqm
          FROM property_transactions pt
          WHERE pt.transaction_type IN ('rental', 'lease')
            AND pt.transaction_date >= CURRENT_DATE - ($1 || ' months')::interval
            AND pt.final_price > 0
            ${txnWhere}
          GROUP BY pt.property_region, pt.property_type
        ),
        yields AS (
          SELECT
            cb.region::text AS region, cb.property_type::text AS property_type,
            cb.benchmark_cap_rate AS cap_rate,
            cb.vacancy_rate_market AS vacancy,
            cb.rent_growth_rate
          FROM market_cap_rate_benchmarks cb
        )
        SELECT
          r.region, r.property_type,
          r.avg_rent AS avg_rent_monthly,
          r.median_rent AS median_rent_monthly,
          COALESCE(r.avg_rent_sqm, 0) AS avg_rent_per_sqm,
          r.txn_count AS rental_transaction_count,
          COALESCE(y.cap_rate, 0) AS gross_yield_pct,
          COALESCE(y.vacancy, 0) AS vacancy_rate_pct
        FROM rental_txns r
        LEFT JOIN yields y ON LOWER(r.region) = LOWER(y.region) AND LOWER(r.property_type) = LOWER(y.property_type)
        ORDER BY r.txn_count DESC
      `;

      const result = await pool.query(sql, params);
      if (result.rows.length > 0) {
        return result.rows.map((r: any) => ({
          region: r.region,
          property_type: r.property_type,
          avg_rent_monthly: parseFloat(r.avg_rent_monthly || '0'),
          median_rent_monthly: parseFloat(r.median_rent_monthly || '0'),
          avg_rent_per_sqm: parseFloat(r.avg_rent_per_sqm || '0'),
          rental_transaction_count: parseInt(r.rental_transaction_count || '0', 10),
          gross_yield_pct: parseFloat(r.gross_yield_pct || '0'),
          vacancy_rate_pct: parseFloat(r.vacancy_rate_pct || '0'),
          rent_by_bedrooms: {},
        }));
      }
    } catch (_e) {
      logger.warn('Transaction-based rental summary unavailable, falling back to benchmarks');
    }

    // Fallback: synthesize summary from rental_market_benchmarks + market_cap_rate_benchmarks
    const fbParams: any[] = [];
    let fbIdx = 1;
    let fbWhere = '';
    if (opts.region) {
      fbWhere += ` AND LOWER(rmb.area_name) = LOWER($${fbIdx++})`;
      fbParams.push(opts.region);
    }
    if (opts.propertyType) {
      fbWhere += ` AND LOWER(rmb.property_type::text) = LOWER($${fbIdx++})`;
      fbParams.push(opts.propertyType);
    }

    const fbSql = `
      SELECT
        rmb.area_name AS region,
        COALESCE(rmb.property_type::text, 'residential') AS property_type,
        COALESCE(rmb.avg_rent_monthly, 0) AS avg_rent_monthly,
        COALESCE(rmb.median_rent_monthly, 0) AS median_rent_monthly,
        COALESCE(rmb.avg_rent_per_sqm, 0) AS avg_rent_per_sqm,
        COALESCE(rmb.listing_count, 0) AS rental_transaction_count,
        COALESCE(rmb.vacancy_rate_estimate, 0) AS vacancy_rate_pct,
        COALESCE(rmb.rent_by_bedrooms, '{}') AS rent_by_bedrooms
      FROM rental_market_benchmarks rmb
      WHERE 1=1 ${fbWhere}
      ORDER BY rmb.listing_count DESC
    `;

    const fbResult = await pool.query(fbSql, fbParams);
    return fbResult.rows.map((r: any) => ({
      region: r.region,
      property_type: r.property_type,
      avg_rent_monthly: parseFloat(r.avg_rent_monthly || '0'),
      median_rent_monthly: parseFloat(r.median_rent_monthly || '0'),
      avg_rent_per_sqm: parseFloat(r.avg_rent_per_sqm || '0'),
      rental_transaction_count: parseInt(r.rental_transaction_count || '0', 10),
      gross_yield_pct: 0,
      vacancy_rate_pct: parseFloat(r.vacancy_rate_pct || '0'),
      rent_by_bedrooms: typeof r.rent_by_bedrooms === 'string'
        ? JSON.parse(r.rent_by_bedrooms) : (r.rent_by_bedrooms || {}),
    }));
  }

  // ------------------------------------------------------------------
  // RENTAL YIELDS
  // ------------------------------------------------------------------

  /**
   * Detailed yield analytics per region.
   */
  async getRentalYields(opts: RentalFilterOpts): Promise<RentalYieldDetail[]> {
    try {
      const params: any[] = [];
      let idx = 1;
      let where = '';
      if (opts.region) {
        where += ` AND LOWER(cb.region) = LOWER($${idx++})`;
        params.push(opts.region);
      }
      if (opts.propertyType) {
        where += ` AND LOWER(cb.property_type::text) = LOWER($${idx++})`;
        params.push(opts.propertyType);
      }

      // Combine market_cap_rate_benchmarks with property_income averages
      const sql = `
        WITH income_avg AS (
          SELECT
            p.region::text AS region,
            p.property_type::text AS property_type,
            ROUND(AVG(pi.gross_potential_rent * 12)::numeric, 2) AS avg_annual_rent,
            ROUND(AVG(pi.property_value)::numeric, 2) AS avg_property_value,
            ROUND(AVG(pi.vacancy_rate)::numeric, 4) AS avg_vacancy,
            ROUND(AVG(pi.cap_rate)::numeric, 4) AS avg_cap_rate,
            ROUND(AVG(pi.net_operating_income)::numeric, 2) AS avg_noi
          FROM property_income pi
          JOIN properties p ON pi.property_id = p.id
          WHERE pi.property_value > 0 AND pi.gross_potential_rent > 0
          GROUP BY p.region, p.property_type
        )
        SELECT
          cb.region::text AS region,
          cb.property_type::text AS property_type,
          COALESCE(ia.avg_annual_rent, 0) AS avg_annual_rent,
          COALESCE(ia.avg_property_value, 0) AS avg_property_value,
          COALESCE(cb.benchmark_cap_rate, ia.avg_cap_rate, 0) AS cap_rate,
          CASE WHEN COALESCE(ia.avg_property_value, 0) > 0
            THEN ROUND((COALESCE(ia.avg_annual_rent, 0) / ia.avg_property_value * 100)::numeric, 2)
            ELSE 0 END AS gross_yield,
          CASE WHEN COALESCE(ia.avg_property_value, 0) > 0
            THEN ROUND((COALESCE(ia.avg_noi, 0) * 12 / ia.avg_property_value * 100)::numeric, 2)
            ELSE 0 END AS net_yield,
          COALESCE(cb.vacancy_rate_market, ia.avg_vacancy, 0) AS vacancy_rate,
          COALESCE(cb.rent_growth_rate, 0) AS rent_growth_rate
        FROM market_cap_rate_benchmarks cb
        LEFT JOIN income_avg ia ON LOWER(cb.region::text) = LOWER(ia.region)
          AND LOWER(cb.property_type::text) = LOWER(ia.property_type)
        WHERE 1=1 ${where}
        ORDER BY cb.benchmark_cap_rate DESC NULLS LAST
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        region: r.region,
        property_type: r.property_type,
        gross_yield: parseFloat(r.gross_yield || '0'),
        net_yield: parseFloat(r.net_yield || '0'),
        cap_rate: parseFloat(r.cap_rate || '0'),
        avg_property_value: parseFloat(r.avg_property_value || '0'),
        avg_annual_rent: parseFloat(r.avg_annual_rent || '0'),
        vacancy_rate: parseFloat(r.vacancy_rate || '0'),
        rent_growth_rate: parseFloat(r.rent_growth_rate || '0'),
      }));
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // RENTAL TRENDS
  // ------------------------------------------------------------------

  /**
   * Monthly rental price trends from transactions.
   */
  async getRentalTrends(opts: RentalFilterOpts): Promise<RentalTrend[]> {
    try {
      const months = opts.months || 24;
      const params: any[] = [months];
      let idx = 2;
      let where = '';
      if (opts.region) {
        where += ` AND LOWER(pt.property_region::text) = LOWER($${idx++})`;
        params.push(opts.region);
      }
      if (opts.propertyType) {
        where += ` AND LOWER(pt.property_type::text) = LOWER($${idx++})`;
        params.push(opts.propertyType);
      }

      const sql = `
        SELECT
          TO_CHAR(DATE_TRUNC('month', pt.transaction_date), 'YYYY-MM') AS period,
          ROUND(AVG(pt.final_price)::numeric, 2) AS avg_rent,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pt.final_price)::numeric, 2) AS median_rent,
          COUNT(*) AS count
        FROM property_transactions pt
        WHERE pt.transaction_type IN ('rental', 'lease')
          AND pt.transaction_date >= CURRENT_DATE - ($1 || ' months')::interval
          AND pt.final_price > 0
          ${where}
        GROUP BY DATE_TRUNC('month', pt.transaction_date)
        ORDER BY DATE_TRUNC('month', pt.transaction_date) ASC
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        period: r.period,
        avg_rent: parseFloat(r.avg_rent || '0'),
        median_rent: parseFloat(r.median_rent || '0'),
        count: parseInt(r.count || '0', 10),
      }));
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // RENTAL BENCHMARKS
  // ------------------------------------------------------------------

  /**
   * Rental benchmarks from the rental_market_benchmarks table.
   */
  async getRentalBenchmarks(opts: { region?: string; propertyType?: string }): Promise<RentalBenchmarkRow[]> {
    try {
      const params: any[] = [];
      let idx = 1;
      let where = '';
      if (opts.region) {
        where += ` AND LOWER(area_name) = LOWER($${idx++})`;
        params.push(opts.region);
      }
      if (opts.propertyType) {
        where += ` AND LOWER(property_type::text) = LOWER($${idx++})`;
        params.push(opts.propertyType);
      }

      const sql = `
        SELECT
          area_name, property_type::text AS property_type,
          listing_count,
          COALESCE(avg_rent_monthly, 0) AS avg_rent_monthly,
          COALESCE(median_rent_monthly, 0) AS median_rent_monthly,
          COALESCE(avg_rent_per_sqm, 0) AS avg_rent_per_sqm,
          vacancy_rate_estimate,
          COALESCE(rent_by_bedrooms, '{}') AS rent_by_bedrooms
        FROM rental_market_benchmarks
        WHERE 1=1 ${where}
        ORDER BY listing_count DESC
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        area_name: r.area_name,
        property_type: r.property_type,
        listing_count: parseInt(r.listing_count || '0', 10),
        avg_rent_monthly: parseFloat(r.avg_rent_monthly || '0'),
        median_rent_monthly: parseFloat(r.median_rent_monthly || '0'),
        avg_rent_per_sqm: parseFloat(r.avg_rent_per_sqm || '0'),
        vacancy_rate_estimate: r.vacancy_rate_estimate ? parseFloat(r.vacancy_rate_estimate) : null,
        rent_by_bedrooms: typeof r.rent_by_bedrooms === 'string'
          ? JSON.parse(r.rent_by_bedrooms) : (r.rent_by_bedrooms || {}),
      }));
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // RENTAL BY REGION
  // ------------------------------------------------------------------

  /**
   * Rental summary grouped by region (for the rental heatmap / comparison).
   */
  async getRentalByRegion(): Promise<RentalSummary[]> {
    return this.getRentalSummary({});
  }

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------

  private mapRentalSummaryRow(r: any): RentalSummary {
    return {
      region: r.region,
      property_type: r.property_type,
      avg_rent_monthly: parseFloat(r.avg_rent_monthly || '0'),
      median_rent_monthly: parseFloat(r.median_rent_monthly || '0'),
      avg_rent_per_sqm: parseFloat(r.avg_rent_per_sqm || '0'),
      rental_transaction_count: parseInt(r.rental_transaction_count || '0', 10),
      gross_yield_pct: parseFloat(r.gross_yield_pct || '0'),
      vacancy_rate_pct: parseFloat(r.vacancy_rate_pct || '0'),
      rent_by_bedrooms: typeof r.rent_by_bedrooms === 'string'
        ? JSON.parse(r.rent_by_bedrooms) : (r.rent_by_bedrooms || {}),
    };
  }
}

export const rentalAnalyticsService = new RentalAnalyticsService();
