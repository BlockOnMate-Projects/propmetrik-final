/**
 * Floor Plan Analytics Service (Phase 2)
 *
 * Aggregates floor plan and measurement data for analytics dashboards.
 * Reads from valuation_floor_plans, valuation_floor_plan_rooms,
 * and ghana_building_code_standards tables.
 *
 * Analytics.md Section 3.5: Floor Plan & Measurement Analytics
 *
 * @module services/analytics/floorPlanAnalyticsService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { gssPhcHousingService } from '../data-hub/scrapers/gssPhcHousingService';

// ============================================================================
// TYPES
// ============================================================================

export interface FloorPlanSummary {
  total_floor_plans: number;
  total_rooms: number;
  avg_gfa_sqm: number;
  median_gfa_sqm: number;
  avg_nia_sqm: number;
  avg_efficiency_ratio: number;
  avg_bedrooms: number;
  avg_bathrooms: number;
  code_compliant_rate: number;
  // GSS PHC 2021 census context (Slice 2 — null when source table empty)
  district_material_quality_score?: number | null;  // cement block/metal roof quality % for region
}

export interface FloorPlanByRegion {
  region: string;
  floor_plan_count: number;
  avg_gfa_sqm: number;
  avg_nia_sqm: number;
  avg_efficiency_ratio: number;
  avg_bedrooms: number;
  avg_bathrooms: number;
  code_compliant_rate: number;
}

export interface RoomSizeAnalytics {
  room_type: string;
  count: number;
  avg_area_sqm: number;
  min_area_sqm: number;
  max_area_sqm: number;
  median_area_sqm: number;
  meets_code_pct: number;
  min_code_sqm: number | null;
}

export interface GFADistributionBucket {
  range: string;
  count: number;
  pct: number;
}

export interface ComplianceViolation {
  room_type: string;
  violation_type: string;
  count: number;
  pct: number;
}

export interface FloorPlanDetail {
  id: string;
  valuation_id: string;
  floor_number: number;
  floor_label: string;
  gfa_sqm: number;
  nia_sqm: number;
  efficiency_ratio: number;
  room_count: number;
  measurement_confidence: string;
  created_at: string;
  rooms: Array<{
    room_type: string;
    room_name: string;
    area_sqm: number;
    meets_minimum_size: boolean;
  }>;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class FloorPlanAnalyticsService {
  /**
   * Get overall floor plan summary.
   */
  async getSummary(opts: {
    region?: string;
    propertyType?: string;
    months?: number;
  } = {}): Promise<FloorPlanSummary | null> {
    try {
      const { region, propertyType, months = 24 } = opts;
      const conditions: string[] = [
        `fp.created_at >= NOW() - INTERVAL '${months} months'`,
      ];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(fp.property_region::text) = LOWER($${idx++})`);
        params.push(region);
      }
      if (propertyType) {
        conditions.push(`LOWER(p.property_type::text) = LOWER($${idx++})`);
        params.push(propertyType);
      }

      const where = conditions.join(' AND ');

      const sql = `
        SELECT
          COUNT(DISTINCT fp.id) AS total_plans,
          COUNT(DISTINCT fpr.id) AS total_rooms,
          COALESCE(AVG(fp.gross_building_area_sqm), 0) AS avg_gfa,
          COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY fp.gross_building_area_sqm), 0) AS median_gfa,
          COALESCE(AVG(fp.net_usable_area_sqm), 0) AS avg_nia,
          COALESCE(AVG(fp.efficiency_ratio), 0) AS avg_eff,
          COALESCE(AVG(bed.bed_count), 0) AS avg_bedrooms,
          COALESCE(AVG(bath.bath_count), 0) AS avg_bathrooms,
          COALESCE(
            COUNT(DISTINCT fp.id) FILTER (
              WHERE NOT EXISTS (
                SELECT 1 FROM valuation_floor_plan_rooms r
                WHERE r.floor_plan_id = fp.id AND r.meets_minimum_size = false
              )
            )::numeric / NULLIF(COUNT(DISTINCT fp.id), 0)
          , 0) AS code_compliant_rate
        FROM valuation_floor_plans fp
        LEFT JOIN valuation_floor_plan_rooms fpr ON fpr.floor_plan_id = fp.id
        LEFT JOIN valuations v ON v.id = fp.valuation_id
        LEFT JOIN properties p ON fp.property_id = p.id
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS bed_count
          FROM valuation_floor_plan_rooms br
          WHERE br.floor_plan_id = fp.id AND br.room_type = 'bedroom'
        ) bed ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS bath_count
          FROM valuation_floor_plan_rooms br
          WHERE br.floor_plan_id = fp.id AND br.room_type = 'bathroom'
        ) bath ON true
        WHERE ${where}
      `;

      const result = await pool.query(sql, params);
      if (result.rows.length === 0) return null;
      const r = result.rows[0];

      const summary: FloorPlanSummary = {
        total_floor_plans: parseInt(r.total_plans, 10),
        total_rooms: parseInt(r.total_rooms, 10),
        avg_gfa_sqm: parseFloat(r.avg_gfa),
        median_gfa_sqm: parseFloat(r.median_gfa),
        avg_nia_sqm: parseFloat(r.avg_nia),
        avg_efficiency_ratio: parseFloat(r.avg_eff),
        avg_bedrooms: parseFloat(r.avg_bedrooms),
        avg_bathrooms: parseFloat(r.avg_bathrooms),
        code_compliant_rate: parseFloat(r.code_compliant_rate),
      };

      // GSS PHC material quality context (Slice 2 — non-fatal)
      if (opts.region) {
        try {
          const materialMap = await gssPhcHousingService.getMaterialQualityByRegion();
          const regionKey = (opts.region as string).toLowerCase().replace(/\s+/g, '_');
          summary.district_material_quality_score = materialMap[regionKey] ?? null;
        } catch {
          summary.district_material_quality_score = null;
        }
      }
      return summary;
    } catch (err: any) {
      if (err.code === '42P01') return null;
      logger.error('FloorPlanAnalytics.getSummary error', err);
      throw err;
    }
  }

  /**
   * Get floor plan analytics by region.
   */
  async getByRegion(opts: {
    months?: number;
  } = {}): Promise<FloorPlanByRegion[]> {
    try {
      const { months = 24 } = opts;

      const sql = `
        SELECT
          LOWER(fp.property_region::text) AS region,
          COUNT(DISTINCT fp.id) AS plan_count,
          COALESCE(AVG(fp.gross_building_area_sqm), 0) AS avg_gfa,
          COALESCE(AVG(fp.net_usable_area_sqm), 0) AS avg_nia,
          COALESCE(AVG(fp.efficiency_ratio), 0) AS avg_eff,
          COALESCE(AVG(bed.bed_count), 0) AS avg_bedrooms,
          COALESCE(AVG(bath.bath_count), 0) AS avg_bathrooms,
          COALESCE(
            COUNT(DISTINCT fp.id) FILTER (
              WHERE NOT EXISTS (
                SELECT 1 FROM valuation_floor_plan_rooms r
                WHERE r.floor_plan_id = fp.id AND r.meets_minimum_size = false
              )
            )::numeric / NULLIF(COUNT(DISTINCT fp.id), 0)
          , 0) AS code_rate
        FROM valuation_floor_plans fp
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS bed_count
          FROM valuation_floor_plan_rooms br
          WHERE br.floor_plan_id = fp.id AND br.room_type = 'bedroom'
        ) bed ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS bath_count
          FROM valuation_floor_plan_rooms br
          WHERE br.floor_plan_id = fp.id AND br.room_type = 'bathroom'
        ) bath ON true
        WHERE fp.created_at >= NOW() - INTERVAL '${months} months'
          AND fp.property_region IS NOT NULL
        GROUP BY LOWER(fp.property_region::text)
        HAVING COUNT(DISTINCT fp.id) >= 1
        ORDER BY plan_count DESC
      `;

      const result = await pool.query(sql);
      return result.rows.map((r: any) => ({
        region: r.region,
        floor_plan_count: parseInt(r.plan_count, 10),
        avg_gfa_sqm: parseFloat(r.avg_gfa),
        avg_nia_sqm: parseFloat(r.avg_nia),
        avg_efficiency_ratio: parseFloat(r.avg_eff),
        avg_bedrooms: parseFloat(r.avg_bedrooms),
        avg_bathrooms: parseFloat(r.avg_bathrooms),
        code_compliant_rate: parseFloat(r.code_rate),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      logger.error('FloorPlanAnalytics.getByRegion error', err);
      throw err;
    }
  }

  /**
   * Get room size analytics by room type.
   */
  async getRoomAnalytics(opts: {
    region?: string;
    propertyType?: string;
    months?: number;
  } = {}): Promise<RoomSizeAnalytics[]> {
    try {
      const { region, propertyType, months = 24 } = opts;
      const conditions: string[] = [
        `fp.created_at >= NOW() - INTERVAL '${months} months'`,
      ];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(fp.property_region::text) = LOWER($${idx++})`);
        params.push(region);
      }
      if (propertyType) {
        conditions.push(`LOWER(p.property_type::text) = LOWER($${idx++})`);
        params.push(propertyType);
      }

      const where = conditions.join(' AND ');

      const sql = `
        SELECT
          fpr.room_type,
          COUNT(*) AS count,
          AVG(fpr.area_sqm) AS avg_area,
          MIN(fpr.area_sqm) AS min_area,
          MAX(fpr.area_sqm) AS max_area,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY fpr.area_sqm) AS median_area,
          COALESCE(
            COUNT(*) FILTER (WHERE fpr.meets_minimum_size = true)::numeric / NULLIF(COUNT(*), 0)
          , 0) AS meets_code_pct,
          gbcs.minimum_area_sqm AS min_code_sqm
        FROM valuation_floor_plan_rooms fpr
        JOIN valuation_floor_plans fp ON fp.id = fpr.floor_plan_id
        LEFT JOIN valuations v ON v.id = fp.valuation_id
        LEFT JOIN properties p ON fp.property_id = p.id
        LEFT JOIN ghana_building_code_standards gbcs ON
          gbcs.room_type = fpr.room_type AND gbcs.property_type = 'residential'
        WHERE ${where}
        GROUP BY fpr.room_type, gbcs.minimum_area_sqm
        ORDER BY count DESC
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        room_type: r.room_type,
        count: parseInt(r.count, 10),
        avg_area_sqm: parseFloat(r.avg_area),
        min_area_sqm: parseFloat(r.min_area),
        max_area_sqm: parseFloat(r.max_area),
        median_area_sqm: parseFloat(r.median_area),
        meets_code_pct: parseFloat(r.meets_code_pct),
        min_code_sqm: r.min_code_sqm ? parseFloat(r.min_code_sqm) : null,
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      logger.error('FloorPlanAnalytics.getRoomAnalytics error', err);
      throw err;
    }
  }

  /**
   * Get GFA size distribution for histogram.
   */
  async getGFADistribution(opts: {
    region?: string;
    propertyType?: string;
    months?: number;
  } = {}): Promise<GFADistributionBucket[]> {
    try {
      const { region, propertyType, months = 24 } = opts;
      const conditions: string[] = [
        `fp.created_at >= NOW() - INTERVAL '${months} months'`,
        `fp.gross_building_area_sqm IS NOT NULL`,
        `fp.gross_building_area_sqm > 0`,
      ];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(fp.property_region::text) = LOWER($${idx++})`);
        params.push(region);
      }
      if (propertyType) {
        conditions.push(`LOWER(p.property_type::text) = LOWER($${idx++})`);
        params.push(propertyType);
      }

      const where = conditions.join(' AND ');

      const sql = `
        WITH total AS (
          SELECT COUNT(*) AS cnt
          FROM valuation_floor_plans fp
          LEFT JOIN valuations v ON v.id = fp.valuation_id
          LEFT JOIN properties p ON fp.property_id = p.id
          WHERE ${where}
        ),
        bucketed AS (
          SELECT
            CASE
              WHEN fp.gross_building_area_sqm < 50 THEN '0-50'
              WHEN fp.gross_building_area_sqm < 100 THEN '50-100'
              WHEN fp.gross_building_area_sqm < 150 THEN '100-150'
              WHEN fp.gross_building_area_sqm < 200 THEN '150-200'
              WHEN fp.gross_building_area_sqm < 300 THEN '200-300'
              WHEN fp.gross_building_area_sqm < 500 THEN '300-500'
              ELSE '500+'
            END AS range,
            COUNT(*) AS count
          FROM valuation_floor_plans fp
          LEFT JOIN valuations v ON v.id = fp.valuation_id
          LEFT JOIN properties p ON fp.property_id = p.id
          WHERE ${where}
          GROUP BY range
        )
        SELECT b.range, b.count, COALESCE(b.count::numeric / NULLIF(t.cnt, 0), 0) AS pct
        FROM bucketed b, total t
        ORDER BY CASE b.range
          WHEN '0-50' THEN 1
          WHEN '50-100' THEN 2
          WHEN '100-150' THEN 3
          WHEN '150-200' THEN 4
          WHEN '200-300' THEN 5
          WHEN '300-500' THEN 6
          ELSE 7
        END
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        range: r.range,
        count: parseInt(r.count, 10),
        pct: parseFloat(r.pct),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      logger.error('FloorPlanAnalytics.getGFADistribution error', err);
      throw err;
    }
  }

  /**
   * Get Ghana Building Code compliance violations.
   */
  async getComplianceViolations(opts: {
    region?: string;
    months?: number;
  } = {}): Promise<ComplianceViolation[]> {
    try {
      const { region, months = 24 } = opts;
      const conditions: string[] = [
        `fp.created_at >= NOW() - INTERVAL '${months} months'`,
        `fpr.meets_minimum_size = false`,
      ];
      const params: any[] = [];
      let idx = 1;

      if (region) {
        conditions.push(`LOWER(fp.property_region::text) = LOWER($${idx++})`);
        params.push(region);
      }

      const where = conditions.join(' AND ');

      const sql = `
        WITH violations AS (
          SELECT
            fpr.room_type,
            'below_minimum_area' AS violation_type,
            COUNT(*) AS count
          FROM valuation_floor_plan_rooms fpr
          JOIN valuation_floor_plans fp ON fp.id = fpr.floor_plan_id
          WHERE ${where}
          GROUP BY fpr.room_type
        ),
        total AS (
          SELECT COUNT(*) AS total_rooms
          FROM valuation_floor_plan_rooms fpr
          JOIN valuation_floor_plans fp ON fp.id = fpr.floor_plan_id
          WHERE fp.created_at >= NOW() - INTERVAL '${months} months'
          ${region ? `AND LOWER(fp.property_region::text) = LOWER($${idx - 1})` : ''}
        )
        SELECT v.room_type, v.violation_type, v.count,
               COALESCE(v.count::numeric / NULLIF(t.total_rooms, 0), 0) AS pct
        FROM violations v, total t
        ORDER BY v.count DESC
      `;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        room_type: r.room_type,
        violation_type: r.violation_type,
        count: parseInt(r.count, 10),
        pct: parseFloat(r.pct),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      logger.error('FloorPlanAnalytics.getComplianceViolations error', err);
      throw err;
    }
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const floorPlanAnalyticsService = new FloorPlanAnalyticsService();
