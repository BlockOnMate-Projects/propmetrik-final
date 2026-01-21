/**
 * Paystack Service
 * Phase 4.7: Payment Processing Integration
 * 
 * Handles interaction with Paystack API for payments including
 * Mobile Money (MTN, Vodafone, AirtelTigo) and Cards
 * 
 * @module services/property-management/payment/paystackService
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { logger } from '../../../utils/logger';

export interface PaystackInitializeParams {
    email: string;
    amount: number; // In pesewas/cents (e.g. GHS 10.00 = 1000)
    currency?: string; // GHS, USD, NGN
    reference?: string;
    callback_url?: string;
    metadata?: Record<string, any>;
    channels?: string[]; // ['card', 'mobile_money']
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
    };
}

export class PaystackService {
    private client: AxiosInstance;
    private secretKey: string;

    constructor() {
        this.secretKey = process.env.PAYSTACK_SECRET_KEY || '';
        if (!this.secretKey) {
            logger.warn('PAYSTACK_SECRET_KEY is not set. Payment operations will fail.');
        }

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

    private handleError(error: any, context: string) {
        const message = error.response?.data?.message || error.message;
        logger.error(`Paystack Error [${context}]: ${message}`, {
            status: error.response?.status,
            data: error.response?.data
        });
    }
}

export const paystackService = new PaystackService();
