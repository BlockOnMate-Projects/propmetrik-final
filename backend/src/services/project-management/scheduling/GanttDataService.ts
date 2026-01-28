/**
 * Gantt Data Service
 * 
 * Phase 3.6: Split ganttService
 * 
 * Prepares Gantt chart visualization data:
 * - Phase and milestone aggregation
 * - Progress calculation
 * - Summary statistics
 * 
 * @module services/project-management/scheduling/GanttDataService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import {
  GanttData,
  GanttPhase,
  GanttMilestone,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class GanttDataServiceImpl extends BaseService {
  constructor() {
    super('GanttDataService');
  }

  /**
   * Get complete Gantt chart data for a project
   */
  async getGanttData(projectId: string): Promise<GanttData | null> {
    // Get project info
    const projectResult = await this.query(
      `SELECT id, name, start_date, end_date, 
              baseline_start_date, baseline_end_date
       FROM development_projects 
       WHERE id = $1 AND deleted_at IS NULL`,
      [projectId]
    );

    if (!projectResult.rows.length) {
      return null;
    }

    const project = projectResult.rows[0];

    // Get phases with dependencies
    const phasesResult = await this.query(
      `SELECT 
         p.id, p.name, p.sequence_order, 
         p.start_date, p.end_date,
         p.baseline_start_date, p.baseline_end_date,
         p.progress_percentage, p.status,
         p.is_critical_path, p.slack_days,
         p.budgeted_cost, p.actual_cost, p.color,
         COALESCE(
           (SELECT array_agg(pd.depends_on_phase_id)
            FROM project_phase_dependencies pd
            WHERE pd.phase_id = p.id), 
           ARRAY[]::uuid[]
         ) as dependency_ids
       FROM project_phases p
       WHERE p.project_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.sequence_order`,
      [projectId]
    );

    // Get milestones
    const milestonesResult = await this.query(
      `SELECT 
         m.id, m.phase_id, m.name, 
         m.target_date, m.actual_date, m.baseline_date,
         m.status, m.milestone_type, m.priority,
         COALESCE(
           (SELECT array_agg(md.depends_on_milestone_id)
            FROM milestone_dependencies md
            WHERE md.milestone_id = m.id), 
           ARRAY[]::uuid[]
         ) as dependency_ids
       FROM project_milestones m
       WHERE m.project_id = $1 AND m.deleted_at IS NULL
       ORDER BY m.target_date`,
      [projectId]
    );

    // Group milestones by phase
    const milestonesByPhase = new Map<string, GanttMilestone[]>();
    for (const m of milestonesResult.rows) {
      const phaseId = m.phase_id || 'unassigned';
      if (!milestonesByPhase.has(phaseId)) {
        milestonesByPhase.set(phaseId, []);
      }
      milestonesByPhase.get(phaseId)!.push(this.mapMilestone(m));
    }

    // Build phases with milestones
    const phases: GanttPhase[] = phasesResult.rows.map(p => ({
      id: p.id,
      name: p.name,
      sequenceOrder: p.sequence_order,
      startDate: p.start_date ? p.start_date.toISOString().split('T')[0] : null,
      endDate: p.end_date ? p.end_date.toISOString().split('T')[0] : null,
      baselineStartDate: p.baseline_start_date ? p.baseline_start_date.toISOString().split('T')[0] : null,
      baselineEndDate: p.baseline_end_date ? p.baseline_end_date.toISOString().split('T')[0] : null,
      progress: parseFloat(p.progress_percentage) || 0,
      status: p.status,
      isCriticalPath: p.is_critical_path || false,
      slackDays: parseInt(p.slack_days, 10) || 0,
      dependencyIds: p.dependency_ids || [],
      budgetedCost: parseFloat(p.budgeted_cost) || 0,
      actualCost: parseFloat(p.actual_cost) || 0,
      color: p.color,
      milestones: milestonesByPhase.get(p.id) || [],
    }));

    // Calculate critical path
    const criticalPath = phases
      .filter(p => p.isCriticalPath)
      .map(p => p.id);

    // Calculate total progress
    const totalProgress = this.calculateTotalProgress(phases);

    // Calculate summary
    const summary = this.calculateSummary(phases, milestonesResult.rows, project);

    return {
      projectId,
      projectName: project.name,
      startDate: project.start_date ? project.start_date.toISOString().split('T')[0] : null,
      endDate: project.end_date ? project.end_date.toISOString().split('T')[0] : null,
      baselineStartDate: project.baseline_start_date ? project.baseline_start_date.toISOString().split('T')[0] : null,
      baselineEndDate: project.baseline_end_date ? project.baseline_end_date.toISOString().split('T')[0] : null,
      totalProgress,
      phases,
      criticalPath,
      summary,
    };
  }

  /**
   * Get minimal Gantt data for timeline view
   */
  async getTimelineData(projectId: string): Promise<{
    phases: Array<{ id: string; name: string; startDate: string | null; endDate: string | null; progress: number }>;
    milestones: Array<{ id: string; name: string; targetDate: string; status: string }>;
  }> {
    const [phasesResult, milestonesResult] = await Promise.all([
      this.query(
        `SELECT id, name, start_date, end_date, progress_percentage
         FROM project_phases
         WHERE project_id = $1 AND deleted_at IS NULL
         ORDER BY sequence_order`,
        [projectId]
      ),
      this.query(
        `SELECT id, name, target_date, status
         FROM project_milestones
         WHERE project_id = $1 AND deleted_at IS NULL
         ORDER BY target_date`,
        [projectId]
      ),
    ]);

    return {
      phases: phasesResult.rows.map(p => ({
        id: p.id,
        name: p.name,
        startDate: p.start_date ? p.start_date.toISOString().split('T')[0] : null,
        endDate: p.end_date ? p.end_date.toISOString().split('T')[0] : null,
        progress: parseFloat(p.progress_percentage) || 0,
      })),
      milestones: milestonesResult.rows.map(m => ({
        id: m.id,
        name: m.name,
        targetDate: m.target_date.toISOString().split('T')[0],
        status: m.status,
      })),
    };
  }

  /**
   * Get phase progress breakdown
   */
  async getPhaseProgress(phaseId: string): Promise<{
    phase: GanttPhase | null;
    taskBreakdown: Array<{
      taskId: string;
      taskName: string;
      progress: number;
      status: string;
    }>;
  }> {
    const phaseResult = await this.query(
      `SELECT * FROM project_phases WHERE id = $1`,
      [phaseId]
    );

    if (!phaseResult.rows.length) {
      return { phase: null, taskBreakdown: [] };
    }

    // Get tasks/activities for this phase
    const tasksResult = await this.query(
      `SELECT id, name, progress_percentage, status
       FROM phase_tasks
       WHERE phase_id = $1 AND deleted_at IS NULL
       ORDER BY sequence_order`,
      [phaseId]
    );

    return {
      phase: this.mapPhase(phaseResult.rows[0]),
      taskBreakdown: tasksResult.rows.map(t => ({
        taskId: t.id,
        taskName: t.name,
        progress: parseFloat(t.progress_percentage) || 0,
        status: t.status,
      })),
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private mapMilestone(row: any): GanttMilestone {
    return {
      id: row.id,
      name: row.name,
      targetDate: row.target_date ? row.target_date.toISOString().split('T')[0] : '',
      actualDate: row.actual_date ? row.actual_date.toISOString().split('T')[0] : null,
      baselineDate: row.baseline_date ? row.baseline_date.toISOString().split('T')[0] : null,
      status: row.status,
      type: row.milestone_type,
      priority: row.priority,
      dependencyIds: row.dependency_ids || [],
    };
  }

  private mapPhase(row: any): GanttPhase {
    return {
      id: row.id,
      name: row.name,
      sequenceOrder: row.sequence_order,
      startDate: row.start_date ? row.start_date.toISOString().split('T')[0] : null,
      endDate: row.end_date ? row.end_date.toISOString().split('T')[0] : null,
      baselineStartDate: row.baseline_start_date ? row.baseline_start_date.toISOString().split('T')[0] : null,
      baselineEndDate: row.baseline_end_date ? row.baseline_end_date.toISOString().split('T')[0] : null,
      progress: parseFloat(row.progress_percentage) || 0,
      status: row.status,
      isCriticalPath: row.is_critical_path || false,
      slackDays: parseInt(row.slack_days, 10) || 0,
      dependencyIds: row.dependency_ids || [],
      budgetedCost: parseFloat(row.budgeted_cost) || 0,
      actualCost: parseFloat(row.actual_cost) || 0,
      color: row.color,
      milestones: [],
    };
  }

  private calculateTotalProgress(phases: GanttPhase[]): number {
    if (phases.length === 0) return 0;

    // Weight by budgeted cost if available, otherwise equal weight
    const totalBudget = phases.reduce((sum, p) => sum + p.budgetedCost, 0);

    if (totalBudget > 0) {
      const weightedProgress = phases.reduce(
        (sum, p) => sum + (p.progress * p.budgetedCost),
        0
      );
      return Math.round(weightedProgress / totalBudget);
    }

    // Equal weight
    return Math.round(
      phases.reduce((sum, p) => sum + p.progress, 0) / phases.length
    );
  }

  private calculateSummary(
    phases: GanttPhase[],
    milestones: any[],
    project: any
  ): GanttData['summary'] {
    const completedPhases = phases.filter(p => p.status === 'completed').length;
    const completedMilestones = milestones.filter(m => m.status === 'completed').length;

    // Days remaining
    let daysRemaining = 0;
    if (project.end_date) {
      const endDate = new Date(project.end_date);
      const today = new Date();
      daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Days variance from baseline
    let daysVariance = 0;
    if (project.end_date && project.baseline_end_date) {
      const endDate = new Date(project.end_date);
      const baselineEnd = new Date(project.baseline_end_date);
      daysVariance = Math.ceil((endDate.getTime() - baselineEnd.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      totalPhases: phases.length,
      completedPhases,
      totalMilestones: milestones.length,
      completedMilestones,
      daysRemaining: Math.max(0, daysRemaining),
      daysVariance,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const ganttDataService = new GanttDataServiceImpl();
