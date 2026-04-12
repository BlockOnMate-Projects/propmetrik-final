/**
 * Data Hub Analytics Service
 * Provides aggregated metrics and time-series data for Data Hub dashboards.
 *
 * Data comes from multiple sources:
 *  - etl_jobs: property scraping via scrapy (Meqasa, Gpc, Realtor International)
 *  - economic_data_sync_log: economic data scraping (BOG, WDI, NPA, GSS, GREDA, etc.)
 *  - properties: actual scraped property records
 *  - data_sources: source metadata and counters
 */

import { query } from '../../database';
import { logger } from '../../utils/logger';
import { DataSourceTier } from './types';

export interface VolumeTrendData {
  timestamp: Date;
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
  tier5: number;
  total: number;
}

export interface SourcePerformanceMetric {
  name: string;
  reliability: number;
  speed: number;
  quality: number;
}

export interface GeographicDistributionData {
  region: string;
  count: number;
  percentage: number;
}

export class DataHubAnalyticsService {
  /**
   * Get data volume aggregated by tier.
   * Combines etl_jobs records_successful, economic_data_sync_log records_saved,
   * data_sources.total_records_synced, and actual property counts.
   */
  async getVolumeByTier(): Promise<Array<{ tier: DataSourceTier; total_records: number; source_count: number }>> {
    try {
      const result = await query<{ tier: DataSourceTier; total_records: string; source_count: string }>(
        `WITH etl_totals AS (
           SELECT ds.tier,
                  COALESCE(SUM(GREATEST(j.records_successful, j.records_processed, 0)), 0) as job_records
           FROM data_sources ds
           LEFT JOIN etl_jobs j ON j.source_id = ds.id AND j.status = 'completed'
           GROUP BY ds.tier
         ),
         sync_totals AS (
           SELECT 'tier4_market_data'::text as tier,
                  COALESCE(SUM(records_saved), 0) as sync_records
           FROM economic_data_sync_log
           WHERE status IN ('success', 'partial')
         ),
         -- Count actual properties by their data_source enum mapped to tier
         property_counts AS (
           SELECT
             CASE data_source
               WHEN 'tier1_government' THEN 'tier1_government'
               WHEN 'tier2_financial' THEN 'tier2_financial'
               WHEN 'tier3_partner' THEN 'tier3_partners'
               WHEN 'tier3c_construction' THEN 'tier3_partners'
               WHEN 'tier4_user' THEN 'tier3b_user_generated'
               WHEN 'tier5_web' THEN 'tier5_public_web'
               WHEN 'manual_entry' THEN 'tier3b_user_generated'
               WHEN 'api_import' THEN 'tier3_partners'
               ELSE 'tier5_public_web'
             END as tier,
             COUNT(*) as prop_count
           FROM properties
           GROUP BY 1
         ),
         source_totals AS (
           SELECT tier,
                  COALESCE(SUM(total_records_synced), 0) as synced,
                  COUNT(DISTINCT id) as source_count
           FROM data_sources
           GROUP BY tier
         )
         SELECT
           st.tier,
           GREATEST(
             st.synced,
             COALESCE(et.job_records, 0),
             COALESCE(syt.sync_records, 0),
             COALESCE(pc.prop_count, 0)
           )::text as total_records,
           st.source_count::text
         FROM source_totals st
         LEFT JOIN etl_totals et ON st.tier = et.tier
         LEFT JOIN sync_totals syt ON st.tier::text = syt.tier
         LEFT JOIN property_counts pc ON st.tier::text = pc.tier
         ORDER BY st.tier`
      );

      return result.rows.map(row => ({
        tier: row.tier,
        total_records: parseInt(row.total_records || '0', 10),
        source_count: parseInt(row.source_count || '0', 10),
      }));
    } catch (error) {
      logger.error('Error in getVolumeByTier', { error });
      return [];
    }
  }

