/**
 * Workflow Execution Engine
 * Phase 5.9: Workflow Automation Engine
 * 
 * SHARED SERVICE: Used across all domains for automation
 * 
 * Handles:
 * - Step-by-step execution
 * - Action implementations (create task, send email, etc.)
 * - Condition evaluation
 * - Delay handling
 * - Error recovery
 */

import { pool } from '../../src/database';
import { logger } from '../../src/utils/logger';
import workflowService, {
  Workflow,
  WorkflowStep,
  WorkflowExecution,
  ExecutionContext,
  ActionType,
  TriggerEvent
} from './workflowService';

// Import other services for actions
import { taskService } from '../../src/services/crm-deal-management/taskService';
import { noteService } from '../../src/services/crm-deal-management/noteService';
import { activityService } from '../../src/services/crm-deal-management/activityService';
import { dealService } from '../../src/services/crm-deal-management/dealService';

// =====================================================
// ACTION HANDLERS
// =====================================================

type ActionHandler = (
  step: WorkflowStep,
  context: ExecutionContext,
  execution: WorkflowExecution
) => Promise<{ success: boolean; result?: any; error?: string }>;

const actionHandlers: Record<ActionType, ActionHandler> = {
  // =====================================================
  // CREATE TASK
  // =====================================================
  create_task: async (step, context, execution) => {
    try {
      const config = workflowService.interpolateConfig(step.action_config, context);
      
      // Determine assignee
      let assigneeId = config.assignee;
      if (assigneeId === 'trigger_user') {
        assigneeId = execution.triggered_by;
      } else if (assigneeId === 'deal_owner' && context.deal?.agent_id) {
        assigneeId = context.deal.agent_id;
      } else if (assigneeId === 'contact_owner' && context.contact?.owner_id) {
        assigneeId = context.contact.owner_id;
      } else if (assigneeId === 'assigned_agent' && context.assigned_agent?.id) {
        assigneeId = context.assigned_agent.id;
      }
      
      // Calculate due date
      let dueDate = new Date();
      if (config.due_in_minutes) {
        dueDate.setMinutes(dueDate.getMinutes() + parseInt(config.due_in_minutes));
      } else if (config.due_in_hours) {
        dueDate.setHours(dueDate.getHours() + parseInt(config.due_in_hours));
      } else if (config.due_in_days) {
        dueDate.setDate(dueDate.getDate() + parseInt(config.due_in_days));
      }
      
      const task = await (taskService as any).createTask(execution.organization_id, {
        organization_id: execution.organization_id,
        title: config.title || 'Automated Task',
        description: config.description,
        priority: config.priority || 'medium',
        status: 'pending',
        deal_id: context.deal?.id,
        contact_id: context.contact?.id,
        assigned_to: assigneeId,
        due_date: dueDate,
        created_by: execution.triggered_by || 'system'
      });
      
      logger.info({ taskId: task.id, executionId: execution.id }, 'Workflow created task');
      
      return { success: true, result: { task_id: task.id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // SEND EMAIL
  // =====================================================
  send_email: async (step, context, execution) => {
    try {
      const config = workflowService.interpolateConfig(step.action_config, context);
      
      // Determine recipient
      let recipientEmail: string | undefined;
      if (config.to === 'deal_contact' && context.contact?.email) {
        recipientEmail = context.contact.email;
      } else if (config.to === 'deal_owner' && context.deal?.agent_email) {
        recipientEmail = context.deal.agent_email;
      } else if (config.to === 'assigned_agent' && context.assigned_agent?.email) {
        recipientEmail = context.assigned_agent.email;
      } else if (config.to?.includes('@')) {
        recipientEmail = config.to;
      }
      
      if (!recipientEmail) {
        return { success: false, error: 'No valid recipient email found' };
      }
      
      // In production, integrate with email service
      // For now, log the email action
      logger.info({
        executionId: execution.id,
        to: recipientEmail,
        subject: config.subject,
        template: config.template
      }, 'Workflow would send email');
      
      // TODO: Integrate with actual email service
      // await emailService.send({
      //   to: recipientEmail,
      //   subject: config.subject,
      //   template: config.template,
      //   variables: config.variables
      // });
      
      return { success: true, result: { sent_to: recipientEmail } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // SEND WHATSAPP
  // =====================================================
  send_whatsapp: async (step, context, execution) => {
    try {
      const config = workflowService.interpolateConfig(step.action_config, context);
      
      // Determine recipient
      let recipientPhone: string | undefined;
      if (config.to === 'deal_contact' && context.contact?.phone) {
        recipientPhone = context.contact.phone;
      } else if (config.to === 'assigned_agent' && context.assigned_agent?.phone) {
        recipientPhone = context.assigned_agent.phone;
      } else if (config.to?.match(/^\+?\d+/)) {
        recipientPhone = config.to;
      }
      
      if (!recipientPhone) {
        return { success: false, error: 'No valid recipient phone found' };
      }
      
      // In production, integrate with WhatsApp service
      logger.info({
        executionId: execution.id,
        to: recipientPhone,
        template: config.template,
        variables: config.variables
      }, 'Workflow would send WhatsApp');
      
      // TODO: Integrate with WhatsApp service
      // await whatsappService.sendTemplate({
      //   to: recipientPhone,
      //   template: config.template,
      //   variables: config.variables
      // });
      
      return { success: true, result: { sent_to: recipientPhone } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // SEND SMS
  // =====================================================
  send_sms: async (step, context, execution) => {
    try {
      const config = workflowService.interpolateConfig(step.action_config, context);
      
      // Similar to WhatsApp
      logger.info({ executionId: execution.id, config }, 'Workflow would send SMS');
      
      return { success: true, result: { message: 'SMS queued' } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // UPDATE FIELD
  // =====================================================
  update_field: async (step, context, execution) => {
    try {
      const config = step.action_config;
      const entityType = config.entity_type || execution.entity_type;
      const entityId = config.entity_id || execution.entity_id;
      const field = config.field;
      const value = workflowService.interpolateVariables(String(config.value), context);
      
      if (entityType === 'deal') {
        await (dealService as any).updateDeal(entityId, execution.organization_id, { [field]: value });
        logger.info({ entityId, field, value }, 'Workflow updated deal field');
      } else if (entityType === 'contact') {
        await pool.query(`
          UPDATE crm_contacts SET ${field} = $1, updated_at = NOW() WHERE id = $2
        `, [value, entityId]);
        logger.info({ entityId, field, value }, 'Workflow updated contact field');
      }
      
      return { success: true, result: { entity: entityType, field, value } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // ASSIGN AGENT
  // =====================================================
  assign_agent: async (step, context, execution) => {
    try {
      const config = step.action_config;
      let agentId: string | null = null;
      
      switch (config.method) {
        case 'round_robin':
          agentId = await workflowService.getNextRoundRobinAgent(
            execution.organization_id,
            execution.workflow_id,
            config.team_id
          );
          break;
          
        case 'specific_agent':
          agentId = config.agent_id;
          break;
          
        case 'random':
          const agents = await pool.query(`
            SELECT id FROM users
            WHERE organization_id = $1 AND role IN ('agent', 'admin') AND status = 'active'
            ORDER BY RANDOM() LIMIT 1
          `, [execution.organization_id]);
          agentId = agents.rows[0]?.id;
          break;
          
        case 'load_balanced':
          // Assign to agent with fewest active deals
          const leastBusy = await pool.query(`
            SELECT u.id, COUNT(d.id) as deal_count
            FROM users u
            LEFT JOIN crm_deals d ON u.id = d.agent_id AND d.status = 'open'
            WHERE u.organization_id = $1 AND u.role IN ('agent', 'admin') AND u.status = 'active'
            GROUP BY u.id
            ORDER BY deal_count ASC
            LIMIT 1
          `, [execution.organization_id]);
          agentId = leastBusy.rows[0]?.id;
          break;
      }
      
      // Fallback to admin if no agent found
      if (!agentId && config.fallback_to_admin) {
        const admin = await pool.query(`
          SELECT id FROM users
          WHERE organization_id = $1 AND role = 'admin' AND status = 'active'
          LIMIT 1
        `, [execution.organization_id]);
        agentId = admin.rows[0]?.id;
      }
      
      if (!agentId) {
        return { success: false, error: 'No agent available for assignment' };
      }
      
      // Assign to deal
      if (execution.entity_type === 'deal') {
        await (dealService as any).updateDeal(execution.entity_id, execution.organization_id, { agent_id: agentId });
      } else if (execution.entity_type === 'contact') {
        await pool.query(`
          UPDATE crm_contacts SET owner_id = $1, updated_at = NOW() WHERE id = $2
        `, [agentId, execution.entity_id]);
      }
      
      // Get agent info for context
      const agentInfo = await pool.query(
        'SELECT id, full_name, email, phone FROM users WHERE id = $1',
        [agentId]
      );
      
      // Update execution context with assigned agent
      context.assigned_agent = agentInfo.rows[0];
      await workflowService.updateExecutionStatus(execution.id, execution.status, { context });
      
      logger.info({ agentId, method: config.method, executionId: execution.id }, 'Workflow assigned agent');
      
      return { success: true, result: { agent_id: agentId, agent_name: agentInfo.rows[0]?.full_name } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // ADD NOTE
  // =====================================================
  add_note: async (step, context, execution) => {
    try {
      const config = workflowService.interpolateConfig(step.action_config, context);
      
      const note = await (noteService as any).createNote(execution.organization_id, {
        organization_id: execution.organization_id,
        deal_id: context.deal?.id,
        contact_id: context.contact?.id,
        content: config.content || 'Automated note',
        is_pinned: config.is_pinned || false,
        created_by: execution.triggered_by || 'system'
      });
      
      logger.info({ noteId: note.id, executionId: execution.id }, 'Workflow created note');
      
      return { success: true, result: { note_id: note.id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // ADD TAG
  // =====================================================
  add_tag: async (step, context, execution) => {
    try {
      const config = step.action_config;
      const tag = config.tag;
      
      if (execution.entity_type === 'deal') {
        await pool.query(`
          UPDATE crm_deals 
          SET tags = array_append(COALESCE(tags, ARRAY[]::TEXT[]), $1),
              updated_at = NOW()
          WHERE id = $2 AND NOT ($1 = ANY(COALESCE(tags, ARRAY[]::TEXT[])))
        `, [tag, execution.entity_id]);
      } else if (execution.entity_type === 'contact') {
        await pool.query(`
          UPDATE crm_contacts 
          SET tags = array_append(COALESCE(tags, ARRAY[]::TEXT[]), $1),
              updated_at = NOW()
          WHERE id = $2 AND NOT ($1 = ANY(COALESCE(tags, ARRAY[]::TEXT[])))
        `, [tag, execution.entity_id]);
      }
      
      return { success: true, result: { tag } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // REMOVE TAG
  // =====================================================
  remove_tag: async (step, context, execution) => {
    try {
      const config = step.action_config;
      const tag = config.tag;
      
      if (execution.entity_type === 'deal') {
        await pool.query(`
          UPDATE crm_deals 
          SET tags = array_remove(tags, $1), updated_at = NOW()
          WHERE id = $2
        `, [tag, execution.entity_id]);
      } else if (execution.entity_type === 'contact') {
        await pool.query(`
          UPDATE crm_contacts 
          SET tags = array_remove(tags, $1), updated_at = NOW()
          WHERE id = $2
        `, [tag, execution.entity_id]);
      }
      
      return { success: true, result: { tag } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // CREATE ACTIVITY
  // =====================================================
  create_activity: async (step, context, execution) => {
    try {
      const config = workflowService.interpolateConfig(step.action_config, context);
      
      const activity = await (activityService as any).createActivity(execution.organization_id, {
        organization_id: execution.organization_id,
        deal_id: context.deal?.id,
        contact_id: context.contact?.id,
        type: config.activity_type || 'note',
        subject: config.subject || 'Automated Activity',
        description: config.description,
        outcome: config.outcome,
        scheduled_at: config.scheduled_at ? new Date(config.scheduled_at) : undefined,
        completed_at: config.mark_completed ? new Date() : undefined,
        created_by: execution.triggered_by || 'system'
      });
      
      return { success: true, result: { activity_id: activity.id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // MOVE STAGE
  // =====================================================
  move_stage: async (step, context, execution) => {
    try {
      const config = step.action_config;
      
      if (execution.entity_type !== 'deal') {
        return { success: false, error: 'Move stage only works on deals' };
      }
      
      const stageId = config.stage_id;
      
      await (dealService as any).updateDeal(execution.entity_id, execution.organization_id, { stage_id: stageId });
      
      logger.info({ dealId: execution.entity_id, stageId }, 'Workflow moved deal stage');
      
      return { success: true, result: { stage_id: stageId } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // WEBHOOK
  // =====================================================
  webhook: async (step, context, execution) => {
    try {
      const config = workflowService.interpolateConfig(step.action_config, context);
      
      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        },
        body: JSON.stringify(config.body || context)
      });
      
      const result = await response.json();
      
      return { success: response.ok, result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // =====================================================
  // WAIT (Delay)
  // =====================================================
  wait: async (step, context, execution) => {
    // Wait steps are handled specially - they schedule the next run
    return { success: true, result: { delayed: true } };
  },

  // =====================================================
  // BRANCH (Condition)
  // =====================================================
  branch: async (step, context, execution) => {
    // Branch steps are handled specially in the execution engine
    return { success: true, result: { branched: true } };
  }
};

// =====================================================
// CONDITION EVALUATOR
// =====================================================

function evaluateCondition(
  config: Record<string, any>,
  context: ExecutionContext
): boolean {
  const { field, operator, value, type, conditions } = config;
  
  // Handle compound conditions
  if (type === 'and' && conditions) {
    return conditions.every((c: any) => evaluateCondition(c, context));
  }
  if (type === 'or' && conditions) {
    return conditions.some((c: any) => evaluateCondition(c, context));
  }
  
  // Get field value from context
  const fieldValue = field.split('.').reduce((obj: any, key: string) => {
    return obj && obj[key] !== undefined ? obj[key] : undefined;
  }, context);
  
  // Evaluate based on operator
  switch (operator) {
    case 'equals':
    case 'equal':
      return fieldValue == value;
    case 'not_equals':
    case 'not_equal':
      return fieldValue != value;
    case 'greater_than':
      return parseFloat(fieldValue) > parseFloat(value);
    case 'greater_than_or_equal':
      return parseFloat(fieldValue) >= parseFloat(value);
    case 'less_than':
      return parseFloat(fieldValue) < parseFloat(value);
    case 'less_than_or_equal':
      return parseFloat(fieldValue) <= parseFloat(value);
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case 'not_contains':
      return !String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case 'starts_with':
      return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
    case 'ends_with':
      return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
    case 'is_empty':
      return !fieldValue || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'is_not_empty':
      return fieldValue && fieldValue !== '' && (!Array.isArray(fieldValue) || fieldValue.length > 0);
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case 'not_in':
      return Array.isArray(value) && !value.includes(fieldValue);
    default:
      return false;
  }
}

// =====================================================
// EXECUTION ENGINE
// =====================================================

class WorkflowExecutionEngine {
  private static instance: WorkflowExecutionEngine;

  private constructor() {}

  static getInstance(): WorkflowExecutionEngine {
    if (!WorkflowExecutionEngine.instance) {
      WorkflowExecutionEngine.instance = new WorkflowExecutionEngine();
    }
    return WorkflowExecutionEngine.instance;
  }

  /**
   * Execute a workflow for a trigger event
   */
  async executeForEvent(event: TriggerEvent): Promise<void> {
    const workflows = await workflowService.findMatchingWorkflows(event);
    
    logger.info({ 
      triggerType: event.type, 
      entityId: event.entity_id,
      matchingWorkflows: workflows.length 
    }, 'Processing trigger event');
    
    for (const workflow of workflows) {
      try {
        await this.executeWorkflow(workflow, event);
      } catch (error) {
        logger.error({ error, workflowId: workflow.id }, 'Failed to execute workflow');
      }
    }
  }

  /**
   * Execute a specific workflow
   */
  async executeWorkflow(
    workflow: Workflow,
    event: TriggerEvent
  ): Promise<WorkflowExecution> {
    // Build initial context
    const context = await this.buildContext(event);
    
    // Create execution record
    const execution = await workflowService.createExecution(workflow, event, context);
    
    logger.info({ workflowId: workflow.id, executionId: execution.id }, 'Starting workflow execution');
    
    // Update status to running
    await workflowService.updateExecutionStatus(execution.id, 'running', {
      started_at: new Date()
    } as any);
    
    try {
      // Execute steps in order
      const steps = workflow.steps || [];
      await this.executeSteps(steps, context, execution);
      
      // Mark as completed
      await workflowService.updateExecutionStatus(execution.id, 'completed', {
        completed_at: new Date()
      } as any);
      
      logger.info({ workflowId: workflow.id, executionId: execution.id }, 'Workflow execution completed');
      
    } catch (error: any) {
      // Mark as failed
      await workflowService.updateExecutionStatus(execution.id, 'failed', {
        error_message: error.message,
        completed_at: new Date()
      } as any);
      
      logger.error({ error, workflowId: workflow.id, executionId: execution.id }, 'Workflow execution failed');
    }
    
    return workflowService.getExecution(execution.id) as Promise<WorkflowExecution>;
  }

  /**
   * Execute workflow steps
   */
  private async executeSteps(
    steps: WorkflowStep[],
    context: ExecutionContext,
    execution: WorkflowExecution,
    branchPath?: string
  ): Promise<void> {
    // Filter steps for current branch
    const relevantSteps = steps.filter(s => 
      (!branchPath && !s.branch_path) || s.branch_path === branchPath
    ).sort((a, b) => a.step_order - b.step_order);
    
    for (const step of relevantSteps) {
      await workflowService.updateExecutionStatus(execution.id, 'running', {
        current_step_id: step.id
      });
      
      const logEntry = {
        step_id: step.id,
        action: step.action_type || step.step_type,
        status: 'pending',
        executed_at: new Date()
      };
      
      try {
        // Handle different step types
        if (step.step_type === 'condition' || step.step_type === 'branch') {
          const result = evaluateCondition(step.condition_config || {}, context);
          
          logEntry.status = 'success';
          (logEntry as any).result = { condition_met: result };
          await workflowService.addExecutionLog(execution.id, logEntry);
          
          // Execute the appropriate branch
          const childSteps = steps.filter(s => s.parent_step_id === step.id);
          const trueBranch = childSteps.filter(s => s.branch_path === 'true');
          const falseBranch = childSteps.filter(s => s.branch_path === 'false');
          
          if (result && trueBranch.length > 0) {
            await this.executeSteps(steps, context, execution, 'true');
          } else if (!result && falseBranch.length > 0) {
            await this.executeSteps(steps, context, execution, 'false');
          }
          
        } else if (step.step_type === 'delay') {
          // Calculate delay
          const delayMs = this.calculateDelayMs(step.delay_config || {});
          
          if (delayMs > 0) {
            // Schedule continuation
            const nextRunAt = new Date(Date.now() + delayMs);
            await workflowService.updateExecutionStatus(execution.id, 'waiting', {
              next_run_at: nextRunAt,
              current_step_id: step.id
            });
            
            logEntry.status = 'success';
            (logEntry as any).result = { delayed_until: nextRunAt };
            await workflowService.addExecutionLog(execution.id, logEntry);
            
            // Exit - will be resumed by scheduler
            return;
          }
          
        } else if (step.step_type === 'action' && step.action_type) {
          // Execute action
          const handler = actionHandlers[step.action_type];
          
          if (handler) {
            const result = await handler(step, context, execution);
            
            logEntry.status = result.success ? 'success' : 'failed';
            (logEntry as any).result = result.result;
            (logEntry as any).error = result.error;
            await workflowService.addExecutionLog(execution.id, logEntry);
            
            if (!result.success && step.action_config.stop_on_error) {
              throw new Error(result.error || 'Action failed');
            }
          } else {
            logEntry.status = 'skipped';
            (logEntry as any).error = `Unknown action type: ${step.action_type}`;
            await workflowService.addExecutionLog(execution.id, logEntry);
          }
        }
        
      } catch (error: any) {
        logEntry.status = 'failed';
        (logEntry as any).error = error.message;
        await workflowService.addExecutionLog(execution.id, logEntry);
        
        // Check if we should continue on error
        if (step.action_config?.stop_on_error !== false) {
          throw error;
        }
      }
    }
  }

  /**
   * Build execution context from trigger event
   */
  private async buildContext(event: TriggerEvent): Promise<ExecutionContext> {
    const context: ExecutionContext = {
      entity: {},
      trigger: event.data,
      organization: {}
    };
    
    // Load entity data
    if (event.entity_type === 'deal') {
      const deal = await (dealService as any).getDealById(event.entity_id, event.organization_id);
      if (deal) {
        context.deal = deal;
        context.entity = deal;
        
        // Load contact if available
        if (deal.contact_id) {
          const contactResult = await pool.query(
            'SELECT * FROM crm_contacts WHERE id = $1',
            [deal.contact_id]
          );
          if (contactResult.rows.length > 0) {
            context.contact = contactResult.rows[0];
          }
        }
      }
    } else if (event.entity_type === 'contact') {
      const contactResult = await pool.query(
        'SELECT * FROM crm_contacts WHERE id = $1',
        [event.entity_id]
      );
      if (contactResult.rows.length > 0) {
        context.contact = contactResult.rows[0];
        context.entity = contactResult.rows[0];
      }
    } else if (event.entity_type === 'activity') {
      const activityResult = await pool.query(
        'SELECT * FROM crm_activities WHERE id = $1',
        [event.entity_id]
      );
      if (activityResult.rows.length > 0) {
        context.activity = activityResult.rows[0];
        context.entity = activityResult.rows[0];
        
        // Load related deal/contact
        if (activityResult.rows[0].deal_id) {
          const deal = await (dealService as any).getDealById(activityResult.rows[0].deal_id, event.organization_id);
          context.deal = deal;
        }
      }
    }
    
    // Load organization
    const orgResult = await pool.query(
      'SELECT * FROM organizations WHERE id = $1',
      [event.organization_id]
    );
    if (orgResult.rows.length > 0) {
      context.organization = orgResult.rows[0];
    }
    
    return context;
  }

  /**
   * Calculate delay in milliseconds
   */
  private calculateDelayMs(delayConfig: Record<string, any>): number {
    const { delay_type, value } = delayConfig;
    
    switch (delay_type) {
      case 'minutes':
        return parseInt(value) * 60 * 1000;
      case 'hours':
        return parseInt(value) * 60 * 60 * 1000;
      case 'days':
        return parseInt(value) * 24 * 60 * 60 * 1000;
      case 'until_time':
        // Calculate delay until specific time
        const targetTime = delayConfig.time; // "09:00"
        const timezone = delayConfig.timezone || 'Africa/Accra';
        // Simplified - in production use proper timezone handling
        const [hours, minutes] = targetTime.split(':').map(Number);
        const target = new Date();
        target.setHours(hours, minutes, 0, 0);
        if (target <= new Date()) {
          target.setDate(target.getDate() + 1);
        }
        return target.getTime() - Date.now();
      default:
        return 0;
    }
  }

  /**
   * Resume waiting executions
   */
  async resumeWaitingExecutions(): Promise<void> {
    const result = await pool.query(`
      SELECT we.*, w.name as workflow_name
      FROM workflow_executions we
      JOIN workflows w ON we.workflow_id = w.id
      WHERE we.status = 'waiting'
        AND we.next_run_at <= NOW()
      ORDER BY we.next_run_at
      LIMIT 100
    `);
    
    for (const row of result.rows) {
      try {
        const execution = await workflowService.getExecution(row.id);
        if (!execution) continue;
        
        const workflow = await workflowService.getById(execution.workflow_id);
        if (!workflow) continue;
        
        // Find remaining steps after current
        const currentStepOrder = workflow.steps?.find(s => s.id === execution.current_step_id)?.step_order || 0;
        const remainingSteps = workflow.steps?.filter(s => s.step_order > currentStepOrder) || [];
        
        if (remainingSteps.length > 0) {
          await workflowService.updateExecutionStatus(execution.id, 'running');
          await this.executeSteps(remainingSteps, execution.context as ExecutionContext, execution);
          await workflowService.updateExecutionStatus(execution.id, 'completed', {
            completed_at: new Date()
          } as any);
        } else {
          await workflowService.updateExecutionStatus(execution.id, 'completed', {
            completed_at: new Date()
          } as any);
        }
        
      } catch (error) {
        logger.error({ error, executionId: row.id }, 'Failed to resume workflow execution');
      }
    }
  }

  /**
   * Test a workflow with dry run (no actual actions)
   */
  async dryRun(
    workflow: Workflow,
    testContext: ExecutionContext
  ): Promise<{ steps: any[]; would_execute: boolean }> {
    const results: any[] = [];
    const steps = workflow.steps || [];
    
    for (const step of steps.sort((a, b) => a.step_order - b.step_order)) {
      const stepResult: any = {
        step_id: step.id,
        step_order: step.step_order,
        step_type: step.step_type,
        action_type: step.action_type,
        label: step.label
      };
      
      if (step.step_type === 'condition') {
        const result = evaluateCondition(step.condition_config || {}, testContext);
        stepResult.condition_result = result;
        stepResult.would_execute = true;
      } else if (step.step_type === 'delay') {
        const delayMs = this.calculateDelayMs(step.delay_config || {});
        stepResult.delay_seconds = Math.round(delayMs / 1000);
        stepResult.would_execute = true;
      } else if (step.step_type === 'action') {
        stepResult.interpolated_config = workflowService.interpolateConfig(
          step.action_config,
          testContext
        );
        stepResult.would_execute = true;
      }
      
      results.push(stepResult);
    }
    
    return { steps: results, would_execute: steps.length > 0 };
  }
}

export default WorkflowExecutionEngine.getInstance();
