import {
  pmPublicConfirmCryptoSchema,
  pmPublicInitiateCryptoSchema,
  pmPublicInvoiceIdParamSchema,
} from '../../../src/middleware/validation';

describe('public PM invoice route validation', () => {
  const invoiceId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  describe('pmPublicInvoiceIdParamSchema', () => {
    it('accepts a valid invoice id', () => {
      const result = pmPublicInvoiceIdParamSchema.parse({ id: invoiceId });
      expect(result.id).toBe(invoiceId);
    });

    it('rejects a non-uuid id', () => {
      expect(() => pmPublicInvoiceIdParamSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });
  });

  describe('pmPublicInitiateCryptoSchema', () => {
    it('accepts a valid crypto ticker and normalizes case', () => {
      const result = pmPublicInitiateCryptoSchema.parse({ payCurrency: 'BTC', payChain: 'bitcoin' });
      expect(result.payCurrency).toBe('btc');
      expect(result.payChain).toBe('bitcoin');
    });

    it('rejects missing payCurrency', () => {
      expect(() => pmPublicInitiateCryptoSchema.parse({})).toThrow();
    });

    it('rejects invalid ticker characters', () => {
      expect(() => pmPublicInitiateCryptoSchema.parse({ payCurrency: 'btc-usd' })).toThrow();
    });
  });

  describe('pmPublicConfirmCryptoSchema', () => {
    it('accepts a valid payment reference', () => {
      const reference = 'PM-INV-CRYPTO-1730000000000-abc123';
      const result = pmPublicConfirmCryptoSchema.parse({ paymentReference: reference });
      expect(result.paymentReference).toBe(reference);
    });

    it('rejects missing paymentReference', () => {
      expect(() => pmPublicConfirmCryptoSchema.parse({})).toThrow();
    });

    it('rejects references without the PM invoice prefix', () => {
      expect(() => pmPublicConfirmCryptoSchema.parse({ paymentReference: 'OTHER-REF-123' })).toThrow();
    });
  });
});
