/**
 * Payment Processor
 * Multi-sided payment orchestration for PROPMETRIK
 * 
 * Supports rent, deal, and project payments through Paystack with:
 * - Fee calculation via FeeEngine (max(1%, GH₵25) for rent, 0.25% for deal/project)
 * - Mandatory subaccount routing (blocks payments without a configured recipient)
 * - Full transaction ledger in payment_transactions table
 * - Idempotent verification across both legacy and new tables
 * 
 * @module services/property-management/payment/paymentProcessor
 */

import { paystackService, PaystackInitializeResponse, PaystackVerifyResponse } from './paystackService';
import { rentCollectionService } from '../rent-collection/rentCollectionService';
import { rentScheduleService, RentScheduleStatus } from '../rent-collection/rentScheduleService';
import { tenancyService } from '../leases/tenancyService';
import { PaymentMethod, PaymentStatus } from '../../../types/property-management.types';
import { feeEngine, PaymentType, FeeCalculation } from '../../../../shared-services/payments/feeEngine';
import {
    cryptoPaymentService,
    CryptoPaymentInitParams,
    CryptoPaymentInitResult,
    CryptoVerifyResult,
} from '../../../../shared-services/payments/crypto';
import { logger } from '../../../utils/logger';
import { pool } from '../../../database';

// =====================================================
// TYPES
// =====================================================

export interface RentPaymentInitParams {
    tenancyId: string;
    organizationId: string;
    amount: number;       // principal rent in GHS (what tenant owes)
    email: string;
    channel?: 'mobile_money' | 'card';
    callbackUrl?: string;
    scheduleIds?: string[];
}

export interface GenericPaymentInitParams {
    entityId: string;       // deal_id, project_id, etc.
    entityType: 'deal' | 'project';
    recipientId: string;    // recipient entity_id in payment_accounts
    recipientType: string;  // 'deal_manager' | 'project_manager'
    amount: number;         // principal in GHS
    email: string;
    description?: string;
    channel?: 'mobile_money' | 'card';
    callbackUrl?: string;
    metadata?: Record<string, any>;
}

export interface PaymentResult {
    success: boolean;
    payment?: any;
    verification?: any;
    schedulesUpdated?: number;
    error?: string;
}

export interface PaymentInitResult {
    authorizationUrl: string;
    accessCode: string;
    reference: string;
    feeBreakdown: FeeCalculation;
}

// =====================================================
// PAYMENT PROCESSOR
// =====================================================

export class PaymentProcessor {

    // ─── Fee Preview (no Paystack call) ────────────────────────

    /**
     * Calculate and return fee breakdown without initiating a payment.
     * Used by the frontend to show "Rent ₵X + Service Fee ₵Y = Total ₵Z".
     */
    async calculateFee(
        paymentType: PaymentType,
        principalGHS: number,
        entityId?: string,
        entityType?: string
    ): Promise<FeeCalculation> {
        return feeEngine.calculate(paymentType, principalGHS, entityId, entityType);
    }

    // ─── Rent Payments ─────────────────────────────────────────

