/**
 * Gantt Service
 * 
 * Phase 2 Sprint 4: Gantt Chart & Timeline
 * 
 * Provides Gantt chart functionality:
 * - Gantt data structure for visualization
 * - Critical path calculation
 * - Phase date management
 * - Dependency tracking
 * - Baseline comparison
 * 
 * @deprecated This monolithic service has been split into focused modules.
 * Import from 'scheduling/' instead:
 * 
 * - ganttDataService - Gantt visualization data
 * - dependencyService - Phase dependencies & critical path
 * - baselineService - Baseline snapshots & comparison
 * - schedulingFacade - Unified access (backward compatible)
 * 
 * @see scheduling/GanttDataService.ts
 * @see scheduling/DependencyService.ts
 * @see scheduling/BaselineService.ts
 * @see scheduling/index.ts
 */

import { pool } from '../../database';
import { QueryResult } from 'pg';

// ============================================================================
// TYPES
// ============================================================================

export interface GanttPhase {
  id: string;
  name: string;
  sequenceOrder: number;
  startDate: string | null;
  endDate: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  progress: number;
  status: string;
  isCriticalPath: boolean;
  slackDays: number;
  dependencyIds: string[];
  budgetedCost: number;
  actualCost: number;
  color: string | null;
  milestones: GanttMilestone[];
}

export interface GanttMilestone {
  id: string;
  name: string;
  targetDate: string;
  actualDate: string | null;
  baselineDate: string | null;
  status: string;
  type: string;
  priority: string;
  dependencyIds: string[];
}

export interface GanttData {
  projectId: string;
  projectName: string;
  startDate: string | null;
  endDate: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  totalProgress: number;
  phases: GanttPhase[];
  criticalPath: string[];
  summary: {
    totalPhases: number;
    completedPhases: number;
    totalMilestones: number;
    completedMilestones: number;
    daysRemaining: number;
    daysVariance: number;
  };
}

