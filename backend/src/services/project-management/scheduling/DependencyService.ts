/**
 * Dependency Service
 * 
 * Phase 3.6: Split ganttService
 * 
 * Manages phase and milestone dependencies:
 * - Dependency CRUD
 * - Cascading date shifts
 * - Cycle detection
 * - Critical path calculation
 * 
 * @module services/project-management/scheduling/DependencyService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import { eventBus } from '../events/EventBus';
import {
  PhaseDependency,
  DependencyUpdate,
  UpdatePhaseDatesInput,
  CascadeResult,
  CriticalPathResult,
  DependencyType,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class DependencyServiceImpl extends BaseService {
  constructor() {
    super('DependencyService');
  }

  // ==========================================================================
  // DEPENDENCY MANAGEMENT
  // ==========================================================================

  /**
   * Get all dependencies for a phase
   */
  async getPhaseDependencies(phaseId: string): Promise<PhaseDependency[]> {
    const result = await this.query(
      `SELECT * FROM project_phase_dependencies WHERE phase_id = $1`,
      [phaseId]
    );

    return result.rows.map(row => ({
      id: row.id,
      phaseId: row.phase_id,
      dependsOnPhaseId: row.depends_on_phase_id,
      dependencyType: row.dependency_type || 'finish_to_start',
      lagDays: parseInt(row.lag_days, 10) || 0,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Update dependencies for a phase
   */
  async updateDependencies(update: DependencyUpdate): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check for cycles before adding dependencies
      for (const depId of update.dependencyIds) {
        const wouldCycle = await this.wouldCreateCycle(update.phaseId, depId, client);
        if (wouldCycle) {
          throw new Error(`Adding dependency on phase ${depId} would create a circular dependency`);
        }
      }

      // Remove existing dependencies
      await client.query(
        `DELETE FROM project_phase_dependencies WHERE phase_id = $1`,
        [update.phaseId]
      );

      // Add new dependencies
      for (const depId of update.dependencyIds) {
        await client.query(
          `INSERT INTO project_phase_dependencies (phase_id, depends_on_phase_id, dependency_type, lag_days)
           VALUES ($1, $2, $3, $4)`,
          [
            update.phaseId,
            depId,
            update.dependencyType || 'finish_to_start',
            update.lagDays || 0,
          ]
        );
      }

      await client.query('COMMIT');

      eventBus.emit('phase.dependencies.updated', {
        phaseId: update.phaseId,
        dependencyIds: update.dependencyIds,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add a single dependency
   */
  async addDependency(
    phaseId: string,
    dependsOnPhaseId: string,
    dependencyType: DependencyType = 'finish_to_start',
    lagDays: number = 0
  ): Promise<PhaseDependency> {
    // Check for cycles
    const wouldCycle = await this.wouldCreateCycle(phaseId, dependsOnPhaseId);
    if (wouldCycle) {
      throw new Error('Adding this dependency would create a circular dependency');
    }

    const result = await this.query(
      `INSERT INTO project_phase_dependencies (phase_id, depends_on_phase_id, dependency_type, lag_days)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phase_id, depends_on_phase_id) DO UPDATE SET
         dependency_type = EXCLUDED.dependency_type,
         lag_days = EXCLUDED.lag_days
       RETURNING *`,
      [phaseId, dependsOnPhaseId, dependencyType, lagDays]
    );

    return {
      id: result.rows[0].id,
      phaseId: result.rows[0].phase_id,
      dependsOnPhaseId: result.rows[0].depends_on_phase_id,
      dependencyType: result.rows[0].dependency_type,
      lagDays: parseInt(result.rows[0].lag_days, 10) || 0,
      createdAt: new Date(result.rows[0].created_at),
    };
  }

  /**
   * Remove a dependency
   */
  async removeDependency(phaseId: string, dependsOnPhaseId: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM project_phase_dependencies
       WHERE phase_id = $1 AND depends_on_phase_id = $2
       RETURNING id`,
      [phaseId, dependsOnPhaseId]
    );

    return result.rowCount > 0;
  }

  // ==========================================================================
  // DATE MANAGEMENT
  // ==========================================================================

  /**
   * Update phase dates with optional cascade to successors
   */
  async updatePhaseDates(
    phaseId: string,
    input: UpdatePhaseDatesInput
  ): Promise<CascadeResult> {
    const result: CascadeResult = {
      updatedPhases: [],
      affectedMilestones: [],
    };

    // Get current phase
    const phaseResult = await this.query(
      `SELECT * FROM project_phases WHERE id = $1`,
      [phaseId]
    );

    if (!phaseResult.rows.length) {
      throw new Error('Phase not found');
    }

    const currentPhase = phaseResult.rows[0];
    const oldStartDate = currentPhase.start_date;
    const oldEndDate = currentPhase.end_date;

    // Update the phase
    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [phaseId];
    let paramIndex = 2;

    if (input.startDate) {
      updates.push(`start_date = $${paramIndex++}`);
      params.push(input.startDate);
    }

    if (input.endDate) {
      updates.push(`end_date = $${paramIndex++}`);
      params.push(input.endDate);
    }

    await this.query(
      `UPDATE project_phases SET ${updates.join(', ')} WHERE id = $1`,
      params
    );

    result.updatedPhases.push({
      phaseId,
      phaseName: currentPhase.name,
      oldStartDate: oldStartDate ? oldStartDate.toISOString().split('T')[0] : null,
      newStartDate: input.startDate || (oldStartDate ? oldStartDate.toISOString().split('T')[0] : null),
      oldEndDate: oldEndDate ? oldEndDate.toISOString().split('T')[0] : null,
      newEndDate: input.endDate || (oldEndDate ? oldEndDate.toISOString().split('T')[0] : null),
    });

    // Cascade to successors if requested
    if (input.cascadeToSuccessors && input.endDate) {
      const cascaded = await this.cascadeToSuccessors(phaseId, new Date(input.endDate));
      result.updatedPhases.push(...cascaded.updatedPhases);
      result.affectedMilestones.push(...cascaded.affectedMilestones);
    }

    eventBus.emit('phase.dates.updated', {
      phaseId,
      startDate: input.startDate,
      endDate: input.endDate,
      cascaded: input.cascadeToSuccessors,
    });

    return result;
  }

  /**
   * Cascade date shifts to successor phases
   */
  private async cascadeToSuccessors(
    phaseId: string,
    predecessorEndDate: Date
  ): Promise<CascadeResult> {
    const result: CascadeResult = {
      updatedPhases: [],
      affectedMilestones: [],
    };

    // Get successor phases
    const successorsResult = await this.query(
      `SELECT p.*, pd.lag_days, pd.dependency_type
       FROM project_phases p
       JOIN project_phase_dependencies pd ON pd.phase_id = p.id
       WHERE pd.depends_on_phase_id = $1 AND p.deleted_at IS NULL`,
      [phaseId]
    );

    for (const successor of successorsResult.rows) {
      const lagDays = parseInt(successor.lag_days, 10) || 0;
      const newStartDate = new Date(predecessorEndDate);
      newStartDate.setDate(newStartDate.getDate() + lagDays + 1);

      // Calculate new end date maintaining duration
      let newEndDate: Date | null = null;
      if (successor.start_date && successor.end_date) {
        const duration = Math.ceil(
          (new Date(successor.end_date).getTime() - new Date(successor.start_date).getTime()) /
          (1000 * 60 * 60 * 24)
        );
        newEndDate = new Date(newStartDate);
        newEndDate.setDate(newEndDate.getDate() + duration);
      }

      // Update successor
      await this.query(
        `UPDATE project_phases SET
           start_date = $2,
           end_date = COALESCE($3, end_date),
           updated_at = NOW()
         WHERE id = $1`,
        [successor.id, newStartDate.toISOString().split('T')[0], newEndDate?.toISOString().split('T')[0]]
      );

      result.updatedPhases.push({
        phaseId: successor.id,
        phaseName: successor.name,
        oldStartDate: successor.start_date ? successor.start_date.toISOString().split('T')[0] : null,
        newStartDate: newStartDate.toISOString().split('T')[0],
        oldEndDate: successor.end_date ? successor.end_date.toISOString().split('T')[0] : null,
        newEndDate: newEndDate ? newEndDate.toISOString().split('T')[0] : null,
      });

      // Recursively cascade
      if (newEndDate) {
        const nested = await this.cascadeToSuccessors(successor.id, newEndDate);
        result.updatedPhases.push(...nested.updatedPhases);
        result.affectedMilestones.push(...nested.affectedMilestones);
      }
    }

    return result;
  }

  // ==========================================================================
  // CRITICAL PATH
  // ==========================================================================

  /**
   * Calculate critical path using forward/backward pass
   */
  async calculateCriticalPath(projectId: string): Promise<CriticalPathResult> {
    // Get all phases with dependencies
    const phasesResult = await this.query(
      `SELECT 
         p.id, p.name, p.start_date, p.end_date, p.sequence_order,
         COALESCE(
           (SELECT array_agg(pd.depends_on_phase_id)
            FROM project_phase_dependencies pd
            WHERE pd.phase_id = p.id),
           ARRAY[]::uuid[]
         ) as dependencies
       FROM project_phases p
       WHERE p.project_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.sequence_order`,
      [projectId]
    );

    const phases = phasesResult.rows;
    const phaseMap = new Map(phases.map(p => [p.id, p]));

    // Forward pass - calculate early start/finish
    const earlyTimes = new Map<string, { start: Date; finish: Date }>();
    for (const phase of phases) {
      const deps = phase.dependencies || [];
      let earlyStart = phase.start_date ? new Date(phase.start_date) : new Date();

      // Early start is max of predecessor early finishes
      for (const depId of deps) {
        const depTimes = earlyTimes.get(depId);
        if (depTimes && depTimes.finish > earlyStart) {
          earlyStart = new Date(depTimes.finish);
          earlyStart.setDate(earlyStart.getDate() + 1);
        }
      }

      const duration = this.getPhaseDuration(phase);
      const earlyFinish = new Date(earlyStart);
      earlyFinish.setDate(earlyFinish.getDate() + duration);

      earlyTimes.set(phase.id, { start: earlyStart, finish: earlyFinish });
    }

    // Backward pass - calculate late start/finish
    const lateTimes = new Map<string, { start: Date; finish: Date }>();
    const reversedPhases = [...phases].reverse();
    
    // Find project end date (max early finish)
    let projectEnd = new Date();
    for (const times of earlyTimes.values()) {
      if (times.finish > projectEnd) {
        projectEnd = times.finish;
      }
    }

    for (const phase of reversedPhases) {
      const early = earlyTimes.get(phase.id)!;
      let lateFinish = new Date(projectEnd);

      // Find successors
      for (const [otherId, other] of phaseMap) {
        const deps = other.dependencies || [];
        if (deps.includes(phase.id)) {
          const successorLate = lateTimes.get(otherId);
          if (successorLate) {
            const successorLateStart = new Date(successorLate.start);
            successorLateStart.setDate(successorLateStart.getDate() - 1);
            if (successorLateStart < lateFinish) {
              lateFinish = successorLateStart;
            }
          }
        }
      }

      const duration = this.getPhaseDuration(phase);
      const lateStart = new Date(lateFinish);
      lateStart.setDate(lateStart.getDate() - duration);

      lateTimes.set(phase.id, { start: lateStart, finish: lateFinish });
    }

    // Calculate slack and identify critical path
    const criticalPath: string[] = [];
    const phaseResults = phases.map(phase => {
      const early = earlyTimes.get(phase.id)!;
      const late = lateTimes.get(phase.id)!;
      const slack = Math.ceil(
        (late.start.getTime() - early.start.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isCritical = slack === 0;

      if (isCritical) {
        criticalPath.push(phase.id);
      }

      // Update phase in database
      this.query(
        `UPDATE project_phases SET is_critical_path = $2, slack_days = $3 WHERE id = $1`,
        [phase.id, isCritical, slack]
      );

      return {
        phaseId: phase.id,
        phaseName: phase.name,
        earlyStart: early.start,
        earlyFinish: early.finish,
        lateStart: late.start,
        lateFinish: late.finish,
        slack,
        isCritical,
      };
    });

    const totalDuration = Math.ceil(
      (projectEnd.getTime() - phases[0]?.start_date?.getTime() || Date.now()) /
      (1000 * 60 * 60 * 24)
    );

    return {
      criticalPath,
      totalDuration,
      phases: phaseResults,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Check if adding a dependency would create a cycle
   */
  private async wouldCreateCycle(
    phaseId: string,
    dependsOnPhaseId: string,
    client?: any
  ): Promise<boolean> {
    const queryFn = client ? (sql: string, params: any[]) => client.query(sql, params) : this.query.bind(this);

    // BFS to check if phaseId is reachable from dependsOnPhaseId
    const visited = new Set<string>();
    const queue = [dependsOnPhaseId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current === phaseId) {
        return true; // Cycle detected
      }

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      // Get dependencies of current
      const result = await queryFn(
        `SELECT depends_on_phase_id FROM project_phase_dependencies WHERE phase_id = $1`,
        [current]
      );

      for (const row of result.rows) {
        queue.push(row.depends_on_phase_id);
      }
    }

    return false;
  }

  private getPhaseDuration(phase: any): number {
    if (phase.start_date && phase.end_date) {
      return Math.ceil(
        (new Date(phase.end_date).getTime() - new Date(phase.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
      );
    }
    return 0;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const dependencyService = new DependencyServiceImpl();