    /**
     * Initialize a rent payment.
     * MUST have a subaccount configured — we never route rent to PROPMETRIK's main account.
     */
    async initializeRentPayment(params: RentPaymentInitParams): Promise<PaymentInitResult> {
        const {
            tenancyId,
            organizationId,
            amount,
            email,
            channel = 'mobile_money',
            callbackUrl,
            scheduleIds
        } = params;

        // 1. Verify tenancy
        const tenancy = await tenancyService.getTenancyById(tenancyId, organizationId);
        if (!tenancy) {
            throw new Error('Tenancy not found');
        }

        // 2. Require subaccount — rent MUST NOT go to PROPMETRIK's main account
        const paymentConfig = await paystackService.getPaymentAccountConfig(organizationId, 'organization');
        if (!paymentConfig || !paymentConfig.subaccountCode) {
            throw new Error(
                'Payment account not configured for this property manager. ' +
                'Please ask your landlord to set up their payout account before accepting rent payments.'
            );
        }

        // 3. Calculate fee via FeeEngine
        const fee = await feeEngine.calculate('rent', amount, organizationId, 'organization');

        // 4. Build metadata
        const metadata: Record<string, any> = {
            tenancy_id: tenancyId,
            organization_id: organizationId,
            payment_type: 'rent',
            principal_amount: amount,
            service_fee: fee.serviceFee,
            fee_mode: fee.feeMode,
            schedule_ids: scheduleIds || [],
            custom_fields: [
                {
                    display_name: "Property",
                    variable_name: "property_title",
                    value: tenancy.property?.title || "Unknown Property"
                },
                {
                    display_name: "Tenant Name",
                    variable_name: "tenant_name",
                    value: tenancy.tenant?.fullName || "Unknown Tenant"
                },
                {
                    display_name: "Service Fee",
                    variable_name: "service_fee",
                    value: `GHS ${fee.serviceFee.toFixed(2)}`
                }
            ]
        };

        // 5. Auto-determine schedule IDs if not provided
        if (!scheduleIds || scheduleIds.length === 0) {
            const arrears = await rentScheduleService.calculateArrears(tenancyId, organizationId);
            const schedulesToPay: string[] = [];
            let remainingAmount = amount;

            for (const schedule of arrears.overdueSchedules) {
                if (remainingAmount >= schedule.amountOutstanding) {
                    schedulesToPay.push(schedule.id);
                    remainingAmount -= schedule.amountOutstanding;
                } else if (remainingAmount > 0) {
                    schedulesToPay.push(schedule.id);
                    break;
                }
            }

            for (const schedule of arrears.dueSchedules) {
                if (remainingAmount >= schedule.amountOutstanding) {
                    schedulesToPay.push(schedule.id);
                    remainingAmount -= schedule.amountOutstanding;
                } else if (remainingAmount > 0) {
                    schedulesToPay.push(schedule.id);
                    break;
                }
            }

            metadata.schedule_ids = schedulesToPay;
        }

        // 6. Initialize with Paystack — total charged = principal + fee
        const response = await paystackService.initializeWithSubaccount(
            {
                email,
                amount: fee.totalChargeSubunits,     // Total the payer pays (pesewas)
                currency: tenancy.rentCurrency || 'GHS',
                metadata,
                channels: channel === 'mobile_money' ? ['mobile_money'] : ['card'],
                callback_url: callbackUrl
            },
            paymentConfig.subaccountCode,
            fee.serviceFeeSubunits                    // PROPMETRIK keeps this (pesewas)
        );

        // 7. Record pending transaction in the ledger
        await this.recordPendingTransaction({
            reference: response.data.reference,
            paymentType: 'rent',
            entityId: tenancyId,
            recipientEntityId: organizationId,
            recipientEntityType: 'organization',
            principalAmount: amount,
            serviceFee: fee.serviceFee,
            totalAmount: fee.totalCharge,
            currency: tenancy.rentCurrency || 'GHS',
            feeMode: fee.feeMode,
            percentageRateApplied: fee.percentageRateApplied,
            flatAmountApplied: fee.flatAmountApplied,
            subaccountCode: paymentConfig.subaccountCode,
            payerEmail: email,
            metadata
        });

        logger.info('Initialized rent payment with fee', {
            tenancyId,
            principal: amount,
            serviceFee: fee.serviceFee,
            totalCharge: fee.totalCharge,
            feeMode: fee.feeMode,
            subaccount: paymentConfig.subaccountCode
        });

        return {
            authorizationUrl: response.data.authorization_url,
            accessCode: response.data.access_code,
            reference: response.data.reference,
            feeBreakdown: fee
        };
    }

    // ─── Deal / Project Payments ───────────────────────────────

