/**
 * ETL Background Job Processor
 * Polls database for queued ETL jobs and processes them through the appropriate services
 */

import { etlJobService } from './etlJobService';
import { dataSourceService } from './dataSourceService';
import { geocodingService } from './geocodingService';
// import { DataEnrichmentService, DeduplicationService, QualityScoringService } from './etlPipelineServices';
import { logger } from '../../utils/logger';
import { EtlJob } from './types';

export class EtlJobProcessor {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private readonly pollInterval = 10000; // 10 seconds
  private readonly maxConcurrentJobs = 3;
  private runningJobs = new Set<string>();

  /**
   * Start the background processor
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('ETL job processor already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting ETL job processor', { 
      pollInterval: this.pollInterval, 
      maxConcurrentJobs: this.maxConcurrentJobs 
    });

    // Start polling for jobs
    this.intervalId = setInterval(() => {
      this.processQueuedJobs().catch(error => {
        logger.error('Error in ETL job processor', { error });
      });
    }, this.pollInterval);

    // Process any existing jobs immediately
    this.processQueuedJobs().catch(error => {
      logger.error('Error in initial ETL job processing', { error });
    });
  }

  /**
   * Stop the background processor
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    logger.info('Stopped ETL job processor');
  }

  /**
   * Process queued jobs from database
   */
  private async processQueuedJobs(): Promise<void> {
    try {
      // Get available slots
      const availableSlots = this.maxConcurrentJobs - this.runningJobs.size;
      if (availableSlots <= 0) {
        logger.debug('All ETL job slots occupied', { 
          running: this.runningJobs.size, 
          max: this.maxConcurrentJobs 
        });
        return;
      }

      // Get queued jobs
      const queuedJobs = await etlJobService.getQueuedJobs(availableSlots);
      if (queuedJobs.length === 0) {
        return;
      }

      logger.info('Processing ETL jobs', { 
        found: queuedJobs.length, 
        availableSlots,
        runningJobs: Array.from(this.runningJobs)
      });

      // Process each job
      for (const job of queuedJobs) {
        if (this.runningJobs.has(job.id)) {
          continue; // Skip if already processing
        }

        // Start processing job (don't await - run in parallel)
        this.processJob(job).catch(error => {
          logger.error('Failed to process ETL job', { jobId: job.id, error });
        });
      }

    } catch (error) {
      logger.error('Error fetching queued ETL jobs', { error });
    }
  }

  /**
   * Process a single ETL job
   */
  private async processJob(job: EtlJob): Promise<void> {
    const jobId = job.id;
    
    try {
      // Mark as running
      this.runningJobs.add(jobId);
      
      // Start the job in database
      const startedJob = await etlJobService.start(jobId, `processor-${process.pid}`);
      if (!startedJob) {
        logger.warn('Failed to start ETL job', { jobId });
        return;
      }

      logger.info('Processing ETL job', { 
        jobId, 
        jobType: job.job_type, 
        sourceId: job.source_id 
      });

      // Route to appropriate processor based on job type
      const result = await this.routeJobToProcessor(startedJob);

      // Complete the job
      await etlJobService.complete(jobId, {
        records_processed: result.recordsProcessed || 0,
        records_successful: result.recordsSuccessful || 0,
        records_failed: result.recordsFailed || 0,
        records_skipped: result.recordsSkipped || 0,
        properties_created: result.propertiesCreated || 0,
        properties_updated: result.propertiesUpdated || 0,
        properties_deduplicated: result.propertiesDeduplicated || 0,
        result: result.metadata || {},
      });

      // Update data source sync statistics if this was a scrape job
      if (startedJob.source_id && startedJob.job_type === 'scrape') {
        try {
          await dataSourceService.updateSyncStatus(startedJob.source_id, 'completed', {
            records_synced: result.recordsProcessed || 0,
            properties_added: result.propertiesCreated || 0,
            properties_updated: result.propertiesUpdated || 0,
          });
          logger.info('Updated data source sync statistics', { 
            sourceId: startedJob.source_id,
            recordsProcessed: result.recordsProcessed 
          });
        } catch (updateError) {
          logger.warn('Failed to update data source sync statistics', { 
            sourceId: startedJob.source_id, 
            error: updateError 
          });
        }
      }

      logger.info('Completed ETL job', { 
        jobId, 
        jobType: job.job_type,
        recordsProcessed: result.recordsProcessed
      });

    } catch (error) {
      logger.error('ETL job processing failed', { jobId, error });
      
      // Fail the job
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await etlJobService.fail(jobId, errorMessage);

    } finally {
      // Remove from running jobs
      this.runningJobs.delete(jobId);
    }
  }

  /**
   * Route job to appropriate processor based on job_type
   */
  private async routeJobToProcessor(job: EtlJob): Promise<ProcessingResult> {
    switch (job.job_type) {
      case 'scrape':
        return this.processScrapeJob(job);
      
      case 'geocoding':
        return this.processGeocodingJob(job);
      
      case 'enrichment':
        return this.processEnrichmentJob(job);
      
      case 'deduplication':
        return this.processDeduplicationJob(job);
      
      case 'quality_scoring':
        return this.processQualityScoringJob(job);
      
      case 'api_sync':
      case 'file_import':
      case 'contribution':
        return this.processDataIngestionJob(job);
      
      default:
        throw new Error(`Unsupported job type: ${job.job_type}`);
    }
  }

