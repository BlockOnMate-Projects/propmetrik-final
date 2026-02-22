/**
 * Progress Analytics Service
 * 
 * Phase 3.1: Split dashboardAnalyticsService
 * 
 * Provides progress tracking analytics:
 * - Progress trends over time
 * - Completion forecasting
 * - Milestone tracking
 * - Timeline status analysis
 * 
 * @module services/project-management/analytics/ProgressAnalyticsService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { UUID, MilestoneStatus } from '../types';

// =============================================================================
// TYPES
// =============================================================================

export interface ProgressTrend {
  date: Date;
  plannedProgress: number;
  actualProgress: number;
  variance: number;
}

export interface ProgressForecast {
  projectId: UUID;
  currentProgress: number;
  projectedCompletionDate: Date;
  plannedCompletionDate: Date;
  daysVariance: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  assumptions: string[];
}

export interface MilestoneInfo {
  id: UUID;
  name: string;
  description?: string;
  plannedDate: Date;
  actualDate?: Date;
  status: MilestoneStatus;
  daysUntilDue: number;
  isOverdue: boolean;
  completionPercentage: number;
  dependencies: UUID[];
  blockers: string[];
}

export interface TimelineStatus {
  projectId: UUID;
  projectName: string;
  plannedStartDate: Date;
  plannedCompletionDate: Date;
  actualStartDate?: Date;
  estimatedCompletionDate: Date;
  totalDuration: number;
  elapsedDays: number;
  remainingDays: number;
  scheduleVarianceDays: number;
  schedulePerformanceIndex: number;
  status: 'on_track' | 'at_risk' | 'delayed' | 'ahead';
  criticalPathTasks: {
    id: UUID;
    name: string;
    daysRemaining: number;
  }[];
}

export interface ProgressSummary {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  notStartedTasks: number;
  blockedTasks: number;
  overallProgress: number;
  weeklyProgressRate: number;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ProgressAnalyticsServiceImpl extends BaseService {
  constructor() {
    super('ProgressAnalyticsService');
  }

  /**
   * Get progress trend for a project over time.
   */
  async getProgressTrend(projectId: UUID, days: number = 30): Promise<ProgressTrend[]> {
    // First check for historical data
    const historyResult = await this.query(
      `SELECT 
         date,
         planned_progress,
         actual_progress,
         actual_progress - planned_progress as variance
       FROM pm_progress_history
       WHERE project_id = $1 AND date >= NOW() - INTERVAL '${days} days'
       ORDER BY date ASC`,
      [projectId]
    );

    if (historyResult.rows.length > 0) {
      return historyResult.rows.map(row => ({
        date: new Date(row.date),
        plannedProgress: parseFloat(row.planned_progress),
        actualProgress: parseFloat(row.actual_progress),
        variance: parseFloat(row.variance),
      }));
    }

    // Fallback: Generate from task data
    return this.generateProgressTrendFromTasks(projectId, days);
  }

  /**
   * Forecast project completion based on current progress rate.
   */
  async forecastCompletion(projectId: UUID): Promise<ProgressForecast> {
    const result = await this.query(
      `SELECT 
         p.id,
         p.overall_progress,
         p.planned_completion_date,
         p.actual_start_date,
         (
           SELECT AVG(daily_progress) 
           FROM (
             SELECT (actual_progress - LAG(actual_progress) OVER (ORDER BY date)) as daily_progress
             FROM pm_progress_history
             WHERE project_id = $1 AND date >= NOW() - INTERVAL '14 days'
           ) t WHERE daily_progress > 0
         ) as avg_daily_progress
       FROM development_projects p
       WHERE p.id = $1`,
      [projectId]
    );

    const project = result.rows[0];
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const currentProgress = parseFloat(project.overall_progress) || 0;
    const remainingProgress = 100 - currentProgress;
    const avgDailyProgress = parseFloat(project.avg_daily_progress) || 0.5; // Default 0.5% per day
    
    // Calculate projected completion
    const daysToComplete = remainingProgress / avgDailyProgress;
    const projectedCompletionDate = new Date();
    projectedCompletionDate.setDate(projectedCompletionDate.getDate() + Math.ceil(daysToComplete));

    const plannedCompletionDate = new Date(project.planned_completion_date);
    const daysVariance = Math.ceil(
      (projectedCompletionDate.getTime() - plannedCompletionDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Determine confidence level based on data quality
    let confidenceLevel: 'high' | 'medium' | 'low' = 'medium';
    const assumptions: string[] = [];

    if (currentProgress < 10) {
      confidenceLevel = 'low';
      assumptions.push('Limited progress data available');
    } else if (currentProgress > 50) {
      confidenceLevel = 'high';
      assumptions.push('Significant progress data for reliable forecast');
    }

    if (avgDailyProgress === 0.5) {
      assumptions.push('Using default progress rate (0.5% per day)');
      confidenceLevel = 'low';
    } else {
      assumptions.push(`Using observed progress rate (${avgDailyProgress.toFixed(2)}% per day)`);
    }

    return {
      projectId,
      currentProgress,
      projectedCompletionDate,
      plannedCompletionDate,
      daysVariance,
      confidenceLevel,
      assumptions,
    };
  }

  /**
   * Get upcoming milestones for a project.
   */
  async getUpcomingMilestones(
    projectId: UUID, 
    daysAhead: number = 30
  ): Promise<MilestoneInfo[]> {
    const result = await this.query(
      `SELECT 
         m.id,
         m.name,
         m.description,
         m.planned_date,
         m.actual_date,
         m.status,
         m.completion_percentage,
         m.dependencies,
         EXTRACT(DAY FROM m.planned_date - NOW()) as days_until_due
       FROM project_milestones m
       WHERE m.project_id = $1 
         AND m.status != 'completed'
         AND m.planned_date <= NOW() + INTERVAL '${daysAhead} days'
       ORDER BY m.planned_date ASC`,
      [projectId]
    );

    const milestones = await Promise.all(
      result.rows.map(async (row) => {
        const blockers = await this.getMilestoneBlockers(row.id);
        const daysUntilDue = parseInt(row.days_until_due) || 0;

        return {
          id: row.id,
          name: row.name,
          description: row.description,
          plannedDate: new Date(row.planned_date),
          actualDate: row.actual_date ? new Date(row.actual_date) : undefined,
          status: row.status as MilestoneStatus,
          daysUntilDue,
          isOverdue: daysUntilDue < 0,
          completionPercentage: parseFloat(row.completion_percentage) || 0,
          dependencies: row.dependencies || [],
          blockers,
        };
      })
    );

    return milestones;
  }

  /**
   * Get timeline status for a project.
   */
  async getTimelineStatus(projectId: UUID): Promise<TimelineStatus> {
    const result = await this.query(
      `SELECT 
         id,
         name,
         planned_start_date,
         planned_completion_date,
         actual_start_date,
         overall_progress
       FROM development_projects
       WHERE id = $1`,
      [projectId]
    );

    const project = result.rows[0];
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const now = new Date();
    const plannedStart = new Date(project.planned_start_date);
    const plannedEnd = new Date(project.planned_completion_date);
    const actualStart = project.actual_start_date ? new Date(project.actual_start_date) : plannedStart;
    const progress = parseFloat(project.overall_progress) || 0;

    // Calculate durations
    const totalDuration = Math.ceil((plannedEnd.getTime() - plannedStart.getTime()) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.ceil((now.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.max(0, totalDuration - elapsedDays);

    // Calculate expected progress
    const expectedProgress = Math.min(100, (elapsedDays / totalDuration) * 100);
    const spi = expectedProgress > 0 ? progress / expectedProgress : 1;

    // Estimate completion date
    const remainingProgress = 100 - progress;
    const dailyRate = elapsedDays > 0 ? progress / elapsedDays : 0.5;
    const daysToComplete = dailyRate > 0 ? remainingProgress / dailyRate : remainingDays;
    const estimatedCompletionDate = new Date(now);
    estimatedCompletionDate.setDate(now.getDate() + Math.ceil(daysToComplete));

    const scheduleVarianceDays = Math.ceil(
      (estimatedCompletionDate.getTime() - plannedEnd.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Determine status
    let status: 'on_track' | 'at_risk' | 'delayed' | 'ahead';
    if (spi >= 1.05) {
      status = 'ahead';
    } else if (spi >= 0.95) {
      status = 'on_track';
    } else if (spi >= 0.8) {
      status = 'at_risk';
    } else {
      status = 'delayed';
    }

    // Get critical path tasks
    const criticalPathTasks = await this.getCriticalPathTasks(projectId);

    return {
      projectId,
      projectName: project.name,
      plannedStartDate: plannedStart,
      plannedCompletionDate: plannedEnd,
      actualStartDate: project.actual_start_date ? actualStart : undefined,
      estimatedCompletionDate,
      totalDuration,
      elapsedDays,
      remainingDays,
      scheduleVarianceDays,
      schedulePerformanceIndex: spi,
      status,
      criticalPathTasks,
    };
  }

  /**
   * Get progress summary for a project.
   */
  async getProgressSummary(projectId: UUID): Promise<ProgressSummary> {
    const result = await this.query(
      `SELECT 
         COUNT(*) as total_tasks,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tasks,
         COUNT(*) FILTER (WHERE status = 'not_started') as not_started_tasks,
         COUNT(*) FILTER (WHERE status = 'blocked') as blocked_tasks
       FROM project_tasks
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );

    const { 
      total_tasks, 
      completed_tasks, 
      in_progress_tasks, 
      not_started_tasks, 
      blocked_tasks 
    } = result.rows[0];

    const totalTasks = parseInt(total_tasks) || 0;
    const completedTasks = parseInt(completed_tasks) || 0;
    const overallProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Calculate weekly progress rate
    const weeklyResult = await this.query(
      `SELECT COUNT(*) as completed_this_week
       FROM project_tasks
       WHERE project_id = $1 
         AND status = 'completed' 
         AND completed_at >= NOW() - INTERVAL '7 days'`,
      [projectId]
    );
    const completedThisWeek = parseInt(weeklyResult.rows[0]?.completed_this_week || 0);
    const weeklyProgressRate = totalTasks > 0 ? (completedThisWeek / totalTasks) * 100 : 0;

    return {
      totalTasks,
      completedTasks,
      inProgressTasks: parseInt(in_progress_tasks) || 0,
      notStartedTasks: parseInt(not_started_tasks) || 0,
      blockedTasks: parseInt(blocked_tasks) || 0,
      overallProgress,
      weeklyProgressRate,
    };
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  private async generateProgressTrendFromTasks(
    projectId: UUID, 
    days: number
  ): Promise<ProgressTrend[]> {
    const result = await this.query(
      `WITH dates AS (
         SELECT generate_series(
           date_trunc('day', NOW() - INTERVAL '${days} days'),
           date_trunc('day', NOW()),
           INTERVAL '1 day'
         ) as date
       )
       SELECT 
         d.date,
         (
           SELECT COALESCE(
             (COUNT(*) FILTER (WHERE status = 'completed' AND completed_at <= d.date)::decimal / 
              NULLIF(COUNT(*), 0)) * 100, 0
           )
           FROM project_tasks WHERE project_id = $1 AND deleted_at IS NULL
         ) as actual_progress,
         (
           SELECT EXTRACT(DAY FROM d.date - planned_start_date)::decimal / 
                  NULLIF(EXTRACT(DAY FROM planned_completion_date - planned_start_date), 1) * 100
           FROM development_projects WHERE id = $1
         ) as planned_progress
       FROM dates d
       ORDER BY d.date`,
      [projectId]
    );

    return result.rows.map(row => ({
      date: new Date(row.date),
      plannedProgress: Math.min(100, Math.max(0, parseFloat(row.planned_progress) || 0)),
      actualProgress: parseFloat(row.actual_progress) || 0,
      variance: (parseFloat(row.actual_progress) || 0) - (parseFloat(row.planned_progress) || 0),
    }));
  }

  private async getMilestoneBlockers(milestoneId: UUID): Promise<string[]> {
    const result = await this.query(
      `SELECT i.title as blocker
       FROM project_issues i
       JOIN milestone_blockers mb ON mb.issue_id = i.id
       WHERE mb.milestone_id = $1 AND i.status != 'resolved'`,
      [milestoneId]
    );
    return result.rows.map(row => row.blocker);
  }

  private async getCriticalPathTasks(projectId: UUID): Promise<{ id: UUID; name: string; daysRemaining: number }[]> {
    const result = await this.query(
      `SELECT 
         t.id,
         t.name,
         GREATEST(0, EXTRACT(DAY FROM t.due_date - NOW()))::int as days_remaining
       FROM project_tasks t
       WHERE t.project_id = $1 
         AND t.is_critical_path = true
         AND t.status != 'completed'
       ORDER BY t.due_date ASC
       LIMIT 5`,
      [projectId]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      daysRemaining: parseInt(row.days_remaining),
    }));
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const progressAnalyticsService = new ProgressAnalyticsServiceImpl();