    /**
     * Initialize a deal or project payment.
     * Works like rent but uses deal/project fee rules.
     */
    async initializeGenericPayment(params: GenericPaymentInitParams): Promise<PaymentInitResult> {
        const {
            entityId,
            entityType,
            recipientId,
            recipientType,
            amount,
            email,
            description,
            channel = 'mobile_money',
            callbackUrl,
            metadata: extraMeta
        } = params;

        // 1. Require subaccount
        const paymentConfig = await paystackService.getPaymentAccountConfig(recipientId, recipientType);
        if (!paymentConfig || !paymentConfig.subaccountCode) {
            throw new Error(
                `Payment account not configured for ${recipientType} (${recipientId}). ` +
                `Recipient must set up their payout account first.`
            );
        }

        // 2. Calculate fee
        const fee = await feeEngine.calculate(entityType as PaymentType, amount, recipientId, recipientType);

        // 3. Metadata
        const metadata: Record<string, any> = {
            entity_id: entityId,
            entity_type: entityType,
            recipient_id: recipientId,
            recipient_type: recipientType,
            payment_type: entityType,
            principal_amount: amount,
            service_fee: fee.serviceFee,
            fee_mode: fee.feeMode,
            description: description || `${entityType} payment`,
            ...(extraMeta || {}),
            custom_fields: [
                {
                    display_name: "Payment Type",
                    variable_name: "payment_type",
                    value: entityType.charAt(0).toUpperCase() + entityType.slice(1)
                },
                {
                    display_name: "Service Fee",
                    variable_name: "service_fee",
                    value: `GHS ${fee.serviceFee.toFixed(2)}`
                }
            ]
        };

        // 4. Initialize with Paystack
        const response = await paystackService.initializeWithSubaccount(
            {
                email,
                amount: fee.totalChargeSubunits,
                currency: 'GHS',
                metadata,
                channels: channel === 'mobile_money' ? ['mobile_money'] : ['card'],
                callback_url: callbackUrl
            },
            paymentConfig.subaccountCode,
            fee.serviceFeeSubunits
        );

        // 5. Record pending
        await this.recordPendingTransaction({
            reference: response.data.reference,
            paymentType: entityType as PaymentType,
            entityId,
            recipientEntityId: recipientId,
            recipientEntityType: recipientType,
            principalAmount: amount,
            serviceFee: fee.serviceFee,
            totalAmount: fee.totalCharge,
            currency: 'GHS',
            feeMode: fee.feeMode,
            percentageRateApplied: fee.percentageRateApplied,
            flatAmountApplied: fee.flatAmountApplied,
            subaccountCode: paymentConfig.subaccountCode,
            payerEmail: email,
            metadata
        });

        logger.info(`Initialized ${entityType} payment with fee`, {
            entityId,
            principal: amount,
            serviceFee: fee.serviceFee,
            totalCharge: fee.totalCharge
        });

        return {
            authorizationUrl: response.data.authorization_url,
            accessCode: response.data.access_code,
            reference: response.data.reference,
            feeBreakdown: fee
        };
    }

    // ─── Verify & Record ───────────────────────────────────────

