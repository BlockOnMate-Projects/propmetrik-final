/**
 * Portfolio Service
 * Multi-project overview and cross-project analytics
 * Phase 3A Week 2
 */

import { pool } from '../../database';

export interface PortfolioSummary {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  on_hold_projects: number;
  total_budget: number;
  total_spent: number;
  budget_remaining: number;
  overall_progress: number;
  projects_on_track: number;
  projects_at_risk: number;
  projects_behind: number;
}

export interface ProjectOverview {
  id: string;
  name: string;
  status: string;
  phase: string;
  location: string;
  region: string;
  start_date: string;
  target_completion: string;
  budget: number;
  spent: number;
  progress: number;
  health_status: 'on_track' | 'at_risk' | 'behind';
  open_rfis: number;
  pending_cos: number;
  pending_submittals: number;
  overdue_tasks: number;
  days_remaining: number;
  currency: string;
}

export interface PortfolioMetrics {
  budget_by_status: { status: string; total: number }[];
  projects_by_region: { region: string; count: number }[];
  projects_by_phase: { phase: string; count: number }[];
  monthly_spend: { month: string; amount: number }[];
  completion_forecast: { project: string; estimated_completion: string }[];
}

export interface PortfolioFilters {
  region?: string;
  status?: string;
  phase?: string;
  health_status?: string;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

class PortfolioService {
  /**
   * Get portfolio summary across all projects
   */
  async getSummary(userId?: string): Promise<PortfolioSummary> {
    const query = `
      SELECT 
        COUNT(*) as total_projects,
        COUNT(*) FILTER (WHERE status IN ('active', 'in_progress', 'construction')) as active_projects,
        COUNT(*) FILTER (WHERE status IN ('completed', 'closed')) as completed_projects,
        COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold_projects,
        COALESCE(SUM(total_budget), 0) as total_budget,
        COALESCE(SUM(total_spent), 0) as total_spent,
        COALESCE(SUM(total_budget) - SUM(total_spent), 0) as budget_remaining,
        COALESCE(AVG(progress_percentage), 0) as overall_progress
      FROM development_projects
      WHERE deleted_at IS NULL
    `;
    
    const result = await pool.query(query);
    const row = result.rows[0];
    
    // Calculate health metrics
    const healthQuery = `
      SELECT 
        COUNT(*) FILTER (
          WHERE (
            progress_percentage >= (
              CASE WHEN target_completion_date IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (CURRENT_DATE - start_date)) / 
                   EXTRACT(EPOCH FROM (target_completion_date - start_date)) * 100
              ELSE progress_percentage END
            ) * 0.9
          )
        ) as on_track,
        COUNT(*) FILTER (
          WHERE (
            progress_percentage < (
              CASE WHEN target_completion_date IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (CURRENT_DATE - start_date)) / 
                   EXTRACT(EPOCH FROM (target_completion_date - start_date)) * 100
              ELSE progress_percentage END
            ) * 0.9
            AND progress_percentage >= (
              CASE WHEN target_completion_date IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (CURRENT_DATE - start_date)) / 
                   EXTRACT(EPOCH FROM (target_completion_date - start_date)) * 100
              ELSE progress_percentage END
            ) * 0.7
          )
        ) as at_risk,
        COUNT(*) FILTER (
          WHERE (
            progress_percentage < (
              CASE WHEN target_completion_date IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (CURRENT_DATE - start_date)) / 
                   EXTRACT(EPOCH FROM (target_completion_date - start_date)) * 100
              ELSE progress_percentage END
            ) * 0.7
          )
        ) as behind
      FROM development_projects
      WHERE deleted_at IS NULL 
        AND status IN ('active', 'in_progress', 'construction')
    `;
    
    const healthResult = await pool.query(healthQuery);
    const health = healthResult.rows[0] || { on_track: 0, at_risk: 0, behind: 0 };
    
    return {
      total_projects: parseInt(row.total_projects) || 0,
      active_projects: parseInt(row.active_projects) || 0,
      completed_projects: parseInt(row.completed_projects) || 0,
      on_hold_projects: parseInt(row.on_hold_projects) || 0,
      total_budget: parseFloat(row.total_budget) || 0,
      total_spent: parseFloat(row.total_spent) || 0,
      budget_remaining: parseFloat(row.budget_remaining) || 0,
      overall_progress: parseFloat(row.overall_progress) || 0,
      projects_on_track: parseInt(health.on_track) || 0,
      projects_at_risk: parseInt(health.at_risk) || 0,
      projects_behind: parseInt(health.behind) || 0,
    };
  }

