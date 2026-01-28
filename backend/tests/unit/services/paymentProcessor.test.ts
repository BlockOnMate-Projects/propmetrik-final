/**
 * PaymentProcessor Unit Tests
 * Tests for payment processing with Paystack sub-accounts
 */

import { PaymentProcessor } from '../../../src/services/property-management/payment/paymentProcessor';

// Mock dependencies
jest.mock('../../../src/services/property-management/payment/paystackService', () => ({
    paystackService: {
        initializeTransaction: jest.fn(),
        initializeWithSubaccount: jest.fn(),
        verifyTransaction: jest.fn(),
        getPaymentAccountConfig: jest.fn()
    }
}));

jest.mock('../../../src/services/property-management/rent-collection/rentCollectionService', () => ({
    rentCollectionService: {
        recordPayment: jest.fn()
    }
}));

jest.mock('../../../src/services/property-management/rent-collection/rentScheduleService', () => ({
    rentScheduleService: {
        calculateArrears: jest.fn(),
        applyPayment: jest.fn(),
        getByTenancy: jest.fn()
    },
    RentScheduleStatus: {
        UPCOMING: 'upcoming',
        DUE: 'due',
        PARTIALLY_PAID: 'partially_paid',
        PAID: 'paid',
        OVERDUE: 'overdue',
        WAIVED: 'waived'
    }
}));

jest.mock('../../../src/services/property-management/leases/tenancyService', () => ({
    tenancyService: {
        getTenancyById: jest.fn()
    }
}));

// Import mocked modules
import { paystackService } from '../../../src/services/property-management/payment/paystackService';
import { rentCollectionService } from '../../../src/services/property-management/rent-collection/rentCollectionService';
import { rentScheduleService } from '../../../src/services/property-management/rent-collection/rentScheduleService';
import { tenancyService } from '../../../src/services/property-management/leases/tenancyService';

