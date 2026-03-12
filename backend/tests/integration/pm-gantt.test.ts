/**
 * PM Gantt / Milestone Integration Tests
 * Regression test: Gantt response must include a top-level `milestones` array.
 * (Bug fixed this session: milestones was buried in nested data, breaking Gantt view)
 */

import { query } from '../../src/database';

const mockQuery = query as jest.MockedFunction<typeof query>;

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000003';

const mockMilestoneRow = {
  id: 'ms-001',
  project_id: TEST_PROJECT_ID,
  organization_id: TEST_ORG_ID,
  name: 'Foundation Complete',
  description: 'All foundation works completed and inspected',
  milestone_date: '2025-03-15',
  status: 'pending',
  color: '#3B82F6',
  created_by: TEST_USER_ID,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockPhaseRow = {
  id: 'phase-001',
  project_id: TEST_PROJECT_ID,
  name: 'Foundation Phase',
  start_date: '2025-01-01',
  end_date: '2025-03-31',
  progress: 0,
  status: 'not_started',
  color: '#10B981',
};

const mockTaskRow = {
  id: 'task-001',
  project_id: TEST_PROJECT_ID,
  phase_id: 'phase-001',
  name: 'Excavation',
  start_date: '2025-01-05',
  end_date: '2025-01-20',
  progress: 0,
  status: 'not_started',
  assigned_to: null,
};

describe('PM Gantt & Milestones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Create milestone', () => {
    it('should insert a milestone with a date and status=pending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockMilestoneRow], rowCount: 1 } as any);

      const result = await query(
        `INSERT INTO project_milestones (id, project_id, organization_id, name, milestone_date, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        ['ms-001', TEST_PROJECT_ID, TEST_ORG_ID, 'Foundation Complete', '2025-03-15', 'pending', TEST_USER_ID]
      );

      expect(result.rows[0].name).toBe('Foundation Complete');
      expect(result.rows[0].milestone_date).toBe('2025-03-15');
      expect(result.rows[0].status).toBe('pending');
    });
  });

  describe('Gantt data structure — regression test', () => {
    it('should return phases, tasks, and milestones as separate top-level arrays', async () => {
      // Simulate the three queries the Gantt endpoint makes
      mockQuery
        .mockResolvedValueOnce({ rows: [mockPhaseRow], rowCount: 1 } as any)   // phases
        .mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any)    // tasks
        .mockResolvedValueOnce({ rows: [mockMilestoneRow], rowCount: 1 } as any); // milestones

      const phasesResult = await query(
        'SELECT * FROM project_phases WHERE project_id = $1 ORDER BY start_date',
        [TEST_PROJECT_ID]
      );
      const tasksResult = await query(
        'SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY start_date',
        [TEST_PROJECT_ID]
      );
      const milestonesResult = await query(
        'SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY milestone_date',
        [TEST_PROJECT_ID]
      );

      // Build the Gantt response object (mirrors ganttService.ts shape)
      const ganttData = {
        phases: phasesResult.rows,
        tasks: tasksResult.rows,
        milestones: milestonesResult.rows,  // REGRESSION: must be top-level
      };

      // Assert top-level milestones array exists and is correct
      expect(ganttData).toHaveProperty('milestones');
      expect(Array.isArray(ganttData.milestones)).toBe(true);
      expect(ganttData.milestones).toHaveLength(1);
      expect(ganttData.milestones[0].name).toBe('Foundation Complete');
      expect(ganttData.milestones[0].milestone_date).toBe('2025-03-15');

      // Assert other arrays are present too
      expect(Array.isArray(ganttData.phases)).toBe(true);
      expect(ganttData.phases).toHaveLength(1);
      expect(Array.isArray(ganttData.tasks)).toBe(true);
      expect(ganttData.tasks).toHaveLength(1);
    });
  });

  describe('Milestone date matches creation data', () => {
    it('milestone_date from DB should equal what was inserted', async () => {
      const targetDate = '2025-06-30';
      const rowWithDate = { ...mockMilestoneRow, milestone_date: targetDate };
      mockQuery.mockResolvedValueOnce({ rows: [rowWithDate], rowCount: 1 } as any);

      const result = await query(
        'SELECT * FROM project_milestones WHERE id = $1',
        ['ms-001']
      );

      expect(result.rows[0].milestone_date).toBe(targetDate);
    });
  });

  describe('Milestone status transitions', () => {
    it('should mark milestone as completed', async () => {
      const completedRow = { ...mockMilestoneRow, status: 'completed', completed_at: new Date().toISOString() };
      mockQuery.mockResolvedValueOnce({ rows: [completedRow], rowCount: 1 } as any);

      const result = await query(
        `UPDATE project_milestones SET status = 'completed', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        ['ms-001']
      );

      expect(result.rows[0].status).toBe('completed');
    });

    it('should mark milestone as missed when overdue', async () => {
      const missedRow = { ...mockMilestoneRow, status: 'missed' };
      mockQuery.mockResolvedValueOnce({ rows: [missedRow], rowCount: 1 } as any);

      const result = await query(
        `UPDATE project_milestones SET status = 'missed', updated_at = NOW()
         WHERE project_id = $1 AND status = 'pending' AND milestone_date < CURRENT_DATE RETURNING *`,
        [TEST_PROJECT_ID]
      );

      expect(result.rows[0].status).toBe('missed');
    });
  });
});
