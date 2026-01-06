/**
 * Economic Data Scheduler
 * 
 * Manages automated synchronization of economic data from various sources:
 * - Bank of Ghana (BOG): Monthly sync on 1st of each month
 * - World Bank WDI: Quarterly sync
 * - FX Rates: Every 5 minutes for cache, daily for persistence
 * 
 * Uses node-cron for scheduling with configurable cron expressions.
 */

import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../../../utils/logger';
import { economicDataSyncService, SyncSource } from '../scrapers/syncService';
import { fxFeedService } from '../scrapers/fxFeedService';

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Cron expression for BOG sync (default: 8 AM on 1st of each month) */
  bogSyncCron: string;
  /** Cron expression for WDI sync (default: midnight on 1st of Jan, Apr, Jul, Oct) */
  wdiSyncCron: string;
  /** Cron expression for FX cache update (default: every 5 minutes) */
  fxUpdateCron: string;
  /** Cron expression for daily FX persistence (default: 5 PM weekdays) */
  fxDailyCron: string;
  /** Timezone for all scheduled jobs */
  timezone: string;
  /** Enable/disable scheduler */
  enabled: boolean;
}

/**
 * Default scheduler configuration from environment or defaults
 */
const DEFAULT_CONFIG: SchedulerConfig = {
  bogSyncCron: process.env.BOG_SYNC_CRON || '0 8 1 * *',       // 8 AM on 1st of month
  wdiSyncCron: process.env.WDI_SYNC_CRON || '0 0 1 */3 *',     // Midnight on 1st of Jan, Apr, Jul, Oct
  fxUpdateCron: process.env.FX_UPDATE_CRON || '*/5 * * * *',   // Every 5 minutes
  fxDailyCron: process.env.FX_DAILY_CRON || '0 17 * * 1-5',    // 5 PM on weekdays
  timezone: process.env.SCHEDULER_TIMEZONE || 'Africa/Accra',
  enabled: process.env.ECONOMIC_SCHEDULER_ENABLED !== 'false',
};

/**
 * Job status tracking
 */
interface JobStatus {
  name: string;
  cronExpression: string;
  lastRun: Date | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
  nextRun: Date | null;
  runCount: number;
  errorCount: number;
}

/**
 * Economic Data Scheduler
 * 
 * Manages scheduled jobs for economic data synchronization.
 */
