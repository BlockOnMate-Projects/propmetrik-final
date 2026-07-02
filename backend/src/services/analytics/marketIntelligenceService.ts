/**
 * Market Intelligence Service (Phase 3)
 *
 * Backend analytics for Analytics.md Section 4:
 *   4.1 — Property Price Index calculation (live + snapshots)
 *   4.2 — Market Activity metrics (transactions, listings, supply/demand)
 *   4.3 — Price distribution & trend analysis
 *   4.4 — Market report generation / compute-and-store
 *
 * Lives alongside mlAnalyticsService (which does simple reads from the same
 * tables). This service adds *live aggregation* from property_transactions,
 * properties, and valuation data — then can persist into price_index /
 * activity_metrics snapshot tables.
 *
 * @module services/analytics/marketIntelligenceService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { gssMiegService } from '../data-hub/scrapers/gssMiegService';
import { gssFinancialService } from '../data-hub/scrapers/gssFinancialService';

// ====================================================================
// TYPES
// ====================================================================

export interface PriceIndexSummary {
  region: string;
  property_type: string;
  index_value: number | null;
  real_index: number | null;
  base_period: string;
  change_mom: number;
  change_qoq: number;
  change_yoy: number | null;
  median_price: number;
  avg_price: number;
  transaction_count: number;
  sub_indices: Record<string, number>;
  // GSS Macro context (Slice 1) — present when gss_mieg_monthly is populated
  mieg_growth_yoy?: number | null;
  gdp_growth_context?: string | null;
  interest_rate_cycle?: string | null;
}

export interface PriceIndexHistory {
  period: string;
  index_value: number;
  change_mom: number;
  change_yoy: number;
  median_price: number;
  transaction_count: number;
}

export interface MarketActivitySummary {
  region: string;
  property_type: string | null;
  transaction_count: number;
  transaction_value: number;
  avg_transaction_value: number;
  median_transaction_value: number;
  new_listings: number;
  active_listings: number;
  avg_days_on_market: number;
  listing_to_sale_ratio: number;
  absorption_rate: number;
  inventory_months: number;
  avg_discount_pct: number;
  market_temperature: string | null;
  price_distribution: Record<string, number>;
}

export interface MarketActivityHistory {
  period: string;
  transaction_count: number;
  transaction_value: number;
  avg_transaction_value: number;
  new_listings: number;
  active_listings: number;
  avg_days_on_market: number;
}

export interface SupplyDemandMetrics {
  region: string;
  total_supply: number;
  new_listings_30d: number;
  sold_30d: number;
  absorption_rate: number;
  inventory_months: number;
  avg_days_on_market: number;
  price_reduction_pct: number;
  market_temperature: string;
}

export interface PriceDistribution {
  bucket: string;
  count: number;
  pct: number;
}

export interface RecentTransaction {
  id: string;
  location: string;
  region: string;
  property_type: string;
  final_price: number;
  price_per_sqm: number | null;
  transaction_date: string;
  transaction_type: string;
  bedrooms: number | null;
}

interface FilterOpts {
  region?: string;
  propertyType?: string;
  months?: number;
}

// ====================================================================
// SERVICE
// ====================================================================

class MarketIntelligenceService {
  // ------------------------------------------------------------------
  // 4.1 — PRICE INDEX (from properties listing data + property_transactions when available)
  // ------------------------------------------------------------------

  /**
   * Price index across regions / property types.
   * Uses properties table as primary source, with property_transactions as supplement.
   */
  async getPriceIndex(opts: FilterOpts): Promise<PriceIndexSummary[]> {
    return this.computePriceIndexLive(opts);
  }

  private async computePriceIndexLive(opts: FilterOpts): Promise<PriceIndexSummary[]> {
    const months = opts.months || 12;
    const params: any[] = [months, months * 2];
    let idx = 3;
    let where = '';
    if (opts.region) {
      where += ` AND LOWER(p.region::text) = LOWER($${idx++})`;
      params.push(opts.region);
    }
    if (opts.propertyType) {
      where += ` AND LOWER(p.property_type::text) = LOWER($${idx++})`;
      params.push(opts.propertyType);
    }

    // Use the real market event date (when the listing first appeared), not created_at — which is
    // the row-insert/bulk-import timestamp and would tie the "index" to when we loaded data rather
    // than when the market moved. Falls back to created_at only if first_seen_at is absent.
    const eventDate = 'COALESCE(p.first_seen_at, p.created_at)';
    const sql = `
      WITH current_period AS (
        SELECT
          p.region::text AS region,
          COALESCE(p.property_type::text, 'residential') AS property_type,
          COUNT(*) AS listing_count,
          SUM(p.price) AS total_value,
          AVG(p.price) AS avg_price,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.price) AS median_price
        FROM properties p
        WHERE p.price > 0
          AND p.status IN ('active', 'sold', 'under_offer', 'rented')
          AND ${eventDate} >= CURRENT_DATE - ($1 || ' months')::interval
          ${where}
        GROUP BY p.region, p.property_type
      ),
      prev_period AS (
        SELECT
          p.region::text AS region,
          COALESCE(p.property_type::text, 'residential') AS property_type,
          AVG(p.price) AS avg_price
        FROM properties p
        WHERE p.price > 0
          AND ${eventDate} >= CURRENT_DATE - ($2 || ' months')::interval
          AND ${eventDate} < CURRENT_DATE - ($1 || ' months')::interval
          ${where}
        GROUP BY p.region, p.property_type
      )
      SELECT
        c.region, c.property_type,
        c.listing_count AS transaction_count,
        ROUND(c.avg_price::numeric, 2) AS avg_price,
        ROUND(c.median_price::numeric, 2) AS median_price,
        ROUND(c.total_value::numeric, 2) AS total_value,
        -- NULL (not 0) when there is no prior-year sample to compare against, so the API distinguishes
        -- "0% change" from "insufficient history". Currently every listing post-dates early 2026, so
        -- prev_period is empty and YoY is genuinely not computable yet — surface that honestly.
        CASE WHEN pp.avg_price > 0 THEN ROUND(((c.avg_price - pp.avg_price) / pp.avg_price * 100)::numeric, 3) ELSE NULL END AS change_yoy
      FROM current_period c
      LEFT JOIN prev_period pp ON c.region = pp.region AND c.property_type = pp.property_type
      ORDER BY c.listing_count DESC
    `;

    const result = await pool.query(sql, params);

    // CPI deflator (E-10): latest YoY inflation from economic_indicators — a real GSS/BoG series
    // (self-healed from GSS cpi.px by gssIncomeService). Used to convert the nominal price index
    // into a real (inflation-adjusted) one — only when there is a real nominal change to deflate.
    const inflRow = await pool.query<{ value: string }>(
      `SELECT value FROM economic_indicators WHERE indicator_type = 'inflation_rate'
       ORDER BY effective_date DESC LIMIT 1`,
    );
    const inflationYoY = inflRow.rows[0] ? Number(inflRow.rows[0].value) : null;

    const results = result.rows.map((r: any) => {
      // change_yoy is null when there is no prior-year basis — do NOT fabricate 0 or an index/real_index off it.
      const yoy = r.change_yoy === null || r.change_yoy === undefined ? null : parseFloat(r.change_yoy);
      const nominalIndex = yoy === null ? null : Math.round(100 * (1 + yoy / 100) * 100) / 100;
      const realIndex = yoy !== null && inflationYoY != null
        ? Math.round((100 * (1 + yoy / 100) / (1 + inflationYoY / 100)) * 100) / 100
        : null;
      return {
        region: r.region,
        property_type: r.property_type,
        index_value: nominalIndex,
        real_index: realIndex,
        base_period: 'YoY (12M prior = 100)',
        change_mom: 0,
        change_qoq: 0,
        change_yoy: yoy,
        median_price: parseFloat(r.median_price || '0'),
        avg_price: parseFloat(r.avg_price || '0'),
        transaction_count: parseInt(r.transaction_count || '0', 10),
        sub_indices: { inflation_yoy: inflationYoY ?? 0 },
      } as PriceIndexSummary;
    });

    // Enrich with GSS MIEG macro context (Slice 1) — non-fatal if tables not yet populated.
    // Applies the same macro context to every region row (it's national-level data).
    try {
      const [miegData, gdpData, rateCycle] = await Promise.all([
        gssMiegService.getLatestMieg(),
        gssMiegService.getLatestGdpGrowth(),
        gssFinancialService.getInterestRateCycle(),
      ]);
      const totalMieg = miegData['Total_MIEG'];
      const miegYoy = totalMieg?.growth_yoy_pct ?? null;
      const gdpContext = gdpData
        ? `${gdpData.quarter_label} GDP: GHS ${gdpData.gdp_value?.toLocaleString() ?? 'N/A'}M`
        : null;
      const isContacting = await gssMiegService.isServicesMiegContracting(2);

      for (const row of results) {
        row.mieg_growth_yoy = miegYoy;
        row.gdp_growth_context = gdpContext;
        row.interest_rate_cycle = rateCycle;
        // Flag credit-sensitive markets when Services MIEG contracts 2+ months
        if (isContacting && (row as any).market_temperature !== 'hot') {
          (row as any).market_temperature_note = 'credit-sensitive';
        }
      }
    } catch {
      // GSS tables not yet seeded — silently degrade
    }

    return results;
  }

  /**
   * Price index history (monthly time-series from listing data).
   */
  async getPriceIndexHistory(opts: FilterOpts): Promise<PriceIndexHistory[]> {
    return this.computePriceIndexHistoryLive(opts);
  }

  private async computePriceIndexHistoryLive(opts: FilterOpts): Promise<PriceIndexHistory[]> {
    const months = opts.months || 24;
    const params: any[] = [months];
    let idx = 2;
    let where = '';
    if (opts.region) {
      where += ` AND LOWER(p.region::text) = LOWER($${idx++})`;
      params.push(opts.region);
    }
    if (opts.propertyType) {
      where += ` AND LOWER(p.property_type::text) = LOWER($${idx++})`;
      params.push(opts.propertyType);
    }

    const sql = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', p.created_at), 'YYYY-MM') AS period,
        COUNT(*) AS transaction_count,
        ROUND(AVG(p.price)::numeric, 2) AS avg_price,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.price)::numeric, 2) AS median_price
      FROM properties p
      WHERE p.price > 0
        AND p.status IN ('active', 'sold', 'under_offer', 'rented')
        AND p.created_at >= CURRENT_DATE - ($1 || ' months')::interval
        ${where}
      GROUP BY DATE_TRUNC('month', p.created_at)
      ORDER BY DATE_TRUNC('month', p.created_at) ASC
    `;
    const result = await pool.query(sql, params);
    return result.rows.map((r: any, i: number, arr: any[]) => {
      const prevAvg = i > 0 ? parseFloat(arr[i-1].avg_price || '0') : 0;
      const curAvg = parseFloat(r.avg_price || '0');
      const mom = prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg * 100) : 0;
      return {
        period: r.period,
        index_value: 100,
        change_mom: Math.round(mom * 1000) / 1000,
        change_yoy: 0,
        median_price: parseFloat(r.median_price || '0'),
        transaction_count: parseInt(r.transaction_count || '0', 10),
      };
    });
  }

  // ------------------------------------------------------------------
  // 4.2 — MARKET ACTIVITY (from properties table)
  // ------------------------------------------------------------------

  /**
   * Market activity summary per region — sourced from properties.
   */
  async getMarketActivity(opts: FilterOpts): Promise<MarketActivitySummary[]> {
    return this.computeMarketActivityLive(opts);
  }

  /**
   * Live market activity from properties table.
   * Uses listing price and created_at as proxies when property_transactions is empty.
   */
  private async computeMarketActivityLive(opts: FilterOpts): Promise<MarketActivitySummary[]> {
    const months = opts.months || 3;
    const params: any[] = [months];
    let idx = 2;
    let propWhere = '';
    if (opts.region) {
      propWhere += ` AND LOWER(p.region::text) = LOWER($${idx})`;
      params.push(opts.region);
      idx++;
    }
    if (opts.propertyType) {
      propWhere += ` AND LOWER(p.property_type::text) = LOWER($${idx})`;
      params.push(opts.propertyType);
      idx++;
    }

    const sql = `
      SELECT
        p.region::text AS region,
        COALESCE(p.property_type::text, 'residential') AS property_type,
        COUNT(*) AS total_listings,
        COUNT(*) FILTER (WHERE p.price > 0) AS priced_listings,
        ROUND(SUM(p.price)::numeric, 2) AS transaction_value,
        ROUND(AVG(p.price)::numeric, 2) AS avg_transaction_value,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.price)::numeric, 2) AS median_transaction_value,
        COUNT(*) FILTER (WHERE p.created_at >= CURRENT_DATE - ($1 || ' months')::interval) AS new_listings,
        COUNT(*) FILTER (WHERE p.status = 'active') AS active_listings,
        ROUND(AVG(EXTRACT(DAY FROM (NOW() - p.created_at)))::numeric, 1) AS avg_days_on_market
      FROM properties p
      WHERE p.price > 0
        AND p.status IN ('active', 'sold', 'under_offer', 'rented')
        ${propWhere}
      GROUP BY p.region, p.property_type
      ORDER BY COUNT(*) DESC
    `;

    const result = await pool.query(sql, params);
    return result.rows.map((r: any) => {
      const active = parseInt(r.active_listings || '0', 10);
      const total = parseInt(r.priced_listings || '0', 10);
      return {
        region: r.region,
        property_type: r.property_type,
        transaction_count: total,
        transaction_value: parseFloat(r.transaction_value || '0'),
        avg_transaction_value: parseFloat(r.avg_transaction_value || '0'),
        median_transaction_value: parseFloat(r.median_transaction_value || '0'),
        new_listings: parseInt(r.new_listings || '0', 10),
        active_listings: active,
        avg_days_on_market: parseFloat(r.avg_days_on_market || '0'),
        listing_to_sale_ratio: 0,
        absorption_rate: 0,
        inventory_months: 0,
        avg_discount_pct: 0,
        market_temperature: null,
        price_distribution: {},
      };
    });
  }

  /**
   * Market activity history (monthly time-series from properties).
   */
  async getMarketActivityHistory(opts: FilterOpts): Promise<MarketActivityHistory[]> {
    return this.computeActivityHistoryLive(opts);
  }

  private async computeActivityHistoryLive(opts: FilterOpts): Promise<MarketActivityHistory[]> {
    const months = opts.months || 24;
    const params: any[] = [months];
    let idx = 2;
    let where = '';
    if (opts.region) {
      where += ` AND LOWER(p.region::text) = LOWER($${idx++})`;
      params.push(opts.region);
    }

    const sql = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', p.created_at), 'YYYY-MM') AS period,
        COUNT(*) AS transaction_count,
        SUM(p.price) AS transaction_value,
        ROUND(AVG(p.price)::numeric, 2) AS avg_transaction_value,
        COUNT(*) FILTER (WHERE p.status = 'active') AS active_listings
      FROM properties p
      WHERE p.price > 0
        AND p.created_at >= CURRENT_DATE - ($1 || ' months')::interval
        ${where}
      GROUP BY DATE_TRUNC('month', p.created_at)
      ORDER BY DATE_TRUNC('month', p.created_at) ASC
    `;
    const result = await pool.query(sql, params);
    return result.rows.map((r: any) => ({
      period: r.period,
      transaction_count: parseInt(r.transaction_count || '0', 10),
      transaction_value: parseFloat(r.transaction_value || '0'),
      avg_transaction_value: parseFloat(r.avg_transaction_value || '0'),
      new_listings: parseInt(r.transaction_count || '0', 10),
      active_listings: parseInt(r.active_listings || '0', 10),
      avg_days_on_market: 0,
    }));
  }

  // ------------------------------------------------------------------
  // SUPPLY / DEMAND
  // ------------------------------------------------------------------

  /**
   * Supply/demand metrics by region (from properties table).
   * Since property_transactions is empty, we derive demand signals from
   * listing velocity and inquiry/view counts when available.
   */
  async getSupplyDemand(opts: { region?: string }): Promise<SupplyDemandMetrics[]> {
    try {
      const params: any[] = [];
      let idx = 1;
      let propWhere = '';
      if (opts.region) {
        propWhere = ` AND LOWER(p.region::text) = LOWER($${idx})`;
        params.push(opts.region);
        idx++;
      }

      const sql = `
        SELECT
          p.region::text AS region,
          COUNT(*) AS total_supply,
          COUNT(*) FILTER (WHERE p.created_at >= CURRENT_DATE - INTERVAL '30 days') AS new_30d,
          COUNT(*) FILTER (WHERE p.transaction_type::text = 'sale') AS for_sale,
          COUNT(*) FILTER (WHERE p.transaction_type::text = 'rental') AS for_rent,
          ROUND(AVG(EXTRACT(DAY FROM (NOW() - p.created_at)))::numeric, 1) AS avg_dom,
          COALESCE(SUM(p.view_count), 0) AS total_views,
          COALESCE(SUM(p.inquiry_count), 0) AS total_inquiries
        FROM properties p
        WHERE p.status = 'active'
          AND p.price > 0
          ${propWhere}
        GROUP BY p.region
        ORDER BY COUNT(*) DESC
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => {
        const totalSupply = parseInt(r.total_supply || '0', 10);
        const new30d = parseInt(r.new_30d || '0', 10);
        const avgDom = parseFloat(r.avg_dom || '0');

        // Estimate absorption from new listing velocity
        const absorptionRate = totalSupply > 0 ? Math.round((new30d / totalSupply) * 10000) / 10000 : 0;
        const invMonths = new30d > 0 ? Math.round((totalSupply / new30d) * 100) / 100 : 0;

        let temperature = 'balanced';
        if (invMonths > 0 && invMonths < 3) temperature = 'hot';
        else if (invMonths >= 3 && invMonths < 6) temperature = 'warm';
        else if (invMonths >= 6 && invMonths < 9) temperature = 'balanced';
        else if (invMonths >= 9 && invMonths < 12) temperature = 'cool';
        else if (invMonths >= 12) temperature = 'cold';

        return {
          region: r.region,
          total_supply: totalSupply,
          new_listings_30d: new30d,
          sold_30d: 0, // no transaction data yet
          absorption_rate: absorptionRate,
          inventory_months: invMonths,
          avg_days_on_market: avgDom,
          price_reduction_pct: 0,
          market_temperature: temperature,
        };
      });
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // PRICE DISTRIBUTION
  // ------------------------------------------------------------------

  /**
   * Price distribution histogram from properties listing prices.
   */
  async getPriceDistribution(opts: FilterOpts): Promise<PriceDistribution[]> {
    try {
      const params: any[] = [];
      let idx = 1;
      let where = '';
      if (opts.region) {
        where += ` AND LOWER(p.region::text) = LOWER($${idx++})`;
        params.push(opts.region);
      }
      if (opts.propertyType) {
        where += ` AND LOWER(p.property_type::text) = LOWER($${idx++})`;
        params.push(opts.propertyType);
      }

      const sql = `
        WITH listings AS (
          SELECT p.price
          FROM properties p
          WHERE p.price > 0
            AND p.status IN ('active', 'sold', 'under_offer', 'rented')
            ${where}
        ),
        total AS (SELECT COUNT(*) AS cnt FROM listings),
        buckets AS (
          SELECT
            CASE
              WHEN price < 20000 THEN '< GH₵20K'
              WHEN price < 50000 THEN 'GH₵20K–50K'
              WHEN price < 100000 THEN 'GH₵50K–100K'
              WHEN price < 200000 THEN 'GH₵100K–200K'
              WHEN price < 500000 THEN 'GH₵200K–500K'
              WHEN price < 1000000 THEN 'GH₵500K–1M'
              ELSE 'GH₵1M+'
            END AS bucket,
            CASE
              WHEN price < 20000 THEN 1
              WHEN price < 50000 THEN 2
              WHEN price < 100000 THEN 3
              WHEN price < 200000 THEN 4
              WHEN price < 500000 THEN 5
              WHEN price < 1000000 THEN 6
              ELSE 7
            END AS sort_order,
            COUNT(*) AS count
          FROM listings
          GROUP BY 1, 2
        )
        SELECT
          b.bucket, b.count,
          CASE WHEN t.cnt > 0
            THEN ROUND((b.count::numeric / t.cnt * 100), 1)
            ELSE 0 END AS pct
        FROM buckets b, total t
        ORDER BY b.sort_order
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        bucket: r.bucket,
        count: parseInt(r.count || '0', 10),
        pct: parseFloat(r.pct || '0'),
      }));
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // RECENT LISTINGS (replacing RECENT TRANSACTIONS while property_transactions is empty)
  // ------------------------------------------------------------------

  /**
   * Fetch recent property listings. When property_transactions has data,
   * those will be preferred; otherwise we show recent listings from properties.
   */
  async getRecentTransactions(opts: FilterOpts & { limit?: number }): Promise<RecentTransaction[]> {
    try {
      const limit = opts.limit || 20;
      const params: any[] = [limit];
      let idx = 2;
      let where = '';
      if (opts.region) {
        where += ` AND LOWER(p.region::text) = LOWER($${idx++})`;
        params.push(opts.region);
      }
      if (opts.propertyType) {
        where += ` AND LOWER(p.property_type::text) = LOWER($${idx++})`;
        params.push(opts.propertyType);
      }

      const sql = `
        SELECT
          p.id,
          COALESCE(p.address_street, p.address_city, p.address_district, p.region::text) AS location,
          p.region::text AS region,
          COALESCE(p.property_type::text, 'residential') AS property_type,
          p.price AS final_price,
          p.price_per_sqm,
          p.created_at::text AS transaction_date,
          COALESCE(p.transaction_type::text, 'sale') AS transaction_type,
          p.bedrooms
        FROM properties p
        WHERE p.price > 0
          AND p.status IN ('active', 'sold', 'under_offer', 'rented')
          ${where}
        ORDER BY p.created_at DESC
        LIMIT $1
      `;
      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        id: r.id,
        location: r.location,
        region: r.region,
        property_type: r.property_type,
        final_price: parseFloat(r.final_price || '0'),
        price_per_sqm: r.price_per_sqm ? parseFloat(r.price_per_sqm) : null,
        transaction_date: r.transaction_date,
        transaction_type: r.transaction_type,
        bedrooms: r.bedrooms ? parseInt(r.bedrooms, 10) : null,
      }));
    } catch (err: any) {
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // COMPUTE & STORE SNAPSHOT
  // ------------------------------------------------------------------

  /**
   * Compute current market metrics and persist into snapshot tables.
   * Uses properties as primary data source.
   */
  async computeAndStoreSnapshot(date: Date): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    logger.info('Computing market intelligence snapshot', { date: dateStr });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Price index per region/type from properties
      const priceResult = await client.query(`
        SELECT
          p.region::text AS region,
          COALESCE(p.property_type::text, 'residential') AS property_type,
          COUNT(*) AS listing_count,
          ROUND(AVG(p.price)::numeric, 2) AS avg_price,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.price)::numeric, 2) AS median_price,
          SUM(p.price) AS total_value
        FROM properties p
        WHERE p.price > 0
          AND p.status IN ('active', 'sold', 'under_offer', 'rented')
          AND p.created_at <= $1::date + INTERVAL '1 day'
          AND p.created_at >= ($1::date - INTERVAL '1 month')
        GROUP BY p.region, p.property_type
      `, [dateStr]);

      for (const r of priceResult.rows) {
        await client.query(`
          INSERT INTO property_price_index (region, property_type, period_date, index_value,
            median_price, avg_price, transaction_count, total_transaction_value, period_type)
          VALUES ($1, $2, $3, 100, $4, $5, $6, $7, 'monthly')
          ON CONFLICT (region, property_type, period_date)
          DO UPDATE SET
            median_price = EXCLUDED.median_price,
            avg_price = EXCLUDED.avg_price,
            transaction_count = EXCLUDED.transaction_count,
            total_transaction_value = EXCLUDED.total_transaction_value
        `, [r.region, r.property_type, dateStr,
            r.median_price, r.avg_price, r.listing_count, r.total_value]);
      }

      // 2. Market activity per region from properties
      const activityResult = await client.query(`
        SELECT
          p.region::text AS region,
          COALESCE(p.property_type::text, 'residential') AS property_type,
          COUNT(*) AS listing_count,
          SUM(p.price) AS total_value,
          ROUND(AVG(p.price)::numeric, 2) AS avg_value,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.price)::numeric, 2) AS med_value,
          COUNT(*) FILTER (WHERE p.created_at >= ($1::date - INTERVAL '1 month')) AS new_list,
          COUNT(*) FILTER (WHERE p.status = 'active') AS active,
          ROUND(AVG(EXTRACT(DAY FROM (NOW() - p.created_at)))::numeric, 2) AS dom
        FROM properties p
        WHERE p.price > 0
          AND p.status IN ('active', 'sold', 'under_offer', 'rented')
        GROUP BY p.region, p.property_type
      `, [dateStr]);

      for (const r of activityResult.rows) {
        await client.query(`
          INSERT INTO market_activity_metrics (id, period_date, period_type, region, property_type,
            transaction_count, transaction_value, avg_transaction_value, median_transaction_value,
            new_listings, active_listings, avg_days_on_market, absorption_rate)
          VALUES (gen_random_uuid(), $1, 'monthly', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (period_date, period_type, region, property_type)
          DO UPDATE SET
            transaction_count = EXCLUDED.transaction_count,
            transaction_value = EXCLUDED.transaction_value,
            avg_transaction_value = EXCLUDED.avg_transaction_value,
            median_transaction_value = EXCLUDED.median_transaction_value,
            new_listings = EXCLUDED.new_listings,
            active_listings = EXCLUDED.active_listings,
            avg_days_on_market = EXCLUDED.avg_days_on_market,
            absorption_rate = EXCLUDED.absorption_rate
        `, [dateStr, r.region, r.property_type,
            r.listing_count, r.total_value, r.avg_value, r.med_value,
            r.new_list, r.active, r.dom, 0]);
      }

      await client.query('COMMIT');
      logger.info('Market intelligence snapshot computed successfully', { date: dateStr });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const marketIntelligenceService = new MarketIntelligenceService();
