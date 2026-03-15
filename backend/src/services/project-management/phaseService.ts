/**
 * Phase Service
 * Phase 5.8 Week 1 - Project Phase & Milestone Management
 * Updated: Enterprise Governance Integration (Phase 1.5)
 * 
 * Handles:
 * - Phase CRUD with ordering
 * - Milestone tracking within phases
 * - Dependency management
 * - Progress tracking with weighted calculations
 * - Gantt chart data preparation
 * - Real-time event emissions for live updates
 * - Phase locking (governance)
 * - Framework integration
 * - Approval requirements for structural changes
 * - Compliance checkpoint validation
 */

import { pool } from '../../database';
import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { BaseService } from '../../../shared-services/base/BaseService';
import { emitPhaseUpdated, emitPhaseRescheduled, emitMilestoneCompleted } from './projectRealtimeEvents';
import { GovernanceError, ValidationError, NotFoundError, AuthorizationError } from './errors';
import { eventBus, ProjectEventType } from './events';
import { AuditAction } from './types';

// ============================================================================
// TYPES
// ============================================================================

export type PhaseStatus = 
  | 'not_started'
  | 'in_progress'
  | 'delayed'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

export interface Milestone {
  id: string;
  name: string;
  target_date: string;
  completed: boolean;
  completed_date?: string;
  notes?: string;
}

export interface ProjectPhase {
  id: string;
  project_id: string;
  organization_id: string;
  phase_number: number;
  name: string;
  description?: string;
  status: PhaseStatus;
  
  // Timeline
  planned_start_date?: Date;
  actual_start_date?: Date;
  planned_end_date?: Date;
  estimated_end_date?: Date;
  actual_end_date?: Date;
  duration_days?: number;
  
  // Progress
  progress: number;
  weight: number;
  
  // Dependencies
  depends_on: string[];
  
  // Budget
  budget: number;
  spent: number;
  committed: number;
  
  // Milestones
  milestones: Milestone[];
  
  // Responsible
  responsible_id?: string;
  responsible_type?: string;
  
  // Display
  color: string;
  
  // Notes
  notes?: string;
  documents: string[];
  
  // Governance (Phase 1.5)
  is_locked: boolean;
  locked_at?: Date;
  locked_by?: string;
  lock_reason?: string;
  framework_phase_id?: string;
  can_be_modified_by_pm: boolean;
  requires_approval_for_dates: boolean;
  
  // Audit
  created_by?: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePhaseInput {
  project_id: string;
  organization_id: string;
  name: string;
  description?: string;
  
  planned_start_date?: Date;
  planned_end_date?: Date;
  duration_days?: number;
  
  weight?: number;
  depends_on?: string[];
  
  budget?: number;
  
  responsible_id?: string;
  responsible_type?: string;
  
  color?: string;
  
  created_by?: string;
}

export interface UpdatePhaseInput {
  name?: string;
  description?: string;
  status?: PhaseStatus;
  
  planned_start_date?: Date;
  actual_start_date?: Date;
  planned_end_date?: Date;
  estimated_end_date?: Date;
  actual_end_date?: Date;
  duration_days?: number;
  
  progress?: number;
  weight?: number;
  
  depends_on?: string[];
  
  budget?: number;
  spent?: number;
  committed?: number;
  
  responsible_id?: string;
  responsible_type?: string;
  
  color?: string;
  notes?: string;
  documents?: string[];
  
