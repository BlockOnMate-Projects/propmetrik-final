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
import { query } from '../../database';
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
        'ownkey',
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
    const workerHealth = await this.checkWorkerHealth();
    if (!workerHealth.healthy) {
      logger.warn('Scrapy worker not reachable — scheduler will start but scrape batches are skipped until it is available', {
        workerUrl: this.config.workerUrl,
        reason: workerHealth.reason,
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

      // Reap stuck running/queued jobs every 30 minutes (+ once shortly after startup, since a
      // restart is the most common way jobs get orphaned).
      const reaperJob = schedule('*/30 * * * *', () => {
        this.reapStuckJobs().catch(error => logger.error('Reaper error', { error }));
      });
      this.scheduledJobs.set('reaper', reaperJob);
      setTimeout(() => {
        this.reapStuckJobs().catch(error => logger.error('Startup reaper error', { error }));
      }, 60_000);

      // Scraper degradation check every 6 hours (failure-rate + listing freshness).
      const healthJob = schedule('0 */6 * * *', () => {
        this.checkScraperHealth().catch(error => logger.error('Scraper health check error', { error }));
      });
      this.scheduledJobs.set('health', healthJob);

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

  private async checkWorkerHealth(): Promise<{ healthy: boolean; reason?: string }> {
    try {
      const res = await fetch(`${this.config.workerUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { healthy: true };
      return { healthy: false, reason: `worker /health returned HTTP ${res.status}` };
    } catch (e) {
      // A bare `fetch failed` here means the scrapy-worker container is unreachable (down, OOM-killed,
      // or not on propmetrik-network). Surface the concrete cause instead of a generic failure.
      return { healthy: false, reason: e instanceof Error ? e.message : String(e) };
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
      // Only skip if there are recent jobs that actually scraped records
      const recentJobs = await etlJobService.findAll({
        job_type: 'scrape',
        status: 'completed',
        from_date: new Date(Date.now() - 24 * 60 * 60 * 1000),
        limit: 10,
      });

      const jobsWithRecords = recentJobs.data.filter(
        (j: any) => (j.records_successful || 0) > 0 || (j.records_processed || 0) > 0
      );

      if (jobsWithRecords.length > 0) {
        logger.info('Recent successful scrape jobs found, skipping initial scrape', {
          recentJobs: recentJobs.data.length,
          withRecords: jobsWithRecords.length,
        });
        return;
      }

      if (recentJobs.data.length > 0) {
        logger.warn('Recent scrape jobs found but none have records — re-triggering scrape', {
          recentJobs: recentJobs.data.length,
        });
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
    // Preflight: if the worker is unreachable, DON'T create a batch of ETL jobs that would each be
    // dispatched and immediately fail with "fetch failed" (this is what produced 1000+ junk failed
    // rows). One clear log, no jobs created — the freshness check will still flag the stall.
    const health = await this.checkWorkerHealth();
    if (!health.healthy) {
      logger.error('Scrapy worker unreachable — skipping scrape batch (no jobs dispatched)', {
        workerUrl: this.config.workerUrl,
        reason: health.reason,
        skippedSpiders: jobs.map(j => j.spider),
      });
      return;
    }

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
        // Count properties created/updated during this job's run
        let recordsProcessed = 0;
        try {
          const countResult = await query<{ cnt: string }>(
            `SELECT COUNT(*) as cnt FROM properties
             WHERE external_source = $1
               AND updated_at >= (SELECT started_at FROM etl_jobs WHERE id = $2)`,
            [spider, etlJobId]
          );
          recordsProcessed = parseInt(countResult.rows[0]?.cnt || '0', 10);
        } catch { /* ignore count errors */ }

        await etlJobService.complete(etlJobId, {
          records_processed: recordsProcessed,
          records_successful: recordsProcessed,
          records_failed: 0,
          records_skipped: 0,
        });
        await etlJobService.addLog(etlJobId, 'info', 'Spider completed successfully', {
          step: 'completed',
          record_data: { exit_code: result.exit_code, records: recordsProcessed, stdout_tail: result.stdout_tail?.slice(-500) },
        });

        // Update data source sync stats
        try {
          const ds = await dataSourceService.findBySlug(spider);
          if (ds) {
            await dataSourceService.updateSyncStatus(ds.id, 'completed', {
              records_synced: recordsProcessed,
            });
          }
        } catch { /* ignore */ }

        logger.info('Spider completed', { spider, jobType, etlJobId, recordsProcessed });
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

      // Don't retry into an unreachable worker — it would just re-fail every job.
      const health = await this.checkWorkerHealth();
      if (!health.healthy) {
        logger.warn('Skipping scrape retry — worker unreachable', {
          workerUrl: this.config.workerUrl, reason: health.reason, pending: failedJobs.data.length,
        });
        return;
      }

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

  // ── Resilience: reaper + health ───────────────────────────────────

  /**
   * Reap scrape jobs left dangling in `running`/`queued`. The in-memory `runningSpiders` guard is
   * lost on a process restart, and a worker crash mid-poll leaves the DB row `running` forever
   * (this is what produced the 66 orphaned rows). Anything past the spider hard limit (4h) + 1h
   * grace is dead — mark it failed so retry/metrics see the truth.
   */
  private async reapStuckJobs(): Promise<void> {
    try {
      const res = await query<{ id: string }>(
        `UPDATE etl_jobs
           SET status = 'failed',
               completed_at = NOW(),
               updated_at = NOW(),
               last_error = LEFT(COALESCE(last_error || ' | ', '')
                 || 'Reaped: stuck in ' || status::text || ' beyond 5h (process restart or worker crash)', 500)
         WHERE job_type = 'scrape'
           AND status IN ('running', 'queued')
           AND COALESCE(started_at, created_at) < NOW() - INTERVAL '5 hours'
         RETURNING id`,
      );
      if (res.rowCount && res.rowCount > 0) {
        logger.warn('Reaped stuck scrape jobs', { count: res.rowCount });
      }
    } catch (error) {
      logger.error('Failed to reap stuck scrape jobs', { error });
    }
  }

  /**
   * Surface scraper degradation that would otherwise rot silently: a high job-failure rate, or no
   * net-new listings in days (the scraper is effectively dead even if the cron keeps firing).
   */
  private async checkScraperHealth(): Promise<void> {
    try {
      const fr = await query<{ total: string; failed: string }>(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'failed') AS failed
           FROM etl_jobs WHERE job_type = 'scrape' AND created_at > NOW() - INTERVAL '24 hours'`,
      );
      const total = Number(fr.rows[0]?.total || 0);
      const failed = Number(fr.rows[0]?.failed || 0);
      if (total >= 5 && failed / total >= 0.5) {
        logger.error('Scraper failure rate high in last 24h', {
          total, failed, failureRate: `${Math.round((failed / total) * 100)}%`,
          hint: 'Check the scrapy-worker container is running/healthy on propmetrik-network.',
        });
      }

      const fresh = await query<{ last: Date | null }>(
        `SELECT MAX(first_seen_at) AS last FROM properties WHERE first_seen_at IS NOT NULL`,
      );
      const last = fresh.rows[0]?.last ? new Date(fresh.rows[0].last) : null;
      const daysStale = last ? (Date.now() - last.getTime()) / 86_400_000 : Infinity;
      if (daysStale > 3) {
        logger.error('Scraper produced no net-new listings recently', {
          lastNewListing: last ? last.toISOString() : 'never',
          daysStale: Number.isFinite(daysStale) ? Math.round(daysStale) : null,
          hint: 'Scheduler may be firing but the worker is not ingesting — verify worker reachability.',
        });
      }
    } catch (error) {
      logger.error('Scraper health check failed', { error });
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
