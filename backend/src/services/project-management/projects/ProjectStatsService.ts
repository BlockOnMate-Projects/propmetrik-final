/**
 * Project Stats Service
 * 
 * Phase 3.11: Split projectService
 * 
 * Statistics and aggregations:
 * - Project summaries
 * - Organization-wide stats
 * - Progress metrics
 * - Financial rollups
 * 
 * @module services/project-management/projects/ProjectStatsService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  ProjectStats,
  ProjectSummary,
  ProjectType,
  ProjectStatus,
  mapRowToSummary,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ProjectStatsServiceImpl extends BaseService {
  constructor() {
    super('ProjectStatsService');
  }

  /**
   * Get organization-wide project statistics
   */
  async getStats(organizationId: string): Promise<ProjectStats> {
    // Get counts by status and type
    const countResult = await this.query(
      `SELECT 
         COUNT(*) as total,
         status,
         project_type
       FROM development_projects
       WHERE organization_id = $1 AND deleted_at IS NULL
       GROUP BY GROUPING SETS ((status), (project_type), ())`,
      [organizationId]
    );

    const byStatus: Record<ProjectStatus, number> = {
      planning: 0,
      pre_construction: 0,
      under_construction: 0,
      finishing: 0,
      pre_handover: 0,
      handover: 0,
      completed: 0,
      on_hold: 0,
      cancelled: 0,
    };

    const byType: Record<ProjectType, number> = {
      residential_single: 0,
      residential_multi: 0,
      mixed_use: 0,
      commercial: 0,
      industrial: 0,
      land_development: 0,
      renovation: 0,
    };

    let totalProjects = 0;

    for (const row of countResult.rows) {
      const count = parseInt(row.total);
      if (row.status && !row.project_type) {
        byStatus[row.status as ProjectStatus] = count;
      } else if (row.project_type && !row.status) {
        byType[row.project_type as ProjectType] = count;
      } else if (!row.status && !row.project_type) {
        totalProjects = count;
      }
    }

    // Get financial and unit stats
    const statsResult = await this.query(
      `SELECT 
         COALESCE(SUM(total_units), 0) as total_units,
         COALESCE(SUM(total_budget), 0) as total_budget,
         COALESCE(SUM(total_spent), 0) as total_spent,
         COALESCE(SUM(actual_revenue), 0) as total_revenue,
         COALESCE(AVG(overall_progress), 0) as avg_progress
       FROM development_projects
       WHERE organization_id = $1 AND deleted_at IS NULL`,
      [organizationId]
    );

    const stats = statsResult.rows[0];

    // Get unit status counts
    const unitResult = await this.query(
      `SELECT 
         COUNT(*) FILTER (WHERE pu.status = 'sold') as sold,
         COUNT(*) FILTER (WHERE pu.status = 'available') as available
       FROM project_units pu
       JOIN development_projects dp ON pu.project_id = dp.id
       WHERE dp.organization_id = $1 AND dp.deleted_at IS NULL`,
      [organizationId]
    );

    const units = unitResult.rows[0];

    return {
      totalProjects,
      byStatus,
      byType,
      totalUnits: parseInt(stats.total_units) || 0,
      unitsSold: parseInt(units.sold) || 0,
      unitsAvailable: parseInt(units.available) || 0,
      totalBudget: parseFloat(stats.total_budget) || 0,
      totalSpent: parseFloat(stats.total_spent) || 0,
      totalRevenue: parseFloat(stats.total_revenue) || 0,
      avgProgress: Math.round(parseFloat(stats.avg_progress) || 0),
    };
  }

  /**
   * Get project summaries for dashboard
   */
  async getSummaries(organizationId: string, limit?: number): Promise<ProjectSummary[]> {
    let query = `
      SELECT 
        dp.*,
        (SELECT COUNT(*) FROM project_units WHERE project_id = dp.id AND status = 'available') as units_available,
        (SELECT COUNT(*) FROM project_units WHERE project_id = dp.id AND status = 'reserved') as units_reserved,
        (SELECT COUNT(*) FROM project_units WHERE project_id = dp.id AND status = 'sold') as units_sold,
        (SELECT COUNT(*) FROM project_units WHERE project_id = dp.id AND status = 'handed_over') as units_handed_over,
        (SELECT COUNT(*) FROM project_phases WHERE project_id = dp.id AND status = 'completed') as phases_completed,
        (SELECT COUNT(*) FROM project_phases WHERE project_id = dp.id) as phases_total,
        CASE 
          WHEN dp.estimated_completion_date IS NOT NULL 
          THEN GREATEST(0, EXTRACT(DAY FROM dp.estimated_completion_date - NOW()))::integer
          WHEN dp.planned_completion_date IS NOT NULL 
          THEN GREATEST(0, EXTRACT(DAY FROM dp.planned_completion_date - NOW()))::integer
          ELSE NULL
        END as days_to_completion
      FROM development_projects dp
      WHERE dp.organization_id = $1 AND dp.deleted_at IS NULL
      ORDER BY dp.updated_at DESC
    `;

    const params: unknown[] = [organizationId];

    if (limit) {
      query += ` LIMIT $2`;
      params.push(limit);
    }

    const result = await this.query(query, params);
    return result.rows.map(mapRowToSummary);
  }

  /**
   * Get project summary by ID
   */
  async getSummary(projectId: string): Promise<ProjectSummary | null> {
    const result = await this.query(
      `SELECT 
        dp.*,
        (SELECT COUNT(*) FROM project_units WHERE project_id = dp.id AND status = 'available') as units_available,
        (SELECT COUNT(*) FROM project_units WHERE project_id = dp.id AND status = 'reserved') as units_reserved,
        (SELECT COUNT(*) FROM project_units WHERE project_id = dp.id AND status = 'sold') as units_sold,
        (SELECT COUNT(*) FROM project_units WHERE project_id = dp.id AND status = 'handed_over') as units_handed_over,
        (SELECT COUNT(*) FROM project_phases WHERE project_id = dp.id AND status = 'completed') as phases_completed,
        (SELECT COUNT(*) FROM project_phases WHERE project_id = dp.id) as phases_total,
        CASE 
          WHEN dp.estimated_completion_date IS NOT NULL 
          THEN GREATEST(0, EXTRACT(DAY FROM dp.estimated_completion_date - NOW()))::integer
          ELSE NULL
        END as days_to_completion
      FROM development_projects dp
      WHERE dp.id = $1 AND dp.deleted_at IS NULL`,
      [projectId]
    );

    return result.rows[0] ? mapRowToSummary(result.rows[0]) : null;
  }

  /**
   * Get projects by status counts
   */
  async getCountsByStatus(organizationId: string): Promise<Record<ProjectStatus, number>> {
    const result = await this.query(
      `SELECT status, COUNT(*) as count
       FROM development_projects
       WHERE organization_id = $1 AND deleted_at IS NULL
       GROUP BY status`,
      [organizationId]
    );

    const counts: Record<ProjectStatus, number> = {
      planning: 0,
      pre_construction: 0,
      under_construction: 0,
      finishing: 0,
      pre_handover: 0,
      handover: 0,
      completed: 0,
      on_hold: 0,
      cancelled: 0,
    };

    for (const row of result.rows) {
      counts[row.status as ProjectStatus] = parseInt(row.count);
    }

    return counts;
  }

  /**
   * Get active project count (excluding completed, cancelled, on_hold)
   */
  async getActiveCount(organizationId: string): Promise<number> {
    const result = await this.query(
      `SELECT COUNT(*) as count
       FROM development_projects
       WHERE organization_id = $1 
       AND deleted_at IS NULL
       AND status NOT IN ('completed', 'cancelled', 'on_hold')`,
      [organizationId]
    );

    return parseInt(result.rows[0].count) || 0;
  }

  /**
   * Get projects with budget variance
   */
  async getProjectsWithBudgetVariance(
    organizationId: string,
    varianceThreshold = 10
  ): Promise<Array<{
    id: string;
    name: string;
    budget: number;
    spent: number;
    variance: number;
    variancePercent: number;
  }>> {
    const result = await this.query(
      `SELECT id, name, total_budget as budget, total_spent as spent,
         (total_spent - total_budget) as variance,
         CASE WHEN total_budget > 0 
           THEN ((total_spent - total_budget) / total_budget * 100)
           ELSE 0
         END as variance_percent
       FROM development_projects
       WHERE organization_id = $1 
       AND deleted_at IS NULL
       AND total_budget > 0
       AND ABS((total_spent - total_budget) / total_budget * 100) > $2
       ORDER BY ABS((total_spent - total_budget) / total_budget * 100) DESC`,
      [organizationId, varianceThreshold]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      budget: parseFloat(row.budget),
      spent: parseFloat(row.spent),
      variance: parseFloat(row.variance),
      variancePercent: parseFloat(row.variance_percent),
    }));
  }

  /**
   * Get projects behind schedule
   */
  async getProjectsBehindSchedule(organizationId: string): Promise<Array<{
    id: string;
    name: string;
    plannedCompletion: string;
    estimatedCompletion: string;
    delayDays: number;
  }>> {
    const result = await this.query(
      `SELECT id, name, 
         planned_completion_date,
         estimated_completion_date,
         EXTRACT(DAY FROM estimated_completion_date - planned_completion_date)::integer as delay_days
       FROM development_projects
       WHERE organization_id = $1 
       AND deleted_at IS NULL
       AND planned_completion_date IS NOT NULL
       AND estimated_completion_date IS NOT NULL
       AND estimated_completion_date > planned_completion_date
       AND status NOT IN ('completed', 'cancelled')
       ORDER BY (estimated_completion_date - planned_completion_date) DESC`,
      [organizationId]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      plannedCompletion: row.planned_completion_date?.toISOString().split('T')[0],
      estimatedCompletion: row.estimated_completion_date?.toISOString().split('T')[0],
      delayDays: row.delay_days,
    }));
  }

  /**
   * Get top performing projects by sales
   */
  async getTopProjectsBySales(
    organizationId: string,
    limit = 5
  ): Promise<Array<{
    id: string;
    name: string;
    salesProgress: number;
    actualRevenue: number;
    unitsSold: number;
    totalUnits: number;
  }>> {
    const result = await this.query(
      `SELECT dp.id, dp.name, dp.sales_progress, dp.actual_revenue,
         (SELECT COUNT(*) FROM project_units WHERE project_id = dp.id AND status = 'sold') as units_sold,
         dp.total_units
       FROM development_projects dp
       WHERE dp.organization_id = $1 
       AND dp.deleted_at IS NULL
       AND dp.total_units > 0
       ORDER BY dp.sales_progress DESC, dp.actual_revenue DESC
       LIMIT $2`,
      [organizationId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      salesProgress: parseFloat(row.sales_progress) || 0,
      actualRevenue: parseFloat(row.actual_revenue) || 0,
      unitsSold: parseInt(row.units_sold) || 0,
      totalUnits: parseInt(row.total_units) || 0,
    }));
  }

  /**
   * Get revenue by region
   */
  async getRevenueByRegion(organizationId: string): Promise<Array<{
    region: string;
    projectCount: number;
    totalBudget: number;
    totalRevenue: number;
    avgProgress: number;
  }>> {
    const result = await this.query(
      `SELECT 
         COALESCE(region, 'Unspecified') as region,
         COUNT(*) as project_count,
         SUM(total_budget) as total_budget,
         SUM(actual_revenue) as total_revenue,
         AVG(overall_progress) as avg_progress
       FROM development_projects
       WHERE organization_id = $1 AND deleted_at IS NULL
       GROUP BY region
       ORDER BY total_revenue DESC`,
      [organizationId]
    );

    return result.rows.map(row => ({
      region: row.region,
      projectCount: parseInt(row.project_count),
      totalBudget: parseFloat(row.total_budget) || 0,
      totalRevenue: parseFloat(row.total_revenue) || 0,
      avgProgress: Math.round(parseFloat(row.avg_progress) || 0),
    }));
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const projectStatsService = new ProjectStatsServiceImpl();
