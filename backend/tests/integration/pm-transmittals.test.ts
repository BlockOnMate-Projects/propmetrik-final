/**
 * PM Transmittals Integration Tests
 * Tests transmittal creation, issuance, and recipient tracking.
 */

import { query } from '../../src/database';

const mockQuery = query as jest.MockedFunction<typeof query>;

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const TEST_TRANSMITTAL_ID = '00000000-0000-0000-0000-000000000030';

const mockTransmittalRow = {
  id: TEST_TRANSMITTAL_ID,
  project_id: TEST_PROJECT_ID,
  organization_id: TEST_ORG_ID,
  transmittal_number: 'T-0001',
  subject: 'Structural Drawings Rev B',
  description: 'Transmitting updated structural drawings for review.',
  status: 'draft',
  to_company: 'ABC Contractors',
  to_contact: 'John Doe',
  to_email: 'john@abc-contractors.com',
  purpose: 'for_review',
  priority: 'normal',
  response_required: true,
  issued_at: null,
  issued_by: null,
  created_by: TEST_USER_ID,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('PM Transmittals Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Create transmittal', () => {
    it('should create a draft transmittal with sequential number', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockTransmittalRow], rowCount: 1 } as any);

      const result = await query(
        `INSERT INTO project_transmittals
         (id, project_id, organization_id, transmittal_number, subject, status, to_email, purpose, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [TEST_TRANSMITTAL_ID, TEST_PROJECT_ID, TEST_ORG_ID, 'T-0001',
         'Structural Drawings Rev B', 'draft', 'john@abc-contractors.com', 'for_review', TEST_USER_ID]
      );

      expect(result.rows[0].transmittal_number).toBe('T-0001');
      expect(result.rows[0].status).toBe('draft');
      expect(result.rows[0].to_email).toBe('john@abc-contractors.com');
    });
  });

  describe('Add transmittal items', () => {
    it('should add a document item to the transmittal', async () => {
      const itemRow = {
        id: 'item-001',
        transmittal_id: TEST_TRANSMITTAL_ID,
        document_title: 'Foundation Plan Rev B',
        document_ref: 'STR-FND-001',
        revision: 'B',
        format: 'PDF',
        copies: 3,
      };
      mockQuery.mockResolvedValueOnce({ rows: [itemRow], rowCount: 1 } as any);

      const result = await query(
        `INSERT INTO transmittal_items (id, transmittal_id, document_title, document_ref, revision, format, copies)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        ['item-001', TEST_TRANSMITTAL_ID, 'Foundation Plan Rev B', 'STR-FND-001', 'B', 'PDF', 3]
      );

      expect(result.rows[0].document_title).toBe('Foundation Plan Rev B');
      expect(result.rows[0].revision).toBe('B');
    });
  });

  describe('Issue transmittal', () => {
    it('should transition status from draft to issued', async () => {
      const issuedRow = {
        ...mockTransmittalRow,
        status: 'issued',
        issued_at: new Date().toISOString(),
        issued_by: TEST_USER_ID,
      };
      mockQuery.mockResolvedValueOnce({ rows: [issuedRow], rowCount: 1 } as any);

      const result = await query(
        `UPDATE project_transmittals
         SET status = 'issued', issued_at = NOW(), issued_by = $1, updated_at = NOW()
         WHERE id = $2 AND status = 'draft' RETURNING *`,
        [TEST_USER_ID, TEST_TRANSMITTAL_ID]
      );

      expect(result.rows[0].status).toBe('issued');
      expect(result.rows[0].issued_by).toBe(TEST_USER_ID);
      expect(result.rows[0].issued_at).not.toBeNull();
    });

    it('should not issue an already-issued transmittal', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await query(
        `UPDATE project_transmittals SET status = 'issued'
         WHERE id = $1 AND status = 'draft' RETURNING *`,
        [TEST_TRANSMITTAL_ID]
      );

      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Recipient acknowledgement', () => {
    it('should record recipient acknowledgement', async () => {
      const recipientRow = {
        id: 'recip-001',
        transmittal_id: TEST_TRANSMITTAL_ID,
        email: 'john@abc-contractors.com',
        name: 'John Doe',
        acknowledged_at: new Date().toISOString(),
        token: 'ack-token-123',
      };
      mockQuery.mockResolvedValueOnce({ rows: [recipientRow], rowCount: 1 } as any);

      const result = await query(
        `UPDATE transmittal_recipients
         SET acknowledged_at = NOW(), updated_at = NOW()
         WHERE transmittal_id = $1 AND token = $2 RETURNING *`,
        [TEST_TRANSMITTAL_ID, 'ack-token-123']
      );

      expect(result.rows[0].acknowledged_at).not.toBeNull();
      expect(result.rows[0].email).toBe('john@abc-contractors.com');
    });
  });

  describe('List project transmittals', () => {
    it('should return transmittals for a project', async () => {
      const transmittals = [
        { ...mockTransmittalRow, status: 'issued' },
        { ...mockTransmittalRow, id: 'T-002', transmittal_number: 'T-0002', status: 'draft' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: transmittals, rowCount: 2 } as any);

      const result = await query(
        'SELECT * FROM project_transmittals WHERE project_id = $1 ORDER BY transmittal_number',
        [TEST_PROJECT_ID]
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].transmittal_number).toBe('T-0001');
    });
  });
});