  updated_by?: string;
}

export interface GanttData {
  phases: GanttPhase[];
  milestones?: any[];
  start_date: string;
  end_date: string;
  total_duration_days: number;
}

export interface GanttPhase {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  progress: number;
  status: PhaseStatus;
  color: string;
  dependencies: string[];
  milestones: {
    date: string;
    name: string;
    completed: boolean;
  }[];
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class PhaseService extends BaseService {
  constructor() {
    super('PhaseService');
  }

  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------

  async create(input: CreatePhaseInput): Promise<ProjectPhase> {
    // Get next phase number
    const numberResult = await pool.query(
      'SELECT COALESCE(MAX(phase_number), 0) + 1 as next_number FROM project_phases WHERE project_id = $1',
      [input.project_id]
    );
    const phaseNumber = numberResult.rows[0].next_number;
    
    // Calculate duration if dates provided
    let duration = input.duration_days;
    if (!duration && input.planned_start_date && input.planned_end_date) {
      const start = new Date(input.planned_start_date);
      const end = new Date(input.planned_end_date);
      duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO project_phases (
        id, project_id, organization_id,
        phase_number, name, description,
        planned_start_date, planned_end_date, duration_days,
        weight, depends_on,
        budget,
        responsible_id, responsible_type,
        color,
        created_by
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9,
        $10, $11,
        $12,
        $13, $14,
        $15,
        $16
      ) RETURNING *`,
      [
        id, input.project_id, input.organization_id,
        phaseNumber, input.name, input.description,
        input.planned_start_date, input.planned_end_date, duration,
        input.weight || 1, JSON.stringify(input.depends_on || []),
        input.budget || 0,
        input.responsible_id, input.responsible_type,
        input.color || '#3B82F6',
        input.created_by
      ]
    );
    
    return this.mapRow(result.rows[0]);
  }

  async createBulk(phases: CreatePhaseInput[]): Promise<ProjectPhase[]> {
    const results: ProjectPhase[] = [];
    
    for (const phase of phases) {
      const created = await this.create(phase);
      results.push(created);
    }
    
    return results;
  }

  // --------------------------------------------------------------------------
  // READ
  // --------------------------------------------------------------------------

  async getById(id: string): Promise<ProjectPhase | null> {
    const result = await pool.query(
      'SELECT * FROM project_phases WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  async getByProject(projectId: string): Promise<ProjectPhase[]> {
    const result = await pool.query(
      'SELECT * FROM project_phases WHERE project_id = $1 ORDER BY phase_number ASC',
      [projectId]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }

  async getGanttData(projectId: string): Promise<GanttData> {
    const phases = await this.getByProject(projectId);
    
    if (phases.length === 0) {
      return {
        phases: [],
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        total_duration_days: 0
      };
    }
    
    // Find earliest start and latest end
    let earliestStart: Date | null = null;
    let latestEnd: Date | null = null;
    
    for (const phase of phases) {
      const start = phase.actual_start_date || phase.planned_start_date;
      const end = phase.actual_end_date || phase.estimated_end_date || phase.planned_end_date;
      
      if (start && (!earliestStart || start < earliestStart)) {
        earliestStart = start;
      }
      if (end && (!latestEnd || end > latestEnd)) {
        latestEnd = end;
      }
    }
    
    const startDate = earliestStart || new Date();
    const endDate = latestEnd || new Date();
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const ganttPhases: GanttPhase[] = phases.map(phase => {
      const phaseStart = phase.actual_start_date || phase.planned_start_date || startDate;
      const phaseEnd = phase.actual_end_date || phase.estimated_end_date || phase.planned_end_date || endDate;

      return {
        id: phase.id,
        name: phase.name,
        start_date: phaseStart instanceof Date ? phaseStart.toISOString().split('T')[0] : String(phaseStart),
        end_date: phaseEnd instanceof Date ? phaseEnd.toISOString().split('T')[0] : String(phaseEnd),
        progress: phase.progress,
        status: phase.status,
        color: phase.color,
        dependencies: phase.depends_on,
        milestones: phase.milestones.map(m => ({
          date: m.target_date,
          name: m.name,
          completed: m.completed
        }))
      };
    });

    // Build flat top-level milestones array from both sources:
    // 1) Phase-embedded milestones (JSON array in project_phases)
    // 2) Project-level milestones (project_milestones table)
    const embeddedMilestones = phases.flatMap(phase =>
      phase.milestones.map(m => ({
        id: m.id,
        phaseId: phase.id,
        name: m.name,
        date: m.target_date ? String(m.target_date).split('T')[0] : null,
        status: m.completed ? 'completed' : 'pending',
        isGhanaSpecific: false,
      }))
    );

    let projectMilestones: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, phase_id, name, target_date, status, milestone_type
         FROM project_milestones
         WHERE project_id = $1 AND (status IS NULL OR status != 'deleted')
         ORDER BY target_date ASC NULLS LAST`,
        [projectId]
      );
      projectMilestones = result.rows.map(row => ({
        id: row.id,
        phaseId: row.phase_id || undefined,
        name: row.name,
        date: row.target_date ? new Date(row.target_date).toISOString().split('T')[0] : null,
        status: row.status || 'pending',
        isGhanaSpecific: row.milestone_type === 'ghana_specific',
      }));
    } catch {
      // Non-fatal — use only embedded milestones
    }

    // Merge, deduplicating by id
    const milestoneMap = new Map<string, any>();
    for (const m of [...embeddedMilestones, ...projectMilestones]) {
      if (m.id) milestoneMap.set(m.id, m);
    }
    const allMilestones = Array.from(milestoneMap.values());

    return {
      phases: ganttPhases,
      milestones: allMilestones,
      start_date: startDate instanceof Date ? startDate.toISOString().split('T')[0] : String(startDate),
      end_date: endDate instanceof Date ? endDate.toISOString().split('T')[0] : String(endDate),
      total_duration_days: totalDays
    };
  }

