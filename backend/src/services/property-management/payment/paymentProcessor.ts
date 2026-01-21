/**
 * Payment Processor
 * Phase 4.7: Payment Logic Orchestration
 * 
 * Coordinates between Paystack Service and Rent Collection Service
 * to handle the full payment lifecycle
 * 
 * @module services/property-management/payment/paymentProcessor
 */

import { paystackService, PaystackInitializeResponse, PaystackVerifyResponse } from './paystackService';
import { rentCollectionService } from '../rent-collection/rentCollectionService';
import { tenancyService } from '../leases/tenancyService';
import { PaymentMethod, PaymentStatus } from '../../../types/property-management.types';
import { logger } from '../../../utils/logger';

export class PaymentProcessor {

    /**
     * Initialize a rent payment transaction
     * @param tenancyId - ID of the tenancy
     * @param amount - Amount to pay
     * @param email - Payer email
     * @param channel - 'mobile_money' or 'card'
     * @param callbackUrl - Redirect URL after payment
     * @returns Paystack initialization response
     */
    async initializeRentPayment(
        tenancyId: string,
        organizationId: string,
        amount: number,
        email: string,
        channel: 'mobile_money' | 'card' = 'mobile_money',
        callbackUrl?: string
    ): Promise<PaystackInitializeResponse> {

        // 1. Verify tenancy exists and get details
        const tenancy = await tenancyService.getTenancyById(tenancyId, organizationId);
        if (!tenancy) {
            throw new Error('Tenancy not found');
        }

        // 2. Initialize with Paystack
        // Amount in Paystack is in lowest currency unit (pesewas/cents). 
        // Assuming amount passed is in standard units (GHS/USD).
        const amountInSubunits = Math.round(amount * 100);

        // Add metadata for tracking
        const metadata = {
            tenancy_id: tenancyId,
            organization_id: organizationId,
            payment_type: 'rent',
            period_start: new Date().toISOString(), // Default to now, can be adjusted
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

        const response = await paystackService.initializeTransaction({
            email,
            amount: amountInSubunits,
            currency: tenancy.rentCurrency || 'GHS',
            metadata,
            channels: channel === 'mobile_money' ? ['mobile_money'] : ['card'],
            callback_url: callbackUrl
        });

        return response;
    }

    /**
     * Verify and Record Payment
     * Call this after successful return from Paystack or via Webhook
     */
    async verifyAndRecordPayment(reference: string): Promise<any> {
        // 1. Verify with Paystack
        const verifyResponse = await paystackService.verifyTransaction(reference);

        if (verifyResponse.data.status !== 'success') {
            logger.warn(`Payment verification failed or not success: ${verifyResponse.data.status}`, { reference });
            return { success: false, status: verifyResponse.data.status };
        }

        const { metadata, amount, currency, channel, authorization } = verifyResponse.data;

        if (!metadata || !metadata.tenancy_id) {
            throw new Error('Transaction missing metadata (tenancy_id)');
        }

        // 2. Map Paystack channel to PaymentMethod enum
        let paymentMethod = PaymentMethod.PAYSTACK; // Default fallback
        if (channel === 'mobile_money') {
            // Paystack doesn't always specify provider in 'channel', check authorization bank
            const bank = authorization.bank?.toLowerCase() || '';
            if (bank.includes('mtn')) paymentMethod = PaymentMethod.MOBILE_MONEY_MTN;
            else if (bank.includes('vodafone') || bank.includes('telecel')) paymentMethod = PaymentMethod.MOBILE_MONEY_VODAFONE;
            else if (bank.includes('airtel') || bank.includes('tigo')) paymentMethod = PaymentMethod.MOBILE_MONEY_AIRTELTIGO;
        } else if (channel === 'card') {
            paymentMethod = PaymentMethod.PAYSTACK; // Or generic card
        }

        // 3. Record in database via RentCollectionService
        // Check if duplicate first? rentCollectionService handles its own inserts.
        // Ideally we should check if this reference already exists to make idempotent.

        // NOTE: Implementation of deduplication would go here (e.g. check payment_reference)
        // For now assuming RentCollectionService will just record it.

        const paymentData = {
            tenancyId: metadata.tenancy_id,
            paymentAmount: amount / 100, // Convert back to standard unit
            currency,
            paymentDate: new Date().toISOString(),
            paymentMethod,
            mobileMoneyReference: channel === 'mobile_money' ? reference : undefined,
            bankReference: channel === 'card' ? reference : undefined,
            periodStartDate: new Date().toISOString(), // Logic to determine period needed
            periodEndDate: new Date().toISOString(),   // Logic to determine period needed
            notes: `Paystack Transaction: ${reference}`,
            otherCharges: []
        };

        const recordedPayment = await rentCollectionService.recordPayment(
            metadata.organization_id,
            paymentData,
            'system' // specific system user ID
        );

        return {
            success: true,
            payment: recordedPayment,
            verification: verifyResponse.data
        };
    }
}

export const paymentProcessor = new PaymentProcessor();
