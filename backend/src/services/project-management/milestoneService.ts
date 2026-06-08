/**
 * Milestone Service
 * 
 * Phase 2 Sprint 4: Gantt Chart & Timeline
 * 
 * Provides comprehensive milestone management:
 * - CRUD operations for project milestones
 * - Ghana-specific milestone templates
 * - Milestone notifications and reminders
 * - Dependency tracking
 */

import { pool } from '../../database';
import { QueryResult } from 'pg';
import { BaseService } from '../../../shared-services/base/BaseService';
import { logger } from '../../utils/logger';
import { notify, resolveOrgStaff } from '../../../shared-services/notifications/in-mail';

// ============================================================================
// TYPES
// ============================================================================

export interface Milestone {
  id: string;
  projectId: string;
  phaseId: string | null;
  organizationId: string;
  name: string;
  description: string | null;
  milestoneCode: string | null;
  targetDate: string;
  actualDate: string | null;
  baselineDate: string | null;
  status: MilestoneStatus;
  milestoneType: MilestoneType;
  priority: 'low' | 'normal' | 'high' | 'critical';
  isGhanaSpecific: boolean;
  permitTypeId: string | null;
  reminderDays: number[];
  notifyUsers: string[];
  dependsOnMilestoneIds: string[];
  blocksMilestoneIds: string[];
  notes: string | null;
  attachments: any[];
  metadata: Record<string, any>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MilestoneStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'missed'
  | 'rescheduled'
  | 'blocked';

export type MilestoneType =
  | 'permit'
  | 'inspection'
  | 'payment'
  | 'handover'
  | 'construction'
  | 'legal'
  | 'internal'
  | 'external';

export interface MilestoneTemplate {
  id: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  milestoneType: MilestoneType;
  phaseCode: string | null;
  typicalOffsetDays: number;
  typicalDurationDays: number;
  isGhanaSpecific: boolean;
  permitTypeId: string | null;
  requiredForProjectTypes: string[];
  displayOrder: number;
  icon: string | null;
  color: string | null;
  isActive: boolean;
}

export interface CreateMilestoneInput {
  projectId: string;
  phaseId?: string;
  organizationId: string;
  name: string;
  description?: string;
  milestoneCode?: string;
  targetDate: string;
  baselineDate?: string;
  milestoneType: MilestoneType;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  isGhanaSpecific?: boolean;
  permitTypeId?: string;
  reminderDays?: number[];
  notifyUsers?: string[];
  dependsOnMilestoneIds?: string[];
  notes?: string;
  metadata?: Record<string, any>;
  createdBy?: string;
}

export interface UpdateMilestoneInput {
  name?: string;
  description?: string;
  phaseId?: string | null;
  milestoneCode?: string;
  targetDate?: string;
  actualDate?: string;
  status?: MilestoneStatus;
  milestoneType?: MilestoneType;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  reminderDays?: number[];
  notifyUsers?: string[];
  dependsOnMilestoneIds?: string[];
  notes?: string;
  attachments?: any[];
  metadata?: Record<string, any>;
  updatedBy?: string;
}

export interface MilestoneFilters {
  projectId?: string;
  phaseId?: string;
  organizationId: string;
  statuses?: MilestoneStatus[];
  types?: MilestoneType[];
  priorities?: string[];
  isGhanaSpecific?: boolean;
  dueBefore?: string;
  dueAfter?: string;
  includeCompleted?: boolean;
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new milestone
 */
export async function createMilestone(input: CreateMilestoneInput): Promise<Milestone> {
  const query = `
    INSERT INTO project_milestones (
      project_id, phase_id, organization_id, name, description,
      milestone_code, target_date, baseline_date, milestone_type,
      priority, is_ghana_specific, permit_type_id, reminder_days,
      notify_users, depends_on_milestone_ids, notes, metadata, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
    )
    RETURNING *
  `;
  
  const params = [
    input.projectId,
    input.phaseId || null,
    input.organizationId,
    input.name,
    input.description || null,
    input.milestoneCode || null,
    input.targetDate,
    input.baselineDate || input.targetDate, // Set baseline to target if not provided
    input.milestoneType,
    input.priority || 'normal',
    input.isGhanaSpecific || false,
    input.permitTypeId || null,
    input.reminderDays || [7, 3, 1],
    input.notifyUsers || [],
    input.dependsOnMilestoneIds || [],
    input.notes || null,
    JSON.stringify(input.metadata || {}),
    input.createdBy || null
  ];
  
  const result = await pool.query(query, params);
  return mapRowToMilestone(result.rows[0]);
}

/**
 * Get a milestone by ID
 */
export async function getMilestoneById(
  milestoneId: string,
  organizationId: string
): Promise<Milestone | null> {
  const query = `
    SELECT * FROM project_milestones
    WHERE id = $1 AND organization_id = $2
  `;
  
  const result = await pool.query(query, [milestoneId, organizationId]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapRowToMilestone(result.rows[0]);
}

/**
 * Update a milestone
 */
export async function updateMilestone(
  milestoneId: string,
  organizationId: string,
  input: UpdateMilestoneInput
): Promise<Milestone | null> {
  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;
  
  // Build dynamic update query
  const fieldMappings: Record<string, string> = {
    name: 'name',
    description: 'description',
    phaseId: 'phase_id',
    milestoneCode: 'milestone_code',
    targetDate: 'target_date',
    actualDate: 'actual_date',
    status: 'status',
    milestoneType: 'milestone_type',
    priority: 'priority',
    reminderDays: 'reminder_days',
    notifyUsers: 'notify_users',
    dependsOnMilestoneIds: 'depends_on_milestone_ids',
    notes: 'notes',
    attachments: 'attachments',
    metadata: 'metadata',
    updatedBy: 'updated_by'
  };
  
  for (const [key, column] of Object.entries(fieldMappings)) {
    if (key in input && (input as any)[key] !== undefined) {
      let value = (input as any)[key];
      
      // Handle JSON fields
      if (key === 'attachments' || key === 'metadata') {
        value = JSON.stringify(value);
      }
      
      updates.push(`${column} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }
  
  if (updates.length === 0) {
    return getMilestoneById(milestoneId, organizationId);
  }
  
  // Add updated_at
  updates.push(`updated_at = NOW()`);
  
  // Add WHERE clause params
  params.push(milestoneId);
  params.push(organizationId);
  
  const query = `
    UPDATE project_milestones
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
    RETURNING *
  `;
  
  const result = await pool.query(query, params);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapRowToMilestone(result.rows[0]);
}

/**
 * Delete a milestone
 */
export async function deleteMilestone(
  milestoneId: string,
  organizationId: string
): Promise<boolean> {
  const query = `
    DELETE FROM project_milestones
    WHERE id = $1 AND organization_id = $2
    RETURNING id
  `;
  
  const result = await pool.query(query, [milestoneId, organizationId]);
  return result.rows.length > 0;
}

/**
 * List milestones with filters
 */
export async function listMilestones(
  filters: MilestoneFilters
): Promise<Milestone[]> {
  const conditions: string[] = ['pm.organization_id = $1'];
  const params: any[] = [filters.organizationId];
  let paramIndex = 2;
  
  if (filters.projectId) {
    conditions.push(`pm.project_id = $${paramIndex}`);
    params.push(filters.projectId);
    paramIndex++;
  }
  
  if (filters.phaseId) {
    conditions.push(`pm.phase_id = $${paramIndex}`);
    params.push(filters.phaseId);
    paramIndex++;
  }
  
  if (filters.statuses?.length) {
    conditions.push(`pm.status = ANY($${paramIndex})`);
    params.push(filters.statuses);
    paramIndex++;
  } else if (!filters.includeCompleted) {
    conditions.push(`pm.status != 'completed'`);
  }
  
  if (filters.types?.length) {
    conditions.push(`pm.milestone_type = ANY($${paramIndex})`);
    params.push(filters.types);
    paramIndex++;
  }
  
  if (filters.priorities?.length) {
    conditions.push(`pm.priority = ANY($${paramIndex})`);
    params.push(filters.priorities);
    paramIndex++;
  }
  
  if (filters.isGhanaSpecific !== undefined) {
    conditions.push(`pm.is_ghana_specific = $${paramIndex}`);
    params.push(filters.isGhanaSpecific);
    paramIndex++;
  }
  
  if (filters.dueBefore) {
    conditions.push(`pm.target_date <= $${paramIndex}`);
    params.push(filters.dueBefore);
    paramIndex++;
  }
  
  if (filters.dueAfter) {
    conditions.push(`pm.target_date >= $${paramIndex}`);
    params.push(filters.dueAfter);
    paramIndex++;
  }
  
  const query = `
    SELECT pm.*, dp.project_name, pp.name as phase_name
    FROM project_milestones pm
    LEFT JOIN development_projects dp ON dp.id = pm.project_id
    LEFT JOIN project_phases pp ON pp.id = pm.phase_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY pm.target_date ASC, 
      CASE pm.priority 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'normal' THEN 3 
        ELSE 4 
      END
  `;
  
  const result = await pool.query(query, params);
  return result.rows.map(mapRowToMilestone);
}

/**
 * Get milestones for a specific project
 */
export async function getProjectMilestones(
  projectId: string,
  organizationId: string,
  options?: {
    includeCompleted?: boolean;
    phaseId?: string;
    limit?: number;
  }
): Promise<Milestone[]> {
  return listMilestones({
    projectId,
    organizationId,
    phaseId: options?.phaseId,
    includeCompleted: options?.includeCompleted,
  });
}

// ============================================================================
// STATUS OPERATIONS
// ============================================================================

/**
 * Mark milestone as completed
 */
export async function completeMilestone(
  milestoneId: string,
  organizationId: string,
  actualDate?: string,
  updatedBy?: string
): Promise<Milestone | null> {
  const query = `
    UPDATE project_milestones
    SET 
      status = 'completed',
      actual_date = $3,
      updated_at = NOW(),
      updated_by = $4
    WHERE id = $1 AND organization_id = $2
    RETURNING *
  `;
  
  const result = await pool.query(query, [
    milestoneId,
    organizationId,
    actualDate || new Date().toISOString().split('T')[0],
    updatedBy || null
  ]);
  
  if (result.rows.length === 0) {
    return null;
  }

  const milestone = mapRowToMilestone(result.rows[0]);

  // Notify org staff that a project milestone has been completed
  try {
    const staff = (await resolveOrgStaff(organizationId)).filter((s) => s.userId !== updatedBy);
    if (staff.length) {
      await notify({
        recipients: staff,
        category: 'project',
        type: 'milestone.completed',
        title: 'Project milestone completed',
        body: `Milestone "${milestone.name}" has been marked complete.`,
        priority: milestone.priority === 'critical' || milestone.priority === 'high' ? 'high' : 'normal',
        organizationId,
        sourceType: 'milestone',
        sourceId: milestone.id,
        sourceUrl: `/dashboard/projects/${milestone.projectId}`,
        channels: { inApp: true },
      });
    }
  } catch (notifyError: any) {
    logger.warn('Failed to notify staff of milestone completion', { milestoneId, error: notifyError.message });
  }

  return milestone;
}

/**
 * Reschedule a milestone
 */
export async function rescheduleMilestone(
  milestoneId: string,
  organizationId: string,
  newTargetDate: string,
  reason?: string,
  updatedBy?: string
): Promise<Milestone | null> {
  const query = `
    UPDATE project_milestones
    SET 
      status = 'rescheduled',
      target_date = $3,
      notes = CASE 
        WHEN $4 IS NOT NULL THEN COALESCE(notes, '') || E'\n[Rescheduled] ' || $4
        ELSE notes
      END,
      updated_at = NOW(),
      updated_by = $5
    WHERE id = $1 AND organization_id = $2
    RETURNING *
  `;
  
  const result = await pool.query(query, [
    milestoneId,
    organizationId,
    newTargetDate,
    reason || null,
    updatedBy || null
  ]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapRowToMilestone(result.rows[0]);
}

/**
 * Mark milestone as blocked
 */
export async function blockMilestone(
  milestoneId: string,
  organizationId: string,
  reason: string,
  updatedBy?: string
): Promise<Milestone | null> {
  return updateMilestone(milestoneId, organizationId, {
    status: 'blocked',
    notes: `[Blocked] ${reason}`,
    updatedBy
  });
}

/**
 * Start working on a milestone
 */
export async function startMilestone(
  milestoneId: string,
  organizationId: string,
  updatedBy?: string
): Promise<Milestone | null> {
  return updateMilestone(milestoneId, organizationId, {
    status: 'in_progress',
    updatedBy
  });
}

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * Get milestone templates
 */
export async function getMilestoneTemplates(
  organizationId?: string,
  options?: {
    projectType?: string;
    ghanaSpecificOnly?: boolean;
    milestoneType?: MilestoneType;
  }
): Promise<MilestoneTemplate[]> {
  const conditions: string[] = ['is_active = true'];
  const params: any[] = [];
  let paramIndex = 1;
  
  // Include system templates (null org) and org-specific templates
  if (organizationId) {
    conditions.push(`(organization_id IS NULL OR organization_id = $${paramIndex})`);
    params.push(organizationId);
    paramIndex++;
  } else {
    conditions.push('organization_id IS NULL');
  }
  
  if (options?.projectType) {
    conditions.push(`$${paramIndex} = ANY(required_for_project_types) OR required_for_project_types = '{}'`);
    params.push(options.projectType);
    paramIndex++;
  }
  
  if (options?.ghanaSpecificOnly) {
    conditions.push('is_ghana_specific = true');
  }
  
  if (options?.milestoneType) {
    conditions.push(`milestone_type = $${paramIndex}`);
    params.push(options.milestoneType);
    paramIndex++;
  }
  
  const query = `
    SELECT * FROM milestone_templates
    WHERE ${conditions.join(' AND ')}
    ORDER BY display_order ASC
  `;
  
  const result = await pool.query(query, params);
  
  return result.rows.map(row => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    milestoneType: row.milestone_type,
    phaseCode: row.phase_code,
    typicalOffsetDays: row.typical_offset_days,
    typicalDurationDays: row.typical_duration_days,
    isGhanaSpecific: row.is_ghana_specific,
    permitTypeId: row.permit_type_id,
    requiredForProjectTypes: row.required_for_project_types || [],
    displayOrder: row.display_order,
    icon: row.icon,
    color: row.color,
    isActive: row.is_active
  }));
}

/**
 * Apply Ghana milestone templates to a project
 */
export async function applyGhanaMilestoneTemplates(
  projectId: string,
  organizationId: string,
  projectType: string,
  projectStartDate: string,
  createdBy?: string
): Promise<Milestone[]> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get applicable templates
    const templates = await getMilestoneTemplates(organizationId, {
      projectType,
      ghanaSpecificOnly: true
    });
    
    // Get project phases to map milestones
    const phasesQuery = `
      SELECT id, phase_code, start_date
      FROM project_phases
      WHERE project_id = $1
      ORDER BY sequence_order
    `;
    const phasesResult = await client.query(phasesQuery, [projectId]);
    const phases = new Map(phasesResult.rows.map(p => [p.phase_code, p]));
    
    const createdMilestones: Milestone[] = [];
    const startDate = new Date(projectStartDate);
    
    for (const template of templates) {
      // Calculate target date based on phase or project start
      let targetDate: Date;
      let phaseId: string | null = null;
      
      if (template.phaseCode && phases.has(template.phaseCode)) {
        const phase = phases.get(template.phaseCode);
        phaseId = phase.id;
        targetDate = phase.start_date 
          ? new Date(phase.start_date)
          : new Date(startDate);
        targetDate.setDate(targetDate.getDate() + template.typicalOffsetDays);
      } else {
        targetDate = new Date(startDate);
        targetDate.setDate(targetDate.getDate() + template.typicalOffsetDays);
      }
      
      const insertQuery = `
        INSERT INTO project_milestones (
          project_id, phase_id, organization_id, name, description,
          milestone_code, target_date, baseline_date, milestone_type,
          priority, is_ghana_specific, permit_type_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      
      const milestoneCode = template.phaseCode 
        ? `${template.phaseCode.toUpperCase()}-${template.displayOrder.toString().padStart(2, '0')}`
        : `GH-${template.displayOrder.toString().padStart(2, '0')}`;
      
      const result = await client.query(insertQuery, [
        projectId,
        phaseId,
        organizationId,
        template.name,
        template.description,
        milestoneCode,
        targetDate.toISOString().split('T')[0],
        template.milestoneType,
        'normal',
        true,
        template.permitTypeId,
        createdBy
      ]);
      
      createdMilestones.push(mapRowToMilestone(result.rows[0]));
    }
    
    await client.query('COMMIT');
    return createdMilestones;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create a custom milestone template
 */
export async function createMilestoneTemplate(
  template: Omit<MilestoneTemplate, 'id'>
): Promise<MilestoneTemplate> {
  const query = `
    INSERT INTO milestone_templates (
      organization_id, name, description, milestone_type,
      phase_code, typical_offset_days, typical_duration_days,
      is_ghana_specific, permit_type_id, required_for_project_types,
      display_order, icon, color
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `;
  
  const result = await pool.query(query, [
    template.organizationId,
    template.name,
    template.description,
    template.milestoneType,
    template.phaseCode,
    template.typicalOffsetDays,
    template.typicalDurationDays,
    template.isGhanaSpecific,
    template.permitTypeId,
    template.requiredForProjectTypes,
    template.displayOrder,
    template.icon,
    template.color
  ]);
  
  const row = result.rows[0];
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    milestoneType: row.milestone_type,
    phaseCode: row.phase_code,
    typicalOffsetDays: row.typical_offset_days,
    typicalDurationDays: row.typical_duration_days,
    isGhanaSpecific: row.is_ghana_specific,
    permitTypeId: row.permit_type_id,
    requiredForProjectTypes: row.required_for_project_types || [],
    displayOrder: row.display_order,
    icon: row.icon,
    color: row.color,
    isActive: row.is_active
  };
}

// ============================================================================
// DEPENDENCIES
// ============================================================================

/**
 * Add dependency between milestones
 */
export async function addMilestoneDependency(
  milestoneId: string,
  dependsOnId: string,
  organizationId: string
): Promise<void> {
  const query = `
    UPDATE project_milestones
    SET depends_on_milestone_ids = array_append(depends_on_milestone_ids, $2::uuid)
    WHERE id = $1 AND organization_id = $3
      AND NOT ($2::uuid = ANY(depends_on_milestone_ids))
  `;
  
  await pool.query(query, [milestoneId, dependsOnId, organizationId]);
  
  // Also update the blocks array on the dependency
  const blocksQuery = `
    UPDATE project_milestones
    SET blocks_milestone_ids = array_append(blocks_milestone_ids, $1::uuid)
    WHERE id = $2 AND organization_id = $3
      AND NOT ($1::uuid = ANY(blocks_milestone_ids))
  `;
  
  await pool.query(blocksQuery, [milestoneId, dependsOnId, organizationId]);
}

/**
 * Remove dependency between milestones
 */
export async function removeMilestoneDependency(
  milestoneId: string,
  dependsOnId: string,
  organizationId: string
): Promise<void> {
  const query = `
    UPDATE project_milestones
    SET depends_on_milestone_ids = array_remove(depends_on_milestone_ids, $2::uuid)
    WHERE id = $1 AND organization_id = $3
  `;
  
  await pool.query(query, [milestoneId, dependsOnId, organizationId]);
  
  const blocksQuery = `
    UPDATE project_milestones
    SET blocks_milestone_ids = array_remove(blocks_milestone_ids, $1::uuid)
    WHERE id = $2 AND organization_id = $3
  `;
  
  await pool.query(blocksQuery, [milestoneId, dependsOnId, organizationId]);
}

/**
 * Get milestone dependencies (what this milestone depends on)
 */
export async function getMilestoneDependencies(
  milestoneId: string,
  organizationId: string
): Promise<Milestone[]> {
  const query = `
    SELECT pm.*
    FROM project_milestones pm
    WHERE pm.id = ANY(
      SELECT unnest(depends_on_milestone_ids)
      FROM project_milestones
      WHERE id = $1 AND organization_id = $2
    )
    ORDER BY pm.target_date ASC
  `;
  
  const result = await pool.query(query, [milestoneId, organizationId]);
  return result.rows.map(mapRowToMilestone);
}

/**
 * Get milestones blocked by this milestone
 */
export async function getBlockedMilestones(
  milestoneId: string,
  organizationId: string
): Promise<Milestone[]> {
  const query = `
    SELECT pm.*
    FROM project_milestones pm
    WHERE $1::uuid = ANY(pm.depends_on_milestone_ids)
      AND pm.organization_id = $2
    ORDER BY pm.target_date ASC
  `;
  
  const result = await pool.query(query, [milestoneId, organizationId]);
  return result.rows.map(mapRowToMilestone);
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get milestone statistics for a project
 */
export async function getMilestoneStats(
  projectId: string,
  organizationId: string
): Promise<{
  total: number;
  byStatus: Record<MilestoneStatus, number>;
  byType: Record<MilestoneType, number>;
  upcoming: number;
  overdue: number;
  completedOnTime: number;
  completedLate: number;
  averageDelay: number;
}> {
  const query = `
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'missed') as missed,
      COUNT(*) FILTER (WHERE status = 'rescheduled') as rescheduled,
      COUNT(*) FILTER (WHERE status = 'blocked') as blocked,
      COUNT(*) FILTER (WHERE milestone_type = 'permit') as type_permit,
      COUNT(*) FILTER (WHERE milestone_type = 'inspection') as type_inspection,
      COUNT(*) FILTER (WHERE milestone_type = 'payment') as type_payment,
      COUNT(*) FILTER (WHERE milestone_type = 'handover') as type_handover,
      COUNT(*) FILTER (WHERE milestone_type = 'construction') as type_construction,
      COUNT(*) FILTER (WHERE milestone_type = 'legal') as type_legal,
      COUNT(*) FILTER (WHERE milestone_type = 'internal') as type_internal,
      COUNT(*) FILTER (WHERE milestone_type = 'external') as type_external,
      COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND target_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as upcoming,
      COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND target_date < CURRENT_DATE) as overdue,
      COUNT(*) FILTER (WHERE status = 'completed' AND actual_date <= target_date) as completed_on_time,
      COUNT(*) FILTER (WHERE status = 'completed' AND actual_date > target_date) as completed_late,
      COALESCE(AVG(actual_date - target_date) FILTER (WHERE status = 'completed' AND actual_date IS NOT NULL), 0) as average_delay
    FROM project_milestones
    WHERE project_id = $1 AND organization_id = $2
  `;
  
  const result = await pool.query(query, [projectId, organizationId]);
  const row = result.rows[0];
  
  return {
    total: parseInt(row.total) || 0,
    byStatus: {
      pending: parseInt(row.pending) || 0,
      in_progress: parseInt(row.in_progress) || 0,
      completed: parseInt(row.completed) || 0,
      missed: parseInt(row.missed) || 0,
      rescheduled: parseInt(row.rescheduled) || 0,
      blocked: parseInt(row.blocked) || 0
    },
    byType: {
      permit: parseInt(row.type_permit) || 0,
      inspection: parseInt(row.type_inspection) || 0,
      payment: parseInt(row.type_payment) || 0,
      handover: parseInt(row.type_handover) || 0,
      construction: parseInt(row.type_construction) || 0,
      legal: parseInt(row.type_legal) || 0,
      internal: parseInt(row.type_internal) || 0,
      external: parseInt(row.type_external) || 0
    },
    upcoming: parseInt(row.upcoming) || 0,
    overdue: parseInt(row.overdue) || 0,
    completedOnTime: parseInt(row.completed_on_time) || 0,
    completedLate: parseInt(row.completed_late) || 0,
    averageDelay: parseFloat(row.average_delay) || 0
  };
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk update milestone statuses
 */
export async function bulkUpdateMilestoneStatus(
  milestoneIds: string[],
  organizationId: string,
  status: MilestoneStatus,
  updatedBy?: string
): Promise<number> {
  const query = `
    UPDATE project_milestones
    SET 
      status = $3,
      updated_at = NOW(),
      updated_by = $4,
      actual_date = CASE WHEN $3 = 'completed' THEN CURRENT_DATE ELSE actual_date END
    WHERE id = ANY($1) AND organization_id = $2
  `;
  
  const result = await pool.query(query, [milestoneIds, organizationId, status, updatedBy]);
  return result.rowCount || 0;
}

/**
 * Delete multiple milestones
 */
export async function bulkDeleteMilestones(
  milestoneIds: string[],
  organizationId: string
): Promise<number> {
  const query = `
    DELETE FROM project_milestones
    WHERE id = ANY($1) AND organization_id = $2
  `;
  
  const result = await pool.query(query, [milestoneIds, organizationId]);
  return result.rowCount || 0;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapRowToMilestone(row: any): Milestone & { due_date?: string; phase_name?: string } {
  return {
    id: row.id,
    projectId: row.project_id,
    phaseId: row.phase_id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    milestoneCode: row.milestone_code,
    targetDate: row.target_date,
    due_date: row.target_date,  // Alias for frontend compatibility
    actualDate: row.actual_date,
    baselineDate: row.baseline_date,
    status: row.status,
    milestoneType: row.milestone_type,
    priority: row.priority,
    isGhanaSpecific: row.is_ghana_specific,
    permitTypeId: row.permit_type_id,
    reminderDays: row.reminder_days || [],
    notifyUsers: row.notify_users || [],
    dependsOnMilestoneIds: row.depends_on_milestone_ids || [],
    blocksMilestoneIds: row.blocks_milestone_ids || [],
    notes: row.notes,
    attachments: row.attachments || [],
    metadata: row.metadata || {},
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    phase_name: row.phase_name || null  // From JOIN if available
  };
}

// ============================================================================
// LEGACY EXPORT (Deprecated - use milestoneService class instead)
// ============================================================================

// ============================================================================
// SUB-PHASES TYPES
// ============================================================================

export interface MilestoneSubphase {
  id: string;
  milestoneId: string;
  projectId: string;
  organizationId: string;
  name: string;
  description: string | null;
  sequenceOrder: number;
  startDate: string | null;
  endDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  status: SubphaseStatus;
  progressPercentage: number;
  assignedTo: string[];
  assignedTeam: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  dependsOnSubphaseIds: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export type SubphaseStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';

export interface CreateSubphaseInput {
  milestoneId: string;
  projectId: string;
  organizationId: string;
  name: string;
  description?: string;
  sequenceOrder?: number;
  startDate?: string;
  endDate?: string;
  status?: SubphaseStatus;
  progressPercentage?: number;
  assignedTo?: string[];
  assignedTeam?: string;
  estimatedHours?: number;
  dependsOnSubphaseIds?: string[];
  notes?: string;
  createdBy?: string;
}

export interface UpdateSubphaseInput {
  name?: string;
  description?: string;
  sequenceOrder?: number;
  startDate?: string;
  endDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status?: SubphaseStatus;
  progressPercentage?: number;
  assignedTo?: string[];
  assignedTeam?: string;
  estimatedHours?: number;
  actualHours?: number;
  dependsOnSubphaseIds?: string[];
  notes?: string;
  updatedBy?: string;
}

// ============================================================================
// SUB-PHASES CRUD OPERATIONS
// ============================================================================

function mapRowToSubphase(row: any): MilestoneSubphase {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    sequenceOrder: row.sequence_order || 0,
    startDate: row.start_date,
    endDate: row.end_date,
    actualStartDate: row.actual_start_date,
    actualEndDate: row.actual_end_date,
    status: row.status || 'pending',
    progressPercentage: row.progress_percentage || 0,
    assignedTo: row.assigned_to || [],
    assignedTeam: row.assigned_team,
    estimatedHours: row.estimated_hours ? parseFloat(row.estimated_hours) : null,
    actualHours: row.actual_hours ? parseFloat(row.actual_hours) : null,
    dependsOnSubphaseIds: row.depends_on_subphase_ids || [],
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

/**
 * Create a new sub-phase within a milestone
 */
export async function createSubphase(input: CreateSubphaseInput): Promise<MilestoneSubphase> {
  // Get max sequence order for this milestone
  const seqResult = await pool.query(
    'SELECT COALESCE(MAX(sequence_order), 0) + 1 as next_seq FROM milestone_subphases WHERE milestone_id = $1',
    [input.milestoneId]
  );
  const nextSeq = input.sequenceOrder ?? seqResult.rows[0].next_seq;

  const query = `
    INSERT INTO milestone_subphases (
      milestone_id, project_id, organization_id, name, description,
      sequence_order, start_date, end_date, status, progress_percentage,
      assigned_to, assigned_team, estimated_hours, depends_on_subphase_ids,
      notes, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    )
    RETURNING *
  `;

  const params = [
    input.milestoneId,
    input.projectId,
    input.organizationId,
    input.name,
    input.description || null,
    nextSeq,
    input.startDate || null,
    input.endDate || null,
    input.status || 'pending',
    input.progressPercentage || 0,
    input.assignedTo || [],
    input.assignedTeam || null,
    input.estimatedHours || null,
    input.dependsOnSubphaseIds || [],
    input.notes || null,
    input.createdBy || null,
  ];

  const result = await pool.query(query, params);
  return mapRowToSubphase(result.rows[0]);
}

/**
 * Get all sub-phases for a milestone
 */
export async function getSubphasesByMilestone(
  milestoneId: string,
  organizationId: string
): Promise<MilestoneSubphase[]> {
  const query = `
    SELECT * FROM milestone_subphases
    WHERE milestone_id = $1 AND organization_id = $2
    ORDER BY sequence_order ASC, created_at ASC
  `;

  const result = await pool.query(query, [milestoneId, organizationId]);
  return result.rows.map(mapRowToSubphase);
}

/**
 * Get a single sub-phase by ID
 */
export async function getSubphaseById(
  subphaseId: string,
  organizationId: string
): Promise<MilestoneSubphase | null> {
  const query = `
    SELECT * FROM milestone_subphases
    WHERE id = $1 AND organization_id = $2
  `;

  const result = await pool.query(query, [subphaseId, organizationId]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRowToSubphase(result.rows[0]);
}

/**
 * Update a sub-phase
 */
export async function updateSubphase(
  subphaseId: string,
  organizationId: string,
  input: UpdateSubphaseInput
): Promise<MilestoneSubphase | null> {
  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  const fieldMappings: Record<string, string> = {
    name: 'name',
    description: 'description',
    sequenceOrder: 'sequence_order',
    startDate: 'start_date',
    endDate: 'end_date',
    actualStartDate: 'actual_start_date',
    actualEndDate: 'actual_end_date',
    status: 'status',
    progressPercentage: 'progress_percentage',
    assignedTo: 'assigned_to',
    assignedTeam: 'assigned_team',
    estimatedHours: 'estimated_hours',
    actualHours: 'actual_hours',
    dependsOnSubphaseIds: 'depends_on_subphase_ids',
    notes: 'notes',
    updatedBy: 'updated_by',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (input[key as keyof UpdateSubphaseInput] !== undefined) {
      updates.push(`${dbField} = $${paramIndex}`);
      params.push(input[key as keyof UpdateSubphaseInput]);
      paramIndex++;
    }
  }

  if (updates.length === 0) {
    return getSubphaseById(subphaseId, organizationId);
  }

  params.push(subphaseId, organizationId);

  const query = `
    UPDATE milestone_subphases
    SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
    RETURNING *
  `;

  const result = await pool.query(query, params);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRowToSubphase(result.rows[0]);
}

/**
 * Delete a sub-phase
 */
export async function deleteSubphase(
  subphaseId: string,
  organizationId: string
): Promise<boolean> {
  const query = `
    DELETE FROM milestone_subphases
    WHERE id = $1 AND organization_id = $2
  `;

  const result = await pool.query(query, [subphaseId, organizationId]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Reorder sub-phases within a milestone
 */
export async function reorderSubphases(
  milestoneId: string,
  organizationId: string,
  orderedIds: string[]
): Promise<MilestoneSubphase[]> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE milestone_subphases 
         SET sequence_order = $1 
         WHERE id = $2 AND milestone_id = $3 AND organization_id = $4`,
        [i + 1, orderedIds[i], milestoneId, organizationId]
      );
    }

    await client.query('COMMIT');
    
    return getSubphasesByMilestone(milestoneId, organizationId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get milestone with its sub-phases summary
 */
export async function getMilestoneWithSubphases(
  milestoneId: string,
  organizationId: string
): Promise<{ milestone: Milestone; subphases: MilestoneSubphase[]; summary: any } | null> {
  const milestone = await getMilestoneById(milestoneId, organizationId);
  if (!milestone) {
    return null;
  }

  const subphases = await getSubphasesByMilestone(milestoneId, organizationId);

  const summary = {
    totalSubphases: subphases.length,
    completedSubphases: subphases.filter(s => s.status === 'completed').length,
    inProgressSubphases: subphases.filter(s => s.status === 'in_progress').length,
    pendingSubphases: subphases.filter(s => s.status === 'pending').length,
    blockedSubphases: subphases.filter(s => s.status === 'blocked').length,
    avgProgress: subphases.length > 0 
      ? Math.round(subphases.reduce((sum, s) => sum + s.progressPercentage, 0) / subphases.length)
      : 0,
    totalEstimatedHours: subphases.reduce((sum, s) => sum + (s.estimatedHours || 0), 0),
    totalActualHours: subphases.reduce((sum, s) => sum + (s.actualHours || 0), 0),
  };

  return { milestone, subphases, summary };
}

/**
 * @deprecated Use the class-based milestoneService export instead
 */
export const milestoneFunctions = {
  // CRUD
  createMilestone,
  getMilestoneById,
  updateMilestone,
  deleteMilestone,
  listMilestones,
  getProjectMilestones,
  
  // Status
  completeMilestone,
  rescheduleMilestone,
  blockMilestone,
  startMilestone,
  
  // Templates
  getMilestoneTemplates,
  applyGhanaMilestoneTemplates,
  createMilestoneTemplate,
  
  // Dependencies
  addMilestoneDependency,
  removeMilestoneDependency,
  getMilestoneDependencies,
  getBlockedMilestones,
  
  // Statistics
  getMilestoneStats,
  
  // Bulk
  bulkUpdateMilestoneStatus,
  bulkDeleteMilestones,

  // Sub-phases
  createSubphase,
  getSubphasesByMilestone,
  getSubphaseById,
  updateSubphase,
  deleteSubphase,
  reorderSubphases,
  getMilestoneWithSubphases,
};

// ============================================================================
// CLASS-BASED SERVICE (Phase 6 Refactoring)
// Wraps existing functions with BaseService pattern
// ============================================================================

class MilestoneServiceClass extends BaseService {
  constructor() {
    super('MilestoneService');
  }

  protected mapRow(row: any): Milestone {
    return mapRowToMilestone(row);
  }

  // Delegate to existing functions
  create = createMilestone;
  createMilestone = createMilestone;  // Alias for route compatibility
  getMilestoneById = getMilestoneById;
  update = updateMilestone;
  updateMilestone = updateMilestone;  // Alias for route compatibility
  deleteMilestone = deleteMilestone;
  list = listMilestones;
  getByProject = getProjectMilestones;
  getProjectMilestones = getProjectMilestones;
  
  complete = completeMilestone;
  completeMilestone = completeMilestone;  // Alias for route compatibility
  reschedule = rescheduleMilestone;
  rescheduleMilestone = rescheduleMilestone;  // Alias for route compatibility
  block = blockMilestone;
  start = startMilestone;
  
  getTemplates = getMilestoneTemplates;
  applyGhanaTemplates = applyGhanaMilestoneTemplates;
  createTemplate = createMilestoneTemplate;
  
  addDependency = addMilestoneDependency;
  removeDependency = removeMilestoneDependency;
  getDependencies = getMilestoneDependencies;
  getBlocked = getBlockedMilestones;
  
  getStats = getMilestoneStats;
  
  bulkUpdateStatus = bulkUpdateMilestoneStatus;
  bulkDelete = bulkDeleteMilestones;

  // Sub-phases
  createSubphase = createSubphase;
  getSubphasesByMilestone = getSubphasesByMilestone;
  getSubphaseById = getSubphaseById;
  updateSubphase = updateSubphase;
  deleteSubphase = deleteSubphase;
  reorderSubphases = reorderSubphases;
  getMilestoneWithSubphases = getMilestoneWithSubphases;
}

export const milestoneService = new MilestoneServiceClass();
export default milestoneService;
