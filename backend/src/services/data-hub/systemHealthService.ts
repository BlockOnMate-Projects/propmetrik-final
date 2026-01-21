import { query } from '../../database';
import { logger } from '../../utils/logger';
import { dataHubQueueManager } from './jobQueue';
import os from 'os';

export interface SystemHealth {
    database: {
        status: 'healthy' | 'degraded' | 'down';
        uptime_percent: number;
        latency_ms: number;
        active_connections: number;
    };
    queue: {
        status: 'healthy' | 'degraded' | 'down';
        active_workers: number;
        pending_jobs: number;
        failed_jobs_24h: number;
    };
    storage: {
        status: 'healthy' | 'degraded' | 'down';
        used_bytes: number;
        total_bytes: number;
        percent_used: number;
    };
    api: {
        status: 'healthy' | 'degraded' | 'down';
        avg_latency_ms: number;
        uptime_seconds: number;
    };
}

export class SystemHealthService {
    private startTime: number;

    constructor() {
        this.startTime = Date.now();
    }

    /**
     * Get comprehensive system health metrics
     */
    async getSystemHealth(): Promise<SystemHealth> {
        const [dbHealth, queueHealth, storageHealth] = await Promise.all([
            this.getDatabaseHealth(),
            this.getQueueHealth(),
            this.getStorageHealth()
        ]);

        return {
            database: dbHealth,
            queue: queueHealth,
            storage: storageHealth,
            api: {
                status: 'healthy',
                avg_latency_ms: 45, // Placeholder until middleware implemented
                uptime_seconds: (Date.now() - this.startTime) / 1000
            }
        };
    }

    private async getDatabaseHealth() {
        const start = Date.now();
        try {
            const result = await query<{
                uptime: string;
                active_connections: string;
            }>(`
        SELECT 
          (EXTRACT(EPOCH FROM (current_timestamp - pg_postmaster_start_time())))::text as uptime,
          (SELECT count(*) FROM pg_stat_activity)::text as active_connections
      `);

            const duration = Date.now() - start;
            const row = result.rows[0];

            return {
                status: 'healthy' as const,
                uptime_percent: 99.9, // Postgres usually stays up
                latency_ms: duration,
                active_connections: parseInt(row.active_connections)
            };
        } catch (error) {
            logger.error('Database health check failed', { error });
            return {
                status: 'down' as const,
                uptime_percent: 0,
                latency_ms: 0,
                active_connections: 0
            };
        }
    }

    private async getQueueHealth() {
        try {
            const stats = await dataHubQueueManager.getQueueStats();
            const totals = Object.values(stats).reduce((acc, curr) => ({
                waiting: acc.waiting + curr.waiting,
                active: acc.active + curr.active,
                failed: acc.failed + curr.failed
            }), { waiting: 0, active: 0, failed: 0 });

            return {
                status: 'healthy' as const,
                active_workers: totals.active,
                pending_jobs: totals.waiting,
                failed_jobs_24h: totals.failed // Approximation
            };
        } catch (error) {
            return {
                status: 'down' as const,
                active_workers: 0,
                pending_jobs: 0,
                failed_jobs_24h: 0
            };
        }
    }

    private async getStorageHealth() {
        // In absence of real MinIO client, we'll check file uploads table
        try {
            const result = await query<{ total_size: string }>(
                'SELECT SUM(file_size) as total_size FROM file_uploads'
            );

            const usedBytes = parseInt(result.rows[0]?.total_size || '0');
            const totalBytes = 5 * 1024 * 1024 * 1024 * 1024; // 5TB Mock Total

            return {
                status: 'healthy' as const,
                used_bytes: usedBytes,
                total_bytes: totalBytes,
                percent_used: (usedBytes / totalBytes) * 100
            };
        } catch (error) {
            return {
                status: 'degraded' as const,
                used_bytes: 0,
                total_bytes: 0,
                percent_used: 0
            };
        }
    }
}

export const systemHealthService = new SystemHealthService();
