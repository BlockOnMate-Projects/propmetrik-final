/**
 * PaymentProcessor Unit Tests
 * Money-path coverage for rent initiation (incl. USD→GHS FX settlement) and
 * verify/record. Every external dependency is mocked so this is deterministic
 * and never touches the network or the production database.
 */

import { PaymentProcessor } from '../../../src/services/property-management/payment/paymentProcessor';
import type { FeeCalculation } from '../../../shared-services/payments/feeEngine';

// ── External mocks ──────────────────────────────────────────────
jest.mock('../../../src/services/property-management/payment/paystackService', () => ({
    paystackService: {
        initializeTransaction: jest.fn(),
        initializeWithSubaccount: jest.fn(),
        verifyTransaction: jest.fn(),
        getPaymentAccountConfig: jest.fn(),
    },
}));

jest.mock('../../../src/services/property-management/rent-collection/rentCollectionService', () => ({
    rentCollectionService: { recordPayment: jest.fn() },
}));

jest.mock('../../../src/services/property-management/rent-collection/rentScheduleService', () => ({
    rentScheduleService: { calculateArrears: jest.fn(), applyPayment: jest.fn(), getByTenancy: jest.fn() },
    RentScheduleStatus: { UPCOMING: 'upcoming', DUE: 'due', PARTIALLY_PAID: 'partially_paid', PAID: 'paid', OVERDUE: 'overdue', WAIVED: 'waived' },
}));

jest.mock('../../../src/services/property-management/leases/tenancyService', () => ({
    tenancyService: { getTenancyById: jest.fn() },
}));

// Fee engine — deterministic so we assert exact GHS math, not the rule table.
const feeCalculate = jest.fn();
jest.mock('../../../shared-services/payments/feeEngine', () => ({
    feeEngine: { calculate: (...a: any[]) => feeCalculate(...a) },
}));

// FX feed — controls the live rate (or makes it throw) without any network.
const normalizeToGhs = jest.fn();
jest.mock('../../../shared-services/payments/crypto', () => ({
    exchangeRateService: { normalizeToGhs: (...a: any[]) => normalizeToGhs(...a) },
    cryptoPaymentService: {},
}));

// Notifications — best-effort side effects, stubbed out.
jest.mock('../../../shared-services/notifications/in-mail', () => ({
    notify: jest.fn().mockResolvedValue(undefined),
    resolveOrgStaff: jest.fn().mockResolvedValue([]),
    resolveTenantByTenancy: jest.fn().mockResolvedValue(null),
}));

// Database pool — every query is a no-op returning no rows.
const poolQuery = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('../../../src/database', () => ({ pool: { query: (...a: any[]) => poolQuery(...a) } }));

import { paystackService } from '../../../src/services/property-management/payment/paystackService';
import { rentCollectionService } from '../../../src/services/property-management/rent-collection/rentCollectionService';
import { rentScheduleService } from '../../../src/services/property-management/rent-collection/rentScheduleService';
import { tenancyService } from '../../../src/services/property-management/leases/tenancyService';

/** Build a deterministic fee calc: serviceFee = max(1%, 25), payer pays principal + fee. */
const feeFor = (principalGhs: number): FeeCalculation => {
    const serviceFee = Math.max(Math.round(principalGhs * 0.01 * 100) / 100, 25);
    const totalCharge = Math.round((principalGhs + serviceFee) * 100) / 100;
    return {
        principalAmount: principalGhs,
        serviceFee,
        totalCharge,
        serviceFeeSubunits: Math.round(serviceFee * 100),
        totalChargeSubunits: Math.round(totalCharge * 100),
        feeMode: 'max_of',
        percentageRateApplied: 0.01,
        flatAmountApplied: 25,
        feeDescription: 'max(1%, GHS 25)',
        currency: 'GHS',
    };
};

const okPaystack = (ref: string) => ({
    status: true,
    data: { authorization_url: `https://paystack.com/${ref}`, access_code: `ac_${ref}`, reference: ref },
});

