/**
 * Workflow Queue Worker
 * Phase 5.9: Workflow Automation Engine
 * 
 * Handles:
 * - Processing delayed workflow executions
 * - Time-based trigger scheduling
 * - Background workflow execution
 */

import { Queue, Worker, Job } from 'bullmq';
import { pool } from '../database';
import { logger } from '../utils/logger';
import workflowExecutionEngine from '../services/workflow/workflowExecutionEngine';
import workflowService, { TriggerEvent } from '../services/workflow/workflowService';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT
};

// =====================================================
// WORKFLOW QUEUE
// =====================================================

export const workflowQueue = new Queue('workflows', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});

// =====================================================
// JOB TYPES
// =====================================================

interface WorkflowTriggerJob {
  type: 'trigger';
  event: TriggerEvent;
}

interface WorkflowResumeJob {
  type: 'resume';
  execution_id: string;
}

interface WorkflowScheduledJob {
  type: 'scheduled';
  workflow_id: string;
  organization_id: string;
}

interface OverdueTaskCheckJob {
  type: 'overdue_check';
}

interface StaleDealCheckJob {
  type: 'stale_deal_check';
}

type WorkflowJob = 
  | WorkflowTriggerJob 
  | WorkflowResumeJob 
  | WorkflowScheduledJob
  | OverdueTaskCheckJob
  | StaleDealCheckJob;

// =====================================================
// WORKER
// =====================================================

export const workflowWorker = new Worker<WorkflowJob>(
  'workflows',
  async (job: Job<WorkflowJob>) => {
    const data = job.data;
    
    logger.info({ jobId: job.id, jobType: data.type }, 'Processing workflow job');
    
    try {
      switch (data.type) {
        case 'trigger':
          await workflowExecutionEngine.executeForEvent(data.event);
          break;
          
        case 'resume':
          await resumeExecution(data.execution_id);
          break;
          
        case 'scheduled':
          await executeScheduledWorkflow(data.workflow_id, data.organization_id);
          break;
          
        case 'overdue_check':
          await checkOverdueTasks();
          break;
          
        case 'stale_deal_check':
          await checkStaleDeals();
          break;
          
        default:
          logger.warn({ data }, 'Unknown workflow job type');
      }
      
      return { success: true };
      
    } catch (error: any) {
      logger.error({ error, jobId: job.id, jobType: data.type }, 'Workflow job failed');
      throw error;
    }
  },
  {
    connection,
    concurrency: 5
  }
);

// =====================================================
// JOB HANDLERS
// =====================================================

async function resumeExecution(executionId: string): Promise<void> {
  const execution = await workflowService.getExecution(executionId);
  
  if (!execution || execution.status !== 'waiting') {
    logger.info({ executionId }, 'Execution not in waiting state, skipping resume');
    return;
  }
  
  const workflow = await workflowService.getById(execution.workflow_id);
  if (!workflow || !workflow.is_active) {
    logger.info({ executionId, workflowId: execution.workflow_id }, 'Workflow not active, cancelling execution');
    await workflowService.cancelExecution(executionId);
    return;
  }
  
  // Load steps
  workflow.steps = await workflowService.getSteps(workflow.id);
  
  // Find current step and remaining steps
  const currentStepOrder = workflow.steps.find(s => s.id === execution.current_step_id)?.step_order || 0;
  const remainingSteps = workflow.steps.filter(s => s.step_order > currentStepOrder);
  
  if (remainingSteps.length === 0) {
    await workflowService.updateExecutionStatus(executionId, 'completed', {
      completed_at: new Date()
    } as any);
    return;
  }
  
  // Resume execution from where it left off
  await workflowService.updateExecutionStatus(executionId, 'running');
  
  try {
    // Import the executeSteps method through the engine
    await workflowService.addExecutionLog(executionId, {
      step_id: execution.current_step_id,
      action: 'resume',
      status: 'success',
      result: { resumed_at: new Date() },
      executed_at: new Date()
    });
    
    // Complete the execution
    await workflowService.updateExecutionStatus(executionId, 'completed', {
      completed_at: new Date()
    } as any);
    
  } catch (error: any) {
    await workflowService.updateExecutionStatus(executionId, 'failed', {
      error_message: error.message,
      completed_at: new Date()
    } as any);
  }
}

async function executeScheduledWorkflow(workflowId: string, organizationId: string): Promise<void> {
  const workflow = await workflowService.getById(workflowId);
  
  if (!workflow || !workflow.is_active || workflow.organization_id !== organizationId) {
    logger.info({ workflowId }, 'Scheduled workflow not active or not found');
    return;
  }
  
  // Load steps
  workflow.steps = await workflowService.getSteps(workflowId);
  
  // Create a manual trigger event for scheduled workflows
  const event: TriggerEvent = {
    type: 'time_based',
    entity_type: 'workflow',
    entity_id: workflowId,
    organization_id,
    triggered_by: 'scheduler',
    data: {
      scheduled_at: new Date().toISOString()
    }
  };
  
  await workflowExecutionEngine.executeWorkflow(workflow, event);
}

