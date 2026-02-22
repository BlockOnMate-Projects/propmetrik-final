/**
 * Autopilot Scheduler
 *
 * Manages cron-scheduled autonomous publication runs.
 * Follows the same pattern as EconomicDataScheduler.
 * Reads schedules from the autopilot_schedules DB table and
 * registers node-cron jobs that fire the AutopilotPipeline.
 */
import cron, { ScheduledTask } from 'node-cron';
import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import { autopilotPipeline } from './autopilotPipeline';
import { BreakingSnapshotTrigger } from './anomalyTrigger';
import type { AutopilotSchedule, AutopilotSettings } from './types';

// ============================================================
// SCHEDULER CLASS
// ============================================================

export class AutopilotScheduler {
  private jobs: Map<string, ScheduledTask> = new Map();
  private anomalyJob: ScheduledTask | null = null;
  private isRunning = false;
  private timezone = process.env.SCHEDULER_TIMEZONE || 'Africa/Accra';

  /**
   * Start all scheduled autopilot jobs by reading from the database.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Autopilot scheduler already running');
      return;
    }

    // Check if globally enabled
    const settings = await this.getSettings();
    if (!settings.global_enabled) {
      logger.info('Autopilot scheduler disabled by global settings');
      return;
    }

    const schedules = await this.loadSchedules();

    logger.info(
      { scheduleCount: schedules.length, timezone: this.timezone },
      'Starting autopilot scheduler',
    );

    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      if (schedule.cron_expression === 'EVENT_DRIVEN') continue; // handled by anomaly trigger

      if (!cron.validate(schedule.cron_expression)) {
        logger.error(
          { product: schedule.product, edition: schedule.edition, cron: schedule.cron_expression },
          'Invalid cron expression — skipping',
        );
        continue;
      }

      const jobKey = `${schedule.product}:${schedule.edition}:${schedule.region || 'all'}`;

      const task = cron.schedule(schedule.cron_expression, async () => {
        logger.info(
          { product: schedule.product, edition: schedule.edition, region: schedule.region, jobKey },
          'Autopilot cron fired',
        );

        try {
          const result = await autopilotPipeline.execute(schedule);
          logger.info(
            { jobKey, status: result.status, publicationId: result.publicationId },
            'Autopilot run completed',
          );
        } catch (err) {
          logger.error(
            { jobKey, error: (err as Error).message },
            'Autopilot run threw unhandled error',
          );
        }
      }, {
        timezone: this.timezone,
      });

      this.jobs.set(jobKey, task);
    }

    // Start anomaly trigger for Breaking Snapshots (runs every 30 minutes)
    const trigger = new BreakingSnapshotTrigger();
    this.anomalyJob = cron.schedule('*/30 * * * *', async () => {
      try {
        await trigger.checkForAnomalies();
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Anomaly trigger check failed');
      }
    }, {
      timezone: this.timezone,
    });

    this.isRunning = true;
    logger.info(
      { jobCount: this.jobs.size, anomalyEnabled: true },
      'Autopilot scheduler started successfully',
    );
  }

  /**
   * Stop all scheduled jobs.
   */
  stop(): void {
    for (const [key, task] of this.jobs) {
      task.stop();
      logger.debug({ jobKey: key }, 'Stopped autopilot job');
    }
    this.jobs.clear();

    if (this.anomalyJob) {
      this.anomalyJob.stop();
      this.anomalyJob = null;
    }

    this.isRunning = false;
    logger.info('Autopilot scheduler stopped');
  }

  /**
   * Reload schedules from database (e.g., after admin updates a schedule).
   */
  async reload(): Promise<void> {
    this.stop();
    await this.start();
  }

  /**
   * Get current status of all jobs.
   */
  getStatus(): { isRunning: boolean; jobCount: number; jobs: string[] } {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.size,
      jobs: [...this.jobs.keys()],
    };
  }

  // ============================================================
  // DATABASE
  // ============================================================

  private async loadSchedules(): Promise<AutopilotSchedule[]> {
    const result = await pool.query(
      `SELECT * FROM autopilot_schedules ORDER BY product, edition, region`,
    );
    return result.rows.map(row => ({
      ...row,
      chart_rules: typeof row.chart_rules === 'string' ? JSON.parse(row.chart_rules) : row.chart_rules,
      quality_thresholds: typeof row.quality_thresholds === 'string'
        ? JSON.parse(row.quality_thresholds)
        : row.quality_thresholds,
    }));
  }

  private async getSettings(): Promise<AutopilotSettings> {
    return autopilotPipeline.getSettings();
  }
}

// ── Singleton Export ──────────────────────────────────────────
export const autopilotScheduler = new AutopilotScheduler();
