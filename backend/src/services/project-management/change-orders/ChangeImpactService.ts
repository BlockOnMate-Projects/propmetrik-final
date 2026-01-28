/**
 * Change Impact Service
 * 
 * Phase 3.8: Split changeOrderService
 * 
 * Handles change order impact analysis:
 * - Schedule impact calculation
 * - Cost impact analysis
 * - Risk assessment
 * - Trend analysis
 * 
 * @module services/project-management/change-orders/ChangeImpactService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import {
  ChangeOrder,
  ChangeOrderWithDetails,
  ScheduleImpact,
  CostImpact,
  ImpactAnalysis,
  ItemType,
} from './types';
import { changeRequestService } from './ChangeRequestService';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ChangeImpactServiceImpl extends BaseService {
  constructor() {
    super('ChangeImpactService');
  }

  // ==========================================================================
  // IMPACT ANALYSIS
  // ==========================================================================

  /**
   * Analyze full impact of a change order
   */
  async analyzeImpact(changeOrderId: string): Promise<ImpactAnalysis> {
    const co = await changeRequestService.getById(changeOrderId);
    if (!co) throw new Error('Change order not found');

    const [scheduleImpact, costImpact] = await Promise.all([
      this.calculateScheduleImpact(co),
      this.calculateCostImpact(co),
    ]);

    const riskLevel = this.assessRiskLevel(co, scheduleImpact, costImpact);
    const recommendations = this.generateRecommendations(co, scheduleImpact, costImpact, riskLevel);

    return {
      changeOrderId,
      schedule: scheduleImpact,
      cost: costImpact,
      riskLevel,
      recommendations,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate schedule impact
   */
  async calculateScheduleImpact(co: ChangeOrderWithDetails): Promise<ScheduleImpact> {
    // Get project details
    const projectResult = await this.query(
      `SELECT end_date, baseline_end_date FROM development_projects WHERE id = $1`,
      [co.projectId]
    );
    const project = projectResult.rows[0];

    const originalCompletionDate = co.originalCompletionDate || 
      project?.end_date?.toISOString().split('T')[0] || null;

    let newCompletionDate = null;
    if (originalCompletionDate && co.scheduleImpactDays > 0) {
      const date = new Date(originalCompletionDate);
      date.setDate(date.getDate() + co.scheduleImpactDays);
      newCompletionDate = date.toISOString().split('T')[0];
    } else {
      newCompletionDate = originalCompletionDate;
    }

    // Get affected phases
    const affectedPhases: ScheduleImpact['affectedPhases'] = [];
    if (co.phaseId && co.scheduleImpactDays > 0) {
      // Get this phase and all subsequent phases
      const phasesResult = await this.query(
        `SELECT p.id, p.name, p.end_date, p.sequence_order
         FROM project_phases p
         WHERE p.project_id = $1 
           AND p.sequence_order >= (SELECT sequence_order FROM project_phases WHERE id = $2)
           AND p.deleted_at IS NULL
         ORDER BY p.sequence_order`,
        [co.projectId, co.phaseId]
      );

      for (const phase of phasesResult.rows) {
        if (phase.end_date) {
          const newEndDate = new Date(phase.end_date);
          newEndDate.setDate(newEndDate.getDate() + co.scheduleImpactDays);
          affectedPhases.push({
            phaseId: phase.id,
            phaseName: phase.name,
            currentEndDate: phase.end_date.toISOString().split('T')[0],
            newEndDate: newEndDate.toISOString().split('T')[0],
            delayDays: co.scheduleImpactDays,
          });
        }
      }
    }

    // Get affected milestones
    const affectedMilestones: ScheduleImpact['affectedMilestones'] = [];
    if (newCompletionDate && originalCompletionDate && co.scheduleImpactDays > 0) {
      const milestonesResult = await this.query(
        `SELECT id, name, target_date FROM project_milestones
         WHERE project_id = $1 AND target_date > $2 AND deleted_at IS NULL
         ORDER BY target_date`,
        [co.projectId, originalCompletionDate]
      );

      for (const milestone of milestonesResult.rows) {
        const newDate = new Date(milestone.target_date);
        newDate.setDate(newDate.getDate() + co.scheduleImpactDays);
        affectedMilestones.push({
          milestoneId: milestone.id,
          milestoneName: milestone.name,
          currentDate: milestone.target_date.toISOString().split('T')[0],
          newDate: newDate.toISOString().split('T')[0],
          delayDays: co.scheduleImpactDays,
        });
      }
    }

    // Check critical path impact
    const criticalPathImpact = affectedPhases.length > 0 || co.scheduleImpactDays > 5;

    return {
      originalCompletionDate,
      impactDays: co.scheduleImpactDays,
      newCompletionDate,
      affectedPhases,
      affectedMilestones,
      criticalPathImpact,
    };
  }

  /**
   * Calculate cost impact
   */
  async calculateCostImpact(co: ChangeOrderWithDetails): Promise<CostImpact> {
    // Get project budget info
    const projectResult = await this.query(
      `SELECT total_budget, contingency_budget FROM development_projects WHERE id = $1`,
      [co.projectId]
    );
    const project = projectResult.rows[0] || {};

    const totalBudget = parseFloat(project.total_budget) || 0;
    const contingencyBudget = parseFloat(project.contingency_budget) || 0;

    // Get total executed changes
    const executedResult = await this.query(
      `SELECT COALESCE(SUM(this_change_amount), 0) as executed_total
       FROM change_orders
       WHERE project_id = $1 AND status = 'executed' AND id != $2`,
      [co.projectId, co.id]
    );
    const executedTotal = parseFloat(executedResult.rows[0].executed_total) || 0;

    // Calculate by category
    const byCategory: Record<ItemType, number> = {
      labor: 0,
      material: 0,
      equipment: 0,
      subcontractor: 0,
      overhead: 0,
      fee: 0,
      other: 0,
    };

    if (co.items) {
      for (const item of co.items) {
        byCategory[item.itemType] = (byCategory[item.itemType] || 0) + (item.totalCost || 0);
      }
    }

    const percentageChange = co.originalContractAmount > 0
      ? (co.thisChangeAmount / co.originalContractAmount) * 100
      : 0;

    const budgetRemaining = totalBudget - co.newContractAmount;
    const contingencyUsed = Math.min(co.thisChangeAmount, contingencyBudget);
    const contingencyRemaining = contingencyBudget - executedTotal - co.thisChangeAmount;

    return {
      originalContractAmount: co.originalContractAmount,
      previousChangesAmount: co.previousChangesAmount,
      thisChangeAmount: co.thisChangeAmount,
      newContractAmount: co.newContractAmount,
      percentageChange,
      budgetRemaining,
      contingencyUsed: Math.max(0, contingencyUsed),
      contingencyRemaining: Math.max(0, contingencyRemaining),
      byCategory,
    };
  }

  // ==========================================================================
  // TREND ANALYSIS
  // ==========================================================================

  /**
   * Get change order trends for a project
   */
  async getTrends(projectId: string): Promise<{
    monthly: Array<{ month: string; count: number; amount: number }>;
    byReason: Array<{ reason: string; count: number; amount: number }>;
    cumulative: Array<{ date: string; cumulativeAmount: number }>;
  }> {
    // Monthly trends
    const monthlyResult = await this.query(
      `SELECT 
         TO_CHAR(created_at, 'YYYY-MM') as month,
         COUNT(*) as count,
         SUM(this_change_amount) as amount
       FROM change_orders
       WHERE project_id = $1 AND status != 'void'
       GROUP BY TO_CHAR(created_at, 'YYYY-MM')
       ORDER BY month`,
      [projectId]
    );

    // By reason
    const byReasonResult = await this.query(
      `SELECT 
         reason,
         COUNT(*) as count,
         SUM(this_change_amount) as amount
       FROM change_orders
       WHERE project_id = $1 AND status != 'void'
       GROUP BY reason
       ORDER BY amount DESC`,
      [projectId]
    );

    // Cumulative
    const cumulativeResult = await this.query(
      `SELECT 
         DATE(executed_at) as date,
         SUM(SUM(this_change_amount)) OVER (ORDER BY DATE(executed_at)) as cumulative_amount
       FROM change_orders
       WHERE project_id = $1 AND status = 'executed'
       GROUP BY DATE(executed_at)
       ORDER BY date`,
      [projectId]
    );

    return {
      monthly: monthlyResult.rows.map(r => ({
        month: r.month,
        count: parseInt(r.count, 10),
        amount: parseFloat(r.amount) || 0,
      })),
      byReason: byReasonResult.rows.map(r => ({
        reason: r.reason,
        count: parseInt(r.count, 10),
        amount: parseFloat(r.amount) || 0,
      })),
      cumulative: cumulativeResult.rows.map(r => ({
        date: r.date?.toISOString().split('T')[0] || '',
        cumulativeAmount: parseFloat(r.cumulative_amount) || 0,
      })),
    };
  }

  /**
   * Get change order forecast
   */
  async getForecast(projectId: string): Promise<{
    projectedTotal: number;
    confidenceLevel: 'low' | 'medium' | 'high';
    remainingContingency: number;
    riskAssessment: string;
  }> {
    // Get project info
    const projectResult = await this.query(
      `SELECT 
         total_budget, contingency_budget,
         start_date, end_date,
         (SELECT SUM(this_change_amount) FROM change_orders WHERE project_id = p.id AND status = 'executed') as executed_changes,
         (SELECT SUM(this_change_amount) FROM change_orders WHERE project_id = p.id AND status IN ('pending_review', 'pending_approval', 'approved')) as pending_changes
       FROM development_projects p
       WHERE id = $1`,
      [projectId]
    );

    const project = projectResult.rows[0];
    if (!project) throw new Error('Project not found');

    const executedChanges = parseFloat(project.executed_changes) || 0;
    const pendingChanges = parseFloat(project.pending_changes) || 0;
    const contingencyBudget = parseFloat(project.contingency_budget) || 0;

    // Calculate project progress
    let projectProgress = 0.5; // Default 50%
    if (project.start_date && project.end_date) {
      const start = new Date(project.start_date).getTime();
      const end = new Date(project.end_date).getTime();
      const now = Date.now();
      projectProgress = Math.min(1, Math.max(0, (now - start) / (end - start)));
    }

    // Project total changes based on trend
    const projectedTotal = projectProgress > 0
      ? (executedChanges / projectProgress)
      : executedChanges + pendingChanges;

    const remainingContingency = contingencyBudget - executedChanges - pendingChanges;

    // Confidence based on how much project is complete
    let confidenceLevel: 'low' | 'medium' | 'high' = 'low';
    if (projectProgress > 0.7) confidenceLevel = 'high';
    else if (projectProgress > 0.4) confidenceLevel = 'medium';

    // Risk assessment
    let riskAssessment = 'Low risk - changes within expected range';
    if (remainingContingency < 0) {
      riskAssessment = 'Critical - contingency exceeded, budget overrun expected';
    } else if (remainingContingency < contingencyBudget * 0.2) {
      riskAssessment = 'High risk - contingency nearly depleted';
    } else if (remainingContingency < contingencyBudget * 0.5) {
      riskAssessment = 'Medium risk - monitor change order frequency';
    }

    return {
      projectedTotal,
      confidenceLevel,
      remainingContingency,
      riskAssessment,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private assessRiskLevel(
    co: ChangeOrderWithDetails,
    schedule: ScheduleImpact,
    cost: CostImpact
  ): 'low' | 'medium' | 'high' | 'critical' {
    let riskScore = 0;

    // Schedule impact scoring
    if (schedule.impactDays > 30) riskScore += 3;
    else if (schedule.impactDays > 14) riskScore += 2;
    else if (schedule.impactDays > 7) riskScore += 1;

    if (schedule.criticalPathImpact) riskScore += 2;

    // Cost impact scoring
    if (Math.abs(cost.percentageChange) > 10) riskScore += 3;
    else if (Math.abs(cost.percentageChange) > 5) riskScore += 2;
    else if (Math.abs(cost.percentageChange) > 2) riskScore += 1;

    if (cost.contingencyRemaining < 0) riskScore += 3;
    else if (cost.contingencyRemaining < cost.thisChangeAmount) riskScore += 2;

    // Map score to level
    if (riskScore >= 8) return 'critical';
    if (riskScore >= 5) return 'high';
    if (riskScore >= 3) return 'medium';
    return 'low';
  }

  private generateRecommendations(
    co: ChangeOrderWithDetails,
    schedule: ScheduleImpact,
    cost: CostImpact,
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
  ): string[] {
    const recommendations: string[] = [];

    if (schedule.impactDays > 14) {
      recommendations.push('Consider schedule recovery options such as additional resources or parallel activities');
    }

    if (schedule.criticalPathImpact) {
      recommendations.push('Critical path affected - evaluate fast-tracking or crashing options');
    }

    if (cost.contingencyRemaining < 0) {
      recommendations.push('Budget contingency exceeded - request additional funding or scope reduction');
    } else if (cost.contingencyRemaining < cost.thisChangeAmount * 2) {
      recommendations.push('Contingency running low - implement stricter change control');
    }

    if (cost.percentageChange > 5) {
      recommendations.push('Significant cost increase - ensure proper stakeholder communication');
    }

    if (co.reason === 'design_error') {
      recommendations.push('Review design QA process to prevent similar errors');
    }

    if (riskLevel === 'critical' || riskLevel === 'high') {
      recommendations.push('Escalate to senior management for review');
    }

    if (recommendations.length === 0) {
      recommendations.push('Change order within acceptable parameters - proceed with standard approval');
    }

    return recommendations;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const changeImpactService = new ChangeImpactServiceImpl();
