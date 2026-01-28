/**
 * Workflow Service Unit Tests
 * Phase 5.9: Workflow Automation Engine
 * 
 * Unit tests for WorkflowService methods
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Mock client for transactions - must be defined before jest.mock
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

// Mock dependencies
jest.mock('../../src/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn()
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Import after mocks
import { pool } from '../../src/database';
import workflowService from '../../shared-services/workflow/workflowService';

const mockQuery = pool.query as jest.Mock;
const mockConnect = (pool as any).connect as jest.Mock;

describe('WorkflowService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    // Important: connect must return mockClient so we can control transaction queries
    mockConnect.mockResolvedValue(mockClient);
  });

  // =====================================================
  // VARIABLE INTERPOLATION TESTS
  // =====================================================

  describe('interpolateVariables', () => {
    it('should interpolate simple variables', () => {
      const template = 'Hello {{contact.name}}, your deal {{deal.title}} is ready!';
      const context = {
        entity: {},
        trigger: {},
        contact: { name: 'John Doe' },
        deal: { title: 'Property Sale' }
      };

      const result = workflowService.interpolateVariables(template, context);
      
      expect(result).toBe('Hello John Doe, your deal Property Sale is ready!');
    });

    it('should handle nested object values', () => {
      const template = 'Contact: {{contact.first_name}} {{contact.last_name}}';
      const context = {
        entity: {},
        trigger: {},
        contact: { first_name: 'John', last_name: 'Doe' }
      };

      const result = workflowService.interpolateVariables(template, context);
      
      expect(result).toBe('Contact: John Doe');
    });

    it('should preserve template when variable not found', () => {
      const template = 'Hello {{contact.name}}, status: {{unknown.field}}';
      const context = {
        entity: {},
        trigger: {},
        contact: { name: 'John' }
      };

      const result = workflowService.interpolateVariables(template, context);
      
      expect(result).toBe('Hello John, status: {{unknown.field}}');
    });

    it('should handle empty context', () => {
      const template = 'Hello {{name}}';
      const context = {
        entity: {},
        trigger: {}
      };

      const result = workflowService.interpolateVariables(template, context);
      
      expect(result).toBe('Hello {{name}}');
    });
  });

  describe('interpolateConfig', () => {
    it('should interpolate all string values in config', () => {
      const config = {
        title: 'Follow up with {{contact.name}}',
        description: 'Deal: {{deal.title}}',
        priority: 'high'
      };
      const context = {
        entity: {},
        trigger: {},
        contact: { name: 'Jane' },
        deal: { title: 'House Sale' }
      };

      const result = workflowService.interpolateConfig(config, context);
      
      expect(result.title).toBe('Follow up with Jane');
      expect(result.description).toBe('Deal: House Sale');
      expect(result.priority).toBe('high'); // unchanged
    });

    it('should handle nested config objects', () => {
      const config = {
        email: {
          to: '{{contact.email}}',
          subject: 'Update on {{deal.title}}'
        }
      };
      const context = {
        entity: {},
        trigger: {},
        contact: { email: 'test@example.com' },
        deal: { title: 'Property Deal' }
      };

      const result = workflowService.interpolateConfig(config, context);
      
      expect(result.email.to).toBe('test@example.com');
      expect(result.email.subject).toBe('Update on Property Deal');
    });
  });

  // =====================================================
  // TRIGGER MATCHING TESTS
  // =====================================================

  describe('matchesTriggerConfig', () => {
    const testOrgId = uuidv4();

    it('should match deal_created trigger', async () => {
      const workflowId = uuidv4();
      // First query: find workflows
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: workflowId,
          name: 'New Deal Workflow',
          trigger_type: 'deal_created',
          trigger_config: {},
          is_active: true
        }]
      });
      // Second query: get steps for workflow
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = {
        type: 'deal_created' as const,
        entity_type: 'deal',
        entity_id: uuidv4(),
        organization_id: testOrgId,
        triggered_by: uuidv4(),
        data: {}
      };

      const workflows = await workflowService.findMatchingWorkflows(event);
      
      expect(workflows.length).toBe(1);
    });

    it('should filter by stage_id in trigger config', async () => {
      const targetStageId = uuidv4();
      const matchingWorkflowId = uuidv4();
      const otherWorkflowId = uuidv4();
      
      // First query: find workflows
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: matchingWorkflowId,
            name: 'Stage Specific Workflow',
            trigger_type: 'deal_stage_changed',
            trigger_config: { to_stage: targetStageId },
            is_active: true
          },
          {
            id: otherWorkflowId,
            name: 'Other Stage Workflow',
            trigger_type: 'deal_stage_changed',
            trigger_config: { to_stage: uuidv4() },
            is_active: true
          }
        ]
      });
      // canExecute check for first workflow
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Get steps for first workflow
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = {
        type: 'deal_stage_changed' as const,
        entity_type: 'deal',
        entity_id: uuidv4(),
        organization_id: testOrgId,
        triggered_by: uuidv4(),
        data: {
          to_stage_id: targetStageId,
          from_stage_id: uuidv4()
        }
      };

      const workflows = await workflowService.findMatchingWorkflows(event);
      
      // Only the matching stage workflow should be returned
      expect(workflows.length).toBe(1);
      expect(workflows[0].name).toBe('Stage Specific Workflow');
    });

    it('should only return active workflows', async () => {
      const workflowId = uuidv4();
      // First query: find workflows
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: workflowId,
          name: 'Active Workflow',
          trigger_type: 'contact_created',
          trigger_config: {},
          is_active: true
        }]
      });
      // Get steps
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = {
        type: 'contact_created' as const,
        entity_type: 'contact',
        entity_id: uuidv4(),
        organization_id: testOrgId,
        data: {}
      };

      const workflows = await workflowService.findMatchingWorkflows(event);
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true'),
        expect.any(Array)
      );
    });
  });

  // =====================================================
  // EXECUTION CREATION TESTS
  // =====================================================

  describe('createExecution', () => {
    it('should create execution record', async () => {
      const workflow = {
        id: uuidv4(),
        organization_id: uuidv4(),
        name: 'Test Workflow',
        trigger_type: 'deal_created' as const,
        trigger_config: {},
        is_active: true,
        steps: [],
        entity_type: 'deal',
        is_template: false,
        run_once_per_entity: false,
        cool_down_minutes: 0,
        execution_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      const event = {
        type: 'deal_created' as const,
        entity_type: 'deal',
        entity_id: uuidv4(),
        organization_id: workflow.organization_id,
        triggered_by: uuidv4(),
        data: {}
      };

      const context = {
        entity: {},
        trigger: {},
        deal: { id: event.entity_id, title: 'Test Deal' }
      };

      const executionId = uuidv4();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: executionId,
          workflow_id: workflow.id,
          organization_id: workflow.organization_id,
          status: 'pending',
          entity_type: 'deal',
          entity_id: event.entity_id
        }]
      });

      const execution = await workflowService.createExecution(workflow, event, context);
      
      expect(execution.id).toBe(executionId);
      expect(execution.status).toBe('pending');
    });

    it('should track entity run to prevent duplicates', async () => {
      const workflow = {
        id: uuidv4(),
        organization_id: uuidv4(),
        name: 'Test Workflow',
        trigger_type: 'deal_created' as const,
        trigger_config: {},
        is_active: true,
        steps: [],
        entity_type: 'deal',
        is_template: false,
        run_once_per_entity: false,
        cool_down_minutes: 0,
        execution_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      const event = {
        type: 'deal_created' as const,
        entity_type: 'deal',
        entity_id: uuidv4(),
        organization_id: workflow.organization_id,
        triggered_by: uuidv4(),
        data: {}
      };

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: uuidv4(), status: 'pending' }]
        })
        .mockResolvedValueOnce({
          rows: [] // Insert entity run
        });

      await workflowService.createExecution(workflow, event, { entity: {}, trigger: {} });
      
      // Should have inserted into workflow_entity_runs
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // =====================================================
  // WORKFLOW CRUD TESTS
  // =====================================================

  describe('create', () => {
    it('should create workflow with valid data', async () => {
      const workflowId = uuidv4();
      const input = {
        organization_id: uuidv4(),
        name: 'New Workflow',
        description: 'Test description',
        trigger_type: 'deal_created' as const,
        trigger_config: {},
        created_by: uuidv4()
      };

      // Mock client.query for transaction
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: workflowId,
            ...input,
            is_active: false,
            entity_type: 'deal',
            is_template: false,
            run_once_per_entity: false,
            cool_down_minutes: 0,
            execution_count: 0,
            success_count: 0,
            failure_count: 0,
            created_at: new Date(),
            updated_at: new Date()
          }]
        }) // INSERT
        .mockResolvedValueOnce({}) // COMMIT

      // After transaction, create() calls getById which uses pool.query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: workflowId,
          ...input,
          is_active: false,
          entity_type: 'deal',
          is_template: false,
          run_once_per_entity: false,
          cool_down_minutes: 0,
          execution_count: 0,
          success_count: 0,
          failure_count: 0,
          created_at: new Date(),
          updated_at: new Date()
        }]
      });
      // getById also calls getSteps
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const workflow = await workflowService.create(input);
      
      expect(workflow.id).toBe(workflowId);
      expect(workflow.name).toBe(input.name);
    });
  });

  describe('getById', () => {
    it('should return workflow when found', async () => {
      const workflowId = uuidv4();
      
      // First query for the workflow
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: workflowId,
          name: 'Found Workflow',
          trigger_type: 'deal_created',
          is_active: true
        }]
      });
      // Second query for steps
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const workflow = await workflowService.getById(workflowId);
      
      expect(workflow).not.toBeNull();
      expect(workflow?.id).toBe(workflowId);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const workflow = await workflowService.getById(uuidv4());
      
      expect(workflow).toBeNull();
    });
  });

  describe('activate/deactivate', () => {
    it('should activate workflow', async () => {
      const workflowId = uuidv4();
      
      // UPDATE query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: workflowId,
          is_active: true
        }]
      });
      // getById query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: workflowId,
          name: 'Test Workflow',
          is_active: true
        }]
      });
      // getSteps query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const workflow = await workflowService.activate(workflowId);
      
      expect(workflow!.is_active).toBe(true);
    });

    it('should deactivate workflow', async () => {
      const workflowId = uuidv4();
      
      // UPDATE query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: workflowId,
          is_active: false
        }]
      });
      // getById query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: workflowId,
          name: 'Test Workflow',
          is_active: false
        }]
      });
      // getSteps query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const workflow = await workflowService.deactivate(workflowId);
      
      expect(workflow!.is_active).toBe(false);
    });
  });

  // =====================================================
  // STEP MANAGEMENT TESTS
  // =====================================================

  describe('updateSteps', () => {
    it('should delete existing steps and insert new ones', async () => {
      const workflowId = uuidv4();
      const steps = [
        {
          step_order: 1,
          step_type: 'action' as const,
          action_type: 'add_note' as const,
          action_config: { content: 'Test' }
        }
      ];

      // Mock transaction client queries
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE
        .mockResolvedValueOnce({ rows: [{ id: uuidv4() }] }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      await workflowService.updateSteps(workflowId, steps);
      
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  // =====================================================
  // ROUND ROBIN TESTS
  // =====================================================

  describe('getNextRoundRobinAgent', () => {
    it('should return next agent in round robin', async () => {
      const orgId = uuidv4();
      const workflowId = uuidv4();
      const agentId = uuidv4();

      mockQuery.mockResolvedValueOnce({
        rows: [{ agent_id: agentId }]
      });

      const result = await workflowService.getNextRoundRobinAgent(orgId, workflowId);
      
      expect(result).toBe(agentId);
    });

    it('should return null when no agents available', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ agent_id: null }]
      });

      const result = await workflowService.getNextRoundRobinAgent(uuidv4(), uuidv4());
      
      expect(result).toBeNull();
    });
  });

  // =====================================================
  // EXECUTION HISTORY TESTS
  // =====================================================

  describe('getExecutionHistory', () => {
    it('should return paginated executions', async () => {
      const workflowId = uuidv4();
      
      // Count query
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '2' }]
      });
      // Data query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: uuidv4(), status: 'completed' },
          { id: uuidv4(), status: 'completed' }
        ]
      });

      const executions = await workflowService.getExecutionHistory(workflowId, {
        limit: 10,
        page: 1
      });
      
      expect(executions.data.length).toBe(2);
    });

    it('should filter by status', async () => {
      const workflowId = uuidv4();
      
      // Count query
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '1' }]
      });
      // Data query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: uuidv4(), status: 'failed' }]
      });

      const executions = await workflowService.getExecutionHistory(workflowId, {
        status: 'failed'
      });
      
      expect(executions.data.length).toBe(1);
    });
  });

  // =====================================================
  // CANCEL EXECUTION TESTS
  // =====================================================

  describe('cancelExecution', () => {
    it('should update status to cancelled', async () => {
      const executionId = uuidv4();
      const userId = uuidv4();
      
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await workflowService.cancelExecution(executionId, userId);
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'cancelled'"),
        expect.arrayContaining([executionId])
      );
    });
  });

  // =====================================================
  // STATS TESTS
  // =====================================================

  describe('getWorkflowStats', () => {
    it('should return aggregated stats', async () => {
      const orgId = uuidv4();
      
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            total_workflows: 10,
            active_workflows: 7,
            total_executions: 150,
            successful_executions: 140,
            failed_executions: 10
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            today: 5,
            this_week: 25
          }]
        })
        .mockResolvedValueOnce({
          rows: []
        });

      const stats = await workflowService.getWorkflowStats(orgId);
      
      expect(stats.total_workflows).toBe(10);
      expect(stats.active_workflows).toBe(7);
      expect(stats.successful_executions).toBe(140);
      expect(stats.failed_executions).toBe(10);
    });
  });
});
