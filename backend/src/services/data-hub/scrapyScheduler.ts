/**
 * Scrapy Automation Service
 *
 * Schedules spider runs via node-cron and dispatches them to the
 * scrapy-worker container over HTTP.  Each spider run creates an ETL
 * job for tracking, then calls the worker's /run endpoint which
 * actually invokes the Python Scrapy process.
 */

import { schedule } from 'node-cron';
import { config } from '../../config';
import { logger } from '../../utils/logger';
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
  workerUrl: string;
}

interface SpiderJob {
  spider: string;
  jobType: 'full_scrape' | 'update_scrape';
  priority: number;
  config: Record<string, unknown>;
}

interface WorkerRunResponse {
  pid: number;
  spider: string;
  status: string;
  started_at: string;
}

interface WorkerStatusResponse {
  pid: number;
  spider: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  exit_code?: number;
  started_at: string;
  finished_at?: string;
  stdout_tail?: string;
  stderr_tail?: string;
}

export class ScrapyScheduler {
  private config: ScrapyConfig;
  private scheduledJobs = new Map<string, any>();
  private runningSpiders = new Set<string>();
  private isInitialized = false;

  constructor() {
    this.config = {
      autoStart: config.scrapy?.autoStart ?? true,
      initialDelay: config.scrapy?.initialDelay ?? 30000,
      weeklySchedule: config.scrapy?.weeklySchedule ?? '0 2 * * 0',
      dailyUpdates: config.scrapy?.dailyUpdates ?? true,
      dailySchedule: config.scrapy?.dailySchedule ?? '0 3 * * *',
      enabledSpiders: config.scrapy?.enabledSpiders ?? [
        'meqasa',
        'housemaster',
        'gpc',
        'realtor',
        'airbnb_ghana',
        'daily_graphic_legal',
        'tonaton',
      ],
      concurrentSpiders: config.scrapy?.concurrentSpiders ?? 2,
      retryFailed: config.scrapy?.retryFailed ?? true,
      maxRetries: config.scrapy?.maxRetries ?? 3,
      workerUrl: config.scrapy?.workerUrl ?? 'http://scrapy-worker:5000',
    };

    logger.info('Scrapy scheduler initialized', {
      config: { ...this.config, workerUrl: this.config.workerUrl },
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (!this.config.autoStart) {
      logger.info('Scrapy auto-start disabled — manual triggering required');
      return;
    }

    // Check worker health before scheduling anything
    const workerHealthy = await this.checkWorkerHealth();
    if (!workerHealthy) {
      logger.warn('Scrapy worker not reachable — scheduler will start but jobs may fail until worker is available', {
        workerUrl: this.config.workerUrl,
      });
    }

    logger.info('Starting Scrapy scheduler', {
      enabledSpiders: this.config.enabledSpiders,
      weeklySchedule: this.config.weeklySchedule,
      dailySchedule: this.config.dailySchedule,
      workerUrl: this.config.workerUrl,
    });

    try {
      // Initial scrape after delay
      if (this.config.initialDelay > 0) {
        setTimeout(() => {
          this.triggerInitialScrape().catch(error => {
            logger.error('Initial scrape failed', { error });
          });
        }, this.config.initialDelay);

        logger.info('Initial scrape scheduled', { delayMs: this.config.initialDelay });
      }

      // Weekly full scrapes
      const weeklyJob = schedule(this.config.weeklySchedule, () => {
        this.triggerFullScrape().catch(error => {
          logger.error('Weekly scrape failed', { error });
        });
      });
      this.scheduledJobs.set('weekly', weeklyJob);

      // Daily update scrapes
      if (this.config.dailyUpdates) {
        const dailyJob = schedule(this.config.dailySchedule, () => {
          this.triggerUpdateScrape().catch(error => {
            logger.error('Daily update scrape failed', { error });
          });
        });
        this.scheduledJobs.set('daily', dailyJob);
      }

      // Hourly retry for failed jobs
      if (this.config.retryFailed) {
        const retryJob = schedule('0 * * * *', () => {
          this.retryFailedScrapes().catch(error => {
            logger.error('Retry failed scrapes error', { error });
          });
        });
        this.scheduledJobs.set('retry', retryJob);
      }

      this.isInitialized = true;
      logger.info('Scrapy scheduler started successfully');
    } catch (error) {
      logger.error('Failed to start Scrapy scheduler', { error });
      throw error;
    }
  }

  stop(): void {
    for (const [name, job] of this.scheduledJobs) {
      if (job && typeof job.stop === 'function') {
        job.stop();
      }
    }
    this.scheduledJobs.clear();
    this.isInitialized = false;
    logger.info('Scrapy scheduler stopped');
  }

  // ── Worker HTTP calls ─────────────────────────────────────────────

  private async checkWorkerHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.workerUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Call the scrapy-worker /run endpoint and poll /status until done.
   * Updates the ETL job status throughout.
   */
  private async callWorker(
    spider: string,
    scrapeType: 'full' | 'update',
    maxPages: number,
    etlJobId: string,
  ): Promise<WorkerStatusResponse> {
    const url = `${this.config.workerUrl}/run`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spider,
        scrape_type: scrapeType,
        max_pages: maxPages,
        etl_job_id: etlJobId,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Scrapy worker returned ${res.status}: ${body}`);
    }

    const runResult = (await res.json()) as WorkerRunResponse;
    const pid = runResult.pid;

    logger.info('Spider process started on worker', { spider, pid, etlJobId });

    // Mark ETL job as running
    await etlJobService.update(etlJobId, { status: 'running', started_at: new Date() });
    await etlJobService.addLog(etlJobId, 'info', `Spider process started (pid=${pid})`, {
      step: 'worker_dispatch',
      record_data: { worker_pid: pid },
    });

    // Poll status until finished (max 4 hours)
    const maxPollTime = 4 * 60 * 60 * 1000;
    const pollInterval = 30_000; // 30 seconds
    const deadline = Date.now() + maxPollTime;

    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const statusRes = await fetch(`${this.config.workerUrl}/status/${pid}`, {
          signal: AbortSignal.timeout(10000),
        });

        if (!statusRes.ok) {
          logger.warn('Status poll returned non-OK', { pid, status: statusRes.status });
          continue;
        }

        const status = (await statusRes.json()) as WorkerStatusResponse;

        if (status.status === 'running') {
          continue;
        }

        // Spider finished
        return status;
      } catch (pollError) {
        logger.warn('Status poll failed, will retry', { pid, error: pollError });
      }
    }

    // Timed out waiting
    return {
      pid,
      spider,
      status: 'timeout',
      started_at: runResult.started_at,
      stderr_tail: 'Timed out waiting for spider to complete (4h limit)',
    };
  }

  // ── Trigger methods ───────────────────────────────────────────────

  private async triggerInitialScrape(): Promise<void> {
    logger.info('Starting initial scrapy scrape');
    try {
      const recentJobs = await etlJobService.findAll({
        job_type: 'scrape',
        status: 'completed',
        from_date: new Date(Date.now() - 24 * 60 * 60 * 1000),
        limit: 10,
      });

      if (recentJobs.data.length > 0) {
        logger.info('Recent scrape jobs found, skipping initial scrape', {
          recentJobs: recentJobs.data.length,
        });
        return;
      }

      await this.triggerFullScrape();
    } catch (error) {
      logger.error('Initial scrape failed', { error });
    }
  }

  private async triggerFullScrape(): Promise<void> {
    logger.info('Starting full scrapy scrape', { spiders: this.config.enabledSpiders });

    const jobs: SpiderJob[] = this.config.enabledSpiders.map(spider => ({
      spider,
      jobType: 'full_scrape',
      priority: 5,
      config: {
        spider_name: spider,
        scrape_type: 'full',
        max_pages: 0,
      },
    }));

    await this.executeSpiderJobs(jobs);
  }

  private async triggerUpdateScrape(): Promise<void> {
    logger.info('Starting update scrapy scrape', { spiders: this.config.enabledSpiders });

    const jobs: SpiderJob[] = this.config.enabledSpiders.map(spider => ({
      spider,
      jobType: 'update_scrape',
      priority: 3,
      config: {
        spider_name: spider,
        scrape_type: 'update',
        max_pages: 10,
      },
    }));

    await this.executeSpiderJobs(jobs);
  }

  // ── Execution ─────────────────────────────────────────────────────

  private async executeSpiderJobs(jobs: SpiderJob[]): Promise<void> {
    // Process in chunks to respect concurrency limit
    const chunks: SpiderJob[][] = [];
    for (let i = 0; i < jobs.length; i += this.config.concurrentSpiders) {
      chunks.push(jobs.slice(i, i + this.config.concurrentSpiders));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(job => this.executeSpiderJob(job));
      await Promise.allSettled(promises);

      // Pause between chunks
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
  }

  private async executeSpiderJob(job: SpiderJob): Promise<void> {
    const { spider, jobType, priority, config: jobConfig } = job;

    if (this.runningSpiders.has(spider)) {
      logger.warn('Spider already running, skipping', { spider, jobType });
      return;
    }

    let etlJobId: string | undefined;

    try {
      this.runningSpiders.add(spider);

      // Look up data source (optional — log but don't block if missing)
      const dataSource = await dataSourceService.findBySlug(spider).catch(() => null);

      // Create ETL job for tracking
      const etlJob = await etlJobService.create({
        source_id: dataSource?.id,
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
      etlJobId = etlJob.id;

      logger.info('Scrapy job created, dispatching to worker', {
        spider,
        jobType,
        jobId: etlJobId,
        workerUrl: this.config.workerUrl,
      });

      // Dispatch to scrapy-worker and wait for result
      const scrapeType = jobType === 'full_scrape' ? 'full' : 'update';
      const maxPages = (jobConfig.max_pages as number) ?? 0;
      const result = await this.callWorker(spider, scrapeType, maxPages, etlJobId);

      // Update ETL job with result
      if (result.status === 'completed') {
        await etlJobService.update(etlJobId, {
          status: 'completed',
          completed_at: new Date(),
        });
        await etlJobService.addLog(etlJobId, 'info', 'Spider completed successfully', {
          step: 'completed',
          record_data: { exit_code: result.exit_code, stdout_tail: result.stdout_tail?.slice(-500) },
        });

        logger.info('Spider completed', { spider, jobType, etlJobId });
      } else {
        const errorMsg = result.stderr_tail?.slice(-500) || `Spider exited with status: ${result.status}`;
        await etlJobService.update(etlJobId, {
          status: 'failed',
          completed_at: new Date(),
          last_error: errorMsg,
        });
        await etlJobService.addLog(etlJobId, 'error', `Spider ${result.status}`, {
          step: 'failed',
          error_stack: result.stderr_tail?.slice(-500),
          record_data: { exit_code: result.exit_code },
        });

        logger.error('Spider failed', { spider, jobType, etlJobId, status: result.status });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to execute spider job', { spider, jobType, error: errMsg });

      if (etlJobId) {
        await etlJobService.update(etlJobId, {
          status: 'failed',
          completed_at: new Date(),
          last_error: errMsg,
        }).catch(() => {});
        await etlJobService.addLog(etlJobId, 'error', `Dispatch failed: ${errMsg}`).catch(() => {});
      }
    } finally {
      this.runningSpiders.delete(spider);
    }
  }

  // ── Retry ─────────────────────────────────────────────────────────

  private async retryFailedScrapes(): Promise<void> {
    try {
      const failedJobs = await etlJobService.findAll({
        job_type: 'scrape',
        status: 'failed',
        from_date: new Date(Date.now() - 6 * 60 * 60 * 1000),
        limit: 10,
      });

      if (failedJobs.data.length === 0) return;

      logger.info('Retrying failed scrape jobs', { count: failedJobs.data.length });

      for (const job of failedJobs.data) {
        if (job.retry_count >= this.config.maxRetries) continue;

        // Extract spider name from job_name (e.g. "meqasa_full_scrape")
        const jobName = job.job_name || '';
        const spiderName = jobName.replace(/_(full|update)_scrape$/, '');
        const jobType = jobName.includes('full_scrape') ? 'full_scrape' : 'update_scrape';

        await etlJobService.update(job.id, {
          status: 'queued',
          retry_count: job.retry_count + 1,
          last_error: undefined,
          started_at: undefined,
          completed_at: undefined,
        });

        // Re-dispatch to worker
        const scrapeType = jobType === 'full_scrape' ? 'full' : 'update';
        const maxPages = jobType === 'full_scrape' ? 0 : 10;

        this.callWorker(spiderName, scrapeType, maxPages, job.id)
          .then(async (result) => {
            const status = result.status === 'completed' ? 'completed' : 'failed';
            await etlJobService.update(job.id, {
              status,
              completed_at: new Date(),
              last_error: status === 'failed' ? result.stderr_tail?.slice(-500) : undefined,
            });
          })
          .catch(async (err) => {
            await etlJobService.update(job.id, {
              status: 'failed',
              completed_at: new Date(),
              last_error: err instanceof Error ? err.message : String(err),
            }).catch(() => {});
          });

        logger.info('Queued job for retry via worker', {
          jobId: job.id,
          retryCount: job.retry_count + 1,
          spider: spiderName,
        });
      }
    } catch (error) {
      logger.error('Failed to retry scrapy jobs', { error });
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  async triggerSpider(
    spider: string,
    jobType: 'full_scrape' | 'update_scrape' = 'update_scrape',
  ): Promise<string> {
    if (!this.config.enabledSpiders.includes(spider)) {
      throw new Error(`Spider '${spider}' is not enabled`);
    }

    const job: SpiderJob = {
      spider,
      jobType,
      priority: 7,
      config: {
        spider_name: spider,
        scrape_type: jobType === 'full_scrape' ? 'full' : 'update',
        max_pages: jobType === 'full_scrape' ? 0 : 10,
        manual_trigger: true,
      },
    };

    await this.executeSpiderJob(job);
    return `${spider}_${jobType}`;
  }

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

export const scrapyScheduler = new ScrapyScheduler();
