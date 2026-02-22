/**
 * Valuation Analytics Service (Phase 2)
 *
 * Provides valuation volume metrics, method performance tracking,
 * valuer performance / leaderboard, and market-relative analytics.
 *
 * Data Sources:
 *   - Live aggregation from: valuations, valuation_comparables,
 *     valuation_reconciliations, valuation_user_overrides
 *   - Snapshot tables: valuation_analytics_snapshots,
 *     valuer_performance_snapshots, method_performance_history,
 *     market_relative_analytics
 *
 * Analytics.md Section 3: Valuation Analytics
 *
 * @module services/analytics/valuationAnalyticsService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface ValuationVolumeSummary {
  period: string;
  total_count: number;
  completed_count: number;
  total_value: number;
  avg_value: number;
  median_value: number;
  value_p25: number;
  value_p75: number;
  by_region: Record<string, { count: number; value: number }>;
  by_property_type: Record<string, { count: number; value: number }>;
  by_purpose: Record<string, { count: number; value: number }>;
  by_method: Record<string, { count: number; avg_confidence: number }>;
  by_valuation_type: Record<string, number>;
}

export interface ValuationVolumeHistory {
  period: string;
  valuation_count: number;
  total_value: number;
  avg_value: number;
  avg_confidence: number;
}

export interface MethodPerformance {
  method_name: string;
  usage_count: number;
  as_primary_count: number;
  avg_weight: number;
  avg_confidence: number;
  min_confidence: number;
  max_confidence: number;
  avg_value: number;
  avg_comparables_used: number | null;
  avg_similarity_score: number | null;
  avg_adjustment_pct: number | null;
}

export interface MethodPerformanceHistoryRow {
  snapshot_date: string;
  method_name: string;
  usage_count: number;
  avg_confidence: number;
  avg_weight: number;
  avg_value: number;
}

export interface ValuerPerformance {
  valuer_id: string;
  valuer_name: string;
  organization_name: string | null;
  total_valuations: number;
  completed_valuations: number;
  by_property_type: Record<string, number>;
  by_region: Record<string, number>;
  avg_confidence: number;
  avg_time_to_complete_days: number;
  override_rate: number;
  avg_comparables_used: number;
  percentile_volume: number;
  percentile_quality: number;
  percentile_speed: number;
  total_value_ghs: number;
}

export interface ValuerLeaderboardEntry {
  valuer_id: string;
  valuer_name: string;
  organization_name: string | null;
  total_valuations: number;
  avg_confidence: number;
  avg_time_to_complete_days: number;
  override_rate: number;
  total_value_ghs: number;
  rank: number;
}

export interface MarketRelativeData {
  region: string;
  property_type: string | null;
  valuations_median: number;
  market_median: number;
  premium_discount_pct: number;
  valuation_trend_3m: number;
  market_trend_3m: number;
  correlation: number;
  high_outlier_count: number;
  low_outlier_count: number;
  outlier_rate: number;
  valuation_count: number;
}

export interface QualityMetrics {
  avg_comparables_per_valuation: number;
  median_similarity_score: number;
  avg_adjustment_pct: number;
  freshness_days_avg: number;
  avg_method_spread_pct: number;
  override_rate: number;
  confidence_distribution: Array<{ bucket: string; count: number }>;
}

export interface ValuationTrendData {
  period: string;
  count: number;
  avg_value: number;
  avg_confidence: number;
  avg_time_days: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ValuationAnalyticsService {
  // --------------------------------------------------------------------------
  // 3.1 Portfolio Valuation Analytics — Volume
  // --------------------------------------------------------------------------

  /**
   * Get current valuation volume summary.
   * Aggregates live from the valuations table.
   */
  async getVolumeSummary(opts: {
    region?: string;
    propertyType?: string;
    months?: number;
  } = {}): Promise<ValuationVolumeSummary | null> {
    try {
      const { region, propertyType, months = 12 } = opts;
      const conditions: string[] = [`v.created_at >= NOW() - INTERVAL '${months} months'`];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(p.region::text) = LOWER($${idx++})`);
        params.push(region);
      }
      if (propertyType) {
        conditions.push(`LOWER(p.property_type::text) = LOWER($${idx++})`);
        params.push(propertyType);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Main aggregation
      const mainSql = `
        SELECT
          COUNT(*) AS total_count,
          COUNT(*) FILTER (WHERE v.status = 'completed') AS completed_count,
          COALESCE(SUM(v.estimated_value), 0) AS total_value,
          COALESCE(AVG(v.estimated_value), 0) AS avg_value,
          COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY v.estimated_value), 0) AS median_value,
          COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY v.estimated_value), 0) AS value_p25,
          COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY v.estimated_value), 0) AS value_p75
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        ${where}
      `;
      const mainResult = await pool.query(mainSql, params);
      if (mainResult.rows.length === 0) return null;
      const m = mainResult.rows[0];

      // By region
      const regionSql = `
        SELECT
          LOWER(p.region::text) AS region,
          COUNT(*) AS count,
          COALESCE(SUM(v.estimated_value), 0) AS value
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        ${where}
        GROUP BY LOWER(p.region::text)
        ORDER BY count DESC
      `;
      const regionResult = await pool.query(regionSql, params);
      const byRegion: Record<string, { count: number; value: number }> = {};
      for (const r of regionResult.rows) {
        if (r.region) byRegion[r.region] = { count: parseInt(r.count, 10), value: parseFloat(r.value) };
      }

      // By property type
      const typeSql = `
        SELECT
          LOWER(p.property_type::text) AS ptype,
          COUNT(*) AS count,
          COALESCE(SUM(v.estimated_value), 0) AS value
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        ${where}
        GROUP BY LOWER(p.property_type::text)
        ORDER BY count DESC
      `;
      const typeResult = await pool.query(typeSql, params);
      const byPropertyType: Record<string, { count: number; value: number }> = {};
      for (const r of typeResult.rows) {
        if (r.ptype) byPropertyType[r.ptype] = { count: parseInt(r.count, 10), value: parseFloat(r.value) };
      }

      // By purpose
      const purposeSql = `
        SELECT
          v.valuation_purpose::text AS purpose,
          COUNT(*) AS count,
          COALESCE(SUM(v.estimated_value), 0) AS value
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        ${where}
        GROUP BY v.valuation_purpose
        ORDER BY count DESC
      `;
      const purposeResult = await pool.query(purposeSql, params);
      const byPurpose: Record<string, { count: number; value: number }> = {};
      for (const r of purposeResult.rows) {
        if (r.purpose) byPurpose[r.purpose] = { count: parseInt(r.count, 10), value: parseFloat(r.value) };
      }

      // By primary method
      const methodSql = `
        SELECT
          v.primary_method::text AS method,
          COUNT(*) AS count,
          COALESCE(AVG(v.confidence_score), 0) AS avg_confidence
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        ${where} AND v.primary_method IS NOT NULL
        GROUP BY v.primary_method
        ORDER BY count DESC
      `;
      const methodResult = await pool.query(methodSql, params);
      const byMethod: Record<string, { count: number; avg_confidence: number }> = {};
      for (const r of methodResult.rows) {
        if (r.method) byMethod[r.method] = { count: parseInt(r.count, 10), avg_confidence: parseFloat(r.avg_confidence) };
      }

      // By valuation type
      const vtSql = `
        SELECT
          v.valuation_type::text AS vtype,
          COUNT(*) AS count
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        ${where}
        GROUP BY v.valuation_type
      `;
      const vtResult = await pool.query(vtSql, params);
      const byValuationType: Record<string, number> = {};
      for (const r of vtResult.rows) {
        if (r.vtype) byValuationType[r.vtype] = parseInt(r.count, 10);
      }

      return {
        period: `${months}m`,
        total_count: parseInt(m.total_count, 10),
        completed_count: parseInt(m.completed_count, 10),
        total_value: parseFloat(m.total_value),
        avg_value: parseFloat(m.avg_value),
        median_value: parseFloat(m.median_value),
        value_p25: parseFloat(m.value_p25),
        value_p75: parseFloat(m.value_p75),
        by_region: byRegion,
        by_property_type: byPropertyType,
        by_purpose: byPurpose,
        by_method: byMethod,
        by_valuation_type: byValuationType,
      };
    } catch (err: any) {
      if (err.code === '42P01') return null; // table doesn't exist
      logger.error('ValuationAnalytics.getVolumeSummary error', err);
      throw err;
    }
  }

  /**
   * Get valuation volume history (time series).
   */
  async getVolumeHistory(opts: {
    region?: string;
    propertyType?: string;
    months?: number;
  } = {}): Promise<ValuationVolumeHistory[]> {
    try {
      const { region, propertyType, months = 24 } = opts;
      const conditions: string[] = [`v.created_at >= NOW() - INTERVAL '${months} months'`];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(p.region::text) = LOWER($${idx++})`);
        params.push(region);
      }
      if (propertyType) {
        conditions.push(`LOWER(p.property_type::text) = LOWER($${idx++})`);
        params.push(propertyType);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const sql = `
        SELECT
          TO_CHAR(DATE_TRUNC('month', v.created_at), 'YYYY-MM') AS period,
          COUNT(*) AS valuation_count,
          COALESCE(SUM(v.estimated_value), 0) AS total_value,
          COALESCE(AVG(v.estimated_value), 0) AS avg_value,
          COALESCE(AVG(v.confidence_score), 0) AS avg_confidence
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        ${where}
        GROUP BY DATE_TRUNC('month', v.created_at)
        ORDER BY DATE_TRUNC('month', v.created_at) ASC
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        period: r.period,
        valuation_count: parseInt(r.valuation_count, 10),
        total_value: parseFloat(r.total_value),
        avg_value: parseFloat(r.avg_value),
        avg_confidence: parseFloat(r.avg_confidence),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      logger.error('ValuationAnalytics.getVolumeHistory error', err);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // 3.2 Method Performance
  // --------------------------------------------------------------------------

  /**
   * Get current method performance metrics.
   * Live aggregation from valuations + comparables.
   */
  async getMethodPerformance(opts: {
    region?: string;
    propertyType?: string;
    months?: number;
  } = {}): Promise<MethodPerformance[]> {
    try {
      const { region, propertyType, months = 12 } = opts;
      const conditions: string[] = [
        `v.status = 'completed'`,
        `v.created_at >= NOW() - INTERVAL '${months} months'`,
      ];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(p.region::text) = LOWER($${idx++})`);
        params.push(region);
      }
      if (propertyType) {
        conditions.push(`LOWER(p.property_type::text) = LOWER($${idx++})`);
        params.push(propertyType);
      }

      const where = conditions.join(' AND ');

      // Unpack each method's value and confidence from the valuations table
      const methods = [
        { name: 'sales_comparison', val_col: 'sales_comparison_value', conf_col: 'sales_comparison_confidence' },
        { name: 'cost_approach', val_col: 'cost_approach_value', conf_col: 'cost_approach_confidence' },
        { name: 'income_approach', val_col: 'income_approach_value', conf_col: 'income_approach_confidence' },
        { name: 'residual_method', val_col: 'residual_value', conf_col: 'residual_confidence' },
        { name: 'profits_method', val_col: 'profits_value', conf_col: 'profits_confidence' },
        { name: 'drc_method', val_col: 'drc_value', conf_col: 'drc_confidence' },
      ];

      const results: MethodPerformance[] = [];

      for (const method of methods) {
        const sql = `
          SELECT
            COUNT(*) FILTER (WHERE v.${method.val_col} IS NOT NULL) AS usage_count,
            COUNT(*) FILTER (WHERE v.primary_method::text = '${method.name}') AS as_primary_count,
            AVG(v.${method.conf_col}) FILTER (WHERE v.${method.val_col} IS NOT NULL) AS avg_confidence,
            MIN(v.${method.conf_col}) FILTER (WHERE v.${method.val_col} IS NOT NULL) AS min_confidence,
            MAX(v.${method.conf_col}) FILTER (WHERE v.${method.val_col} IS NOT NULL) AS max_confidence,
            AVG(v.${method.val_col}) FILTER (WHERE v.${method.val_col} IS NOT NULL) AS avg_value
          FROM valuations v
          LEFT JOIN properties p ON v.property_id = p.id
          WHERE ${where}
        `;
        const res = await pool.query(sql, params);
        const r = res.rows[0];
        const usageCount = parseInt(r.usage_count || '0', 10);
        if (usageCount === 0) continue;

        // For sales_comparison, also get comparable metrics
        let avgComps: number | null = null;
        let avgSimilarity: number | null = null;
        let avgAdjPct: number | null = null;

        if (method.name === 'sales_comparison') {
          const compSql = `
            SELECT
              AVG(v.comparables_count) AS avg_comparables,
              AVG(vc.similarity_score) AS avg_similarity,
              AVG(ABS(vc.total_adjustment_percent)) AS avg_adj_pct
            FROM valuations v
            LEFT JOIN properties p ON v.property_id = p.id
            LEFT JOIN valuation_comparables vc ON vc.valuation_id = v.id AND NOT vc.is_excluded
            WHERE ${where} AND v.sales_comparison_value IS NOT NULL
          `;
          const compRes = await pool.query(compSql, params);
          if (compRes.rows.length > 0) {
            avgComps = compRes.rows[0].avg_comparables ? parseFloat(compRes.rows[0].avg_comparables) : null;
            avgSimilarity = compRes.rows[0].avg_similarity ? parseFloat(compRes.rows[0].avg_similarity) : null;
            avgAdjPct = compRes.rows[0].avg_adj_pct ? parseFloat(compRes.rows[0].avg_adj_pct) : null;
          }
        }

        results.push({
          method_name: method.name,
          usage_count: usageCount,
          as_primary_count: parseInt(r.as_primary_count || '0', 10),
          avg_weight: 0, // will be computed from reconciliation data if available
          avg_confidence: r.avg_confidence ? parseFloat(r.avg_confidence) : 0,
          min_confidence: r.min_confidence ? parseFloat(r.min_confidence) : 0,
          max_confidence: r.max_confidence ? parseFloat(r.max_confidence) : 0,
          avg_value: r.avg_value ? parseFloat(r.avg_value) : 0,
          avg_comparables_used: avgComps,
          avg_similarity_score: avgSimilarity,
          avg_adjustment_pct: avgAdjPct,
        });
      }

      // Enrich avg_weight from reconciliations
      try {
        const weightSql = `
          SELECT
            key AS method,
            AVG((value->>'weight')::numeric) AS avg_weight
          FROM valuation_reconciliations vr,
               jsonb_each(vr.method_weights) AS kv(key, value)
          JOIN valuations v ON v.id = vr.valuation_id
          LEFT JOIN properties p ON v.property_id = p.id
          WHERE ${where}
          GROUP BY key
        `;
        const weightRes = await pool.query(weightSql, params);
        const weightMap = new Map<string, number>();
        for (const wr of weightRes.rows) {
          weightMap.set(wr.method, parseFloat(wr.avg_weight));
        }
        for (const mp of results) {
          const w = weightMap.get(mp.method_name);
          if (w !== undefined) mp.avg_weight = w;
        }
      } catch {
        // Reconciliation data may not exist yet
      }

      return results.sort((a, b) => b.usage_count - a.usage_count);
    } catch (err: any) {
      if (err.code === '42P01') return [];
      logger.error('ValuationAnalytics.getMethodPerformance error', err);
      throw err;
    }
  }

  /**
   * Get method performance history (time series from snapshots or live).
   */
  async getMethodHistory(opts: {
    region?: string;
    months?: number;
  } = {}): Promise<MethodPerformanceHistoryRow[]> {
    try {
      const { region, months = 12 } = opts;
      const conditions: string[] = [`snapshot_date >= NOW() - INTERVAL '${months} months'`];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(region) = LOWER($${idx++})`);
        params.push(region);
      }

      const where = conditions.join(' AND ');

      const sql = `
        SELECT snapshot_date, method_name, usage_count, avg_confidence, avg_weight, avg_value
        FROM method_performance_history
        WHERE ${where}
        ORDER BY snapshot_date ASC, method_name
      `;
      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        snapshot_date: r.snapshot_date,
        method_name: r.method_name,
        usage_count: parseInt(r.usage_count, 10),
        avg_confidence: parseFloat(r.avg_confidence || '0'),
        avg_weight: parseFloat(r.avg_weight || '0'),
        avg_value: parseFloat(r.avg_value || '0'),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      logger.error('ValuationAnalytics.getMethodHistory error', err);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // 3.3 Valuer Performance / Leaderboard
  // --------------------------------------------------------------------------

  /**
   * Get valuer performance list (leaderboard).
   * Live aggregation from valuations for current performance.
   */
  async getValuerLeaderboard(opts: {
    region?: string;
    months?: number;
    sortBy?: 'volume' | 'quality' | 'speed' | 'value';
    limit?: number;
  } = {}): Promise<ValuerLeaderboardEntry[]> {
    try {
      const { region, months = 6, sortBy = 'volume', limit = 50 } = opts;
      const conditions: string[] = [
        `v.valuer_id IS NOT NULL`,
        `v.created_at >= NOW() - INTERVAL '${months} months'`,
      ];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(p.region::text) = LOWER($${idx++})`);
        params.push(region);
      }

      const where = conditions.join(' AND ');

      const orderMap: Record<string, string> = {
        volume: 'total_valuations DESC',
        quality: 'avg_confidence DESC',
        speed: 'avg_time_days ASC',
        value: 'total_value_ghs DESC',
      };

      const sql = `
        WITH valuer_stats AS (
          SELECT
            v.valuer_id,
            COALESCE(u.full_name, u.email, v.valuer_id::text) AS valuer_name,
            o.name AS organization_name,
            COUNT(*) AS total_valuations,
            COALESCE(AVG(v.confidence_score), 0) AS avg_confidence,
            COALESCE(AVG(
              EXTRACT(EPOCH FROM (v.updated_at - v.created_at)) / 86400.0
            ), 0) AS avg_time_days,
            COALESCE(SUM(v.estimated_value), 0) AS total_value_ghs,
            COALESCE(
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM valuation_user_overrides uo WHERE uo.valuation_id = v.id
              ))::numeric / NULLIF(COUNT(*), 0), 0
            ) AS override_rate
          FROM valuations v
          LEFT JOIN properties p ON v.property_id = p.id
          LEFT JOIN users u ON v.valuer_id = u.id
          LEFT JOIN organizations o ON v.valuer_organization_id = o.id
          WHERE ${where}
          GROUP BY v.valuer_id, u.full_name, u.email, o.name
        )
        SELECT
          *,
          ROW_NUMBER() OVER (ORDER BY ${orderMap[sortBy] || 'total_valuations DESC'}) AS rank
        FROM valuer_stats
        ORDER BY ${orderMap[sortBy] || 'total_valuations DESC'}
        LIMIT ${limit}
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        valuer_id: r.valuer_id,
        valuer_name: r.valuer_name,
        organization_name: r.organization_name,
        total_valuations: parseInt(r.total_valuations, 10),
        avg_confidence: parseFloat(r.avg_confidence),
        avg_time_to_complete_days: parseFloat(r.avg_time_days),
        override_rate: parseFloat(r.override_rate),
        total_value_ghs: parseFloat(r.total_value_ghs),
        rank: parseInt(r.rank, 10),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      logger.error('ValuationAnalytics.getValuerLeaderboard error', err);
      throw err;
    }
  }

  /**
   * Get detailed performance for a specific valuer.
   */
  async getValuerDetail(valuerId: string, months = 12): Promise<ValuerPerformance | null> {
    try {
      const sql = `
        WITH stats AS (
          SELECT
            v.valuer_id,
            COALESCE(u.full_name, u.email, v.valuer_id::text) AS valuer_name,
            o.name AS organization_name,
            COUNT(*) AS total_valuations,
            COUNT(*) FILTER (WHERE v.status = 'completed') AS completed_valuations,
            COALESCE(AVG(v.confidence_score), 0) AS avg_confidence,
            COALESCE(AVG(
              EXTRACT(EPOCH FROM (v.updated_at - v.created_at)) / 86400.0
            ), 0) AS avg_time_days,
            COALESCE(AVG(v.comparables_count), 0) AS avg_comparables,
            COALESCE(SUM(v.estimated_value), 0) AS total_value_ghs
          FROM valuations v
          LEFT JOIN users u ON v.valuer_id = u.id
          LEFT JOIN organizations o ON v.valuer_organization_id = o.id
          WHERE v.valuer_id = $1
            AND v.created_at >= NOW() - INTERVAL '${months} months'
          GROUP BY v.valuer_id, u.full_name, u.email, o.name
        ),
        override_stats AS (
          SELECT
            COALESCE(
              COUNT(DISTINCT uo.valuation_id)::numeric /
              NULLIF((SELECT COUNT(*) FROM valuations WHERE valuer_id = $1 AND created_at >= NOW() - INTERVAL '${months} months'), 0)
            , 0) AS override_rate
          FROM valuation_user_overrides uo
          JOIN valuations v2 ON v2.id = uo.valuation_id
          WHERE v2.valuer_id = $1
            AND v2.created_at >= NOW() - INTERVAL '${months} months'
        )
        SELECT s.*, os.override_rate
        FROM stats s, override_stats os
      `;

      const result = await pool.query(sql, [valuerId]);
      if (result.rows.length === 0) return null;
      const r = result.rows[0];

      // By property type
      const typeSql = `
        SELECT
          LOWER(p.property_type::text) AS ptype,
          COUNT(*) AS count
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        WHERE v.valuer_id = $1 AND v.created_at >= NOW() - INTERVAL '${months} months'
        GROUP BY LOWER(p.property_type::text)
      `;
      const typeRes = await pool.query(typeSql, [valuerId]);
      const byPType: Record<string, number> = {};
      for (const rr of typeRes.rows) {
        if (rr.ptype) byPType[rr.ptype] = parseInt(rr.count, 10);
      }

      // By region
      const regSql = `
        SELECT
          LOWER(p.region::text) AS region,
          COUNT(*) AS count
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        WHERE v.valuer_id = $1 AND v.created_at >= NOW() - INTERVAL '${months} months'
        GROUP BY LOWER(p.region::text)
      `;
      const regRes = await pool.query(regSql, [valuerId]);
      const byRegion: Record<string, number> = {};
      for (const rr of regRes.rows) {
        if (rr.region) byRegion[rr.region] = parseInt(rr.count, 10);
      }

      // Percentiles relative to all valuers
      const percentileSql = `
        WITH all_valuers AS (
          SELECT
            valuer_id,
            COUNT(*) AS total,
            AVG(confidence_score) AS avg_conf,
            AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400.0) AS avg_days
          FROM valuations
          WHERE valuer_id IS NOT NULL
            AND created_at >= NOW() - INTERVAL '${months} months'
          GROUP BY valuer_id
        )
        SELECT
          PERCENT_RANK() OVER (ORDER BY total) AS pct_volume,
          PERCENT_RANK() OVER (ORDER BY avg_conf) AS pct_quality,
          PERCENT_RANK() OVER (ORDER BY avg_days DESC) AS pct_speed
        FROM all_valuers
        WHERE valuer_id = $1
      `;
      const pctRes = await pool.query(percentileSql, [valuerId]);
      const pct = pctRes.rows[0] || { pct_volume: 0, pct_quality: 0, pct_speed: 0 };

      return {
        valuer_id: r.valuer_id,
        valuer_name: r.valuer_name,
        organization_name: r.organization_name,
        total_valuations: parseInt(r.total_valuations, 10),
        completed_valuations: parseInt(r.completed_valuations, 10),
        by_property_type: byPType,
        by_region: byRegion,
        avg_confidence: parseFloat(r.avg_confidence),
        avg_time_to_complete_days: parseFloat(r.avg_time_days),
        override_rate: parseFloat(r.override_rate),
        avg_comparables_used: parseFloat(r.avg_comparables),
        percentile_volume: Math.round(parseFloat(pct.pct_volume) * 100),
        percentile_quality: Math.round(parseFloat(pct.pct_quality) * 100),
        percentile_speed: Math.round(parseFloat(pct.pct_speed) * 100),
        total_value_ghs: parseFloat(r.total_value_ghs),
      };
    } catch (err: any) {
      if (err.code === '42P01') return null;
      logger.error('ValuationAnalytics.getValuerDetail error', err);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // 3.4 Market-Relative Analytics
  // --------------------------------------------------------------------------

  /**
   * Get market-relative analytics from snapshot table.
   */
  async getMarketRelative(opts: {
    region?: string;
    propertyType?: string;
  } = {}): Promise<MarketRelativeData[]> {
    try {
      const { region, propertyType } = opts;
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(region) = LOWER($${idx++})`);
        params.push(region);
      }
      if (propertyType) {
        conditions.push(`LOWER(property_type) = LOWER($${idx++})`);
        params.push(propertyType);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Try snapshot table first
      const sql = `
        SELECT DISTINCT ON (region, property_type)
          region, property_type,
          valuations_median, market_median, premium_discount_pct,
          valuation_trend_3m, market_trend_3m, correlation, lag_days,
          high_outlier_count, low_outlier_count, outlier_rate,
          valuation_count
        FROM market_relative_analytics
        ${where}
        ORDER BY region, property_type, snapshot_date DESC
      `;
      const result = await pool.query(sql, params);

      if (result.rows.length > 0) {
        return result.rows.map((r: any) => ({
          region: r.region,
          property_type: r.property_type,
          valuations_median: parseFloat(r.valuations_median || '0'),
          market_median: parseFloat(r.market_median || '0'),
          premium_discount_pct: parseFloat(r.premium_discount_pct || '0'),
          valuation_trend_3m: parseFloat(r.valuation_trend_3m || '0'),
          market_trend_3m: parseFloat(r.market_trend_3m || '0'),
          correlation: parseFloat(r.correlation || '0'),
          high_outlier_count: parseInt(r.high_outlier_count || '0', 10),
          low_outlier_count: parseInt(r.low_outlier_count || '0', 10),
          outlier_rate: parseFloat(r.outlier_rate || '0'),
          valuation_count: parseInt(r.valuation_count || '0', 10),
        }));
      }

      // Fallback: Live computation from valuations + market data
      return this.computeMarketRelativeLive(opts);
    } catch (err: any) {
      if (err.code === '42P01') return this.computeMarketRelativeLive(opts);
      logger.error('ValuationAnalytics.getMarketRelative error', err);
      throw err;
    }
  }

  private async computeMarketRelativeLive(opts: {
    region?: string;
    propertyType?: string;
  } = {}): Promise<MarketRelativeData[]> {
    try {
      const { region, propertyType } = opts;
      const conditions: string[] = [
        `v.status = 'completed'`,
        `v.created_at >= NOW() - INTERVAL '6 months'`,
      ];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(p.region::text) = LOWER($${idx++})`);
        params.push(region);
      }
      if (propertyType) {
        conditions.push(`LOWER(p.property_type::text) = LOWER($${idx++})`);
        params.push(propertyType);
      }

      const where = conditions.join(' AND ');

      const sql = `
        SELECT
          LOWER(p.region::text) AS region,
          LOWER(p.property_type::text) AS property_type,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY v.estimated_value) AS valuations_median,
          COUNT(*) AS valuation_count
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        WHERE ${where}
        GROUP BY LOWER(p.region::text), LOWER(p.property_type::text)
        HAVING COUNT(*) >= 3
      `;
      const result = await pool.query(sql, params);

      return result.rows.map((r: any) => ({
        region: r.region || 'unknown',
        property_type: r.property_type || null,
        valuations_median: parseFloat(r.valuations_median || '0'),
        market_median: 0, // No market data available live
        premium_discount_pct: 0,
        valuation_trend_3m: 0,
        market_trend_3m: 0,
        correlation: 0,
        high_outlier_count: 0,
        low_outlier_count: 0,
        outlier_rate: 0,
        valuation_count: parseInt(r.valuation_count, 10),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      logger.error('ValuationAnalytics.computeMarketRelativeLive error', err);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // 3.2 Quality Metrics
  // --------------------------------------------------------------------------

  /**
   * Get quality / comparable metrics.
   */
  async getQualityMetrics(opts: {
    region?: string;
    months?: number;
  } = {}): Promise<QualityMetrics | null> {
    try {
      const { region, months = 12 } = opts;
      const conditions: string[] = [
        `v.status = 'completed'`,
        `v.created_at >= NOW() - INTERVAL '${months} months'`,
      ];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(p.region::text) = LOWER($${idx++})`);
        params.push(region);
      }

      const where = conditions.join(' AND ');

      // Comparable usage metrics
      const compSql = `
        SELECT
          COALESCE(AVG(v.comparables_count), 0) AS avg_comparables,
          COALESCE(AVG(vc.similarity_score), 0) AS median_similarity,
          COALESCE(AVG(ABS(vc.total_adjustment_percent)), 0) AS avg_adj_pct,
          COALESCE(AVG(vc.days_since_sale), 0) AS freshness_avg
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        LEFT JOIN valuation_comparables vc ON vc.valuation_id = v.id AND NOT vc.is_excluded
        WHERE ${where}
      `;
      const compRes = await pool.query(compSql, params);
      const c = compRes.rows[0];

      // Override rate
      const overrideSql = `
        SELECT
          COALESCE(
            COUNT(DISTINCT uo.valuation_id)::numeric /
            NULLIF((SELECT COUNT(*) FROM valuations v LEFT JOIN properties p ON v.property_id = p.id WHERE ${where}), 0)
          , 0) AS override_rate
        FROM valuation_user_overrides uo
        JOIN valuations v ON v.id = uo.valuation_id
        LEFT JOIN properties p ON v.property_id = p.id
        WHERE ${where}
      `;
      const overrideRes = await pool.query(overrideSql, params);

      // Method spread from reconciliations
      const spreadSql = `
        SELECT COALESCE(AVG(vr.value_spread_percentage), 0) AS avg_spread
        FROM valuation_reconciliations vr
        JOIN valuations v ON v.id = vr.valuation_id
        LEFT JOIN properties p ON v.property_id = p.id
        WHERE ${where}
      `;
      const spreadRes = await pool.query(spreadSql, params);

      // Confidence distribution
      const confSql = `
        SELECT
          CASE
            WHEN v.confidence_score >= 0.9 THEN '90-100%'
            WHEN v.confidence_score >= 0.8 THEN '80-90%'
            WHEN v.confidence_score >= 0.7 THEN '70-80%'
            WHEN v.confidence_score >= 0.6 THEN '60-70%'
            WHEN v.confidence_score >= 0.5 THEN '50-60%'
            ELSE 'Below 50%'
          END AS bucket,
          COUNT(*) AS count
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        WHERE ${where} AND v.confidence_score IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket
      `;
      const confRes = await pool.query(confSql, params);

      return {
        avg_comparables_per_valuation: parseFloat(c.avg_comparables || '0'),
        median_similarity_score: parseFloat(c.median_similarity || '0'),
        avg_adjustment_pct: parseFloat(c.avg_adj_pct || '0'),
        freshness_days_avg: parseFloat(c.freshness_avg || '0'),
        avg_method_spread_pct: parseFloat(spreadRes.rows[0]?.avg_spread || '0'),
        override_rate: parseFloat(overrideRes.rows[0]?.override_rate || '0'),
        confidence_distribution: confRes.rows.map((r: any) => ({
          bucket: r.bucket,
          count: parseInt(r.count, 10),
        })),
      };
    } catch (err: any) {
      if (err.code === '42P01') return null;
      logger.error('ValuationAnalytics.getQualityMetrics error', err);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // 3.6 Sensitivity Analysis Aggregation
  // --------------------------------------------------------------------------

  /**
   * Get sensitivity analyses for a specific valuation.
   */
  async getSensitivityAnalyses(valuationId: string): Promise<any[]> {
    try {
      const sql = `
        SELECT
          id, analysis_type, valuation_method,
          config, results,
          base_case_value, best_case_value, worst_case_value,
          value_at_risk_5pct, status, created_at
        FROM valuation_sensitivity_analyses
        WHERE valuation_id = $1
        ORDER BY created_at DESC
      `;
      const result = await pool.query(sql, [valuationId]);
      return result.rows.map((r: any) => ({
        id: r.id,
        analysis_type: r.analysis_type,
        valuation_method: r.valuation_method,
        config: r.config,
        results: r.results,
        base_case_value: r.base_case_value ? parseFloat(r.base_case_value) : null,
        best_case_value: r.best_case_value ? parseFloat(r.best_case_value) : null,
        worst_case_value: r.worst_case_value ? parseFloat(r.worst_case_value) : null,
        value_at_risk_5pct: r.value_at_risk_5pct ? parseFloat(r.value_at_risk_5pct) : null,
        status: r.status,
        created_at: r.created_at,
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      logger.error('ValuationAnalytics.getSensitivityAnalyses error', err);
      throw err;
    }
  }

  /**
   * Get aggregated sensitivity stats across all valuations.
   */
  async getSensitivitySummary(opts: {
    region?: string;
    months?: number;
  } = {}): Promise<any> {
    try {
      const { region, months = 12 } = opts;
      const conditions: string[] = [`v.created_at >= NOW() - INTERVAL '${months} months'`];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(p.region::text) = LOWER($${idx++})`);
        params.push(region);
      }

      const where = conditions.join(' AND ');

      const sql = `
        SELECT
          sa.analysis_type,
          sa.valuation_method,
          COUNT(*) AS count,
          AVG(sa.base_case_value) AS avg_base,
          AVG(sa.best_case_value) AS avg_best,
          AVG(sa.worst_case_value) AS avg_worst,
          AVG(
            CASE WHEN sa.base_case_value > 0
              THEN ((sa.best_case_value - sa.worst_case_value) / sa.base_case_value) * 100
              ELSE 0
            END
          ) AS avg_range_pct
        FROM valuation_sensitivity_analyses sa
        JOIN valuations v ON v.id = sa.valuation_id
        LEFT JOIN properties p ON v.property_id = p.id
        WHERE ${where} AND sa.status = 'completed'
        GROUP BY sa.analysis_type, sa.valuation_method
        ORDER BY count DESC
      `;

      const result = await pool.query(sql, params);
      return {
        analyses: result.rows.map((r: any) => ({
          analysis_type: r.analysis_type,
          valuation_method: r.valuation_method,
          count: parseInt(r.count, 10),
          avg_base_value: r.avg_base ? parseFloat(r.avg_base) : 0,
          avg_best_case: r.avg_best ? parseFloat(r.avg_best) : 0,
          avg_worst_case: r.avg_worst ? parseFloat(r.avg_worst) : 0,
          avg_range_pct: r.avg_range_pct ? parseFloat(r.avg_range_pct) : 0,
        })),
      };
    } catch (err: any) {
      if (err.code === '42P01') return { analyses: [] };
      logger.error('ValuationAnalytics.getSensitivitySummary error', err);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // Snapshot Aggregation Job
  // --------------------------------------------------------------------------

  /**
   * Compute and store a valuation analytics snapshot.
   * Aggregates from raw valuations table into valuation_analytics_snapshots.
   */
  async computeAndStoreSnapshot(snapshotDate: Date, periodType: string = 'monthly'): Promise<void> {
    try {
      const dateStr = snapshotDate.toISOString().split('T')[0];

      // Determine the date range for the period
      let startDate: string;
      if (periodType === 'monthly') {
        startDate = new Date(snapshotDate.getFullYear(), snapshotDate.getMonth(), 1)
          .toISOString().split('T')[0];
      } else if (periodType === 'quarterly') {
        const qMonth = Math.floor(snapshotDate.getMonth() / 3) * 3;
        startDate = new Date(snapshotDate.getFullYear(), qMonth, 1)
          .toISOString().split('T')[0];
      } else {
        startDate = new Date(snapshotDate.getFullYear(), 0, 1)
          .toISOString().split('T')[0];
      }

      // Aggregate by region & property type
      const sql = `
        SELECT
          LOWER(p.region::text) AS region,
          LOWER(p.property_type::text) AS property_type,
          COUNT(*) AS valuation_count,
          SUM(v.estimated_value) AS total_value,
          AVG(v.estimated_value) AS avg_value,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY v.estimated_value) AS median_value,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY v.estimated_value) AS value_p25,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY v.estimated_value) AS value_p75,
          STDDEV(v.estimated_value) AS value_stddev,
          AVG(v.confidence_score) AS avg_confidence,
          COUNT(*) FILTER (WHERE v.primary_method::text = 'sales_comparison') AS sc_count,
          AVG(v.sales_comparison_confidence) FILTER (WHERE v.sales_comparison_value IS NOT NULL) AS sc_conf,
          COUNT(*) FILTER (WHERE v.primary_method::text = 'cost_approach') AS ca_count,
          AVG(v.cost_approach_confidence) FILTER (WHERE v.cost_approach_value IS NOT NULL) AS ca_conf,
          COUNT(*) FILTER (WHERE v.primary_method::text = 'income_approach') AS ia_count,
          AVG(v.income_approach_confidence) FILTER (WHERE v.income_approach_value IS NOT NULL) AS ia_conf,
          AVG(v.comparables_count) AS avg_comps,
          AVG(EXTRACT(EPOCH FROM (v.updated_at - v.created_at)) / 86400.0) AS avg_time_days
        FROM valuations v
        LEFT JOIN properties p ON v.property_id = p.id
        WHERE v.created_at >= $1::date AND v.created_at < ($2::date + INTERVAL '1 day')
          AND v.status = 'completed'
        GROUP BY LOWER(p.region::text), LOWER(p.property_type::text)
      `;

      const result = await pool.query(sql, [startDate, dateStr]);

      for (const r of result.rows) {
        const upsertSql = `
          INSERT INTO valuation_analytics_snapshots (
            snapshot_date, period_type, region, property_type,
            valuation_count, total_value, avg_value, median_value,
            value_p25, value_p75, value_stddev, avg_confidence_score,
            sales_comparison_count, sales_comparison_avg_confidence,
            cost_approach_count, cost_approach_avg_confidence,
            income_approach_count, income_approach_avg_confidence,
            avg_comparables_used, avg_time_to_complete_days
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT (snapshot_date, period_type, region, property_type)
          DO UPDATE SET
            valuation_count = EXCLUDED.valuation_count,
            total_value = EXCLUDED.total_value,
            avg_value = EXCLUDED.avg_value,
            median_value = EXCLUDED.median_value,
            value_p25 = EXCLUDED.value_p25,
            value_p75 = EXCLUDED.value_p75,
            value_stddev = EXCLUDED.value_stddev,
            avg_confidence_score = EXCLUDED.avg_confidence_score,
            sales_comparison_count = EXCLUDED.sales_comparison_count,
            sales_comparison_avg_confidence = EXCLUDED.sales_comparison_avg_confidence,
            cost_approach_count = EXCLUDED.cost_approach_count,
            cost_approach_avg_confidence = EXCLUDED.cost_approach_avg_confidence,
            income_approach_count = EXCLUDED.income_approach_count,
            income_approach_avg_confidence = EXCLUDED.income_approach_avg_confidence,
            avg_comparables_used = EXCLUDED.avg_comparables_used,
            avg_time_to_complete_days = EXCLUDED.avg_time_to_complete_days
        `;

        await pool.query(upsertSql, [
          dateStr, periodType, r.region, r.property_type,
          r.valuation_count, r.total_value, r.avg_value, r.median_value,
          r.value_p25, r.value_p75, r.value_stddev, r.avg_confidence,
          r.sc_count, r.sc_conf,
          r.ca_count, r.ca_conf,
          r.ia_count, r.ia_conf,
          r.avg_comps, r.avg_time_days,
        ]);
      }

      logger.info(`ValuationAnalytics snapshot computed for ${dateStr} (${periodType}): ${result.rows.length} region/type combos`);
    } catch (err: any) {
      logger.error('ValuationAnalytics.computeAndStoreSnapshot error', err);
      throw err;
    }
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const valuationAnalyticsService = new ValuationAnalyticsService();
