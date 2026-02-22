/**
 * Dashboard Analytics Facade
 * 
 * Phase 3.1: Unified facade for backward compatibility
 * 
 * Provides a single entry point to all analytics services,
 * maintaining the original dashboardAnalyticsService API.
 * 
 * @module services/project-management/analytics/DashboardAnalyticsFacade
 */

import { portfolioMetricsService, PortfolioMetrics, PortfolioFilters } from './PortfolioMetricsService';
import { projectHealthService, ProjectHealthScore, BudgetVarianceAnalysis } from './ProjectHealthService';
import { progressAnalyticsService, ProgressTrend, ProgressForecast, TimelineStatus, MilestoneInfo } from './ProgressAnalyticsService';
import { dashboardAlertsService, Alert, AlertFilters, AlertSummary } from './DashboardAlertsService';
import { UUID } from '../types';

// =============================================================================
// FACADE TYPES
// =============================================================================

export interface DashboardFilters {
  organizationId: UUID;
  projectIds?: UUID[];
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ComprehensiveDashboardData {
  portfolioMetrics: PortfolioMetrics;
  projectHealth: ProjectHealthScore[];
  alerts: { alerts: Alert[]; summary: AlertSummary };
  timeline: TimelineStatus[];
  upcomingMilestones: MilestoneInfo[];
}

// =============================================================================
// FACADE IMPLEMENTATION
// =============================================================================

class DashboardAnalyticsFacadeImpl {
  /**
   * Get comprehensive dashboard data in a single call.
   */
  async getComprehensiveDashboard(
    filters: DashboardFilters
  ): Promise<ComprehensiveDashboardData> {
    const [portfolioMetrics, alerts] = await Promise.all([
      this.getPortfolioMetrics(filters),
      this.getActiveAlerts({ organizationId: filters.organizationId }),
    ]);

    // Get health for top projects
    const topProjectIds = portfolioMetrics.byStatus
      .filter(s => ['under_construction', 'pre_construction'].includes(s.status))
      .slice(0, 10)
      .map(s => s.status); // This would need actual project IDs

    // For now, return partial data
    return {
      portfolioMetrics,
      projectHealth: [],
      alerts,
      timeline: [],
      upcomingMilestones: [],
    };
  }

  // ==========================================================================
  // PORTFOLIO METRICS (delegated)
  // ==========================================================================

  async getPortfolioMetrics(filters: PortfolioFilters): Promise<PortfolioMetrics> {
    return portfolioMetricsService.getPortfolioMetrics(filters);
  }

  // ==========================================================================
  // PROJECT HEALTH (delegated)
  // ==========================================================================

  async getProjectHealthScore(projectId: UUID): Promise<ProjectHealthScore> {
    return projectHealthService.getProjectHealthScore(projectId);
  }

  async getBudgetVarianceAnalysis(projectId: UUID): Promise<BudgetVarianceAnalysis> {
    return projectHealthService.getBudgetVarianceAnalysis(projectId);
  }

  // ==========================================================================
  // PROGRESS ANALYTICS (delegated)
  // ==========================================================================

  async getProgressTrend(projectId: UUID, days?: number): Promise<ProgressTrend[]> {
    return progressAnalyticsService.getProgressTrend(projectId, days);
  }

  async forecastCompletion(projectId: UUID): Promise<ProgressForecast> {
    return progressAnalyticsService.forecastCompletion(projectId);
  }

  async getTimelineStatus(projectId: UUID): Promise<TimelineStatus> {
    return progressAnalyticsService.getTimelineStatus(projectId);
  }

  async getUpcomingMilestones(projectId: UUID, daysAhead?: number): Promise<MilestoneInfo[]> {
    return progressAnalyticsService.getUpcomingMilestones(projectId, daysAhead);
  }

  // ==========================================================================
  // ALERTS (delegated)
  // ==========================================================================

  async getActiveAlerts(filters: AlertFilters): Promise<{ alerts: Alert[]; summary: AlertSummary }> {
    return dashboardAlertsService.getActiveAlerts(filters);
  }

  async acknowledgeAlert(alertId: UUID, userId: UUID): Promise<Alert> {
    return dashboardAlertsService.acknowledgeAlert(alertId, userId);
  }

  async resolveAlert(alertId: UUID, userId: UUID, resolution?: string): Promise<Alert> {
    return dashboardAlertsService.resolveAlert(alertId, userId, resolution);
  }

  async dismissAlert(alertId: UUID, userId: UUID): Promise<Alert> {
    return dashboardAlertsService.dismissAlert(alertId, userId);
  }

  async snoozeAlert(alertId: UUID, userId: UUID, snoozeUntil: Date): Promise<Alert> {
    return dashboardAlertsService.snoozeAlert(alertId, userId, snoozeUntil);
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const dashboardAnalyticsFacade = new DashboardAnalyticsFacadeImpl();