    /**
     * Verify a Paystack reference and finalize the transaction.
     * Idempotent — checks both new ledger and legacy rent_payments.
     */
    async verifyAndRecordPayment(reference: string): Promise<PaymentResult> {
        try {
            // 1. Idempotency: check new ledger first, then legacy
            const existingLedger = await pool.query(
                `SELECT id, status FROM payment_transactions WHERE paystack_reference = $1`,
                [reference]
            );
            if (existingLedger.rows.length > 0 && existingLedger.rows[0].status === 'success') {
                logger.info('Payment already processed in ledger, skipping', { reference });
                return { success: true, payment: { id: existingLedger.rows[0].id }, schedulesUpdated: 0 };
            }

            const existingLegacy = await pool.query(
                `SELECT id FROM rent_payments WHERE mobile_money_reference = $1 OR bank_reference = $1`,
                [reference]
            );
            if (existingLegacy.rows.length > 0) {
                logger.info('Payment already processed in rent_payments, skipping', { reference });
                return { success: true, payment: { id: existingLegacy.rows[0].id }, schedulesUpdated: 0 };
            }

            // 2. Verify with Paystack
            const verifyResponse = await paystackService.verifyTransaction(reference);

            if (verifyResponse.data.status !== 'success') {
                // Update ledger status
                await pool.query(
                    `UPDATE payment_transactions SET status = $1, paystack_status = $2
                     WHERE paystack_reference = $3`,
                    [verifyResponse.data.status, verifyResponse.data.gateway_response, reference]
                );
                logger.warn(`Payment verification failed: ${verifyResponse.data.status}`, { reference });
                return { success: false, error: verifyResponse.data.status };
            }

            const { metadata, amount, currency, channel, authorization, fees_split } = verifyResponse.data;
            const paymentType = metadata?.payment_type || 'rent';

            // 3. Update ledger to success
            const paystackFee = fees_split
                ? Number((fees_split as any).integration || 0) + Number((fees_split as any).subaccount || 0) + Number((fees_split as any).paystack || 0)
                : null;

            await pool.query(
                `UPDATE payment_transactions SET
                     status = 'success',
                     channel = $1,
                     paystack_status = $2,
                     paystack_fee = $3,
                     verified_at = NOW()
                 WHERE paystack_reference = $4`,
                [
                    channel,
                    verifyResponse.data.gateway_response,
                    paystackFee,
                    reference
                ]
            );

            // 4. For rent payments, also record in legacy rent_payments + apply to schedules
            let schedulesUpdated = 0;
            if (paymentType === 'rent' && metadata?.tenancy_id) {
                // Map channel to PaymentMethod
                let paymentMethod = PaymentMethod.PAYSTACK;
                if (channel === 'mobile_money') {
                    const bank = authorization?.bank?.toLowerCase() || '';
                    if (bank.includes('mtn')) paymentMethod = PaymentMethod.MOBILE_MONEY_MTN;
                    else if (bank.includes('vodafone') || bank.includes('telecel')) paymentMethod = PaymentMethod.MOBILE_MONEY_VODAFONE;
                    else if (bank.includes('airtel') || bank.includes('tigo')) paymentMethod = PaymentMethod.MOBILE_MONEY_AIRTELTIGO;
                }

                // The principal_amount is what the landlord receives (amount minus fee)
                const principalAmount = metadata.principal_amount || (amount / 100);

                // Determine period dates
                let periodStartDate = new Date();
                let periodEndDate = new Date();
                const scheduleIds = metadata.schedule_ids || [];
                if (scheduleIds.length > 0) {
                    const scheduleResult = await pool.query(
                        `SELECT MIN(period_start_date) as start_date, MAX(period_end_date) as end_date
                         FROM rent_schedules WHERE id = ANY($1)`,
                        [scheduleIds]
                    );
                    if (scheduleResult.rows.length > 0 && scheduleResult.rows[0].start_date) {
                        periodStartDate = new Date(scheduleResult.rows[0].start_date);
                        periodEndDate = new Date(scheduleResult.rows[0].end_date);
                    }
                }

                // Record in legacy rent_payments (uses principal, not total with fee)
                const paymentData = {
                    tenancyId: metadata.tenancy_id,
                    paymentAmount: principalAmount,
                    currency,
                    paymentDate: new Date().toISOString(),
                    paymentMethod,
                    mobileMoneyReference: channel === 'mobile_money' ? reference : undefined,
                    bankReference: channel === 'card' ? reference : undefined,
                    periodStartDate: periodStartDate.toISOString(),
                    periodEndDate: periodEndDate.toISOString(),
                    notes: `Paystack: ${reference} | Fee: GHS ${Number(metadata.service_fee || 0).toFixed(2)}`,
                    otherCharges: []
                };

                const recordedPayment = await rentCollectionService.recordPayment(
                    metadata.organization_id,
                    paymentData,
                    undefined
                );

                // Apply to rent schedules
                const appliedPayments = await rentScheduleService.applyPayment(
                    recordedPayment.id,
                    metadata.organization_id
                );
                schedulesUpdated = appliedPayments.length;

                logger.info('Rent payment verified, recorded, and applied', {
                    reference,
                    paymentId: recordedPayment.id,
                    schedulesUpdated
                });

                return {
                    success: true,
                    payment: recordedPayment,
                    verification: verifyResponse.data,
                    schedulesUpdated
                };
            }

            // Non-rent payments (deal/project) — ledger already updated
            logger.info(`${paymentType} payment verified and recorded in ledger`, { reference });
            return {
                success: true,
                payment: { reference, paymentType },
                verification: verifyResponse.data,
                schedulesUpdated: 0
            };

        } catch (error: any) {
            logger.error('Error verifying/recording payment', { reference, error: error.message });
            return { success: false, error: error.message };
        }
    }

    // ─── Payment Summary ───────────────────────────────────────

    /**
     * Get payment summary for a tenancy.
     */
    async getPaymentSummary(tenancyId: string, organizationId: string): Promise<{
        arrears: any;
        recentPayments: any[];
        upcomingSchedules: any[];
    }> {
        const arrears = await rentScheduleService.calculateArrears(tenancyId, organizationId);

        const paymentsResult = await pool.query(
            `SELECT * FROM rent_payments
             WHERE tenancy_id = $1
             ORDER BY payment_date DESC
             LIMIT 10`,
            [tenancyId]
        );

        const upcomingResult = await pool.query(
            `SELECT * FROM rent_schedules
             WHERE tenancy_id = $1 AND status = $2
             ORDER BY due_date ASC
             LIMIT 6`,
            [tenancyId, RentScheduleStatus.UPCOMING]
        );

        return {
            arrears,
            recentPayments: paymentsResult.rows,
            upcomingSchedules: upcomingResult.rows
        };
    }

    // ─── Webhook Handler ───────────────────────────────────────

