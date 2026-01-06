/**
 * ETL Job Service
 * Manages ETL job execution, tracking, and logging
 */

import { query, transaction } from '../../database';
import { logger } from '../../utils/logger';
import {
  EtlJob,
  EtlJobLog,
  CreateEtlJobInput,
  UpdateEtlJobInput,
  EtlJobFilters,
  PaginatedResult,
  EtlJobStatus,
} from './types';
import os from 'os';

export class EtlJobService {
  /**
   * Get all ETL jobs with optional filtering and pagination
   */
  async findAll(filters: EtlJobFilters = {}): Promise<PaginatedResult<EtlJob>> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      source_id,
      job_type,
      status,
      from_date,
      to_date,
    } = filters;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (source_id) {
      conditions.push(`source_id = $${paramIndex++}`);
      params.push(source_id);
    }
    if (job_type) {
      conditions.push(`job_type = $${paramIndex++}`);
      params.push(job_type);
    }
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (from_date) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(to_date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const validSortColumns = ['created_at', 'started_at', 'completed_at', 'status', 'job_type'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM etl_jobs ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query<EtlJob>(
      `SELECT * FROM etl_jobs ${whereClause}
       ORDER BY ${safeSortBy} ${safeSortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  /**
   * Get a single ETL job by ID
   */
  async findById(id: string): Promise<EtlJob | null> {
    const result = await query<EtlJob>(
      'SELECT * FROM etl_jobs WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new ETL job
   */
  async create(input: CreateEtlJobInput): Promise<EtlJob> {
    const {
      source_id,
      job_type,
      job_name,
      priority = 0,
      scheduled_at,
      config = {},
      max_retries = 3,
    } = input;

    const result = await query<EtlJob>(
      `INSERT INTO etl_jobs (
        source_id, job_type, job_name, priority,
        scheduled_at, config, max_retries, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      ) RETURNING *`,
      [
        source_id, job_type, job_name, priority,
        scheduled_at, JSON.stringify(config), max_retries,
        scheduled_at ? 'pending' : 'queued',
      ]
    );

    logger.info('Created ETL job', { 
      id: result.rows[0].id, 
      job_type, 
      source_id 
    });

    return result.rows[0];
  }

  /**
   * Update an ETL job
   */
  async update(id: string, input: UpdateEtlJobInput): Promise<EtlJob | null> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const fields: (keyof UpdateEtlJobInput)[] = [
      'status', 'records_total', 'records_processed', 'records_successful',
      'records_failed', 'records_skipped', 'progress_percentage',
      'properties_created', 'properties_updated', 'properties_deduplicated',
      'started_at', 'completed_at', 'duration_seconds',
      'error_count', 'error_log', 'last_error', 'retry_count',
      'result', 'worker_id', 'worker_hostname'
    ];

    for (const field of fields) {
      if (input[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        const value = field === 'error_log' || field === 'result'
          ? JSON.stringify(input[field])
          : input[field];
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    const result = await query<EtlJob>(
      `UPDATE etl_jobs 
       SET ${updates.join(', ')} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      params
    );

    return result.rows[0] || null;
  }

  /**
   * Start an ETL job (mark as running)
   */
  async start(id: string, workerId?: string): Promise<EtlJob | null> {
    const result = await query<EtlJob>(
      `UPDATE etl_jobs 
       SET status = 'running', 
           started_at = NOW(),
           worker_id = $2,
           worker_hostname = $3
       WHERE id = $1 AND status IN ('pending', 'queued', 'retrying')
       RETURNING *`,
      [id, workerId || `worker-${process.pid}`, os.hostname()]
    );

    if (result.rows[0]) {
      logger.info('Started ETL job', { id, workerId });
    }

    return result.rows[0] || null;
  }

  /**
   * Complete an ETL job successfully
   */
  async complete(
    id: string, 
    stats: {
      records_processed: number;
      records_successful: number;
      records_failed: number;
      records_skipped?: number;
      properties_created?: number;
      properties_updated?: number;
      properties_deduplicated?: number;
      result?: Record<string, unknown>;
    }
  ): Promise<EtlJob | null> {
    const job = await this.findById(id);
    if (!job || !job.started_at) {
      return null;
    }

    const duration = Math.floor((Date.now() - new Date(job.started_at).getTime()) / 1000);
    const progressPct = stats.records_processed > 0 
      ? 100 
      : (job.records_total > 0 ? (stats.records_processed / job.records_total) * 100 : 0);

    const result = await query<EtlJob>(
      `UPDATE etl_jobs 
       SET status = 'completed',
           completed_at = NOW(),
           duration_seconds = $2,
           records_processed = $3,
           records_successful = $4,
           records_failed = $5,
           records_skipped = COALESCE($6, records_skipped),
           progress_percentage = $7,
           properties_created = COALESCE($8, properties_created),
           properties_updated = COALESCE($9, properties_updated),
           properties_deduplicated = COALESCE($10, properties_deduplicated),
           result = COALESCE($11, result)
       WHERE id = $1
       RETURNING *`,
      [
        id, duration,
        stats.records_processed, stats.records_successful, stats.records_failed,
        stats.records_skipped, progressPct,
        stats.properties_created, stats.properties_updated, stats.properties_deduplicated,
        stats.result ? JSON.stringify(stats.result) : null,
      ]
    );

    if (result.rows[0]) {
      logger.info('Completed ETL job', { 
        id, 
        duration,
        ...stats 
      });
    }

    return result.rows[0] || null;
  }

  /**
   * Fail an ETL job
   */
  async fail(id: string, error: string, shouldRetry: boolean = true): Promise<EtlJob | null> {
    const job = await this.findById(id);
    if (!job) {
      return null;
    }

    const duration = job.started_at 
      ? Math.floor((Date.now() - new Date(job.started_at).getTime()) / 1000)
      : 0;

    const canRetry = shouldRetry && job.retry_count < job.max_retries;
    const newStatus: EtlJobStatus = canRetry ? 'retrying' : 'failed';

    // Add to error log
    const errorLog = Array.isArray(job.error_log) ? job.error_log : [];
    errorLog.push({
      timestamp: new Date().toISOString(),
      error,
      record_id: undefined,
    });

    const result = await query<EtlJob>(
      `UPDATE etl_jobs 
       SET status = $2,
           completed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE completed_at END,
           duration_seconds = $3,
           error_count = error_count + 1,
           last_error = $4,
           error_log = $5,
           retry_count = CASE WHEN $2 = 'retrying' THEN retry_count + 1 ELSE retry_count END
       WHERE id = $1
       RETURNING *`,
      [id, newStatus, duration, error, JSON.stringify(errorLog)]
    );

    if (result.rows[0]) {
      logger.error('ETL job failed', { 
        id, 
        error,
        retry: canRetry,
        retryCount: job.retry_count 
      });
    }

    return result.rows[0] || null;
  }

  /**
   * Cancel an ETL job
   */
  async cancel(id: string, reason?: string): Promise<EtlJob | null> {
    const result = await query<EtlJob>(
      `UPDATE etl_jobs 
       SET status = 'cancelled',
           completed_at = NOW(),
           last_error = $2
       WHERE id = $1 AND status IN ('pending', 'queued', 'running', 'retrying')
       RETURNING *`,
      [id, reason || 'Cancelled by user']
    );

    if (result.rows[0]) {
      logger.info('Cancelled ETL job', { id, reason });
    }

    return result.rows[0] || null;
  }

  /**
   * Add a log entry to an ETL job
   */
  async addLog(
    jobId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    options?: {
      step?: string;
      record_id?: string;
      record_data?: Record<string, unknown>;
      error_stack?: string;
    }
  ): Promise<EtlJobLog> {
    const result = await query<EtlJobLog>(
      `INSERT INTO etl_job_logs (
        job_id, level, message, step, record_id, record_data, error_stack
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        jobId, level, message,
        options?.step, options?.record_id,
        options?.record_data ? JSON.stringify(options.record_data) : null,
        options?.error_stack,
      ]
    );

    return result.rows[0];
  }

  /**
   * Get logs for an ETL job
   */
  async getLogs(
    jobId: string,
    options?: {
      level?: 'debug' | 'info' | 'warn' | 'error';
      limit?: number;
      offset?: number;
    }
  ): Promise<EtlJobLog[]> {
    const { level, limit = 100, offset = 0 } = options || {};
    
    let sql = 'SELECT * FROM etl_job_logs WHERE job_id = $1';
    const params: unknown[] = [jobId];

    if (level) {
      sql += ' AND level = $2';
      params.push(level);
    }

    sql += ' ORDER BY logged_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await query<EtlJobLog>(sql, params);
    return result.rows;
  }

  /**
   * Get pending/queued jobs for processing
   */
  async getQueuedJobs(limit: number = 10): Promise<EtlJob[]> {
    const result = await query<EtlJob>(
      `SELECT * FROM etl_jobs 
       WHERE status IN ('queued', 'retrying')
         AND (scheduled_at IS NULL OR scheduled_at <= NOW())
       ORDER BY priority DESC, created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Get running jobs (for monitoring)
   */
  async getRunningJobs(): Promise<EtlJob[]> {
    const result = await query<EtlJob>(
      `SELECT * FROM etl_jobs 
       WHERE status = 'running'
       ORDER BY started_at ASC`
    );
    return result.rows;
  }

  /**
   * Update progress for a running job
   */
  async updateProgress(
    id: string,
    processed: number,
    total: number,
    stats?: {
      successful?: number;
      failed?: number;
      skipped?: number;
    }
  ): Promise<void> {
    const percentage = total > 0 ? (processed / total) * 100 : 0;

    await query(
      `UPDATE etl_jobs 
       SET records_processed = $2,
           records_total = $3,
           progress_percentage = $4,
           records_successful = COALESCE($5, records_successful),
           records_failed = COALESCE($6, records_failed),
           records_skipped = COALESCE($7, records_skipped)
       WHERE id = $1`,
      [
        id, processed, total, percentage,
        stats?.successful, stats?.failed, stats?.skipped,
      ]
    );
  }

  /**
   * Get job statistics summary
   */
  async getStats(options?: { from_date?: Date; to_date?: Date }): Promise<{
    total: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
    avg_duration: number;
    success_rate: number;
  }> {
    let whereClause = '';
    const params: unknown[] = [];

    if (options?.from_date) {
      whereClause += ' WHERE created_at >= $1';
      params.push(options.from_date);
    }
    if (options?.to_date) {
      whereClause += params.length > 0 ? ' AND' : ' WHERE';
      whereClause += ` created_at <= $${params.length + 1}`;
      params.push(options.to_date);
    }

    const result = await query<{
      total: string;
      completed: string;
      failed: string;
      avg_duration: string;
    }>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         AVG(duration_seconds) FILTER (WHERE status = 'completed') as avg_duration
       FROM etl_jobs${whereClause}`,
      params
    );

    const statusResult = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM etl_jobs${whereClause} GROUP BY status`,
      params
    );

    const typeResult = await query<{ job_type: string; count: string }>(
      `SELECT job_type, COUNT(*) as count FROM etl_jobs${whereClause} GROUP BY job_type`,
      params
    );

    const row = result.rows[0];
    const total = parseInt(row.total, 10);
    const completed = parseInt(row.completed, 10);
    const failed = parseInt(row.failed, 10);

    return {
      total,
      by_status: statusResult.rows.reduce((acc, r) => {
        acc[r.status] = parseInt(r.count, 10);
        return acc;
      }, {} as Record<string, number>),
      by_type: typeResult.rows.reduce((acc, r) => {
        acc[r.job_type] = parseInt(r.count, 10);
        return acc;
      }, {} as Record<string, number>),
      avg_duration: parseFloat(row.avg_duration || '0'),
      success_rate: total > 0 ? (completed / (completed + failed)) * 100 : 0,
    };
  }

  /**
   * Cleanup old completed/failed jobs
   */
  async cleanup(daysToKeep: number = 30): Promise<number> {
    const result = await query(
      `DELETE FROM etl_jobs 
       WHERE status IN ('completed', 'failed', 'cancelled')
         AND created_at < NOW() - INTERVAL '1 day' * $1`,
      [daysToKeep]
    );

    const deleted = result.rowCount || 0;
    if (deleted > 0) {
      logger.info('Cleaned up old ETL jobs', { deleted, daysToKeep });
    }

    return deleted;
  }
}

export const etlJobService = new EtlJobService();
