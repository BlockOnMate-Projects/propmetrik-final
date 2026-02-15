/**
 * Paystack Payment Service
 * Shared service for Paystack payment processing
 * 
 * Supports:
 * - Standard transactions (card, mobile money)
 * - Sub-accounts for split payments (property managers)
 * - Webhook verification
 * - Bank account verification
 * 
 * @module shared-services/payments/paystack
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

// =====================================================
// INTERFACES
// =====================================================

export interface PaystackConfig {
    testSecretKey?: string;
    testPublicKey?: string;
    liveSecretKey?: string;
    livePublicKey?: string;
    mode?: 'test' | 'live';
}

export interface PaystackInitializeParams {
    email: string;
    amount: number; // In pesewas/kobo (e.g. GHS 10.00 = 1000)
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

export interface BankListResponse {
    status: boolean;
    message: string;
    data: Array<{
        id: number;
        name: string;
        slug: string;
        code: string;
        longcode: string;
        gateway: string | null;
        active: boolean;
        country: string;
        currency: string;
        type: string;
    }>;
}

export interface ResolveAccountResponse {
    status: boolean;
    message: string;
    data: {
        account_number: string;
        account_name: string;
        bank_id: number;
    };
}

// =====================================================
// PAYSTACK SERVICE
// =====================================================

export class PaystackService {
    private client: AxiosInstance;
    private secretKey: string;
    private publicKey: string;
    private isTestMode: boolean;
    private logger: { info: Function; warn: Function; error: Function };

    constructor(config?: PaystackConfig, logger?: any) {
        // Determine mode from config or environment
        this.isTestMode = (config?.mode || process.env.PAYMENT_MODE) !== 'live';

        // Select keys based on mode
        if (this.isTestMode) {
            this.secretKey = config?.testSecretKey || process.env.PAYSTACK_TEST_SECRET_KEY || '';
            this.publicKey = config?.testPublicKey || process.env.PAYSTACK_TEST_PUBLIC_KEY || '';
        } else {
            this.secretKey = config?.liveSecretKey || process.env.PAYSTACK_LIVE_SECRET_KEY || '';
            this.publicKey = config?.livePublicKey || process.env.PAYSTACK_LIVE_PUBLIC_KEY || '';
        }

        // Use provided logger or console
        this.logger = logger || console;

        if (!this.secretKey) {
            this.logger.warn(`Paystack: ${this.isTestMode ? 'TEST' : 'LIVE'} secret key not configured`);
        }

        this.logger.info(`PaystackService initialized in ${this.isTestMode ? 'TEST' : 'LIVE'} mode`);

        this.client = axios.create({
            baseURL: 'https://api.paystack.co',
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    getPublicKey(): string {
        return this.publicKey;
    }

    isTest(): boolean {
        return this.isTestMode;
    }

    // ========================================
    // TRANSACTION METHODS
    // ========================================

    /**
     * Initialize a transaction
     */
    async initializeTransaction(params: PaystackInitializeParams): Promise<PaystackInitializeResponse> {
        try {
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
     * List transactions with optional filters
     */
    async listTransactions(options?: {
        perPage?: number;
        page?: number;
        status?: 'success' | 'failed' | 'abandoned';
        from?: Date;
        to?: Date;
    }): Promise<any> {
        try {
            const params = new URLSearchParams();
            if (options?.perPage) params.append('perPage', options.perPage.toString());
            if (options?.page) params.append('page', options.page.toString());
            if (options?.status) params.append('status', options.status);
            if (options?.from) params.append('from', options.from.toISOString());
            if (options?.to) params.append('to', options.to.toISOString());

            const response = await this.client.get(`/transaction?${params.toString()}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'listTransactions');
            throw error;
        }
    }

    /**
     * Initialize a transaction with split payment to sub-account
     */
    async initializeWithSubaccount(
        params: PaystackInitializeParams,
        subaccountCode: string,
        platformFeePercentage: number = 2,
        platformFeeFlat: number = 0
    ): Promise<PaystackInitializeResponse> {
        try {
            const amountInPesewas = Math.round(params.amount);
            const platformFee = Math.round((amountInPesewas * platformFeePercentage / 100) + (platformFeeFlat * 100));

            const payload = {
                ...params,
                amount: amountInPesewas,
                subaccount: subaccountCode,
                transaction_charge: platformFee,
                bearer: 'subaccount' as const
            };

            this.logger.info('Initializing split payment', {
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

    // ========================================
    // WEBHOOK METHODS
    // ========================================

    /**
     * Verify Webhook Signature
     */
    verifyWebhookSignature(signature: string, body: any): boolean {
        const hash = crypto
            .createHmac('sha512', this.secretKey)
            .update(JSON.stringify(body))
            .digest('hex');

        return hash === signature;
    }

    // ========================================
    // BANK METHODS
    // ========================================

    /**
     * Get list of banks for a country
     */
    async getBanks(country: string = 'ghana'): Promise<BankListResponse> {
        try {
            const response = await this.client.get(`/bank?country=${country}`);
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'getBanks');
            throw error;
        }
    }

    /**
     * Resolve/verify a bank account
     */
    async resolveAccount(accountNumber: string, bankCode: string): Promise<ResolveAccountResponse> {
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
    // ========================================

    /**
     * Create a sub-account
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

    // ========================================
    // TRANSFER METHODS (Payouts)
    // ========================================

    /**
     * Create a transfer recipient
     */
    async createTransferRecipient(params: {
        type: 'nuban' | 'mobile_money' | 'basa';
        name: string;
        account_number: string;
        bank_code: string;
        currency?: string;
        metadata?: Record<string, any>;
    }): Promise<any> {
        try {
            const response = await this.client.post('/transferrecipient', {
                ...params,
                currency: params.currency || 'GHS'
            });
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'createTransferRecipient');
            throw error;
        }
    }

    /**
     * Initiate a transfer (payout)
     */
    async initiateTransfer(params: {
        amount: number; // In pesewas
        recipient: string; // Recipient code
        reason?: string;
        reference?: string;
    }): Promise<any> {
        try {
            const response = await this.client.post('/transfer', {
                source: 'balance',
                ...params,
                amount: Math.round(params.amount)
            });
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'initiateTransfer');
            throw error;
        }
    }

    /**
     * Get balance
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

    // ========================================
    // MOBILE MONEY METHODS
    // ========================================

    /**
     * Charge Mobile Money (Ghana)
     */
    async chargeMobileMoney(params: {
        email: string;
        amount: number;
        mobile_money: {
            phone: string;
            provider: 'mtn' | 'vod' | 'tgo'; // MTN, Vodafone, AirtelTigo
        };
        reference?: string;
        metadata?: Record<string, any>;
    }): Promise<any> {
        try {
            const response = await this.client.post('/charge', {
                ...params,
                amount: Math.round(params.amount),
                currency: 'GHS'
            });
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'chargeMobileMoney');
            throw error;
        }
    }

    /**
     * Submit OTP for pending charge
     */
    async submitOTP(reference: string, otp: string): Promise<any> {
        try {
            const response = await this.client.post('/charge/submit_otp', {
                reference,
                otp
            });
            return response.data;
        } catch (error: any) {
            this.handleError(error, 'submitOTP');
            throw error;
        }
    }

    // ========================================
    // ERROR HANDLING
    // ========================================

    private handleError(error: any, context: string): void {
        const message = error.response?.data?.message || error.message;
        this.logger.error(`Paystack Error [${context}]: ${message}`, {
            status: error.response?.status,
            data: error.response?.data
        });
    }
}

// Singleton instance
export const paystackService = new PaystackService();

// Types are already exported via interface declarations above
