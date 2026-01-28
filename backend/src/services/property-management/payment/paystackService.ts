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
        // Determine mode from environment
        this.isTestMode = process.env.PAYMENT_MODE !== 'live';
        
        // Select keys based on mode
        if (this.isTestMode) {
            this.secretKey = process.env.PAYSTACK_TEST_SECRET_KEY || '';
            this.publicKey = process.env.PAYSTACK_TEST_PUBLIC_KEY || '';
        } else {
            this.secretKey = process.env.PAYSTACK_LIVE_SECRET_KEY || '';
            this.publicKey = process.env.PAYSTACK_LIVE_PUBLIC_KEY || '';
        }

        if (!this.secretKey) {
            logger.warn(`PAYSTACK_${this.isTestMode ? 'TEST' : 'LIVE'}_SECRET_KEY is not set. Payment operations will fail.`);
        }

        logger.info(`PaystackService initialized in ${this.isTestMode ? 'TEST' : 'LIVE'} mode`);

        this.client = axios.create({
            baseURL: 'https://api.paystack.co',
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
            throw error;
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
     * Rent goes to property manager, platform fee goes to main account
     */
    async initializeWithSubaccount(
        params: PaystackInitializeParams,
        subaccountCode: string,
        platformFeePercentage: number = 2,
        platformFeeFlat: number = 0
    ): Promise<PaystackInitializeResponse> {
        try {
            // Calculate platform fee
            // Paystack's transaction_charge is a flat fee taken from the subaccount's share
            // If we want 2% platform fee, we calculate it from the total amount
            const amountInPesewas = Math.round(params.amount);
            const platformFee = Math.round((amountInPesewas * platformFeePercentage / 100) + (platformFeeFlat * 100));

            const payload = {
                ...params,
                amount: amountInPesewas,
                subaccount: subaccountCode,
                transaction_charge: platformFee,
                bearer: 'subaccount' as const // Subaccount bears the Paystack fees
            };

            logger.info('Initializing split payment', {
                amount: amountInPesewas / 100,
                platformFee: platformFee / 100,
                toSubaccount: (amountInPesewas - platformFee) / 100,
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
     * Get or create payment account config for an organization
     */
    async getPaymentAccountConfig(organizationId: string): Promise<PaymentAccountConfig | null> {
        try {
            const result = await pool.query(
                `SELECT * FROM pm_payment_accounts 
                 WHERE organization_id = $1 AND is_active = TRUE`,
                [organizationId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const row = result.rows[0];
            return {
                organizationId: row.organization_id,
                subaccountCode: row.paystack_subaccount_code,
                platformFeePercentage: parseFloat(row.platform_fee_percentage || 2),
                platformFeeFlat: parseFloat(row.platform_fee_flat || 0)
            };
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
        contactPhone?: string
    ): Promise<{ success: boolean; subaccountCode?: string; error?: string }> {
        try {
            // First verify the account
            const verification = await this.resolveAccount(accountNumber, bankCode);
            if (!verification.status) {
                return { success: false, error: 'Could not verify bank account' };
            }

            // Create sub-account with 98% going to property manager (2% platform fee)
            const subaccountResponse = await this.createSubaccount({
                business_name: businessName,
                settlement_bank: bankCode,
                account_number: accountNumber,
                percentage_charge: 98, // 98% to PM, 2% to platform
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

            // Store in database
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
                    verified_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
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
                    2.0 // 2% platform fee
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
