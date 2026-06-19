/**
 * CRM Payment Routes
 * Payment configuration, crypto wallet setup, and deal payment initiation
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, asyncHandler } from './helpers';
import { createCustomRateLimiter } from '../../middleware/rateLimiter';
import crypto from 'crypto';
import { logger } from '../../utils/logger';

const router = Router();

// =====================================================
// RATE LIMITERS FOR PAYMENT ENDPOINTS
// =====================================================

const paymentRateLimiter = createCustomRateLimiter('crm_payments', {
    points: 10,       // 10 requests
    duration: 60,     // per minute
    blockDuration: 120, // 2-minute block
});

const paymentInitiateRateLimiter = createCustomRateLimiter('crm_payment_initiate', {
    points: 5,        // 5 payment initiations
    duration: 60,     // per minute
    blockDuration: 300, // 5-minute block
});

// =====================================================
// IDEMPOTENCY MIDDLEWARE FOR PAYMENT INITIATION
// =====================================================

interface IdempotencyCache {
    responseStatus: number;
    responseBody: any;
    requestHash: string;
    createdAt: number;
}

const idempotencyStore = new Map<string, IdempotencyCache>();

// Cleanup expired entries every 10 minutes
setInterval(() => {
    const now = Date.now();
    const TTL = 24 * 60 * 60 * 1000; // 24 hours
    for (const [key, val] of idempotencyStore) {
        if (now - val.createdAt > TTL) {
            idempotencyStore.delete(key);
        }
    }
}, 10 * 60 * 1000);

function paymentIdempotency(req: Request, res: Response, next: Function) {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) return next();

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
        return res.status(400).json({
            error: 'Invalid Idempotency-Key format. Must be a valid UUID.',
            code: 'INVALID_IDEMPOTENCY_KEY'
        });
    }

    const requestHash = crypto.createHash('sha256')
        .update(JSON.stringify({ method: req.method, path: req.path, body: req.body }))
        .digest('hex');

    const cached = idempotencyStore.get(idempotencyKey);
    if (cached) {
        if (cached.requestHash !== requestHash) {
            return res.status(409).json({
                error: 'Conflicting request for existing Idempotency-Key',
                code: 'IDEMPOTENCY_CONFLICT'
            });
        }
        logger.info('Returning cached idempotent payment response', { idempotencyKey });
        return res.status(cached.responseStatus).json({ ...cached.responseBody, idempotent: true });
    }

    // Intercept res.json to capture the response
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
        idempotencyStore.set(idempotencyKey, {
            responseStatus: res.statusCode,
            responseBody: body,
            requestHash,
            createdAt: Date.now()
        });
        return originalJson(body);
    };
    next();
}

// =====================================================
// PAYMENT CONFIGURATION (Payout Account Setup)
// =====================================================

/**
 * GET /payments/account
 * Get current payout account config for the organization
 */
router.get('/payments/account', paymentRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);

    const { pool } = await import('../../database');
    const result = await pool.query(
        `SELECT * FROM payment_accounts
         WHERE entity_id = $1 AND entity_type = 'organization' AND service_type = 'deals' AND is_active = TRUE
         LIMIT 1`,
        [organizationId]
    );

    if (result.rows.length === 0) {
        const legacy = await pool.query(
            `SELECT * FROM pm_payment_accounts
             WHERE organization_id = $1 AND is_active = TRUE
             LIMIT 1`,
            [organizationId]
        );

        if (legacy.rows.length === 0) {
            return res.json({ configured: false });
        }

        const row = legacy.rows[0];
        return res.json({
            configured: true,
            settlementMethod: 'bank',
            bankName: row.paystack_bank_name,
            bankCode: row.paystack_bank_code,
            accountNumber: row.paystack_account_number,
            accountName: row.paystack_account_name,
            subaccountCode: row.paystack_subaccount_code,
            platformFeePercentage: parseFloat(row.platform_fee_percentage || 1),
            platformFeeFlat: parseFloat(row.platform_fee_flat || 25),
            isVerified: !!row.verified_at,
            verifiedAt: row.verified_at,
            createdAt: row.created_at
        });
    }

    const row = result.rows[0];
    res.json({
        configured: true,
        settlementMethod: row.settlement_method || 'bank',
        bankName: row.bank_name,
        bankCode: row.bank_code,
        accountNumber: row.account_number,
        accountName: row.account_name,
        momoProvider: row.momo_provider,
        momoNumber: row.momo_number,
        subaccountCode: row.paystack_subaccount_code,
        platformFeePercentage: parseFloat(row.platform_fee_percentage || 0.01) * 100,
        platformFeeFlat: parseFloat(row.platform_fee_flat || 25),
        isVerified: row.is_verified,
        verifiedAt: row.verified_at,
        createdAt: row.created_at
    });
}));

