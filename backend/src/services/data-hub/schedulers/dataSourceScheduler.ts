/**
 * Data Source Scheduler
 * 
 * Manages automated synchronization of all data sources across tiers 1-5
 * according to their configured sync frequencies.
 */

import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../../../utils/logger';
import { dataSourceService } from '../dataSourceService';
import { dataHubQueueManager, DataHubQueueManager } from '../jobQueue';
import { DataSource } from '../types';

export interface DataSourceSchedulerConfig {
  enabled: boolean;
  timezone: string;
  checkInterval: string; // How often to check for due syncs
}

const DEFAULT_CONFIG: DataSourceSchedulerConfig = {
  enabled: process.env.DATA_SOURCE_SCHEDULER_ENABLED !== 'false',
  timezone: process.env.SCHEDULER_TIMEZONE || 'Africa/Accra',
  checkInterval: process.env.SYNC_CHECK_INTERVAL || '*/5 * * * *', // Every 5 minutes
};

interface SchedulerStats {
  totalSources: number;
  activeSources: number;
  nextSync: Date | null;
  lastCheck: Date | null;
  syncsToday: number;
  errors: number;
}

/**
 * Data Source Scheduler
 * 
 * Automatically schedules data source syncs based on their sync_frequency
 */
export class DataSourceScheduler {
  private checkTask: ScheduledTask | null = null;
  private isRunning = false;
  private config: DataSourceSchedulerConfig;
  private stats: SchedulerStats = {
    totalSources: 0,
    activeSources: 0,
    nextSync: null,
    lastCheck: null,
    syncsToday: 0,
    errors: 0,
  };

  constructor(config: Partial<DataSourceSchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Data source scheduler already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Data source scheduler disabled by configuration');
      return;
    }

    logger.info('Starting data source scheduler', {
      checkInterval: this.config.checkInterval,
      timezone: this.config.timezone,
    });

    // Schedule periodic checks for due syncs
    this.checkTask = cron.schedule(
      this.config.checkInterval,
      async () => {
        await this.checkForDueSyncs();
      },
      {
        timezone: this.config.timezone,
      }
    );

    this.isRunning = true;

    // Run initial check
    this.checkForDueSyncs().catch(error => {
      logger.error('Initial sync check failed', { error });
    });