  /**
   * Get volume trends over time.
   * Combines ETL jobs (property scraping) and economic sync logs into a unified timeline.
   */
  async getVolumeTrends(timeRange: string = '24h'): Promise<VolumeTrendData[]> {
    try {
      let interval: string;
      let step: string;
      let truncUnit: string;

      switch (timeRange) {
        case '1h':
          interval = '1 hour'; step = '5 minutes'; truncUnit = 'minute'; break;
        case '24h':
          interval = '24 hours'; step = '1 hour'; truncUnit = 'hour'; break;
        case '7d':
          interval = '7 days'; step = '6 hours'; truncUnit = 'hour'; break;
        case '30d':
          interval = '30 days'; step = '1 day'; truncUnit = 'day'; break;
        case '90d':
          interval = '90 days'; step = '1 day'; truncUnit = 'day'; break;
        case 'all':
          interval = '365 days'; step = '7 days'; truncUnit = 'day'; break;
        default:
          interval = '24 hours'; step = '1 hour'; truncUnit = 'hour';
      }

      const truncExpr = (col: string) =>
        truncUnit === 'minute'
          ? `date_trunc('hour', ${col}) + INTERVAL '5 min' * FLOOR(EXTRACT(MINUTE FROM ${col}) / 5)`
          : `date_trunc('${truncUnit}', ${col})`;

      const result = await query<any>(
        `WITH time_buckets AS (
           SELECT generate_series(
             NOW() - INTERVAL '${interval}',
             NOW(),
             INTERVAL '${step}'
           ) AS bucket
         ),
         -- Property scraping data from etl_jobs
         etl_stats AS (
           SELECT
             ${truncExpr('j.completed_at')} as job_bucket,
             ds.tier,
             SUM(GREATEST(j.records_successful, j.records_processed, 0)) as records
           FROM etl_jobs j
           JOIN data_sources ds ON j.source_id = ds.id
           WHERE j.status = 'completed'
             AND j.completed_at >= NOW() - INTERVAL '${interval}'
             AND j.completed_at IS NOT NULL
           GROUP BY job_bucket, ds.tier
         ),
         -- Fallback: count properties created in each time bucket
         property_stats AS (
           SELECT
             ${truncExpr('p.created_at')} as prop_bucket,
             CASE p.data_source
               WHEN 'tier1_government' THEN 'tier1_government'
               WHEN 'tier2_financial' THEN 'tier2_financial'
               WHEN 'tier3_partner' THEN 'tier3_partners'
               WHEN 'tier3c_construction' THEN 'tier3_partners'
               WHEN 'tier4_user' THEN 'tier3b_user_generated'
               WHEN 'tier5_web' THEN 'tier5_public_web'
               WHEN 'manual_entry' THEN 'tier3b_user_generated'
               WHEN 'api_import' THEN 'tier3_partners'
               ELSE 'tier5_public_web'
             END as tier,
             COUNT(*) as records
           FROM properties p
           WHERE p.created_at >= NOW() - INTERVAL '${interval}'
           GROUP BY prop_bucket, 2
         ),
         -- Economic data scraping from sync logs
         sync_stats AS (
           SELECT
             ${truncExpr('completed_at')} as sync_bucket,
             SUM(records_saved) as records
           FROM economic_data_sync_log
           WHERE status IN ('success', 'partial')
             AND completed_at >= NOW() - INTERVAL '${interval}'
             AND completed_at IS NOT NULL
           GROUP BY sync_bucket
         )
         SELECT
           b.bucket as timestamp,
           GREATEST(
             COALESCE(SUM(es.records) FILTER (WHERE es.tier = 'tier1_government'), 0),
             COALESCE(SUM(ps.records) FILTER (WHERE ps.tier = 'tier1_government'), 0)
           ) as tier1,
           GREATEST(
             COALESCE(SUM(es.records) FILTER (WHERE es.tier = 'tier2_financial'), 0),
             COALESCE(SUM(ps.records) FILTER (WHERE ps.tier = 'tier2_financial'), 0)
           ) as tier2,
           GREATEST(
             COALESCE(SUM(es.records) FILTER (WHERE es.tier IN ('tier3_partners', 'tier3b_user_generated')), 0),
             COALESCE(SUM(ps.records) FILTER (WHERE ps.tier IN ('tier3_partners', 'tier3b_user_generated')), 0)
           ) as tier3,
           GREATEST(
             COALESCE(SUM(es.records) FILTER (WHERE es.tier = 'tier4_market_data'), 0),
             COALESCE(SUM(ps.records) FILTER (WHERE ps.tier = 'tier4_market_data'), 0)
           ) + COALESCE(ss.records, 0) as tier4,
           GREATEST(
             COALESCE(SUM(es.records) FILTER (WHERE es.tier = 'tier5_public_web'), 0),
             COALESCE(SUM(ps.records) FILTER (WHERE ps.tier = 'tier5_public_web'), 0)
           ) as tier5
         FROM time_buckets b
         LEFT JOIN etl_stats es ON ${truncExpr('b.bucket')} = es.job_bucket
         LEFT JOIN property_stats ps ON ${truncExpr('b.bucket')} = ps.prop_bucket
         LEFT JOIN sync_stats ss ON ${truncExpr('b.bucket')} = ss.sync_bucket
         GROUP BY b.bucket, ss.records
         ORDER BY b.bucket ASC`
      );

      return result.rows.map((row: any) => ({
        timestamp: new Date(row.timestamp),
        tier1: parseInt(row.tier1, 10),
        tier2: parseInt(row.tier2, 10),
        tier3: parseInt(row.tier3, 10),
        tier4: parseInt(row.tier4, 10),
        tier5: parseInt(row.tier5, 10),
        total: parseInt(row.tier1, 10) + parseInt(row.tier2, 10) + parseInt(row.tier3, 10) + parseInt(row.tier4, 10) + parseInt(row.tier5, 10),
      }));
    } catch (error) {
      logger.error('Error in getVolumeTrends', { error });
      return [];
    }
  }

