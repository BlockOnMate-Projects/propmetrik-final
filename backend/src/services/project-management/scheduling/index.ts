/**
 * Scheduling Module
 * 
 * Phase 3.6: Split ganttService (1234 lines)
 * 
 * Provides:
 * - GanttDataService: Gantt visualization data
 * - DependencyService: Phase dependencies & critical path
 * - BaselineService: Baseline snapshots & comparison
 * 
 * @module services/project-management/scheduling
 */

// Types
export * from './types';

// Services
export { ganttDataService } from './GanttDataService';
export { dependencyService } from './DependencyService';
export { baselineService } from './BaselineService';

// =============================================================================
// FACADE (provides backward-compatible interface)
// =============================================================================

import { ganttDataService } from './GanttDataService';
import { dependencyService } from './DependencyService';
import { baselineService } from './BaselineService';
import {
  GanttDataQuery,
  GanttData,
  PhaseDependency,
  DependencyUpdateInput,
  DependencyCreateInput,
  PhaseDatesUpdateInput,
  CriticalPathResult,
  BaselineCreateInput,
  Baseline,
  BaselineComparison,
} from './types';

/**
 * Scheduling Facade
 * 
 * Provides unified access to all scheduling functionality.
 * Use this for backward compatibility with ganttService.
 */
export class SchedulingFacade {
  // ==========================================================================
  // GANTT DATA
  // ==========================================================================

  /**
   * Get Gantt chart data for a project
   */
  async getGanttData(query: GanttDataQuery): Promise<GanttData> {
    return ganttDataService.getGanttData(query);
  }

  /**
   * Get timeline data for reporting
   */
  async getTimelineData(projectId: string): Promise<any> {
    return ganttDataService.getTimelineData(projectId);
  }

  /**
   * Get phase progress summary
   */
  async getPhaseProgress(projectId: string): Promise<any[]> {
    return ganttDataService.getPhaseProgress(projectId);
  }

  // ==========================================================================
  // DEPENDENCIES
  // ==========================================================================

  /**
   * Get all dependencies for a phase
   */
  async getPhaseDependencies(phaseId: string): Promise<PhaseDependency[]> {
    return dependencyService.getPhaseDependencies(phaseId);
  }

  /**
   * Update dependencies (bulk replace)
   */
  async updateDependencies(phaseId: string, dependencies: DependencyUpdateInput[]): Promise<PhaseDependency[]> {
    return dependencyService.updateDependencies(phaseId, dependencies);
  }

  /**
   * Add a single dependency
   */
  async addDependency(input: DependencyCreateInput): Promise<PhaseDependency | null> {
    return dependencyService.addDependency(input);
  }

  /**
   * Remove a dependency
   */
  async removeDependency(successorPhaseId: string, predecessorPhaseId: string): Promise<boolean> {
    return dependencyService.removeDependency(successorPhaseId, predecessorPhaseId);
  }

  /**
   * Update phase dates (with dependency cascade)
   */
  async updatePhaseDates(input: PhaseDatesUpdateInput): Promise<boolean> {
    return dependencyService.updatePhaseDates(input);
  }

  /**
   * Calculate the critical path for a project
   */
  async calculateCriticalPath(projectId: string): Promise<CriticalPathResult> {
    return dependencyService.calculateCriticalPath(projectId);
  }

  /**
   * Check if adding a dependency would create a cycle
   */
  async wouldCreateCycle(successorPhaseId: string, predecessorPhaseId: string): Promise<boolean> {
    return dependencyService.wouldCreateCycle(successorPhaseId, predecessorPhaseId);
  }

  // ==========================================================================
  // BASELINES
  // ==========================================================================

  /**
   * Create a baseline snapshot
   */
  async createBaseline(input: BaselineCreateInput): Promise<Baseline> {
    return baselineService.createBaseline(input);
  }

  /**
   * Get all baselines for a project
   */
  async getProjectBaselines(projectId: string): Promise<Baseline[]> {
    return baselineService.getProjectBaselines(projectId);
  }

  /**
   * Get a specific baseline
   */
  async getBaseline(baselineId: string): Promise<Baseline | null> {
    return baselineService.getBaseline(baselineId);
  }

  /**
   * Set a baseline as active
   */
  async setActiveBaseline(baselineId: string): Promise<Baseline | null> {
    return baselineService.setActiveBaseline(baselineId);
  }

  /**
   * Delete a baseline
   */
  async deleteBaseline(baselineId: string): Promise<boolean> {
    return baselineService.deleteBaseline(baselineId);
  }

  /**
   * Lock a baseline (prevent deletion)
   */
  async lockBaseline(baselineId: string, approvedBy: string): Promise<Baseline | null> {
    return baselineService.lockBaseline(baselineId, approvedBy);
  }

  /**
   * Compare current state with baseline
   */
  async getBaselineComparison(projectId: string, baselineId?: string): Promise<BaselineComparison | null> {
    return baselineService.getBaselineComparison(projectId, baselineId);
  }

  // ==========================================================================
  // LEGACY COMPATIBILITY
  // ==========================================================================

  /**
   * @deprecated Use updatePhaseDates instead
   */
  async cascadePhaseShift(phaseId: string, daysDelta: number): Promise<boolean> {
    const result = await this.query(
      `SELECT project_id FROM project_phases WHERE id = $1`,
      [phaseId]
    );
    
    if (!result.rows.length) return false;
    
    // Just trigger recalculation through dependency service
    return dependencyService.updatePhaseDates({
      phaseId,
      startDate: undefined,
      endDate: undefined,
      cascade: true,
    });
  }

  private async query(sql: string, params?: any[]) {
    const { pool } = await import('../../../database');
    return pool.query(sql, params);
  }
}

// Singleton export
export const schedulingFacade = new SchedulingFacade();

// Default export for backward compatibility
export default schedulingFacade;
