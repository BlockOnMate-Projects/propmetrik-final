/**
 * Portfolio Metrics Service
 * 
 * Phase 3.1: Split dashboardAnalyticsService
 * 
 * Provides portfolio-level analytics:
 * - Portfolio summary (total projects, budget, status)
 * - Status distribution
 * - Project type breakdown
 * - Regional distribution
 * - Monthly trends
 * 
 * @module services/project-management/analytics/PortfolioMetricsService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { UUID, ProjectStatus, ProjectType, GhanaRegion } from '../types';

// =============================================================================
// TYPES
// =============================================================================

export interface PortfolioSummary {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  totalBudget: number;
  totalSpent: number;
  totalUnits: number;
  averageProgress: number;
}

export interface StatusDistribution {
  status: ProjectStatus;
  count: number;
  totalBudget: number;
  percentOfTotal: number;
}

export interface ProjectTypeDistribution {
  projectType: ProjectType;
  count: number;
  totalBudget: number;
  averageProgress: number;
}

export interface RegionalDistribution {
  region: GhanaRegion;
  count: number;
  totalBudget: number;
  totalUnits: number;
}

export interface MonthlyTrend {
  month: string; // YYYY-MM
  projectsStarted: number;
  projectsCompleted: number;
  budgetAllocated: number;
  spentAmount: number;
}

export interface PortfolioMetrics {
  summary: PortfolioSummary;
  byStatus: StatusDistribution[];
  byProjectType: ProjectTypeDistribution[];
  byRegion: RegionalDistribution[];
  trends: MonthlyTrend[];
  lastUpdated: Date;
}

export interface PortfolioFilters {
  organizationId: UUID;
  projectIds?: UUID[];
  projectTypes?: ProjectType[];
  statuses?: ProjectStatus[];
  regions?: GhanaRegion[];
  dateFrom?: Date;
  dateTo?: Date;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class PortfolioMetricsServiceImpl extends BaseService {
  constructor() {
    super('PortfolioMetricsService');
  }

  /**
   * Get comprehensive portfolio metrics.
   */
  async getPortfolioMetrics(filters: PortfolioFilters): Promise<PortfolioMetrics> {
    const [summary, byStatus, byProjectType, byRegion, trends] = await Promise.all([
      this.getSummary(filters),
      this.getStatusDistribution(filters),
      this.getProjectTypeDistribution(filters),
      this.getRegionalDistribution(filters),
      this.getMonthlyTrends(filters),
    ]);

    return {
      summary,
      byStatus,
      byProjectType,
      byRegion,
      trends,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get portfolio summary.
   */
  async getSummary(filters: PortfolioFilters): Promise<PortfolioSummary> {
    const { conditions, params } = this.buildFilterConditions(filters);
    
    const result = await this.query(
      `SELECT 
         COUNT(*) as total_projects,
         COUNT(*) FILTER (WHERE status IN ('under_construction', 'pre_construction', 'finishing')) as active_projects,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_projects,
         COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold_projects,
         COALESCE(SUM(total_budget), 0) as total_budget,
         COALESCE(SUM(total_spent), 0) as total_spent,
         COALESCE(SUM(total_units), 0) as total_units,
         COALESCE(AVG(overall_progress), 0) as average_progress
       FROM development_projects
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    const row = result.rows[0];
    return {
      totalProjects: parseInt(row.total_projects, 10),
      activeProjects: parseInt(row.active_projects, 10),
      completedProjects: parseInt(row.completed_projects, 10),
      onHoldProjects: parseInt(row.on_hold_projects, 10),
      totalBudget: parseFloat(row.total_budget),
      totalSpent: parseFloat(row.total_spent),
      totalUnits: parseInt(row.total_units, 10),
      averageProgress: parseFloat(row.average_progress),
    };
  }

  /**
   * Get status distribution.
   */
  async getStatusDistribution(filters: PortfolioFilters): Promise<StatusDistribution[]> {
    const { conditions, params } = this.buildFilterConditions(filters);
    
    const result = await this.query(
      `WITH totals AS (
         SELECT COUNT(*) as total_count, COALESCE(SUM(total_budget), 0) as total_budget
         FROM development_projects
         WHERE ${conditions.join(' AND ')}
       )
       SELECT 
         p.status,
         COUNT(*) as count,
         COALESCE(SUM(p.total_budget), 0) as total_budget,
         CASE WHEN t.total_count > 0 
           THEN ROUND((COUNT(*)::decimal / t.total_count) * 100, 2)
           ELSE 0 
         END as percent_of_total
       FROM development_projects p, totals t
       WHERE ${conditions.map(c => c.replace('development_projects', 'p')).join(' AND ').replace('p.organization_id', 'p.organization_id')}
       GROUP BY p.status, t.total_count
       ORDER BY count DESC`,
      params
    );

    return result.rows.map(row => ({
      status: row.status as ProjectStatus,
      count: parseInt(row.count, 10),
      totalBudget: parseFloat(row.total_budget),
      percentOfTotal: parseFloat(row.percent_of_total),
    }));
  }

  /**
   * Get project type distribution.
   */
  async getProjectTypeDistribution(filters: PortfolioFilters): Promise<ProjectTypeDistribution[]> {
    const { conditions, params } = this.buildFilterConditions(filters);
    
    const result = await this.query(
      `SELECT 
         project_type,
         COUNT(*) as count,
         COALESCE(SUM(total_budget), 0) as total_budget,
         COALESCE(AVG(overall_progress), 0) as average_progress
       FROM development_projects
       WHERE ${conditions.join(' AND ')}
       GROUP BY project_type
       ORDER BY count DESC`,
      params
    );

    return result.rows.map(row => ({
      projectType: row.project_type as ProjectType,
      count: parseInt(row.count, 10),
      totalBudget: parseFloat(row.total_budget),
      averageProgress: parseFloat(row.average_progress),
    }));
  }

  /**
   * Get regional distribution.
   */
  async getRegionalDistribution(filters: PortfolioFilters): Promise<RegionalDistribution[]> {
    const { conditions, params } = this.buildFilterConditions(filters);
    
    const result = await this.query(
      `SELECT 
         COALESCE(region, 'Unknown') as region,
         COUNT(*) as count,
         COALESCE(SUM(total_budget), 0) as total_budget,
         COALESCE(SUM(total_units), 0) as total_units
       FROM development_projects
       WHERE ${conditions.join(' AND ')}
       GROUP BY region
       ORDER BY count DESC`,
      params
    );

    return result.rows.map(row => ({
      region: row.region as GhanaRegion,
      count: parseInt(row.count, 10),
      totalBudget: parseFloat(row.total_budget),
      totalUnits: parseInt(row.total_units, 10),
    }));
  }

  /**
   * Get monthly trends for the last 12 months.
   */
  async getMonthlyTrends(filters: PortfolioFilters): Promise<MonthlyTrend[]> {
    const result = await this.query(
      `WITH months AS (
         SELECT generate_series(
           date_trunc('month', NOW() - INTERVAL '11 months'),
           date_trunc('month', NOW()),
           INTERVAL '1 month'
         ) as month
       )
       SELECT 
         TO_CHAR(m.month, 'YYYY-MM') as month,
         COUNT(p.id) FILTER (WHERE date_trunc('month', p.actual_start_date) = m.month) as projects_started,
         COUNT(p.id) FILTER (WHERE date_trunc('month', p.actual_completion_date) = m.month) as projects_completed,
         COALESCE(SUM(p.total_budget) FILTER (WHERE date_trunc('month', p.created_at) = m.month), 0) as budget_allocated,
         COALESCE(SUM(c.amount) FILTER (WHERE date_trunc('month', c.created_at) = m.month), 0) as spent_amount
       FROM months m
       LEFT JOIN development_projects p ON p.organization_id = $1
       LEFT JOIN project_costs c ON c.project_id = p.id
       GROUP BY m.month
       ORDER BY m.month`,
      [filters.organizationId]
    );

    return result.rows.map(row => ({
      month: row.month,
      projectsStarted: parseInt(row.projects_started, 10) || 0,
      projectsCompleted: parseInt(row.projects_completed, 10) || 0,
      budgetAllocated: parseFloat(row.budget_allocated) || 0,
      spentAmount: parseFloat(row.spent_amount) || 0,
    }));
  }

  /**
   * Build filter conditions for SQL queries.
   */
  private buildFilterConditions(filters: PortfolioFilters): { conditions: string[]; params: any[] } {
    const conditions: string[] = ['organization_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [filters.organizationId];
    let paramIndex = 2;

    if (filters.projectIds?.length) {
      conditions.push(`id = ANY($${paramIndex++})`);
      params.push(filters.projectIds);
    }

    if (filters.projectTypes?.length) {
      conditions.push(`project_type = ANY($${paramIndex++})`);
      params.push(filters.projectTypes);
    }

    if (filters.statuses?.length) {
      conditions.push(`status = ANY($${paramIndex++})`);
      params.push(filters.statuses);
    }

    if (filters.regions?.length) {
      conditions.push(`region = ANY($${paramIndex++})`);
      params.push(filters.regions);
    }

    if (filters.dateFrom) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.dateTo);
    }

    return { conditions, params };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const portfolioMetricsService = new PortfolioMetricsServiceImpl();
