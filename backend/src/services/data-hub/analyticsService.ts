/**
 * Data Hub Analytics Service
 * Provides aggregated metrics and time-series data for Data Hub dashboards
 */

import { query } from '../../database';
import { logger } from '../../utils/logger';
import { DataSourceTier, RegionCode } from './types';

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
  reliability: number; // success rate
  speed: number; // latency score
  quality: number; // avg quality score
}

export interface GeographicDistributionData {
  region: string;
  count: number;
  percentage: number;
}

export class DataHubAnalyticsService {
  /**
   * Get data volume aggregated by tier
   */
  async getVolumeByTier(): Promise<Array<{ tier: DataSourceTier; total_records: number; source_count: number }>> {
    try {
      const result = await query<{ tier: DataSourceTier; total_records: string; source_count: string }>(
        `SELECT 
         tier, 
         SUM(total_records_synced) as total_records,
         COUNT(*) as source_count
       FROM data_sources
       GROUP BY tier
       ORDER BY tier`
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
   * Get volume trends over time (time-series)
   */
  async getVolumeTrends(timeRange: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<VolumeTrendData[]> {
    try {
      const interval = timeRange === '1h' ? '1 hour' :
        timeRange === '24h' ? '24 hours' :
          timeRange === '7d' ? '7 days' : '30 days';

      const step = timeRange === '1h' ? '5 minutes' :
        timeRange === '24h' ? '1 hour' :
          timeRange === '7d' ? '6 hours' : '1 day';

      // This query generates a time series bucketed by the step interval
      // and calculates records processed per tier in each bucket
      const result = await query<any>(
        `WITH time_buckets AS (
         SELECT generate_series(
           NOW() - INTERVAL '${interval}',
           NOW(),
           INTERVAL '${step}'
         ) AS bucket
       ),
       job_stats AS (
         SELECT 
           date_trunc('hour', j.completed_at) as job_hour,
           ds.tier,
           SUM(j.records_successful) as records
         FROM etl_jobs j
         JOIN data_sources ds ON j.source_id = ds.id
         WHERE j.status = 'completed'
           AND j.completed_at >= NOW() - INTERVAL '${interval}'
         GROUP BY job_hour, ds.tier
       )
       SELECT 
         b.bucket as timestamp,
         COALESCE(SUM(js.records) FILTER (WHERE js.tier = 'tier1_government'), 0) as tier1,
         COALESCE(SUM(js.records) FILTER (WHERE js.tier = 'tier2_financial'), 0) as tier2,
         COALESCE(SUM(js.records) FILTER (WHERE js.tier = 'tier3_partners'), 0) as tier3,
         COALESCE(SUM(js.records) FILTER (WHERE js.tier = 'tier4_market_data'), 0) as tier4,
         COALESCE(SUM(js.records) FILTER (WHERE js.tier = 'tier5_public_web'), 0) as tier5
       FROM time_buckets b
       LEFT JOIN job_stats js ON date_trunc('hour', b.bucket) = js.job_hour
       GROUP BY b.bucket
       ORDER BY b.bucket ASC`
      );

      return result.rows.map(row => ({
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
   * Get geographic distribution of data
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
        percentage: totalCount > 0 ? (parseInt(row.count, 10) / totalCount) * 100 : 0,
      }));
    } catch (error) {
      logger.error('Error in getGeographicDistribution', { error });
      return [];
    }
  }

  /**
   * Get source performance metrics
   */
  async getSourcePerformance(): Promise<SourcePerformanceMetric[]> {
    try {
      const result = await query<any>(
        `SELECT 
         ds.name,
         AVG(CASE WHEN j.status = 'completed' THEN 100.0 ELSE 0.0 END) as reliability,
         AVG(EXTRACT(EPOCH FROM (j.completed_at - j.started_at))) as avg_duration,
         AVG(q.overall_score) as avg_quality
       FROM data_sources ds
       LEFT JOIN etl_jobs j ON ds.id = j.source_id
       LEFT JOIN (
         SELECT property_id, AVG(overall_score) as overall_score
         FROM property_quality_metrics
         GROUP BY property_id
       ) q ON ds.id = (SELECT source_id FROM properties WHERE id = q.property_id LIMIT 1)
       WHERE j.started_at >= NOW() - INTERVAL '30 days'
       GROUP BY ds.id, ds.name
       ORDER BY reliability DESC
       LIMIT 10`
      );

      return result.rows.map(row => ({
        name: row.name,
        reliability: parseFloat(row.reliability || '0'),
        speed: Math.max(0, 100 - (parseFloat(row.avg_duration || '0') / 3600 * 100)),
        quality: parseFloat(row.avg_quality || '0') * 100,
      }));
    } catch (error) {
      logger.error('Error in getSourcePerformance', { error });
      return [];
    }
  }

  /**
   * Get temporal patterns (heat map data)
   */
  async getTemporalPatterns(): Promise<Array<{ day: string; hour: number; value: number }>> {
    try {
      const result = await query<any>(
        `SELECT 
         to_char(completed_at, 'Dy') as day,
         extract(hour from completed_at) as hour,
         COUNT(*) as value
       FROM etl_jobs
       WHERE status = 'completed'
         AND completed_at >= NOW() - INTERVAL '30 days'
       GROUP BY day, hour
       ORDER BY day, hour`
      );

      return result.rows.map(row => ({
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
