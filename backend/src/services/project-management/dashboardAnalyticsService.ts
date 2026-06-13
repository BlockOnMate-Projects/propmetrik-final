/**
 * Dashboard Analytics Service
 * 
 * @deprecated This service has been split into focused services in Phase 3.1:
 * 
 * - PortfolioMetricsService: Portfolio-level analytics
 * - ProjectHealthService: Project health scoring  
 * - ProgressAnalyticsService: Progress tracking and forecasting
 * - DashboardAlertsService: Alert management
 * - DashboardAnalyticsFacade: Unified facade for backward compatibility
 * 
 * Import from './analytics' instead:
 * ```
 * import { 
 *   portfolioMetricsService,
 *   projectHealthService,
 *   progressAnalyticsService,
 *   dashboardAlertsService,
 *   dashboardAnalyticsFacade 
 * } from './analytics';
 * ```
 * 
 * This file will be removed in a future release.
 * 
 * Original description:
 * Phase 2 Sprint 3: Dashboard Metrics & Charts
 * 
 * Provides comprehensive analytics and metrics for the project management dashboard:
 * - Portfolio overview metrics (total projects, budget, status distribution)
 * - Budget analysis with variance tracking
 * - Timeline and progress metrics
 * - Ghana-specific compliance tracking
 * - Health scores and forecasting
 * - Alert management
 */

import { pool } from '../../database';
import { QueryResult } from 'pg';

// ============================================================================
// TYPES
// ============================================================================

export interface PortfolioMetrics {
  summary: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    onHoldProjects: number;
    totalBudget: number;
    totalSpent: number;
    totalUnits: number;
    averageProgress: number;
  };
  byStatus: {
    status: string;
    count: number;
    totalBudget: number;
    percentOfTotal: number;
  }[];
  byProjectType: {
    projectType: string;
    count: number;
    totalBudget: number;
    averageProgress: number;
  }[];
  byRegion: {
    region: string;
    count: number;
    totalBudget: number;
  }[];
  trends: {
    month: string;
    projectsStarted: number;
    projectsCompleted: number;
    budgetAllocated: number;
  }[];
}

export interface BudgetOverview {
  totalBudget: number;
  totalActualCost: number;
  totalCommitted: number;
  totalRemaining: number;
  overallVariance: number;
  overallVariancePercent: number;
  byCategory: {
    category: string;
    budgeted: number;
    actual: number;
    variance: number;
    variancePercent: number;
    utilizationPercent: number;
  }[];
  byProject: {
    projectId: string;
    projectName: string;
    totalBudget: number;
    actualCost: number;
    variance: number;
    status: 'under_budget' | 'on_budget' | 'over_budget' | 'warning';
  }[];
  monthlyTrend: {
    month: string;
    budgeted: number;
    actual: number;
    cumulative: number;
  }[];
}

export interface TimelineStatus {
  onTrack: number;
  atRisk: number;
  delayed: number;
  completed: number;
  projects: {
    projectId: string;
    projectName: string;
    plannedEndDate: string;
    forecastEndDate: string;
    daysVariance: number;
    status: 'on_track' | 'at_risk' | 'delayed' | 'completed';
    currentPhase: string;
    percentComplete: number;
  }[];
  upcomingMilestones: {
    milestoneId: string;
    projectId: string;
    projectName: string;
    milestoneName: string;
    targetDate: string;
    daysUntilDue: number;
    milestoneType: string;
    priority: string;
  }[];
  recentCompletions: {
    milestoneId: string;
    projectName: string;
    milestoneName: string;
    completedDate: string;
    daysEarlyOrLate: number;
  }[];
}

export interface ComplianceStatus {
  totalPermits: number;
  activePermits: number;
  pendingPermits: number;
  expiredPermits: number;
  expiringWithin30Days: number;
  byPermitType: {
    permitType: string;
    total: number;
    active: number;
    pending: number;
    expired: number;
  }[];
  upcomingExpirations: {
    permitId: string;
    projectName: string;
    permitType: string;
    expirationDate: string;
    daysUntilExpiry: number;
  }[];
  recentApprovals: {
    permitId: string;
    projectName: string;
    permitType: string;
    approvedDate: string;
  }[];
}

export interface ProjectHealthScore {
  projectId: string;
  projectName: string;
  overallScore: number; // 0-100
  scheduleScore: number;
  budgetScore: number;
  complianceScore: number;
  milestoneScore: number;
  riskFactors: {
    factor: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    impact: number;
  }[];
  recommendations: string[];
}

export interface BudgetVarianceAnalysis {
  projectId: string;
  phases: {
    phaseId: string;
    phaseName: string;
    budgetedCost: number;
    actualCost: number;
    variance: number;
    variancePercent: number;
    earnedValue: number;
    costPerformanceIndex: number;
    schedulePerformanceIndex: number;
    estimateAtCompletion: number;
    varianceAtCompletion: number;
  }[];
  costCategories: {
    category: string;
    budgeted: number;
    actual: number;
    variance: number;
    trend: 'increasing' | 'stable' | 'decreasing';
  }[];
  summary: {
    totalBudget: number;
    totalActual: number;
    earnedValue: number;
    plannedValue: number;
    costVariance: number;
    scheduleVariance: number;
    cpi: number;
    spi: number;
    eac: number;
    etc: number;
    vac: number;
  };
}

export interface ProgressTrend {
  projectId?: string;
  period: 'daily' | 'weekly' | 'monthly';
  dataPoints: {
    date: string;
    plannedProgress: number;
    actualProgress: number;
    variance: number;
  }[];
  forecast: {
    forecastDate: string;
    estimatedProgress: number;
    confidence: number;
  }[];
  burndown: {
    date: string;
    remainingWork: number;
    idealRemaining: number;
  }[];
}

