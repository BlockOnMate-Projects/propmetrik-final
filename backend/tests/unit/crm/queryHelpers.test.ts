import { buildCrmOrderBy, safeSortOrder } from '../../../src/services/crm-deal-management/queryHelpers';

const ALLOWED = ['created_at', 'title', 'deal_value'] as const;

describe('crm queryHelpers', () => {
  describe('safeSortOrder', () => {
    it('returns ASC or DESC for valid input', () => {
      expect(safeSortOrder('asc')).toBe('ASC');
      expect(safeSortOrder('DESC')).toBe('DESC');
    });

    it('falls back to default for invalid input', () => {
      expect(safeSortOrder('; DROP TABLE deals--', 'desc')).toBe('DESC');
      expect(safeSortOrder(undefined, 'asc')).toBe('ASC');
    });
  });

  describe('buildCrmOrderBy', () => {
    it('builds a safe ORDER BY clause from allowlisted column', () => {
      expect(buildCrmOrderBy('d', ALLOWED, 'title', 'created_at', 'asc')).toBe('d.title ASC');
    });

    it('rejects unknown sort_by and uses default column', () => {
      expect(
        buildCrmOrderBy('d', ALLOWED, 'id; DELETE FROM deals', 'created_at', 'desc'),
      ).toBe('d.created_at DESC');
    });

    it('rejects SQL injection in sort_order', () => {
      expect(
        buildCrmOrderBy('d', ALLOWED, 'deal_value', 'created_at', 'desc; --', 'asc'),
      ).toBe('d.deal_value ASC');
    });
  });
});