    /**
     * Handle Paystack webhook events.
     */
    async handleWebhook(event: string, data: any): Promise<void> {
        logger.info('Processing Paystack webhook', { event });

        switch (event) {
            case 'charge.success':
                await this.verifyAndRecordPayment(data.reference);
                break;

            case 'transfer.success':
                logger.info('Settlement completed', {
                    reference: data.reference,
                    amount: data.amount
                });
                // Update ledger settled_at if we can find the transaction
                await pool.query(
                    `UPDATE payment_transactions SET settled_at = NOW()
                     WHERE paystack_reference = $1`,
                    [data.reference]
                ).catch(() => {}); // Best-effort
                break;

            case 'transfer.failed':
                logger.error('Settlement failed', {
                    reference: data.reference,
                    reason: data.reason
                });
                // TODO: Alert admin, retry logic
                break;

            case 'charge.failed':
                await pool.query(
                    `UPDATE payment_transactions SET status = 'failed', paystack_status = $1
                     WHERE paystack_reference = $2`,
                    [data.gateway_response || 'charge.failed', data.reference]
                ).catch(() => {});
                break;

            default:
                logger.info('Unhandled webhook event', { event });
        }
    }

    // ─── Crypto (Multi-Token) Payments ──────────────────────

    /**
     * Initialize a crypto rent payment.
     * Returns all values the frontend needs to call processPayment() on-chain.
     */
    async initializeCryptoRentPayment(params: {
        tenancyId: string;
        organizationId: string;
        amount: number;
        payerWalletAddress: string;
        tokenAddress: string;
        scheduleIds?: string[];
    }): Promise<CryptoPaymentInitResult> {
        const { tenancyId, organizationId, amount, payerWalletAddress, tokenAddress, scheduleIds } = params;

        // 1. Verify tenancy exists
        const tenancy = await tenancyService.getTenancyById(tenancyId, organizationId);
        if (!tenancy) {
            throw new Error('Tenancy not found');
        }

        // 2. Check crypto rail is configured
        if (!cryptoPaymentService.isConfigured()) {
            throw new Error('Crypto payment rail is not configured');
        }

        // 3. Generate PROPMETRIK reference
        const reference = `PM-RENT-CRYPTO-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        // 4. Initialize via crypto service
        return cryptoPaymentService.initializeCryptoPayment({
            paymentType: 'rent',
            entityId: organizationId,
            entityType: 'organization',
            principalAmountGHS: amount,
            payerWalletAddress,
            tokenAddress,
            paymentReference: reference,
            metadata: {
                tenancy_id: tenancyId,
                organization_id: organizationId,
                payment_type: 'rent',
                principal_amount_ghs: amount,
                schedule_ids: scheduleIds || [],
            },
        });
    }

    /**
     * Initialize a crypto deal/project payment.
     */
    async initializeCryptoGenericPayment(params: {
        entityId: string;
        entityType: 'deal' | 'project';
        recipientId: string;
        recipientType: string;
        amount: number;
        payerWalletAddress: string;
        tokenAddress: string;
        description?: string;
        metadata?: Record<string, any>;
    }): Promise<CryptoPaymentInitResult> {
        const { entityId, entityType, recipientId, recipientType, amount, payerWalletAddress, tokenAddress, description, metadata: extraMeta } = params;

        if (!cryptoPaymentService.isConfigured()) {
            throw new Error('Crypto payment rail is not configured');
        }

        const reference = `PM-${entityType.toUpperCase()}-CRYPTO-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        return cryptoPaymentService.initializeCryptoPayment({
            paymentType: entityType,
            entityId: recipientId,
            entityType: recipientType,
            principalAmountGHS: amount,
            payerWalletAddress,
            tokenAddress,
            paymentReference: reference,
            metadata: {
                entity_id: entityId,
                entity_type: entityType,
                recipient_id: recipientId,
                recipient_type: recipientType,
                description: description || `${entityType} crypto payment`,
                ...(extraMeta || {}),
            },
        });
    }

    /**
     * Verify a crypto payment after the user submits the on-chain transaction.
     */
    async verifyCryptoPayment(txHash: string): Promise<CryptoVerifyResult> {
        if (!cryptoPaymentService.isConfigured()) {
            return { success: false, error: 'Crypto payment rail is not configured' };
        }
        return cryptoPaymentService.verifyOnChainPayment(txHash);
    }

