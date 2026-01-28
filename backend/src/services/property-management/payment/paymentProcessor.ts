/**
 * Payment Processor
 * Phase 4.7: Payment Logic Orchestration
 * 
 * Coordinates between Paystack Service, Rent Schedule Service, and Rent Collection Service
 * to handle the full payment lifecycle with sub-account support for property managers
 * 
 * @module services/property-management/payment/paymentProcessor
 */

import { paystackService, PaystackInitializeResponse, PaystackVerifyResponse } from './paystackService';
import { rentCollectionService } from '../rent-collection/rentCollectionService';
import { rentScheduleService, RentScheduleStatus } from '../rent-collection/rentScheduleService';
import { tenancyService } from '../leases/tenancyService';
import { PaymentMethod, PaymentStatus } from '../../../types/property-management.types';
import { logger } from '../../../utils/logger';
import { pool } from '../../../database';

export interface RentPaymentInitParams {
    tenancyId: string;
    organizationId: string;
    amount: number;
    email: string;
    channel?: 'mobile_money' | 'card';
    callbackUrl?: string;
    scheduleIds?: string[]; // Specific schedules to pay for
}

export interface PaymentResult {
    success: boolean;
    payment?: any;
    verification?: any;
    schedulesUpdated?: number;
    error?: string;
}

export class PaymentProcessor {

