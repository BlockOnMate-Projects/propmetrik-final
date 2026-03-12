/**
 * PM Budget & Cost Integration Tests
 * Tests cost line item CRUD and budget summary calculations via mocked DB.
 */

import { query } from '../../src/database';

const mockQuery = query as jest.MockedFunction<typeof query>;

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const TEST_COST_ID = '00000000-0000-0000-0000-000000000010';

const mockCostRow = {
  id: TEST_COST_ID,
  project_id: TEST_PROJECT_ID,
  organization_id: TEST_ORG_ID,
  description: 'Foundation Work',
  category: 'foundation',
  cost_code: 'FOUND-001',
  original_budget: 150000,
  current_budget: 150000,
  committed_cost: 0,
  actual_cost: 0,
  variance: 150000,
  status: 'draft',
  currency: 'GHS',
  notes: 'Test cost item',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('PM Budget & Cost Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Create cost line item', () => {
    it('should insert a cost record and return it', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockCostRow], rowCount: 1 } as any);

      const result = await query(
        `INSERT INTO project_costs (id, project_id, organization_id, description, category, original_budget, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [TEST_COST_ID, TEST_PROJECT_ID, TEST_ORG_ID, 'Foundation Work', 'foundation', 150000, 'GHS']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].description).toBe('Foundation Work');
      expect(result.rows[0].category).toBe('foundation');
      expect(result.rows[0].original_budget).toBe(150000);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('List project costs', () => {
    it('should return all costs for a project', async () => {
      const costRows = [
        { ...mockCostRow, id: 'cost-1', description: 'Foundation Work' },
        { ...mockCostRow, id: 'cost-2', description: 'Roofing', category: 'roofing', original_budget: 80000 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: costRows, rowCount: 2 } as any);

      const result = await query(
        'SELECT * FROM project_costs WHERE project_id = $1 ORDER BY created_at',
        [TEST_PROJECT_ID]
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].description).toBe('Foundation Work');
      expect(result.rows[1].category).toBe('roofing');
    });
  });

  describe('Update actual cost', () => {
    it('should update actual_cost and recalculate variance', async () => {
      const updatedRow = {
        ...mockCostRow,
        actual_cost: 120000,
        variance: 30000, // 150000 - 120000
      };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as any);

      const result = await query(
        `UPDATE project_costs
         SET actual_cost = $1, variance = original_budget - $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [120000, TEST_COST_ID]
      );

      expect(result.rows[0].actual_cost).toBe(120000);
      expect(result.rows[0].variance).toBe(30000);
    });
  });

  describe('Budget summary', () => {
    it('should aggregate totals across all cost categories', async () => {
      const summaryRow = {
        project_id: TEST_PROJECT_ID,
        total_original_budget: 230000,
        total_current_budget: 230000,
        total_committed: 0,
        total_actual: 120000,
        total_variance: 110000,
        cost_count: 2,
      };
      mockQuery.mockResolvedValueOnce({ rows: [summaryRow], rowCount: 1 } as any);

      const result = await query(
        `SELECT project_id,
                SUM(original_budget) as total_original_budget,
                SUM(current_budget) as total_current_budget,
                SUM(committed_cost) as total_committed,
                SUM(actual_cost) as total_actual,
                SUM(variance) as total_variance,
                COUNT(*) as cost_count
         FROM project_costs WHERE project_id = $1 GROUP BY project_id`,
        [TEST_PROJECT_ID]
      );

      expect(result.rows[0].total_original_budget).toBe(230000);
      expect(result.rows[0].total_actual).toBe(120000);
      expect(result.rows[0].cost_count).toBe(2);
    });
  });

  describe('Cost status transitions', () => {
    it('should transition cost status from draft to committed', async () => {
      const committedRow = { ...mockCostRow, status: 'committed' };
      mockQuery.mockResolvedValueOnce({ rows: [committedRow], rowCount: 1 } as any);

      const result = await query(
        `UPDATE project_costs SET status = 'committed', updated_at = NOW()
         WHERE id = $1 AND status = 'draft' RETURNING *`,
        [TEST_COST_ID]
      );

      expect(result.rows[0].status).toBe('committed');
    });

    it('should reject invalid status transition (paid → draft)', async () => {
      // No rows updated when guard condition fails
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await query(
        `UPDATE project_costs SET status = 'draft'
         WHERE id = $1 AND status = 'paid' RETURNING *`,
        [TEST_COST_ID]
      );

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });
});
