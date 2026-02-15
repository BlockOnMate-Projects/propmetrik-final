/**
 * Workflow Service
 * Phase 5.9: Workflow Automation Engine
 * 
 * SHARED SERVICE: Used across all domains for automation
 * 
 * Handles:
 * - Workflow CRUD operations
 * - Trigger management
 * - Execution orchestration
 * - Variable interpolation
 * - Execution history and analytics
 */

import { pool } from '../../src/database';
import { logger } from '../../src/utils/logger';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================

export type TriggerType =
  | 'deal_stage_changed'
  | 'deal_created'
  | 'deal_updated'
  | 'deal_won'
  | 'deal_lost'
  | 'contact_created'
  | 'contact_updated'
  | 'activity_logged'
  | 'task_completed'
  | 'task_overdue'
  | 'document_signed'
  | 'property_created'
  | 'time_based'
  | 'manual'
  | 'webhook';

export type ActionType =
  | 'create_task'
  | 'send_email'
  | 'send_whatsapp'
  | 'send_sms'
  | 'update_field'
  | 'assign_agent'
  | 'add_note'
  | 'add_tag'
  | 'remove_tag'
  | 'create_activity'
  | 'move_stage'
  | 'webhook'
  | 'wait'
  | 'branch';

export type StepType = 'action' | 'condition' | 'delay' | 'branch';

export type ExecutionStatus = 
  | 'pending' 
  | 'running' 
  | 'waiting' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'skipped';

export type AssignmentMethod = 
  | 'round_robin' 
  | 'load_balanced' 
  | 'random' 
  | 'specific_agent' 
  | 'team_pond';

export interface Workflow {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  folder?: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  entity_type: string;
  is_active: boolean;
  is_template: boolean;
  run_once_per_entity: boolean;
  execution_limit?: number;
  cool_down_minutes: number;
  execution_count: number;
  success_count: number;
  failure_count: number;
  last_executed_at?: Date;
  created_by?: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
  steps?: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  parent_step_id?: string;
  branch_path?: string;
  step_type: StepType;
  action_type?: ActionType;
  action_config: Record<string, any>;
  condition_config?: Record<string, any>;
  delay_config?: Record<string, any>;
  position_x: number;
  position_y: number;
  label?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  trigger_type: TriggerType;
  trigger_data: Record<string, any>;
  status: ExecutionStatus;
  current_step_id?: string;
  completed_steps: any[];
  started_at?: Date;
  completed_at?: Date;
  next_run_at?: Date;
  error_message?: string;
  execution_log: any[];
  context: Record<string, any>;
  retry_count: number;
  max_retries: number;
  triggered_by?: string;
  cancelled_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  steps: any[];
  icon?: string;
  color?: string;
  use_count: number;
  is_featured: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWorkflowInput {
  organization_id: string;
  name: string;
  description?: string;
  folder?: string;
  trigger_type: TriggerType;
  trigger_config?: Record<string, any>;
  entity_type?: string;
  run_once_per_entity?: boolean;
  execution_limit?: number;
  cool_down_minutes?: number;
  steps?: CreateStepInput[];
  created_by?: string;
}

export interface CreateStepInput {
  step_order: number;
  parent_step_id?: string;
  branch_path?: string;
  step_type: StepType;
  action_type?: ActionType;
  action_config?: Record<string, any>;
  condition_config?: Record<string, any>;
  delay_config?: Record<string, any>;
  position_x?: number;
  position_y?: number;
  label?: string;
  notes?: string;
}

export interface TriggerEvent {
  type: TriggerType;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  data: Record<string, any>;
  triggered_by?: string;
}

export interface ExecutionContext {
  entity: Record<string, any>;
  trigger: Record<string, any>;
  deal?: Record<string, any>;
  contact?: Record<string, any>;
  activity?: Record<string, any>;
  organization?: Record<string, any>;
  assigned_agent?: Record<string, any>;
  [key: string]: any;
}

// =====================================================
// WORKFLOW SERVICE
// =====================================================

class WorkflowService {
  private static instance: WorkflowService;

  private constructor() {}

  static getInstance(): WorkflowService {
    if (!WorkflowService.instance) {
      WorkflowService.instance = new WorkflowService();
    }
    return WorkflowService.instance;
  }

  // =====================================================
  // WORKFLOW CRUD
  // =====================================================

