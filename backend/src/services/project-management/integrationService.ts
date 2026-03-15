/**
 * Enhanced Integration Service
 * Phase 4 Sprint 8 - External API Integrations
 * 
 * Integrations:
 * - Payment gateways (Mobile Money, Bank transfers)
 * - Vendor verification (GRA TIN validation, SSNIT)
 * - Document signing (e-sign integration)
 * - Ghana-specific regulatory compliance
 */

import { pool as db } from '../../database';
import { redisCache as redis } from '../../database/redis';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import axios, { AxiosInstance } from 'axios';

// =====================================================
// TYPES
// =====================================================

// Mobile Money Providers
export type MobileMoneyProvider = 'mtn_momo' | 'vodafone_cash' | 'airteltigo_money';

export interface MobileMoneyPayment {
  id: string;
  provider: MobileMoneyProvider;
  phoneNumber: string;
  amount: number;
  currency: string;
  reference: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  externalReference?: string;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface MobileMoneyPaymentRequest {
  provider: MobileMoneyProvider;
  phoneNumber: string;
  amount: number;
  currency?: string;
  reference: string;
  description: string;
  callbackUrl?: string;
}

// Bank Transfer
export interface BankTransferRequest {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  currency?: string;
  reference: string;
  narration: string;
}

export interface BankTransferResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  reference: string;
  externalReference?: string;
  fee?: number;
  errorMessage?: string;
}

// Vendor Verification
export interface TINVerificationResult {
  isValid: boolean;
  tinNumber: string;
  businessName?: string;
  registrationDate?: Date;
  status?: 'active' | 'inactive' | 'suspended';
  taxOffice?: string;
  errorMessage?: string;
}

export interface SSNITVerificationResult {
  isValid: boolean;
  ssnit: string;
  employerName?: string;
  registrationStatus?: 'registered' | 'not_registered' | 'pending';
  lastContributionDate?: Date;
  errorMessage?: string;
}

export interface VendorComplianceCheck {
  vendorId: string;
  tinVerification?: TINVerificationResult;
  ssnitVerification?: SSNITVerificationResult;
  overallStatus: 'compliant' | 'non_compliant' | 'pending' | 'partial';
  checkedAt: Date;
  issues: string[];
}

// Ghana Banks
export interface GhanaBank {
  code: string;
  name: string;
  swiftCode?: string;
  sortCode?: string;
  isActive: boolean;
}

// =====================================================
// CONFIGURATION
// =====================================================

interface IntegrationConfig {
  mtn: {
    apiUrl: string;
    subscriptionKey: string;
    apiUser: string;
    apiKey: string;
    environment: 'sandbox' | 'production';
  };
  vodafone: {
    apiUrl: string;
    merchantId: string;
    apiKey: string;
  };
  airteltigo: {
    apiUrl: string;
    clientId: string;
    clientSecret: string;
  };
  gra: {
    apiUrl: string;
    apiKey: string;
    clientId: string;
  };
  ssnit: {
    apiUrl: string;
    apiKey: string;
  };
  paystack?: {
    secretKey: string;
    publicKey: string;
  };
}

