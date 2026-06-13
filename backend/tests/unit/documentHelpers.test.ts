import { templateService } from '../../shared-services/document-service';

/** Render a raw Handlebars template through the real document-service helpers. */
const r = (tpl: string, data: Record<string, any> = {}) => templateService.render(tpl, data).trim();

describe('document-service money/format Handlebars helpers', () => {
  describe('formatDate', () => {
    // Regression: Handlebars passes an options object as the last arg, so {{formatDate x}}
    // (no explicit format) used to fall through to d.toISOString() and print raw ISO.
    it('with no explicit format never leaks a raw ISO timestamp', () => {
      const out = r('{{formatDate d}}', { d: '2026-06-06T04:00:00.000Z' });
      expect(out).not.toMatch(/T\d\d:\d\d:\d\d/);
      expect(out).not.toBe('2026-06-06T04:00:00.000Z');
      expect(out).toContain('2026');
    });

    it('"medium" renders a clean year', () => {
      expect(r('{{formatDate d "medium"}}', { d: '2026-06-06T12:00:00Z' })).toContain('2026');
    });

    it('returns empty string for an invalid date', () => {
      expect(r('{{formatDate d}}', { d: 'not-a-date' })).toBe('');
    });
  });

  describe('currencyName', () => {
    it('maps known currency codes to full names', () => {
      expect(r('{{currencyName c}}', { c: 'USD' })).toBe('United States Dollars');
      expect(r('{{currencyName c}}', { c: 'GHS' })).toBe('Ghana Cedis');
      expect(r('{{currencyName c}}', { c: 'gbp' })).toBe('Pounds Sterling'); // case-insensitive
    });

    it('falls back to the raw code for unknown currencies', () => {
      expect(r('{{currencyName c}}', { c: 'XYZ' })).toBe('XYZ');
    });
  });

  describe('humanize', () => {
    it('turns an enum/slug into Title Case words', () => {
      expect(r('{{humanize t}}', { t: 'apartment_flat' })).toBe('Apartment Flat');
      expect(r('{{humanize t}}', { t: 'semi-detached_house' })).toBe('Semi Detached House');
    });
  });

  describe('formatNumber', () => {
    it('adds thousands separators', () => {
      expect(r('{{formatNumber n}}', { n: 1500 })).toBe('1,500');
      expect(r('{{formatNumber n}}', { n: 1234567 })).toBe('1,234,567');
    });
    it('handles null/NaN as 0', () => {
      expect(r('{{formatNumber n}}', { n: null })).toBe('0');
    });
  });

  describe('currency', () => {
    it('formats an amount with its currency and grouping', () => {
      expect(r('{{currency n c}}', { n: 1500, c: 'USD' })).toContain('1,500');
    });
  });

  describe('ordinal', () => {
    it('produces correct ordinal suffixes', () => {
      expect(r('{{ordinal n}}', { n: 1 })).toBe('1st');
      expect(r('{{ordinal n}}', { n: 2 })).toBe('2nd');
      expect(r('{{ordinal n}}', { n: 3 })).toBe('3rd');
      expect(r('{{ordinal n}}', { n: 11 })).toBe('11th');
      expect(r('{{ordinal n}}', { n: 22 })).toBe('22nd');
    });
  });
});