  // --------------------------------------------------------------------------
  // UPDATE
  // --------------------------------------------------------------------------

  async update(id: string, input: UpdatePhaseInput): Promise<ProjectPhase | null> {
    // Get current phase for comparison (for realtime events)
    const currentPhase = await this.getById(id);
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    const updateFields = Object.entries(input).filter(([_, value]) => value !== undefined);
    
    for (const [key, value] of updateFields) {
      if (key === 'depends_on' || key === 'documents') {
        updates.push(`${key} = $${paramIndex}`);
        params.push(JSON.stringify(value));
      } else {
        updates.push(`${key} = $${paramIndex}`);
        params.push(value);
      }
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return this.getById(id);
    }
    
    updates.push(`updated_at = NOW()`);
    params.push(id);
    
    const result = await pool.query(
      `UPDATE project_phases 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const phase = this.mapRow(result.rows[0]);
    
    // Emit realtime event
    if (currentPhase) {
      // Check if this is a reschedule (date change)
      const isReschedule = 
        (input.planned_start_date && String(input.planned_start_date) !== String(currentPhase.planned_start_date)) ||
        (input.planned_end_date && String(input.planned_end_date) !== String(currentPhase.planned_end_date));
      
      if (isReschedule) {
        emitPhaseRescheduled(
          phase.organization_id,
          {
            id: phase.id,
            projectId: phase.project_id,
            name: phase.name,
            oldStartDate: currentPhase.planned_start_date,
            newStartDate: phase.planned_start_date,
            oldEndDate: currentPhase.planned_end_date,
            newEndDate: phase.planned_end_date,
          },
          input.updated_by
        ).catch(() => {});
      } else {
        emitPhaseUpdated(
          phase.organization_id,
          {
            id: phase.id,
            projectId: phase.project_id,
            name: phase.name,
            status: phase.status,
            progress: phase.progress,
            startDate: phase.planned_start_date,
            endDate: phase.planned_end_date,
          },
          input.updated_by
        ).catch(() => {});
      }
    }
    
    return phase;
  }

  async updateProgress(id: string, progress: number, updatedBy?: string): Promise<ProjectPhase | null> {
    const updates: UpdatePhaseInput = { progress, updated_by: updatedBy };
    
    // Auto-update status based on progress
    if (progress > 0 && progress < 100) {
      updates.status = 'in_progress';
      
      // Set actual start date if not set
      const phase = await this.getById(id);
      if (phase && !phase.actual_start_date) {
        updates.actual_start_date = new Date();
      }
    } else if (progress >= 100) {
      updates.status = 'completed';
      updates.actual_end_date = new Date();
    }
    
    return this.update(id, updates);
  }

  async updateStatus(id: string, status: PhaseStatus, updatedBy?: string): Promise<ProjectPhase | null> {
    const updates: UpdatePhaseInput = { status, updated_by: updatedBy };
    
    if (status === 'in_progress') {
      const phase = await this.getById(id);
      if (phase && !phase.actual_start_date) {
        updates.actual_start_date = new Date();
      }
    } else if (status === 'completed') {
      updates.progress = 100;
      updates.actual_end_date = new Date();
    }
    
    return this.update(id, updates);
  }

  async reorderPhases(projectId: string, phaseIds: string[]): Promise<boolean> {
    return this.executeInTransaction(async (client) => {
      for (let i = 0; i < phaseIds.length; i++) {
        await client.query(
          'UPDATE project_phases SET phase_number = $1, updated_at = NOW() WHERE id = $2 AND project_id = $3',
          [i + 1, phaseIds[i], projectId]
        );
      }
      return true;
    });
  }

  // --------------------------------------------------------------------------
  // MILESTONES
  // --------------------------------------------------------------------------

  async addMilestone(phaseId: string, milestone: Omit<Milestone, 'id'>): Promise<ProjectPhase | null> {
    const phase = await this.getById(phaseId);
    if (!phase) return null;
    
    const newMilestone: Milestone = {
      id: uuidv4(),
      ...milestone
    };
    
    const milestones = [...phase.milestones, newMilestone];
    
    const result = await pool.query(
      `UPDATE project_phases SET milestones = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(milestones), phaseId]
    );
    
