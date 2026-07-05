/**
 * Paystack Service
 * Phase 4.7: Payment Processing Integration
 * 
 * Handles interaction with Paystack API for payments including
 * Mobile Money (MTN, Vodafone, AirtelTigo) and Cards
 * 
 * Supports Sub-accounts for property managers to receive payments directly
 * 
 * @module services/property-management/payment/paystackService
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { logger } from '../../../utils/logger';
import { pool } from '../../../database';
import { config } from '../../../config';

export interface PaystackInitializeParams {
    email: string;
    amount: number; // In pesewas/cents (e.g. GHS 10.00 = 1000)
    currency?: string; // GHS, USD, NGN
    reference?: string;
    callback_url?: string;
    metadata?: Record<string, any>;
    channels?: string[]; // ['card', 'mobile_money']
    subaccount?: string; // Subaccount code for split payments
    transaction_charge?: number; // Platform fee in pesewas
    bearer?: 'account' | 'subaccount'; // Who bears Paystack's fees
}

export interface PaystackInitializeResponse {
    status: boolean;
    message: string;
    data: {
        authorization_url: string;
        access_code: string;
        reference: string;
    };
}

export interface PaystackVerifyResponse {
    status: boolean;
    message: string;
    data: {
        status: string; // 'success', 'failed', 'abandoned'
        reference: string;
        amount: number;
        currency: string;
        gateway_response: string;
        channel: string;
        customer: {
            email: string;
            customer_code: string;
        };
        authorization: {
            authorization_code: string;
            card_type: string;
            last4: string;
            bank: string;
            // Present on tokenizable charges — governs whether the auth can be
            // re-charged customer-not-present (true for cards; usually false for GH MoMo).
            reusable?: boolean;
            channel?: string;      // 'card' | 'mobile_money'
            signature?: string;
            exp_month?: string;
            exp_year?: string;
        };
        metadata?: Record<string, any>;
        subaccount?: {
            subaccount_code: string;
        };
        fees_split?: {
            integration: number;
            subaccount: number;
            params: {
                bearer: string;
                transaction_charge: number;
            };
        };
    };
}

// Sub-account interfaces
export interface CreateSubaccountParams {
    business_name: string;
    settlement_bank: string; // Bank code
    account_number: string;
    percentage_charge: number; // 0-100
    primary_contact_email?: string;
    primary_contact_name?: string;
    primary_contact_phone?: string;
    metadata?: Record<string, any>;
}

export interface SubaccountResponse {
    status: boolean;
    message: string;
    data: {
        subaccount_code: string;
        business_name: string;
        account_number: string;
        percentage_charge: number;
        settlement_bank: string;
        active: boolean;
        id: number;
    };
}

export interface PaymentAccountConfig {
    organizationId: string;
    subaccountCode: string;
    platformFeePercentage: number;
    platformFeeFlat: number;
}

export class PaystackService {
    private client: AxiosInstance;
    private secretKey: string;
    private publicKey: string;
    private isTestMode: boolean;

    constructor() {
        // Uses FINANCE_MODE to select test/live keys (independent of NODE_ENV)
        this.secretKey = config.paystack.secretKey;
        this.publicKey = config.paystack.publicKey;
        this.isTestMode = config.paystack.isTestMode;

        if (!this.secretKey) {
            logger.warn('Paystack keys not configured. Payment operations will fail. Check FINANCE_MODE and PAYSTACK_TEST/LIVE keys.');
        }

        logger.info(`PaystackService initialized in ${this.isTestMode ? 'TEST' : 'LIVE'} mode (FINANCE_MODE=${config.app.financeMode})`);

        this.client = axios.create({
            baseURL: config.paystack.apiBaseUrl,
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30s timeout
        });
    }

    /**
     * Get the public key for frontend use
     */
    getPublicKey(): string {
        return this.publicKey;
    }

    /**
     * Check if running in test mode
     */
    isTest(): boolean {
        return this.isTestMode;
    }

    /**
     * Initialize a transaction
     */
    async initializeTransaction(params: PaystackInitializeParams): Promise<PaystackInitializeResponse> {
        try {
            // Ensure amount is integer
            const payload = {
                ...params,
                amount: Math.round(params.amount)
            };

            const response = await this.client.post('/transaction/initialize', payload);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'initializeTransaction');
            throw error;
        }
    }

    /**
     * Verify a transaction
     */
    async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
        try {
            const response = await this.client.get(`/transaction/verify/${encodeURIComponent(reference)}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'verifyTransaction');
            throw error;
        }
    }

    /**
     * Charge a previously-saved authorization (reusable card token).
     * Used for recurring subscription renewals — the customer is NOT present.
     * The authorization_code comes from a prior successful charge's
     * `authorization.authorization_code`. Returns a verify-shaped response
     * (data.status === 'success' on a completed charge). Use a unique
     * `reference` per attempt so the ledger/reconciliation stays idempotent.
     */
    async chargeAuthorization(params: {
        email: string;
        amount: number; // pesewas (GHS minor units), already ×100
        authorization_code: string;
        reference: string;
        currency?: string;
        metadata?: Record<string, any>;
        // Split-payment (rent autopay): route the principal to the landlord's subaccount
        // and keep the pre-computed platform fee, exactly like a hosted rent charge.
        subaccount?: string;
        transaction_charge?: number;              // platform fee in pesewas (already computed)
        bearer?: 'account' | 'subaccount';
    }): Promise<PaystackVerifyResponse> {
        try {
            const payload: Record<string, any> = {
                email: params.email,
                amount: Math.round(params.amount),
                authorization_code: params.authorization_code,
                reference: params.reference,
                currency: params.currency || 'GHS',
                metadata: params.metadata || {},
            };
            if (params.subaccount) {
                payload.subaccount = params.subaccount;
                if (typeof params.transaction_charge === 'number') {
                    payload.transaction_charge = Math.round(params.transaction_charge);
                }
                payload.bearer = params.bearer || 'subaccount';
            }
            const response = await this.client.post('/transaction/charge_authorization', payload);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'chargeAuthorization');
            throw error;
        }
    }

    /**
     * Verify Webhook Signature
     * Ensures the request is genuinely from Paystack
     */
    verifyWebhookSignature(signature: string, body: any): boolean {
        const hash = crypto
            .createHmac('sha512', this.secretKey)
            .update(JSON.stringify(body))
            .digest('hex');

        return hash === signature;
    }

    /**
     * Refund a transaction (full or partial).
     *
     * Paystack processes refunds ASYNCHRONOUSLY — this call only *submits* the refund;
     * completion arrives later via the `refund.processed` webhook. Returns Paystack's
     * refund record (data.id / data.status).
     *
     * @param transaction the ORIGINAL transaction reference or Paystack transaction id
     * @param amount      optional partial amount in pesewas (GHS minor units); omit for a full refund
     * @param merchantNote optional reason recorded on the Paystack refund
     */
    async refundTransaction(transaction: string, amount?: number, merchantNote?: string): Promise<any> {
        try {
            const payload: Record<string, any> = { transaction };
            if (amount && amount > 0) payload.amount = Math.round(amount);
            if (merchantNote) payload.merchant_note = merchantNote;

            const response = await this.client.post('/refund', payload);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'refundTransaction');
            throw error;
        }
    }

    /**
     * Create a transfer recipient (required before initiating a Paystack transfer/payout).
     * @param type 'nuban' for a bank account, 'mobile_money' for a MoMo wallet
     * @param name recipient display name
     * @param accountNumber bank account number or MoMo phone number
     * @param bankCode Paystack bank code (banks) or telco code (mobile money)
     * @returns Paystack response; data.recipient_code is what initiateTransfer needs
     */
    async createTransferRecipient(params: {
        type: 'nuban' | 'mobile_money';
        name: string;
        accountNumber: string;
        bankCode: string;
        currency?: string;
    }): Promise<any> {
        try {
            const response = await this.client.post('/transferrecipient', {
                type: params.type,
                name: params.name,
                account_number: params.accountNumber,
                bank_code: params.bankCode,
                currency: params.currency || 'GHS',
            });
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'createTransferRecipient');
            throw error;
        }
    }

    /**
     * Initiate a transfer (payout) to a previously-created recipient.
     * Paystack processes transfers asynchronously — the outcome (or an OTP requirement)
     * arrives via the transfer.success / transfer.failed webhook. `amount` is in pesewas.
     * Use a unique `reference` per attempt so reconciliation stays idempotent.
     */
    async initiateTransfer(params: {
        recipientCode: string;
        amount: number;   // pesewas
        reference: string;
        reason?: string;
        source?: string;
    }): Promise<any> {
        try {
            const response = await this.client.post('/transfer', {
                source: params.source || 'balance',
                recipient: params.recipientCode,
                amount: Math.round(params.amount),
                reference: params.reference,
                reason: params.reason,
            });
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'initiateTransfer');
            throw error;
        }
    }

    /**
     * Check the integration's Paystack balance (pesewas). Used to pre-flight a payout
     * so we don't submit a transfer that will bounce for insufficient funds.
     */
    async getBalance(): Promise<any> {
        try {
            const response = await this.client.get('/balance');
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'getBalance');
            throw error;
        }
    }

    /**
     * Get List of Banks (Ghana)
     */
    async getBanks(country: string = 'ghana') {
        try {
            const response = await this.client.get(`/bank?country=${country}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'getBanks');
            throw error;
        }
    }

    /**
     * Resolve Account Number (Name enquiry)
     */
    async resolveAccount(accountNumber: string, bankCode: string) {
        try {
            const response = await this.client.get(`/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'resolveAccount');
            // Return Paystack's actual error response so frontend can show a meaningful message
            const paystackMessage = error.response?.data?.message;
            const paystackMeta = error.response?.data?.meta;
            const err: any = new Error(paystackMessage || 'Account resolution failed');
            err.status = error.response?.status || 422;
            err.paystackMessage = paystackMessage;
            err.paystackMeta = paystackMeta;
            throw err;
        }
    }

    // ========================================
    // SUB-ACCOUNT METHODS
    // For property managers to receive rent directly
    // ========================================

    /**
     * Create a sub-account for a property manager
     * Allows rent payments to go directly to their bank account
     */
    async createSubaccount(params: CreateSubaccountParams): Promise<SubaccountResponse> {
        try {
            const response = await this.client.post('/subaccount', params);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'createSubaccount');
            throw error;
        }
    }

    /**
     * Get a sub-account by code
     */
    async getSubaccount(subaccountCode: string): Promise<SubaccountResponse> {
        try {
            const response = await this.client.get(`/subaccount/${subaccountCode}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'getSubaccount');
            throw error;
        }
    }

    /**
     * Update a sub-account
     */
    async updateSubaccount(subaccountCode: string, params: Partial<CreateSubaccountParams>): Promise<SubaccountResponse> {
        try {
            const response = await this.client.put(`/subaccount/${subaccountCode}`, params);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'updateSubaccount');
            throw error;
        }
    }

    /**
     * List all sub-accounts
     */
    async listSubaccounts(perPage: number = 50, page: number = 1): Promise<any> {
        try {
            const response = await this.client.get(`/subaccount?perPage=${perPage}&page=${page}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'listSubaccounts');
            throw error;
        }
    }

    /**
     * Initialize a transaction with split payment to sub-account
     * Rent goes to property manager, platform fee goes to main account.
     *
     * IMPORTANT: `transactionChargeSubunits` is the ALREADY-COMPUTED platform fee in pesewas,
     * produced by the FeeEngine. Do NOT re-calculate here.
     */
    async initializeWithSubaccount(
        params: PaystackInitializeParams,
        subaccountCode: string,
        transactionChargeSubunits: number
    ): Promise<PaystackInitializeResponse> {
        try {
            const amountInPesewas = Math.round(params.amount);

            const payload = {
                ...params,
                amount: amountInPesewas,
                subaccount: subaccountCode,
                transaction_charge: transactionChargeSubunits,
                bearer: 'subaccount' as const // Subaccount bears Paystack fees
            };

            logger.info('Initializing split payment', {
                totalAmount: amountInPesewas / 100,
                platformFee: transactionChargeSubunits / 100,
                toSubaccount: (amountInPesewas - transactionChargeSubunits) / 100,
                subaccountCode
            });

            const response = await this.client.post('/transaction/initialize', payload);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'initializeWithSubaccount');
            throw error;
        }
    }

    /**
     * Get payment account config for an entity.
     * Checks the new `payment_accounts` table first, then falls back to legacy `pm_payment_accounts`.
     */
    async getPaymentAccountConfig(
        entityId: string,
        entityType: string = 'organization',
        serviceType: string = 'property_management'
    ): Promise<PaymentAccountConfig | null> {
        try {
            // 1. Try new unified payment_accounts table (filtered by service_type)
            const newResult = await pool.query(
                `SELECT * FROM payment_accounts
                 WHERE entity_id = $1 AND entity_type = $2 AND service_type = $3 AND is_active = TRUE
                 LIMIT 1`,
                [entityId, entityType, serviceType]
            );

            if (newResult.rows.length > 0) {
                const row = newResult.rows[0];
                return {
                    organizationId: row.entity_id,
                    subaccountCode: row.paystack_subaccount_code,
                    platformFeePercentage: parseFloat(row.platform_fee_percentage || 1),
                    platformFeeFlat: parseFloat(row.platform_fee_flat || 25)
                };
            }

            // 2. Fallback: legacy pm_payment_accounts (for orgs only)
            if (entityType === 'organization') {
                const legacyResult = await pool.query(
                    `SELECT * FROM pm_payment_accounts
                     WHERE organization_id = $1 AND is_active = TRUE`,
                    [entityId]
                );

                if (legacyResult.rows.length > 0) {
                    const row = legacyResult.rows[0];
                    return {
                        organizationId: row.organization_id,
                        subaccountCode: row.paystack_subaccount_code,
                        platformFeePercentage: parseFloat(row.platform_fee_percentage || 1),
                        platformFeeFlat: parseFloat(row.platform_fee_flat || 25)
                    };
                }
            }

            return null;
        } catch (error: any) {
            this.handleError(error, 'getPaymentAccountConfig');
            return null;
        }
    }

    /**
     * Register a property manager's bank account as a sub-account
     */
    async registerPropertyManagerAccount(
        organizationId: string,
        bankCode: string,
        accountNumber: string,
        businessName: string,
        contactEmail?: string,
        contactPhone?: string,
        serviceType: string = 'property_management'
    ): Promise<{ success: boolean; subaccountCode?: string; error?: string }> {
        try {
            // First verify the account
            const verification = await this.resolveAccount(accountNumber, bankCode);
            if (!verification.status) {
                return { success: false, error: 'Could not verify bank account' };
            }

            // Create sub-account with 99% going to recipient (platform fee via transaction_charge)
            // We use percentage_charge = 0.2 (i.e., Paystack sees 0.2% to integrator)
            // but the REAL platform fee is applied per-transaction via transaction_charge from FeeEngine.
            // Setting percentage_charge low ensures most funds flow to the subaccount.
            const subaccountResponse = await this.createSubaccount({
                business_name: businessName,
                settlement_bank: bankCode,
                account_number: accountNumber,
                percentage_charge: 0.2, // Minimal; real fee is via transaction_charge per-txn
                primary_contact_email: contactEmail,
                primary_contact_phone: contactPhone,
                metadata: {
                    organization_id: organizationId,
                    verified_account_name: verification.data.account_name
                }
            });

            if (!subaccountResponse.status) {
                return { success: false, error: 'Failed to create sub-account with Paystack' };
            }

            // Determine default fees based on service type (must match feeEngine defaults)
            // rent (property_management): max_of 1% / GH₵25
            // deal (deals):               percentage 0.25% / GH₵0
            // project (project_management): percentage 0.25% / GH₵0
            // valuation:                   percentage 2.5% / GH₵0
            const feeDefaults: Record<string, { pct: number; flat: number }> = {
                property_management: { pct: 0.0100, flat: 25.00 },
                project_management:  { pct: 0.0025, flat: 0.00 },
                deals:               { pct: 0.0025, flat: 0.00 },
                valuation:           { pct: 0.0250, flat: 0.00 },
            };
            const { pct: defaultFeePercentage, flat: defaultFeeFlat } =
                feeDefaults[serviceType] || feeDefaults.property_management;

            // Store in BOTH tables (new + legacy) for backward compatibility
            // New unified table (keyed by entity_id + entity_type + service_type)
            await pool.query(
                `INSERT INTO payment_accounts (
                    entity_id, entity_type, service_type,
                    paystack_subaccount_code,
                    account_number, bank_code, bank_name, account_name,
                    settlement_method,
                    platform_fee_percentage, platform_fee_flat,
                    is_verified, verified_at, verification_method
                ) VALUES ($1, 'organization', $7, $2, $3, $4, $5, $6, 'bank', $8, $9, TRUE, NOW(), 'paystack_resolve')
                ON CONFLICT (entity_id, entity_type, service_type)
                DO UPDATE SET
                    paystack_subaccount_code = EXCLUDED.paystack_subaccount_code,
                    account_number = EXCLUDED.account_number,
                    bank_code = EXCLUDED.bank_code,
                    bank_name = EXCLUDED.bank_name,
                    account_name = EXCLUDED.account_name,
                    settlement_method = 'bank',
                    is_verified = TRUE,
                    verified_at = NOW(),
                    updated_at = NOW()`,
                [
                    organizationId,
                    subaccountResponse.data.subaccount_code,
                    accountNumber,
                    bankCode,
                    subaccountResponse.data.settlement_bank,
                    verification.data.account_name,
                    serviceType,
                    defaultFeePercentage,
                    defaultFeeFlat
                ]
            );

            // Legacy table (for existing queries)
            await pool.query(
                `INSERT INTO pm_payment_accounts (
                    organization_id,
                    paystack_subaccount_code,
                    paystack_account_number,
                    paystack_bank_code,
                    paystack_bank_name,
                    paystack_account_name,
                    paystack_percentage_charge,
                    platform_fee_percentage,
                    platform_fee_flat,
                    verified_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                ON CONFLICT (organization_id)
                DO UPDATE SET
                    paystack_subaccount_code = EXCLUDED.paystack_subaccount_code,
                    paystack_account_number = EXCLUDED.paystack_account_number,
                    paystack_bank_code = EXCLUDED.paystack_bank_code,
                    paystack_bank_name = EXCLUDED.paystack_bank_name,
                    paystack_account_name = EXCLUDED.paystack_account_name,
                    verified_at = NOW(),
                    updated_at = NOW()`,
                [
                    organizationId,
                    subaccountResponse.data.subaccount_code,
                    accountNumber,
                    bankCode,
                    subaccountResponse.data.settlement_bank,
                    verification.data.account_name,
                    subaccountResponse.data.percentage_charge,
                    1.0, // 1% platform fee percentage
                    25.0  // GH₵25 flat minimum
                ]
            );

            logger.info('Registered property manager payment account', {
                organizationId,
                subaccountCode: subaccountResponse.data.subaccount_code,
                accountName: verification.data.account_name
            });

            return {
                success: true,
                subaccountCode: subaccountResponse.data.subaccount_code
            };
        } catch (error: any) {
            this.handleError(error, 'registerPropertyManagerAccount');
            return { success: false, error: error.message };
        }
    }

    private handleError(error: any, context: string) {
        const message = error.response?.data?.message || error.message;
        logger.error(`Paystack Error [${context}]: ${message}`, {
            status: error.response?.status,
            data: error.response?.data
        });
    }
}

export const paystackService = new PaystackService();
