/**
 * Analytics Module - Barrel Export
 * 
 * Phase 3.1: Split dashboardAnalyticsService into focused services
 * 
 * Services:
 * - PortfolioMetricsService: Portfolio-level analytics
 * - ProjectHealthService: Project health scoring
 * - ProgressAnalyticsService: Progress tracking and forecasting
 * - DashboardAlertsService: Alert management
 * - DashboardAnalyticsFacade: Unified facade for backward compatibility
 * 
 * @module services/project-management/analytics
 */

// Core analytics services
export {
  portfolioMetricsService,
  type PortfolioMetrics,
  type PortfolioSummary,
  type StatusDistribution,
  type ProjectTypeDistribution,
  type RegionalDistribution,
  type MonthlyTrend,
  type PortfolioFilters,
} from './PortfolioMetricsService';

export {
  projectHealthService,
  type ProjectHealthScore,
  type HealthMetric,
  type HealthIndicator,
  type HealthTrend,
  type BudgetVarianceAnalysis,
} from './ProjectHealthService';

export {
  progressAnalyticsService,
  type ProgressTrend,
  type ProgressForecast,
  type MilestoneInfo,
  type TimelineStatus,
  type ProgressSummary,
} from './ProgressAnalyticsService';

export {
  dashboardAlertsService,
  type Alert,
  type AlertSeverity,
  type AlertStatus,
  type AlertCategory,
  type AlertFilters,
  type AlertSummary,
  type AlertInput,
} from './DashboardAlertsService';

// Unified facade for backward compatibility
export { dashboardAnalyticsFacade } from './DashboardAnalyticsFacade';
