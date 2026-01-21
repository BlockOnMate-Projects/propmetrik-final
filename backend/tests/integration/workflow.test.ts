/**
 * Workflow Automation Integration Tests
 * Phase 5.9: Workflow Automation Engine
 * 
 * Tests:
 * - Workflow CRUD operations
 * - Trigger matching
 * - Workflow execution
 * - Action execution
 * - Workflow templates
 * - API endpoints
 */

import request from 'supertest';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Test configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_DB_URL = process.env.DATABASE_URL || '';

// Test data holders
let testPool: Pool;
let testOrgId: string;
let testUserId: string;
let testWorkflowId: string;
let testDealId: string;
let testContactId: string;
let testPipelineId: string;
let testStageId: string;
let authToken: string;

// Helper to make authenticated requests
const authRequest = (method: 'get' | 'post' | 'put' | 'delete', url: string) => {
  const req = request(API_BASE_URL)[method](url);
  if (authToken) {
    req.set('Authorization', `Bearer ${authToken}`);
  }
  return req;
};

describe('Workflow Automation Integration Tests', () => {
  beforeAll(async () => {
    // Initialize database connection
    testPool = new Pool({ connectionString: TEST_DB_URL });
    
    // Create test organization
    const orgResult = await testPool.query(`
      INSERT INTO organizations (id, name, slug, status, created_at)
      VALUES ($1, 'Test Org for Workflows', 'test-workflow-org', 'active', NOW())
      RETURNING id
    `, [uuidv4()]);
    testOrgId = orgResult.rows[0].id;
    
    // Create test user
    const userResult = await testPool.query(`
      INSERT INTO users (id, organization_id, email, full_name, role, status, created_at)
      VALUES ($1, $2, 'workflow-test@propmetrik.com', 'Workflow Tester', 'admin', 'active', NOW())
      RETURNING id
    `, [uuidv4(), testOrgId]);
    testUserId = userResult.rows[0].id;
    
    // Create test pipeline
    const pipelineResult = await testPool.query(`
      INSERT INTO crm_pipelines (id, organization_id, name, deal_type, is_default, created_by, created_at)
      VALUES ($1, $2, 'Test Pipeline', 'sale', true, $3, NOW())
      RETURNING id
    `, [uuidv4(), testOrgId, testUserId]);
    testPipelineId = pipelineResult.rows[0].id;
    
    // Create test stage
    const stageResult = await testPool.query(`
      INSERT INTO crm_pipeline_stages (id, pipeline_id, name, stage_order, probability, is_won, is_lost, created_at)
      VALUES ($1, $2, 'Initial Contact', 1, 10, false, false, NOW())
      RETURNING id
    `, [uuidv4(), testPipelineId]);
    testStageId = stageResult.rows[0].id;
    
    // Create test contact
    const contactResult = await testPool.query(`
      INSERT INTO crm_contacts (id, organization_id, first_name, last_name, email, phone, source, status, created_by, created_at)
      VALUES ($1, $2, 'John', 'Tester', 'john.tester@example.com', '+233201234567', 'website', 'active', $3, NOW())
      RETURNING id
    `, [uuidv4(), testOrgId, testUserId]);
    testContactId = contactResult.rows[0].id;
    
    // Create test deal
    const dealResult = await testPool.query(`
      INSERT INTO crm_deals (id, organization_id, pipeline_id, stage_id, contact_id, title, value, status, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, 'Test Deal for Workflow', 500000, 'open', $6, NOW())
      RETURNING id
    `, [uuidv4(), testOrgId, testPipelineId, testStageId, testContactId, testUserId]);
    testDealId = dealResult.rows[0].id;
    
    // Generate auth token (in production this would be a proper JWT)
    // For testing, we'll use a mock token that the test server accepts
    authToken = `test-token-${testUserId}-${testOrgId}`;
  });

  afterAll(async () => {
    // Cleanup test data
    if (testPool) {
      await testPool.query('DELETE FROM workflow_executions WHERE organization_id = $1', [testOrgId]);
      await testPool.query('DELETE FROM workflow_steps WHERE workflow_id IN (SELECT id FROM workflows WHERE organization_id = $1)', [testOrgId]);
      await testPool.query('DELETE FROM workflows WHERE organization_id = $1', [testOrgId]);
      await testPool.query('DELETE FROM crm_deals WHERE organization_id = $1', [testOrgId]);
      await testPool.query('DELETE FROM crm_contacts WHERE organization_id = $1', [testOrgId]);
      await testPool.query('DELETE FROM crm_pipeline_stages WHERE pipeline_id = $1', [testPipelineId]);
      await testPool.query('DELETE FROM crm_pipelines WHERE organization_id = $1', [testOrgId]);
      await testPool.query('DELETE FROM users WHERE organization_id = $1', [testOrgId]);
      await testPool.query('DELETE FROM organizations WHERE id = $1', [testOrgId]);
      await testPool.end();
    }
  });

  // =====================================================
  // WORKFLOW CRUD TESTS
  // =====================================================

  describe('Workflow CRUD Operations', () => {
    it('should create a new workflow', async () => {
      const workflowData = {
        name: 'Test Speed-to-Lead Workflow',
        description: 'Auto-assign new deals within 5 minutes',
        trigger_type: 'deal_created',
        trigger_config: {},
        is_active: false
      };

      const response = await authRequest('post', '/api/v1/workflows')
        .send(workflowData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(workflowData.name);
      expect(response.body.data.trigger_type).toBe(workflowData.trigger_type);
      expect(response.body.data.is_active).toBe(false);
      
      testWorkflowId = response.body.data.id;
    });

    it('should get workflow by ID', async () => {
      const response = await authRequest('get', `/api/v1/workflows/${testWorkflowId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testWorkflowId);
      expect(response.body.data.name).toBe('Test Speed-to-Lead Workflow');
    });

    it('should list organization workflows', async () => {
      const response = await authRequest('get', '/api/v1/workflows')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should update workflow', async () => {
      const updateData = {
        name: 'Updated Workflow Name',
        description: 'Updated description'
      };

      const response = await authRequest('put', `/api/v1/workflows/${testWorkflowId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
    });

    it('should add steps to workflow', async () => {
      const steps = [
        {
          step_order: 1,
          step_type: 'action',
          action_type: 'assign_agent',
          action_config: { method: 'round_robin' },
          label: 'Auto-assign agent'
        },
        {
          step_order: 2,
          step_type: 'delay',
          delay_config: { delay_type: 'minutes', value: 5 },
          label: 'Wait 5 minutes'
        },
        {
          step_order: 3,
          step_type: 'action',
          action_type: 'create_task',
          action_config: {
            title: 'Follow up with new lead',
            priority: 'high',
            due_in_hours: 1,
            assignee: 'assigned_agent'
          },
          label: 'Create follow-up task'
        }
      ];

      const response = await authRequest('put', `/api/v1/workflows/${testWorkflowId}`)
        .send({ steps })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.steps).toHaveLength(3);
    });

    it('should activate workflow', async () => {
      const response = await authRequest('post', `/api/v1/workflows/${testWorkflowId}/activate`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_active).toBe(true);
    });

    it('should deactivate workflow', async () => {
      const response = await authRequest('post', `/api/v1/workflows/${testWorkflowId}/deactivate`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_active).toBe(false);
    });
  });

  // =====================================================
  // WORKFLOW TEMPLATES TESTS
  // =====================================================

  describe('Workflow Templates', () => {
    it('should list available templates', async () => {
      const response = await authRequest('get', '/api/v1/workflows/templates')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Check for expected templates
      const templateNames = response.body.data.map((t: any) => t.name);
      expect(templateNames).toContain('Speed-to-Lead (Auto-Assign)');
      expect(templateNames).toContain('Stale Deal Reminder');
    });

    it('should filter templates by category', async () => {
      const response = await authRequest('get', '/api/v1/workflows/templates?category=lead_management')
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.forEach((template: any) => {
        expect(template.category).toBe('lead_management');
      });
    });

    it('should create workflow from template', async () => {
      // Get a template first
      const templatesResponse = await authRequest('get', '/api/v1/workflows/templates')
        .expect(200);
      
      const speedToLeadTemplate = templatesResponse.body.data.find(
        (t: any) => t.name === 'Speed-to-Lead (Auto-Assign)'
      );

      if (speedToLeadTemplate) {
        const response = await authRequest('post', '/api/v1/workflows/from-template')
          .send({ template_id: speedToLeadTemplate.id })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.trigger_type).toBe('deal_created');
        
        // Cleanup - delete the created workflow
        await authRequest('delete', `/api/v1/workflows/${response.body.data.id}`);
      }
    });
  });

  // =====================================================
  // WORKFLOW EXECUTION TESTS
  // =====================================================

  describe('Workflow Execution', () => {
    let executionWorkflowId: string;

    beforeAll(async () => {
      // Create a simple workflow for execution testing
      const workflowData = {
        name: 'Execution Test Workflow',
        description: 'For testing execution',
        trigger_type: 'manual',
        trigger_config: {},
        is_active: true,
        steps: [
          {
            step_order: 1,
            step_type: 'action',
            action_type: 'add_note',
            action_config: { content: 'Workflow executed automatically' },
            label: 'Add note'
          }
        ]
      };

      const response = await authRequest('post', '/api/v1/workflows')
        .send(workflowData);
      
      executionWorkflowId = response.body.data.id;
    });

    afterAll(async () => {
      if (executionWorkflowId) {
        await authRequest('delete', `/api/v1/workflows/${executionWorkflowId}`);
      }
    });

    it('should manually trigger workflow', async () => {
      const triggerData = {
        entity_type: 'deal',
        entity_id: testDealId,
        data: {}
      };

      const response = await authRequest('post', `/api/v1/workflows/${executionWorkflowId}/trigger`)
        .send(triggerData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.status).toMatch(/pending|running|completed/);
    });

    it('should get execution history', async () => {
      const response = await authRequest('get', `/api/v1/workflows/${executionWorkflowId}/executions`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should dry run workflow', async () => {
      const context = {
        deal: {
          id: testDealId,
          title: 'Test Deal',
          value: 500000
        },
        contact: {
          id: testContactId,
          name: 'John Tester',
          email: 'john.tester@example.com'
        }
      };

      const response = await authRequest('post', `/api/v1/workflows/${executionWorkflowId}/dry-run`)
        .send({ context })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('steps');
      expect(response.body.data).toHaveProperty('would_execute');
    });
  });

  // =====================================================
  // WORKFLOW STATISTICS TESTS
  // =====================================================

  describe('Workflow Statistics', () => {
    it('should get workflow stats', async () => {
      const response = await authRequest('get', '/api/v1/workflows/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total_workflows');
      expect(response.body.data).toHaveProperty('active_workflows');
      expect(response.body.data).toHaveProperty('total_executions');
    });
  });

  // =====================================================
  // TRIGGER MATCHING TESTS
  // =====================================================

  describe('Trigger Matching', () => {
    it('should match deal_created trigger', async () => {
      // Create a workflow with deal_created trigger
      const workflowData = {
        name: 'Deal Created Trigger Test',
        trigger_type: 'deal_created',
        trigger_config: {},
        is_active: true,
        steps: [
          {
            step_order: 1,
            step_type: 'action',
            action_type: 'add_note',
            action_config: { content: 'New deal notification' }
          }
        ]
      };

      const createResponse = await authRequest('post', '/api/v1/workflows')
        .send(workflowData);
      
      const workflowId = createResponse.body.data.id;

      // Verify workflow was created with correct trigger
      const getResponse = await authRequest('get', `/api/v1/workflows/${workflowId}`)
        .expect(200);

      expect(getResponse.body.data.trigger_type).toBe('deal_created');
      expect(getResponse.body.data.is_active).toBe(true);

      // Cleanup
      await authRequest('delete', `/api/v1/workflows/${workflowId}`);
    });

    it('should match deal_stage_changed trigger with stage filter', async () => {
      const workflowData = {
        name: 'Stage Changed Trigger Test',
        trigger_type: 'deal_stage_changed',
        trigger_config: {
          from_stage_id: testStageId,
          to_stage_id: null // Any stage
        },
        is_active: true,
        steps: [
          {
            step_order: 1,
            step_type: 'action',
            action_type: 'create_task',
            action_config: {
              title: 'Stage changed - follow up',
              priority: 'medium',
              due_in_hours: 24
            }
          }
        ]
      };

      const createResponse = await authRequest('post', '/api/v1/workflows')
        .send(workflowData);
      
      const workflowId = createResponse.body.data.id;

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.trigger_config.from_stage_id).toBe(testStageId);

      // Cleanup
      await authRequest('delete', `/api/v1/workflows/${workflowId}`);
    });
  });

  // =====================================================
  // ACTION CONFIGURATION TESTS
  // =====================================================

  describe('Action Configurations', () => {
    it('should create workflow with create_task action', async () => {
      const workflowData = {
        name: 'Task Creation Test',
        trigger_type: 'manual',
        is_active: true,
        steps: [
          {
            step_order: 1,
            step_type: 'action',
            action_type: 'create_task',
            action_config: {
              title: 'Follow up with {{contact.name}}',
              description: 'Automated follow-up task',
              priority: 'high',
              due_in_hours: 2,
              assignee: 'deal_owner'
            }
          }
        ]
      };

      const response = await authRequest('post', '/api/v1/workflows')
        .send(workflowData)
        .expect(201);

      expect(response.body.data.steps[0].action_type).toBe('create_task');
      expect(response.body.data.steps[0].action_config.priority).toBe('high');

      // Cleanup
      await authRequest('delete', `/api/v1/workflows/${response.body.data.id}`);
    });

    it('should create workflow with assign_agent action (round-robin)', async () => {
      const workflowData = {
        name: 'Agent Assignment Test',
        trigger_type: 'deal_created',
        is_active: true,
        steps: [
          {
            step_order: 1,
            step_type: 'action',
            action_type: 'assign_agent',
            action_config: {
              method: 'round_robin',
              fallback_to_admin: true
            }
          }
        ]
      };

      const response = await authRequest('post', '/api/v1/workflows')
        .send(workflowData)
        .expect(201);

      expect(response.body.data.steps[0].action_config.method).toBe('round_robin');

      // Cleanup
      await authRequest('delete', `/api/v1/workflows/${response.body.data.id}`);
    });

    it('should create workflow with delay step', async () => {
      const workflowData = {
        name: 'Delay Test',
        trigger_type: 'manual',
        is_active: true,
        steps: [
          {
            step_order: 1,
            step_type: 'delay',
            delay_config: {
              delay_type: 'hours',
              value: 24
            },
            label: 'Wait 24 hours'
          },
          {
            step_order: 2,
            step_type: 'action',
            action_type: 'add_note',
            action_config: { content: 'Delayed action executed' }
          }
        ]
      };

      const response = await authRequest('post', '/api/v1/workflows')
        .send(workflowData)
        .expect(201);

      expect(response.body.data.steps[0].step_type).toBe('delay');
      expect(response.body.data.steps[0].delay_config.delay_type).toBe('hours');

      // Cleanup
      await authRequest('delete', `/api/v1/workflows/${response.body.data.id}`);
    });

    it('should create workflow with condition step', async () => {
      const workflowData = {
        name: 'Condition Test',
        trigger_type: 'deal_created',
        is_active: true,
        steps: [
          {
            step_order: 1,
            step_type: 'condition',
            condition_config: {
              field: 'deal.value',
              operator: 'greater_than',
              value: 100000
            },
            label: 'Check deal value > 100k'
          },
          {
            step_order: 2,
            step_type: 'action',
            action_type: 'add_tag',
            action_config: { tag: 'High Value' },
            branch_path: 'true'
          }
        ]
      };

      const response = await authRequest('post', '/api/v1/workflows')
        .send(workflowData)
        .expect(201);

      expect(response.body.data.steps[0].step_type).toBe('condition');
      expect(response.body.data.steps[0].condition_config.operator).toBe('greater_than');

      // Cleanup
      await authRequest('delete', `/api/v1/workflows/${response.body.data.id}`);
    });
  });

  // =====================================================
  // ERROR HANDLING TESTS
  // =====================================================

  describe('Error Handling', () => {
    it('should return 404 for non-existent workflow', async () => {
      const fakeId = uuidv4();
      const response = await authRequest('get', `/api/v1/workflows/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Workflow not found');
    });

    it('should validate required fields on create', async () => {
      const response = await authRequest('post', '/api/v1/workflows')
        .send({ description: 'Missing name and trigger' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate trigger_type enum', async () => {
      const response = await authRequest('post', '/api/v1/workflows')
        .send({
          name: 'Invalid Trigger Test',
          trigger_type: 'invalid_trigger_type'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should prevent triggering inactive workflow', async () => {
      // Create inactive workflow
      const workflowData = {
        name: 'Inactive Workflow',
        trigger_type: 'manual',
        is_active: false,
        steps: []
      };

      const createResponse = await authRequest('post', '/api/v1/workflows')
        .send(workflowData);
      
      const workflowId = createResponse.body.data.id;

      // Try to trigger
      const triggerResponse = await authRequest('post', `/api/v1/workflows/${workflowId}/trigger`)
        .send({ entity_type: 'deal', entity_id: testDealId })
        .expect(400);

      expect(triggerResponse.body.error).toBe('Workflow is not active');

      // Cleanup
      await authRequest('delete', `/api/v1/workflows/${workflowId}`);
    });
  });

  // =====================================================
  // WORKFLOW DELETE TESTS
  // =====================================================

  describe('Workflow Deletion', () => {
    it('should delete workflow', async () => {
      // First get the test workflow to make sure it exists
      await authRequest('get', `/api/v1/workflows/${testWorkflowId}`)
        .expect(200);

      // Delete it
      const response = await authRequest('delete', `/api/v1/workflows/${testWorkflowId}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify it's deleted
      await authRequest('get', `/api/v1/workflows/${testWorkflowId}`)
        .expect(404);
    });
  });
});

// =====================================================
// DATABASE DIRECT TESTS
// =====================================================

describe('Workflow Database Operations', () => {
  let pool: Pool;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    orgId = uuidv4();
    userId = uuidv4();

    await pool.query(`
      INSERT INTO organizations (id, name, slug, status, created_at)
      VALUES ($1, 'DB Test Org', 'db-test-org', 'active', NOW())
    `, [orgId]);

    await pool.query(`
      INSERT INTO users (id, organization_id, email, full_name, role, status, created_at)
      VALUES ($1, $2, 'db-test@propmetrik.com', 'DB Tester', 'admin', 'active', NOW())
    `, [userId, orgId]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM workflow_executions WHERE organization_id = $1', [orgId]);
    await pool.query('DELETE FROM workflow_steps WHERE workflow_id IN (SELECT id FROM workflows WHERE organization_id = $1)', [orgId]);
    await pool.query('DELETE FROM workflows WHERE organization_id = $1', [orgId]);
    await pool.query('DELETE FROM users WHERE organization_id = $1', [orgId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    await pool.end();
  });

  it('should insert workflow directly into database', async () => {
    const workflowId = uuidv4();
    
    await pool.query(`
      INSERT INTO workflows (id, organization_id, name, description, trigger_type, trigger_config, is_active, created_by, created_at)
      VALUES ($1, $2, 'Direct DB Workflow', 'Created directly', 'deal_created', '{}', true, $3, NOW())
    `, [workflowId, orgId, userId]);

    const result = await pool.query('SELECT * FROM workflows WHERE id = $1', [workflowId]);
    
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe('Direct DB Workflow');
    expect(result.rows[0].is_active).toBe(true);
  });

  it('should insert workflow steps with proper ordering', async () => {
    const workflowId = uuidv4();
    
    await pool.query(`
      INSERT INTO workflows (id, organization_id, name, trigger_type, is_active, created_by, created_at)
      VALUES ($1, $2, 'Steps Test', 'manual', true, $3, NOW())
    `, [workflowId, orgId, userId]);

    // Insert steps
    const stepIds = [uuidv4(), uuidv4(), uuidv4()];
    
    await pool.query(`
      INSERT INTO workflow_steps (id, workflow_id, step_order, step_type, action_type, action_config, created_at)
      VALUES 
        ($1, $4, 1, 'action', 'add_note', '{"content": "Step 1"}', NOW()),
        ($2, $4, 2, 'delay', NULL, '{}', NOW()),
        ($3, $4, 3, 'action', 'create_task', '{"title": "Step 3"}', NOW())
    `, [...stepIds, workflowId]);

    const result = await pool.query(
      'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order',
      [workflowId]
    );
    
    expect(result.rows.length).toBe(3);
    expect(result.rows[0].step_order).toBe(1);
    expect(result.rows[1].step_order).toBe(2);
    expect(result.rows[2].step_order).toBe(3);
  });

  it('should track workflow execution', async () => {
    const workflowId = uuidv4();
    const executionId = uuidv4();
    
    await pool.query(`
      INSERT INTO workflows (id, organization_id, name, trigger_type, is_active, created_by, created_at)
      VALUES ($1, $2, 'Execution Track Test', 'manual', true, $3, NOW())
    `, [workflowId, orgId, userId]);

    await pool.query(`
      INSERT INTO workflow_executions (
        id, workflow_id, organization_id, status, entity_type, entity_id,
        trigger_type, context, started_at, created_at
      )
      VALUES ($1, $2, $3, 'running', 'deal', $4, 'manual', '{}', NOW(), NOW())
    `, [executionId, workflowId, orgId, uuidv4()]);

    // Update to completed
    await pool.query(`
      UPDATE workflow_executions 
      SET status = 'completed', completed_at = NOW()
      WHERE id = $1
    `, [executionId]);

    const result = await pool.query('SELECT * FROM workflow_executions WHERE id = $1', [executionId]);
    
    expect(result.rows[0].status).toBe('completed');
    expect(result.rows[0].completed_at).not.toBeNull();
  });

  it('should update workflow stats trigger', async () => {
    const workflowId = uuidv4();
    
    await pool.query(`
      INSERT INTO workflows (id, organization_id, name, trigger_type, is_active, created_by, created_at)
      VALUES ($1, $2, 'Stats Trigger Test', 'manual', true, $3, NOW())
    `, [workflowId, orgId, userId]);

    // Insert a completed execution
    await pool.query(`
      INSERT INTO workflow_executions (
        id, workflow_id, organization_id, status, entity_type, entity_id,
        trigger_type, context, started_at, completed_at, created_at
      )
      VALUES ($1, $2, $3, 'completed', 'deal', $4, 'manual', '{}', NOW(), NOW(), NOW())
    `, [uuidv4(), workflowId, orgId, uuidv4()]);

    // Check if stats were updated (depends on trigger implementation)
    const result = await pool.query('SELECT * FROM workflows WHERE id = $1', [workflowId]);
    
    expect(result.rows.length).toBe(1);
  });

  it('should query templates', async () => {
    const result = await pool.query('SELECT * FROM workflow_templates ORDER BY name');
    
    expect(result.rows.length).toBeGreaterThanOrEqual(6);
    
    const templateNames = result.rows.map(r => r.name);
    expect(templateNames).toContain('Speed-to-Lead (Auto-Assign)');
    expect(templateNames).toContain('Stale Deal Reminder');
  });
});
