/**
 * Baseline Service
 * 
 * Phase 3.6: Split ganttService
 * 
 * Manages project baselines:
 * - Create/snapshot baselines
 * - Compare current vs baseline
 * - Variance analysis
 * - Baseline approval workflow
 * 
 * @module services/project-management/scheduling/BaselineService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import { eventBus } from '../events/EventBus';
import {
  Baseline,
  BaselineCreateInput,
  BaselineComparison,
  PhaseVariance,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class BaselineServiceImpl extends BaseService {
  constructor() {
    super('BaselineService');
  }

  // ==========================================================================
  // BASELINE CRUD
  // ==========================================================================

  /**
   * Create a new baseline snapshot
   */
  async createBaseline(input: BaselineCreateInput): Promise<Baseline> {
    // Get current project state
    const projectResult = await this.query(
      `SELECT id, organization_id, start_date, end_date, total_budget
       FROM development_projects WHERE id = $1`,
      [input.projectId]
    );

    if (!projectResult.rows.length) {
      throw new Error('Project not found');
    }

    const project = projectResult.rows[0];

    // Get current phases
    const phasesResult = await this.query(
      `SELECT id, name, sequence_order, start_date, end_date,
              progress_percentage, status, budgeted_cost, actual_cost
       FROM project_phases
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY sequence_order`,
      [input.projectId]
    );

    // Get current milestones
    const milestonesResult = await this.query(
      `SELECT id, name, target_date, actual_date, status, priority
       FROM project_milestones
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY target_date`,
      [input.projectId]
    );

    // Get budget snapshot
    const budgetResult = await this.query(
      `SELECT category, budgeted_amount, actual_amount
       FROM project_budgets
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [input.projectId]
    );

    // Get next baseline number
    const countResult = await this.query(
      `SELECT COUNT(*) as count FROM project_baselines WHERE project_id = $1`,
      [input.projectId]
    );
    const baselineNumber = parseInt(countResult.rows[0].count, 10) + 1;

    // Create baseline
    const result = await this.query(
      `INSERT INTO project_baselines (
         project_id, organization_id, name, description, baseline_number,
         snapshot_date, phases_snapshot, milestones_snapshot, budget_snapshot,
         total_budget, planned_start_date, planned_end_date,
         total_phases, total_milestones, notes, created_by
       ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        input.projectId,
        input.organizationId,
        input.name || `Baseline ${baselineNumber}`,
        input.description || null,
        baselineNumber,
        JSON.stringify(phasesResult.rows),
        JSON.stringify(milestonesResult.rows),
        JSON.stringify(budgetResult.rows),
        project.total_budget || 0,
        project.start_date,
        project.end_date,
        phasesResult.rows.length,
        milestonesResult.rows.length,
        input.notes || null,
        input.createdBy || null,
      ]
    );

    // Copy baseline dates to phases
    await this.query(
      `UPDATE project_phases 
       SET baseline_start_date = start_date, baseline_end_date = end_date
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [input.projectId]
    );

    // Copy baseline dates to milestones
    await this.query(
      `UPDATE project_milestones
       SET baseline_date = target_date
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [input.projectId]
    );

    // Copy to project
    await this.query(
      `UPDATE development_projects
       SET baseline_start_date = start_date, baseline_end_date = end_date
       WHERE id = $1`,
      [input.projectId]
    );

    const baseline = this.mapBaseline(result.rows[0]);

    eventBus.emit('project.baseline.created', {
      projectId: input.projectId,
      baselineId: baseline.id,
      baselineNumber,
    });

    return baseline;
  }

  /**
   * Get all baselines for a project
   */
  async getProjectBaselines(projectId: string): Promise<Baseline[]> {
    const result = await this.query(
      `SELECT * FROM project_baselines
       WHERE project_id = $1
       ORDER BY baseline_number DESC`,
      [projectId]
    );

    return result.rows.map(this.mapBaseline);
  }

  /**
   * Get a specific baseline
   */
  async getBaseline(baselineId: string): Promise<Baseline | null> {
    const result = await this.query(
      `SELECT * FROM project_baselines WHERE id = $1`,
      [baselineId]
    );

    return result.rows[0] ? this.mapBaseline(result.rows[0]) : null;
  }

  /**
   * Set a baseline as active
   */
  async setActiveBaseline(baselineId: string): Promise<Baseline | null> {
    // Get baseline to find project
    const baselineResult = await this.query(
      `SELECT project_id FROM project_baselines WHERE id = $1`,
      [baselineId]
    );

    if (!baselineResult.rows.length) {
      return null;
    }

    const projectId = baselineResult.rows[0].project_id;

    // Deactivate all baselines for this project
    await this.query(
      `UPDATE project_baselines SET is_active = false WHERE project_id = $1`,
      [projectId]
    );

    // Activate the specified baseline
    const result = await this.query(
      `UPDATE project_baselines SET is_active = true WHERE id = $1 RETURNING *`,
      [baselineId]
    );

    if (result.rows.length) {
      eventBus.emit('project.baseline.activated', {
        projectId,
        baselineId,
      });
    }

    return result.rows[0] ? this.mapBaseline(result.rows[0]) : null;
  }

  /**
   * Delete a baseline
   */
  async deleteBaseline(baselineId: string): Promise<boolean> {
    // Check if locked
    const baselineResult = await this.query(
      `SELECT is_locked FROM project_baselines WHERE id = $1`,
      [baselineId]
    );

    if (baselineResult.rows[0]?.is_locked) {
      throw new Error('Cannot delete a locked baseline');
    }

    const result = await this.query(
      `DELETE FROM project_baselines WHERE id = $1 AND is_locked = false RETURNING id`,
      [baselineId]
    );

    return result.rowCount > 0;
  }

  /**
   * Lock a baseline (prevent deletion)
   */
  async lockBaseline(baselineId: string, approvedBy: string): Promise<Baseline | null> {
    const result = await this.query(
      `UPDATE project_baselines
       SET is_locked = true, approved_by = $2, approved_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [baselineId, approvedBy]
    );

    return result.rows[0] ? this.mapBaseline(result.rows[0]) : null;
  }

  // ==========================================================================
  // COMPARISON
  // ==========================================================================

  /**
   * Compare current project state with a baseline
   */
  async getBaselineComparison(projectId: string, baselineId?: string): Promise<BaselineComparison | null> {
    // Get baseline (active or specified)
    let baseline: Baseline | null;
    
    if (baselineId) {
      baseline = await this.getBaseline(baselineId);
    } else {
      const result = await this.query(
        `SELECT * FROM project_baselines
         WHERE project_id = $1 AND is_active = true
         LIMIT 1`,
        [projectId]
      );
      baseline = result.rows[0] ? this.mapBaseline(result.rows[0]) : null;
    }

    if (!baseline) {
      return null;
    }

    // Get current project state
    const projectResult = await this.query(
      `SELECT start_date, end_date, total_budget, actual_cost
       FROM development_projects WHERE id = $1`,
      [projectId]
    );

    if (!projectResult.rows.length) {
      return null;
    }

    const project = projectResult.rows[0];

    // Get current phases
    const phasesResult = await this.query(
      `SELECT id, name, start_date, end_date, progress_percentage
       FROM project_phases
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY sequence_order`,
      [projectId]
    );

    // Calculate variances
    const currentStart = project.start_date ? new Date(project.start_date) : null;
    const currentEnd = project.end_date ? new Date(project.end_date) : null;
    const baselineStart = baseline.plannedStartDate ? new Date(baseline.plannedStartDate) : null;
    const baselineEnd = baseline.plannedEndDate ? new Date(baseline.plannedEndDate) : null;

    const startVariance = currentStart && baselineStart
      ? Math.ceil((currentStart.getTime() - baselineStart.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const endVariance = currentEnd && baselineEnd
      ? Math.ceil((currentEnd.getTime() - baselineEnd.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const budgetVariance = (parseFloat(project.total_budget) || 0) - baseline.totalBudget;
    const budgetVariancePercent = baseline.totalBudget > 0
      ? (budgetVariance / baseline.totalBudget) * 100
      : 0;

    // Calculate overall progress
    const totalProgress = phasesResult.rows.length > 0
      ? phasesResult.rows.reduce((sum, p) => sum + (parseFloat(p.progress_percentage) || 0), 0) /
        phasesResult.rows.length
      : 0;

    // Phase comparisons
    const baselinePhases = baseline.phasesSnapshot || [];
    const phaseComparisons: PhaseVariance[] = phasesResult.rows.map(current => {
      const baselinePhase = baselinePhases.find((bp: any) => bp.id === current.id);
      
      const phaseStartVariance = current.start_date && baselinePhase?.start_date
        ? Math.ceil(
            (new Date(current.start_date).getTime() - new Date(baselinePhase.start_date).getTime()) /
            (1000 * 60 * 60 * 24)
          )
        : 0;

      const phaseEndVariance = current.end_date && baselinePhase?.end_date
        ? Math.ceil(
            (new Date(current.end_date).getTime() - new Date(baselinePhase.end_date).getTime()) /
            (1000 * 60 * 60 * 24)
          )
        : 0;

      return {
        phaseId: current.id,
        phaseName: current.name,
        baselineStart: baselinePhase?.start_date?.split('T')[0] || null,
        baselineEnd: baselinePhase?.end_date?.split('T')[0] || null,
        currentStart: current.start_date?.toISOString().split('T')[0] || null,
        currentEnd: current.end_date?.toISOString().split('T')[0] || null,
        startVariance: phaseStartVariance,
        endVariance: phaseEndVariance,
        baselineProgress: parseFloat(baselinePhase?.progress_percentage) || 0,
        currentProgress: parseFloat(current.progress_percentage) || 0,
        progressVariance: (parseFloat(current.progress_percentage) || 0) - (parseFloat(baselinePhase?.progress_percentage) || 0),
      };
    });

    return {
      projectId,
      baseline,
      current: {
        startDate: currentStart?.toISOString().split('T')[0] || null,
        endDate: currentEnd?.toISOString().split('T')[0] || null,
        totalBudget: parseFloat(project.total_budget) || 0,
        actualCost: parseFloat(project.actual_cost) || 0,
        progress: totalProgress,
      },
      variance: {
        startDays: startVariance,
        endDays: endVariance,
        budgetAmount: budgetVariance,
        budgetPercent: budgetVariancePercent,
      },
      phaseComparisons,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private mapBaseline(row: any): Baseline {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      baselineNumber: parseInt(row.baseline_number, 10),
      snapshotDate: row.snapshot_date?.toISOString() || '',
      phasesSnapshot: typeof row.phases_snapshot === 'string' 
        ? JSON.parse(row.phases_snapshot) 
        : row.phases_snapshot || [],
      milestonesSnapshot: typeof row.milestones_snapshot === 'string'
        ? JSON.parse(row.milestones_snapshot)
        : row.milestones_snapshot || [],
      budgetSnapshot: typeof row.budget_snapshot === 'string'
        ? JSON.parse(row.budget_snapshot)
        : row.budget_snapshot || [],
      totalBudget: parseFloat(row.total_budget) || 0,
      plannedStartDate: row.planned_start_date?.toISOString().split('T')[0] || null,
      plannedEndDate: row.planned_end_date?.toISOString().split('T')[0] || null,
      totalPhases: parseInt(row.total_phases, 10) || 0,
      totalMilestones: parseInt(row.total_milestones, 10) || 0,
      isActive: row.is_active || false,
      isLocked: row.is_locked || false,
      createdBy: row.created_by,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at?.toISOString() || null,
      notes: row.notes,
      createdAt: row.created_at?.toISOString() || '',
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const baselineService = new BaselineServiceImpl();
