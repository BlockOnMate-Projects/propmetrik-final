/**
 * Project Status Service
 * 
 * Phase 3.11: Split projectService
 * 
 * Status management:
 * - Status transitions
 * - Progress updates
 * - Status validation
 * 
 * @module services/project-management/projects/ProjectStatusService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import {
  DevelopmentProject,
  ProjectStatus,
  STATUS_TRANSITIONS,
  mapRowToProject,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ProjectStatusServiceImpl extends BaseService {
  constructor() {
    super('ProjectStatusService');
  }

  /**
   * Update project status with validation
   */
  async updateStatus(
    id: string,
    organizationId: string,
    newStatus: ProjectStatus,
    updatedBy?: string
  ): Promise<DevelopmentProject | null> {
    // Get current project
    const currentResult = await this.query(
      'SELECT * FROM development_projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [id, organizationId]
    );

    if (!currentResult.rows[0]) {
      return null;
    }

    const current = mapRowToProject(currentResult.rows[0]);
    const currentStatus = current.status;

    // Validate transition
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'. ` +
        `Allowed: ${allowedTransitions.join(', ') || 'none'}`
      );
    }

    // Build update query
    const updates: string[] = ['status = $1', 'updated_at = NOW()'];
    const values: unknown[] = [newStatus];
    let paramIndex = 2;

    // Set actual_start_date when moving to under_construction
    if (newStatus === 'under_construction' && !current.actualStartDate) {
      updates.push(`actual_start_date = $${paramIndex++}`);
      values.push(new Date().toISOString().split('T')[0]);
    }

    // Set actual_completion_date when completing
    if (newStatus === 'completed' && !current.actualCompletionDate) {
      updates.push(`actual_completion_date = $${paramIndex++}`);
      values.push(new Date().toISOString().split('T')[0]);
    }

    // Set progress to 100 when completed
    if (newStatus === 'completed') {
      updates.push(`overall_progress = 100`);
      updates.push(`construction_progress = 100`);
    }

    if (updatedBy) {
      updates.push(`updated_by = $${paramIndex++}`);
      values.push(updatedBy);
    }

    values.push(id);
    values.push(organizationId);

    const result = await this.query(
      `UPDATE development_projects SET ${updates.join(', ')} 
       WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
       RETURNING *`,
      values
    );

    return mapRowToProject(result.rows[0]);
  }

  /**
   * Get allowed status transitions
   */
  getAllowedTransitions(currentStatus: ProjectStatus): ProjectStatus[] {
    return STATUS_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Check if transition is valid
   */
  isValidTransition(from: ProjectStatus, to: ProjectStatus): boolean {
    const allowed = STATUS_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  /**
   * Update project progress
   */
  async updateProgress(
    id: string,
    organizationId: string,
    progress: {
      overallProgress?: number;
      constructionProgress?: number;
      salesProgress?: number;
    },
    updatedBy?: string
  ): Promise<DevelopmentProject | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (progress.overallProgress !== undefined) {
      updates.push(`overall_progress = $${paramIndex++}`);
      values.push(Math.min(100, Math.max(0, progress.overallProgress)));
    }

    if (progress.constructionProgress !== undefined) {
      updates.push(`construction_progress = $${paramIndex++}`);
      values.push(Math.min(100, Math.max(0, progress.constructionProgress)));
    }

    if (progress.salesProgress !== undefined) {
      updates.push(`sales_progress = $${paramIndex++}`);
      values.push(Math.min(100, Math.max(0, progress.salesProgress)));
    }

    if (updates.length === 0) {
      const result = await this.query(
        'SELECT * FROM development_projects WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
      );
      return result.rows[0] ? mapRowToProject(result.rows[0]) : null;
    }

    updates.push(`updated_at = NOW()`);
    if (updatedBy) {
      updates.push(`updated_by = $${paramIndex++}`);
      values.push(updatedBy);
    }

    values.push(id);
    values.push(organizationId);

    const result = await this.query(
      `UPDATE development_projects SET ${updates.join(', ')} 
       WHERE id = $${paramIndex++} AND organization_id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    return result.rows[0] ? mapRowToProject(result.rows[0]) : null;
  }

  /**
   * Recalculate progress from phases
   */
  async recalculateProgress(id: string): Promise<{
    overallProgress: number;
    constructionProgress: number;
  }> {
    const result = await this.query(
      `SELECT 
         COALESCE(AVG(progress), 0) as overall_progress,
         COALESCE(
           AVG(progress) FILTER (WHERE phase_type = 'construction'),
           AVG(progress)
         ) as construction_progress
       FROM project_phases
       WHERE project_id = $1`,
      [id]
    );

    const row = result.rows[0];
    const overallProgress = Math.round(parseFloat(row.overall_progress) || 0);
    const constructionProgress = Math.round(parseFloat(row.construction_progress) || 0);

    // Update project
    await this.query(
      `UPDATE development_projects 
       SET overall_progress = $1, construction_progress = $2, updated_at = NOW()
       WHERE id = $3`,
      [overallProgress, constructionProgress, id]
    );

    return { overallProgress, constructionProgress };
  }

  /**
   * Recalculate sales progress from units
   */
  async recalculateSalesProgress(id: string): Promise<number> {
    const result = await this.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status IN ('sold', 'handed_over')) as sold
       FROM project_units
       WHERE project_id = $1`,
      [id]
    );

    const row = result.rows[0];
    const total = parseInt(row.total) || 0;
    const sold = parseInt(row.sold) || 0;
    const salesProgress = total > 0 ? Math.round((sold / total) * 100) : 0;

    await this.query(
      `UPDATE development_projects 
       SET sales_progress = $1, updated_at = NOW()
       WHERE id = $2`,
      [salesProgress, id]
    );

    return salesProgress;
  }

  /**
   * Put project on hold
   */
  async putOnHold(
    id: string,
    organizationId: string,
    reason?: string,
    updatedBy?: string
  ): Promise<DevelopmentProject | null> {
    const project = await this.updateStatus(id, organizationId, 'on_hold', updatedBy);
    
    if (project && reason) {
      // Store hold reason in metadata
      await this.query(
        `UPDATE development_projects 
         SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{hold_reason}', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify(reason), id]
      );
    }

    return project;
  }

  /**
   * Resume project from hold
   */
  async resumeFromHold(
    id: string,
    organizationId: string,
    resumeToStatus: ProjectStatus,
    updatedBy?: string
  ): Promise<DevelopmentProject | null> {
    // Verify current status is on_hold
    const result = await this.query(
      'SELECT status FROM development_projects WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (!result.rows[0] || result.rows[0].status !== 'on_hold') {
      throw new Error('Project is not on hold');
    }

    return this.updateStatus(id, organizationId, resumeToStatus, updatedBy);
  }

  /**
   * Cancel project
   */
  async cancel(
    id: string,
    organizationId: string,
    reason?: string,
    updatedBy?: string
  ): Promise<DevelopmentProject | null> {
    const project = await this.updateStatus(id, organizationId, 'cancelled', updatedBy);
    
    if (project && reason) {
      await this.query(
        `UPDATE development_projects 
         SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{cancellation_reason}', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify(reason), id]
      );
    }

    return project;
  }

  /**
   * Get project status history
   */
  async getStatusHistory(id: string): Promise<Array<{
    status: ProjectStatus;
    changedAt: string;
    changedBy?: string;
  }>> {
    // This would require an audit table - simplified version
    const result = await this.query(
      `SELECT status, updated_at as changed_at, updated_by as changed_by
       FROM development_projects
       WHERE id = $1`,
      [id]
    );

    if (!result.rows[0]) {
      return [];
    }

    return [{
      status: result.rows[0].status,
      changedAt: result.rows[0].changed_at?.toISOString(),
      changedBy: result.rows[0].changed_by,
    }];
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const projectStatusService = new ProjectStatusServiceImpl();
