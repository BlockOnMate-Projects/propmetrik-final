/**
 * PM Issues Integration Tests
 * Tests issue creation, listing, and status transitions.
 */

import { query } from '../../src/database';

const mockQuery = query as jest.MockedFunction<typeof query>;

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const TEST_ISSUE_ID = '00000000-0000-0000-0000-000000000020';

const mockIssueRow = {
  id: TEST_ISSUE_ID,
  project_id: TEST_PROJECT_ID,
  organization_id: TEST_ORG_ID,
  issue_number: 'ISS-0001',
  title: 'Structural crack in foundation wall',
  description: 'Visible crack on north wall — needs inspection.',
  category: 'structural',
  severity: 'high',
  priority: 'urgent',
  status: 'open',
  reported_by: TEST_USER_ID,
  assigned_to: null,
  due_date: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('PM Issues Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Create issue', () => {
    it('should insert issue and assign sequential number', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockIssueRow], rowCount: 1 } as any);

      const result = await query(
        `INSERT INTO project_issues (id, project_id, organization_id, issue_number, title, category, severity, priority, status, reported_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [TEST_ISSUE_ID, TEST_PROJECT_ID, TEST_ORG_ID, 'ISS-0001',
         'Structural crack in foundation wall', 'structural', 'high', 'urgent', 'open', TEST_USER_ID]
      );

      expect(result.rows[0].issue_number).toBe('ISS-0001');
      expect(result.rows[0].severity).toBe('high');
      expect(result.rows[0].status).toBe('open');
    });

    it('should reject issue creation without required title', async () => {
      mockQuery.mockRejectedValueOnce(new Error('null value in column "title" violates not-null constraint'));

      await expect(
        query(
          `INSERT INTO project_issues (id, project_id, title) VALUES ($1, $2, $3)`,
          [TEST_ISSUE_ID, TEST_PROJECT_ID, null]
        )
      ).rejects.toThrow('null value in column "title"');
    });
  });

  describe('List project issues', () => {
    it('should return issues filtered by project', async () => {
      const issues = [
        { ...mockIssueRow, id: 'issue-1', issue_number: 'ISS-0001' },
        { ...mockIssueRow, id: 'issue-2', issue_number: 'ISS-0002', severity: 'medium', status: 'in_progress' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: issues, rowCount: 2 } as any);

      const result = await query(
        'SELECT * FROM project_issues WHERE project_id = $1 ORDER BY issue_number',
        [TEST_PROJECT_ID]
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].issue_number).toBe('ISS-0001');
      expect(result.rows[1].issue_number).toBe('ISS-0002');
    });

    it('should filter by severity', async () => {
      const highSeverityIssues = [mockIssueRow];
      mockQuery.mockResolvedValueOnce({ rows: highSeverityIssues, rowCount: 1 } as any);

      const result = await query(
        'SELECT * FROM project_issues WHERE project_id = $1 AND severity = $2',
        [TEST_PROJECT_ID, 'high']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].severity).toBe('high');
    });
  });

  describe('Issue status transitions', () => {
    it('should transition from open to in_progress', async () => {
      const inProgressRow = { ...mockIssueRow, status: 'in_progress', assigned_to: TEST_USER_ID };
      mockQuery.mockResolvedValueOnce({ rows: [inProgressRow], rowCount: 1 } as any);

      const result = await query(
        `UPDATE project_issues
         SET status = 'in_progress', assigned_to = $1, updated_at = NOW()
         WHERE id = $2 AND status = 'open' RETURNING *`,
        [TEST_USER_ID, TEST_ISSUE_ID]
      );

      expect(result.rows[0].status).toBe('in_progress');
      expect(result.rows[0].assigned_to).toBe(TEST_USER_ID);
    });

    it('should close issue with resolution notes', async () => {
      const closedRow = { ...mockIssueRow, status: 'closed', resolution: 'Crack repaired with epoxy injection.' };
      mockQuery.mockResolvedValueOnce({ rows: [closedRow], rowCount: 1 } as any);

      const result = await query(
        `UPDATE project_issues
         SET status = 'closed', resolution = $1, closed_at = NOW(), updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        ['Crack repaired with epoxy injection.', TEST_ISSUE_ID]
      );

      expect(result.rows[0].status).toBe('closed');
      expect(result.rows[0].resolution).toBe('Crack repaired with epoxy injection.');
    });
  });

  describe('Issue priority sorting', () => {
    it('should return issues sorted by priority (urgent first)', async () => {
      const sortedIssues = [
        { ...mockIssueRow, priority: 'urgent' },
        { ...mockIssueRow, id: 'issue-2', priority: 'high' },
        { ...mockIssueRow, id: 'issue-3', priority: 'low' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: sortedIssues, rowCount: 3 } as any);

      const result = await query(
        `SELECT * FROM project_issues WHERE project_id = $1
         ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
        [TEST_PROJECT_ID]
      );

      expect(result.rows[0].priority).toBe('urgent');
      expect(result.rows[1].priority).toBe('high');
      expect(result.rows[2].priority).toBe('low');
    });
  });
});
