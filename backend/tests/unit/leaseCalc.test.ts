import { leaseTemplateService } from '../../src/services/property-management/leases/leaseTemplateService';

// These are pure calculation helpers on the lease service (no DB). We exercise them directly
// to lock in the money-relevant outputs that appear on a generated lease (rent-in-words, term).
const svc = leaseTemplateService as any;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('lease money & term calculations', () => {
  describe('numberToWords (rent / deposit amount-in-words on the lease)', () => {
    it('converts whole amounts to words', () => {
      expect(norm(svc.numberToWords(1500))).toBe('One Thousand Five Hundred');
      expect(norm(svc.numberToWords(0))).toBe('Zero');
      expect(norm(svc.numberToWords(21))).toBe('Twenty One');
      expect(norm(svc.numberToWords(100))).toBe('One Hundred');
      expect(norm(svc.numberToWords(3000))).toBe('Three Thousand');
    });
    it('scales to millions', () => {
      expect(norm(svc.numberToWords(1000000))).toContain('Million');
    });
    it('renders cents as a fraction', () => {
      expect(norm(svc.numberToWords(1500.5))).toContain('and 50/100');
    });
  });

  describe('calculateLeaseDurationMonths', () => {
    it('computes whole months between dates', () => {
      expect(svc.calculateLeaseDurationMonths('2026-06-06', '2027-06-06')).toBe(12);
      expect(svc.calculateLeaseDurationMonths('2026-01-01', '2026-07-01')).toBe(6);
      expect(svc.calculateLeaseDurationMonths('2026-01-01', '2027-04-01')).toBe(15);
    });
  });

  describe('calculateLeaseTerm (human-readable term on the lease)', () => {
    it('formats months, years, and mixed terms', () => {
      expect(svc.calculateLeaseTerm('2026-01-01', '2026-07-01')).toBe('6 months');
      expect(svc.calculateLeaseTerm('2026-06-06', '2027-06-06')).toBe('1 year');
      expect(svc.calculateLeaseTerm('2026-01-01', '2028-01-01')).toBe('2 years');
      expect(svc.calculateLeaseTerm('2026-01-01', '2027-04-01')).toBe('1 year and 3 months');
    });
  });
});