describe('PaymentProcessor', () => {
    let processor: PaymentProcessor;

    beforeEach(() => {
        jest.clearAllMocks();
        poolQuery.mockResolvedValue({ rows: [] });
        feeCalculate.mockImplementation((_t: string, principal: number) => Promise.resolve(feeFor(principal)));
        // Default: GHS passthrough (rate 1, no feed hit)
        normalizeToGhs.mockImplementation((amount: number) =>
            Promise.resolve({ ghsAmount: amount, usdAmount: amount, rate: 1, source: 'none', fetchedAt: new Date() }));
        processor = new PaymentProcessor();
    });

    describe('initializeRentPayment', () => {
        const baseParams = { tenancyId: 'tenancy-123', organizationId: 'org-456', amount: 3000, email: 'tenant@example.com', channel: 'mobile_money' as const };
        const ghsTenancy = { id: 'tenancy-123', rentCurrency: 'GHS', property: { title: 'Cantonments Apartment' }, tenant: { fullName: 'Kwame Mensah' } };
        const config = { organizationId: 'org-456', subaccountCode: 'ACCT_xxx123' };

        it('charges principal + fee in GHS via the subaccount and returns the auth url', async () => {
            (tenancyService.getTenancyById as jest.Mock).mockResolvedValue(ghsTenancy);
            (paystackService.getPaymentAccountConfig as jest.Mock).mockResolvedValue(config);
            (rentScheduleService.calculateArrears as jest.Mock).mockResolvedValue({ overdueSchedules: [], dueSchedules: [{ id: 'schedule-1', amountOutstanding: 3000 }] });
            (paystackService.initializeWithSubaccount as jest.Mock).mockResolvedValue(okPaystack('ref_123'));

            const result = await processor.initializeRentPayment(baseParams);

            expect(result.reference).toBe('ref_123');
            expect(result.authorizationUrl).toBe('https://paystack.com/ref_123');
            expect(result.fx).toBeUndefined(); // GHS lease → no FX block
            // 3000 principal + 30 fee = 3030 → 303000 pesewas; fee 30 → 3000 pesewas
            expect(paystackService.initializeWithSubaccount).toHaveBeenCalledWith(
                expect.objectContaining({ email: 'tenant@example.com', amount: 303000, currency: 'GHS' }),
                'ACCT_xxx123',
                3000,
            );
        });

        it('converts a USD lease to GHS at the live rate and surfaces the FX breakdown', async () => {
            (tenancyService.getTenancyById as jest.Mock).mockResolvedValue({ ...ghsTenancy, rentCurrency: 'USD' });
            (paystackService.getPaymentAccountConfig as jest.Mock).mockResolvedValue(config);
            (rentScheduleService.calculateArrears as jest.Mock).mockResolvedValue({ overdueSchedules: [], dueSchedules: [] });
            (paystackService.initializeWithSubaccount as jest.Mock).mockResolvedValue(okPaystack('ref_usd'));
            // USD 3000 → GHS 46,500 at 15.5
            normalizeToGhs.mockResolvedValue({ ghsAmount: 46500, usdAmount: 3000, rate: 15.5, source: 'data-hub:ForexRate-API', fetchedAt: new Date() });

            const result = await processor.initializeRentPayment({ ...baseParams, amount: 3000 });

            expect(normalizeToGhs).toHaveBeenCalledWith(3000, 'USD');
            expect(result.fx).toMatchObject({ obligationCurrency: 'USD', obligationAmount: 3000, rate: 15.5, chargedGhs: 46500 });
            // fee on GHS principal: max(465, 25) = 465 → total 46,965 → 4,696,500 pesewas
            expect(paystackService.initializeWithSubaccount).toHaveBeenCalledWith(
                expect.objectContaining({ amount: 4696500, currency: 'GHS' }),
                'ACCT_xxx123',
                46500,
            );
        });

        it('aborts the charge when no live FX rate is available (no fallback)', async () => {
            (tenancyService.getTenancyById as jest.Mock).mockResolvedValue({ ...ghsTenancy, rentCurrency: 'USD' });
            (paystackService.getPaymentAccountConfig as jest.Mock).mockResolvedValue(config);
            normalizeToGhs.mockRejectedValue(new Error('No exchange rate available'));

            await expect(processor.initializeRentPayment(baseParams)).rejects.toThrow(/exchange rate/i);
            expect(paystackService.initializeWithSubaccount).not.toHaveBeenCalled();
        });

        it('throws when the tenancy is not found', async () => {
            (tenancyService.getTenancyById as jest.Mock).mockResolvedValue(null);
            await expect(processor.initializeRentPayment(baseParams)).rejects.toThrow('Tenancy not found');
        });

        it('requires a configured subaccount before charging', async () => {
            (tenancyService.getTenancyById as jest.Mock).mockResolvedValue(ghsTenancy);
            (paystackService.getPaymentAccountConfig as jest.Mock).mockResolvedValue(null);
            await expect(processor.initializeRentPayment(baseParams)).rejects.toThrow(/Payment account not configured/i);
        });
    });

    describe('verifyAndRecordPayment', () => {
        const mockReference = 'ref_abc123';

        it('verifies, records the rent payment and applies it to schedules', async () => {
            (paystackService.verifyTransaction as jest.Mock).mockResolvedValue({
                status: true,
                data: {
                    status: 'success', reference: mockReference, amount: 303000, currency: 'GHS', channel: 'mobile_money',
                    authorization: { bank: 'mtn' },
                    metadata: { tenancy_id: 'tenancy-123', organization_id: 'org-456', principal_amount: 3000, schedule_ids: ['schedule-1'] },
                },
            });
            (rentCollectionService.recordPayment as jest.Mock).mockResolvedValue({ id: 'payment-new', paymentAmount: 3000 });
            (rentScheduleService.applyPayment as jest.Mock).mockResolvedValue([{ id: 'rsp-1' }]);

            const result = await processor.verifyAndRecordPayment(mockReference);

            expect(result.success).toBe(true);
            expect(result.schedulesUpdated).toBe(1);
            expect(rentCollectionService.recordPayment).toHaveBeenCalled();
        });

        it('returns failure for an unsuccessful charge', async () => {
            (paystackService.verifyTransaction as jest.Mock).mockResolvedValue({ status: true, data: { status: 'failed', reference: mockReference } });
            const result = await processor.verifyAndRecordPayment(mockReference);
            expect(result.success).toBe(false);
            expect(result.error).toBe('failed');
            expect(rentCollectionService.recordPayment).not.toHaveBeenCalled();
        });

        it('records the NATIVE obligation + stamps GHS collected for a USD lease', async () => {
            (paystackService.verifyTransaction as jest.Mock).mockResolvedValue({
                status: true,
                data: {
                    status: 'success', reference: mockReference, amount: 4696500, currency: 'GHS', channel: 'card', authorization: {},
                    metadata: {
                        tenancy_id: 'tenancy-123', organization_id: 'org-456', principal_amount: 46500,
                        obligation_currency: 'USD', obligation_amount: 3000, fx_rate: 15.5, fx_source: 'data-hub:ForexRate-API', fx_locked_at: new Date().toISOString(),
                        schedule_ids: [],
                    },
                },
            });
            (rentCollectionService.recordPayment as jest.Mock).mockResolvedValue({ id: 'payment-usd' });
            (rentScheduleService.applyPayment as jest.Mock).mockResolvedValue([]);

            await processor.verifyAndRecordPayment(mockReference);

            // rent_payments.payment_amount stays native (USD 3000) so the native schedule reconciles
            expect(rentCollectionService.recordPayment).toHaveBeenCalledWith(
                'org-456',
                expect.objectContaining({ paymentAmount: 3000, currency: 'USD' }),
                undefined,
            );
            // GHS collected + rate are stamped via an UPDATE rent_payments
            expect(poolQuery).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE rent_payments'),
                expect.arrayContaining([46500, 15.5]),
            );
        });
    });

    describe('handleWebhook', () => {
        it('processes charge.success by verifying the reference', async () => {
            (paystackService.verifyTransaction as jest.Mock).mockResolvedValue({
                status: true,
                data: { status: 'success', reference: 'wh_1', amount: 303000, currency: 'GHS', channel: 'card', authorization: {}, metadata: { tenancy_id: 't', organization_id: 'o', schedule_ids: [] } },
            });
            (rentCollectionService.recordPayment as jest.Mock).mockResolvedValue({ id: 'p' });
            (rentScheduleService.applyPayment as jest.Mock).mockResolvedValue([]);

            await processor.handleWebhook('charge.success', { reference: 'wh_1' });
            expect(paystackService.verifyTransaction).toHaveBeenCalledWith('wh_1');
        });

        it('ignores unhandled webhook events', async () => {
            await processor.handleWebhook('some.other.event', { reference: 'x' });
            expect(paystackService.verifyTransaction).not.toHaveBeenCalled();
        });
    });
});
