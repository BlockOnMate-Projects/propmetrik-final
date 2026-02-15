/**
 * Scrapy Automation Service
 * Automatically manages scrapy spiders for property data collection
 */

import { schedule } from 'node-cron';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { dataHubQueueManager } from './jobQueue';
import { dataSourceService } from './dataSourceService';
import { etlJobService } from './etlJobService';

interface ScrapyConfig {
  autoStart: boolean;
  initialDelay: number;
  weeklySchedule: string;
  dailyUpdates: boolean;
  dailySchedule: string;
  enabledSpiders: string[];
  concurrentSpiders: number;
  retryFailed: boolean;
  maxRetries: number;
}

interface SpiderJob {
  spider: string;
  jobType: 'full_scrape' | 'update_scrape';
  priority: number;
  config: Record<string, unknown>;
}

export class ScrapyScheduler {
  private config: ScrapyConfig;
  private scheduledJobs = new Map<string, any>();
  private runningSpiders = new Set<string>();
  private isInitialized = false;

  constructor() {
    const scrapyConfig = (config as any).scrapy;
    this.config = {
      autoStart: scrapyConfig?.autoStart ?? true,
      initialDelay: scrapyConfig?.initialDelay ?? 30000, // 30 seconds after startup
      weeklySchedule: scrapyConfig?.weeklySchedule ?? '0 2 * * 0', // Sunday 2 AM
      dailyUpdates: scrapyConfig?.dailyUpdates ?? true,
      dailySchedule: scrapyConfig?.dailySchedule ?? '0 3 * * *', // Daily 3 AM
      enabledSpiders: scrapyConfig?.enabledSpiders ?? [
        'meqasa',
        'housemaster',
        'gpc',
        'realtor',
        'jiji',
        'daily_graphic_legal',  // Critical data: Litigation risk
        'airbnb_ghana',         // Critical data: Short-stay metrics
      ],
      concurrentSpiders: scrapyConfig?.concurrentSpiders ?? 2,
      retryFailed: scrapyConfig?.retryFailed ?? true,
      maxRetries: scrapyConfig?.maxRetries ?? 3,
    };

    logger.info('Scrapy scheduler initialized', {
      config: this.config
    });
  }

  /**
   * Start the scrapy scheduler
   */
  async start(): Promise<void> {
    if (!this.config.autoStart) {
      logger.info('Scrapy auto-start disabled - manual triggering required');
      return;
    }

    logger.info('Starting Scrapy scheduler', {
      enabledSpiders: this.config.enabledSpiders,
      weeklySchedule: this.config.weeklySchedule,
      dailySchedule: this.config.dailySchedule,
    });

    try {
      // Schedule initial scrape after delay
      if (this.config.initialDelay > 0) {
        setTimeout(() => {
          this.triggerInitialScrape().catch(error => {
            logger.error('Initial scrape failed', { error });
          });
        }, this.config.initialDelay);

        logger.info('Initial scrape scheduled', {
          delayMs: this.config.initialDelay
        });
      }

      // Schedule weekly full scrapes
      const weeklyJob = schedule(this.config.weeklySchedule, () => {
        this.triggerFullScrape().catch(error => {
          logger.error('Weekly scrape failed', { error });
        });
      });

      this.scheduledJobs.set('weekly', weeklyJob);
      logger.info('Weekly scrape scheduled', {
        cron: this.config.weeklySchedule
      });

      // Schedule daily updates if enabled
      if (this.config.dailyUpdates) {
        const dailyJob = schedule(this.config.dailySchedule, () => {
          this.triggerUpdateScrape().catch(error => {
            logger.error('Daily update scrape failed', { error });
          });
        });

        this.scheduledJobs.set('daily', dailyJob);
        logger.info('Daily update scrape scheduled', {
          cron: this.config.dailySchedule
        });
      }

      // Retry failed jobs every hour
      if (this.config.retryFailed) {
        const retryJob = schedule('0 * * * *', () => {
          this.retryFailedScrapes().catch(error => {
            logger.error('Retry failed scrapes error', { error });
          });
        });

        this.scheduledJobs.set('retry', retryJob);
        logger.info('Failed scrape retry scheduled');
      }

      this.isInitialized = true;
      logger.info('Scrapy scheduler started successfully');

    } catch (error) {
      logger.error('Failed to start Scrapy scheduler', { error });
      throw error;
    }
  }

  /**
   * Stop the scrapy scheduler
   */
  stop(): void {
    logger.info('Stopping Scrapy scheduler');

    // Stop all scheduled jobs
    for (const [name, job] of this.scheduledJobs) {
      if (job && typeof job.stop === 'function') {
        job.stop();
        logger.debug('Stopped scheduled job', { name });
      }
    }

    this.scheduledJobs.clear();
    this.isInitialized = false;
    logger.info('Scrapy scheduler stopped');
  }

  /**
   * Trigger initial scrape on startup
   */
  private async triggerInitialScrape(): Promise<void> {
    logger.info('Starting initial scrapy scrape');

    try {
      // Check if we need initial scraping by looking at recent data
      const recentJobs = await etlJobService.findAll({
        job_type: 'scrape',
        status: 'completed',
        from_date: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        limit: 10
      });

      if (recentJobs.data.length > 0) {
        logger.info('Recent scrape jobs found, skipping initial scrape', {
          recentJobs: recentJobs.data.length
        });
        return;
      }

      // Trigger full scrape for all enabled spiders
      await this.triggerFullScrape();

    } catch (error) {
      logger.error('Initial scrape failed', { error });
      throw error;
    }
  }

