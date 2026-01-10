/**
 * API Pull Scheduler Service
 * Manages scheduled data pulls from partner APIs
 * 
 * Features:
 * - Cron-based scheduling with timezone support
 * - Job prioritization and execution windows
 * - Automatic retry of failed jobs
 * - Health monitoring and alerting
 * - Graceful shutdown handling
 * - Job concurrency management
 */

import * as cron from 'node-cron';
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { apiPullIntegrationService } from './apiPullIntegrationService';
import { EventEmitter } from 'events';

export interface ScheduleConfig {
  id: string;
  endpoint_id: string;
  schedule_name: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  sync_type: 'full_sync' | 'incremental' | 'delta';
  priority: number;
  execution_window_start?: string;
  execution_window_end?: string;
  max_execution_time_minutes: number;
  retry_failed_jobs: boolean;
  retry_delay_minutes: number;
  notify_on_failure: boolean;
  notification_channels: string[];
}

export interface JobExecution {
  scheduleId: string;
  endpointId: string;
  startTime: Date;
  expectedEndTime: Date;
  jobId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
}

class ApiPullSchedulerService extends EventEmitter {
  private scheduledTasks = new Map<string, cron.ScheduledTask>();
  private activeExecutions = new Map<string, JobExecution>();
  private isShutdown = false;
  private maxConcurrentJobs = 5;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  /**
   * Initialize the scheduler service
   */
  async initialize(): Promise<void> {
    try {
      // Load all active schedules
      await this.loadAndScheduleAll();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Start periodic schedule refresh (every 5 minutes)
      setInterval(() => this.refreshSchedules(), 5 * 60 * 1000);

      logger.info('API Pull Scheduler initialized', {
        activeSchedules: this.scheduledTasks.size,
        maxConcurrentJobs: this.maxConcurrentJobs
      });

    } catch (error) {
      logger.error('Failed to initialize API Pull Scheduler', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Load all active schedules and create cron jobs
   */
  private async loadAndScheduleAll(): Promise<void> {
    const query = `
      SELECT s.*, e.endpoint_name, ds.name as source_name
      FROM api_pull_schedules s
      JOIN partner_api_endpoints e ON s.endpoint_id = e.id
      JOIN data_sources ds ON e.source_id = ds.id
      WHERE s.is_active = true AND e.is_active = true
      ORDER BY s.priority ASC, s.created_at ASC
    `;

    const result = await pool.query(query);
    const schedules = result.rows;

    for (const schedule of schedules) {
      await this.scheduleJob(schedule);
    }

    logger.info('Loaded and scheduled active jobs', {
      count: schedules.length
    });
  }

  /**
   * Schedule a single job
   */
  private async scheduleJob(schedule: ScheduleConfig): Promise<void> {
    try {
      // Validate cron expression
      if (!cron.validate(schedule.cron_expression)) {
        throw new Error(`Invalid cron expression: ${schedule.cron_expression}`);
      }

      // Remove existing schedule if it exists
      if (this.scheduledTasks.has(schedule.id)) {
        this.scheduledTasks.get(schedule.id)?.stop();
        this.scheduledTasks.delete(schedule.id);
      }

      // Create the cron task
      const task = cron.schedule(schedule.cron_expression, async () => {
        if (this.isShutdown) return;

        try {
          await this.executeScheduledJob(schedule);
        } catch (error) {
          logger.error('Scheduled job execution failed', {
            scheduleId: schedule.id,
            scheduleName: schedule.schedule_name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }, {
        timezone: schedule.timezone || 'UTC'
      });

      // Start task manually
      task.stop(); // Ensure it's stopped first
      this.scheduledTasks.set(schedule.id, task);
      task.start();

      // Update next run time
      await this.updateNextRunTime(schedule.id);

      logger.info('Job scheduled successfully', {
        scheduleId: schedule.id,
        scheduleName: schedule.schedule_name,
        cronExpression: schedule.cron_expression,
        timezone: schedule.timezone
      });

    } catch (error) {
      logger.error('Failed to schedule job', {
        scheduleId: schedule.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Execute a scheduled job with proper error handling and constraints
   */
  private async executeScheduledJob(schedule: ScheduleConfig): Promise<void> {
    // Check execution window
    if (!this.isWithinExecutionWindow(schedule)) {
      logger.info('Skipping job execution - outside execution window', {
        scheduleId: schedule.id,
        currentTime: new Date().toISOString()
      });
      return;
    }

    // Check concurrency limits
    if (this.activeExecutions.size >= this.maxConcurrentJobs) {
      logger.warn('Skipping job execution - max concurrent jobs reached', {
        scheduleId: schedule.id,
        activeJobs: this.activeExecutions.size,
        maxJobs: this.maxConcurrentJobs
      });
      return;
    }

    // Check if endpoint has recent failures
    if (await this.shouldSkipDueToFailures(schedule.endpoint_id)) {
      logger.warn('Skipping job execution - endpoint has recent failures', {
        scheduleId: schedule.id,
        endpointId: schedule.endpoint_id
      });
      return;
    }

    const execution: JobExecution = {
      scheduleId: schedule.id,
      endpointId: schedule.endpoint_id,
      startTime: new Date(),
      expectedEndTime: new Date(Date.now() + (schedule.max_execution_time_minutes * 60 * 1000)),
      status: 'pending'
    };

    this.activeExecutions.set(schedule.id, execution);

    try {
      // Update schedule tracking
      await this.updateScheduleExecution(schedule.id, 'started');

      // Execute the pull job
      execution.status = 'running';
      const result = await apiPullIntegrationService.executePullJob(
        schedule.endpoint_id,
        schedule.sync_type
      );

      execution.jobId = result.job_id;
      execution.status = result.status === 'completed' ? 'completed' : 'failed';

      // Update schedule performance metrics
      await this.updateSchedulePerformance(schedule.id, result);

      // Handle job completion
      if (result.status === 'completed') {
        await this.handleJobSuccess(schedule, result);
      } else {
        await this.handleJobFailure(schedule, result);
      }

      logger.info('Scheduled job completed', {
        scheduleId: schedule.id,
        jobId: result.job_id,
        status: result.status,
        recordsFetched: result.records_fetched,
        durationSeconds: result.duration_seconds
      });

    } catch (error) {
      execution.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Scheduled job execution error', {
        scheduleId: schedule.id,
        endpointId: schedule.endpoint_id,
        error: errorMessage
      });

      await this.handleJobError(schedule, errorMessage);

      // Consider retry if configured
      if (schedule.retry_failed_jobs) {
        await this.scheduleRetry(schedule, errorMessage);
      }

    } finally {
      this.activeExecutions.delete(schedule.id);
      await this.updateScheduleExecution(schedule.id, 'completed');
    }
  }

  /**
   * Check if current time is within execution window
   */
  private isWithinExecutionWindow(schedule: ScheduleConfig): boolean {
    if (!schedule.execution_window_start || !schedule.execution_window_end) {
      return true; // No window restrictions
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = schedule.execution_window_start.split(':').map(Number);
    const [endHour, endMin] = schedule.execution_window_end.split(':').map(Number);
    
    const windowStart = startHour * 60 + startMin;
    const windowEnd = endHour * 60 + endMin;

    if (windowStart <= windowEnd) {
      // Same day window
      return currentTime >= windowStart && currentTime <= windowEnd;
    } else {
      // Window spans midnight
      return currentTime >= windowStart || currentTime <= windowEnd;
    }
  }

  /**
   * Check if endpoint should be skipped due to recent failures
   */
  private async shouldSkipDueToFailures(endpointId: string): Promise<boolean> {
    const query = `
      SELECT consecutive_failures, max_consecutive_failures
      FROM partner_api_endpoints
      WHERE id = $1
    `;

    const result = await pool.query(query, [endpointId]);
    
    if (result.rows.length === 0) return true;

    const endpoint = result.rows[0];
    return endpoint.consecutive_failures >= endpoint.max_consecutive_failures;
  }

  /**
   * Handle successful job completion
   */
  private async handleJobSuccess(schedule: ScheduleConfig, result: any): Promise<void> {
    // Update endpoint success metrics
    await pool.query(`
      UPDATE partner_api_endpoints 
      SET 
        last_successful_pull = NOW(),
        consecutive_failures = 0
      WHERE id = $1
    `, [schedule.endpoint_id]);

    // Emit success event
    this.emit('job_success', {
      scheduleId: schedule.id,
      endpointId: schedule.endpoint_id,
      result
    });
  }

  /**
   * Handle job failure
   */
  private async handleJobFailure(schedule: ScheduleConfig, result: any): Promise<void> {
    // Update endpoint failure metrics
    await pool.query(`
      UPDATE partner_api_endpoints 
      SET consecutive_failures = consecutive_failures + 1
      WHERE id = $1
    `, [schedule.endpoint_id]);

    // Send notifications if configured
    if (schedule.notify_on_failure) {
      await this.sendFailureNotification(schedule, result.error_message);
    }

    // Emit failure event
    this.emit('job_failure', {
      scheduleId: schedule.id,
      endpointId: schedule.endpoint_id,
      error: result.error_message
    });
  }

  /**
   * Handle job execution errors
   */
  private async handleJobError(schedule: ScheduleConfig, errorMessage: string): Promise<void> {
    // Log error in database
    await pool.query(`
      INSERT INTO api_pull_errors (
        endpoint_id, error_type, error_message, occurred_at, business_impact
      ) VALUES ($1, 'execution_error', $2, NOW(), 'medium')
    `, [schedule.endpoint_id, errorMessage]);

    // Update failure count
    await this.handleJobFailure(schedule, { error_message: errorMessage });
  }

  /**
   * Schedule retry for failed job
   */
  private async scheduleRetry(schedule: ScheduleConfig, errorMessage: string): Promise<void> {
    const retryDelay = schedule.retry_delay_minutes * 60 * 1000;
    
    logger.info('Scheduling job retry', {
      scheduleId: schedule.id,
      delayMinutes: schedule.retry_delay_minutes
    });

    setTimeout(async () => {
      if (this.isShutdown) return;

      try {
        await this.executeScheduledJob(schedule);
      } catch (error) {
        logger.error('Retry execution failed', {
          scheduleId: schedule.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, retryDelay);
  }

  /**
   * Send failure notifications
   */
  private async sendFailureNotification(schedule: ScheduleConfig, errorMessage: string): Promise<void> {
    // This would integrate with notification services (email, Slack, etc.)
    logger.info('Sending failure notification', {
      scheduleId: schedule.id,
      channels: schedule.notification_channels,
      error: errorMessage
    });

    // Placeholder for actual notification implementation
    // Could integrate with services like:
    // - AWS SES for email
    // - Slack API for Slack notifications
    // - Webhook endpoints for custom notifications
  }

  /**
   * Update schedule execution tracking
   */
  private async updateScheduleExecution(scheduleId: string, phase: 'started' | 'completed'): Promise<void> {
    if (phase === 'started') {
      await pool.query(`
        UPDATE api_pull_schedules 
        SET last_triggered = NOW() 
        WHERE id = $1
      `, [scheduleId]);
    }

    await this.updateNextRunTime(scheduleId);
  }

  /**
   * Update schedule performance metrics
   */
  private async updateSchedulePerformance(scheduleId: string, result: any): Promise<void> {
    const query = `
      UPDATE api_pull_schedules
      SET 
        average_duration_minutes = COALESCE(
          (average_duration_minutes + $2) / 2, 
          $2
        ),
        success_rate = CASE 
          WHEN $3 = 'completed' THEN COALESCE((success_rate * 0.9) + 10, 100)
          ELSE COALESCE(success_rate * 0.9, 0)
        END,
        last_success = CASE 
          WHEN $3 = 'completed' THEN NOW() 
          ELSE last_success 
        END
      WHERE id = $1
    `;

    await pool.query(query, [
      scheduleId,
      result.duration_seconds / 60, // Convert to minutes
      result.status
    ]);
  }

  /**
   * Update next run time based on cron expression
   */
  private async updateNextRunTime(scheduleId: string): Promise<void> {
    const scheduleQuery = await pool.query(
      'SELECT cron_expression, timezone FROM api_pull_schedules WHERE id = $1',
      [scheduleId]
    );

    if (scheduleQuery.rows.length === 0) return;

    const schedule = scheduleQuery.rows[0];
    
    try {
      // Calculate next run time (this is a simplified version)
      // In production, would use a proper cron parser library
      const nextRun = new Date(Date.now() + 60 * 60 * 1000); // Placeholder: 1 hour from now
      
      await pool.query(`
        UPDATE api_pull_schedules 
        SET next_run = $2 
        WHERE id = $1
      `, [scheduleId, nextRun]);

    } catch (error) {
      logger.error('Failed to update next run time', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Refresh schedules from database
   */
  private async refreshSchedules(): Promise<void> {
    try {
      // Get currently active schedules from database
      const query = `
        SELECT id, updated_at 
        FROM api_pull_schedules 
        WHERE is_active = true
      `;

      const result = await pool.query(query);
      const dbSchedules = new Set(result.rows.map(r => r.id));
      const currentSchedules = new Set(this.scheduledTasks.keys());

      // Remove schedules that no longer exist or are inactive
      for (const scheduleId of currentSchedules) {
        if (!dbSchedules.has(scheduleId)) {
          this.scheduledTasks.get(scheduleId)?.destroy();
          this.scheduledTasks.delete(scheduleId);
          logger.info('Removed inactive schedule', { scheduleId });
        }
      }

      // Add new schedules
      for (const scheduleId of dbSchedules) {
        if (!currentSchedules.has(scheduleId)) {
          const scheduleQuery = await pool.query(`
            SELECT s.*, e.endpoint_name, ds.name as source_name
            FROM api_pull_schedules s
            JOIN partner_api_endpoints e ON s.endpoint_id = e.id
            JOIN data_sources ds ON e.source_id = ds.id
            WHERE s.id = $1
          `, [scheduleId]);

          if (scheduleQuery.rows.length > 0) {
            await this.scheduleJob(scheduleQuery.rows[0]);
            logger.info('Added new schedule', { scheduleId });
          }
        }
      }

    } catch (error) {
      logger.error('Failed to refresh schedules', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Health check failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 60 * 1000); // Every minute
  }

  /**
   * Perform health check on active executions
   */
  private async performHealthCheck(): Promise<void> {
    const now = new Date();

    for (const [scheduleId, execution] of this.activeExecutions.entries()) {
      if (now > execution.expectedEndTime) {
        logger.warn('Job execution timeout detected', {
          scheduleId,
          jobId: execution.jobId,
          duration: now.getTime() - execution.startTime.getTime()
        });

        execution.status = 'timeout';
        
        // Clean up the execution
        this.activeExecutions.delete(scheduleId);
        
        // Emit timeout event
        this.emit('job_timeout', {
          scheduleId,
          endpointId: execution.endpointId,
          duration: now.getTime() - execution.startTime.getTime()
        });
      }
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('job_success', (data) => {
      logger.info('Job success event', data);
    });

    this.on('job_failure', (data) => {
      logger.warn('Job failure event', data);
    });

    this.on('job_timeout', (data) => {
      logger.error('Job timeout event', data);
    });
  }

  /**
   * Management methods
   */
  async pauseSchedule(scheduleId: string): Promise<void> {
    const task = this.scheduledTasks.get(scheduleId);
    if (task) {
      task.stop();
      await pool.query(
        'UPDATE api_pull_schedules SET is_active = false WHERE id = $1',
        [scheduleId]
      );
      logger.info('Schedule paused', { scheduleId });
    }
  }

  async resumeSchedule(scheduleId: string): Promise<void> {
    await pool.query(
      'UPDATE api_pull_schedules SET is_active = true WHERE id = $1',
      [scheduleId]
    );

    // Reload and reschedule
    const query = `
      SELECT s.*, e.endpoint_name, ds.name as source_name
      FROM api_pull_schedules s
      JOIN partner_api_endpoints e ON s.endpoint_id = e.id
      JOIN data_sources ds ON e.source_id = ds.id
      WHERE s.id = $1
    `;

    const result = await pool.query(query, [scheduleId]);
    
    if (result.rows.length > 0) {
      await this.scheduleJob(result.rows[0]);
      logger.info('Schedule resumed', { scheduleId });
    }
  }

  async getScheduleStatus(): Promise<Array<{
    id: string;
    name: string;
    isActive: boolean;
    nextRun?: Date;
    lastRun?: Date;
    isRunning: boolean;
  }>> {
    const query = `
      SELECT id, schedule_name, is_active, next_run, last_triggered
      FROM api_pull_schedules
      ORDER BY priority ASC, schedule_name ASC
    `;

    const result = await pool.query(query);
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.schedule_name,
      isActive: row.is_active && this.scheduledTasks.has(row.id),
      nextRun: row.next_run,
      lastRun: row.last_triggered,
      isRunning: this.activeExecutions.has(row.id)
    }));
  }

  async getActiveExecutions(): Promise<JobExecution[]> {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down API Pull Scheduler');
    this.isShutdown = true;

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Stop all scheduled tasks
    for (const [scheduleId, task] of this.scheduledTasks.entries()) {
      task.destroy();
      logger.info('Stopped scheduled task', { scheduleId });
    }

    this.scheduledTasks.clear();

    // Wait for active executions to complete (with timeout)
    const timeout = 60000; // 1 minute
    const startWait = Date.now();

    while (this.activeExecutions.size > 0 && Date.now() - startWait < timeout) {
      logger.info('Waiting for active executions to complete', {
        activeExecutions: this.activeExecutions.size
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.activeExecutions.size > 0) {
      logger.warn('Forcefully terminating active executions', {
        remainingExecutions: this.activeExecutions.size
      });
    }

    this.activeExecutions.clear();
    logger.info('API Pull Scheduler shutdown complete');
  }
}

export const apiPullSchedulerService = new ApiPullSchedulerService();