  /**
   * Get all projects with overview data
   */
  async getProjects(filters: PortfolioFilters): Promise<ProjectOverview[]> {
    let whereConditions: string[] = ['dp.deleted_at IS NULL'];
    let params: any[] = [];
    let paramIndex = 1;
    
    if (filters.region) {
      whereConditions.push(`dp.region = $${paramIndex++}`);
      params.push(filters.region);
    }
    
    if (filters.status) {
      whereConditions.push(`dp.status = $${paramIndex++}`);
      params.push(filters.status);
    }
    
    if (filters.phase) {
      whereConditions.push(`dp.current_phase = $${paramIndex++}`);
      params.push(filters.phase);
    }
    
    if (filters.search) {
      whereConditions.push(`(dp.name ILIKE $${paramIndex} OR dp.location ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';
    
    const sortColumn = filters.sort_by || 'name';
    const sortOrder = filters.sort_order || 'asc';
    const validColumns = ['name', 'progress_percentage', 'total_budget', 'start_date', 'target_completion_date', 'status'];
    const safeSort = validColumns.includes(sortColumn) ? sortColumn : 'name';
    
    const query = `
      SELECT 
        dp.id,
        dp.name,
        dp.status,
        dp.current_phase as phase,
        dp.location,
        dp.region,
        dp.start_date,
        dp.target_completion_date as target_completion,
        COALESCE(dp.total_budget, 0) as budget,
        COALESCE(dp.total_spent, 0) as spent,
        COALESCE(dp.progress_percentage, 0) as progress,
        dp.currency,
        (
          SELECT COUNT(*) FROM rfis r 
          WHERE r.project_id = dp.id 
            AND r.status IN ('open', 'pending')
        ) as open_rfis,
        (
          SELECT COUNT(*) FROM change_orders co 
          WHERE co.project_id = dp.id 
            AND co.status IN ('pending', 'pending_approval')
        ) as pending_cos,
        (
          SELECT COUNT(*) FROM submittals s 
          WHERE s.project_id = dp.id 
            AND s.status IN ('pending_review', 'under_review')
        ) as pending_submittals,
        CASE 
          WHEN dp.target_completion_date IS NOT NULL 
          THEN dp.target_completion_date - CURRENT_DATE
          ELSE NULL
        END as days_remaining
      FROM development_projects dp
      ${whereClause}
      ORDER BY dp.${safeSort} ${sortOrder}
    `;
    
    const result = await pool.query(query, params);
    
    return result.rows.map(row => ({
      ...row,
      budget: parseFloat(row.budget) || 0,
      spent: parseFloat(row.spent) || 0,
      progress: parseFloat(row.progress) || 0,
      open_rfis: parseInt(row.open_rfis) || 0,
      pending_cos: parseInt(row.pending_cos) || 0,
      pending_submittals: parseInt(row.pending_submittals) || 0,
      days_remaining: row.days_remaining ? parseInt(row.days_remaining) : null,
      overdue_tasks: 0, // Would need task tracking implementation
      health_status: this.calculateHealthStatus(row),
    }));
  }

  /**
   * Get portfolio metrics for charts
   */
  async getMetrics(): Promise<PortfolioMetrics> {
    // Budget by status
    const budgetByStatusQuery = `
      SELECT 
        status,
        COALESCE(SUM(total_budget), 0) as total
      FROM development_projects
      WHERE deleted_at IS NULL
      GROUP BY status
      ORDER BY total DESC
    `;
    const budgetByStatus = await pool.query(budgetByStatusQuery);
    
    // Projects by region
    const projectsByRegionQuery = `
      SELECT 
        COALESCE(region, 'Unknown') as region,
        COUNT(*) as count
      FROM development_projects
      WHERE deleted_at IS NULL
      GROUP BY region
      ORDER BY count DESC
    `;
    const projectsByRegion = await pool.query(projectsByRegionQuery);
    
    // Projects by phase
    const projectsByPhaseQuery = `
      SELECT 
        COALESCE(current_phase, 'Not Set') as phase,
        COUNT(*) as count
      FROM development_projects
      WHERE deleted_at IS NULL
      GROUP BY current_phase
      ORDER BY count DESC
    `;
    const projectsByPhase = await pool.query(projectsByPhaseQuery);
    
    // Monthly spend (last 12 months) - simplified, would need expense/payment tables
    const monthlySpendQuery = `
      SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        COUNT(*) * 10000 as amount  -- Placeholder calculation
      FROM development_projects
      WHERE deleted_at IS NULL
        AND created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month
    `;
    const monthlySpend = await pool.query(monthlySpendQuery);
    
    // Completion forecast
    const forecastQuery = `
      SELECT 
        name as project,
        target_completion_date as estimated_completion
      FROM development_projects
      WHERE deleted_at IS NULL
        AND status IN ('active', 'in_progress', 'construction')
        AND target_completion_date IS NOT NULL
      ORDER BY target_completion_date
      LIMIT 10
    `;
    const forecast = await pool.query(forecastQuery);
    
    return {
      budget_by_status: budgetByStatus.rows.map(r => ({
        status: r.status,
        total: parseFloat(r.total) || 0
      })),
      projects_by_region: projectsByRegion.rows.map(r => ({
        region: r.region,
        count: parseInt(r.count) || 0
      })),
      projects_by_phase: projectsByPhase.rows.map(r => ({
        phase: r.phase,
        count: parseInt(r.count) || 0
      })),
      monthly_spend: monthlySpend.rows.map(r => ({
        month: r.month,
        amount: parseFloat(r.amount) || 0
      })),
      completion_forecast: forecast.rows.map(r => ({
        project: r.project,
        estimated_completion: r.estimated_completion
      }))
    };
  }

  /**
   * Get activity feed across all projects
   */
  async getActivityFeed(limit: number = 20): Promise<any[]> {
    // Combine recent activities from various sources
    const query = `
      (
        SELECT 
          'rfi' as type,
          r.id,
          dp.name as project_name,
          r.subject as title,
          r.status,
          r.created_at as timestamp
        FROM rfis r
        JOIN development_projects dp ON r.project_id = dp.id
        WHERE r.created_at >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY r.created_at DESC
        LIMIT 10
      )
      UNION ALL
      (
        SELECT 
          'change_order' as type,
          co.id,
          dp.name as project_name,
          co.title,
          co.status,
          co.created_at as timestamp
        FROM change_orders co
        JOIN development_projects dp ON co.project_id = dp.id
        WHERE co.created_at >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY co.created_at DESC
        LIMIT 10
      )
      UNION ALL
      (
        SELECT 
          'submittal' as type,
          s.id,
          dp.name as project_name,
          s.title,
          s.status::text,
          s.created_at as timestamp
        FROM submittals s
        JOIN development_projects dp ON s.project_id = dp.id
        WHERE s.created_at >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY s.created_at DESC
        LIMIT 10
      )
      ORDER BY timestamp DESC
      LIMIT $1
    `;
    
    try {
      const result = await pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching activity feed:', error);
      return [];
    }
  }

  /**
   * Get upcoming deadlines across all projects
   */
  async getUpcomingDeadlines(days: number = 14): Promise<any[]> {
    const query = `
      (
        SELECT 
          'rfi_due' as type,
          r.id,
          dp.name as project_name,
          r.subject as title,
          r.due_date as deadline,
          r.priority
        FROM rfis r
        JOIN development_projects dp ON r.project_id = dp.id
        WHERE r.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::INTEGER
          AND r.status NOT IN ('answered', 'closed', 'void')
      )
      UNION ALL
      (
        SELECT 
          'submittal_due' as type,
          s.id,
          dp.name as project_name,
          s.title,
          s.required_date as deadline,
          s.priority
        FROM submittals s
        JOIN development_projects dp ON s.project_id = dp.id
        WHERE s.required_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::INTEGER
          AND s.status NOT IN ('approved', 'approved_as_noted', 'rejected', 'void')
      )
      ORDER BY deadline
      LIMIT 20
    `;
    
    try {
      const result = await pool.query(query, [days]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching deadlines:', error);
      return [];
    }
  }

  /**
   * Calculate health status based on progress vs schedule
   */
  private calculateHealthStatus(project: any): 'on_track' | 'at_risk' | 'behind' {
    if (!project.target_completion || !project.start_date) {
      return 'on_track';
    }
    
    const startDate = new Date(project.start_date);
    const targetDate = new Date(project.target_completion);
    const now = new Date();
    
    const totalDuration = targetDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();
    const expectedProgress = Math.min(100, (elapsed / totalDuration) * 100);
    
    const actualProgress = parseFloat(project.progress) || 0;
    const ratio = actualProgress / expectedProgress;
    
    if (ratio >= 0.9) return 'on_track';
    if (ratio >= 0.7) return 'at_risk';
    return 'behind';
  }
}

export const portfolioService = new PortfolioService();
export default portfolioService;
