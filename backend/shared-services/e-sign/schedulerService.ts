/**
 * E-Sign Reminder Scheduler
 * 
 * Manages automated processing of e-sign reminders:
 * - Process pending reminders every 15 minutes
 * - Check for expired envelopes hourly
 * - Clean up old reminders weekly
 */

import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../../src/utils/logger';
import { reminderService } from './reminderService';
import db from '../../src/database';

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Cron expression for processing reminders (default: every 15 minutes) */
  reminderProcessCron: string;
  /** Cron expression for expiry check (default: every hour at :30) */
  expiryCheckCron: string;
  /** Cron expression for cleanup (default: Sunday at 3 AM) */
  cleanupCron: string;
  /** Timezone for all scheduled jobs */
  timezone: string;
  /** Enable/disable scheduler */
  enabled: boolean;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  reminderProcessCron: process.env.ESIGN_REMINDER_CRON || '*/15 * * * *',
  expiryCheckCron: process.env.ESIGN_EXPIRY_CRON || '30 * * * *',
  cleanupCron: process.env.ESIGN_CLEANUP_CRON || '0 3 * * 0',
  timezone: process.env.SCHEDULER_TIMEZONE || 'Africa/Accra',
  enabled: process.env.ESIGN_SCHEDULER_ENABLED !== 'false',
};

interface JobStatus {
  name: string;
  cronExpression: string;
  lastRun: Date | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
  nextRun: Date | null;
  runCount: number;
  errorCount: number;
  lastResult?: any;
}

export class SchedulerService {
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
      logger.warn('E-Sign reminder scheduler already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('E-Sign reminder scheduler is disabled');
      return;
    }

    logger.info('Starting E-Sign reminder scheduler', {
      reminderCron: this.config.reminderProcessCron,
      expiryCron: this.config.expiryCheckCron,
      cleanupCron: this.config.cleanupCron,
      timezone: this.config.timezone,
    });

    this.scheduleJob('reminder-process', this.config.reminderProcessCron, async () => {
      await this.processReminders();
    });

    this.scheduleJob('expiry-check', this.config.expiryCheckCron, async () => {
      await this.checkExpiredEnvelopes();
    });

    this.scheduleJob('cleanup', this.config.cleanupCron, async () => {
      await this.cleanupOldReminders();
    });

    this.isRunning = true;
    logger.info('E-Sign reminder scheduler started with 3 jobs');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('E-Sign reminder scheduler is not running');
      return;
    }

    logger.info('Stopping E-Sign reminder scheduler');

    for (const [name, task] of this.jobs) {
      task.stop();
      logger.debug(`Stopped job: ${name}`);
    }

    this.jobs.clear();
    this.isRunning = false;
    logger.info('E-Sign reminder scheduler stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus(): JobStatus[] {
    return Array.from(this.jobStatus.values());
  }

  private async processReminders(): Promise<void> {
    const status = this.jobStatus.get('reminder-process');
    if (status) {
      status.lastStatus = 'running';
      status.lastRun = new Date();
    }

    try {
      const result = await reminderService.processPendingReminders();
      
      if (status) {
        status.lastStatus = 'success';
        status.runCount++;
        status.lastResult = result;
      }

      if (result.sent > 0 || result.failed > 0) {
        logger.info('Reminder processing completed', result);
      }
    } catch (error) {
      if (status) {
        status.lastStatus = 'failed';
        status.errorCount++;
      }
      logger.error('Reminder processing failed', { error });
    }
  }

  private async checkExpiredEnvelopes(): Promise<void> {
    const status = this.jobStatus.get('expiry-check');
    if (status) {
      status.lastStatus = 'running';
      status.lastRun = new Date();
    }

    try {
      const result = await db.query(
        `UPDATE esign_envelopes SET status = 'expired'
         WHERE status IN ('sent', 'delivered') AND expires_at < NOW()
         RETURNING id`
      );

      const expiredCount = result.rowCount || 0;

      if (expiredCount > 0) {
        const expiredIds = result.rows.map((r) => r.id as string);
        for (const id of expiredIds) {
          await reminderService.cancelRemindersForEnvelope(id);
        }
        logger.info('Marked envelopes as expired', { count: expiredCount });
      }

      if (status) {
        status.lastStatus = 'success';
        status.runCount++;
        status.lastResult = { expiredCount };
      }
    } catch (error) {
      if (status) {
        status.lastStatus = 'failed';
        status.errorCount++;
      }
      logger.error('Expiry check failed', { error });
    }
  }

  private async cleanupOldReminders(): Promise<void> {
    const status = this.jobStatus.get('cleanup');
    if (status) {
      status.lastStatus = 'running';
      status.lastRun = new Date();
    }

    try {
      const result = await db.query(
        `DELETE FROM esign_reminders 
         WHERE status IN ('sent', 'cancelled') AND created_at < NOW() - INTERVAL '30 days'
         RETURNING id`
      );

      const deletedCount = result.rowCount || 0;

      if (deletedCount > 0) {
        logger.info('Cleaned up old reminders', { count: deletedCount });
      }

      if (status) {
        status.lastStatus = 'success';
        status.runCount++;
        status.lastResult = { deletedCount };
      }
    } catch (error) {
      if (status) {
        status.lastStatus = 'failed';
        status.errorCount++;
      }
      logger.error('Reminder cleanup failed', { error });
    }
  }

  private scheduleJob(name: string, cronExpression: string, handler: () => Promise<void>): void {
    if (!cron.validate(cronExpression)) {
      logger.error(`Invalid cron expression for ${name}: ${cronExpression}`);
      return;
    }

    this.jobStatus.set(name, {
      name,
      cronExpression,
      lastRun: null,
      lastStatus: null,
      nextRun: null,
      runCount: 0,
      errorCount: 0,
    });

    const task = cron.schedule(cronExpression, handler, { timezone: this.config.timezone });
    this.jobs.set(name, task);
    logger.debug(`Scheduled job: ${name} with cron: ${cronExpression}`);
  }

  /**
   * Manually trigger reminder processing
   */
  async triggerReminderProcessing(): Promise<{ sent: number; failed: number }> {
    logger.info('Manually triggering reminder processing');
    return reminderService.processPendingReminders();
  }

  /**
   * Manually trigger expiry check
   */
  async triggerExpiryCheck(): Promise<{ expiredCount: number }> {
    logger.info('Manually triggering expiry check');
    
    const result = await db.query(
      `UPDATE esign_envelopes SET status = 'expired'
       WHERE status IN ('sent', 'delivered') AND expires_at < NOW()
       RETURNING id`
    );

    const expiredCount = result.rowCount || 0;

    if (expiredCount > 0) {
      const expiredIds = result.rows.map((r) => r.id as string);
      for (const id of expiredIds) {
        await reminderService.cancelRemindersForEnvelope(id);
      }
    }

    return { expiredCount };
  }
}

export const schedulerService = new SchedulerService();