  async create(input: CreateWorkflowInput): Promise<Workflow> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const workflowResult = await client.query(`
        INSERT INTO workflows (
          organization_id, name, description, folder,
          trigger_type, trigger_config, entity_type,
          run_once_per_entity, execution_limit, cool_down_minutes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        input.organization_id,
        input.name,
        input.description,
        input.folder,
        input.trigger_type,
        JSON.stringify(input.trigger_config || {}),
        input.entity_type || 'deal',
        input.run_once_per_entity || false,
        input.execution_limit,
        input.cool_down_minutes || 0,
        input.created_by
      ]);
      
      const workflow = this.mapWorkflow(workflowResult.rows[0]);
      
      // Create steps if provided
      if (input.steps && input.steps.length > 0) {
        for (const step of input.steps) {
          await client.query(`
            INSERT INTO workflow_steps (
              workflow_id, step_order, parent_step_id, branch_path,
              step_type, action_type, action_config,
              condition_config, delay_config,
              position_x, position_y, label, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [
            workflow.id,
            step.step_order,
            step.parent_step_id,
            step.branch_path,
            step.step_type,
            step.action_type,
            JSON.stringify(step.action_config || {}),
            step.condition_config ? JSON.stringify(step.condition_config) : null,
            step.delay_config ? JSON.stringify(step.delay_config) : null,
            step.position_x || 0,
            step.position_y || 0,
            step.label,
            step.notes
          ]);
        }
      }
      
      await client.query('COMMIT');
      
      logger.info({ workflowId: workflow.id, name: workflow.name }, 'Workflow created');
      
      return this.getById(workflow.id) as Promise<Workflow>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getById(id: string): Promise<Workflow | null> {
    const result = await pool.query(`
      SELECT * FROM workflows WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const workflow = this.mapWorkflow(result.rows[0]);
    workflow.steps = await this.getSteps(id);
    
    return workflow;
  }

  async getByOrganization(
    organizationId: string,
    options: {
      isActive?: boolean;
      triggerType?: TriggerType;
      folder?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ data: Workflow[]; total: number }> {
    const { isActive, triggerType, folder, page = 1, limit = 50 } = options;
    
    let conditions = ['organization_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [organizationId];
    let paramCount = 1;
    
    if (isActive !== undefined) {
      conditions.push(`is_active = $${++paramCount}`);
      params.push(isActive);
    }
    
    if (triggerType) {
      conditions.push(`trigger_type = $${++paramCount}`);
      params.push(triggerType);
    }
    
    if (folder) {
      conditions.push(`folder = $${++paramCount}`);
      params.push(folder);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Get total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM workflows WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    
    // Get paginated results
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    
    const result = await pool.query(`
      SELECT * FROM workflows
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `, params);
    
    return {
      data: result.rows.map(row => this.mapWorkflow(row)),
      total
    };
  }

  async update(
    id: string,
    updates: Partial<CreateWorkflowInput>
  ): Promise<Workflow | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramCount = 0;
    
    if (updates.name !== undefined) {
      setClauses.push(`name = $${++paramCount}`);
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${++paramCount}`);
      params.push(updates.description);
    }
    if (updates.folder !== undefined) {
      setClauses.push(`folder = $${++paramCount}`);
      params.push(updates.folder);
    }
    if (updates.trigger_type !== undefined) {
      setClauses.push(`trigger_type = $${++paramCount}`);
      params.push(updates.trigger_type);
    }
    if (updates.trigger_config !== undefined) {
      setClauses.push(`trigger_config = $${++paramCount}`);
      params.push(JSON.stringify(updates.trigger_config));
    }
    if (updates.entity_type !== undefined) {
      setClauses.push(`entity_type = $${++paramCount}`);
      params.push(updates.entity_type);
    }
    if (updates.run_once_per_entity !== undefined) {
      setClauses.push(`run_once_per_entity = $${++paramCount}`);
      params.push(updates.run_once_per_entity);
    }
    if (updates.execution_limit !== undefined) {
      setClauses.push(`execution_limit = $${++paramCount}`);
      params.push(updates.execution_limit);
    }
    if (updates.cool_down_minutes !== undefined) {
      setClauses.push(`cool_down_minutes = $${++paramCount}`);
      params.push(updates.cool_down_minutes);
    }
    
    params.push(id);
    