/**
 * GET /payments/banks
 * Get list of supported banks for payout setup
 */
router.get('/payments/banks', paymentRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const { paystackService } = await import('../../services/property-management/payment/paystackService');
    const banks = await paystackService.getBanks('ghana');
    res.json(banks);
}));

/**
 * POST /payments/register-account
 * Register or update the organization's bank account for payouts
 */
router.post('/payments/register-account', paymentRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { bankCode, accountNumber, businessName, contactEmail, contactPhone } = req.body;

    if (!bankCode || !accountNumber || !businessName) {
        return res.status(400).json({ error: 'bankCode, accountNumber, and businessName are required' });
    }

    const { paystackService } = await import('../../services/property-management/payment/paystackService');

    const result = await paystackService.registerPropertyManagerAccount(
        organizationId, bankCode, accountNumber, businessName, contactEmail, contactPhone, 'deals'
    );

    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, subaccountCode: result.subaccountCode });
}));

/**
 * POST /payments/resolve-account
 * Verify a bank account number (name enquiry)
 */
router.post('/payments/resolve-account', paymentRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const { accountNumber, bankCode } = req.body;

    if (!accountNumber || !bankCode) {
        return res.status(400).json({ error: 'accountNumber and bankCode are required' });
    }

    try {
        const { paystackService } = await import('../../services/property-management/payment/paystackService');
        const result = await paystackService.resolveAccount(accountNumber, bankCode);
        res.json(result);
    } catch (err: any) {
        const status = err.status || 422;
        res.status(status).json({
            status: false,
            error: err.paystackMessage || err.message || 'Account verification failed',
            meta: err.paystackMeta || undefined
        });
    }
}));

// =====================================================
// CRYPTO WALLET CONFIGURATION
// =====================================================

/**
 * GET /payments/crypto-wallet
 * Get current crypto wallet configuration for the deal management org
 */
router.get('/payments/crypto-wallet', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { cryptoPayoutService } = await import('../../services/payments/cryptoPayoutService');
    res.json(await cryptoPayoutService.get(organizationId, 'deals'));
}));

/**
 * POST /payments/crypto-wallet
 * Save/update crypto payout wallet for the deal management org (chain-aware).
 */
router.post('/payments/crypto-wallet', paymentRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { walletAddress, payoutCoin, payoutChain } = req.body;
    const { cryptoPayoutService } = await import('../../services/payments/cryptoPayoutService');
    const result = await cryptoPayoutService.save({
        entityId: organizationId,
        serviceType: 'deals',
        walletAddress,
        payoutCoin,
        payoutChain,
    });
    res.status(result.status).json(result.body);
}));

/**
 * GET /payments/crypto-settlement
 * Get current settlement preference for the deal management org
 */
router.get('/payments/crypto-settlement', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { nowPaymentsService } = await import('../../../shared-services/payments/crypto/nowPaymentsService');
    const pref = await nowPaymentsService.getClientSettlementPreference('organization', organizationId);
    res.json(pref);
}));

/**
 * PUT /payments/crypto-settlement
 * Set preferred settlement coin and wallet for the deal management org
 */
router.put('/payments/crypto-settlement', paymentRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { coinSymbol, chain, walletAddress } = req.body;

    if (!coinSymbol || !chain || !walletAddress) {
        return res.status(400).json({ error: 'coinSymbol, chain, and walletAddress are required' });
    }

    const { nowPaymentsService } = await import('../../../shared-services/payments/crypto/nowPaymentsService');
    const result = await nowPaymentsService.setClientSettlementPreference({
        entityType: 'organization',
        entityId: organizationId,
        coinSymbol,
        chain,
        walletAddress,
    });

    // If EVM-native, also register on-chain
    if (!result.useNowPayments && /^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        try {
            const { cryptoPaymentService } = await import('../../../shared-services/payments/crypto');
            if (cryptoPaymentService.isConfigured()) {
                await cryptoPaymentService.registerRecipientWallet('organization', organizationId, walletAddress, 'deals');
            }
        } catch {
            // On-chain optional
        }
    }

    res.json(result);
}));

/**
 * GET /payments/crypto-settlement-coins
 * Get supported settlement coins for the UI dropdown
 */