  /**
   * Get geographic distribution from actual properties table
   */
  async getGeographicDistribution(): Promise<GeographicDistributionData[]> {
    try {
      const result = await query<{ region: string; count: string }>(
        `SELECT
         region,
         COUNT(*) as count
       FROM properties
       WHERE region IS NOT NULL
       GROUP BY region
       ORDER BY count DESC`
      );

      const totalCount = result.rows.reduce((acc, row) => acc + parseInt(row.count, 10), 0);

      return result.rows.map(row => ({
        region: row.region,
        count: parseInt(row.count, 10),
        percentage: totalCount > 0 ? Math.round((parseInt(row.count, 10) / totalCount) * 1000) / 10 : 0,
      }));
    } catch (error) {
      logger.error('Error in getGeographicDistribution', { error });
      return [];
    }
  }

  /**
   * Get source performance metrics.
   * Combines ETL job stats with economic sync log stats.
   * Quality is derived from data_sources.data_quality_score or actual property_quality_metrics.
   */
  async getSourcePerformance(): Promise<SourcePerformanceMetric[]> {
    try {
      // Get property scraping source performance from etl_jobs
      const etlResult = await query<any>(
        `SELECT
           ds.name,
           COALESCE(AVG(CASE WHEN j.status = 'completed' THEN 100.0 ELSE 0.0 END), 0) as reliability,
           COALESCE(AVG(
             CASE WHEN j.completed_at IS NOT NULL AND j.started_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (j.completed_at - j.started_at))
               ELSE NULL END
           ), 0) as avg_duration,
           COALESCE(ds.data_quality_score, 0.5) as quality_score,
           COALESCE(SUM(GREATEST(j.records_successful, j.records_processed, 0)) FILTER (WHERE j.status = 'completed'), 0) as total_records
         FROM data_sources ds
         LEFT JOIN etl_jobs j ON ds.id = j.source_id
           AND j.created_at >= NOW() - INTERVAL '30 days'
         WHERE ds.is_active = true
         GROUP BY ds.id, ds.name, ds.data_quality_score
         HAVING COUNT(j.id) > 0 OR ds.total_records_synced > 0
         ORDER BY total_records DESC
         LIMIT 10`
      );

      // Get economic sync source performance
      const syncResult = await query<any>(
        `SELECT
           source_name as name,
           COALESCE(AVG(CASE WHEN status = 'success' THEN 100.0
                             WHEN status = 'partial' THEN 75.0
                             ELSE 0.0 END), 0) as reliability,
           COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 0) as avg_duration,
           COALESCE(SUM(records_saved), 0) as total_records
         FROM economic_data_sync_log
         WHERE started_at >= NOW() - INTERVAL '30 days'
           AND completed_at IS NOT NULL
         GROUP BY source_name
         ORDER BY total_records DESC
         LIMIT 5`
      );

      const etlMetrics: SourcePerformanceMetric[] = etlResult.rows.map((row: any) => ({
        name: row.name,
        reliability: Math.round(parseFloat(row.reliability || '0')),
        speed: Math.max(0, Math.round(100 - Math.min(parseFloat(row.avg_duration || '0'), 3600) / 36)),
        quality: Math.round(parseFloat(row.quality_score || '0.5') * 100),
      }));

      const syncMetrics: SourcePerformanceMetric[] = syncResult.rows.map((row: any) => ({
        name: row.name,
        reliability: Math.round(parseFloat(row.reliability || '0')),
        speed: Math.max(0, Math.round(100 - Math.min(parseFloat(row.avg_duration || '0'), 300) / 3)),
        quality: 80, // economic data is validated at source
      }));

      return [...etlMetrics, ...syncMetrics].slice(0, 10);
    } catch (error) {
      logger.error('Error in getSourcePerformance', { error });
      return [];
    }
  }

  /**
   * Get temporal patterns (heat map data).
   * Combines etl_jobs and economic sync logs.
   */
  async getTemporalPatterns(): Promise<Array<{ day: string; hour: number; value: number }>> {
    try {
      const result = await query<any>(
        `SELECT day, hour, SUM(value) as value FROM (
           -- ETL jobs
           SELECT
             to_char(completed_at, 'Dy') as day,
             extract(hour from completed_at)::int as hour,
             COUNT(*) as value
           FROM etl_jobs
           WHERE status = 'completed'
             AND completed_at >= NOW() - INTERVAL '30 days'
             AND completed_at IS NOT NULL
           GROUP BY day, hour
           UNION ALL
           -- Economic sync logs
           SELECT
             to_char(completed_at, 'Dy') as day,
             extract(hour from completed_at)::int as hour,
             COUNT(*) as value
           FROM economic_data_sync_log
           WHERE status IN ('success', 'partial')
             AND completed_at >= NOW() - INTERVAL '30 days'
             AND completed_at IS NOT NULL
           GROUP BY day, hour
         ) combined
         GROUP BY day, hour
         ORDER BY day, hour`
      );

      return result.rows.map((row: any) => ({
        day: row.day,
        hour: parseInt(row.hour, 10),
        value: parseInt(row.value, 10),
      }));
    } catch (error) {
      logger.error('Error in getTemporalPatterns', { error });
      return [];
    }
  }
}

export const dataHubAnalyticsService = new DataHubAnalyticsService();
