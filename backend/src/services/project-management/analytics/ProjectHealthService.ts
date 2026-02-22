/**
 * Project Health Service
 * 
 * Phase 3.1: Split dashboardAnalyticsService
 * 
 * Provides project health analytics:
 * - Health score calculation (cost, schedule, quality, risk)
 * - Project health indicators
 * - Health trend tracking
 * - Issue and risk impact analysis
 * 
 * @module services/project-management/analytics/ProjectHealthService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { UUID, ProjectStatus } from '../types';
import { eventBus } from '../events/EventBus';

// =============================================================================
// TYPES
// =============================================================================

export interface HealthMetric {
  score: number; // 0-100
  status: 'excellent' | 'good' | 'warning' | 'critical';
  trend: 'improving' | 'stable' | 'declining';
  details: string;
}

export interface ProjectHealthScore {
  projectId: UUID;
  projectName: string;
  overallScore: number;
  overallStatus: 'excellent' | 'good' | 'warning' | 'critical';
  costHealth: HealthMetric;
  scheduleHealth: HealthMetric;
  qualityHealth: HealthMetric;
  riskHealth: HealthMetric;
  resourceHealth: HealthMetric;
  complianceHealth: HealthMetric;
  lastUpdated: Date;
}

export interface HealthIndicator {
  code: string;
  label: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  recommendation: string;
  affectedArea: string;
}

export interface HealthTrend {
  date: Date;
  overallScore: number;
  costScore: number;
  scheduleScore: number;
  qualityScore: number;
}

export interface BudgetVarianceAnalysis {
  projectId: UUID;
  projectName: string;
  totalBudget: number;
  actualCost: number;
  variance: number;
  variancePercent: number;
  byCategory: {
    category: string;
    budgeted: number;
    actual: number;
    variance: number;
  }[];
  forecast: {
    estimatedFinalCost: number;
    budgetAtRisk: number;
    completionBudgetVariance: number;
  };
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ProjectHealthServiceImpl extends BaseService {
  // Health score weights
  private readonly WEIGHTS = {
    cost: 0.25,
    schedule: 0.25,
    quality: 0.20,
    risk: 0.15,
    resource: 0.10,
    compliance: 0.05,
  };

  constructor() {
    super('ProjectHealthService');
  }

  /**
   * Calculate comprehensive health score for a project.
   */
  async getProjectHealthScore(projectId: UUID): Promise<ProjectHealthScore> {
    const project = await this.getProjectDetails(projectId);
    
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const [costHealth, scheduleHealth, qualityHealth, riskHealth, resourceHealth, complianceHealth] = 
      await Promise.all([
        this.calculateCostHealth(projectId),
        this.calculateScheduleHealth(projectId),
        this.calculateQualityHealth(projectId),
        this.calculateRiskHealth(projectId),
        this.calculateResourceHealth(projectId),
        this.calculateComplianceHealth(projectId),
      ]);

    const overallScore = this.calculateOverallScore({
      cost: costHealth.score,
      schedule: scheduleHealth.score,
      quality: qualityHealth.score,
      risk: riskHealth.score,
      resource: resourceHealth.score,
      compliance: complianceHealth.score,
    });

    const healthScore: ProjectHealthScore = {
      projectId,
      projectName: project.name,
      overallScore,
      overallStatus: this.getStatusFromScore(overallScore),
      costHealth,
      scheduleHealth,
      qualityHealth,
      riskHealth,
      resourceHealth,
      complianceHealth,
      lastUpdated: new Date(),
    };

    // Emit health event if critical
    if (healthScore.overallStatus === 'critical') {
      eventBus.emit('project.health.critical', {
        projectId,
        overallScore,
        metrics: { costHealth, scheduleHealth, qualityHealth, riskHealth },
      });
    }

    return healthScore;
  }

  /**
   * Get budget variance analysis for a project.
   */
  async getBudgetVarianceAnalysis(projectId: UUID): Promise<BudgetVarianceAnalysis> {
    const result = await this.query(
      `SELECT 
         p.id as project_id,
         p.name as project_name,
         COALESCE(p.total_budget, 0) as total_budget,
         COALESCE(SUM(c.amount), 0) as actual_cost
       FROM development_projects p
       LEFT JOIN project_costs c ON c.project_id = p.id AND c.deleted_at IS NULL
       WHERE p.id = $1
       GROUP BY p.id, p.name, p.total_budget`,
      [projectId]
    );

    if (!result.rows.length) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const { project_id, project_name, total_budget, actual_cost } = result.rows[0];
    const variance = parseFloat(total_budget) - parseFloat(actual_cost);
    const variancePercent = parseFloat(total_budget) > 0 
      ? (variance / parseFloat(total_budget)) * 100 
      : 0;

    // Get breakdown by category
    const categoryResult = await this.query(
      `SELECT 
         c.cost_category as category,
         COALESCE(SUM(b.amount), 0) as budgeted,
         COALESCE(SUM(c.amount), 0) as actual
       FROM project_costs c
       LEFT JOIN project_budget_items b ON b.project_id = c.project_id 
         AND b.category = c.cost_category
       WHERE c.project_id = $1 AND c.deleted_at IS NULL
       GROUP BY c.cost_category`,
      [projectId]
    );

    const byCategory = categoryResult.rows.map(row => ({
      category: row.category || 'Other',
      budgeted: parseFloat(row.budgeted),
      actual: parseFloat(row.actual),
      variance: parseFloat(row.budgeted) - parseFloat(row.actual),
    }));

    // Simple forecast based on current spending rate
    const progressResult = await this.query(
      `SELECT overall_progress FROM development_projects WHERE id = $1`,
      [projectId]
    );
    const progress = parseFloat(progressResult.rows[0]?.overall_progress || 0) / 100;
    const estimatedFinalCost = progress > 0 
      ? parseFloat(actual_cost) / progress 
      : parseFloat(total_budget);

    return {
      projectId: project_id,
      projectName: project_name,
      totalBudget: parseFloat(total_budget),
      actualCost: parseFloat(actual_cost),
      variance,
      variancePercent,
      byCategory,
      forecast: {
        estimatedFinalCost,
        budgetAtRisk: estimatedFinalCost > parseFloat(total_budget) 
          ? estimatedFinalCost - parseFloat(total_budget) 
          : 0,
        completionBudgetVariance: parseFloat(total_budget) - estimatedFinalCost,
      },
    };
  }

  /**
   * Get health indicators for a project.
   */
  async getHealthIndicators(projectId: UUID): Promise<HealthIndicator[]> {
    const indicators: HealthIndicator[] = [];
    const health = await this.getProjectHealthScore(projectId);

    // Cost indicators
    if (health.costHealth.score < 60) {
      indicators.push({
        code: 'COST_OVERRUN',
        label: 'Budget Overrun Risk',
        severity: health.costHealth.score < 40 ? 'critical' : 'warning',
        description: health.costHealth.details,
        recommendation: 'Review cost categories, identify savings opportunities, consider scope adjustment.',
        affectedArea: 'Budget',
      });
    }

    // Schedule indicators
    if (health.scheduleHealth.score < 60) {
      indicators.push({
        code: 'SCHEDULE_DELAY',
        label: 'Schedule Delay Risk',
        severity: health.scheduleHealth.score < 40 ? 'critical' : 'warning',
        description: health.scheduleHealth.details,
        recommendation: 'Review critical path, add resources to delayed tasks, consider fast-tracking.',
        affectedArea: 'Timeline',
      });
    }

    // Quality indicators
    if (health.qualityHealth.score < 70) {
      indicators.push({
        code: 'QUALITY_CONCERN',
        label: 'Quality Issues Detected',
        severity: health.qualityHealth.score < 50 ? 'critical' : 'warning',
        description: health.qualityHealth.details,
        recommendation: 'Increase inspection frequency, address root causes, provide training.',
        affectedArea: 'Quality',
      });
    }

    // Risk indicators
    if (health.riskHealth.score < 60) {
      indicators.push({
        code: 'HIGH_RISK',
        label: 'High Risk Exposure',
        severity: health.riskHealth.score < 40 ? 'critical' : 'warning',
        description: health.riskHealth.details,
        recommendation: 'Review mitigation strategies, allocate contingency, escalate major risks.',
        affectedArea: 'Risk',
      });
    }

    // Compliance indicators
    if (health.complianceHealth.score < 80) {
      indicators.push({
        code: 'COMPLIANCE_GAP',
        label: 'Compliance Issues',
        severity: health.complianceHealth.score < 60 ? 'critical' : 'warning',
        description: health.complianceHealth.details,
        recommendation: 'Prioritize permit renewals, schedule inspections, review requirements.',
        affectedArea: 'Compliance',
      });
    }

    return indicators;
  }

  /**
   * Get health trend for a project over time.
   */
  async getHealthTrend(projectId: UUID, days: number = 30): Promise<HealthTrend[]> {
    const result = await this.query(
      `SELECT 
         date,
         overall_score,
         cost_score,
         schedule_score,
         quality_score
       FROM pm_project_health_history
       WHERE project_id = $1 AND date >= NOW() - INTERVAL '${days} days'
       ORDER BY date ASC`,
      [projectId]
    );

    return result.rows.map(row => ({
      date: new Date(row.date),
      overallScore: parseFloat(row.overall_score),
      costScore: parseFloat(row.cost_score),
      scheduleScore: parseFloat(row.schedule_score),
      qualityScore: parseFloat(row.quality_score),
    }));
  }

  // ==========================================================================
  // PRIVATE CALCULATION METHODS
  // ==========================================================================

  private async getProjectDetails(projectId: UUID): Promise<{ name: string } | null> {
    const result = await this.query(
      `SELECT name FROM development_projects WHERE id = $1`,
      [projectId]
    );
    return result.rows[0] || null;
  }

  private async calculateCostHealth(projectId: UUID): Promise<HealthMetric> {
    const result = await this.query(
      `SELECT 
         total_budget,
         COALESCE((SELECT SUM(amount) FROM project_costs WHERE project_id = $1), 0) as spent,
         overall_progress
       FROM development_projects WHERE id = $1`,
      [projectId]
    );

    const { total_budget, spent, overall_progress } = result.rows[0] || {};
    const budget = parseFloat(total_budget) || 1;
    const spentAmount = parseFloat(spent) || 0;
    const progress = parseFloat(overall_progress) || 0;

    // Cost Performance Index
    const expectedSpend = (progress / 100) * budget;
    const cpi = expectedSpend > 0 ? expectedSpend / spentAmount : 1;
    
    // Score based on CPI
    let score = 100;
    if (cpi < 1) {
      score = Math.max(0, 100 - ((1 - cpi) * 200)); // Penalize overrun
    }

    const status = this.getStatusFromScore(score);
    const trend = cpi >= 1 ? 'stable' : 'declining';

    return {
      score,
      status,
      trend,
      details: cpi >= 1 
        ? `Project is on or under budget (CPI: ${cpi.toFixed(2)})` 
        : `Project is ${((1 - cpi) * 100).toFixed(1)}% over budget`,
    };
  }

  private async calculateScheduleHealth(projectId: UUID): Promise<HealthMetric> {
    const result = await this.query(
      `SELECT 
         planned_start_date,
         planned_completion_date,
         actual_start_date,
         actual_completion_date,
         overall_progress,
         status
       FROM development_projects WHERE id = $1`,
      [projectId]
    );

    const project = result.rows[0];
    if (!project) {
      return { score: 0, status: 'critical', trend: 'declining', details: 'No data' };
    }

    const now = new Date();
    const plannedEnd = new Date(project.planned_completion_date);
    const plannedStart = new Date(project.planned_start_date);
    const progress = parseFloat(project.overall_progress) || 0;

    // Calculate expected progress based on elapsed time
    const totalDuration = plannedEnd.getTime() - plannedStart.getTime();
    const elapsed = now.getTime() - plannedStart.getTime();
    const expectedProgress = Math.min(100, (elapsed / totalDuration) * 100);

    // Schedule Performance Index
    const spi = expectedProgress > 0 ? progress / expectedProgress : 1;
    
    let score = 100;
    if (spi < 1) {
      score = Math.max(0, 100 - ((1 - spi) * 150));
    }

    const status = this.getStatusFromScore(score);
    const trend = spi >= 0.95 ? 'stable' : 'declining';

    return {
      score,
      status,
      trend,
      details: spi >= 1 
        ? `Project is on or ahead of schedule (SPI: ${spi.toFixed(2)})` 
        : `Project is ${((1 - spi) * 100).toFixed(1)}% behind schedule`,
    };
  }

  private async calculateQualityHealth(projectId: UUID): Promise<HealthMetric> {
    const result = await this.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'passed') as passed,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) as total
       FROM quality_inspections
       WHERE project_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [projectId]
    );

    const { passed, failed, total } = result.rows[0];
    const passRate = parseInt(total) > 0 
      ? (parseInt(passed) / parseInt(total)) * 100 
      : 100;

    const score = passRate;
    const status = this.getStatusFromScore(score);
    const trend = parseInt(failed) > 2 ? 'declining' : 'stable';

    return {
      score,
      status,
      trend,
      details: `${passRate.toFixed(1)}% inspection pass rate (${passed}/${total} passed)`,
    };
  }

  private async calculateRiskHealth(projectId: UUID): Promise<HealthMetric> {
    const result = await this.query(
      `SELECT 
         COUNT(*) FILTER (WHERE risk_level = 'critical' AND status != 'mitigated') as critical,
         COUNT(*) FILTER (WHERE risk_level = 'high' AND status != 'mitigated') as high,
         COUNT(*) FILTER (WHERE status = 'mitigated') as mitigated,
         COUNT(*) as total
       FROM project_risks
       WHERE project_id = $1`,
      [projectId]
    );

    const { critical, high, mitigated, total } = result.rows[0];
    const criticalCount = parseInt(critical) || 0;
    const highCount = parseInt(high) || 0;
    
    // Penalize for unmitigated risks
    let score = 100 - (criticalCount * 25) - (highCount * 10);
    score = Math.max(0, score);

    const status = this.getStatusFromScore(score);
    const trend = criticalCount > 0 ? 'declining' : 'stable';

    return {
      score,
      status,
      trend,
      details: `${criticalCount} critical, ${highCount} high risks (${mitigated} mitigated of ${total} total)`,
    };
  }

  private async calculateResourceHealth(projectId: UUID): Promise<HealthMetric> {
    const result = await this.query(
      `SELECT 
         COUNT(*) as total_assignments,
         COUNT(*) FILTER (WHERE utilization_percent > 100) as overallocated
       FROM pm_resource_assignments
       WHERE project_id = $1 AND status = 'active'`,
      [projectId]
    );

    const { total_assignments, overallocated } = result.rows[0];
    const total = parseInt(total_assignments) || 1;
    const over = parseInt(overallocated) || 0;
    
    const score = Math.max(0, 100 - ((over / total) * 100));
    const status = this.getStatusFromScore(score);
    const trend = over > 0 ? 'warning' : 'stable';

    return {
      score,
      status,
      trend: trend as 'improving' | 'stable' | 'declining',
      details: `${over} of ${total} resources over-allocated`,
    };
  }

  private async calculateComplianceHealth(projectId: UUID): Promise<HealthMetric> {
    const result = await this.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'compliant') as compliant,
         COUNT(*) FILTER (WHERE status = 'expired' OR status = 'overdue') as non_compliant,
         COUNT(*) as total
       FROM pm_compliance_requirements
       WHERE project_id = $1`,
      [projectId]
    );

    const { compliant, non_compliant, total } = result.rows[0];
    const compliantCount = parseInt(compliant) || 0;
    const totalCount = parseInt(total) || 1;
    
    const score = (compliantCount / totalCount) * 100;
    const status = this.getStatusFromScore(score);
    const trend = parseInt(non_compliant) > 0 ? 'declining' : 'stable';

    return {
      score,
      status,
      trend,
      details: `${compliantCount}/${totalCount} compliance requirements met`,
    };
  }

  private calculateOverallScore(scores: Record<string, number>): number {
    return Object.entries(this.WEIGHTS).reduce((total, [key, weight]) => {
      return total + (scores[key] || 0) * weight;
    }, 0);
  }

  private getStatusFromScore(score: number): 'excellent' | 'good' | 'warning' | 'critical' {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'warning';
    return 'critical';
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const projectHealthService = new ProjectHealthServiceImpl();