router.get('/payments/crypto-settlement-coins', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = await import('../../../shared-services/payments/crypto/nowPaymentsService');
    const coins = await nowPaymentsService.getSupportedSettlementCoins();
    res.json({ coins });
}));

// Alias for frontend (shorter path)
router.get('/payments/settlement-coins', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = await import('../../../shared-services/payments/crypto/nowPaymentsService');
    const coins = await nowPaymentsService.getSupportedSettlementCoins();
    res.json({ coins });
}));

// =====================================================
// DEAL PAYMENT INITIATION
// =====================================================

/**
 * POST /payments/initiate
 * Initialize a deal payment via Paystack (card / mobile money).
 * Applies the deal fee rule: 0.25% of transaction value.
 */
router.post('/payments/initiate', paymentInitiateRateLimiter, paymentIdempotency, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { dealId, amount, email, description, channel, callbackUrl } = req.body;

    if (!dealId || !amount || !email) {
        return res.status(400).json({ error: 'dealId, amount, and email are required' });
    }

    const { paymentProcessor } = await import('../../services/property-management/payment/paymentProcessor');
    const { pool } = await import('../../database');

    // Resolve the deal's native currency server-side (never trust the client for FX).
    // A USD-denominated deal is charged in its GHS equivalent at a live, locked rate.
    const dealRow = await pool.query(
        `SELECT currency FROM deals WHERE id = $1 AND organization_id = $2`,
        [dealId, organizationId]
    );
    if (dealRow.rows.length === 0) {
        return res.status(404).json({ error: 'Deal not found' });
    }
    const obligationCurrency = dealRow.rows[0].currency || 'GHS';

    const result = await paymentProcessor.initializeGenericPayment({
        entityId: dealId,
        entityType: 'deal',
        recipientId: organizationId,
        recipientType: 'organization',
        amount: parseFloat(amount),
        obligationCurrency,
        email,
        description: description || 'Deal payment',
        channel: channel || 'mobile_money',
        callbackUrl,
    });

    res.json(result);
}));

/**
 * POST /payments/crypto/initiate
 * Initialize a deal payment via crypto (unified — any coin).
 * Applies the deal fee rule: 0.25% of transaction value.
 */
router.post('/payments/crypto/initiate', paymentInitiateRateLimiter, paymentIdempotency, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const { dealId, amount, payerCurrency, payerChain, payerWalletAddress, requiresEscrow, description } = req.body;

    if (!dealId || !amount || !payerCurrency || !payerChain) {
        return res.status(400).json({
            error: 'dealId, amount, payerCurrency, and payerChain are required'
        });
    }

    if (payerWalletAddress && /^0x/.test(payerWalletAddress) && !/^0x[a-fA-F0-9]{40}$/.test(payerWalletAddress)) {
        return res.status(400).json({ error: 'Invalid EVM wallet address format' });
    }

    const { paymentProcessor } = await import('../../services/property-management/payment/paymentProcessor');

    const result = await paymentProcessor.initializeUnifiedCryptoPayment({
        paymentType: 'deal',
        entityId: dealId,
        entityType: 'deal',
        recipientId: organizationId,
        recipientType: 'organization',
        amount: parseFloat(amount),
        payerCurrency,
        payerChain,
        payerWalletAddress,
        requiresEscrow: requiresEscrow ?? false,
        description: description || 'Deal crypto payment',
        metadata: {
            deal_id: dealId,
            organization_id: organizationId,
        },
    });

    res.json(result);
}));

/**
 * GET /payments/crypto/estimate
 * Get fee estimate for a deal crypto payment.
 * Returns fee breakdown showing the 0.25% platform fee.
 */
router.get('/payments/crypto/estimate', asyncHandler(async (req: Request, res: Response) => {
    const { amount } = req.query;

    if (!amount) {
        return res.status(400).json({ error: 'amount (GHS) is required' });
    }

    const { feeEngine } = await import('../../../shared-services/payments/feeEngine');
    const organizationId = await getOrganizationId(req);
    const fee = await feeEngine.calculate('deal', parseFloat(amount as string), organizationId, 'organization');

    const { exchangeRateService } = await import('../../../shared-services/payments/crypto/exchangeRateService');
    const usdAmount = await exchangeRateService.convertGhsToUsd(fee.totalCharge);

    res.json({
        principalGhs: fee.principalAmount,
        serviceFeeGhs: fee.serviceFee,
        totalChargeGhs: fee.totalCharge,
        usdAmount,
        feeMode: fee.feeMode,
        feePercentage: fee.percentageRateApplied,
        feeDescription: fee.feeDescription,
    });
}));

export default router;