    const result = await pool.query(`
      UPDATE workflows
      SET ${setClauses.join(', ')}
      WHERE id = $${++paramCount} AND deleted_at IS NULL
      RETURNING *
    `, params);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Update steps if provided
    if (updates.steps) {
      await this.updateSteps(id, updates.steps);
    }
    
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await pool.query(`
      UPDATE workflows
      SET deleted_at = NOW(), is_active = false
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    
    return (result.rowCount ?? 0) > 0;
  }

  async activate(id: string): Promise<Workflow | null> {
    const result = await pool.query(`
      UPDATE workflows
      SET is_active = true, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ workflowId: id }, 'Workflow activated');
    return this.getById(id);
  }

  async deactivate(id: string): Promise<Workflow | null> {
    const result = await pool.query(`
      UPDATE workflows
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info({ workflowId: id }, 'Workflow deactivated');
    return this.getById(id);
  }

  // =====================================================
  // STEP MANAGEMENT
  // =====================================================

  async getSteps(workflowId: string): Promise<WorkflowStep[]> {
    const result = await pool.query(`
      SELECT * FROM workflow_steps
      WHERE workflow_id = $1
      ORDER BY step_order
    `, [workflowId]);
    
    return result.rows.map(row => this.mapStep(row));
  }

  async updateSteps(workflowId: string, steps: CreateStepInput[]): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete existing steps
      await client.query('DELETE FROM workflow_steps WHERE workflow_id = $1', [workflowId]);
      
      // Insert new steps
      for (const step of steps) {
        await client.query(`
          INSERT INTO workflow_steps (
            workflow_id, step_order, parent_step_id, branch_path,
            step_type, action_type, action_config,
            condition_config, delay_config,
            position_x, position_y, label, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          workflowId,
          step.step_order,
          step.parent_step_id,
          step.branch_path,
          step.step_type,
          step.action_type,
          JSON.stringify(step.action_config || {}),
          step.condition_config ? JSON.stringify(step.condition_config) : null,
          step.delay_config ? JSON.stringify(step.delay_config) : null,
          step.position_x || 0,
          step.position_y || 0,
          step.label,
          step.notes
        ]);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // TRIGGER MATCHING
  // =====================================================

  async findMatchingWorkflows(event: TriggerEvent): Promise<Workflow[]> {
    const result = await pool.query(`
      SELECT * FROM workflows
      WHERE organization_id = $1
        AND trigger_type = $2
        AND is_active = true
        AND deleted_at IS NULL
    `, [event.organization_id, event.type]);
    
    const workflows: Workflow[] = [];
    
    for (const row of result.rows) {
      const workflow = this.mapWorkflow(row);
      
      // Check trigger config matches
      if (this.matchesTriggerConfig(workflow.trigger_config, event)) {
        // Check run-once and cooldown constraints
        if (await this.canExecute(workflow, event)) {
          workflow.steps = await this.getSteps(workflow.id);
          workflows.push(workflow);
        }
      }
    }
    
    return workflows;
  }

  private matchesTriggerConfig(config: Record<string, any>, event: TriggerEvent): boolean {
    // Empty config means match all
    if (!config || Object.keys(config).length === 0) {
      return true;
    }
    
    // Check specific conditions based on trigger type
    switch (event.type) {
      case 'deal_stage_changed':
        if (config.pipeline_id && event.data.pipeline_id !== config.pipeline_id) {
          return false;
        }
        if (config.from_stage && event.data.from_stage_id !== config.from_stage) {
          return false;
        }
        if (config.to_stage && event.data.to_stage_id !== config.to_stage) {
          return false;
        }
        if (config.to_stage_name && event.data.to_stage_name !== config.to_stage_name) {
          return false;
        }
        break;
        
      case 'activity_logged':
        if (config.activity_type && event.data.activity_type !== config.activity_type) {
          return false;
        }
        break;
        
      case 'deal_created':
      case 'contact_created':
        if (config.source && event.data.source !== config.source) {
          return false;
        }
        break;
    }
    
    return true;
  }

  private async canExecute(workflow: Workflow, event: TriggerEvent): Promise<boolean> {
    // Check execution limit
    if (workflow.execution_limit && workflow.execution_count >= workflow.execution_limit) {
      logger.debug({ workflowId: workflow.id }, 'Workflow execution limit reached');
      return false;
    }
    
    // Check run-once per entity
    if (workflow.run_once_per_entity) {
      const existing = await pool.query(`
        SELECT 1 FROM workflow_entity_runs
        WHERE workflow_id = $1 AND entity_type = $2 AND entity_id = $3
      `, [workflow.id, event.entity_type, event.entity_id]);
      
      if (existing.rows.length > 0) {
        logger.debug({ workflowId: workflow.id, entityId: event.entity_id }, 'Workflow already ran for this entity');
        return false;
      }
    }
    
    // Check cooldown
    if (workflow.cool_down_minutes > 0) {
      const recentRun = await pool.query(`
        SELECT 1 FROM workflow_entity_runs
        WHERE workflow_id = $1 AND entity_type = $2 AND entity_id = $3
          AND last_run_at > NOW() - INTERVAL '1 minute' * $4
      `, [workflow.id, event.entity_type, event.entity_id, workflow.cool_down_minutes]);
      
      if (recentRun.rows.length > 0) {
        logger.debug({ workflowId: workflow.id }, 'Workflow in cooldown period');
        return false;
      }
    }
    
    return true;
  }

  // =====================================================
  // EXECUTION MANAGEMENT
  // =====================================================

  async createExecution(
    workflow: Workflow,
    event: TriggerEvent,
    context: ExecutionContext
  ): Promise<WorkflowExecution> {
    const result = await pool.query(`
      INSERT INTO workflow_executions (
        workflow_id, organization_id,
        entity_type, entity_id,
        trigger_type, trigger_data,
        status, context, triggered_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
      RETURNING *
    `, [
      workflow.id,
      event.organization_id,
      event.entity_type,
      event.entity_id,
      event.type,
      JSON.stringify(event.data),
      JSON.stringify(context),
      event.triggered_by
    ]);
    
    // Track entity run
    await pool.query(`
      INSERT INTO workflow_entity_runs (workflow_id, entity_type, entity_id, last_execution_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (workflow_id, entity_type, entity_id)
      DO UPDATE SET
        last_execution_id = EXCLUDED.last_execution_id,
        last_run_at = NOW(),
        run_count = workflow_entity_runs.run_count + 1
    `, [workflow.id, event.entity_type, event.entity_id, result.rows[0].id]);
    
    return this.mapExecution(result.rows[0]);
  }

  async getExecution(id: string): Promise<WorkflowExecution | null> {
    const result = await pool.query(
      'SELECT * FROM workflow_executions WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapExecution(result.rows[0]);
  }

  async getExecutionHistory(
    organizationId: string,
    options: {
      workflowId?: string;
      entityId?: string;
      status?: ExecutionStatus;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ data: WorkflowExecution[]; total: number }> {
    const { workflowId, entityId, status, page = 1, limit = 50 } = options;
    
    let conditions = ['organization_id = $1'];
    const params: any[] = [organizationId];
    let paramCount = 1;
    
    if (workflowId) {
      conditions.push(`workflow_id = $${++paramCount}`);
      params.push(workflowId);
    }
    if (entityId) {
      conditions.push(`entity_id = $${++paramCount}`);
      params.push(entityId);
    }
    if (status) {
      conditions.push(`status = $${++paramCount}`);
      params.push(status);
    }
    
    const whereClause = conditions.join(' AND ');
    
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM workflow_executions WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    
    const result = await pool.query(`
      SELECT we.*, w.name as workflow_name
      FROM workflow_executions we
      JOIN workflows w ON we.workflow_id = w.id
      WHERE ${whereClause.replace('organization_id', 'we.organization_id')}
      ORDER BY we.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `, params);
    
    return {
      data: result.rows.map(row => ({
        ...this.mapExecution(row),
        workflow_name: row.workflow_name
      })),
      total
    };
  }

  async updateExecutionStatus(
    id: string,
    status: ExecutionStatus,
    updates: {
      current_step_id?: string;
      error_message?: string;
      completed_at?: Date;
      next_run_at?: Date;
      context?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const setClauses = ['status = $2', 'updated_at = NOW()'];
    const params: any[] = [id, status];
    let paramCount = 2;
    
    if (updates.current_step_id !== undefined) {
      setClauses.push(`current_step_id = $${++paramCount}`);
      params.push(updates.current_step_id);
    }
    if (updates.error_message !== undefined) {
      setClauses.push(`error_message = $${++paramCount}`);
      params.push(updates.error_message);
    }
    if (updates.completed_at !== undefined) {
      setClauses.push(`completed_at = $${++paramCount}`);
      params.push(updates.completed_at);
    }
    if (updates.next_run_at !== undefined) {
      setClauses.push(`next_run_at = $${++paramCount}`);
      params.push(updates.next_run_at);
    }
    if (updates.context !== undefined) {
      setClauses.push(`context = $${++paramCount}`);
      params.push(JSON.stringify(updates.context));
    }
    
    await pool.query(`
      UPDATE workflow_executions
      SET ${setClauses.join(', ')}
      WHERE id = $1
    `, params);
  }

  async addExecutionLog(
    executionId: string,
    logEntry: {
      step_id: string;
      action: string;
      status: string;
      result?: any;
      error?: string;
      executed_at: Date;
    }
  ): Promise<void> {
    await pool.query(`
      UPDATE workflow_executions
      SET execution_log = execution_log || $2::jsonb,
          completed_steps = completed_steps || $3::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `, [
      executionId,
      JSON.stringify([logEntry]),
      JSON.stringify([logEntry.step_id])
    ]);
  }

  async cancelExecution(id: string, userId: string): Promise<boolean> {
    const result = await pool.query(`
      UPDATE workflow_executions
      SET status = 'cancelled',
          cancelled_by = $2,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'running', 'waiting')
    `, [id, userId]);
    
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // TEMPLATES
  // =====================================================

  async getTemplates(options: {
    category?: string;
    isFeatured?: boolean;
  } = {}): Promise<WorkflowTemplate[]> {
    let conditions = ['is_active = true'];
    const params: any[] = [];
    let paramCount = 0;
    
    if (options.category) {
      conditions.push(`category = $${++paramCount}`);
      params.push(options.category);
    }
    if (options.isFeatured !== undefined) {
      conditions.push(`is_featured = $${++paramCount}`);
      params.push(options.isFeatured);
    }
    
    const result = await pool.query(`
      SELECT * FROM workflow_templates
      WHERE ${conditions.join(' AND ')}
      ORDER BY is_featured DESC, use_count DESC, name
    `, params);
    
    return result.rows.map(row => this.mapTemplate(row));
  }

  async createFromTemplate(
    templateId: string,
    organizationId: string,
    name: string,
    createdBy: string
  ): Promise<Workflow> {
    const templateResult = await pool.query(
      'SELECT * FROM workflow_templates WHERE id = $1',
      [templateId]
    );
    
    if (templateResult.rows.length === 0) {
      throw new Error('Template not found');
    }
    
    const template = templateResult.rows[0];
    
    // Create workflow from template
    const workflow = await this.create({
      organization_id: organizationId,
      name: name || template.name,
      description: template.description,
      trigger_type: template.trigger_type,
      trigger_config: template.trigger_config,
      steps: template.steps,
      created_by: createdBy
    });
    
    // Increment template use count
    await pool.query(
      'UPDATE workflow_templates SET use_count = use_count + 1 WHERE id = $1',
      [templateId]
    );
    
    return workflow;
  }

  // =====================================================
  // ANALYTICS
  // =====================================================

  async getWorkflowStats(organizationId: string): Promise<{
    total_workflows: number;
    active_workflows: number;
    total_executions: number;
    successful_executions: number;
    failed_executions: number;
    executions_today: number;
    executions_this_week: number;
    top_workflows: { id: string; name: string; executions: number }[];
  }> {
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) as total_workflows,
        COUNT(*) FILTER (WHERE is_active = true AND deleted_at IS NULL) as active_workflows,
        COALESCE(SUM(execution_count), 0) as total_executions,
        COALESCE(SUM(success_count), 0) as successful_executions,
        COALESCE(SUM(failure_count), 0) as failed_executions
      FROM workflows
      WHERE organization_id = $1
    `, [organizationId]);
    
    const recentStats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as this_week
      FROM workflow_executions
      WHERE organization_id = $1
    `, [organizationId]);
    
    const topWorkflows = await pool.query(`
      SELECT id, name, execution_count as executions
      FROM workflows
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY execution_count DESC
      LIMIT 5
    `, [organizationId]);
    
    return {
      total_workflows: parseInt(stats.rows[0].total_workflows) || 0,
      active_workflows: parseInt(stats.rows[0].active_workflows) || 0,
      total_executions: parseInt(stats.rows[0].total_executions) || 0,
      successful_executions: parseInt(stats.rows[0].successful_executions) || 0,
      failed_executions: parseInt(stats.rows[0].failed_executions) || 0,
      executions_today: parseInt(recentStats.rows[0].today) || 0,
      executions_this_week: parseInt(recentStats.rows[0].this_week) || 0,
      top_workflows: topWorkflows.rows
    };
  }

  // =====================================================
  // VARIABLE INTERPOLATION
  // =====================================================

  interpolateVariables(template: string, context: ExecutionContext): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path.trim());
      return value !== undefined ? String(value) : match;
    });
  }

  interpolateConfig(config: Record<string, any>, context: ExecutionContext): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        result[key] = this.interpolateVariables(value, context);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.interpolateConfig(value, context);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  // =====================================================
  // ROUND ROBIN ASSIGNMENT
  // =====================================================

  async getNextRoundRobinAgent(
    organizationId: string,
    workflowId?: string,
    teamId?: string
  ): Promise<string | null> {
    const result = await pool.query(
      'SELECT get_next_round_robin_agent($1, $2, $3) as agent_id',
      [organizationId, workflowId, teamId]
    );
    
    return result.rows[0]?.agent_id || null;
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private mapWorkflow(row: any): Workflow {
    return {
      id: row.id,
      organization_id: row.organization_id,
      name: row.name,
      description: row.description,
      folder: row.folder,
      trigger_type: row.trigger_type,
      trigger_config: typeof row.trigger_config === 'string' 
        ? JSON.parse(row.trigger_config) 
        : (row.trigger_config || {}),
      entity_type: row.entity_type,
      is_active: row.is_active,
      is_template: row.is_template,
      run_once_per_entity: row.run_once_per_entity,
      execution_limit: row.execution_limit,
      cool_down_minutes: row.cool_down_minutes,
      execution_count: row.execution_count || 0,
      success_count: row.success_count || 0,
      failure_count: row.failure_count || 0,
      last_executed_at: row.last_executed_at,
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private mapStep(row: any): WorkflowStep {
    return {
      id: row.id,
      workflow_id: row.workflow_id,
      step_order: row.step_order,
      parent_step_id: row.parent_step_id,
      branch_path: row.branch_path,
      step_type: row.step_type,
      action_type: row.action_type,
      action_config: typeof row.action_config === 'string'
        ? JSON.parse(row.action_config)
        : (row.action_config || {}),
      condition_config: row.condition_config 
        ? (typeof row.condition_config === 'string' ? JSON.parse(row.condition_config) : row.condition_config)
        : undefined,
      delay_config: row.delay_config
        ? (typeof row.delay_config === 'string' ? JSON.parse(row.delay_config) : row.delay_config)
        : undefined,
      position_x: row.position_x || 0,
      position_y: row.position_y || 0,
      label: row.label,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private mapExecution(row: any): WorkflowExecution {
    return {
      id: row.id,
      workflow_id: row.workflow_id,
      organization_id: row.organization_id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      trigger_type: row.trigger_type,
      trigger_data: typeof row.trigger_data === 'string'
        ? JSON.parse(row.trigger_data)
        : (row.trigger_data || {}),
      status: row.status,
      current_step_id: row.current_step_id,
      completed_steps: row.completed_steps || [],
      started_at: row.started_at,
      completed_at: row.completed_at,
      next_run_at: row.next_run_at,
      error_message: row.error_message,
      execution_log: row.execution_log || [],
      context: typeof row.context === 'string'
        ? JSON.parse(row.context)
        : (row.context || {}),
      retry_count: row.retry_count || 0,
      max_retries: row.max_retries || 3,
      triggered_by: row.triggered_by,
      cancelled_by: row.cancelled_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private mapTemplate(row: any): WorkflowTemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      trigger_type: row.trigger_type,
      trigger_config: typeof row.trigger_config === 'string'
        ? JSON.parse(row.trigger_config)
        : (row.trigger_config || {}),
      steps: typeof row.steps === 'string'
        ? JSON.parse(row.steps)
        : (row.steps || []),
      icon: row.icon,
      color: row.color,
      use_count: row.use_count || 0,
      is_featured: row.is_featured,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export default WorkflowService.getInstance();
