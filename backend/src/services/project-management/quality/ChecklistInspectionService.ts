/**
 * Checklist Inspection Service
 * 
 * Phase 3.3: Split qualityChecklistsService
 * 
 * Manages checklist instances (inspections):
 * - Instance creation and lifecycle
 * - Status transitions
 * - Workflow management (submit, approve, reject)
 * 
 * @module services/project-management/quality/ChecklistInspectionService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { UUID } from '../types';
import { eventBus } from '../events/EventBus';

// =============================================================================
// TYPES
// =============================================================================

export type ChecklistStatus = 
  | 'draft' 
  | 'in_progress' 
  | 'pending_review' 
  | 'approved' 
  | 'rejected' 
  | 'requires_reinspection' 
  | 'completed' 
  | 'archived';

export type ChecklistItemResult = 'pass' | 'fail' | 'na' | 'pending' | 'deferred';

export interface InstanceCreateInput {
  templateId: UUID;
  organizationId: UUID;
  projectId?: UUID;
  unitId?: UUID;
  locationDescription?: string;
  title?: string;
  description?: string;
  scheduledDate?: string;
  dueDate?: string;
  assignedTo?: UUID;
  assignedBy?: UUID;
  inspectorName?: string;
  inspectorCompany?: string;
  weatherConditions?: any;
  offlineId?: string;
  deviceId?: string;
  createdBy: UUID;
}

export interface InstanceFilters {
  organizationId?: UUID;
  projectId?: UUID;
  unitId?: UUID;
  templateId?: UUID;
  status?: ChecklistStatus | ChecklistStatus[];
  overallResult?: ChecklistItemResult;
  assignedTo?: UUID;
  fromDate?: string;
  toDate?: string;
  overdue?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ChecklistInstance {
  id: UUID;
  templateId: UUID;
  templateName: string;
  organizationId: UUID;
  projectId?: UUID;
  projectName?: string;
  unitId?: UUID;
  unitName?: string;
  title: string;
  status: ChecklistStatus;
  overallResult?: ChecklistItemResult;
  score?: number;
  maxScore?: number;
  passedItems: number;
  failedItems: number;
  totalItems: number;
  scheduledDate?: Date;
  dueDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  assignedTo?: UUID;
  assignedToName?: string;
  inspectorName?: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ChecklistInspectionServiceImpl extends BaseService {
  constructor() {
    super('ChecklistInspectionService');
  }

  // ==========================================================================
  // INSTANCE CRUD
  // ==========================================================================

  async createInstance(input: InstanceCreateInput): Promise<ChecklistInstance> {
    // Get template info
    const templateResult = await this.query(
      `SELECT name, scoring_enabled, max_score FROM qc_checklist_templates WHERE id = $1`,
      [input.templateId]
    );
    
    if (!templateResult.rows.length) {
      throw new Error(`Template not found: ${input.templateId}`);
    }

    const template = templateResult.rows[0];
    const title = input.title || `${template.name} - ${new Date().toLocaleDateString()}`;

    const result = await this.query(
      `INSERT INTO qc_checklist_instances (
         template_id, organization_id, project_id, unit_id,
         location_description, title, description,
         scheduled_date, due_date, assigned_to, assigned_by,
         inspector_name, inspector_company, weather_conditions,
         offline_id, device_id, created_by,
         max_score
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
       )
       RETURNING *`,
      [
        input.templateId, input.organizationId, input.projectId, input.unitId,
        input.locationDescription, title, input.description,
        input.scheduledDate, input.dueDate, input.assignedTo, input.assignedBy,
        input.inspectorName, input.inspectorCompany,
        input.weatherConditions ? JSON.stringify(input.weatherConditions) : null,
        input.offlineId, input.deviceId, input.createdBy,
        template.max_score
      ]
    );

    const instance = this.mapInstanceRow(result.rows[0]);

    // Initialize responses from template items
    await this.initializeResponses(instance.id, input.templateId);

    // Emit event
    eventBus.emit('checklist.instance.created' as any, {
      instanceId: instance.id,
      templateId: input.templateId,
      projectId: input.projectId,
    });

    return instance;
  }

  async getInstanceById(id: UUID): Promise<ChecklistInstance | null> {
    const result = await this.query(
      `SELECT i.*, 
         t.name as template_name,
         p.name as project_name,
         u.unit_number as unit_name,
         usr.name as assigned_to_name
       FROM qc_checklist_instances i
       LEFT JOIN qc_checklist_templates t ON t.id = i.template_id
       LEFT JOIN development_projects p ON p.id = i.project_id
       LEFT JOIN project_units u ON u.id = i.unit_id
       LEFT JOIN users usr ON usr.id = i.assigned_to
       WHERE i.id = $1 AND i.deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ? this.mapInstanceRow(result.rows[0]) : null;
  }

  async getInstanceFull(id: UUID): Promise<any | null> {
    const instance = await this.getInstanceById(id);
    if (!instance) return null;

    const [responses, signatures, activities] = await Promise.all([
      this.query(`SELECT * FROM qc_instance_responses WHERE instance_id = $1`, [id]),
      this.query(`SELECT * FROM qc_instance_signatures WHERE instance_id = $1`, [id]),
      this.query(
        `SELECT * FROM qc_instance_activities WHERE instance_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [id]
      ),
    ]);

    return {
      ...instance,
      responses: responses.rows,
      signatures: signatures.rows,
      activities: activities.rows,
    };
  }

  async getInstances(filters: InstanceFilters): Promise<{ instances: ChecklistInstance[]; total: number }> {
    const conditions: string[] = ['i.deleted_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.organizationId) {
      conditions.push(`i.organization_id = $${paramIndex++}`);
      params.push(filters.organizationId);
    }

    if (filters.projectId) {
      conditions.push(`i.project_id = $${paramIndex++}`);
      params.push(filters.projectId);
    }

    if (filters.unitId) {
      conditions.push(`i.unit_id = $${paramIndex++}`);
      params.push(filters.unitId);
    }

    if (filters.templateId) {
      conditions.push(`i.template_id = $${paramIndex++}`);
      params.push(filters.templateId);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`i.status = ANY($${paramIndex++})`);
        params.push(filters.status);
      } else {
        conditions.push(`i.status = $${paramIndex++}`);
        params.push(filters.status);
      }
    }

    if (filters.overallResult) {
      conditions.push(`i.overall_result = $${paramIndex++}`);
      params.push(filters.overallResult);
    }

    if (filters.assignedTo) {
      conditions.push(`i.assigned_to = $${paramIndex++}`);
      params.push(filters.assignedTo);
    }

    if (filters.fromDate) {
      conditions.push(`i.scheduled_date >= $${paramIndex++}`);
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      conditions.push(`i.scheduled_date <= $${paramIndex++}`);
      params.push(filters.toDate);
    }

    if (filters.overdue) {
      conditions.push(`i.due_date < NOW() AND i.status NOT IN ('completed', 'approved', 'archived')`);
    }

    if (filters.search) {
      conditions.push(`(i.title ILIKE $${paramIndex} OR i.inspector_name ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      this.query(
        `SELECT i.*, 
           t.name as template_name,
           p.name as project_name,
           u.unit_number as unit_name,
           usr.name as assigned_to_name
         FROM qc_checklist_instances i
         LEFT JOIN qc_checklist_templates t ON t.id = i.template_id
         LEFT JOIN development_projects p ON p.id = i.project_id
         LEFT JOIN project_units u ON u.id = i.unit_id
         LEFT JOIN users usr ON usr.id = i.assigned_to
         WHERE ${whereClause}
         ORDER BY i.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, pageSize, offset]
      ),
      this.query(
        `SELECT COUNT(*) as total FROM qc_checklist_instances i WHERE ${whereClause}`,
        params
      ),
    ]);

    return {
      instances: dataResult.rows.map(this.mapInstanceRow),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  // ==========================================================================
  // STATUS MANAGEMENT
  // ==========================================================================

  async startInstance(id: UUID, startedBy: UUID): Promise<ChecklistInstance | null> {
    const result = await this.query(
      `UPDATE qc_checklist_instances
       SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
      [id]
    );

    if (result.rows.length) {
      await this.logActivity(id, 'started', startedBy);
      eventBus.emit('checklist.instance.started' as any, { instanceId: id, startedBy });
    }

    return result.rows[0] ? this.mapInstanceRow(result.rows[0]) : null;
  }

  async updateInstanceStatus(
    id: UUID,
    status: ChecklistStatus,
    changedBy: UUID,
    notes?: string
  ): Promise<ChecklistInstance | null> {
    const updates = ['status = $2', 'updated_at = NOW()'];
    const params: any[] = [id, status];
    let paramIndex = 3;

    if (status === 'completed' || status === 'approved') {
      updates.push(`completed_at = NOW()`);
    }

    if (notes) {
      updates.push(`status_notes = $${paramIndex++}`);
      params.push(notes);
    }

    const result = await this.query(
      `UPDATE qc_checklist_instances SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length) {
      await this.logActivity(id, `status_changed_to_${status}`, changedBy, notes);
      eventBus.emit('checklist.instance.status_changed' as any, { instanceId: id, status, changedBy });
    }

    return result.rows[0] ? this.mapInstanceRow(result.rows[0]) : null;
  }

  async submitForReview(id: UUID, submittedBy: UUID): Promise<ChecklistInstance | null> {
    // Validate all required items are completed
    const validation = await this.validateCompletion(id);
    if (!validation.isComplete) {
      throw new Error(`Cannot submit: ${validation.message}`);
    }

    // Calculate results
    await this.calculateResults(id);

    return this.updateInstanceStatus(id, 'pending_review', submittedBy);
  }

  async approveInstance(id: UUID, approvedBy: UUID, notes?: string): Promise<ChecklistInstance | null> {
    return this.updateInstanceStatus(id, 'approved', approvedBy, notes);
  }

  async rejectInstance(id: UUID, rejectedBy: UUID, notes: string): Promise<ChecklistInstance | null> {
    return this.updateInstanceStatus(id, 'rejected', rejectedBy, notes);
  }

  async requireReinspection(id: UUID, requiredBy: UUID, notes: string): Promise<ChecklistInstance | null> {
    return this.updateInstanceStatus(id, 'requires_reinspection', requiredBy, notes);
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  async getProjectStats(projectId: UUID): Promise<any> {
    const result = await this.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'completed' OR status = 'approved') as completed,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
         COUNT(*) FILTER (WHERE status = 'pending_review') as pending_review,
         COUNT(*) FILTER (WHERE overall_result = 'pass') as passed,
         COUNT(*) FILTER (WHERE overall_result = 'fail') as failed,
         COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed', 'approved')) as overdue,
         AVG(CASE WHEN max_score > 0 THEN (score::decimal / max_score) * 100 ELSE NULL END) as avg_score
       FROM qc_checklist_instances
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      completed: parseInt(row.completed, 10),
      inProgress: parseInt(row.in_progress, 10),
      pendingReview: parseInt(row.pending_review, 10),
      passed: parseInt(row.passed, 10),
      failed: parseInt(row.failed, 10),
      overdue: parseInt(row.overdue, 10),
      averageScore: row.avg_score ? parseFloat(row.avg_score).toFixed(1) : null,
    };
  }

  async getDashboardData(organizationId: UUID, projectId?: UUID): Promise<any> {
    const projectFilter = projectId ? ` AND project_id = '${projectId}'` : '';
    
    const [stats, byStatus, byType, recentActivity] = await Promise.all([
      // Overall stats
      this.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status IN ('completed', 'approved')) as completed,
           COUNT(*) FILTER (WHERE overall_result = 'pass') as passed,
           COUNT(*) FILTER (WHERE overall_result = 'fail') as failed
         FROM qc_checklist_instances
         WHERE organization_id = $1 ${projectFilter} AND deleted_at IS NULL`,
        [organizationId]
      ),
      // By status
      this.query(
        `SELECT status, COUNT(*) as count
         FROM qc_checklist_instances
         WHERE organization_id = $1 ${projectFilter} AND deleted_at IS NULL
         GROUP BY status`,
        [organizationId]
      ),
      // By template type
      this.query(
        `SELECT t.template_type, COUNT(i.id) as count
         FROM qc_checklist_instances i
         JOIN qc_checklist_templates t ON t.id = i.template_id
         WHERE i.organization_id = $1 ${projectFilter} AND i.deleted_at IS NULL
         GROUP BY t.template_type`,
        [organizationId]
      ),
      // Recent activity
      this.query(
        `SELECT i.id, i.title, i.status, i.updated_at, t.name as template_name
         FROM qc_checklist_instances i
         JOIN qc_checklist_templates t ON t.id = i.template_id
         WHERE i.organization_id = $1 ${projectFilter} AND i.deleted_at IS NULL
         ORDER BY i.updated_at DESC
         LIMIT 10`,
        [organizationId]
      ),
    ]);

    const statsRow = stats.rows[0];
    return {
      overview: {
        total: parseInt(statsRow.total, 10),
        completed: parseInt(statsRow.completed, 10),
        passed: parseInt(statsRow.passed, 10),
        failed: parseInt(statsRow.failed, 10),
        passRate: statsRow.total > 0 
          ? ((parseInt(statsRow.passed, 10) / parseInt(statsRow.total, 10)) * 100).toFixed(1)
          : 0,
      },
      byStatus: byStatus.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {}),
      byType: byType.rows.map(row => ({
        type: row.template_type,
        count: parseInt(row.count, 10),
      })),
      recentActivity: recentActivity.rows,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private async initializeResponses(instanceId: UUID, templateId: UUID): Promise<void> {
    await this.query(
      `INSERT INTO qc_instance_responses (instance_id, template_item_id, result)
       SELECT $1, id, 'pending'
       FROM qc_template_items
       WHERE template_id = $2 AND deleted_at IS NULL`,
      [instanceId, templateId]
    );
  }

  private async validateCompletion(id: UUID): Promise<{ isComplete: boolean; message?: string }> {
    const result = await this.query(
      `SELECT 
         COUNT(*) FILTER (WHERE r.result = 'pending' AND ti.is_required = true) as pending_required,
         COUNT(*) FILTER (WHERE r.result = 'pending') as pending_total
       FROM qc_instance_responses r
       JOIN qc_template_items ti ON ti.id = r.template_item_id
       WHERE r.instance_id = $1`,
      [id]
    );

    const { pending_required, pending_total } = result.rows[0];
    
    if (parseInt(pending_required, 10) > 0) {
      return { 
        isComplete: false, 
        message: `${pending_required} required items are not completed` 
      };
    }

    return { isComplete: true };
  }

  private async calculateResults(id: UUID): Promise<void> {
    const result = await this.query(
      `SELECT 
         COUNT(*) FILTER (WHERE result = 'pass') as passed,
         COUNT(*) FILTER (WHERE result = 'fail') as failed,
         COUNT(*) FILTER (WHERE result != 'na') as total,
         SUM(CASE WHEN result = 'pass' THEN ti.points ELSE 0 END) as score
       FROM qc_instance_responses r
       JOIN qc_template_items ti ON ti.id = r.template_item_id
       WHERE r.instance_id = $1`,
      [id]
    );

    const { passed, failed, total, score } = result.rows[0];
    const overallResult = parseInt(failed, 10) > 0 ? 'fail' : 'pass';

    await this.query(
      `UPDATE qc_checklist_instances
       SET passed_items = $2, failed_items = $3, total_items = $4, 
           score = $5, overall_result = $6, updated_at = NOW()
       WHERE id = $1`,
      [id, passed, failed, total, score || 0, overallResult]
    );
  }

  private async logActivity(
    instanceId: UUID,
    action: string,
    performedBy: UUID,
    notes?: string
  ): Promise<void> {
    await this.query(
      `INSERT INTO qc_instance_activities (instance_id, action, performed_by, notes)
       VALUES ($1, $2, $3, $4)`,
      [instanceId, action, performedBy, notes]
    );
  }

  private mapInstanceRow(row: any): ChecklistInstance {
    return {
      id: row.id,
      templateId: row.template_id,
      templateName: row.template_name || '',
      organizationId: row.organization_id,
      projectId: row.project_id,
      projectName: row.project_name,
      unitId: row.unit_id,
      unitName: row.unit_name,
      title: row.title,
      status: row.status,
      overallResult: row.overall_result,
      score: row.score,
      maxScore: row.max_score,
      passedItems: parseInt(row.passed_items, 10) || 0,
      failedItems: parseInt(row.failed_items, 10) || 0,
      totalItems: parseInt(row.total_items, 10) || 0,
      scheduledDate: row.scheduled_date ? new Date(row.scheduled_date) : undefined,
      dueDate: row.due_date ? new Date(row.due_date) : undefined,
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      assignedTo: row.assigned_to,
      assignedToName: row.assigned_to_name,
      inspectorName: row.inspector_name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const checklistInspectionService = new ChecklistInspectionServiceImpl();