export interface Alert {
  id: string;
  projectId: string;
  projectName: string;
  alertType: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: string;
  status: string;
  createdAt: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface DashboardFilters {
  organizationId: string;
  projectIds?: string[];
  projectTypes?: string[];
  statuses?: string[];
  regions?: string[];
  dateFrom?: string;
  dateTo?: string;
}

// ============================================================================
// PORTFOLIO METRICS
// ============================================================================

/**
 * Get comprehensive portfolio-level metrics
 */
export async function getPortfolioMetrics(
  organizationId: string,
  filters?: Partial<DashboardFilters>
): Promise<PortfolioMetrics> {
  const client = await pool.connect();
  
  try {
    // Build WHERE clause for filters
    const whereConditions = ['dp.organization_id = $1', 'dp.deleted_at IS NULL'];
    const params: any[] = [organizationId];
    let paramIndex = 2;
    
    if (filters?.projectTypes?.length) {
      whereConditions.push(`dp.project_type = ANY($${paramIndex})`);
      params.push(filters.projectTypes);
      paramIndex++;
    }
    
    if (filters?.statuses?.length) {
      whereConditions.push(`dp.status = ANY($${paramIndex})`);
      params.push(filters.statuses);
      paramIndex++;
    }
    
    if (filters?.regions?.length) {
      whereConditions.push(`dp.region = ANY($${paramIndex})`);
      params.push(filters.regions);
      paramIndex++;
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Summary metrics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_projects,
        COUNT(*) FILTER (WHERE dp.status IN ('planning', 'pre_construction', 'under_construction', 'finishing')) as active_projects,
        COUNT(*) FILTER (WHERE dp.status = 'completed') as completed_projects,
        COUNT(*) FILTER (WHERE dp.status = 'on_hold') as on_hold_projects,
        COALESCE(SUM(dp.total_budget), 0) as total_budget,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(pc.actual_costs), 0) FROM project_costs pc WHERE pc.project_id = dp.id)
        ), 0) as total_spent,
        COALESCE(SUM(dp.total_units), 0) as total_units,
        COALESCE(AVG(
          (SELECT COALESCE(AVG(pp.progress), 0) FROM project_phases pp WHERE pp.project_id = dp.id)
        ), 0) as average_progress
      FROM development_projects dp
      WHERE ${whereClause}
    `;
    
    const summaryResult = await client.query(summaryQuery, params);
    const summary = summaryResult.rows[0];
    
    // By status
    const statusQuery = `
      SELECT 
        dp.status,
        COUNT(*) as count,
        COALESCE(SUM(dp.total_budget), 0) as total_budget,
        ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM development_projects WHERE organization_id = $1 AND deleted_at IS NULL), 0) * 100, 1) as percent_of_total
      FROM development_projects dp
      WHERE ${whereClause}
      GROUP BY dp.status
      ORDER BY count DESC
    `;
    
    const statusResult = await client.query(statusQuery, params);
    
    // By project type
    const typeQuery = `
      SELECT 
        dp.project_type,
        COUNT(*) as count,
        COALESCE(SUM(dp.total_budget), 0) as total_budget,
        COALESCE(AVG(
          (SELECT COALESCE(AVG(pp.progress), 0) FROM project_phases pp WHERE pp.project_id = dp.id)
        ), 0) as average_progress
      FROM development_projects dp
      WHERE ${whereClause}
      GROUP BY dp.project_type
      ORDER BY count DESC
    `;
    
    const typeResult = await client.query(typeQuery, params);
    
    // By region — normalize so "Greater Accra" and "greater_accra" collapse into one
    // group (previously they appeared as two separate rows with the same display name).
    const regionQuery = `
      SELECT
        INITCAP(REPLACE(LOWER(TRIM(dp.region)), '_', ' ')) AS region,
        COUNT(*) as count,
        COALESCE(SUM(dp.total_budget), 0) as total_budget
      FROM development_projects dp
      WHERE ${whereClause} AND dp.region IS NOT NULL AND TRIM(dp.region) <> ''
      GROUP BY INITCAP(REPLACE(LOWER(TRIM(dp.region)), '_', ' '))
      ORDER BY count DESC
      LIMIT 10
    `;
    
    const regionResult = await client.query(regionQuery, params);
    
    // Monthly trends (last 12 months)
    const trendsQuery = `
      SELECT 
        TO_CHAR(month, 'YYYY-MM') as month,
        COUNT(*) FILTER (WHERE dp.created_at >= month AND dp.created_at < month + INTERVAL '1 month') as projects_started,
        COUNT(*) FILTER (WHERE dp.status = 'completed' AND dp.updated_at >= month AND dp.updated_at < month + INTERVAL '1 month') as projects_completed,
        COALESCE(SUM(dp.total_budget) FILTER (WHERE dp.created_at >= month AND dp.created_at < month + INTERVAL '1 month'), 0) as budget_allocated
      FROM generate_series(
        DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months'),
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) as month
      LEFT JOIN development_projects dp ON dp.organization_id = $1 AND dp.deleted_at IS NULL
      GROUP BY month
      ORDER BY month
    `;
    
    const trendsResult = await client.query(trendsQuery, [organizationId]);
    
    return {
      summary: {
        totalProjects: parseInt(summary.total_projects) || 0,
        activeProjects: parseInt(summary.active_projects) || 0,
        completedProjects: parseInt(summary.completed_projects) || 0,
        onHoldProjects: parseInt(summary.on_hold_projects) || 0,
        totalBudget: parseFloat(summary.total_budget) || 0,
        totalSpent: parseFloat(summary.total_spent) || 0,
        totalUnits: parseInt(summary.total_units) || 0,
        averageProgress: parseFloat(summary.average_progress) || 0
      },
      byStatus: statusResult.rows.map(row => ({
        status: row.status,
        count: parseInt(row.count),
        totalBudget: parseFloat(row.total_budget) || 0,
        percentOfTotal: parseFloat(row.percent_of_total) || 0
      })),
      byProjectType: typeResult.rows.map(row => ({
        projectType: row.project_type,
        count: parseInt(row.count),
        totalBudget: parseFloat(row.total_budget) || 0,
        averageProgress: parseFloat(row.average_progress) || 0
      })),
      byRegion: regionResult.rows.map(row => ({
        region: row.region,
        count: parseInt(row.count),
        totalBudget: parseFloat(row.total_budget) || 0
      })),
      trends: trendsResult.rows.map(row => ({
        month: row.month,
        projectsStarted: parseInt(row.projects_started) || 0,
        projectsCompleted: parseInt(row.projects_completed) || 0,
        budgetAllocated: parseFloat(row.budget_allocated) || 0
      }))
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// BUDGET OVERVIEW
// ============================================================================

/**
 * Get budget overview with variance analysis
 */
export async function getBudgetOverview(
  organizationId: string,
  filters?: Partial<DashboardFilters>
): Promise<BudgetOverview> {
  const client = await pool.connect();
  
  try {
    // Overall budget summary
    const summaryQuery = `
      SELECT 
        COALESCE(SUM(dp.total_budget), 0) as total_budget,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(pc.actual_costs), 0) FROM project_costs pc WHERE pc.project_id = dp.id)
        ), 0) as total_actual,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(pc.original_budget), 0) - COALESCE(SUM(pc.actual_costs), 0) 
           FROM project_costs pc WHERE pc.project_id = dp.id AND pc.status IN ('draft', 'committed', 'approved'))
        ), 0) as total_committed
      FROM development_projects dp
      WHERE dp.organization_id = $1 AND dp.deleted_at IS NULL
    `;
    
    const summaryResult = await client.query(summaryQuery, [organizationId]);
    const budget = summaryResult.rows[0];
    
    const totalBudget = parseFloat(budget.total_budget) || 0;
    const totalActual = parseFloat(budget.total_actual) || 0;
    const totalCommitted = parseFloat(budget.total_committed) || 0;
    const totalRemaining = totalBudget - totalActual - totalCommitted;
    const variance = totalActual - totalBudget;
    const variancePercent = totalBudget > 0 ? (variance / totalBudget) * 100 : 0;
    
    // By cost category
    const categoryQuery = `
      SELECT 
        pc.category as category,
        COALESCE(SUM(pc.original_budget), 0) as budgeted,
        COALESCE(SUM(pc.actual_costs), 0) as actual
      FROM project_costs pc
      JOIN development_projects dp ON dp.id = pc.project_id
      WHERE dp.organization_id = $1 AND dp.deleted_at IS NULL
      GROUP BY pc.category
      ORDER BY budgeted DESC
    `;
    
    const categoryResult = await client.query(categoryQuery, [organizationId]);
    
    // By project
    const projectQuery = `
      SELECT 
        dp.id as project_id,
        dp.project_name,
        dp.total_budget as total_budget,
        COALESCE(SUM(pc.actual_costs), 0) as actual_cost
      FROM development_projects dp
      LEFT JOIN project_costs pc ON pc.project_id = dp.id
      WHERE dp.organization_id = $1 AND dp.deleted_at IS NULL
        AND dp.status NOT IN ('completed', 'cancelled')
      GROUP BY dp.id, dp.project_name, dp.total_budget
      ORDER BY dp.total_budget DESC NULLS LAST
      LIMIT 20
    `;
    
    const projectResult = await client.query(projectQuery, [organizationId]);
    
    // Monthly trend (last 12 months)
    const trendQuery = `
      SELECT 
        TO_CHAR(month, 'YYYY-MM') as month,
        COALESCE(SUM(pc.original_budget), 0) as budgeted,
        COALESCE(SUM(pc.actual_costs), 0) as actual
      FROM generate_series(
        DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months'),
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) as month
      LEFT JOIN project_costs pc ON 
        DATE_TRUNC('month', pc.created_at) = month
      LEFT JOIN development_projects dp ON 
        dp.id = pc.project_id AND dp.organization_id = $1 AND dp.deleted_at IS NULL
      GROUP BY month
      ORDER BY month
    `;
    
    const trendResult = await client.query(trendQuery, [organizationId]);
    
    // Calculate cumulative
    let cumulative = 0;
    const monthlyTrend = trendResult.rows.map(row => {
      cumulative += parseFloat(row.actual) || 0;
      return {
        month: row.month,
        budgeted: parseFloat(row.budgeted) || 0,
        actual: parseFloat(row.actual) || 0,
        cumulative
      };
    });
    
    return {
      totalBudget,
      totalActualCost: totalActual,
      totalCommitted,
      totalRemaining,
      overallVariance: variance,
      overallVariancePercent: variancePercent,
      byCategory: categoryResult.rows.map(row => {
        const budgeted = parseFloat(row.budgeted) || 0;
        const actual = parseFloat(row.actual) || 0;
        const catVariance = actual - budgeted;
        return {
          category: row.category,
          budgeted,
          actual,
          variance: catVariance,
          variancePercent: budgeted > 0 ? (catVariance / budgeted) * 100 : 0,
          utilizationPercent: budgeted > 0 ? (actual / budgeted) * 100 : 0
        };
      }),
      byProject: projectResult.rows.map(row => {
        const projBudget = parseFloat(row.total_budget) || 0;
        const projActual = parseFloat(row.actual_cost) || 0;
        const projVariance = projActual - projBudget;
        const utilizationPct = projBudget > 0 ? (projActual / projBudget) * 100 : 0;
        
        let status: 'under_budget' | 'on_budget' | 'over_budget' | 'warning';
        if (utilizationPct > 100) status = 'over_budget';
        else if (utilizationPct > 90) status = 'warning';
        else if (utilizationPct > 50) status = 'on_budget';
        else status = 'under_budget';
        
        return {
          projectId: row.project_id,
          projectName: row.project_name,
          totalBudget: projBudget,
          actualCost: projActual,
          variance: projVariance,
          status
        };
      }),
      monthlyTrend
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// TIMELINE STATUS
// ============================================================================

/**
 * Get timeline and schedule status for all projects
 */
export async function getTimelineStatus(
  organizationId: string,
  filters?: Partial<DashboardFilters>
): Promise<TimelineStatus> {
  const client = await pool.connect();
  
  try {
    // Project timeline status
    const projectQuery = `
      SELECT 
        dp.id as project_id,
        dp.project_name,
        dp.estimated_completion_date as planned_end_date,
        dp.status,
        (
          SELECT pp.name 
          FROM project_phases pp 
          WHERE pp.project_id = dp.id AND pp.status = 'in_progress' 
          ORDER BY pp.phase_number 
          LIMIT 1
        ) as current_phase,
        (
          SELECT COALESCE(AVG(pp.progress), 0)
          FROM project_phases pp 
          WHERE pp.project_id = dp.id
        ) as percent_complete
      FROM development_projects dp
      WHERE dp.organization_id = $1 
        AND dp.deleted_at IS NULL
        AND dp.status NOT IN ('cancelled', 'on_hold')
      ORDER BY dp.estimated_completion_date ASC NULLS LAST
      LIMIT 50
    `;
    
    const projectResult = await client.query(projectQuery, [organizationId]);
    
    // Calculate timeline status for each project
    const projects = projectResult.rows.map(row => {
      const percentComplete = parseFloat(row.percent_complete) || 0;
      const plannedEndDate = row.planned_end_date;
      
      // Estimate forecast based on progress
      let status: 'on_track' | 'at_risk' | 'delayed' | 'completed';
      let forecastEndDate = plannedEndDate;
      let daysVariance = 0;
      
      if (row.status === 'completed') {
        status = 'completed';
      } else if (plannedEndDate) {
        const today = new Date();
        const endDate = new Date(plannedEndDate);
        const totalDuration = endDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(totalDuration / (1000 * 60 * 60 * 24));
        
        // Simple forecast: if less than expected progress, calculate delay
        const expectedProgress = Math.max(0, 100 - (daysRemaining / 365) * 100);
        
        if (percentComplete >= expectedProgress - 5) {
          status = 'on_track';
        } else if (percentComplete >= expectedProgress - 15) {
          status = 'at_risk';
          daysVariance = Math.round((expectedProgress - percentComplete) * 3);
        } else {
          status = 'delayed';
          daysVariance = Math.round((expectedProgress - percentComplete) * 3);
        }
        
        if (daysVariance > 0 && plannedEndDate) {
          const newDate = new Date(endDate);
          newDate.setDate(newDate.getDate() + daysVariance);
          forecastEndDate = newDate.toISOString().split('T')[0];
        }
      } else {
        status = 'on_track';
      }
      
      return {
        projectId: row.project_id,
        projectName: row.project_name,
        plannedEndDate: plannedEndDate || '',
        forecastEndDate: forecastEndDate || '',
        daysVariance,
        status,
        currentPhase: row.current_phase || 'Not Started',
        percentComplete
      };
    });
    
    // Count by status
    const statusCounts = {
      onTrack: projects.filter(p => p.status === 'on_track').length,
      atRisk: projects.filter(p => p.status === 'at_risk').length,
      delayed: projects.filter(p => p.status === 'delayed').length,
      completed: projects.filter(p => p.status === 'completed').length
    };
    
    // Upcoming milestones
    const milestonesQuery = `
      SELECT 
        pm.id as milestone_id,
        pm.project_id,
        dp.project_name,
        pm.name as milestone_name,
        pm.target_date,
        (pm.target_date - CURRENT_DATE) as days_until_due,
        pm.milestone_type,
        pm.priority
      FROM project_milestones pm
      JOIN development_projects dp ON dp.id = pm.project_id
      WHERE pm.organization_id = $1
        AND pm.status IN ('pending', 'in_progress')
        AND pm.target_date >= CURRENT_DATE
        AND pm.target_date <= CURRENT_DATE + INTERVAL '30 days'
      ORDER BY pm.target_date ASC
      LIMIT 15
    `;
    
    const milestonesResult = await client.query(milestonesQuery, [organizationId]);
    
    // Recent completions
    const completionsQuery = `
      SELECT 
        pm.id as milestone_id,
        dp.project_name,
        pm.name as milestone_name,
        pm.actual_date as completed_date,
        (pm.actual_date - pm.target_date) as days_early_or_late
      FROM project_milestones pm
      JOIN development_projects dp ON dp.id = pm.project_id
      WHERE pm.organization_id = $1
        AND pm.status = 'completed'
        AND pm.actual_date >= CURRENT_DATE - INTERVAL '14 days'
      ORDER BY pm.actual_date DESC
      LIMIT 10
    `;
    
    const completionsResult = await client.query(completionsQuery, [organizationId]);
    
    return {
      ...statusCounts,
      projects,
      upcomingMilestones: milestonesResult.rows.map(row => ({
        milestoneId: row.milestone_id,
        projectId: row.project_id,
        projectName: row.project_name,
        milestoneName: row.milestone_name,
        targetDate: row.target_date,
        daysUntilDue: parseInt(row.days_until_due),
        milestoneType: row.milestone_type,
        priority: row.priority
      })),
      recentCompletions: completionsResult.rows.map(row => ({
        milestoneId: row.milestone_id,
        projectName: row.project_name,
        milestoneName: row.milestone_name,
        completedDate: row.completed_date,
        daysEarlyOrLate: parseInt(row.days_early_or_late) || 0
      }))
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// COMPLIANCE STATUS
// ============================================================================

/**
 * Get Ghana regulatory compliance status
 */
export async function getComplianceStatus(
  organizationId: string
): Promise<ComplianceStatus> {
  const client = await pool.connect();
  
  try {
    // Overall permit summary
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_permits,
        COUNT(*) FILTER (WHERE pp.status = 'approved') as active_permits,
        COUNT(*) FILTER (WHERE pp.status IN ('pending', 'submitted', 'under_review')) as pending_permits,
        COUNT(*) FILTER (WHERE pp.status = 'expired' OR pp.expiration_date < CURRENT_DATE) as expired_permits,
        COUNT(*) FILTER (WHERE pp.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_30
      FROM project_permits pp
      JOIN development_projects dp ON dp.id = pp.project_id
      WHERE dp.organization_id = $1 AND dp.deleted_at IS NULL
    `;
    
    const summaryResult = await client.query(summaryQuery, [organizationId]);
    const summary = summaryResult.rows[0];
    
    // By permit type
    const byTypeQuery = `
      SELECT 
        pt.name as permit_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE pp.status = 'approved') as active,
        COUNT(*) FILTER (WHERE pp.status IN ('pending', 'submitted', 'under_review')) as pending,
        COUNT(*) FILTER (WHERE pp.status = 'expired' OR pp.expiration_date < CURRENT_DATE) as expired
      FROM project_permits pp
      JOIN permit_types pt ON pt.id = pp.permit_type_id
      JOIN development_projects dp ON dp.id = pp.project_id
      WHERE dp.organization_id = $1 AND dp.deleted_at IS NULL
      GROUP BY pt.name
      ORDER BY total DESC
    `;
    
    const byTypeResult = await client.query(byTypeQuery, [organizationId]);
    
    // Upcoming expirations
    const expirationsQuery = `
      SELECT 
        pp.id as permit_id,
        dp.project_name,
        pt.name as permit_type,
        pp.expiration_date,
        (pp.expiration_date - CURRENT_DATE) as days_until_expiry
      FROM project_permits pp
      JOIN permit_types pt ON pt.id = pp.permit_type_id
      JOIN development_projects dp ON dp.id = pp.project_id
      WHERE dp.organization_id = $1 
        AND dp.deleted_at IS NULL
        AND pp.status = 'approved'
        AND pp.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
      ORDER BY pp.expiration_date ASC
      LIMIT 10
    `;
    
    const expirationsResult = await client.query(expirationsQuery, [organizationId]);
    
    // Recent approvals
    const approvalsQuery = `
      SELECT 
        pp.id as permit_id,
        dp.project_name,
        pt.name as permit_type,
        pp.approval_date as approved_date
      FROM project_permits pp
      JOIN permit_types pt ON pt.id = pp.permit_type_id
      JOIN development_projects dp ON dp.id = pp.project_id
      WHERE dp.organization_id = $1 
        AND dp.deleted_at IS NULL
        AND pp.status = 'approved'
        AND pp.approval_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY pp.approval_date DESC
      LIMIT 10
    `;
    
    const approvalsResult = await client.query(approvalsQuery, [organizationId]);
    
    return {
      totalPermits: parseInt(summary.total_permits) || 0,
      activePermits: parseInt(summary.active_permits) || 0,
      pendingPermits: parseInt(summary.pending_permits) || 0,
      expiredPermits: parseInt(summary.expired_permits) || 0,
      expiringWithin30Days: parseInt(summary.expiring_30) || 0,
      byPermitType: byTypeResult.rows.map(row => ({
        permitType: row.permit_type,
        total: parseInt(row.total),
        active: parseInt(row.active),
        pending: parseInt(row.pending),
        expired: parseInt(row.expired)
      })),
      upcomingExpirations: expirationsResult.rows.map(row => ({
        permitId: row.permit_id,
        projectName: row.project_name,
        permitType: row.permit_type,
        expirationDate: row.expiration_date,
        daysUntilExpiry: parseInt(row.days_until_expiry)
      })),
      recentApprovals: approvalsResult.rows.map(row => ({
        permitId: row.permit_id,
        projectName: row.project_name,
        permitType: row.permit_type,
        approvedDate: row.approved_date
      }))
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// PROJECT HEALTH SCORE
// ============================================================================

/**
 * Calculate comprehensive health score for a project
 */
export async function getProjectHealthScore(
  projectId: string,
  organizationId: string
): Promise<ProjectHealthScore> {
  const client = await pool.connect();
  
  try {
    // Get project details
    const projectQuery = `
      SELECT 
        dp.project_name,
        dp.status,
        dp.total_budget,
        dp.estimated_completion_date,
        (
          SELECT COALESCE(AVG(pp.progress), 0)
          FROM project_phases pp WHERE pp.project_id = dp.id
        ) as overall_progress,
        (
          SELECT COALESCE(SUM(pc.actual_costs), 0)
          FROM project_costs pc WHERE pc.project_id = dp.id
        ) as total_spent
      FROM development_projects dp
      WHERE dp.id = $1 AND dp.organization_id = $2
    `;
    
    const projectResult = await client.query(projectQuery, [projectId, organizationId]);
    
    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }
    
    const project = projectResult.rows[0];
    const riskFactors: ProjectHealthScore['riskFactors'] = [];
    const recommendations: string[] = [];
    
    // Calculate Schedule Score (0-100)
    let scheduleScore = 100;
    const progress = parseFloat(project.overall_progress) || 0;
    
    if (project.estimated_completion_date) {
      const today = new Date();
      const endDate = new Date(project.estimated_completion_date);
      const totalDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (totalDays < 0) {
        scheduleScore = Math.max(0, 100 - Math.abs(totalDays) * 2);
        riskFactors.push({
          factor: 'Project Overdue',
          severity: 'critical',
          description: `Project is ${Math.abs(totalDays)} days past expected completion`,
          impact: -30
        });
        recommendations.push('Immediate review of project timeline and resource allocation needed');
      } else if (totalDays < 30 && progress < 90) {
        scheduleScore -= (90 - progress);
        riskFactors.push({
          factor: 'Deadline Risk',
          severity: 'high',
          description: 'Less than 30 days to completion with significant work remaining',
          impact: -20
        });
      }
    }
    
    // Calculate Budget Score (0-100)
    let budgetScore = 100;
    const totalBudget = parseFloat(project.total_budget) || 0;
    const totalSpent = parseFloat(project.total_spent) || 0;
    
    if (totalBudget > 0) {
      const utilizationPct = (totalSpent / totalBudget) * 100;
      const expectedUtilization = progress; // Should roughly match progress
      
      if (utilizationPct > 100) {
        budgetScore = Math.max(0, 100 - (utilizationPct - 100) * 2);
        riskFactors.push({
          factor: 'Budget Exceeded',
          severity: 'critical',
          description: `Spending is ${(utilizationPct - 100).toFixed(1)}% over budget`,
          impact: -30
        });
        recommendations.push('Conduct immediate cost review and identify areas for cost control');
      } else if (utilizationPct > expectedUtilization + 10) {
        const variance = utilizationPct - expectedUtilization;
        budgetScore -= variance * 2;
        riskFactors.push({
          factor: 'Cost Overrun Risk',
          severity: variance > 20 ? 'high' : 'medium',
          description: `Spending ahead of progress by ${variance.toFixed(1)}%`,
          impact: -15
        });
      }
    }
    
    // Calculate Compliance Score (0-100)
    let complianceScore = 100;
    
    const permitQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE pp.status = 'expired' OR pp.expiration_date < CURRENT_DATE) as expired,
        COUNT(*) FILTER (WHERE pp.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring,
        COUNT(*) FILTER (WHERE pp.status IN ('pending', 'submitted')) as pending
      FROM project_permits pp
      WHERE pp.project_id = $1
    `;
    
    const permitResult = await client.query(permitQuery, [projectId]);
    const permits = permitResult.rows[0];
    
    if (parseInt(permits.expired) > 0) {
      complianceScore -= parseInt(permits.expired) * 25;
      riskFactors.push({
        factor: 'Expired Permits',
        severity: 'critical',
        description: `${permits.expired} permit(s) have expired`,
        impact: -25
      });
      recommendations.push('Renew expired permits immediately to avoid regulatory issues');
    }
    
    if (parseInt(permits.expiring) > 0) {
      complianceScore -= parseInt(permits.expiring) * 10;
      riskFactors.push({
        factor: 'Expiring Permits',
        severity: 'medium',
        description: `${permits.expiring} permit(s) expiring within 30 days`,
        impact: -10
      });
    }
    
    // Calculate Milestone Score (0-100)
    let milestoneScore = 100;
    
    const milestoneQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE pm.status = 'missed') as missed,
        COUNT(*) FILTER (WHERE pm.status = 'pending' AND pm.target_date < CURRENT_DATE) as overdue,
        COUNT(*) FILTER (WHERE pm.status = 'completed' AND pm.actual_date <= pm.target_date) as on_time,
        COUNT(*) FILTER (WHERE pm.status = 'completed') as completed
      FROM project_milestones pm
      WHERE pm.project_id = $1
    `;
    
    const milestoneResult = await client.query(milestoneQuery, [projectId]);
    const milestones = milestoneResult.rows[0];
    
    const missedCount = parseInt(milestones.missed) + parseInt(milestones.overdue);
    if (missedCount > 0) {
      milestoneScore -= missedCount * 15;
      riskFactors.push({
        factor: 'Missed Milestones',
        severity: missedCount > 2 ? 'high' : 'medium',
        description: `${missedCount} milestone(s) missed or overdue`,
        impact: -15
      });
    }
    
    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      scheduleScore * 0.3 +
      budgetScore * 0.3 +
      complianceScore * 0.25 +
      milestoneScore * 0.15
    );
    
    // Add general recommendations based on score
    if (overallScore < 50) {
      recommendations.push('Project requires immediate management attention');
    } else if (overallScore < 70) {
      recommendations.push('Consider weekly status reviews until metrics improve');
    }
    
    return {
      projectId,
      projectName: project.project_name,
      overallScore: Math.max(0, Math.min(100, overallScore)),
      scheduleScore: Math.max(0, Math.min(100, scheduleScore)),
      budgetScore: Math.max(0, Math.min(100, budgetScore)),
      complianceScore: Math.max(0, Math.min(100, complianceScore)),
      milestoneScore: Math.max(0, Math.min(100, milestoneScore)),
      riskFactors,
      recommendations
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// BUDGET VARIANCE ANALYSIS (EVM)
// ============================================================================

/**
 * Get detailed budget variance analysis using Earned Value Management
 */
export async function getBudgetVarianceAnalysis(
  projectId: string,
  organizationId: string
): Promise<BudgetVarianceAnalysis> {
  const client = await pool.connect();
  
  try {
    // Get project budget
    const projectQuery = `
      SELECT dp.total_budget
      FROM development_projects dp
      WHERE dp.id = $1 AND dp.organization_id = $2
    `;
    
    const projectResult = await client.query(projectQuery, [projectId, organizationId]);
    
    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }
    
    const totalBudget = parseFloat(projectResult.rows[0].total_budget) || 0;
    
    // Get phase-level analysis
    const phaseQuery = `
      SELECT 
        pp.id as phase_id,
        pp.name as phase_name,
        COALESCE(pp.budget, 0) as budgeted_cost,
        COALESCE(
          (SELECT SUM(pc.actual_costs) FROM project_costs pc WHERE pc.phase_id = pp.id),
          0
        ) as actual_cost,
        pp.progress
      FROM project_phases pp
      WHERE pp.project_id = $1
      ORDER BY pp.phase_number
    `;
    
    const phaseResult = await client.query(phaseQuery, [projectId]);
    
    let totalPlannedValue = 0;
    let totalEarnedValue = 0;
    let totalActualCost = 0;
    
    const phases = phaseResult.rows.map(row => {
      const budgeted = parseFloat(row.budgeted_cost) || 0;
      const actual = parseFloat(row.actual_cost) || 0;
      const progress = parseFloat(row.progress) || 0;
      
      const earnedValue = budgeted * (progress / 100);
      const variance = budgeted - actual;
      const variancePercent = budgeted > 0 ? (variance / budgeted) * 100 : 0;
      const cpi = actual > 0 ? earnedValue / actual : 1;
      const spi = budgeted > 0 ? earnedValue / budgeted : 1;
      const eac = cpi > 0 ? budgeted / cpi : budgeted;
      const vac = budgeted - eac;
      
      totalPlannedValue += budgeted;
      totalEarnedValue += earnedValue;
      totalActualCost += actual;
      
      return {
        phaseId: row.phase_id,
        phaseName: row.phase_name,
        budgetedCost: budgeted,
        actualCost: actual,
        variance,
        variancePercent,
        earnedValue,
        costPerformanceIndex: Math.round(cpi * 100) / 100,
        schedulePerformanceIndex: Math.round(spi * 100) / 100,
        estimateAtCompletion: eac,
        varianceAtCompletion: vac
      };
    });
    
    // Get cost by category
    const categoryQuery = `
      SELECT 
        pc.category as category,
        COALESCE(SUM(pc.original_budget), 0) as budgeted,
        COALESCE(SUM(pc.actual_costs), 0) as actual
      FROM project_costs pc
      WHERE pc.project_id = $1
      GROUP BY pc.category
      ORDER BY budgeted DESC
    `;
    
    const categoryResult = await client.query(categoryQuery, [projectId]);
    
    const costCategories = categoryResult.rows.map(row => {
      const budgeted = parseFloat(row.budgeted) || 0;
      const actual = parseFloat(row.actual) || 0;
      return {
        category: row.category,
        budgeted,
        actual,
        variance: budgeted - actual,
        trend: 'stable' as const // Would need historical data to calculate real trend
      };
    });
    
    // Calculate summary EVM metrics
    const costVariance = totalEarnedValue - totalActualCost;
    const scheduleVariance = totalEarnedValue - totalPlannedValue;
    const cpi = totalActualCost > 0 ? totalEarnedValue / totalActualCost : 1;
    const spi = totalPlannedValue > 0 ? totalEarnedValue / totalPlannedValue : 1;
    const eac = cpi > 0 ? totalBudget / cpi : totalBudget;
    const etc = eac - totalActualCost;
    const vac = totalBudget - eac;
    
    return {
      projectId,
      phases,
      costCategories,
      summary: {
        totalBudget,
        totalActual: totalActualCost,
        earnedValue: totalEarnedValue,
        plannedValue: totalPlannedValue,
        costVariance,
        scheduleVariance,
        cpi: Math.round(cpi * 100) / 100,
        spi: Math.round(spi * 100) / 100,
        eac,
        etc,
        vac
      }
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// PROGRESS TRENDS
// ============================================================================

/**
 * Get progress trends over time
 */
export async function getProgressTrend(
  organizationId: string,
  projectId?: string,
  period: 'daily' | 'weekly' | 'monthly' = 'weekly'
): Promise<ProgressTrend> {
  const client = await pool.connect();
  
  try {
    // Determine date range and interval
    let intervalDays: number;
    let lookbackDays: number;
    
    switch (period) {
      case 'daily':
        intervalDays = 1;
        lookbackDays = 30;
        break;
      case 'weekly':
        intervalDays = 7;
        lookbackDays = 84; // 12 weeks
        break;
      case 'monthly':
        intervalDays = 30;
        lookbackDays = 365;
        break;
    }
    
    // For a real implementation, you'd store progress snapshots
    // This is a simplified version that generates trend data
    
    const progressQuery = projectId
      ? `
        SELECT 
          COALESCE(AVG(pp.progress), 0) as current_progress
        FROM project_phases pp
        WHERE pp.project_id = $1
      `
      : `
        SELECT 
          COALESCE(AVG(pp.progress), 0) as current_progress
        FROM project_phases pp
        JOIN development_projects dp ON dp.id = pp.project_id
        WHERE dp.organization_id = $1 AND dp.deleted_at IS NULL
      `;
    
    const params = projectId ? [projectId] : [organizationId];
    const progressResult = await client.query(progressQuery, params);
    const currentProgress = parseFloat(progressResult.rows[0].current_progress) || 0;
    
    // Generate trend data points (simplified - real implementation would use stored snapshots)
    const dataPoints: ProgressTrend['dataPoints'] = [];
    const now = new Date();
    
    for (let i = lookbackDays; i >= 0; i -= intervalDays) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Simulate historical progress (in production, this would come from stored data)
      const progressAtDate = Math.max(0, currentProgress - (i / lookbackDays) * currentProgress * 1.2);
      const plannedProgress = ((lookbackDays - i) / lookbackDays) * 100;
      
      dataPoints.push({
        date: date.toISOString().split('T')[0],
        plannedProgress: Math.min(100, plannedProgress),
        actualProgress: Math.min(100, progressAtDate),
        variance: progressAtDate - plannedProgress
      });
    }
    
    // Generate forecast (simple linear extrapolation)
    const forecast: ProgressTrend['forecast'] = [];
    const recentTrend = dataPoints.length > 1
      ? (dataPoints[dataPoints.length - 1].actualProgress - dataPoints[dataPoints.length - 2].actualProgress)
      : 0;
    
    let forecastProgress = currentProgress;
    for (let i = 1; i <= 4; i++) {
      const forecastDate = new Date(now);
      forecastDate.setDate(forecastDate.getDate() + i * intervalDays);
      forecastProgress = Math.min(100, forecastProgress + recentTrend);
      
      forecast.push({
        forecastDate: forecastDate.toISOString().split('T')[0],
        estimatedProgress: Math.round(forecastProgress * 10) / 10,
        confidence: Math.max(50, 95 - i * 10)
      });
    }
    
    // Generate burndown
    const remainingWork = 100 - currentProgress;
    const burndown: ProgressTrend['burndown'] = dataPoints.map((dp, idx) => ({
      date: dp.date,
      remainingWork: 100 - dp.actualProgress,
      idealRemaining: 100 - dp.plannedProgress
    }));
    
    return {
      projectId,
      period,
      dataPoints,
      forecast,
      burndown
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// COMPLETION FORECAST
// ============================================================================

/**
 * Forecast project completion date
 */
export async function forecastCompletion(
  projectId: string,
  organizationId: string
): Promise<{
  projectId: string;
  currentProgress: number;
  originalEndDate: string | null;
  forecastEndDate: string;
  daysVariance: number;
  confidence: number;
  assumptions: string[];
}> {
  const client = await pool.connect();
  
  try {
    const query = `
      SELECT 
        dp.estimated_completion_date,
        dp.planned_start_date,
        COALESCE(AVG(pp.progress), 0) as current_progress
      FROM development_projects dp
      LEFT JOIN project_phases pp ON pp.project_id = dp.id
      WHERE dp.id = $1 AND dp.organization_id = $2
      GROUP BY dp.id
    `;
    
    const result = await client.query(query, [projectId, organizationId]);
    
    if (result.rows.length === 0) {
      throw new Error('Project not found');
    }
    
    const project = result.rows[0];
    const currentProgress = parseFloat(project.current_progress) || 0;
    const originalEndDate = project.estimated_completion_date;
    const startDate = project.planned_start_date ? new Date(project.planned_start_date) : new Date();
    
    const assumptions: string[] = [];
    let forecastEndDate: Date;
    let confidence = 80;
    
    if (currentProgress >= 100) {
      forecastEndDate = new Date();
      assumptions.push('Project is complete');
      confidence = 100;
    } else if (currentProgress === 0) {
      forecastEndDate = originalEndDate ? new Date(originalEndDate) : new Date();
      forecastEndDate.setMonth(forecastEndDate.getMonth() + 6);
      assumptions.push('No progress recorded - using default timeline');
      confidence = 30;
    } else {
      // Calculate based on current velocity
      const now = new Date();
      const elapsedDays = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const dailyProgress = currentProgress / elapsedDays;
      const remainingProgress = 100 - currentProgress;
      const daysToComplete = Math.ceil(remainingProgress / dailyProgress);
      
      forecastEndDate = new Date(now);
      forecastEndDate.setDate(forecastEndDate.getDate() + daysToComplete);
      
      assumptions.push(`Based on ${dailyProgress.toFixed(2)}% daily progress rate`);
      assumptions.push(`${daysToComplete} days estimated to completion`);
      
      // Reduce confidence if progress is slow
      if (dailyProgress < 0.1) {
        confidence = 50;
        assumptions.push('Low confidence due to slow progress rate');
      }
    }
    
    const daysVariance = originalEndDate
      ? Math.ceil((forecastEndDate.getTime() - new Date(originalEndDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    return {
      projectId,
      currentProgress,
      originalEndDate: originalEndDate
        ? (originalEndDate instanceof Date ? originalEndDate.toISOString().split('T')[0] : String(originalEndDate).split('T')[0])
        : null,
      forecastEndDate: forecastEndDate.toISOString().split('T')[0],
      daysVariance,
      confidence,
      assumptions
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// ALERTS
// ============================================================================

/**
 * Get active alerts for an organization
 */
export async function getActiveAlerts(
  organizationId: string,
  options?: {
    projectId?: string;
    severity?: string[];
    limit?: number;
  }
): Promise<Alert[]> {
  const client = await pool.connect();
  
  try {
    // Exclude alerts whose project has been soft-deleted (so stale alerts from
    // removed/test projects don't keep surfacing). The LEFT JOIN keeps project-less
    // org alerts (dp.deleted_at is NULL when no project row matched).
    const conditions = ['pa.organization_id = $1', "pa.status = 'active'", 'dp.deleted_at IS NULL'];
    const params: any[] = [organizationId];
    let paramIndex = 2;
    
    if (options?.projectId) {
      conditions.push(`pa.project_id = $${paramIndex}`);
      params.push(options.projectId);
      paramIndex++;
    }
    
    if (options?.severity?.length) {
      conditions.push(`pa.severity = ANY($${paramIndex})`);
      params.push(options.severity);
      paramIndex++;
    }
    
    const limit = options?.limit || 20;
    
    const query = `
      SELECT 
        pa.id,
        pa.project_id,
        dp.project_name,
        pa.alert_type,
        pa.severity,
        pa.title,
        pa.message,
        pa.reference_type,
        pa.reference_id,
        pa.status,
        pa.created_at,
        pa.action_url,
        pa.action_label
      FROM project_alerts pa
      LEFT JOIN development_projects dp ON dp.id = pa.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY 
        CASE pa.severity 
          WHEN 'critical' THEN 1 
          WHEN 'error' THEN 2 
          WHEN 'warning' THEN 3 
          ELSE 4 
        END,
        pa.created_at DESC
      LIMIT ${limit}
    `;
    
    const result = await client.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name || 'N/A',
      alertType: row.alert_type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      status: row.status,
      createdAt: row.created_at,
      actionUrl: row.action_url,
      actionLabel: row.action_label
    }));
  } finally {
    client.release();
  }
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  alertId: string,
  userId: string
): Promise<void> {
  const query = `
    UPDATE project_alerts
    SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2
    WHERE id = $1
  `;
  
  await pool.query(query, [alertId, userId]);
}

/**
 * Resolve an alert
 */
export async function resolveAlert(
  alertId: string,
  userId: string
): Promise<void> {
  const query = `
    UPDATE project_alerts
    SET status = 'resolved', resolved_at = NOW(), resolved_by = $2
    WHERE id = $1
  `;
  
  await pool.query(query, [alertId, userId]);
}

/**
 * Dismiss an alert
 */
export async function dismissAlert(alertId: string): Promise<void> {
  const query = `
    UPDATE project_alerts
    SET status = 'dismissed'
    WHERE id = $1
  `;
  
  await pool.query(query, [alertId]);
}

/**
 * Snooze an alert
 */
export async function snoozeAlert(
  alertId: string,
  snoozeDays: number
): Promise<void> {
  const query = `
    UPDATE project_alerts
    SET status = 'snoozed', snoozed_until = NOW() + INTERVAL '${snoozeDays} days'
    WHERE id = $1
  `;
  
  await pool.query(query, [alertId]);
}

// ============================================================================
// UPCOMING MILESTONES
// ============================================================================

/**
 * Get upcoming milestones across all projects
 */
export async function getUpcomingMilestones(
  organizationId: string,
  options?: {
    daysAhead?: number;
    projectId?: string;
    milestoneTypes?: string[];
    limit?: number;
  }
): Promise<{
  milestone: {
    id: string;
    name: string;
    description: string | null;
    targetDate: string;
    milestoneType: string;
    priority: string;
    status: string;
  };
  project: {
    id: string;
    name: string;
  };
  phase: {
    id: string | null;
    name: string | null;
  };
  daysUntilDue: number;
}[]> {
  const client = await pool.connect();
  
  try {
    const daysAhead = options?.daysAhead || 30;
    const limit = options?.limit || 25;
    
    const conditions = [
      'pm.organization_id = $1',
      "pm.status IN ('pending', 'in_progress')",
      'pm.target_date >= CURRENT_DATE',
      `pm.target_date <= CURRENT_DATE + INTERVAL '${daysAhead} days'`
    ];
    const params: any[] = [organizationId];
    let paramIndex = 2;
    
    if (options?.projectId) {
      conditions.push(`pm.project_id = $${paramIndex}`);
      params.push(options.projectId);
      paramIndex++;
    }
    
    if (options?.milestoneTypes?.length) {
      conditions.push(`pm.milestone_type = ANY($${paramIndex})`);
      params.push(options.milestoneTypes);
      paramIndex++;
    }
    
    const query = `
      SELECT 
        pm.id,
        pm.name,
        pm.description,
        pm.target_date,
        pm.milestone_type,
        pm.priority,
        pm.status,
        dp.id as project_id,
        dp.project_name,
        pp.id as phase_id,
        pp.name as phase_name,
        (pm.target_date - CURRENT_DATE) as days_until_due
      FROM project_milestones pm
      JOIN development_projects dp ON dp.id = pm.project_id
      LEFT JOIN project_phases pp ON pp.id = pm.phase_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY pm.target_date ASC, pm.priority DESC
      LIMIT ${limit}
    `;
    
    const result = await client.query(query, params);
    
    return result.rows.map(row => ({
      milestone: {
        id: row.id,
        name: row.name,
        description: row.description,
        targetDate: row.target_date,
        milestoneType: row.milestone_type,
        priority: row.priority,
        status: row.status
      },
      project: {
        id: row.project_id,
        name: row.project_name
      },
      phase: {
        id: row.phase_id,
        name: row.phase_name
      },
      daysUntilDue: parseInt(row.days_until_due)
    }));
  } finally {
    client.release();
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  getPortfolioMetrics,
  getBudgetOverview,
  getTimelineStatus,
  getComplianceStatus,
  getProjectHealthScore,
  getBudgetVarianceAnalysis,
  getProgressTrend,
  forecastCompletion,
  getActiveAlerts,
  acknowledgeAlert,
  resolveAlert,
  dismissAlert,
  snoozeAlert,
  getUpcomingMilestones
};