    logger.info('Data source scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Data source scheduler not running');
      return;
    }

    if (this.checkTask) {
      this.checkTask.destroy();
      this.checkTask = null;
    }

    this.isRunning = false;
    logger.info('Data source scheduler stopped');
  }

  /**
   * Check for data sources that are due for sync
   */
  private async checkForDueSyncs(): Promise<void> {
    try {
      this.stats.lastCheck = new Date();

      // Get all data sources due for sync
      const dueDataSources = await dataSourceService.getDueForSync();

      logger.debug('Checking for due syncs', {
        dueCount: dueDataSources.length,
        checkTime: this.stats.lastCheck
      });

      for (const dataSource of dueDataSources) {
        try {
          await this.scheduleSync(dataSource);
          this.stats.syncsToday++;
        } catch (error) {
          this.stats.errors++;
          logger.error('Failed to schedule sync for data source', {
            dataSourceId: dataSource.id,
            name: dataSource.name,
            error
          });
        }
      }

      // Update stats
      const allSources = await dataSourceService.findAll({ limit: 1000 });
      this.stats.totalSources = allSources.meta.total;
      this.stats.activeSources = allSources.data.filter(s => s.is_active).length;
      this.stats.nextSync = await this.getNextScheduledSync();

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to check for due syncs', { error });
    }
  }

  /**
   * Schedule a sync for a specific data source
   */
  private async scheduleSync(dataSource: DataSource): Promise<void> {
    logger.info('Scheduling sync for data source', {
      id: dataSource.id,
      name: dataSource.name,
      tier: dataSource.tier,
      frequency: dataSource.sync_frequency,
    });

    // Add job to the appropriate queue
    await dataHubQueueManager.addJob(
      DataHubQueueManager.QUEUES.DATA_INGESTION,
      {
        dataSourceId: dataSource.id,
        options: {
          fullSync: this.shouldDoFullSync(dataSource),
          priority: this.getSyncPriority(dataSource),
        },
        userId: 'scheduler',
      },
      {
        priority: this.getSyncPriority(dataSource),
        delay: this.getScheduleDelay(dataSource),
      }
    );

    // Schedule next sync
    await dataSourceService.scheduleNextSync(dataSource.id);
  }

  /**
   * Determine if this should be a full sync vs incremental
   */
  private shouldDoFullSync(dataSource: DataSource): boolean {
    // Full sync conditions:
    // 1. Never synced before
    // 2. Last sync was more than 7 days ago
    // 3. Last sync failed
    if (!dataSource.last_sync_at) return true;
    if (dataSource.last_sync_status === 'failed') return true;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    return new Date(dataSource.last_sync_at) < weekAgo;
  }

  /**
   * Get sync priority based on data source tier
   */
  private getSyncPriority(dataSource: DataSource): number {
    const tierPriorities = {
      'tier1_government': 100,      // Highest priority
      'tier2_financial': 80,
      'tier3_partners': 60,
      'tier3b_user_generated': 50,
      'tier4_market_data': 70,
      'tier5_public_web': 30,       // Lowest priority
    };

    return tierPriorities[dataSource.tier] || 40;
  }

  /**
   * Get delay before scheduling (stagger syncs to avoid overloading)
   */
  private getScheduleDelay(dataSource: DataSource): number {
    // Higher tier sources get scheduled immediately
    // Lower tier sources get delayed to spread load
    const tierDelays = {
      'tier1_government': 0,        // Immediate
      'tier2_financial': 30000,     // 30 seconds
      'tier3_partners': 60000,      // 1 minute
      'tier3b_user_generated': 90000, // 1.5 minutes
      'tier4_market_data': 45000,   // 45 seconds
      'tier5_public_web': 120000,   // 2 minutes
    };

    return tierDelays[dataSource.tier] || 60000;
  }

  /**
   * Get the next scheduled sync time
   */
  private async getNextScheduledSync(): Promise<Date | null> {
    try {
      const result = await dataSourceService.findAll({
        is_active: true,
        limit: 1000,
      });

      const nextSyncs = result.data
        .map(ds => ds.next_sync_at ? new Date(ds.next_sync_at) : null)
        .filter((date): date is Date => date !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      return nextSyncs.length > 0 ? nextSyncs[0] : null;
    } catch (error) {
      logger.error('Failed to get next scheduled sync', { error });
      return null;
    }
  }

  /**
   * Get scheduler status and statistics
   */
  getStatus(): SchedulerStats & { isRunning: boolean } {
    return {
      ...this.stats,
      isRunning: this.isRunning,
    };
  }

  /**
   * Manually trigger sync for a specific data source
   */
  async triggerSync(dataSourceId: string, fullSync: boolean = false): Promise<void> {
    const dataSource = await dataSourceService.findById(dataSourceId);
    if (!dataSource) {
      throw new Error(`Data source not found: ${dataSourceId}`);
    }

    if (!dataSource.is_active) {
      throw new Error(`Data source is not active: ${dataSource.name}`);
    }

    logger.info('Manually triggering sync', {
      dataSourceId,
      name: dataSource.name,
      fullSync,
    });

    await dataHubQueueManager.addJob(
      DataHubQueueManager.QUEUES.DATA_INGESTION,
      {
        dataSourceId,
        options: { fullSync },
        userId: 'manual',
      },
      {
        priority: 999, // Highest priority for manual triggers
      }
    );
  }

  /**
   * Manually trigger sync for all active sources of a specific tier
   */
  async triggerTierSync(tier: string): Promise<void> {
    const result = await dataSourceService.findAll({
      tier: tier as any,
      is_active: true,
      limit: 1000,
    });

    logger.info('Triggering tier sync', { tier, count: result.data.length });

    for (const dataSource of result.data) {
      await this.triggerSync(dataSource.id);
      // Small delay between syncs to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  /**
   * Reset sync schedules for all data sources
   */
  async resetAllSchedules(): Promise<void> {
    logger.info('Resetting all sync schedules');

    const result = await dataSourceService.findAll({ limit: 1000 });

    for (const dataSource of result.data) {
      await dataSourceService.scheduleNextSync(dataSource.id);
    }

    logger.info('All sync schedules reset', { count: result.data.length });
  }
}

// Export singleton instance
export const dataSourceScheduler = new DataSourceScheduler();