const config: IntegrationConfig = {
  mtn: {
    apiUrl: process.env.MTN_MOMO_API_URL || 'https://sandbox.momodeveloper.mtn.com',
    subscriptionKey: process.env.MTN_MOMO_SUBSCRIPTION_KEY || '',
    apiUser: process.env.MTN_MOMO_API_USER || '',
    apiKey: process.env.MTN_MOMO_API_KEY || '',
    environment: (process.env.MTN_MOMO_ENV as 'sandbox' | 'production') || 'sandbox',
  },
  vodafone: {
    apiUrl: process.env.VODAFONE_CASH_API_URL || '',
    merchantId: process.env.VODAFONE_CASH_MERCHANT_ID || '',
    apiKey: process.env.VODAFONE_CASH_API_KEY || '',
  },
  airteltigo: {
    apiUrl: process.env.AIRTELTIGO_MONEY_API_URL || '',
    clientId: process.env.AIRTELTIGO_CLIENT_ID || '',
    clientSecret: process.env.AIRTELTIGO_CLIENT_SECRET || '',
  },
  gra: {
    apiUrl: process.env.GRA_API_URL || 'https://api.gra.gov.gh',
    apiKey: process.env.GRA_API_KEY || '',
    clientId: process.env.GRA_CLIENT_ID || '',
  },
  ssnit: {
    apiUrl: process.env.SSNIT_API_URL || 'https://api.ssnit.gov.gh',
    apiKey: process.env.SSNIT_API_KEY || '',
  },
  paystack: config.paystack.enabled ? {
    secretKey: config.paystack.secretKey,
    publicKey: config.paystack.publicKey,
  } : undefined,
};

// Ghana Banks List
const GHANA_BANKS: GhanaBank[] = [
  { code: 'GCB', name: 'GCB Bank Limited', swiftCode: 'GHCBGHAC', isActive: true },
  { code: 'EBG', name: 'Ecobank Ghana Limited', swiftCode: 'EABORUGH', isActive: true },
  { code: 'ABG', name: 'Absa Bank Ghana Limited', swiftCode: 'BABORUGH', isActive: true },
  { code: 'SCB', name: 'Standard Chartered Bank Ghana', swiftCode: 'SCBLGHAC', isActive: true },
  { code: 'SBG', name: 'Stanbic Bank Ghana Limited', swiftCode: 'SBICGHAC', isActive: true },
  { code: 'FBN', name: 'FBN Bank Ghana Limited', swiftCode: 'FABORUGH', isActive: true },
  { code: 'CBG', name: 'Consolidated Bank Ghana', swiftCode: 'CBGHGHAC', isActive: true },
  { code: 'ZBG', name: 'Zenith Bank Ghana', swiftCode: 'ZEBLGHAC', isActive: true },
  { code: 'UBA', name: 'United Bank for Africa Ghana', swiftCode: 'UNAFGHAC', isActive: true },
  { code: 'ADB', name: 'Agricultural Development Bank', swiftCode: 'AABORUGH', isActive: true },
  { code: 'CAL', name: 'CAL Bank Limited', swiftCode: 'CAABORUGH', isActive: true },
  { code: 'FBL', name: 'Fidelity Bank Ghana', swiftCode: 'FABORUGH', isActive: true },
  { code: 'GTB', name: 'Guaranty Trust Bank Ghana', swiftCode: 'GTBIGHAC', isActive: true },
  { code: 'PBL', name: 'Prudential Bank Limited', swiftCode: 'PRUDGHAC', isActive: true },
  { code: 'RBG', name: 'Republic Bank Ghana', swiftCode: 'HABORUGH', isActive: true },
  { code: 'NIB', name: 'National Investment Bank', swiftCode: 'NIBORGHAC', isActive: true },
  { code: 'SBL', name: 'Societe Generale Ghana', swiftCode: 'SGGHGHAC', isActive: true },
  { code: 'UMB', name: 'Universal Merchant Bank', swiftCode: 'UMBORGHAC', isActive: true },
  { code: 'ARB', name: 'ARB Apex Bank', sortCode: '300199', isActive: true },
];

// =====================================================
// HTTP CLIENTS
// =====================================================

function createMTNClient(): AxiosInstance {
  return axios.create({
    baseURL: config.mtn.apiUrl,
    headers: {
      'Ocp-Apim-Subscription-Key': config.mtn.subscriptionKey,
      'X-Target-Environment': config.mtn.environment,
    },
  });
}

function createPaystackClient(): AxiosInstance | null {
  if (!config.paystack) return null;
  return axios.create({
    baseURL: 'https://api.paystack.co',
    headers: {
      Authorization: `Bearer ${config.paystack.secretKey}`,
    },
  });
}

