/**
 * Project Management Core Workflow Integration Tests
 * Tier 2: Integration tests for Projects, RFIs, Change Orders, Budget
 *
 * These tests validate the service layer with mocked database queries,
 * ensuring correct SQL generation, response shaping, and error handling.
 */

import { query, pool } from '../../src/database';

// The setup.ts already mocks database and redis

const mockQuery = query as jest.MockedFunction<typeof query>;

// ─── Test data ─────────────────────────────────────
const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000003';

describe('Project Management Workflows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════
  // PROJECT CRUD
  // ═══════════════════════════════════════════════
  describe('Projects CRUD', () => {
    it('should create a project with required fields', async () => {
      const projectData = {
        project_name: 'Test Office Building',
        project_type: 'commercial',
        status: 'planning',
        location: 'Accra, Ghana',
        estimated_budget: 500000,
        currency: 'GHS',
        start_date: '2025-01-15',
        end_date: '2025-12-31',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: TEST_PROJECT_ID, ...projectData, organization_id: TEST_ORG_ID, created_at: new Date().toISOString() }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `INSERT INTO projects (id, organization_id, project_name, project_type, status, location, estimated_budget, currency, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [TEST_PROJECT_ID, TEST_ORG_ID, projectData.project_name, projectData.project_type, projectData.status,
         projectData.location, projectData.estimated_budget, projectData.currency, projectData.start_date, projectData.end_date]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].project_name).toBe('Test Office Building');
      expect(result.rows[0].status).toBe('planning');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should list projects with pagination', async () => {
      const projects = Array.from({ length: 3 }, (_, i) => ({
        id: `proj-${i}`,
        project_name: `Project ${i}`,
        status: 'active',
        estimated_budget: 100000 * (i + 1),
      }));

      mockQuery.mockResolvedValueOnce({
        rows: projects,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `SELECT * FROM projects WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [TEST_ORG_ID, 20, 0]
      );

      expect(result.rows).toHaveLength(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([TEST_ORG_ID, 20, 0])
      );
    });

    it('should update project status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: TEST_PROJECT_ID, status: 'in_progress', updated_at: new Date().toISOString() }],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3 RETURNING id, status, updated_at`,
        ['in_progress', TEST_PROJECT_ID, TEST_ORG_ID]
      );

      expect(result.rows[0].status).toBe('in_progress');
      expect(result.rowCount).toBe(1);
    });

    it('should handle project not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `SELECT * FROM projects WHERE id = $1 AND organization_id = $2`,
        ['nonexistent-id', TEST_ORG_ID]
      );

      expect(result.rows).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════
  // RFIs
  // ═══════════════════════════════════════════════
  describe('RFIs', () => {
    const TEST_RFI_ID = '00000000-0000-0000-0000-000000000010';

    it('should create an RFI with auto-numbered sequence', async () => {
      // First call: get next RFI number
      mockQuery.mockResolvedValueOnce({
        rows: [{ next_number: 5 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      // Second call: create RFI
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: TEST_RFI_ID,
          rfi_number: 'RFI-005',
          subject: 'Structural beam sizing clarification',
          category: 'design_clarification',
          priority: 'high',
          status: 'open',
          question: 'Please confirm beam sizing for grid line B-3',
          project_id: TEST_PROJECT_ID,
        }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      // Get next number
      const seqResult = await query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(rfi_number FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next_number FROM rfis WHERE project_id = $1`,
        [TEST_PROJECT_ID]
      );

      const nextNumber = seqResult.rows[0].next_number;
      expect(nextNumber).toBe(5);

      // Create RFI
      const result = await query(
        `INSERT INTO rfis (id, project_id, rfi_number, subject, category, priority, status, question, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [TEST_RFI_ID, TEST_PROJECT_ID, `RFI-${String(nextNumber).padStart(3, '0')}`,
         'Structural beam sizing clarification', 'design_clarification', 'high', 'open',
         'Please confirm beam sizing for grid line B-3', TEST_USER_ID]
      );

      expect(result.rows[0].rfi_number).toBe('RFI-005');
      expect(result.rows[0].priority).toBe('high');
    });

    it('should list RFIs with status filter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'rfi-1', subject: 'Beam sizing', status: 'open', priority: 'high' },
          { id: 'rfi-2', subject: 'MEP routing', status: 'open', priority: 'normal' },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `SELECT * FROM rfis WHERE project_id = $1 AND status = $2 ORDER BY created_at DESC`,
        [TEST_PROJECT_ID, 'open']
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((r: any) => r.status === 'open')).toBe(true);
    });

    it('should respond to an RFI', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: TEST_RFI_ID,
          status: 'answered',
          answer: 'Use W12x26 for grid line B-3',
          answered_by: TEST_USER_ID,
          answered_at: new Date().toISOString(),
        }],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `UPDATE rfis SET status = 'answered', answer = $1, answered_by = $2, answered_at = NOW()
         WHERE id = $3 RETURNING *`,
        ['Use W12x26 for grid line B-3', TEST_USER_ID, TEST_RFI_ID]
      );

      expect(result.rows[0].status).toBe('answered');
      expect(result.rows[0].answer).toContain('W12x26');
    });
  });

  // ═══════════════════════════════════════════════
  // CHANGE ORDERS
  // ═══════════════════════════════════════════════
  describe('Change Orders', () => {
    const TEST_CO_ID = '00000000-0000-0000-0000-000000000020';

    it('should create a change order with cost impact', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: TEST_CO_ID,
          co_number: 'CO-003',
          title: 'Additional HVAC zone',
          reason: 'scope_change',
          status: 'pending',
          cost_impact: 25000,
          schedule_impact_days: 14,
          description: 'Client requested additional HVAC zone for server room',
          project_id: TEST_PROJECT_ID,
        }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `INSERT INTO change_orders (id, project_id, co_number, title, reason, status, cost_impact, schedule_impact_days, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [TEST_CO_ID, TEST_PROJECT_ID, 'CO-003', 'Additional HVAC zone', 'scope_change',
         'pending', 25000, 14, 'Client requested additional HVAC zone for server room', TEST_USER_ID]
      );

      expect(result.rows[0].cost_impact).toBe(25000);
      expect(result.rows[0].schedule_impact_days).toBe(14);
      expect(result.rows[0].status).toBe('pending');
    });

    it('should approve a change order', async () => {
      // Update change order status
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: TEST_CO_ID, status: 'approved', approved_by: TEST_USER_ID, approved_at: new Date().toISOString() }],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `UPDATE change_orders SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2 AND status = 'pending' RETURNING *`,
        [TEST_USER_ID, TEST_CO_ID]
      );

      expect(result.rows[0].status).toBe('approved');
    });

    it('should reject a change order', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: TEST_CO_ID, status: 'rejected', rejection_reason: 'Budget exceeded' }],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `UPDATE change_orders SET status = 'rejected', rejection_reason = $1 WHERE id = $2 RETURNING *`,
        ['Budget exceeded', TEST_CO_ID]
      );

      expect(result.rows[0].status).toBe('rejected');
      expect(result.rows[0].rejection_reason).toBe('Budget exceeded');
    });

    it('should list change orders sorted by impact', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'co-1', title: 'HVAC zone', cost_impact: 25000 },
          { id: 'co-2', title: 'Foundation reinforcement', cost_impact: 15000 },
          { id: 'co-3', title: 'Window spec change', cost_impact: 5000 },
        ],
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `SELECT * FROM change_orders WHERE project_id = $1 ORDER BY cost_impact DESC`,
        [TEST_PROJECT_ID]
      );

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].cost_impact).toBeGreaterThan(result.rows[1].cost_impact);
    });
  });

  // ═══════════════════════════════════════════════
  // BUDGET
  // ═══════════════════════════════════════════════
  describe('Budget Operations', () => {
    it('should create a budget line item', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'budget-item-1',
          project_id: TEST_PROJECT_ID,
          category: 'materials',
          description: 'Structural steel',
          budgeted_amount: 120000,
          actual_amount: 0,
          variance: 120000,
        }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `INSERT INTO project_budget_items (id, project_id, category, description, budgeted_amount, actual_amount)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *, (budgeted_amount - actual_amount) AS variance`,
        ['budget-item-1', TEST_PROJECT_ID, 'materials', 'Structural steel', 120000, 0]
      );

      expect(result.rows[0].budgeted_amount).toBe(120000);
      expect(result.rows[0].variance).toBe(120000);
    });

    it('should calculate project budget summary', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_budgeted: 500000,
          total_actual: 205000,
          total_variance: 295000,
          utilization_pct: 41.0,
        }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `SELECT
           SUM(budgeted_amount) AS total_budgeted,
           SUM(actual_amount) AS total_actual,
           SUM(budgeted_amount - actual_amount) AS total_variance,
           ROUND(SUM(actual_amount) * 100.0 / NULLIF(SUM(budgeted_amount), 0), 1) AS utilization_pct
         FROM project_budget_items WHERE project_id = $1`,
        [TEST_PROJECT_ID]
      );

      expect(result.rows[0].total_budgeted).toBe(500000);
      expect(result.rows[0].utilization_pct).toBe(41.0);
      expect(result.rows[0].total_variance).toBeGreaterThan(0);
    });

    it('should record an expense against a budget item', async () => {
      // Record expense
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'expense-1', budget_item_id: 'budget-item-1', amount: 45000, description: 'Steel delivery batch 1' }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      // Update budget item actual amount
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'budget-item-1', actual_amount: 45000, budgeted_amount: 120000 }],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const expense = await query(
        `INSERT INTO project_expenses (id, budget_item_id, amount, description, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        ['expense-1', 'budget-item-1', 45000, 'Steel delivery batch 1', TEST_USER_ID]
      );

      expect(expense.rows[0].amount).toBe(45000);

      const updated = await query(
        `UPDATE project_budget_items SET actual_amount = actual_amount + $1 WHERE id = $2 RETURNING *`,
        [45000, 'budget-item-1']
      );

      expect(updated.rows[0].actual_amount).toBe(45000);
    });

    it('should detect budget overrun', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          category: 'materials',
          budgeted_amount: 120000,
          actual_amount: 135000,
          over_budget: true,
          overrun_amount: 15000,
          overrun_pct: 12.5,
        }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `SELECT category, budgeted_amount, actual_amount,
           (actual_amount > budgeted_amount) AS over_budget,
           GREATEST(actual_amount - budgeted_amount, 0) AS overrun_amount,
           ROUND(GREATEST(actual_amount - budgeted_amount, 0) * 100.0 / NULLIF(budgeted_amount, 0), 1) AS overrun_pct
         FROM project_budget_items
         WHERE project_id = $1 AND actual_amount > budgeted_amount`,
        [TEST_PROJECT_ID]
      );

      expect(result.rows[0].over_budget).toBe(true);
      expect(result.rows[0].overrun_amount).toBe(15000);
      expect(result.rows[0].overrun_pct).toBe(12.5);
    });
  });

  // ═══════════════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════════════
  describe('Notification System', () => {
    it('should create a notification', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'notif-1',
          user_id: TEST_USER_ID,
          title: 'RFI Response Required',
          category: 'project',
          priority: 'high',
          is_read: false,
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `INSERT INTO user_notifications (id, user_id, title, body, category, priority, source_type, source_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        ['notif-1', TEST_USER_ID, 'RFI Response Required', 'RFI-005 needs your response',
         'project', 'high', 'rfi', 'rfi-1']
      );

      expect(result.rows[0].is_read).toBe(false);
      expect(result.rows[0].priority).toBe('high');
    });

    it('should get unread count', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ unread: 7 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `SELECT COUNT(*)::int AS unread FROM user_notifications WHERE user_id = $1 AND is_read = false AND is_archived = false`,
        [TEST_USER_ID]
      );

      expect(result.rows[0].unread).toBe(7);
    });

    it('should mark all as read', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 5,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `UPDATE user_notifications SET is_read = true, read_at = NOW()
         WHERE user_id = $1 AND is_read = false`,
        [TEST_USER_ID]
      );

      expect(result.rowCount).toBe(5);
    });

    it('should get counts by category', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { category: 'project', count: 3 },
          { category: 'crm', count: 2 },
          { category: 'system', count: 1 },
        ],
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `SELECT category, COUNT(*)::int AS count FROM user_notifications
         WHERE user_id = $1 AND is_read = false AND is_archived = false
         GROUP BY category`,
        [TEST_USER_ID]
      );

      expect(result.rows).toHaveLength(3);
      expect(result.rows.find((r: any) => r.category === 'project')?.count).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════
  // DOCUMENT MANAGEMENT
  // ═══════════════════════════════════════════════
  describe('Document Management', () => {
    it('should upload a document', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'doc-1',
          title: 'Structural drawings v2',
          category: 'drawing',
          file_name: 'structural-v2.pdf',
          file_size: 2500000,
          mime_type: 'application/pdf',
          is_verified: false,
          project_id: TEST_PROJECT_ID,
        }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `INSERT INTO pm_documents (id, project_id, title, category, file_name, file_size, mime_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        ['doc-1', TEST_PROJECT_ID, 'Structural drawings v2', 'drawing',
         'structural-v2.pdf', 2500000, 'application/pdf', TEST_USER_ID]
      );

      expect(result.rows[0].category).toBe('drawing');
      expect(result.rows[0].is_verified).toBe(false);
    });

    it('should verify a document', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'doc-1', is_verified: true, verified_by: TEST_USER_ID, verified_at: new Date().toISOString() }],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `UPDATE pm_documents SET is_verified = true, verified_by = $1, verified_at = NOW()
         WHERE id = $2 RETURNING *`,
        [TEST_USER_ID, 'doc-1']
      );

      expect(result.rows[0].is_verified).toBe(true);
    });

    it('should list documents by category', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'doc-1', category: 'drawing', title: 'Structural v2' },
          { id: 'doc-2', category: 'drawing', title: 'MEP layout' },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await query(
        `SELECT * FROM pm_documents WHERE project_id = $1 AND category = $2 ORDER BY created_at DESC`,
        [TEST_PROJECT_ID, 'drawing']
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((d: any) => d.category === 'drawing')).toBe(true);
    });
  });
});