  /**
   * Process scrape job
   *
   * Scrape jobs are now dispatched directly to the scrapy-worker HTTP API
   * by the ScrapyScheduler.  If a scrape job reaches this processor it
   * means it was created outside the scheduler (e.g. via the API).
   * We call the worker synchronously via /run-sync so it actually runs.
   */
  private async processScrapeJob(job: EtlJob): Promise<ProcessingResult> {
    const workerUrl = (await import('../../config')).config.scrapy?.workerUrl || 'http://scrapy-worker:5000';
    const spiderName = (job.config as Record<string, unknown>)?.spider_name as string
      || job.job_name?.replace(/_(full|update)_scrape$/, '')
      || 'all';
    const scrapeType = ((job.config as Record<string, unknown>)?.scrape_type as string) || 'update';
    const maxPages = ((job.config as Record<string, unknown>)?.max_pages as number) ?? 10;

    await etlJobService.addLog(job.id, 'info', `Dispatching scrape to worker: ${spiderName} (${scrapeType})`, {
      step: 'scrape_dispatch',
      record_data: { worker_url: workerUrl },
    });

    try {
      const res = await fetch(`${workerUrl}/run-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spider: spiderName,
          scrape_type: scrapeType,
          max_pages: maxPages,
          etl_job_id: job.id,
        }),
        signal: AbortSignal.timeout(4 * 60 * 60 * 1000), // 4h
      });

      const result = (await res.json()) as {
        status: string;
        exit_code?: number;
        stdout_tail?: string;
        stderr_tail?: string;
      };

      if (result.status === 'completed') {
        await etlJobService.addLog(job.id, 'info', 'Spider completed via worker', {
          step: 'completed',
          record_data: { exit_code: result.exit_code },
        });
        return { recordsProcessed: 1, recordsSuccessful: 1, recordsFailed: 0 };
      }

      const errMsg = result.stderr_tail?.slice(-500) || `Spider exited: ${result.status}`;
      await etlJobService.addLog(job.id, 'error', errMsg);
      throw new Error(errMsg);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await etlJobService.addLog(job.id, 'error', `Worker call failed: ${msg}`);
      throw error;
    }
  }

  /**
   * Process data ingestion job
   */
  private async processDataIngestionJob(job: EtlJob): Promise<ProcessingResult> {
    await etlJobService.addLog(job.id, 'info', 'Starting data ingestion processing', {
      step: 'init'
    });

    // Simulate data ingestion process
    let processed = 0;
    let successful = 0;

    // Update progress
    for (let i = 0; i < 10; i++) {
      await etlJobService.updateProgress(job.id, processed + i * 10, 100);
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
      processed += 10;
      successful += Math.floor(Math.random() * 10) + 5;
    }

    return {
      recordsProcessed: processed,
      recordsSuccessful: successful,
      recordsFailed: 0,
      propertiesCreated: Math.floor(successful * 0.8),
      propertiesUpdated: Math.floor(successful * 0.2),
    };
  }

  /**
   * Process geocoding job
   */
  private async processGeocodingJob(job: EtlJob): Promise<ProcessingResult> {
    await etlJobService.addLog(job.id, 'info', 'Starting geocoding processing', {
      step: 'geocoding'
    });

    // This would integrate with the actual GeocodingService
    // For now, simulate processing
    const processed = 50;
    const successful = 45;

    await etlJobService.updateProgress(job.id, processed, processed);

    return {
      recordsProcessed: processed,
      recordsSuccessful: successful,
      recordsFailed: processed - successful,
    };
  }

  /**
   * Process enrichment job
   */
  private async processEnrichmentJob(job: EtlJob): Promise<ProcessingResult> {
    await etlJobService.addLog(job.id, 'info', 'Starting data enrichment processing', {
      step: 'enrichment'
    });

    // Simulate enrichment processing
    const processed = 100;
    const successful = 95;

    await etlJobService.updateProgress(job.id, processed, processed);

    return {
      recordsProcessed: processed,
      recordsSuccessful: successful,
      recordsFailed: processed - successful,
      propertiesUpdated: successful,
    };
  }

  /**
   * Process deduplication job
   */
  private async processDeduplicationJob(job: EtlJob): Promise<ProcessingResult> {
    await etlJobService.addLog(job.id, 'info', 'Starting deduplication processing', {
      step: 'deduplication'
    });

    // Simulate deduplication
    const processed = 200;
    const deduplicated = 15;

    await etlJobService.updateProgress(job.id, processed, processed);

    return {
      recordsProcessed: processed,
      recordsSuccessful: processed,
      recordsFailed: 0,
      propertiesDeduplicated: deduplicated,
    };
  }

  /**
   * Process quality scoring job
   */
  private async processQualityScoringJob(job: EtlJob): Promise<ProcessingResult> {
    await etlJobService.addLog(job.id, 'info', 'Starting quality scoring processing', {
      step: 'quality_scoring'
    });

    // Simulate quality scoring
    const processed = 75;
    const successful = 75;

    await etlJobService.updateProgress(job.id, processed, processed);

    return {
      recordsProcessed: processed,
      recordsSuccessful: successful,
      recordsFailed: 0,
      propertiesUpdated: successful,
    };
  }

  /**
   * Get processor status
   */
  getStatus(): {
    isRunning: boolean;
    runningJobs: string[];
    maxConcurrentJobs: number;
    pollInterval: number;
  } {
    return {
      isRunning: this.isRunning,
      runningJobs: Array.from(this.runningJobs),
      maxConcurrentJobs: this.maxConcurrentJobs,
      pollInterval: this.pollInterval,
    };
  }
}

interface ProcessingResult {
  recordsProcessed: number;
  recordsSuccessful: number;
  recordsFailed: number;
  recordsSkipped?: number;
  propertiesCreated?: number;
  propertiesUpdated?: number;
  propertiesDeduplicated?: number;
  metadata?: Record<string, unknown>;
}

// Export singleton instance
export const etlJobProcessor = new EtlJobProcessor();