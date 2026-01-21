/**
 * Phase Service
 * Phase 5.8 Week 1 - Project Phase & Milestone Management
 * Competitive Inspiration: Procore, Buildertrend
 * 
 * Handles:
 * - Phase CRUD with ordering
 * - Milestone tracking within phases
 * - Dependency management
 * - Progress tracking with weighted calculations
 * - Gantt chart data preparation
 */

import { pool } from '../../../database';
import { v4 as uuidv4 } from 'uuid';

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

class PhaseService {
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
    
    return {
      phases: ganttPhases,
      start_date: startDate instanceof Date ? startDate.toISOString().split('T')[0] : String(startDate),
      end_date: endDate instanceof Date ? endDate.toISOString().split('T')[0] : String(endDate),
      total_duration_days: totalDays
    };
  }

  // --------------------------------------------------------------------------
  // UPDATE
  // --------------------------------------------------------------------------

  async update(id: string, input: UpdatePhaseInput): Promise<ProjectPhase | null> {
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
    
    return this.mapRow(result.rows[0]);
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
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (let i = 0; i < phaseIds.length; i++) {
        await client.query(
          'UPDATE project_phases SET phase_number = $1, updated_at = NOW() WHERE id = $2 AND project_id = $3',
          [i + 1, phaseIds[i], projectId]
        );
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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

  private mapRow(row: any): ProjectPhase {
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
      
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const phaseService = new PhaseService();
export default phaseService;