export class EconomicDataScheduler {
  private jobs: Map<string, ScheduledTask> = new Map();
  private jobStatus: Map<string, JobStatus> = new Map();
  private isRunning = false;
  private config: SchedulerConfig;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start all scheduled jobs
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Economic data scheduler already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Economic data scheduler disabled by configuration');
      return;
    }

    logger.info('Starting economic data scheduler', {
      bogSyncCron: this.config.bogSyncCron,
      wdiSyncCron: this.config.wdiSyncCron,
      fxUpdateCron: this.config.fxUpdateCron,
      fxDailyCron: this.config.fxDailyCron,
      timezone: this.config.timezone,
    });

    // Bank of Ghana monthly sync
    this.scheduleJob('bog-sync', this.config.bogSyncCron, async () => {
      await this.runBOGSync();
    });

    // World Bank WDI quarterly sync
    this.scheduleJob('wdi-sync', this.config.wdiSyncCron, async () => {
      await this.runWDISync();
    });

    // Real-time FX cache update (silent, no persistence)
    this.scheduleJob('fx-cache-update', this.config.fxUpdateCron, async () => {
      await this.runFXCacheUpdate();
    });

    // Daily FX close - save to database
    this.scheduleJob('fx-daily-save', this.config.fxDailyCron, async () => {
      await this.runFXDailySave();
    });

    this.isRunning = true;
    logger.info('Economic data scheduler started successfully', {
      jobCount: this.jobs.size,
    });
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Scheduler is not running');
      return;
    }

    logger.info('Stopping economic data scheduler...');

    for (const [name, job] of this.jobs) {
      job.stop();
      logger.debug(`Stopped job: ${name}`);
    }

    this.jobs.clear();
    this.isRunning = false;
    logger.info('Economic data scheduler stopped');
  }

  /**
   * Get status of all scheduled jobs
   */
  getStatus(): Record<string, JobStatus> {
    const status: Record<string, JobStatus> = {};
    for (const [name, jobStatus] of this.jobStatus) {
      status[name] = { ...jobStatus };
    }
    return status;
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Trigger immediate sync for a specific source
   * Accepts both lowercase ('bog') and uppercase ('BOG') source names
   */
  async triggerSync(source: SyncSource | 'all' | 'BOG' | 'WDI' | 'FX'): Promise<void> {
    const normalizedSource = source.toLowerCase();
    logger.info(`Manual sync triggered for: ${source}`);

    if (normalizedSource === 'all') {
      await Promise.all([
        this.runBOGSync(),
        this.runWDISync(),
        this.runFXDailySave(),
      ]);
    } else if (normalizedSource === 'bog') {
      await this.runBOGSync();
    } else if (normalizedSource === 'wdi') {
      await this.runWDISync();
    } else if (normalizedSource === 'fx') {
      await this.runFXDailySave();
    }
  }

  /**
   * Schedule a job with error handling and status tracking
   */
  private scheduleJob(name: string, cronExpression: string, handler: () => Promise<void>): void {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      logger.error(`Invalid cron expression for job ${name}: ${cronExpression}`);
      return;
    }

    // Initialize status
    this.jobStatus.set(name, {
      name,
      cronExpression,
      lastRun: null,
      lastStatus: null,
      nextRun: null,
      runCount: 0,
      errorCount: 0,
    });

    // Create scheduled task
    const task = cron.schedule(
      cronExpression,
      async () => {
        const status = this.jobStatus.get(name)!;
        status.lastRun = new Date();
        status.lastStatus = 'running';
        status.runCount++;

        try {
          await handler();
          status.lastStatus = 'success';
        } catch (error) {
          status.lastStatus = 'failed';
          status.errorCount++;
          logger.error(`Scheduled job ${name} failed`, { error });
        }
      },
      {
        timezone: this.config.timezone,
      }
    );

    this.jobs.set(name, task);
    logger.debug(`Scheduled job: ${name}`, { cronExpression });
  }

  /**
   * Run BOG synchronization
   */
  private async runBOGSync(): Promise<void> {
    logger.info('[Scheduler] Running BOG sync...');
    try {
      const result = await economicDataSyncService.sync({
        source: 'bog',
        type: 'latest',
      });
      // Handle both single result and array
      const singleResult = Array.isArray(result) ? result[0] : result;
      logger.info('[Scheduler] BOG sync complete', {
        recordsSaved: singleResult?.records_saved ?? 0,
        duration: singleResult?.completed_at && singleResult?.started_at
          ? new Date(singleResult.completed_at).getTime() - new Date(singleResult.started_at).getTime()
          : null,
      });
    } catch (error) {
      logger.error('[Scheduler] BOG sync failed', { error });
      throw error;
    }
  }

  /**
   * Run WDI synchronization
   */
  private async runWDISync(): Promise<void> {
    logger.info('[Scheduler] Running WDI sync...');
    try {
      const result = await economicDataSyncService.sync({
        source: 'wdi',
        type: 'full',
      });
      // Handle both single result and array
      const singleResult = Array.isArray(result) ? result[0] : result;
      logger.info('[Scheduler] WDI sync complete', {
        recordsSaved: singleResult?.records_saved ?? 0,
        duration: singleResult?.completed_at && singleResult?.started_at
          ? new Date(singleResult.completed_at).getTime() - new Date(singleResult.started_at).getTime()
          : null,
      });
    } catch (error) {
      logger.error('[Scheduler] WDI sync failed', { error });
      throw error;
    }
  }

  /**
   * Update FX cache (no database persistence)
   */
  private async runFXCacheUpdate(): Promise<void> {
    try {
      // Just refresh the cache by fetching all rates
      await fxFeedService.getAllRates();
      // Silent success - don't log every 5 minutes
    } catch (error) {
      // Only log errors for cache updates
      logger.warn('[Scheduler] FX cache update failed', { error });
    }
  }

  /**
   * Save daily FX rates to database
   */
  private async runFXDailySave(): Promise<void> {
    logger.info('[Scheduler] Saving daily FX rates...');
    try {
      const result = await economicDataSyncService.sync({
        source: 'fx',
        type: 'latest',
      });
      // Handle both single result and array
      const singleResult = Array.isArray(result) ? result[0] : result;
      logger.info('[Scheduler] Daily FX rates saved', {
        recordsSaved: singleResult?.records_saved ?? 0,
      });
    } catch (error) {
      logger.error('[Scheduler] Daily FX save failed', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const economicDataScheduler = new EconomicDataScheduler();