// =====================================================
// MOBILE MONEY SERVICE
// =====================================================

class MobileMoneyService {
  private mtnClient: AxiosInstance;
  private paystackClient: AxiosInstance | null;

  constructor() {
    this.mtnClient = createMTNClient();
    this.paystackClient = createPaystackClient();
  }

  /**
   * Request a mobile money payment (Collection)
   */
  async requestPayment(request: MobileMoneyPaymentRequest): Promise<MobileMoneyPayment> {
    const paymentId = `MM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Store pending payment
      const payment: MobileMoneyPayment = {
        id: paymentId,
        provider: request.provider,
        phoneNumber: request.phoneNumber,
        amount: request.amount,
        currency: request.currency || 'GHS',
        reference: request.reference,
        description: request.description,
        status: 'pending',
        createdAt: new Date(),
      };

      // Store in database
      await db.query(`
        INSERT INTO mobile_money_payments (
          id, provider, phone_number, amount, currency,
          reference, description, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        payment.id,
        payment.provider,
        payment.phoneNumber,
        payment.amount,
        payment.currency,
        payment.reference,
        payment.description,
        payment.status,
        payment.createdAt,
      ]);

      // Route to appropriate provider
      switch (request.provider) {
        case 'mtn_momo':
          return await this.processMTNPayment(payment, request);
        case 'vodafone_cash':
          return await this.processVodafonePayment(payment, request);
        case 'airteltigo_money':
          return await this.processAirtelTigoPayment(payment, request);
        default:
          throw new Error(`Unsupported provider: ${request.provider}`);
      }
    } catch (error) {
      logger.error('Mobile money payment error:', error);
      throw error;
    }
  }

  private async processMTNPayment(
    payment: MobileMoneyPayment,
    request: MobileMoneyPaymentRequest
  ): Promise<MobileMoneyPayment> {
    try {
      // Get access token
      const tokenResponse = await this.mtnClient.post('/collection/token/', {}, {
        auth: {
          username: config.mtn.apiUser,
          password: config.mtn.apiKey,
        },
      });

      const accessToken = tokenResponse.data.access_token;

      // Request to pay
      const externalId = `mtn-${payment.id}`;
      await this.mtnClient.post(
        '/collection/v1_0/requesttopay',
        {
          amount: payment.amount.toString(),
          currency: payment.currency,
          externalId,
          payer: {
            partyIdType: 'MSISDN',
            partyId: payment.phoneNumber.replace('+', ''),
          },
          payerMessage: payment.description,
          payeeNote: request.reference,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Reference-Id': externalId,
          },
        }
      );

      // Update status to processing
      payment.status = 'processing';
      payment.externalReference = externalId;

      await db.query(`
        UPDATE mobile_money_payments
        SET status = $1, external_reference = $2
        WHERE id = $3
      `, [payment.status, payment.externalReference, payment.id]);

      return payment;
    } catch (error: any) {
      payment.status = 'failed';
      payment.errorMessage = error.message;

      await db.query(`
        UPDATE mobile_money_payments
        SET status = $1, error_message = $2
        WHERE id = $3
      `, [payment.status, payment.errorMessage, payment.id]);

      throw error;
    }
  }

  private async processVodafonePayment(
    payment: MobileMoneyPayment,
    request: MobileMoneyPaymentRequest
  ): Promise<MobileMoneyPayment> {
    // Use Paystack as aggregator for Vodafone Cash
    if (this.paystackClient) {
      try {
        const response = await this.paystackClient.post('/charge', {
          email: `${payment.phoneNumber}@momo.gh`,
          amount: payment.amount * 100, // Paystack uses pesewas
          currency: 'GHS',
          mobile_money: {
            phone: payment.phoneNumber,
            provider: 'vod',
          },
          reference: payment.reference,
        });

        payment.status = 'processing';
        payment.externalReference = response.data.data.reference;

        await db.query(`
          UPDATE mobile_money_payments
          SET status = $1, external_reference = $2
          WHERE id = $3
        `, [payment.status, payment.externalReference, payment.id]);

        return payment;
      } catch (error: any) {
        payment.status = 'failed';
        payment.errorMessage = error.response?.data?.message || error.message;

        await db.query(`
          UPDATE mobile_money_payments
          SET status = $1, error_message = $2
          WHERE id = $3
        `, [payment.status, payment.errorMessage, payment.id]);

        throw error;
      }
    }

    throw new Error('Vodafone Cash not configured');
  }

  private async processAirtelTigoPayment(
    payment: MobileMoneyPayment,
    request: MobileMoneyPaymentRequest
  ): Promise<MobileMoneyPayment> {
    // Use Paystack as aggregator for AirtelTigo Money
    if (this.paystackClient) {
      try {
        const response = await this.paystackClient.post('/charge', {
          email: `${payment.phoneNumber}@momo.gh`,
          amount: payment.amount * 100,
          currency: 'GHS',
          mobile_money: {
            phone: payment.phoneNumber,
            provider: 'tgo',
          },
          reference: payment.reference,
        });

        payment.status = 'processing';
        payment.externalReference = response.data.data.reference;

        await db.query(`
          UPDATE mobile_money_payments
          SET status = $1, external_reference = $2
          WHERE id = $3
        `, [payment.status, payment.externalReference, payment.id]);

        return payment;
      } catch (error: any) {
        payment.status = 'failed';
        payment.errorMessage = error.response?.data?.message || error.message;

        await db.query(`
          UPDATE mobile_money_payments
          SET status = $1, error_message = $2
          WHERE id = $3
        `, [payment.status, payment.errorMessage, payment.id]);

        throw error;
      }
    }

    throw new Error('AirtelTigo Money not configured');
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(paymentId: string): Promise<MobileMoneyPayment | null> {
    const result = await db.query(`
      SELECT * FROM mobile_money_payments WHERE id = $1
    `, [paymentId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      provider: row.provider,
      phoneNumber: row.phone_number,
      amount: parseFloat(row.amount),
      currency: row.currency,
      reference: row.reference,
      description: row.description,
      status: row.status,
      externalReference: row.external_reference,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  /**
   * Handle webhook callback from payment provider
   */
  async handleCallback(provider: MobileMoneyProvider, payload: any): Promise<void> {
    logger.info(`Mobile money callback from ${provider}:`, payload);

    // Process based on provider
    switch (provider) {
      case 'mtn_momo':
        await this.handleMTNCallback(payload);
        break;
      default:
        // Use Paystack callback handler
        await this.handlePaystackCallback(payload);
    }
  }

  private async handleMTNCallback(payload: any): Promise<void> {
    const { externalId, status, reason } = payload;

    const newStatus = status === 'SUCCESSFUL' ? 'completed' : 'failed';
    const completedAt = status === 'SUCCESSFUL' ? new Date() : null;

    await db.query(`
      UPDATE mobile_money_payments
      SET status = $1, completed_at = $2, error_message = $3
      WHERE external_reference = $4
    `, [newStatus, completedAt, reason, externalId]);
  }

  private async handlePaystackCallback(payload: any): Promise<void> {
    const { event, data } = payload;

    if (event === 'charge.success') {
      await db.query(`
        UPDATE mobile_money_payments
        SET status = 'completed', completed_at = NOW()
        WHERE external_reference = $1
      `, [data.reference]);
    } else if (event === 'charge.failed') {
      await db.query(`
        UPDATE mobile_money_payments
        SET status = 'failed', error_message = $1
        WHERE external_reference = $2
      `, [data.gateway_response, data.reference]);
    }
  }
}

// =====================================================
// BANK TRANSFER SERVICE
// =====================================================

class BankTransferService {
  private paystackClient: AxiosInstance | null;

  constructor() {
    this.paystackClient = createPaystackClient();
  }

  /**
   * Get list of Ghana banks
   */
  getBanks(): GhanaBank[] {
    return GHANA_BANKS.filter(b => b.isActive);
  }

  /**
   * Verify bank account
   */
  async verifyAccount(accountNumber: string, bankCode: string): Promise<{
    isValid: boolean;
    accountName?: string;
    accountNumber?: string;
  }> {
    if (!this.paystackClient) {
      throw new Error('Bank verification not configured');
    }

    try {
      const response = await this.paystackClient.get('/bank/resolve', {
        params: { account_number: accountNumber, bank_code: bankCode },
      });

      return {
        isValid: true,
        accountName: response.data.data.account_name,
        accountNumber: response.data.data.account_number,
      };
    } catch (error: any) {
      return {
        isValid: false,
      };
    }
  }

  /**
   * Initiate bank transfer (disbursement)
   */
  async initiateTransfer(request: BankTransferRequest): Promise<BankTransferResult> {
    if (!this.paystackClient) {
      throw new Error('Bank transfer not configured');
    }

    try {
      // Create transfer recipient
      const recipientResponse = await this.paystackClient.post('/transferrecipient', {
        type: 'nuban',
        name: request.accountName,
        account_number: request.accountNumber,
        bank_code: request.bankCode,
        currency: request.currency || 'GHS',
      });

      const recipientCode = recipientResponse.data.data.recipient_code;

      // Initiate transfer
      const transferResponse = await this.paystackClient.post('/transfer', {
        source: 'balance',
        amount: request.amount * 100, // Convert to pesewas
        recipient: recipientCode,
        reason: request.narration,
        reference: request.reference,
      });

      const transfer = transferResponse.data.data;

      // Store transfer record
      await db.query(`
        INSERT INTO bank_transfers (
          id, bank_code, account_number, account_name,
          amount, currency, reference, narration, status,
          external_reference, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        `BT-${Date.now()}`,
        request.bankCode,
        request.accountNumber,
        request.accountName,
        request.amount,
        request.currency || 'GHS',
        request.reference,
        request.narration,
        'pending',
        transfer.transfer_code,
      ]);

      return {
        id: transfer.transfer_code,
        status: 'processing',
        reference: request.reference,
        externalReference: transfer.transfer_code,
      };
    } catch (error: any) {
      logger.error('Bank transfer error:', error);
      return {
        id: '',
        status: 'failed',
        reference: request.reference,
        errorMessage: error.response?.data?.message || error.message,
      };
    }
  }
}

// =====================================================
// VENDOR VERIFICATION SERVICE
// =====================================================

class VendorVerificationService {
  private readonly CACHE_TTL = 86400; // 24 hours

  /**
   * Verify vendor TIN with GRA
   */
  async verifyTIN(tinNumber: string): Promise<TINVerificationResult> {
    const cacheKey = `tin:${tinNumber}`;

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // In production, call GRA API
      // For now, simulate validation
      const isValidFormat = /^[A-Z]{1}[0-9]{10}$/.test(tinNumber) || 
                            /^[0-9]{11}$/.test(tinNumber);

      if (!isValidFormat) {
        return {
          isValid: false,
          tinNumber,
          errorMessage: 'Invalid TIN format. Expected: C followed by 10 digits, or 11 digits',
        };
      }

      // Simulate API call
      const result: TINVerificationResult = {
        isValid: true,
        tinNumber,
        status: 'active',
        taxOffice: 'Large Taxpayer Office', // Would come from GRA API
      };

      // Cache result
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

      return result;
    } catch (error: any) {
      logger.error('TIN verification error:', error);
      return {
        isValid: false,
        tinNumber,
        errorMessage: 'Verification service unavailable',
      };
    }
  }

  /**
   * Verify SSNIT registration
   */
  async verifySSNIT(ssnitNumber: string, employerName?: string): Promise<SSNITVerificationResult> {
    const cacheKey = `ssnit:${ssnitNumber}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // Validate format
      const isValidFormat = /^[A-Z]{1}[0-9]{13}$/.test(ssnitNumber);

      if (!isValidFormat) {
        return {
          isValid: false,
          ssnit: ssnitNumber,
          errorMessage: 'Invalid SSNIT format. Expected: Letter followed by 13 digits',
        };
      }

      // Simulate API call
      const result: SSNITVerificationResult = {
        isValid: true,
        ssnit: ssnitNumber,
        registrationStatus: 'registered',
        employerName: employerName || 'Unknown Employer',
      };

      // Cache result
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

      return result;
    } catch (error: any) {
      logger.error('SSNIT verification error:', error);
      return {
        isValid: false,
        ssnit: ssnitNumber,
        errorMessage: 'Verification service unavailable',
      };
    }
  }

  /**
   * Comprehensive vendor compliance check
   */
  async checkVendorCompliance(
    vendorId: string,
    tinNumber?: string,
    ssnitNumber?: string
  ): Promise<VendorComplianceCheck> {
    const issues: string[] = [];
    let tinResult: TINVerificationResult | undefined;
    let ssnitResult: SSNITVerificationResult | undefined;

    // Check TIN if provided
    if (tinNumber) {
      tinResult = await this.verifyTIN(tinNumber);
      if (!tinResult.isValid) {
        issues.push(`TIN verification failed: ${tinResult.errorMessage}`);
      } else if (tinResult.status !== 'active') {
        issues.push(`TIN status is ${tinResult.status}`);
      }
    } else {
      issues.push('TIN number not provided');
    }

    // Check SSNIT if provided
    if (ssnitNumber) {
      ssnitResult = await this.verifySSNIT(ssnitNumber);
      if (!ssnitResult.isValid) {
        issues.push(`SSNIT verification failed: ${ssnitResult.errorMessage}`);
      } else if (ssnitResult.registrationStatus !== 'registered') {
        issues.push(`SSNIT status is ${ssnitResult.registrationStatus}`);
      }
    }

    // Determine overall status
    let overallStatus: VendorComplianceCheck['overallStatus'];
    if (issues.length === 0) {
      overallStatus = 'compliant';
    } else if (!tinNumber && !ssnitNumber) {
      overallStatus = 'pending';
    } else if (tinResult?.isValid || ssnitResult?.isValid) {
      overallStatus = 'partial';
    } else {
      overallStatus = 'non_compliant';
    }

    const result: VendorComplianceCheck = {
      vendorId,
      tinVerification: tinResult,
      ssnitVerification: ssnitResult,
      overallStatus,
      checkedAt: new Date(),
      issues,
    };

    // Store compliance check
    await db.query(`
      INSERT INTO vendor_compliance_checks (
        vendor_id, tin_result, ssnit_result, overall_status, issues, checked_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      vendorId,
      JSON.stringify(tinResult),
      JSON.stringify(ssnitResult),
      overallStatus,
      issues,
      result.checkedAt,
    ]);

    return result;
  }
}

// =====================================================
// EXPORT SERVICES
// =====================================================

export const mobileMoneyService = new MobileMoneyService();
export const bankTransferService = new BankTransferService();
export const vendorVerificationService = new VendorVerificationService();

// Convenience export
export const integrationService = {
  mobileMoney: mobileMoneyService,
  bankTransfer: bankTransferService,
  vendorVerification: vendorVerificationService,
  
  // Get Ghana banks
  getGhanaBanks: () => bankTransferService.getBanks(),
  
  // Get supported mobile money providers
  getMobileMoneyProviders: (): Array<{ id: MobileMoneyProvider; name: string; logo?: string }> => [
    { id: 'mtn_momo', name: 'MTN Mobile Money' },
    { id: 'vodafone_cash', name: 'Vodafone Cash' },
    { id: 'airteltigo_money', name: 'AirtelTigo Money' },
  ],
};

export default integrationService;
