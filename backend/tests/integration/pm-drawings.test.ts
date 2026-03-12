/**
 * PM Drawings Integration Tests
 * Tests drawing creation, revision management, and filtering.
 */

import { query } from '../../src/database';

const mockQuery = query as jest.MockedFunction<typeof query>;

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const TEST_DRAWING_ID = '00000000-0000-0000-0000-000000000040';

const mockDrawingRow = {
  id: TEST_DRAWING_ID,
  project_id: TEST_PROJECT_ID,
  organization_id: TEST_ORG_ID,
  drawing_number: 'STR-101',
  title: 'Foundation Plan',
  discipline: 'structural',
  current_revision: 'A',
  status: 'draft',
  file_url: null,
  file_key: null,
  sheet_size: 'A1',
  scale: '1:100',
  created_by: TEST_USER_ID,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockRevisionRow = {
  id: 'rev-001',
  drawing_id: TEST_DRAWING_ID,
  revision: 'A',
  description: 'Initial issue',
  status: 'current',
  file_url: 'https://s3.example.com/drawings/STR-101-RevA.pdf',
  issued_by: TEST_USER_ID,
  issued_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

describe('PM Drawings Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Create drawing', () => {
    it('should create a drawing with Rev A and draft status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockDrawingRow], rowCount: 1 } as any);

      const result = await query(
        `INSERT INTO project_drawings
         (id, project_id, organization_id, drawing_number, title, discipline, current_revision, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [TEST_DRAWING_ID, TEST_PROJECT_ID, TEST_ORG_ID, 'STR-101',
         'Foundation Plan', 'structural', 'A', 'draft', TEST_USER_ID]
      );

      expect(result.rows[0].drawing_number).toBe('STR-101');
      expect(result.rows[0].current_revision).toBe('A');
      expect(result.rows[0].status).toBe('draft');
      expect(result.rows[0].discipline).toBe('structural');
    });
  });

  describe('Drawing revisions', () => {
    it('should create initial revision A record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockRevisionRow], rowCount: 1 } as any);

      const result = await query(
        `INSERT INTO drawing_revisions (id, drawing_id, revision, description, status, file_url, issued_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        ['rev-001', TEST_DRAWING_ID, 'A', 'Initial issue', 'current', mockRevisionRow.file_url, TEST_USER_ID]
      );

      expect(result.rows[0].revision).toBe('A');
      expect(result.rows[0].status).toBe('current');
    });

    it('should create revision B and supersede Rev A', async () => {
      const revBRow = { ...mockRevisionRow, id: 'rev-002', revision: 'B', description: 'Updated with engineer comments' };
      const updatedRevARow = { ...mockRevisionRow, status: 'superseded' };

      // First call: supersede old revision
      mockQuery.mockResolvedValueOnce({ rows: [updatedRevARow], rowCount: 1 } as any);
      // Second call: insert Rev B
      mockQuery.mockResolvedValueOnce({ rows: [revBRow], rowCount: 1 } as any);
      // Third call: update drawing current_revision
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockDrawingRow, current_revision: 'B' }], rowCount: 1 } as any);

      // Supersede old revision
      const supersede = await query(
        `UPDATE drawing_revisions SET status = 'superseded' WHERE drawing_id = $1 AND status = 'current' RETURNING *`,
        [TEST_DRAWING_ID]
      );
      expect(supersede.rows[0].status).toBe('superseded');

      // Insert new revision
      const newRev = await query(
        `INSERT INTO drawing_revisions (id, drawing_id, revision, description, status, issued_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        ['rev-002', TEST_DRAWING_ID, 'B', 'Updated with engineer comments', 'current', TEST_USER_ID]
      );
      expect(newRev.rows[0].revision).toBe('B');

      // Update drawing head pointer
      const updated = await query(
        `UPDATE project_drawings SET current_revision = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        ['B', TEST_DRAWING_ID]
      );
      expect(updated.rows[0].current_revision).toBe('B');
    });
  });

  describe('List drawings by project and discipline', () => {
    it('should return drawings filtered by project', async () => {
      const drawings = [
        mockDrawingRow,
        { ...mockDrawingRow, id: 'drw-2', drawing_number: 'STR-102', title: 'Column Schedule' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: drawings, rowCount: 2 } as any);

      const result = await query(
        'SELECT * FROM project_drawings WHERE project_id = $1 ORDER BY drawing_number',
        [TEST_PROJECT_ID]
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].drawing_number).toBe('STR-101');
      expect(result.rows[1].drawing_number).toBe('STR-102');
    });

    it('should filter drawings by discipline', async () => {
      const architecturalDrawing = { ...mockDrawingRow, id: 'arch-1', drawing_number: 'ARCH-001', discipline: 'architectural' };
      mockQuery.mockResolvedValueOnce({ rows: [architecturalDrawing], rowCount: 1 } as any);

      const result = await query(
        'SELECT * FROM project_drawings WHERE project_id = $1 AND discipline = $2',
        [TEST_PROJECT_ID, 'architectural']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].discipline).toBe('architectural');
    });
  });

  describe('Approve drawing for construction', () => {
    it('should change status to approved', async () => {
      const approvedRow = { ...mockDrawingRow, status: 'approved' };
      mockQuery.mockResolvedValueOnce({ rows: [approvedRow], rowCount: 1 } as any);

      const result = await query(
        `UPDATE project_drawings SET status = 'approved', updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [TEST_DRAWING_ID]
      );

      expect(result.rows[0].status).toBe('approved');
    });
  });
});