    /**
     * Check if crypto payment rail is available.
     */
    isCryptoConfigured(): boolean {
        return cryptoPaymentService.isConfigured();
    }

    // ─── Unified Crypto Payment (Any Coin → Any Coin) ───────────────────

    /**
     * Initialize a unified crypto payment that supports ANY payer coin →
     * ANY recipient preferred settlement coin.
     *
     * Routes automatically:
     * - On-chain (Polygon ERC-20) → smart contract handles swap + fees + payout
     * - Off-chain (BTC, ETH L1, SOL, LTC, etc.) → NOWPayments handles conversion
     *
     * For escrow flows: normalizes to USDT on Polygon → contract escrow →
     * NOWPayments payout to client's preferred coin on release.
     */
    async initializeUnifiedCryptoPayment(params: {
        paymentType: 'rent' | 'deal' | 'project';
        entityId: string;
        entityType: string;
        recipientId: string;
        recipientType: string;
        amount: number;
        payerCurrency: string;
        payerChain: string;
        payerWalletAddress?: string;
        requiresEscrow?: boolean;
        scheduleIds?: string[];
        description?: string;
        metadata?: Record<string, any>;
    }): Promise<any> {
        const {
            paymentType, entityId, entityType, recipientId, recipientType,
            amount, payerCurrency, payerChain, payerWalletAddress,
            requiresEscrow, scheduleIds, description, metadata: extraMeta
        } = params;

        // Generate reference
        const reference = `PM-${paymentType.toUpperCase()}-UNIFIED-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        // Import the routing service
        const { paymentRoutingService } = await import('../../../../shared-services/payments/crypto/paymentRoutingService');

        return paymentRoutingService.initializePayment({
            paymentType,
            entityId: recipientId,
            entityType: recipientType,
            principalAmountGHS: amount,
            payerCurrency,
            payerChain,
            payerWalletAddress,
            paymentReference: reference,
            requiresEscrow: requiresEscrow ?? false,
            metadata: {
                entity_id: entityId,
                entity_type: entityType,
                recipient_id: recipientId,
                recipient_type: recipientType,
                description: description || `${paymentType} unified crypto payment`,
                schedule_ids: scheduleIds || [],
                ...(extraMeta || {}),
            },
        });
    }

    // ─── Private Helpers ───────────────────────────────────────

    /**
     * Record a pending transaction in the payment_transactions ledger.
     */
    private async recordPendingTransaction(params: {
        reference: string;
        paymentType: PaymentType;
        entityId: string;
        recipientEntityId: string;
        recipientEntityType: string;
        principalAmount: number;
        serviceFee: number;
        totalAmount: number;
        currency: string;
        feeMode: string;
        percentageRateApplied: number;
        flatAmountApplied: number;
        subaccountCode: string;
        payerEmail: string;
        metadata: Record<string, any>;
    }): Promise<void> {
        try {
            // Convert GHS amounts to pesewas (integers) for DB storage
            const grossAmountPesewas = Math.round(params.totalAmount * 100);
            const principalAmountPesewas = Math.round(params.principalAmount * 100);
            const serviceFeePesewas = Math.round(params.serviceFee * 100);

            // Derive domain_record_type from payment_type
            const domainRecordType = `${params.paymentType}_payment`;

            await pool.query(
                `INSERT INTO payment_transactions (
                    reference, paystack_reference, payment_type,
                    domain_record_id, domain_record_type,
                    recipient_id, recipient_type,
                    gross_amount, principal_amount, service_fee, currency,
                    fee_mode, fee_percentage_applied, fee_flat_applied,
                    subaccount_code, payer_email,
                    status, metadata
                ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', $16)
                ON CONFLICT (reference) DO NOTHING`,
                [
                    params.reference,
                    params.paymentType,
                    params.entityId,
                    domainRecordType,
                    params.recipientEntityId,
                    params.recipientEntityType,
                    grossAmountPesewas,
                    principalAmountPesewas,
                    serviceFeePesewas,
                    params.currency,
                    params.feeMode,
                    params.percentageRateApplied,
                    params.flatAmountApplied,
                    params.subaccountCode,
                    params.payerEmail,
                    JSON.stringify(params.metadata)
                ]
            );
        } catch (error: any) {
            // Non-fatal — don't block the payment if ledger insert fails
            logger.error('Failed to record pending transaction in ledger', {
                reference: params.reference,
                error: error.message
            });
        }
    }
}

export const paymentProcessor = new PaymentProcessor();