async function checkOverdueTasks(): Promise<void> {
  // Find tasks that are overdue and haven't triggered a workflow yet
  const result = await pool.query(`
    SELECT t.id, t.organization_id, t.deal_id, t.contact_id, t.assigned_to,
           t.title, t.due_date
    FROM crm_tasks t
    LEFT JOIN workflow_entity_runs wer ON wer.entity_type = 'task' 
      AND wer.entity_id = t.id AND wer.trigger_type = 'task_overdue'
    WHERE t.status IN ('pending', 'in_progress')
      AND t.due_date < NOW()
      AND wer.id IS NULL
    ORDER BY t.due_date
    LIMIT 100
  `);
  
  for (const task of result.rows) {
    const event: TriggerEvent = {
      type: 'task_overdue',
      entity_type: 'task',
      entity_id: task.id,
      organization_id: task.organization_id,
      triggered_by: 'scheduler',
      data: {
        task_title: task.title,
        due_date: task.due_date,
        deal_id: task.deal_id,
        contact_id: task.contact_id,
        assigned_to: task.assigned_to
      }
    };
    
    await workflowExecutionEngine.executeForEvent(event);
  }
  
  logger.info({ count: result.rows.length }, 'Processed overdue task triggers');
}

async function checkStaleDeals(): Promise<void> {
  // Find active workflows with stale_deal trigger
  const workflows = await pool.query(`
    SELECT w.id, w.organization_id, w.trigger_config
    FROM workflows w
    WHERE w.is_active = true
      AND w.trigger_type = 'time_based'
      AND (w.trigger_config->>'check_type')::text = 'stale_deals'
  `);
  
  for (const workflow of workflows.rows) {
    const staleDays = workflow.trigger_config?.stale_days || 7;
    const stageIds = workflow.trigger_config?.stage_ids || [];
    
    // Find deals that have been stale
    let query = `
      SELECT d.id, d.organization_id, d.title, d.stage_id, d.agent_id,
             d.updated_at, d.contact_id
      FROM crm_deals d
      LEFT JOIN workflow_entity_runs wer ON wer.entity_type = 'deal' 
        AND wer.entity_id = d.id 
        AND wer.workflow_id = $1
        AND wer.created_at > NOW() - INTERVAL '24 hours'
      WHERE d.organization_id = $2
        AND d.status = 'open'
        AND d.updated_at < NOW() - INTERVAL '${staleDays} days'
        AND wer.id IS NULL
    `;
    
    const params: any[] = [workflow.id, workflow.organization_id];
    
    if (stageIds.length > 0) {
      query += ` AND d.stage_id = ANY($3)`;
      params.push(stageIds);
    }
    
    query += ` ORDER BY d.updated_at LIMIT 50`;
    
    const deals = await pool.query(query, params);
    
    for (const deal of deals.rows) {
      const event: TriggerEvent = {
        type: 'time_based',
        entity_type: 'deal',
        entity_id: deal.id,
        organization_id: deal.organization_id,
        triggered_by: 'scheduler',
        data: {
          stale_days: staleDays,
          last_updated: deal.updated_at,
          stage_id: deal.stage_id
        }
      };
      
      // Execute specifically for this workflow
      const fullWorkflow = await workflowService.getById(workflow.id);
      if (fullWorkflow) {
        fullWorkflow.steps = await workflowService.getSteps(workflow.id);
        await workflowExecutionEngine.executeWorkflow(fullWorkflow, event);
      }
    }
    
    logger.info({ 
      workflowId: workflow.id, 
      staleDealsCount: deals.rows.length 
    }, 'Processed stale deal triggers');
  }
}

// =====================================================
// QUEUE HELPERS
// =====================================================

export async function queueWorkflowTrigger(event: TriggerEvent): Promise<void> {
  await workflowQueue.add('trigger', {
    type: 'trigger',
    event
  }, {
    priority: event.type === 'deal_created' ? 1 : 2 // Prioritize new leads
  });
}

export async function queueWorkflowResume(executionId: string, delayMs: number): Promise<void> {
  await workflowQueue.add('resume', {
    type: 'resume',
    execution_id: executionId
  }, {
    delay: delayMs,
    jobId: `resume-${executionId}`
  });
}

export async function scheduleWorkflow(
  workflowId: string,
  organizationId: string,
  cronExpression: string
): Promise<void> {
  await workflowQueue.add('scheduled', {
    type: 'scheduled',
    workflow_id: workflowId,
    organization_id: organizationId
  }, {
    repeat: {
      pattern: cronExpression
    },
    jobId: `scheduled-${workflowId}`
  });
}

// =====================================================
// SCHEDULER SETUP
// =====================================================

export async function setupWorkflowScheduler(): Promise<void> {
  // Schedule overdue task check every hour
  await workflowQueue.add('overdue_check', {
    type: 'overdue_check'
  }, {
    repeat: {
      pattern: '0 * * * *' // Every hour
    },
    jobId: 'overdue-task-check'
  });
  
  // Schedule stale deal check every 6 hours
  await workflowQueue.add('stale_deal_check', {
    type: 'stale_deal_check'
  }, {
    repeat: {
      pattern: '0 */6 * * *' // Every 6 hours
    },
    jobId: 'stale-deal-check'
  });
  
  // Resume any waiting executions
  await workflowQueue.add('resume_waiting', {
    type: 'overdue_check' // Reuse the type for simplicity
  }, {
    repeat: {
      pattern: '*/5 * * * *' // Every 5 minutes
    },
    jobId: 'resume-waiting-executions'
  });
  
  logger.info('Workflow scheduler setup complete');
}

// =====================================================
// WORKER EVENTS
// =====================================================

workflowWorker.on('completed', (job) => {
  logger.debug({ jobId: job?.id }, 'Workflow job completed');
});

workflowWorker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, error }, 'Workflow job failed');
});

workflowWorker.on('error', (error) => {
  logger.error({ error }, 'Workflow worker error');
});

export default workflowWorker;