    return this.mapRow(result.rows[0]);
  }

  async updateMilestone(
    phaseId: string, 
    milestoneId: string, 
    updates: Partial<Milestone>
  ): Promise<ProjectPhase | null> {
    const phase = await this.getById(phaseId);
    if (!phase) return null;
    
    const milestones = phase.milestones.map(m => {
      if (m.id === milestoneId) {
        return { ...m, ...updates };
      }
      return m;
    });
    
    const result = await pool.query(
      `UPDATE project_phases SET milestones = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(milestones), phaseId]
    );
    
    return this.mapRow(result.rows[0]);
  }

  async completeMilestone(phaseId: string, milestoneId: string): Promise<ProjectPhase | null> {
    return this.updateMilestone(phaseId, milestoneId, {
      completed: true,
      completed_date: new Date().toISOString().split('T')[0]
    });
  }

  async deleteMilestone(phaseId: string, milestoneId: string): Promise<ProjectPhase | null> {
    const phase = await this.getById(phaseId);
    if (!phase) return null;
    
    const milestones = phase.milestones.filter(m => m.id !== milestoneId);
    
    const result = await pool.query(
      `UPDATE project_phases SET milestones = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(milestones), phaseId]
    );
    
    return this.mapRow(result.rows[0]);
  }

  // --------------------------------------------------------------------------
  // DELETE
  // --------------------------------------------------------------------------

  async delete(id: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM project_phases WHERE id = $1 RETURNING id',
      [id]
    );
    
    return result.rows.length > 0;
  }

  // --------------------------------------------------------------------------
  // DEPENDENCIES
  // --------------------------------------------------------------------------

  async canStartPhase(phaseId: string): Promise<{ canStart: boolean; blockers: string[] }> {
    const phase = await this.getById(phaseId);
    if (!phase) {
      return { canStart: false, blockers: ['Phase not found'] };
    }
    
    if (phase.depends_on.length === 0) {
      return { canStart: true, blockers: [] };
    }
    
    const blockers: string[] = [];
    
    for (const depId of phase.depends_on) {
      const depPhase = await this.getById(depId);
      if (depPhase && depPhase.status !== 'completed') {
        blockers.push(`Waiting for "${depPhase.name}" to complete`);
      }
    }
    
    return {
      canStart: blockers.length === 0,
      blockers
    };
  }

  async getDependentPhases(phaseId: string): Promise<ProjectPhase[]> {
    const result = await pool.query(
      `SELECT * FROM project_phases WHERE depends_on @> $1`,
      [JSON.stringify([phaseId])]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  protected mapRow(row: any): ProjectPhase {
    return {
      id: row.id,
      project_id: row.project_id,
      organization_id: row.organization_id,
      phase_number: row.phase_number,
      name: row.name,
      description: row.description,
      status: row.status,
      
      planned_start_date: row.planned_start_date,
      actual_start_date: row.actual_start_date,
      planned_end_date: row.planned_end_date,
      estimated_end_date: row.estimated_end_date,
      actual_end_date: row.actual_end_date,
      duration_days: row.duration_days,
      
      progress: parseFloat(row.progress) || 0,
      weight: parseFloat(row.weight) || 1,
      
      depends_on: row.depends_on || [],
      
      budget: parseFloat(row.budget) || 0,
      spent: parseFloat(row.spent) || 0,
      committed: parseFloat(row.committed) || 0,
      
      milestones: row.milestones || [],
      
      responsible_id: row.responsible_id,
      responsible_type: row.responsible_type,
      
      color: row.color || '#3B82F6',
      
      notes: row.notes,
      documents: row.documents || [],
      
      // Governance fields
      is_locked: row.is_locked || false,
      locked_at: row.locked_at,
      locked_by: row.locked_by,
      lock_reason: row.lock_reason,
      framework_phase_id: row.framework_phase_id,
      can_be_modified_by_pm: row.can_be_modified_by_pm ?? true,
      requires_approval_for_dates: row.requires_approval_for_dates ?? false,
      
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  // --------------------------------------------------------------------------
  // GOVERNANCE METHODS (Phase 1.5)
  // --------------------------------------------------------------------------

  /**
   * Lock a phase (Admin only).
   * Locked phases cannot be modified by PMs without approval.
   */
  async lockPhase(
    phaseId: string, 
    reason: string, 
    lockedBy: string
  ): Promise<ProjectPhase> {
    const phase = await this.getById(phaseId);
    if (!phase) {
      throw new NotFoundError(`Phase not found: ${phaseId}`, 'Phase', phaseId);
    }

    if (phase.is_locked) {
      throw new ValidationError(`Phase is already locked`);
    }

    const result = await pool.query(
      `UPDATE project_phases SET
        is_locked = true,
        locked_at = NOW(),
        locked_by = $1,
        lock_reason = $2,
        updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [lockedBy, reason, phaseId]
    );

    // Log to phase_locks audit table
    await pool.query(
      `INSERT INTO pm_phase_locks (phase_id, action, reason, locked_by)
       VALUES ($1, 'lock', $2, $3)`,
      [phaseId, reason, lockedBy]
    );

    // Emit event
    eventBus.emit(ProjectEventType.PHASE_LOCKED, {
      entityType: 'phase',
      entityId: phaseId,
      projectId: phase.project_id,
      organizationId: phase.organization_id,
      userId: lockedBy,
      data: { reason }
    });

    return this.mapRow(result.rows[0]);
  }

  /**
   * Unlock a phase (Admin only, or via approved request).
   */
  async unlockPhase(
    phaseId: string, 
    reason: string, 
    unlockedBy: string,
    approvalRequestId?: string
  ): Promise<ProjectPhase> {
    const phase = await this.getById(phaseId);
    if (!phase) {
      throw new NotFoundError(`Phase not found: ${phaseId}`, 'Phase', phaseId);
    }

    if (!phase.is_locked) {
      throw new ValidationError(`Phase is not locked`);
    }

    const result = await pool.query(
      `UPDATE project_phases SET
        is_locked = false,
        locked_at = NULL,
        locked_by = NULL,
        lock_reason = NULL,
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [phaseId]
    );

    // Log to phase_locks audit table
    await pool.query(
      `INSERT INTO pm_phase_locks (phase_id, action, reason, locked_by, approval_request_id)
       VALUES ($1, 'unlock', $2, $3, $4)`,
      [phaseId, reason, unlockedBy, approvalRequestId || null]
    );

    // Emit event
    eventBus.emit(ProjectEventType.PHASE_UNLOCKED, {
      entityType: 'phase',
      entityId: phaseId,
      projectId: phase.project_id,
      organizationId: phase.organization_id,
      userId: unlockedBy,
      data: { reason, approvalRequestId }
    });

    return this.mapRow(result.rows[0]);
  }

  /**
   * Check if phase can be modified by the given user role.
   * Throws GovernanceError if locked and user is PM.
   */
  async checkModificationPermission(
    phaseId: string, 
    userId: string, 
    userRole: 'admin' | 'project_manager' | 'client'
  ): Promise<void> {
    const phase = await this.getById(phaseId);
    if (!phase) {
      throw new NotFoundError(`Phase not found: ${phaseId}`, 'Phase', phaseId);
    }

    // Admins can always modify
    if (userRole === 'admin') {
      return;
    }

    // Locked phases require admin
    if (phase.is_locked) {
      throw GovernanceError.phaseLocked(phaseId, phase.name);
    }

    // Check if PM can modify this phase
    if (userRole === 'project_manager' && !phase.can_be_modified_by_pm) {
      throw GovernanceError.adminOnlyAction('modify_phase_structure');
    }
  }

  /**
   * Check if phase can be completed (no blocking compliance checkpoints).
   */
  async canCompletePhase(phaseId: string): Promise<{
    canComplete: boolean;
    blockers: string[];
    pendingCheckpoints: any[];
  }> {
    const phase = await this.getById(phaseId);
    if (!phase) {
      return { canComplete: false, blockers: ['Phase not found'], pendingCheckpoints: [] };
    }

    const blockers: string[] = [];
    
    // Check dependencies
    const depResult = await this.canStartPhase(phaseId);
    if (!depResult.canStart) {
      blockers.push(...depResult.blockers);
    }

    // Check for blocking compliance checkpoints
    const checkpointsResult = await pool.query(
      `SELECT * FROM pm_compliance_checkpoints 
       WHERE phase_id = $1 
         AND blocking = true 
         AND status NOT IN ('passed', 'waived')
         AND deleted_at IS NULL`,
      [phaseId]
    );

    const pendingCheckpoints = checkpointsResult.rows;
    
    if (pendingCheckpoints.length > 0) {
      for (const cp of pendingCheckpoints) {
        blockers.push(`Compliance checkpoint pending: ${cp.name} (${cp.checkpoint_type})`);
      }
    }

    // Check for incomplete required milestones
    const incompleteMilestones = phase.milestones.filter(m => !m.completed);
    if (incompleteMilestones.length > 0) {
      blockers.push(`${incompleteMilestones.length} milestone(s) not completed`);
    }

    return {
      canComplete: blockers.length === 0,
      blockers,
      pendingCheckpoints
    };
  }

  /**
   * Complete a phase with governance validation.
   */
  async completePhase(
    phaseId: string, 
    userId: string,
    userRole: 'admin' | 'project_manager' | 'client',
    force: boolean = false
  ): Promise<ProjectPhase> {
    // Check modification permission
    await this.checkModificationPermission(phaseId, userId, userRole);

    // Check if phase can be completed
    const completionCheck = await this.canCompletePhase(phaseId);
    
    if (!completionCheck.canComplete && !force) {
      throw new ValidationError(
        `Cannot complete phase: ${completionCheck.blockers.join('; ')}`,
        { blockers: completionCheck.blockers }
      );
    }

    // Admin can force completion
    if (!completionCheck.canComplete && force && userRole !== 'admin') {
      throw new AuthorizationError('Only admins can force-complete a phase with blockers');
    }

    const result = await this.updateStatus(phaseId, 'completed', userId);
    
    if (!result) {
      throw new NotFoundError(`Phase not found: ${phaseId}`, 'Phase', phaseId);
    }

    // Emit completion event
    eventBus.emit(ProjectEventType.PHASE_COMPLETED, {
      entityType: 'phase',
      entityId: phaseId,
      projectId: result.project_id,
      organizationId: result.organization_id,
      userId,
      data: { 
        name: result.name,
        forced: force && !completionCheck.canComplete 
      }
    });

    return result;
  }

  /**
   * Update phase dates with approval check.
   * If phase requires approval for dates, creates an approval request instead.
   */
  async updateDatesWithGovernance(
    phaseId: string,
    dates: {
      planned_start_date?: Date;
      planned_end_date?: Date;
    },
    userId: string,
    userRole: 'admin' | 'project_manager' | 'client'
  ): Promise<{ updated: boolean; approvalRequired: boolean; phase?: ProjectPhase }> {
    const phase = await this.getById(phaseId);
    if (!phase) {
      throw new NotFoundError(`Phase not found: ${phaseId}`, 'Phase', phaseId);
    }

    // Check modification permission
    await this.checkModificationPermission(phaseId, userId, userRole);

    // Admins can always update directly
    if (userRole === 'admin') {
      const updated = await this.update(phaseId, { ...dates, updated_by: userId });
      return { updated: true, approvalRequired: false, phase: updated || undefined };
    }

    // Check if approval is required
    if (phase.requires_approval_for_dates) {
      // Create approval request (caller should use ApprovalService)
      return { updated: false, approvalRequired: true };
    }

    // Update directly
    const updated = await this.update(phaseId, { ...dates, updated_by: userId });
    return { updated: true, approvalRequired: false, phase: updated || undefined };
  }

  /**
   * Get lock history for a phase.
   */
  async getLockHistory(phaseId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT pl.*, u.name as locked_by_name
       FROM pm_phase_locks pl
       LEFT JOIN users u ON u.id = pl.locked_by
       WHERE pl.phase_id = $1
       ORDER BY pl.locked_at DESC`,
      [phaseId]
    );

    return result.rows;
  }
}

export const phaseService = new PhaseService();
export default phaseService;
