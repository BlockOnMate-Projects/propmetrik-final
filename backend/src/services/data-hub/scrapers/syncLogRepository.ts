/**
 * Sync Log Repository
 * 
 * Database operations for tracking sync history and source health
 */

import { query } from '../../../database';
import { logger } from '../../../utils/logger';
import { SyncResult, SyncLogRecord } from './types';

// =====================================================
// SYNC LOG OPERATIONS
// =====================================================

export class SyncLogRepository {
  /**
   * Start a new sync operation and return the sync ID
   */
  async startSync(
    sourceName: string,
    syncType: 'full' | 'incremental' | 'manual' | 'scheduled' = 'scheduled',
    triggeredBy: string = 'scheduler'
  ): Promise<string> {
    try {
      const result = await query<{ id: string }>(
        `SELECT start_economic_sync($1, $2, $3) as id`,
        [sourceName, syncType, triggeredBy]
      );
      return result.rows[0].id;
    } catch (error) {
      // Fallback if function doesn't exist yet
      const result = await query<{ id: string }>(
        `INSERT INTO economic_data_sync_log (source_name, sync_type, triggered_by, status)
         VALUES ($1, $2, $3, 'running')
         RETURNING id`,
        [sourceName, syncType, triggeredBy]
      );
      return result.rows[0].id;
    }
  }

  /**
   * Complete a sync operation with results
   */
  async completeSync(
    syncId: string,
    result: SyncResult
  ): Promise<void> {
    try {
      await query(
        `SELECT complete_economic_sync($1, $2, $3, $4, $5, $6, $7)`,
        [
          syncId,
          result.status,
          result.records_fetched,
          result.records_saved,
          result.records_failed,
          result.errors.length > 0 ? result.errors[0].message : null,
          JSON.stringify(result.metadata),
        ]
      );
    } catch (error) {
      // Fallback if function doesn't exist yet
      await query(
        `UPDATE economic_data_sync_log
         SET status = $2,
             completed_at = NOW(),
             records_fetched = $3,
             records_saved = $4,
             records_failed = $5,
             error_message = $6,
             metadata = $7
         WHERE id = $1`,
        [
          syncId,
          result.status,
          result.records_fetched,
          result.records_saved,
          result.records_failed,
          result.errors.length > 0 ? result.errors[0].message : null,
          JSON.stringify(result.metadata),
        ]
      );
    }
  }

  /**
   * Get latest sync for a source
   */
  async getLatestSync(sourceName: string): Promise<SyncLogRecord | null> {
    const result = await query<SyncLogRecord>(
      `SELECT * FROM economic_data_sync_log
       WHERE source_name = $1
       ORDER BY started_at DESC
       LIMIT 1`,
      [sourceName]
    );
    return result.rows[0] || null;
  }

  /**
   * Get sync history for a source
   */
  async getSyncHistory(
    sourceName: string,
    limit: number = 10
  ): Promise<SyncLogRecord[]> {
    const result = await query<SyncLogRecord>(
      `SELECT * FROM economic_data_sync_log
       WHERE source_name = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [sourceName, limit]
    );
    return result.rows;
  }

  /**
   * Get all recent syncs across all sources
   */
  async getRecentSyncs(limit: number = 20): Promise<SyncLogRecord[]> {
    const result = await query<SyncLogRecord>(
      `SELECT * FROM economic_data_sync_log
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Get source health status
   */
  async getSourceHealth(sourceName: string): Promise<{
    is_healthy: boolean;
    last_successful_sync: Date | null;
    consecutive_failures: number;
    success_rate: number;
  } | null> {
    const result = await query<{
      is_healthy: boolean;
      last_successful_sync: Date;
      consecutive_failures: number;
      total_syncs: number;
      successful_syncs: number;
    }>(
      `SELECT is_healthy, last_successful_sync, consecutive_failures, 
              total_syncs, successful_syncs
       FROM economic_data_source_health
       WHERE source_name = $1`,
      [sourceName]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      is_healthy: row.is_healthy,
      last_successful_sync: row.last_successful_sync,
      consecutive_failures: row.consecutive_failures,
      success_rate: row.total_syncs > 0
        ? (row.successful_syncs / row.total_syncs) * 100
        : 0,
    };
  }

  /**
   * Get all sources health status
   */
  async getAllSourcesHealth(): Promise<Array<{
    source_name: string;
    is_healthy: boolean;
    is_enabled: boolean;
    sync_frequency: string;
    last_successful_sync: Date | null;
    consecutive_failures: number;
    success_rate: number;
  }>> {
    const result = await query<{
      source_name: string;
      is_healthy: boolean;
      is_enabled: boolean;
      sync_frequency: string;
      last_successful_sync: Date;
      consecutive_failures: number;
      total_syncs: number;
      successful_syncs: number;
    }>(
      `SELECT source_name, is_healthy, is_enabled, sync_frequency,
              last_successful_sync, consecutive_failures, total_syncs, successful_syncs
       FROM economic_data_source_health
       ORDER BY source_name`
    );

    return result.rows.map((row) => ({
      source_name: row.source_name,
      is_healthy: row.is_healthy,
      is_enabled: row.is_enabled,
      sync_frequency: row.sync_frequency,
      last_successful_sync: row.last_successful_sync,
      consecutive_failures: row.consecutive_failures,
      success_rate: row.total_syncs > 0
        ? Math.round((row.successful_syncs / row.total_syncs) * 100)
        : 0,
    }));
  }

  /**
   * Update source enabled status
   */
  async setSourceEnabled(sourceName: string, enabled: boolean): Promise<void> {
    await query(
      `UPDATE economic_data_source_health
       SET is_enabled = $2, updated_at = NOW()
       WHERE source_name = $1`,
      [sourceName, enabled]
    );
  }

  /**
   * Calculate and return sync statistics
   */
  async getSyncStats(days: number = 30): Promise<{
    total_syncs: number;
    successful_syncs: number;
    failed_syncs: number;
    total_records_saved: number;
    average_duration_ms: number;
  }> {
    const result = await query<{
      total_syncs: number;
      successful_syncs: number;
      failed_syncs: number;
      total_records: number;
      avg_duration: number;
    }>(
      `SELECT 
        COUNT(*) as total_syncs,
        COUNT(*) FILTER (WHERE status = 'success') as successful_syncs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_syncs,
        SUM(records_saved) as total_records,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as avg_duration
       FROM economic_data_sync_log
       WHERE started_at >= NOW() - INTERVAL '${days} days'
         AND completed_at IS NOT NULL`
    );

    const row = result.rows[0];
    return {
      total_syncs: Number(row.total_syncs) || 0,
      successful_syncs: Number(row.successful_syncs) || 0,
      failed_syncs: Number(row.failed_syncs) || 0,
      total_records_saved: Number(row.total_records) || 0,
      average_duration_ms: Math.round(Number(row.avg_duration) || 0),
    };
  }
}

export const syncLogRepository = new SyncLogRepository();