  /**
   * Trigger full scrape of all enabled spiders
   */
  private async triggerFullScrape(): Promise<void> {
    logger.info('Starting full scrapy scrape', {
      spiders: this.config.enabledSpiders
    });

    const spiderJobs: SpiderJob[] = this.config.enabledSpiders.map(spider => ({
      spider,
      jobType: 'full_scrape',
      priority: 5,
      config: {
        spider_name: spider,
        scrape_type: 'full',
        max_pages: 0, // 0 = all pages
        concurrent_requests: 8,
        download_delay: 1,
      }
    }));

    await this.executeSpiderJobs(spiderJobs);
  }

  /**
   * Trigger update scrape (recent listings only)
   */
  private async triggerUpdateScrape(): Promise<void> {
    logger.info('Starting update scrapy scrape', {
      spiders: this.config.enabledSpiders
    });

    const spiderJobs: SpiderJob[] = this.config.enabledSpiders.map(spider => ({
      spider,
      jobType: 'update_scrape',
      priority: 3,
      config: {
        spider_name: spider,
        scrape_type: 'update',
        max_pages: 10, // Only recent pages
        concurrent_requests: 4,
        download_delay: 2,
        days_back: 7, // Only scrape listings from last 7 days
      }
    }));

    await this.executeSpiderJobs(spiderJobs);
  }

  /**
   * Execute spider jobs with concurrency control
   */
  private async executeSpiderJobs(jobs: SpiderJob[]): Promise<void> {
    const chunks: SpiderJob[][] = [];
    for (let i = 0; i < jobs.length; i += this.config.concurrentSpiders) {
      chunks.push(jobs.slice(i, i + this.config.concurrentSpiders));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(job => this.executeSpiderJob(job));
      await Promise.allSettled(promises);

      // Wait between chunks to avoid overwhelming the system
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second delay
      }
    }
  }

  /**
   * Execute a single spider job
   */
  private async executeSpiderJob(job: SpiderJob): Promise<void> {
    const { spider, jobType, priority, config: jobConfig } = job;

    if (this.runningSpiders.has(spider)) {
      logger.warn('Spider already running, skipping', { spider, jobType });
      return;
    }

    try {
      this.runningSpiders.add(spider);

      // Get data source for spider
      const dataSource = await dataSourceService.findBySlug(spider);
      if (!dataSource) {
        logger.warn('Data source not found for spider', { spider });
        return;
      }

      // Create ETL job
      const etlJob = await etlJobService.create({
        source_id: dataSource.id,
        job_type: 'scrape',
        job_name: `${spider}_${jobType}`,
        priority,
        config: {
          ...jobConfig,
          automated: true,
          scheduler: 'scrapy_scheduler',
          triggered_at: new Date().toISOString(),
        },
        max_retries: this.config.maxRetries,
      });

      logger.info('Scrapy job created', {
        spider,
        jobType,
        jobId: etlJob.id,
        dataSourceId: dataSource.id
      });

      // Also add to queue for immediate processing
      await dataHubQueueManager.addJob('scrape', {
        dataSourceId: dataSource.id,
        batchId: etlJob.id,
        options: {
          fullSync: jobType === 'full_scrape',
        },
      });

    } catch (error) {
      logger.error('Failed to execute spider job', {
        spider,
        jobType,
        error
      });
    } finally {
      this.runningSpiders.delete(spider);
    }
  }

  /**
   * Retry recently failed scrape jobs
   */
  private async retryFailedScrapes(): Promise<void> {
    try {
      // Find failed jobs from last 6 hours
      const failedJobs = await etlJobService.findAll({
        job_type: 'scrape',
        status: 'failed',
        from_date: new Date(Date.now() - 6 * 60 * 60 * 1000),
        limit: 10
      });

      if (failedJobs.data.length === 0) {
        return;
      }

      logger.info('Retrying failed scrape jobs', {
        count: failedJobs.data.length
      });

      for (const job of failedJobs.data) {
        if (job.retry_count >= this.config.maxRetries) {
          continue;
        }

        // Reset job status to queued for retry
        await etlJobService.update(job.id, {
          status: 'queued',
          retry_count: job.retry_count + 1,
          last_error: undefined,
          started_at: undefined,
          completed_at: undefined,
        });

        logger.info('Queued job for retry', {
          jobId: job.id,
          retryCount: job.retry_count + 1,
          spider: job.job_name
        });
      }

    } catch (error) {
      logger.error('Failed to retry scrapy jobs', { error });
    }
  }

  /**
   * Manually trigger spider
   */
  async triggerSpider(spider: string, jobType: 'full_scrape' | 'update_scrape' = 'update_scrape'): Promise<string> {
    if (!this.config.enabledSpiders.includes(spider)) {
      throw new Error(`Spider '${spider}' is not enabled`);
    }

    const job: SpiderJob = {
      spider,
      jobType,
      priority: 7, // Higher priority for manual triggers
      config: {
        spider_name: spider,
        scrape_type: jobType === 'full_scrape' ? 'full' : 'update',
        max_pages: jobType === 'full_scrape' ? 0 : 10,
        manual_trigger: true,
      }
    };

    await this.executeSpiderJob(job);
    return `${spider}_${jobType}`;
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    config: ScrapyConfig;
    scheduledJobs: string[];
    runningSpiders: string[];
  } {
    return {
      isRunning: this.isInitialized,
      config: this.config,
      scheduledJobs: Array.from(this.scheduledJobs.keys()),
      runningSpiders: Array.from(this.runningSpiders),
    };
  }
}

// Export singleton instance
export const scrapyScheduler = new ScrapyScheduler();