describe('PaymentProcessor', () => {
    let processor: PaymentProcessor;

    beforeEach(() => {
        jest.clearAllMocks();
        processor = new PaymentProcessor();
    });

    describe('initializeRentPayment', () => {
        const mockParams = {
            tenancyId: 'tenancy-123',
            organizationId: 'org-456',
            amount: 3000,
            email: 'tenant@example.com',
            channel: 'mobile_money' as const
        };

        const mockTenancy = {
            id: 'tenancy-123',
            propertyId: 'prop-789',
            tenantId: 'tenant-abc',
            rentCurrency: 'GHS',
            property: { title: 'Cantonments Apartment' },
            tenant: { fullName: 'Kwame Mensah' }
        };

        it('should initialize payment with sub-account when configured', async () => {
            const mockPaymentConfig = {
                organizationId: 'org-456',
                subaccountCode: 'ACCT_xxx123',
                platformFeePercentage: 2,
                platformFeeFlat: 0
            };

            (tenancyService.getTenancyById as jest.Mock).mockResolvedValue(mockTenancy);
            (paystackService.getPaymentAccountConfig as jest.Mock).mockResolvedValue(mockPaymentConfig);
            (rentScheduleService.calculateArrears as jest.Mock).mockResolvedValue({
                overdueSchedules: [],
                dueSchedules: [{ id: 'schedule-1', amountOutstanding: 3000 }]
            });
            (paystackService.initializeWithSubaccount as jest.Mock).mockResolvedValue({
                status: true,
                data: {
                    authorization_url: 'https://paystack.com/authorize/xxx',
                    access_code: 'access_xxx',
                    reference: 'ref_123'
                }
            });

            const result = await processor.initializeRentPayment(mockParams);

            expect(result.status).toBe(true);
            expect(result.data.authorization_url).toBeDefined();
            expect(paystackService.initializeWithSubaccount).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'tenant@example.com',
                    amount: 300000, // 3000 * 100 pesewas
                    currency: 'GHS'
                }),
                'ACCT_xxx123',
                2, // platform fee percentage
                0  // platform fee flat
            );
        });

        it('should initialize payment without sub-account when not configured', async () => {
            (tenancyService.getTenancyById as jest.Mock).mockResolvedValue(mockTenancy);
            (paystackService.getPaymentAccountConfig as jest.Mock).mockResolvedValue(null);
            (rentScheduleService.calculateArrears as jest.Mock).mockResolvedValue({
                overdueSchedules: [],
                dueSchedules: []
            });
            (paystackService.initializeTransaction as jest.Mock).mockResolvedValue({
                status: true,
                data: {
                    authorization_url: 'https://paystack.com/authorize/yyy',
                    access_code: 'access_yyy',
                    reference: 'ref_456'
                }
            });

            const result = await processor.initializeRentPayment(mockParams);

            expect(result.status).toBe(true);
            expect(paystackService.initializeTransaction).toHaveBeenCalled();
            expect(paystackService.initializeWithSubaccount).not.toHaveBeenCalled();
        });

        it('should throw error when tenancy not found', async () => {
            (tenancyService.getTenancyById as jest.Mock).mockResolvedValue(null);

            await expect(processor.initializeRentPayment(mockParams))
                .rejects.toThrow('Tenancy not found');
        });

        it('should include schedule IDs in metadata when provided', async () => {
            const paramsWithSchedules = {
                ...mockParams,
                scheduleIds: ['schedule-1', 'schedule-2']
            };

            (tenancyService.getTenancyById as jest.Mock).mockResolvedValue(mockTenancy);
            (paystackService.getPaymentAccountConfig as jest.Mock).mockResolvedValue(null);
            (paystackService.initializeTransaction as jest.Mock).mockResolvedValue({
                status: true,
                data: {
                    authorization_url: 'https://paystack.com/authorize/zzz',
                    access_code: 'access_zzz',
                    reference: 'ref_789'
                }
            });

            await processor.initializeRentPayment(paramsWithSchedules);

            expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        schedule_ids: ['schedule-1', 'schedule-2']
                    })
                })
            );
        });
    });

    describe('verifyAndRecordPayment', () => {
        const mockReference = 'ref_abc123';

        it('should verify payment and record in database', async () => {
            const mockVerifyResponse = {
                status: true,
                data: {
                    status: 'success',
                    reference: mockReference,
                    amount: 300000, // 3000 GHS in pesewas
                    currency: 'GHS',
                    channel: 'mobile_money',
                    authorization: {
                        bank: 'mtn'
                    },
                    metadata: {
                        tenancy_id: 'tenancy-123',
                        organization_id: 'org-456',
                        schedule_ids: ['schedule-1']
                    }
                }
            };

            const mockRecordedPayment = {
                id: 'payment-new',
                tenancyId: 'tenancy-123',
                paymentAmount: 3000,
                status: 'completed'
            };

            (paystackService.verifyTransaction as jest.Mock).mockResolvedValue(mockVerifyResponse);
            (rentCollectionService.recordPayment as jest.Mock).mockResolvedValue(mockRecordedPayment);
            (rentScheduleService.applyPayment as jest.Mock).mockResolvedValue([
                { id: 'rsp-1', rentScheduleId: 'schedule-1', amountApplied: 3000 }
            ]);

            const result = await processor.verifyAndRecordPayment(mockReference);

            expect(result.success).toBe(true);
            expect(result.payment).toBeDefined();
            expect(result.schedulesUpdated).toBe(1);
            expect(rentCollectionService.recordPayment).toHaveBeenCalled();
            expect(rentScheduleService.applyPayment).toHaveBeenCalled();
        });

        it('should return failure for unsuccessful payment', async () => {
            (paystackService.verifyTransaction as jest.Mock).mockResolvedValue({
                status: true,
                data: {
                    status: 'failed',
                    reference: mockReference
                }
            });

            const result = await processor.verifyAndRecordPayment(mockReference);

            expect(result.success).toBe(false);
            expect(result.error).toBe('failed');
            expect(rentCollectionService.recordPayment).not.toHaveBeenCalled();
        });

        it('should throw error when metadata is missing', async () => {
            (paystackService.verifyTransaction as jest.Mock).mockResolvedValue({
                status: true,
                data: {
                    status: 'success',
                    reference: mockReference,
                    amount: 300000,
                    metadata: null // Missing metadata
                }
            });

            const result = await processor.verifyAndRecordPayment(mockReference);

            expect(result.success).toBe(false);
            expect(result.error).toContain('missing metadata');
        });

        it('should correctly identify MTN Mobile Money', async () => {
            (paystackService.verifyTransaction as jest.Mock).mockResolvedValue({
                status: true,
                data: {
                    status: 'success',
                    reference: mockReference,
                    amount: 100000,
                    currency: 'GHS',
                    channel: 'mobile_money',
                    authorization: {
                        bank: 'MTN MOBILE MONEY'
                    },
                    metadata: {
                        tenancy_id: 'tenancy-123',
                        organization_id: 'org-456',
                        schedule_ids: []
                    }
                }
            });

            (rentCollectionService.recordPayment as jest.Mock).mockResolvedValue({
                id: 'payment-mtn',
                paymentMethod: 'mobile_money_mtn'
            });
            (rentScheduleService.applyPayment as jest.Mock).mockResolvedValue([]);

            await processor.verifyAndRecordPayment(mockReference);

            expect(rentCollectionService.recordPayment).toHaveBeenCalledWith(
                'org-456',
                expect.objectContaining({
                    paymentMethod: 'mobile_money_mtn'
                }),
                'system'
            );
        });

        it('should correctly identify Vodafone Cash', async () => {
            (paystackService.verifyTransaction as jest.Mock).mockResolvedValue({
                status: true,
                data: {
                    status: 'success',
                    reference: mockReference,
                    amount: 100000,
                    currency: 'GHS',
                    channel: 'mobile_money',
                    authorization: {
                        bank: 'Vodafone Cash'
                    },
                    metadata: {
                        tenancy_id: 'tenancy-123',
                        organization_id: 'org-456',
                        schedule_ids: []
                    }
                }
            });

            (rentCollectionService.recordPayment as jest.Mock).mockResolvedValue({
                id: 'payment-voda',
                paymentMethod: 'mobile_money_vodafone'
            });
            (rentScheduleService.applyPayment as jest.Mock).mockResolvedValue([]);

            await processor.verifyAndRecordPayment(mockReference);

            expect(rentCollectionService.recordPayment).toHaveBeenCalledWith(
                'org-456',
                expect.objectContaining({
                    paymentMethod: 'mobile_money_vodafone'
                }),
                'system'
            );
        });
    });

    describe('getPaymentSummary', () => {
        it('should return payment summary with arrears and recent payments', async () => {
            const tenancyId = 'tenancy-123';
            const organizationId = 'org-456';

            (rentScheduleService.calculateArrears as jest.Mock).mockResolvedValue({
                tenancyId,
                totalExpected: 36000,
                totalPaid: 30000,
                totalOutstanding: 6000,
                totalLateFees: 100,
                currency: 'GHS',
                overdueSchedules: [{ id: 'schedule-1', amountOutstanding: 3000 }],
                dueSchedules: [{ id: 'schedule-2', amountOutstanding: 3000 }]
            });

            const result = await processor.getPaymentSummary(tenancyId, organizationId);

            expect(result.arrears).toBeDefined();
            expect(result.arrears.totalOutstanding).toBe(6000);
            expect(rentScheduleService.calculateArrears).toHaveBeenCalledWith(tenancyId, organizationId);
        });
    });

    describe('handleWebhook', () => {
        it('should process charge.success event', async () => {
            const mockVerifyResponse = {
                status: true,
                data: {
                    status: 'success',
                    reference: 'webhook_ref_123',
                    amount: 300000,
                    currency: 'GHS',
                    channel: 'card',
                    authorization: {},
                    metadata: {
                        tenancy_id: 'tenancy-123',
                        organization_id: 'org-456',
                        schedule_ids: []
                    }
                }
            };

            (paystackService.verifyTransaction as jest.Mock).mockResolvedValue(mockVerifyResponse);
            (rentCollectionService.recordPayment as jest.Mock).mockResolvedValue({ id: 'payment-webhook' });
            (rentScheduleService.applyPayment as jest.Mock).mockResolvedValue([]);

            await processor.handleWebhook('charge.success', { reference: 'webhook_ref_123' });

            expect(paystackService.verifyTransaction).toHaveBeenCalledWith('webhook_ref_123');
        });

        it('should ignore unhandled webhook events', async () => {
            await processor.handleWebhook('some.other.event', { reference: 'ref_123' });

            expect(paystackService.verifyTransaction).not.toHaveBeenCalled();
        });
    });
});