    /**
     * Initialize a rent payment transaction
     * Uses sub-accounts to split payment between property manager and platform
     */
    async initializeRentPayment(params: RentPaymentInitParams): Promise<PaystackInitializeResponse> {
        const {
            tenancyId,
            organizationId,
            amount,
            email,
            channel = 'mobile_money',
            callbackUrl,
            scheduleIds
        } = params;

        // 1. Verify tenancy exists and get details
        const tenancy = await tenancyService.getTenancyById(tenancyId, organizationId);
        if (!tenancy) {
            throw new Error('Tenancy not found');
        }

        // 2. Get payment account config for the organization (sub-account)
        const paymentConfig = await paystackService.getPaymentAccountConfig(organizationId);

        // Amount in Paystack is in lowest currency unit (pesewas/cents)
        const amountInSubunits = Math.round(amount * 100);

        // Add metadata for tracking
        const metadata: Record<string, any> = {
            tenancy_id: tenancyId,
            organization_id: organizationId,
            payment_type: 'rent',
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
                }
            ]
        };

        // Determine which periods this payment covers
        if (!scheduleIds || scheduleIds.length === 0) {
            // Auto-calculate which schedules to pay (oldest outstanding first)
            const arrears = await rentScheduleService.calculateArrears(tenancyId, organizationId);
            const schedulesToPay: string[] = [];
            let remainingAmount = amount;

            // Add overdue schedules first
            for (const schedule of arrears.overdueSchedules) {
                if (remainingAmount >= schedule.amountOutstanding) {
                    schedulesToPay.push(schedule.id);
                    remainingAmount -= schedule.amountOutstanding;
                } else if (remainingAmount > 0) {
                    schedulesToPay.push(schedule.id);
                    break;
                }
            }

            // Then due schedules
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

        // 3. Initialize with Paystack
        let response: PaystackInitializeResponse;

        if (paymentConfig && paymentConfig.subaccountCode) {
            // Use sub-account - rent goes to property manager, platform fee to PropMetrik
            response = await paystackService.initializeWithSubaccount(
                {
                    email,
                    amount: amountInSubunits,
                    currency: tenancy.rentCurrency || 'GHS',
                    metadata,
                    channels: channel === 'mobile_money' ? ['mobile_money'] : ['card'],
                    callback_url: callbackUrl
                },
                paymentConfig.subaccountCode,
                paymentConfig.platformFeePercentage,
                paymentConfig.platformFeeFlat
            );

            logger.info('Initialized split payment to property manager', {
                tenancyId,
                subaccount: paymentConfig.subaccountCode,
                platformFee: `${paymentConfig.platformFeePercentage}%`
            });
        } else {
            // No sub-account configured - all funds go to main PropMetrik account
            response = await paystackService.initializeTransaction({
                email,
                amount: amountInSubunits,
                currency: tenancy.rentCurrency || 'GHS',
                metadata,
                channels: channel === 'mobile_money' ? ['mobile_money'] : ['card'],
                callback_url: callbackUrl
            });

            logger.warn('No sub-account configured for organization, payment goes to main account', {
                tenancyId,
                organizationId
            });
        }

        return response;
    }

    /**
     * Verify and Record Payment
     * Call this after successful return from Paystack or via Webhook
     * Links payment to rent schedules automatically
     */
    async verifyAndRecordPayment(reference: string): Promise<PaymentResult> {
        try {
            // 1. Check if payment already processed (idempotency)
            const existingPayment = await pool.query(
                `SELECT id FROM rent_payments 
                 WHERE mobile_money_reference = $1 OR bank_reference = $1`,
                [reference]
            );

            if (existingPayment.rows.length > 0) {
                logger.info('Payment already processed, skipping duplicate', { reference });
                return {
                    success: true,
                    payment: { id: existingPayment.rows[0].id },
                    schedulesUpdated: 0
                };
            }

            // 2. Verify with Paystack
            const verifyResponse = await paystackService.verifyTransaction(reference);

            if (verifyResponse.data.status !== 'success') {
                logger.warn(`Payment verification failed: ${verifyResponse.data.status}`, { reference });
                return { success: false, error: verifyResponse.data.status };
            }

            const { metadata, amount, currency, channel, authorization } = verifyResponse.data;

            if (!metadata || !metadata.tenancy_id) {
                throw new Error('Transaction missing metadata (tenancy_id)');
            }

            // 3. Map Paystack channel to PaymentMethod enum
            let paymentMethod = PaymentMethod.PAYSTACK;
            if (channel === 'mobile_money') {
                const bank = authorization.bank?.toLowerCase() || '';
                if (bank.includes('mtn')) paymentMethod = PaymentMethod.MOBILE_MONEY_MTN;
                else if (bank.includes('vodafone') || bank.includes('telecel')) paymentMethod = PaymentMethod.MOBILE_MONEY_VODAFONE;
                else if (bank.includes('airtel') || bank.includes('tigo')) paymentMethod = PaymentMethod.MOBILE_MONEY_AIRTELTIGO;
            }

            // 4. Determine period dates from schedules or calculate
            let periodStartDate = new Date();
            let periodEndDate = new Date();

            const scheduleIds = metadata.schedule_ids || [];
            if (scheduleIds.length > 0) {
                // Get first and last schedule dates
                const scheduleResult = await pool.query(
                    `SELECT MIN(period_start_date) as start_date, MAX(period_end_date) as end_date
                     FROM rent_schedules
                     WHERE id = ANY($1)`,
                    [scheduleIds]
                );

                if (scheduleResult.rows.length > 0) {
                    periodStartDate = new Date(scheduleResult.rows[0].start_date);
                    periodEndDate = new Date(scheduleResult.rows[0].end_date);
                }
            }

            // 5. Record the payment
            const paymentData = {
                tenancyId: metadata.tenancy_id,
                paymentAmount: amount / 100, // Convert back to standard unit
                currency,
                paymentDate: new Date().toISOString(),
                paymentMethod,
                mobileMoneyReference: channel === 'mobile_money' ? reference : undefined,
                bankReference: channel === 'card' ? reference : undefined,
                periodStartDate: periodStartDate.toISOString(),
                periodEndDate: periodEndDate.toISOString(),
                notes: `Paystack Transaction: ${reference}`,
                otherCharges: []
            };

            const recordedPayment = await rentCollectionService.recordPayment(
                metadata.organization_id,
                paymentData,
                'system'
            );

            // 6. Link payment to rent schedules
            const appliedPayments = await rentScheduleService.applyPayment(
                recordedPayment.id,
                metadata.organization_id
            );

            logger.info('Payment verified, recorded, and applied to schedules', {
                reference,
                paymentId: recordedPayment.id,
                schedulesUpdated: appliedPayments.length
            });

            return {
                success: true,
                payment: recordedPayment,
                verification: verifyResponse.data,
                schedulesUpdated: appliedPayments.length
            };
        } catch (error: any) {
            logger.error('Error verifying/recording payment', { reference, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Get payment summary for a tenancy
     * Includes outstanding balance, payment history, and upcoming dues
     */
    async getPaymentSummary(tenancyId: string, organizationId: string): Promise<{
        arrears: any;
        recentPayments: any[];
        upcomingSchedules: any[];
    }> {
        // Get arrears calculation
        const arrears = await rentScheduleService.calculateArrears(tenancyId, organizationId);

        // Get recent payments
        const paymentsResult = await pool.query(
            `SELECT * FROM rent_payments
             WHERE tenancy_id = $1
             ORDER BY payment_date DESC
             LIMIT 10`,
            [tenancyId]
        );

        // Get upcoming schedules
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

    /**
     * Handle Paystack webhook events
     */
    async handleWebhook(event: string, data: any): Promise<void> {
        logger.info('Processing Paystack webhook', { event });

        switch (event) {
            case 'charge.success':
                await this.verifyAndRecordPayment(data.reference);
                break;

            case 'transfer.success':
                // Handle settlement to property manager
                logger.info('Settlement to property manager completed', {
                    reference: data.reference,
                    amount: data.amount
                });
                break;

            case 'transfer.failed':
                logger.error('Settlement to property manager failed', {
                    reference: data.reference,
                    reason: data.reason
                });
                // TODO: Alert admin, retry logic
                break;

            default:
                logger.info('Unhandled webhook event', { event });
        }
    }
}

export const paymentProcessor = new PaymentProcessor();

export const paymentProcessor = new PaymentProcessor();