export interface Baseline {
  id: string;
  projectId: string;
  organizationId: string;
  name: string;
  description: string | null;
  baselineNumber: number;
  snapshotDate: string;
  phasesSnapshot: any[];
  milestonesSnapshot: any[];
  budgetSnapshot: any;
  totalBudget: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  totalPhases: number;
  totalMilestones: number;
  isActive: boolean;
  isLocked: boolean;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface BaselineComparison {
  projectId: string;
  baseline: Baseline;
  current: {
    startDate: string | null;
    endDate: string | null;
    totalBudget: number;
    actualCost: number;
    progress: number;
  };
  variance: {
    startDays: number;
    endDays: number;
    budgetAmount: number;
    budgetPercent: number;
  };
  phaseComparisons: {
    phaseId: string;
    phaseName: string;
    baselineStart: string | null;
    baselineEnd: string | null;
    currentStart: string | null;
    currentEnd: string | null;
    startVariance: number;
    endVariance: number;
    baselineProgress: number;
    currentProgress: number;
    progressVariance: number;
  }[];
}

export interface UpdatePhaseDatesInput {
  startDate?: string;
  endDate?: string;
  cascadeToSuccessors?: boolean;
}

export interface DependencyUpdate {
  phaseId: string;
  dependencyIds: string[];
}

// ============================================================================
// GANTT DATA
// ============================================================================

/**
 * Get complete Gantt chart data for a project
 */
export async function getGanttData(
  projectId: string,
  organizationId: string
): Promise<GanttData> {
  const client = await pool.connect();
  
  try {
    // Get project details
    const projectQuery = `
      SELECT 
        dp.id,
        dp.project_name,
        dp.project_start_date,
        dp.expected_completion_date,
        COALESCE(
          (SELECT pb.planned_start_date 
           FROM project_baselines pb 
           WHERE pb.project_id = dp.id AND pb.is_active = true 
           LIMIT 1), 
          dp.project_start_date
        ) as baseline_start_date,
        COALESCE(
          (SELECT pb.planned_end_date 
           FROM project_baselines pb 
           WHERE pb.project_id = dp.id AND pb.is_active = true 
           LIMIT 1), 
          dp.expected_completion_date
        ) as baseline_end_date
      FROM development_projects dp
      WHERE dp.id = $1 AND dp.organization_id = $2 AND dp.is_deleted = false
    `;
    
    const projectResult = await client.query(projectQuery, [projectId, organizationId]);
    
    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }
    
    const project = projectResult.rows[0];
    
    // Get phases with Gantt-specific data
    const phasesQuery = `
      SELECT 
        pp.id,
        pp.name,
        pp.sequence_order,
        pp.start_date,
        pp.end_date,
        pp.baseline_start_date,
        pp.baseline_end_date,
        pp.progress_percentage,
        pp.status,
        pp.is_critical_path,
        pp.slack_days,
        pp.dependency_ids,
        pp.budgeted_cost,
        COALESCE(
          (SELECT SUM(pc.actual_cost) FROM project_costs pc WHERE pc.phase_id = pp.id),
          0
        ) as actual_cost,
        pp.color
      FROM project_phases pp
      WHERE pp.project_id = $1
      ORDER BY pp.sequence_order ASC
    `;
    
    const phasesResult = await client.query(phasesQuery, [projectId]);
    
    // Get milestones grouped by phase
    const milestonesQuery = `
      SELECT 
        pm.id,
        pm.name,
        pm.target_date,
        pm.actual_date,
        pm.baseline_date,
        pm.status,
        pm.milestone_type,
        pm.priority,
        pm.depends_on_milestone_ids,
        pm.phase_id
      FROM project_milestones pm
      WHERE pm.project_id = $1 AND pm.organization_id = $2
      ORDER BY pm.target_date ASC
    `;
    
    const milestonesResult = await client.query(milestonesQuery, [projectId, organizationId]);
    
    // Group milestones by phase
    const milestonesByPhase = new Map<string, GanttMilestone[]>();
    const unassignedMilestones: GanttMilestone[] = [];
    
    for (const row of milestonesResult.rows) {
      const milestone: GanttMilestone = {
        id: row.id,
        name: row.name,
        targetDate: row.target_date,
        actualDate: row.actual_date,
        baselineDate: row.baseline_date,
        status: row.status,
        type: row.milestone_type,
        priority: row.priority,
        dependencyIds: row.depends_on_milestone_ids || []
      };
      
      if (row.phase_id) {
        if (!milestonesByPhase.has(row.phase_id)) {
          milestonesByPhase.set(row.phase_id, []);
        }
        milestonesByPhase.get(row.phase_id)!.push(milestone);
      } else {
        unassignedMilestones.push(milestone);
      }
    }
    
    // Build phases with milestones
    const phases: GanttPhase[] = phasesResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      sequenceOrder: row.sequence_order,
      startDate: row.start_date,
      endDate: row.end_date,
      baselineStartDate: row.baseline_start_date,
      baselineEndDate: row.baseline_end_date,
      progress: parseFloat(row.progress_percentage) || 0,
      status: row.status,
      isCriticalPath: row.is_critical_path || false,
      slackDays: row.slack_days || 0,
      dependencyIds: row.dependency_ids || [],
      budgetedCost: parseFloat(row.budgeted_cost) || 0,
      actualCost: parseFloat(row.actual_cost) || 0,
      color: row.color,
      milestones: milestonesByPhase.get(row.id) || []
    }));
    
    // Calculate critical path
    const criticalPath = phases
      .filter(p => p.isCriticalPath)
      .map(p => p.id);
    
    // Calculate summary statistics
    const totalProgress = phases.length > 0
      ? phases.reduce((sum, p) => sum + p.progress, 0) / phases.length
      : 0;
    
    const completedPhases = phases.filter(p => p.status === 'completed').length;
    const totalMilestones = milestonesResult.rows.length;
    const completedMilestones = milestonesResult.rows.filter(m => m.status === 'completed').length;
    
    // Calculate days remaining and variance
    let daysRemaining = 0;
    let daysVariance = 0;
    
    if (project.expected_completion_date) {
      const today = new Date();
      const endDate = new Date(project.expected_completion_date);
      daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
      
      if (project.baseline_end_date) {
        const baselineEnd = new Date(project.baseline_end_date);
        daysVariance = Math.ceil((endDate.getTime() - baselineEnd.getTime()) / (1000 * 60 * 60 * 24));
      }
    }
    
    return {
      projectId,
      projectName: project.project_name,
      startDate: project.project_start_date,
      endDate: project.expected_completion_date,
      baselineStartDate: project.baseline_start_date,
      baselineEndDate: project.baseline_end_date,
      totalProgress,
      phases,
      criticalPath,
      summary: {
        totalPhases: phases.length,
        completedPhases,
        totalMilestones,
        completedMilestones,
        daysRemaining,
        daysVariance
      }
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// CRITICAL PATH CALCULATION
// ============================================================================

/**
 * Calculate critical path for a project
 * Uses a simplified forward/backward pass algorithm
 */
export async function calculateCriticalPath(
  projectId: string,
  organizationId: string
): Promise<{
  criticalPath: string[];
  phaseAnalysis: {
    phaseId: string;
    phaseName: string;
    earlyStart: number;
    earlyFinish: number;
    lateStart: number;
    lateFinish: number;
    slack: number;
    isCritical: boolean;
  }[];
  projectDuration: number;
}> {
  const client = await pool.connect();
  
  try {
    // Get phases with dependencies
    const phasesQuery = `
      SELECT 
        pp.id,
        pp.name,
        pp.start_date,
        pp.end_date,
        pp.dependency_ids,
        pp.sequence_order
      FROM project_phases pp
      WHERE pp.project_id = $1
      ORDER BY pp.sequence_order
    `;
    
    const phasesResult = await client.query(phasesQuery, [projectId]);
    const phases = phasesResult.rows;
    
    if (phases.length === 0) {
      return {
        criticalPath: [],
        phaseAnalysis: [],
        projectDuration: 0
      };
    }
    
    // Calculate duration for each phase (in days)
    const phaseDurations = new Map<string, number>();
    const phaseMap = new Map<string, any>();
    
    for (const phase of phases) {
      phaseMap.set(phase.id, phase);
      
      if (phase.start_date && phase.end_date) {
        const start = new Date(phase.start_date);
        const end = new Date(phase.end_date);
        const duration = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        phaseDurations.set(phase.id, duration);
      } else {
        phaseDurations.set(phase.id, 30); // Default 30 days if not specified
      }
    }
    
    // Forward pass - calculate Early Start (ES) and Early Finish (EF)
    const earlyStart = new Map<string, number>();
    const earlyFinish = new Map<string, number>();
    
    // Process phases in sequence order
    for (const phase of phases) {
      const dependencies = phase.dependency_ids || [];
      
      // ES = max(EF of all predecessors), or 0 if no predecessors
      let es = 0;
      for (const depId of dependencies) {
        if (earlyFinish.has(depId)) {
          es = Math.max(es, earlyFinish.get(depId)!);
        }
      }
      
      earlyStart.set(phase.id, es);
      earlyFinish.set(phase.id, es + phaseDurations.get(phase.id)!);
    }
    
    // Project duration is max EF
    const projectDuration = Math.max(...Array.from(earlyFinish.values()));
    
    // Backward pass - calculate Late Start (LS) and Late Finish (LF)
    const lateStart = new Map<string, number>();
    const lateFinish = new Map<string, number>();
    
    // Find phases with no successors (end phases)
    const hasSuccessor = new Set<string>();
    for (const phase of phases) {
      for (const depId of (phase.dependency_ids || [])) {
        hasSuccessor.add(depId);
      }
    }
    
    // Initialize end phases
    for (const phase of phases) {
      if (!hasSuccessor.has(phase.id)) {
        lateFinish.set(phase.id, projectDuration);
        lateStart.set(phase.id, projectDuration - phaseDurations.get(phase.id)!);
      }
    }
    
    // Process phases in reverse order
    const reversedPhases = [...phases].reverse();
    for (const phase of reversedPhases) {
      if (!lateFinish.has(phase.id)) {
        // LF = min(LS of all successors)
        let lf = projectDuration;
        
        for (const other of phases) {
          const deps = other.dependency_ids || [];
          if (deps.includes(phase.id) && lateStart.has(other.id)) {
            lf = Math.min(lf, lateStart.get(other.id)!);
          }
        }
        
        lateFinish.set(phase.id, lf);
        lateStart.set(phase.id, lf - phaseDurations.get(phase.id)!);
      }
    }
    
    // Calculate slack and determine critical path
    const phaseAnalysis: {
      phaseId: string;
      phaseName: string;
      earlyStart: number;
      earlyFinish: number;
      lateStart: number;
      lateFinish: number;
      slack: number;
      isCritical: boolean;
    }[] = [];
    
    const criticalPath: string[] = [];
    
    for (const phase of phases) {
      const es = earlyStart.get(phase.id) || 0;
      const ef = earlyFinish.get(phase.id) || 0;
      const ls = lateStart.get(phase.id) || 0;
      const lf = lateFinish.get(phase.id) || 0;
      const slack = ls - es;
      const isCritical = slack === 0;
      
      if (isCritical) {
        criticalPath.push(phase.id);
      }
      
      phaseAnalysis.push({
        phaseId: phase.id,
        phaseName: phase.name,
        earlyStart: es,
        earlyFinish: ef,
        lateStart: ls,
        lateFinish: lf,
        slack,
        isCritical
      });
    }
    
    // Update phases with critical path info
    const updateQuery = `
      UPDATE project_phases
      SET 
        is_critical_path = $2,
        slack_days = $3
      WHERE id = $1
    `;
    
    for (const analysis of phaseAnalysis) {
      await client.query(updateQuery, [
        analysis.phaseId,
        analysis.isCritical,
        analysis.slack
      ]);
    }
    
    return {
      criticalPath,
      phaseAnalysis,
      projectDuration
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// PHASE DATE MANAGEMENT
// ============================================================================

/**
 * Update phase dates with optional cascade to dependent phases
 */
export async function updatePhaseDates(
  phaseId: string,
  projectId: string,
  organizationId: string,
  input: UpdatePhaseDatesInput
): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verify phase belongs to project
    const verifyQuery = `
      SELECT pp.id, pp.start_date, pp.end_date, pp.dependency_ids
      FROM project_phases pp
      JOIN development_projects dp ON dp.id = pp.project_id
      WHERE pp.id = $1 AND pp.project_id = $2 AND dp.organization_id = $3
    `;
    
    const verifyResult = await client.query(verifyQuery, [phaseId, projectId, organizationId]);
    
    if (verifyResult.rows.length === 0) {
      throw new Error('Phase not found');
    }
    
    const phase = verifyResult.rows[0];
    
    // Calculate date shift
    let dayShift = 0;
    
    if (input.startDate && phase.start_date) {
      const oldStart = new Date(phase.start_date);
      const newStart = new Date(input.startDate);
      dayShift = Math.ceil((newStart.getTime() - oldStart.getTime()) / (1000 * 60 * 60 * 24));
    } else if (input.endDate && phase.end_date) {
      const oldEnd = new Date(phase.end_date);
      const newEnd = new Date(input.endDate);
      dayShift = Math.ceil((newEnd.getTime() - oldEnd.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    // Update the phase
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (input.startDate) {
      updates.push(`start_date = $${paramIndex}`);
      params.push(input.startDate);
      paramIndex++;
    }
    
    if (input.endDate) {
      updates.push(`end_date = $${paramIndex}`);
      params.push(input.endDate);
      paramIndex++;
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(phaseId);
      
      const updateQuery = `
        UPDATE project_phases
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
      `;
      
      await client.query(updateQuery, params);
    }
    
    // Cascade to successors if requested
    if (input.cascadeToSuccessors && dayShift !== 0) {
      await cascadePhaseShift(client, projectId, phaseId, dayShift);
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Cascade date shift to all successor phases
 */
async function cascadePhaseShift(
  client: any,
  projectId: string,
  startPhaseId: string,
  dayShift: number
): Promise<void> {
  // Get all phases that depend on the updated phase (directly or indirectly)
  const allPhasesQuery = `
    SELECT id, start_date, end_date, dependency_ids
    FROM project_phases
    WHERE project_id = $1 AND id != $2
    ORDER BY sequence_order
  `;
  
  const allPhasesResult = await client.query(allPhasesQuery, [projectId, startPhaseId]);
  
  // Find all phases to update (those that depend on startPhaseId, directly or indirectly)
  const toUpdate = new Set<string>();
  const queue = [startPhaseId];
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
    for (const phase of allPhasesResult.rows) {
      const deps = phase.dependency_ids || [];
      if (deps.includes(currentId) && !toUpdate.has(phase.id)) {
        toUpdate.add(phase.id);
        queue.push(phase.id);
      }
    }
  }
  
  // Update each successor phase
  for (const phaseId of toUpdate) {
    const phase = allPhasesResult.rows.find((p: any) => p.id === phaseId);
    if (!phase) continue;
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (phase.start_date) {
      const newStart = new Date(phase.start_date);
      newStart.setDate(newStart.getDate() + dayShift);
      updates.push(`start_date = $${paramIndex}`);
      params.push(newStart.toISOString().split('T')[0]);
      paramIndex++;
    }
    
    if (phase.end_date) {
      const newEnd = new Date(phase.end_date);
      newEnd.setDate(newEnd.getDate() + dayShift);
      updates.push(`end_date = $${paramIndex}`);
      params.push(newEnd.toISOString().split('T')[0]);
      paramIndex++;
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(phaseId);
      
      const updateQuery = `
        UPDATE project_phases
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
      `;
      
      await client.query(updateQuery, params);
    }
  }
  
  // Also update associated milestones
  const milestonesQuery = `
    UPDATE project_milestones
    SET target_date = target_date + INTERVAL '${dayShift} days'
    WHERE phase_id = ANY($1)
  `;
  
  await client.query(milestonesQuery, [Array.from(toUpdate)]);
}

/**
 * Update phase dependencies
 */
export async function updateDependencies(
  projectId: string,
  organizationId: string,
  updates: DependencyUpdate[]
): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verify project access
    const verifyQuery = `
      SELECT id FROM development_projects
      WHERE id = $1 AND organization_id = $2
    `;
    
    const verifyResult = await client.query(verifyQuery, [projectId, organizationId]);
    
    if (verifyResult.rows.length === 0) {
      throw new Error('Project not found');
    }
    
    // Update each phase's dependencies
    for (const update of updates) {
      // Validate no circular dependencies
      if (await wouldCreateCycle(client, projectId, update.phaseId, update.dependencyIds)) {
        throw new Error(`Circular dependency detected for phase ${update.phaseId}`);
      }
      
      const updateQuery = `
        UPDATE project_phases
        SET dependency_ids = $2, updated_at = NOW()
        WHERE id = $1 AND project_id = $3
      `;
      
      await client.query(updateQuery, [update.phaseId, update.dependencyIds, projectId]);
    }
    
    await client.query('COMMIT');
    
    // Recalculate critical path after dependency changes
    await calculateCriticalPath(projectId, organizationId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if adding dependencies would create a cycle
 */
async function wouldCreateCycle(
  client: any,
  projectId: string,
  phaseId: string,
  newDependencyIds: string[]
): Promise<boolean> {
  // Get all phases
  const query = `
    SELECT id, dependency_ids
    FROM project_phases
    WHERE project_id = $1
  `;
  
  const result = await client.query(query, [projectId]);
  
  // Build dependency graph
  const deps = new Map<string, string[]>();
  for (const phase of result.rows) {
    if (phase.id === phaseId) {
      deps.set(phase.id, newDependencyIds);
    } else {
      deps.set(phase.id, phase.dependency_ids || []);
    }
  }
  
  // DFS to detect cycle
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function hasCycle(nodeId: string): boolean {
    if (recursionStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    
    visited.add(nodeId);
    recursionStack.add(nodeId);
    
    const dependencies = deps.get(nodeId) || [];
    for (const depId of dependencies) {
      if (hasCycle(depId)) return true;
    }
    
    recursionStack.delete(nodeId);
    return false;
  }
  
  return hasCycle(phaseId);
}

// ============================================================================
// BASELINES
// ============================================================================

/**
 * Create a new baseline snapshot
 */
export async function createBaseline(
  projectId: string,
  organizationId: string,
  name: string,
  description?: string,
  createdBy?: string
): Promise<Baseline> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get current baseline number
    const countQuery = `
      SELECT COALESCE(MAX(baseline_number), 0) + 1 as next_number
      FROM project_baselines
      WHERE project_id = $1
    `;
    
    const countResult = await client.query(countQuery, [projectId]);
    const baselineNumber = countResult.rows[0].next_number;
    
    // Deactivate current active baseline
    await client.query(`
      UPDATE project_baselines
      SET is_active = false
      WHERE project_id = $1 AND is_active = true
    `, [projectId]);
    
    // Capture phases snapshot
    const phasesQuery = `
      SELECT 
        id, name, sequence_order, start_date, end_date,
        progress_percentage, status, budgeted_cost
      FROM project_phases
      WHERE project_id = $1
      ORDER BY sequence_order
    `;
    
    const phasesResult = await client.query(phasesQuery, [projectId]);
    const phasesSnapshot = phasesResult.rows;
    
    // Capture milestones snapshot
    const milestonesQuery = `
      SELECT 
        id, name, target_date, status, milestone_type, priority
      FROM project_milestones
      WHERE project_id = $1
      ORDER BY target_date
    `;
    
    const milestonesResult = await client.query(milestonesQuery, [projectId]);
    const milestonesSnapshot = milestonesResult.rows;
    
    // Get project budget info
    const projectQuery = `
      SELECT 
        dp.total_project_cost,
        dp.project_start_date,
        dp.expected_completion_date,
        COALESCE(SUM(pc.actual_cost), 0) as actual_cost
      FROM development_projects dp
      LEFT JOIN project_costs pc ON pc.project_id = dp.id
      WHERE dp.id = $1
      GROUP BY dp.id
    `;
    
    const projectResult = await client.query(projectQuery, [projectId]);
    const project = projectResult.rows[0];
    
    const budgetSnapshot = {
      totalBudget: parseFloat(project.total_project_cost) || 0,
      actualCost: parseFloat(project.actual_cost) || 0,
      capturedAt: new Date().toISOString()
    };
    
    // Create baseline
    const insertQuery = `
      INSERT INTO project_baselines (
        project_id, organization_id, name, description, baseline_number,
        phases_snapshot, milestones_snapshot, budget_snapshot,
        total_budget, planned_start_date, planned_end_date,
        total_phases, total_milestones, is_active, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14
      )
      RETURNING *
    `;
    
    const insertResult = await client.query(insertQuery, [
      projectId,
      organizationId,
      name,
      description || null,
      baselineNumber,
      JSON.stringify(phasesSnapshot),
      JSON.stringify(milestonesSnapshot),
      JSON.stringify(budgetSnapshot),
      project.total_project_cost,
      project.project_start_date,
      project.expected_completion_date,
      phasesSnapshot.length,
      milestonesSnapshot.length,
      createdBy || null
    ]);
    
    // Update phases with baseline dates
    for (const phase of phasesSnapshot) {
      await client.query(`
        UPDATE project_phases
        SET baseline_start_date = $2, baseline_end_date = $3
        WHERE id = $1
      `, [phase.id, phase.start_date, phase.end_date]);
    }
    
    // Update milestones with baseline dates
    for (const milestone of milestonesSnapshot) {
      await client.query(`
        UPDATE project_milestones
        SET baseline_date = $2
        WHERE id = $1
      `, [milestone.id, milestone.target_date]);
    }
    
    await client.query('COMMIT');
    
    return mapRowToBaseline(insertResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all baselines for a project
 */
export async function getProjectBaselines(
  projectId: string,
  organizationId: string
): Promise<Baseline[]> {
  const query = `
    SELECT * FROM project_baselines
    WHERE project_id = $1 AND organization_id = $2
    ORDER BY baseline_number DESC
  `;
  
  const result = await pool.query(query, [projectId, organizationId]);
  return result.rows.map(mapRowToBaseline);
}

/**
 * Get a specific baseline
 */
export async function getBaseline(
  baselineId: string,
  organizationId: string
): Promise<Baseline | null> {
  const query = `
    SELECT * FROM project_baselines
    WHERE id = $1 AND organization_id = $2
  `;
  
  const result = await pool.query(query, [baselineId, organizationId]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapRowToBaseline(result.rows[0]);
}

/**
 * Get baseline comparison
 */
export async function getBaselineComparison(
  projectId: string,
  organizationId: string,
  baselineId?: string
): Promise<BaselineComparison | null> {
  const client = await pool.connect();
  
  try {
    // Get baseline (active one if not specified)
    let baselineQuery: string;
    let baselineParams: any[];
    
    if (baselineId) {
      baselineQuery = `
        SELECT * FROM project_baselines
        WHERE id = $1 AND organization_id = $2
      `;
      baselineParams = [baselineId, organizationId];
    } else {
      baselineQuery = `
        SELECT * FROM project_baselines
        WHERE project_id = $1 AND organization_id = $2 AND is_active = true
        LIMIT 1
      `;
      baselineParams = [projectId, organizationId];
    }
    
    const baselineResult = await client.query(baselineQuery, baselineParams);
    
    if (baselineResult.rows.length === 0) {
      return null;
    }
    
    const baseline = mapRowToBaseline(baselineResult.rows[0]);
    
    // Get current project state
    const currentQuery = `
      SELECT 
        dp.project_start_date,
        dp.expected_completion_date,
        dp.total_project_cost,
        COALESCE(SUM(pc.actual_cost), 0) as actual_cost,
        COALESCE(AVG(pp.progress_percentage), 0) as progress
      FROM development_projects dp
      LEFT JOIN project_costs pc ON pc.project_id = dp.id
      LEFT JOIN project_phases pp ON pp.project_id = dp.id
      WHERE dp.id = $1
      GROUP BY dp.id
    `;
    
    const currentResult = await client.query(currentQuery, [projectId]);
    const current = currentResult.rows[0];
    
    // Get current phases for comparison
    const phasesQuery = `
      SELECT 
        id, name, start_date, end_date, progress_percentage,
        baseline_start_date, baseline_end_date
      FROM project_phases
      WHERE project_id = $1
      ORDER BY sequence_order
    `;
    
    const phasesResult = await client.query(phasesQuery, [projectId]);
    
    // Build phase comparisons
    const baselinePhases = baseline.phasesSnapshot as any[];
    const phaseComparisons = phasesResult.rows.map(phase => {
      const baselinePhase = baselinePhases.find(bp => bp.id === phase.id);
      
      const startVariance = phase.start_date && baselinePhase?.start_date
        ? Math.ceil((new Date(phase.start_date).getTime() - new Date(baselinePhase.start_date).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      const endVariance = phase.end_date && baselinePhase?.end_date
        ? Math.ceil((new Date(phase.end_date).getTime() - new Date(baselinePhase.end_date).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      return {
        phaseId: phase.id,
        phaseName: phase.name,
        baselineStart: baselinePhase?.start_date || null,
        baselineEnd: baselinePhase?.end_date || null,
        currentStart: phase.start_date,
        currentEnd: phase.end_date,
        startVariance,
        endVariance,
        baselineProgress: parseFloat(baselinePhase?.progress_percentage || 0),
        currentProgress: parseFloat(phase.progress_percentage) || 0,
        progressVariance: (parseFloat(phase.progress_percentage) || 0) - parseFloat(baselinePhase?.progress_percentage || 0)
      };
    });
    
    // Calculate variances
    const currentStartDate = current.project_start_date ? new Date(current.project_start_date) : null;
    const currentEndDate = current.expected_completion_date ? new Date(current.expected_completion_date) : null;
    const baselineStartDate = baseline.plannedStartDate ? new Date(baseline.plannedStartDate) : null;
    const baselineEndDate = baseline.plannedEndDate ? new Date(baseline.plannedEndDate) : null;
    
    const startDays = currentStartDate && baselineStartDate
      ? Math.ceil((currentStartDate.getTime() - baselineStartDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    const endDays = currentEndDate && baselineEndDate
      ? Math.ceil((currentEndDate.getTime() - baselineEndDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    const currentBudget = parseFloat(current.total_project_cost) || 0;
    const baselineBudget = baseline.totalBudget || 0;
    const budgetVariance = currentBudget - baselineBudget;
    
    return {
      projectId,
      baseline,
      current: {
        startDate: current.project_start_date,
        endDate: current.expected_completion_date,
        totalBudget: currentBudget,
        actualCost: parseFloat(current.actual_cost) || 0,
        progress: parseFloat(current.progress) || 0
      },
      variance: {
        startDays,
        endDays,
        budgetAmount: budgetVariance,
        budgetPercent: baselineBudget > 0 ? (budgetVariance / baselineBudget) * 100 : 0
      },
      phaseComparisons
    };
  } finally {
    client.release();
  }
}

/**
 * Set a baseline as active
 */
export async function setActiveBaseline(
  baselineId: string,
  projectId: string,
  organizationId: string
): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Deactivate all baselines for this project
    await client.query(`
      UPDATE project_baselines
      SET is_active = false
      WHERE project_id = $1
    `, [projectId]);
    
    // Activate the specified baseline
    await client.query(`
      UPDATE project_baselines
      SET is_active = true
      WHERE id = $1 AND organization_id = $2
    `, [baselineId, organizationId]);
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete a baseline
 */
export async function deleteBaseline(
  baselineId: string,
  organizationId: string
): Promise<boolean> {
  const query = `
    DELETE FROM project_baselines
    WHERE id = $1 AND organization_id = $2 AND is_locked = false
    RETURNING id
  `;
  
  const result = await pool.query(query, [baselineId, organizationId]);
  return result.rows.length > 0;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapRowToBaseline(row: any): Baseline {
  return {
    id: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    baselineNumber: row.baseline_number,
    snapshotDate: row.snapshot_date,
    phasesSnapshot: row.phases_snapshot || [],
    milestonesSnapshot: row.milestones_snapshot || [],
    budgetSnapshot: row.budget_snapshot || {},
    totalBudget: parseFloat(row.total_budget) || 0,
    plannedStartDate: row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    totalPhases: row.total_phases,
    totalMilestones: row.total_milestones,
    isActive: row.is_active,
    isLocked: row.is_locked,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    notes: row.notes,
    createdAt: row.created_at
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  // Gantt Data
  getGanttData,
  
  // Critical Path
  calculateCriticalPath,
  
  // Phase Dates
  updatePhaseDates,
  updateDependencies,
  
  // Baselines
  createBaseline,
  getProjectBaselines,
  getBaseline,
  getBaselineComparison,
  setActiveBaseline,
  deleteBaseline
};
