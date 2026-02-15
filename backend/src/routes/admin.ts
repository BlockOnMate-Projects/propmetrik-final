/**
 * Admin Routes
 * Platform-level admin endpoints for fee configurations, system settings, etc.
 * 
 * @module routes/admin
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { logger } from '../utils/logger';
import { feeEngine } from '../../shared-services/payments/feeEngine';
import { cryptoPaymentService, exchangeRateService, loadCryptoConfig, nowPaymentsService } from '../../shared-services/payments/crypto';

const router = Router();

// Async error wrapper
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void | any>) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// ============================================================================
// FEE CONFIGURATIONS
// ============================================================================

/**
 * GET /fee-configurations
 * List all fee configurations (global defaults + org-specific overrides)
 */
router.get('/fee-configurations', asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(`
        SELECT 
            fc.id,
            fc.payment_type,
            fc.organization_id,
            o.name as organization_name,
            fc.fee_mode,
            fc.percentage_rate,
            fc.flat_amount,
            fc.currency,
            fc.min_fee,
            fc.max_fee,
            fc.is_active,
            fc.effective_from,
            fc.effective_until,
            fc.created_at,
            fc.updated_at,
            fc.updated_by
        FROM fee_configurations fc
        LEFT JOIN organizations o ON o.id = fc.organization_id
        WHERE fc.is_active = TRUE
          AND (fc.effective_until IS NULL OR fc.effective_until >= CURRENT_DATE)
        ORDER BY fc.payment_type, fc.organization_id NULLS FIRST
    `);

    // Format for the frontend
    const configs = result.rows.map(row => ({
        id: row.id,
        paymentType: row.payment_type,
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        feeMode: row.fee_mode,
        percentageRate: parseFloat(row.percentage_rate),
        flatAmount: parseFloat(row.flat_amount),
        currency: row.currency || 'GHS',
        minFee: row.min_fee ? parseFloat(row.min_fee) : null,
        maxFee: row.max_fee ? parseFloat(row.max_fee) : null,
        isActive: row.is_active,
        effectiveFrom: row.effective_from,
        effectiveUntil: row.effective_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
    }));

    res.json({ data: configs });
}));

/**
 * PUT /fee-configurations/:id
 * Update a fee configuration
 */
router.put('/fee-configurations/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
        feeMode,
        percentageRate,
        flatAmount,
        minFee,
        maxFee,
        currency,
    } = req.body;

    // Validate required fields
    if (!feeMode || percentageRate === undefined || flatAmount === undefined) {
        res.status(400).json({ error: 'feeMode, percentageRate, and flatAmount are required' });
        return;
    }

    // Validate fee mode
    const validModes = ['percentage', 'flat', 'max_of'];
    if (!validModes.includes(feeMode)) {
        res.status(400).json({ error: `Invalid feeMode. Must be one of: ${validModes.join(', ')}` });
        return;
    }

    // Validate percentage rate (stored as decimal, e.g. 0.01 for 1%)
    const pctRate = parseFloat(percentageRate);
    if (isNaN(pctRate) || pctRate < 0 || pctRate > 1) {
        res.status(400).json({ error: 'percentageRate must be between 0 and 1 (e.g., 0.01 for 1%)' });
        return;
    }

    const flatAmt = parseFloat(flatAmount);
    if (isNaN(flatAmt) || flatAmt < 0) {
        res.status(400).json({ error: 'flatAmount must be >= 0' });
        return;
    }

    // Get old values for audit
    const oldResult = await pool.query('SELECT * FROM fee_configurations WHERE id = $1', [id]);
    if (oldResult.rows.length === 0) {
        res.status(404).json({ error: 'Fee configuration not found' });
        return;
    }
    const oldRow = oldResult.rows[0];

    // Update
    const result = await pool.query(`
        UPDATE fee_configurations
        SET 
            fee_mode = $1,
            percentage_rate = $2,
            flat_amount = $3,
            min_fee = $4,
            max_fee = $5,
            currency = COALESCE($6, currency),
            updated_at = NOW()
        WHERE id = $7
        RETURNING *
    `, [feeMode, pctRate, flatAmt, minFee ?? null, maxFee ?? null, currency, id]);

    if (result.rows.length === 0) {
        res.status(404).json({ error: 'Fee configuration not found' });
        return;
    }

    // Clear fee engine cache so new rates take effect immediately
    feeEngine.clearCache();

    const row = result.rows[0];
    logger.info('Fee configuration updated', {
        configId: id,
        paymentType: row.payment_type,
        oldRate: oldRow.percentage_rate,
        newRate: pctRate,
        oldFlat: oldRow.flat_amount,
        newFlat: flatAmt,
        oldMode: oldRow.fee_mode,
        newMode: feeMode,
    });

    res.json({
        message: 'Fee configuration updated successfully',
        data: {
            id: row.id,
            paymentType: row.payment_type,
            organizationId: row.organization_id,
            feeMode: row.fee_mode,
            percentageRate: parseFloat(row.percentage_rate),
            flatAmount: parseFloat(row.flat_amount),
            currency: row.currency || 'GHS',
            minFee: row.min_fee ? parseFloat(row.min_fee) : null,
            maxFee: row.max_fee ? parseFloat(row.max_fee) : null,
            isActive: row.is_active,
            updatedAt: row.updated_at,
        },
    });
}));

/**
 * POST /fee-configurations
 * Create a new fee configuration (e.g., org-specific override)
 */
router.post('/fee-configurations', asyncHandler(async (req: Request, res: Response) => {
    const {
        paymentType,
        organizationId,
        feeMode,
        percentageRate,
        flatAmount,
        minFee,
        maxFee,
        currency,
    } = req.body;

    if (!paymentType || !feeMode || percentageRate === undefined || flatAmount === undefined) {
        res.status(400).json({ error: 'paymentType, feeMode, percentageRate, and flatAmount are required' });
        return;
    }

    const validTypes = ['rent', 'deal', 'project', 'subscription'];
    if (!validTypes.includes(paymentType)) {
        res.status(400).json({ error: `Invalid paymentType. Must be one of: ${validTypes.join(', ')}` });
        return;
    }

    const validModes = ['percentage', 'flat', 'max_of'];
    if (!validModes.includes(feeMode)) {
        res.status(400).json({ error: `Invalid feeMode. Must be one of: ${validModes.join(', ')}` });
        return;
    }

    const pctRate = parseFloat(percentageRate);
    if (isNaN(pctRate) || pctRate < 0 || pctRate > 1) {
        res.status(400).json({ error: 'percentageRate must be between 0 and 1' });
        return;
    }

    const result = await pool.query(`
        INSERT INTO fee_configurations (
            payment_type, organization_id, fee_mode, percentage_rate, flat_amount,
            min_fee, max_fee, currency
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'GHS'))
        RETURNING *
    `, [paymentType, organizationId || null, feeMode, pctRate, parseFloat(flatAmount),
        minFee ?? null, maxFee ?? null, currency]);

    feeEngine.clearCache();

    const row = result.rows[0];
    logger.info('Fee configuration created', { configId: row.id, paymentType, feeMode });

    res.status(201).json({
        message: 'Fee configuration created successfully',
        data: {
            id: row.id,
            paymentType: row.payment_type,
            organizationId: row.organization_id,
            feeMode: row.fee_mode,
            percentageRate: parseFloat(row.percentage_rate),
            flatAmount: parseFloat(row.flat_amount),
            currency: row.currency || 'GHS',
            minFee: row.min_fee ? parseFloat(row.min_fee) : null,
            maxFee: row.max_fee ? parseFloat(row.max_fee) : null,
            isActive: row.is_active,
            createdAt: row.created_at,
        },
    });
}));

// =====================================================
// CRYPTO PAYMENT ADMIN ROUTES
// =====================================================

/**
 * GET /api/v1/admin/crypto/status
 * Check crypto rail configuration and contract state.
 */
router.get('/crypto/status', asyncHandler(async (req: Request, res: Response) => {
    const config = loadCryptoConfig();
    if (!config) {
        return res.json({ configured: false });
    }

    const status: any = {
        configured: true,
        contractAddress: config.contractAddress,
        chainId: config.chainId,
        network: config.chainId === 1 ? 'ethereum-mainnet'
               : config.chainId === 137 ? 'polygon-mainnet'
               : config.chainId === 11155111 ? 'sepolia-testnet'
               : 'amoy-testnet',
        hasAdminSigner: !!config.adminPrivateKey,
    };

    // Try to get on-chain fee configs
    if (cryptoPaymentService.isConfigured()) {
        try {
            const [rentFee, dealFee, projectFee] = await Promise.all([
                cryptoPaymentService.getOnChainFeeConfig('rent'),
                cryptoPaymentService.getOnChainFeeConfig('deal'),
                cryptoPaymentService.getOnChainFeeConfig('project'),
            ]);
            status.onChainFees = { rent: rentFee, deal: dealFee, project: projectFee };
        } catch (err: any) {
            status.onChainFeeError = err.message;
        }
    }

    res.json(status);
}));

/**
 * POST /api/v1/admin/crypto/register-wallet
 * Register a recipient wallet on-chain.
 * Body: { entityType, entityId, walletAddress }
 */
router.post('/crypto/register-wallet', asyncHandler(async (req: Request, res: Response) => {
    const { entityType, entityId, walletAddress } = req.body;

    if (!entityType || !entityId || !walletAddress) {
        return res.status(400).json({ error: 'entityType, entityId, and walletAddress are required' });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    if (!cryptoPaymentService.isConfigured()) {
        return res.status(503).json({ error: 'Crypto rail not configured' });
    }

    const result = await cryptoPaymentService.registerRecipientWallet(entityType, entityId, walletAddress);
    res.json(result);
}));

/**
 * GET /api/v1/admin/crypto/recipient-wallet/:entityType/:entityId
 * Look up a registered recipient wallet.
 */
router.get('/crypto/recipient-wallet/:entityType/:entityId', asyncHandler(async (req: Request, res: Response) => {
    const { entityType, entityId } = req.params;

    if (!cryptoPaymentService.isConfigured()) {
        return res.status(503).json({ error: 'Crypto rail not configured' });
    }

    const wallet = await cryptoPaymentService.getRecipientWallet(entityType, entityId);
    res.json({ entityType, entityId, walletAddress: wallet });
}));

/**
 * PUT /api/v1/admin/crypto/recipient-preferred-token
 * Set a recipient's preferred token for auto-conversion.
 * Body: { entityType, entityId, preferredTokenAddress }
 *       Pass preferredTokenAddress as "0x0000..." or null to clear.
 */
router.put('/crypto/recipient-preferred-token', asyncHandler(async (req: Request, res: Response) => {
    const { entityType, entityId, preferredTokenAddress } = req.body;

    if (!entityType || !entityId) {
        return res.status(400).json({ error: 'entityType and entityId are required' });
    }

    if (!cryptoPaymentService.isConfigured()) {
        return res.status(503).json({ error: 'Crypto rail not configured' });
    }

    const tokenAddr = preferredTokenAddress || '0x0000000000000000000000000000000000000000';
    const result = await cryptoPaymentService.setRecipientPreferredToken(entityType, entityId, tokenAddr);
    res.json({ success: true, ...result, preferredTokenAddress: tokenAddr });
}));

/**
 * GET /api/v1/admin/crypto/recipient-preferred-token/:entityType/:entityId
 * Look up a recipient's preferred token.
 */
router.get('/crypto/recipient-preferred-token/:entityType/:entityId', asyncHandler(async (req: Request, res: Response) => {
    const { entityType, entityId } = req.params;

    if (!cryptoPaymentService.isConfigured()) {
        return res.status(503).json({ error: 'Crypto rail not configured' });
    }

    const preferredToken = await cryptoPaymentService.getRecipientPreferredToken(entityType, entityId);
    res.json({ entityType, entityId, preferredTokenAddress: preferredToken });
}));

/**
 * GET /api/v1/admin/crypto/exchange-rate
 * Get current GHS → USD exchange rate.
 */
router.get('/crypto/exchange-rate', asyncHandler(async (req: Request, res: Response) => {
    const rate = await exchangeRateService.getGHSPerUSD();
    res.json(rate);
}));

/**
 * POST /api/v1/admin/crypto/exchange-rate/clear-cache
 * Clear the cached exchange rate.
 */
router.post('/crypto/exchange-rate/clear-cache', asyncHandler(async (req: Request, res: Response) => {
    exchangeRateService.clearCache();
    res.json({ message: 'Exchange rate cache cleared' });
}));

// =====================================================
// NOWPAYMENTS — HYBRID SETTLEMENT MANAGEMENT
// =====================================================

/**
 * GET /api/v1/admin/crypto/nowpayments/status
 * Check NOWPayments API availability and configuration.
 */
router.get('/crypto/nowpayments/status', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = require('../../shared-services/payments/crypto/nowPaymentsService');

    if (!nowPaymentsService.isConfigured()) {
        return res.json({ configured: false, message: 'NOWPayments API key not set' });
    }

    try {
        const apiStatus = await nowPaymentsService.getStatus();
        res.json({ configured: true, apiStatus: apiStatus.message, sandbox: nowPaymentsService.getConfig()?.sandbox });
    } catch (err: any) {
        res.json({ configured: true, apiStatus: 'unreachable', error: err.message });
    }
}));

/**
 * GET /api/v1/admin/crypto/nowpayments/currencies
 * Get available payment currencies from NOWPayments.
 */
router.get('/crypto/nowpayments/currencies', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = require('../../shared-services/payments/crypto/nowPaymentsService');
    const currencies = await nowPaymentsService.getAvailableCurrencyTickers();
    res.json({ currencies, count: currencies.length });
}));

/**
 * GET /api/v1/admin/crypto/settlement-coins
 * Get all supported settlement coins for client configuration.
 */
router.get('/crypto/settlement-coins', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = require('../../shared-services/payments/crypto/nowPaymentsService');
    const coins = await nowPaymentsService.getSupportedSettlementCoins();
    res.json({ coins });
}));

/**
 * PUT /api/v1/admin/crypto/client-settlement
 * Configure a client's preferred settlement coin and wallet address.
 * Body: { entityType, entityId, coinSymbol, chain, walletAddress }
 */
router.put('/crypto/client-settlement', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = require('../../shared-services/payments/crypto/nowPaymentsService');
    const { entityType, entityId, coinSymbol, chain, walletAddress } = req.body;

    if (!entityType || !entityId || !coinSymbol || !chain || !walletAddress) {
        return res.status(400).json({
            error: 'Missing required fields: entityType, entityId, coinSymbol, chain, walletAddress'
        });
    }

    const result = await nowPaymentsService.setClientSettlementPreference({
        entityType, entityId, coinSymbol, chain, walletAddress,
    });

    // If it's an EVM-native token on Polygon, also register/update on-chain wallet
    if (!result.useNowPayments && /^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        try {
            if (cryptoPaymentService.isConfigured()) {
                await cryptoPaymentService.registerRecipientWallet(entityType, entityId, walletAddress);
            }
        } catch (err: any) {
            // On-chain registration failed but DB config saved
            return res.json({
                ...result,
                onChainRegistered: false,
                onChainError: err.message,
            });
        }
    }

    res.json({ ...result, onChainRegistered: !result.useNowPayments });
}));

/**
 * GET /api/v1/admin/crypto/client-settlement/:entityType/:entityId
 * Look up a client's settlement configuration.
 */
router.get('/crypto/client-settlement/:entityType/:entityId', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = require('../../shared-services/payments/crypto/nowPaymentsService');
    const { entityType, entityId } = req.params;
    const result = await nowPaymentsService.getClientSettlementPreference(entityType, entityId);
    res.json(result);
}));

/**
 * GET /api/v1/admin/crypto/nowpayments/estimate
 * Get estimated conversion amount for a currency pair.
 * Query: amount, from, to
 */
router.get('/crypto/nowpayments/estimate', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = require('../../shared-services/payments/crypto/nowPaymentsService');
    const { amount, from, to } = req.query;

    if (!amount || !from || !to) {
        return res.status(400).json({ error: 'Required query params: amount, from, to' });
    }

    const estimate = await nowPaymentsService.getEstimate(
        parseFloat(amount as string),
        from as string,
        to as string,
    );
    res.json(estimate);
}));

/**
 * GET /api/v1/admin/crypto/nowpayments/min-amount
 * Get minimum payment amount for a currency pair.
 * Query: from, to
 */
router.get('/crypto/nowpayments/min-amount', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = require('../../shared-services/payments/crypto/nowPaymentsService');
    const { from, to } = req.query;

    if (!from || !to) {
        return res.status(400).json({ error: 'Required query params: from, to' });
    }

    const minAmount = await nowPaymentsService.getMinimumAmount(from as string, to as string);
    res.json(minAmount);
}));

/**
 * GET /api/v1/admin/crypto/nowpayments/payments/summary
 * Get NOWPayments payment counts grouped by status.
 */
router.get('/crypto/nowpayments/payments/summary', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = require('../../shared-services/payments/crypto/nowPaymentsService');
    const summary = await nowPaymentsService.getPaymentSummary();
    res.json({ summary });
}));

/**
 * GET /api/v1/admin/crypto/nowpayments/payments/history
 * Get NOWPayments payment history with filtering.
 * Query: limit, offset, status, entityType, entityId
 */
router.get('/crypto/nowpayments/payments/history', asyncHandler(async (req: Request, res: Response) => {
    const { nowPaymentsService } = require('../../shared-services/payments/crypto/nowPaymentsService');
    const { limit, offset, status, entityType, entityId } = req.query;

    const result = await nowPaymentsService.getPaymentHistory({
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        status: status as string,
        entityType: entityType as string,
        entityId: entityId as string,
    });
    res.json(result);
}));

/**
 * GET /api/v1/admin/crypto/escrow/summary
 * Get escrow payment and payout summary.
 */
router.get('/crypto/escrow/summary', asyncHandler(async (req: Request, res: Response) => {
    const { escrowPayoutService } = require('../../shared-services/payments/crypto/escrowPayoutService');
    const summary = await escrowPayoutService.getSummary();
    res.json(summary);
}));

/**
 * GET /api/v1/admin/crypto/escrow/pending
 * Get pending escrow deposits (NOWPayments finished but not yet deposited to contract).
 */
router.get('/crypto/escrow/pending', asyncHandler(async (req: Request, res: Response) => {
    const { escrowPayoutService } = require('../../shared-services/payments/crypto/escrowPayoutService');
    const pending = await escrowPayoutService.getPendingEscrowDeposits();
    res.json({ pending, count: pending.length });
}));

/**
 * POST /api/v1/admin/crypto/escrow/confirm-deposit
 * Confirm that an escrow deposit has been made to the smart contract.
 * Body: { paymentReference, txHash }
 */
router.post('/crypto/escrow/confirm-deposit', asyncHandler(async (req: Request, res: Response) => {
    const { escrowPayoutService } = require('../../shared-services/payments/crypto/escrowPayoutService');
    const { paymentReference, txHash } = req.body;

    if (!paymentReference || !txHash) {
        return res.status(400).json({ error: 'paymentReference and txHash are required' });
    }

    await escrowPayoutService.confirmEscrowDeposit(paymentReference, txHash);
    res.json({ success: true, paymentReference, txHash });
}));

/**
 * POST /api/v1/admin/crypto/escrow/release-payout
 * Trigger a NOWPayments payout after escrow release.
 * Body: { paymentReference, releaseTxHash, releaseAmount }
 */
router.post('/crypto/escrow/release-payout', asyncHandler(async (req: Request, res: Response) => {
    const { escrowPayoutService } = require('../../shared-services/payments/crypto/escrowPayoutService');
    const { paymentReference, releaseTxHash, releaseAmount } = req.body;

    if (!paymentReference || !releaseTxHash || !releaseAmount) {
        return res.status(400).json({ error: 'paymentReference, releaseTxHash, and releaseAmount are required' });
    }

    const result = await escrowPayoutService.handleEscrowRelease(
        paymentReference, releaseTxHash, parseFloat(releaseAmount)
    );
    res.json(result);
}));

/**
 * POST /api/v1/admin/crypto/escrow/complete-payout
 * Manually mark a payout as completed.
 * Body: { payoutId, txHash?, actualAmount? }
 */
router.post('/crypto/escrow/complete-payout', asyncHandler(async (req: Request, res: Response) => {
    const { escrowPayoutService } = require('../../shared-services/payments/crypto/escrowPayoutService');
    const { payoutId, txHash, actualAmount } = req.body;

    if (!payoutId) {
        return res.status(400).json({ error: 'payoutId is required' });
    }

    await escrowPayoutService.markPayoutCompleted(payoutId, {
        txHash,
        actualAmount: actualAmount ? parseFloat(actualAmount) : undefined,
    });
    res.json({ success: true, payoutId });
}));

// =====================================================
// CRYPTO TRANSACTIONS & METRICS (Admin Dashboard)
// =====================================================

/**
 * GET /api/v1/admin/crypto/transactions
 * List all crypto transactions with filtering and pagination.
 */
router.get('/crypto/transactions', asyncHandler(async (req: Request, res: Response) => {
    const {
        page = '1',
        limit = '50',
        status,
        paymentType,
        search,
        dateFrom,
        dateTo,
        sortBy = 'created_at',
        sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const validSortColumns: Record<string, string> = {
        created_at: 'pt.created_at',
        gross_amount: 'pt.gross_amount',
        principal_crypto: 'pt.principal_crypto',
        status: 'pt.status',
    };
    const sortColumn = validSortColumns[sortBy as string] || 'pt.created_at';
    const sortDir = (sortOrder as string)?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let whereClause = `WHERE pt.tx_hash IS NOT NULL`; // Only crypto transactions
    const params: any[] = [];

    if (status) {
        params.push(status);
        whereClause += ` AND pt.status = $${params.length}`;
    }
    if (paymentType) {
        params.push(paymentType);
        whereClause += ` AND pt.payment_type = $${params.length}`;
    }
    if (search) {
        params.push(`%${search}%`);
        whereClause += ` AND (pt.tx_hash ILIKE $${params.length} OR pt.payer_wallet ILIKE $${params.length} OR pt.recipient_wallet ILIKE $${params.length} OR pt.reference ILIKE $${params.length})`;
    }
    if (dateFrom) {
        params.push(dateFrom);
        whereClause += ` AND pt.created_at >= $${params.length}::timestamptz`;
    }
    if (dateTo) {
        params.push(dateTo);
        whereClause += ` AND pt.created_at <= $${params.length}::timestamptz`;
    }

    const countParams = [...params];
    const countQuery = `SELECT COUNT(*)::int as total FROM payment_transactions pt ${whereClause}`;

    params.push(limitNum, offset);
    const dataQuery = `
        SELECT 
            pt.id,
            pt.reference,
            pt.payment_type,
            pt.payer_id,
            pt.payer_email,
            pt.recipient_type,
            pt.recipient_id,
            pt.gross_amount,
            pt.principal_amount,
            pt.service_fee,
            pt.currency,
            pt.status,
            pt.channel,
            pt.domain_record_type,
            pt.domain_record_id,
            pt.tx_hash,
            pt.block_number,
            pt.payer_wallet,
            pt.recipient_wallet,
            pt.crypto_currency,
            pt.exchange_rate,
            pt.principal_crypto,
            pt.fee_crypto,
            pt.gas_cost_matic,
            pt.created_at,
            pt.verified_at,
            pt.metadata
        FROM payment_transactions pt
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDir}
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const [dataResult, countResult] = await Promise.all([
        pool.query(dataQuery, params),
        pool.query(countQuery, countParams),
    ]);

    const transactions = dataResult.rows.map(row => ({
        id: row.id,
        reference: row.reference,
        paymentType: row.payment_type,
        payerId: row.payer_id,
        payerEmail: row.payer_email,
        recipientType: row.recipient_type,
        recipientId: row.recipient_id,
        grossAmount: row.gross_amount,
        principalAmount: row.principal_amount,
        serviceFee: row.service_fee,
        currency: row.currency,
        status: row.status,
        channel: row.channel,
        txHash: row.tx_hash,
        blockNumber: row.block_number,
        payerWallet: row.payer_wallet,
        recipientWallet: row.recipient_wallet,
        cryptoCurrency: row.crypto_currency,
        exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : null,
        principalCrypto: row.principal_crypto ? parseFloat(row.principal_crypto) : null,
        feeCrypto: row.fee_crypto ? parseFloat(row.fee_crypto) : null,
        gasCostMatic: row.gas_cost_matic ? parseFloat(row.gas_cost_matic) : null,
        createdAt: row.created_at,
        verifiedAt: row.verified_at,
        metadata: row.metadata,
    }));

    const total = countResult.rows[0]?.total || 0;

    res.json({
        data: transactions,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
    });
}));

/**
 * GET /api/v1/admin/crypto/metrics
 * Aggregate metrics for the admin crypto dashboard.
 */
router.get('/crypto/metrics', asyncHandler(async (req: Request, res: Response) => {
    const { period = '30d' } = req.query;

    // Map period string to interval
    const intervalMap: Record<string, string> = {
        '24h': '24 hours',
        '7d': '7 days',
        '30d': '30 days',
        '90d': '90 days',
        'all': '100 years',
    };
    const interval = intervalMap[period as string] || '30 days';

    const metricsQuery = `
        WITH crypto_txns AS (
            SELECT * FROM payment_transactions
            WHERE tx_hash IS NOT NULL
              AND created_at >= NOW() - INTERVAL '${interval}'
        )
        SELECT
            COUNT(*)::int AS total_transactions,
            COUNT(*) FILTER (WHERE status = 'success')::int AS successful,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
            COALESCE(SUM(principal_crypto) FILTER (WHERE status = 'success'), 0)::numeric AS total_volume_usdt,
            COALESCE(SUM(fee_crypto) FILTER (WHERE status = 'success'), 0)::numeric AS total_fees_usdt,
            COALESCE(SUM(gas_cost_matic) FILTER (WHERE status = 'success'), 0)::numeric AS total_gas_matic,
            COALESCE(AVG(principal_crypto) FILTER (WHERE status = 'success'), 0)::numeric AS avg_payment_usdt,
            COALESCE(SUM(gross_amount) FILTER (WHERE status = 'success'), 0)::bigint AS total_volume_ghs_pesewas,
            COALESCE(SUM(service_fee) FILTER (WHERE status = 'success'), 0)::bigint AS total_fees_ghs_pesewas,
            COUNT(DISTINCT payer_wallet) FILTER (WHERE status = 'success')::int AS unique_payers,
            COUNT(DISTINCT recipient_wallet) FILTER (WHERE status = 'success')::int AS unique_recipients
        FROM crypto_txns
    `;

    const volumeByTypeQuery = `
        SELECT
            payment_type,
            COUNT(*)::int AS count,
            COALESCE(SUM(principal_crypto) FILTER (WHERE status = 'success'), 0)::numeric AS volume_usdt,
            COALESCE(SUM(fee_crypto) FILTER (WHERE status = 'success'), 0)::numeric AS fees_usdt
        FROM payment_transactions
        WHERE tx_hash IS NOT NULL
          AND created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY payment_type
        ORDER BY volume_usdt DESC
    `;

    const dailyVolumeQuery = `
        SELECT
            DATE(created_at) AS date,
            COUNT(*) FILTER (WHERE status = 'success')::int AS count,
            COALESCE(SUM(principal_crypto) FILTER (WHERE status = 'success'), 0)::numeric AS volume_usdt,
            COALESCE(SUM(fee_crypto) FILTER (WHERE status = 'success'), 0)::numeric AS fees_usdt
        FROM payment_transactions
        WHERE tx_hash IS NOT NULL
          AND created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
    `;

    const recentQuery = `
        SELECT 
            pt.id,
            pt.reference,
            pt.payment_type,
            pt.tx_hash,
            pt.payer_wallet,
            pt.recipient_wallet,
            pt.principal_crypto,
            pt.fee_crypto,
            pt.exchange_rate,
            pt.status,
            pt.created_at,
            pt.verified_at
        FROM payment_transactions pt
        WHERE pt.tx_hash IS NOT NULL
        ORDER BY pt.created_at DESC
        LIMIT 10
    `;

    const [metricsResult, volumeByTypeResult, dailyVolumeResult, recentResult] = await Promise.all([
        pool.query(metricsQuery),
        pool.query(volumeByTypeQuery),
        pool.query(dailyVolumeQuery),
        pool.query(recentQuery),
    ]);

    const metrics = metricsResult.rows[0];

    res.json({
        period: period as string,
        summary: {
            totalTransactions: metrics.total_transactions,
            successful: metrics.successful,
            pending: metrics.pending,
            failed: metrics.failed,
            totalVolumeUSDT: parseFloat(metrics.total_volume_usdt),
            totalFeesUSDT: parseFloat(metrics.total_fees_usdt),
            totalGasMatic: parseFloat(metrics.total_gas_matic),
            avgPaymentUSDT: parseFloat(metrics.avg_payment_usdt),
            totalVolumeGHS: metrics.total_volume_ghs_pesewas / 100,  // pesewas → GHS
            totalFeesGHS: metrics.total_fees_ghs_pesewas / 100,
            uniquePayers: metrics.unique_payers,
            uniqueRecipients: metrics.unique_recipients,
        },
        volumeByType: volumeByTypeResult.rows.map(r => ({
            paymentType: r.payment_type,
            count: r.count,
            volumeUSDT: parseFloat(r.volume_usdt),
            feesUSDT: parseFloat(r.fees_usdt),
        })),
        dailyVolume: dailyVolumeResult.rows.map(r => ({
            date: r.date,
            count: r.count,
            volumeUSDT: parseFloat(r.volume_usdt),
            feesUSDT: parseFloat(r.fees_usdt),
        })),
        recentTransactions: recentResult.rows.map(r => ({
            id: r.id,
            reference: r.reference,
            paymentType: r.payment_type,
            txHash: r.tx_hash,
            payerWallet: r.payer_wallet,
            recipientWallet: r.recipient_wallet,
            principalCrypto: r.principal_crypto ? parseFloat(r.principal_crypto) : null,
            feeCrypto: r.fee_crypto ? parseFloat(r.fee_crypto) : null,
            exchangeRate: r.exchange_rate ? parseFloat(r.exchange_rate) : null,
            status: r.status,
            createdAt: r.created_at,
            verifiedAt: r.verified_at,
        })),
    });
}));

/**
 * GET /api/v1/admin/crypto/wallets
 * List all registered crypto wallets from payment_accounts.
 */
router.get('/crypto/wallets', asyncHandler(async (req: Request, res: Response) => {
    const { page = '1', limit = '50', entityType, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = `WHERE pa.crypto_wallet_address IS NOT NULL`;
    const params: any[] = [];

    if (entityType) {
        params.push(entityType);
        whereClause += ` AND pa.entity_type = $${params.length}`;
    }
    if (search) {
        params.push(`%${search}%`);
        whereClause += ` AND (pa.crypto_wallet_address ILIKE $${params.length} OR o.name ILIKE $${params.length} OR pa.account_name ILIKE $${params.length})`;
    }

    const countParams = [...params];

    params.push(limitNum, offset);
    const dataQuery = `
        SELECT 
            pa.id,
            pa.entity_type,
            pa.entity_id,
            pa.crypto_wallet_address,
            pa.crypto_wallet_verified,
            pa.crypto_wallet_registered_at,
            pa.account_name,
            pa.is_active,
            pa.created_at,
            o.name AS organization_name
        FROM payment_accounts pa
        LEFT JOIN organizations o ON pa.entity_id = o.id
        ${whereClause}
        ORDER BY pa.crypto_wallet_registered_at DESC NULLS LAST, pa.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM payment_accounts pa
        LEFT JOIN organizations o ON pa.entity_id = o.id
        ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
        pool.query(dataQuery, params),
        pool.query(countQuery, countParams),
    ]);

    const wallets = dataResult.rows.map(row => ({
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        walletAddress: row.crypto_wallet_address,
        isVerified: row.crypto_wallet_verified,
        registeredAt: row.crypto_wallet_registered_at,
        accountName: row.account_name,
        organizationName: row.organization_name,
        isActive: row.is_active,
        createdAt: row.created_at,
    }));

    res.json({
        data: wallets,
        total: countResult.rows[0]?.total || 0,
        page: pageNum,
        limit: limitNum,
    });
}));

/**
 * POST /api/v1/admin/crypto/wallets/save
 * Save a crypto wallet address for a payment account.
 * Used from the PaymentSettings UI to configure crypto receiving address.
 */
router.post('/crypto/wallets/save', asyncHandler(async (req: Request, res: Response) => {
    const { entityType, entityId, walletAddress } = req.body;

    if (!entityType || !entityId || !walletAddress) {
        return res.status(400).json({ error: 'entityType, entityId, and walletAddress are required' });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address. Must be a valid Ethereum/Polygon address (0x...)' });
    }

    // Upsert: update existing payment_account row if one exists for this entity
    const upsertResult = await pool.query(`
        INSERT INTO payment_accounts (id, entity_type, entity_id, crypto_wallet_address, crypto_wallet_registered_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
        ON CONFLICT (entity_type, entity_id) DO UPDATE SET
            crypto_wallet_address = $3,
            crypto_wallet_registered_at = NOW(),
            updated_at = NOW()
        RETURNING id, entity_type, entity_id, crypto_wallet_address, crypto_wallet_verified, crypto_wallet_registered_at
    `, [entityType, entityId, walletAddress]);

    const row = upsertResult.rows[0];

    // If crypto payment service is configured, also register on-chain
    let onChainRegistered = false;
    if (cryptoPaymentService.isConfigured()) {
        try {
            await cryptoPaymentService.registerRecipientWallet(entityType, entityId, walletAddress);
            onChainRegistered = true;
            // Mark as verified since on-chain registration succeeded
            await pool.query(`
                UPDATE payment_accounts SET crypto_wallet_verified = true WHERE id = $1
            `, [row.id]);
        } catch (err: any) {
            logger.warn('On-chain wallet registration failed (will retry later)', {
                entityType, entityId, walletAddress, error: err.message,
            });
        }
    }

    logger.info('Crypto wallet saved', {
        entityType, entityId, walletAddress, onChainRegistered,
    });

    res.json({
        success: true,
        data: {
            id: row.id,
            entityType: row.entity_type,
            entityId: row.entity_id,
            walletAddress: row.crypto_wallet_address,
            isVerified: onChainRegistered || row.crypto_wallet_verified,
            registeredAt: row.crypto_wallet_registered_at,
        },
    });
}));

/**
 * GET /api/v1/admin/crypto/wallets/:entityType/:entityId
 * Get the crypto wallet for a specific entity (from DB).
 */
router.get('/crypto/wallets/:entityType/:entityId', asyncHandler(async (req: Request, res: Response) => {
    const { entityType, entityId } = req.params;

    const result = await pool.query(`
        SELECT 
            pa.crypto_wallet_address,
            pa.crypto_wallet_verified,
            pa.crypto_wallet_registered_at
        FROM payment_accounts pa
        WHERE pa.entity_type = $1 AND pa.entity_id = $2
    `, [entityType, entityId]);

    if (result.rows.length === 0 || !result.rows[0].crypto_wallet_address) {
        return res.json({ configured: false });
    }

    const row = result.rows[0];
    res.json({
        configured: true,
        walletAddress: row.crypto_wallet_address,
        isVerified: row.crypto_wallet_verified,
        registeredAt: row.crypto_wallet_registered_at,
    });
}));

// =====================================================
// PLATFORM WALLET & TOKEN MANAGEMENT
// =====================================================

/**
 * GET /api/v1/admin/crypto/platform-config
 * Get platform wallet address, settlement preference, and accepted tokens.
 */
router.get('/crypto/platform-config', asyncHandler(async (req: Request, res: Response) => {
    try {
        // Always try to load on-chain data if configured
        let platformWallet: string | null = null;
        let acceptedTokens: any[] = [];
        let isMultiToken = false;

        if (cryptoPaymentService.isConfigured()) {
            try {
                [platformWallet, acceptedTokens, isMultiToken] = await Promise.all([
                    cryptoPaymentService.getPlatformWallet(),
                    cryptoPaymentService.getAcceptedTokens(),
                    cryptoPaymentService.isMultiTokenContract(),
                ]);
            } catch (err: any) {
                logger.warn({ err: err.message }, 'Could not read on-chain data, continuing with DB-only config');
            }
        }

        const config = loadCryptoConfig();

        // Load settlement preference from DB
        const settingsResult = await pool.query(
            `SELECT setting_value, updated_at FROM platform_settings WHERE setting_key = 'platform_settlement_wallet'`
        );
        const settlement = settingsResult.rows.length > 0
            ? { ...settingsResult.rows[0].setting_value, updatedAt: settingsResult.rows[0].updated_at }
            : { configured: false };

        res.json({
            platformWallet,
            acceptedTokens,
            contractAddress: config?.contractAddress,
            chainId: config?.chainId,
            isMultiToken,
            contractVersion: isMultiToken ? 'v2' : 'v1',
            settlement,
        });
    } catch (err: any) {
        logger.error({ err }, 'Failed to read platform config');
        res.status(500).json({ error: err.message || 'Failed to read platform config' });
    }
}));

/**
 * GET /api/v1/admin/crypto/platform-settlement
 * Get the platform's settlement wallet preference (coin type + address).
 */
router.get('/crypto/platform-settlement', asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
        `SELECT setting_value, updated_at FROM platform_settings WHERE setting_key = 'platform_settlement_wallet'`
    );

    if (result.rows.length === 0 || !result.rows[0].setting_value?.configured) {
        return res.json({
            configured: false,
            coinSymbol: null,
            chain: null,
            walletAddress: null,
            useNowPayments: false,
        });
    }

    const val = result.rows[0].setting_value;
    res.json({
        configured: val.configured,
        coinSymbol: val.coinSymbol,
        chain: val.chain,
        walletAddress: val.walletAddress,
        useNowPayments: val.useNowPayments,
        updatedAt: result.rows[0].updated_at,
    });
}));

/**
 * PUT /api/v1/admin/crypto/platform-settlement
 * Save the platform's preferred fee collection wallet.
 * Admin selects coin type (BTC, ETH, USDT, etc.) and enters wallet address.
 * Body: { coinSymbol, chain, walletAddress }
 *
 * - For EVM-native coins on Polygon: also updates the on-chain propmetrikWallet
 *   and calls setPlatformPreferredToken on the contract.
 * - For off-chain coins (BTC, ETH mainnet, SOL, etc.): saves to DB for
 *   NOWPayments settlement routing.
 */
router.put('/crypto/platform-settlement', asyncHandler(async (req: Request, res: Response) => {
    const { coinSymbol, chain, walletAddress } = req.body;

    if (!coinSymbol || !chain || !walletAddress) {
        return res.status(400).json({ error: 'coinSymbol, chain, and walletAddress are required' });
    }

    // Validate coin is supported
    const coinResult = await pool.query(
        `SELECT * FROM supported_settlement_coins WHERE coin_symbol = $1 AND chain = $2 AND is_enabled = TRUE`,
        [coinSymbol.toLowerCase(), chain.toLowerCase()]
    );
    if (coinResult.rows.length === 0) {
        return res.status(400).json({ error: `Unsupported coin: ${coinSymbol} on ${chain}` });
    }

    const coin = coinResult.rows[0];
    const isEvmNative = coin.is_evm_native;

    // Validate address format
    if (coin.address_regex) {
        const regex = new RegExp(coin.address_regex);
        if (!regex.test(walletAddress)) {
            return res.status(400).json({ error: `Invalid ${coin.coin_name} address format` });
        }
    }

    // Validate via NOWPayments if off-chain coin
    if (!isEvmNative && nowPaymentsService.isConfigured()) {
        try {
            const ticker = await nowPaymentsService.getNowPaymentsTicker(coinSymbol, chain);
            if (ticker) {
                const valid = await nowPaymentsService.validateSettlementAddress(walletAddress, ticker);
                if (!valid) {
                    return res.status(400).json({ error: `Address validation failed for ${coinSymbol}` });
                }
            }
        } catch (err: any) {
            logger.warn({ err: err.message }, 'NOWPayments address validation failed, proceeding');
        }
    }

    // If EVM-native and contract is configured, update on-chain wallet + preferred token
    let txHash: string | null = null;
    let preferredTokenTxHash: string | null = null;

    if (isEvmNative && cryptoPaymentService.isConfigured()) {
        try {
            // Update the platform wallet address on-chain
            const walletResult = await cryptoPaymentService.updatePlatformWallet(walletAddress);
            txHash = walletResult.txHash;
            logger.info({ txHash, walletAddress }, 'Platform wallet updated on-chain');

            // Set the platform preferred token for auto-conversion
            // Find the token address from accepted tokens on-chain
            const acceptedTokens = await cryptoPaymentService.getAcceptedTokens();
            const matchingToken = acceptedTokens.find(t =>
                t.symbol.toLowerCase() === coinSymbol.toLowerCase() && t.enabled
            );
            if (matchingToken) {
                try {
                    const contractWithSigner = (cryptoPaymentService as any).contract!.connect(
                        (cryptoPaymentService as any).adminSigner
                    ) as any;
                    const ptTx = await contractWithSigner.setPlatformPreferredToken(matchingToken.address);
                    const ptReceipt = await ptTx.wait(1);
                    preferredTokenTxHash = ptReceipt.hash;
                    logger.info({ preferredTokenTxHash, tokenAddress: matchingToken.address, symbol: coinSymbol },
                        'Platform preferred token set on-chain');
                } catch (err: any) {
                    logger.warn({ err: err.message }, 'Failed to set platform preferred token on-chain (contract may not support it yet)');
                }
            }
        } catch (err: any) {
            logger.error({ err }, 'Failed to update platform wallet on-chain');
            return res.status(500).json({ error: `On-chain update failed: ${err.message}` });
        }
    }

    // Save to DB
    await pool.query(`
        INSERT INTO platform_settings (setting_key, setting_value, updated_at)
        VALUES ('platform_settlement_wallet', $1::jsonb, NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = $1::jsonb, updated_at = NOW()
    `, [JSON.stringify({
        configured: true,
        coinSymbol: coinSymbol.toLowerCase(),
        chain: chain.toLowerCase(),
        walletAddress,
        useNowPayments: !isEvmNative,
        coinName: coin.coin_name,
    })]);

    logger.info({
        coinSymbol, chain, walletAddress, isEvmNative, txHash, preferredTokenTxHash,
    }, 'Platform settlement wallet configured');

    res.json({
        success: true,
        configured: true,
        coinSymbol: coinSymbol.toLowerCase(),
        chain: chain.toLowerCase(),
        walletAddress,
        useNowPayments: !isEvmNative,
        coinName: coin.coin_name,
        txHash,
        preferredTokenTxHash,
    });
}));

/**
 * PUT /api/v1/admin/crypto/platform-wallet
 * Legacy: Update just the on-chain platform wallet address.
 * Body: { walletAddress }
 */
router.put('/crypto/platform-wallet', asyncHandler(async (req: Request, res: Response) => {
    const { walletAddress } = req.body;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Valid EVM wallet address (0x...) is required' });
    }

    if (!cryptoPaymentService.isConfigured()) {
        return res.status(503).json({ error: 'Crypto payment rail is not configured' });
    }

    const result = await cryptoPaymentService.updatePlatformWallet(walletAddress);
    res.json({ success: true, txHash: result.txHash, walletAddress });
}));

/**
 * POST /api/v1/admin/crypto/tokens
 * Add a new token to the on-chain allowlist.
 * Body: { tokenAddress, symbol, decimals }
 */
router.post('/crypto/tokens', asyncHandler(async (req: Request, res: Response) => {
    const { tokenAddress, symbol, decimals } = req.body;

    if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        return res.status(400).json({ error: 'Valid token contract address (0x...) is required' });
    }
    if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: 'Token symbol is required' });
    }
    if (decimals === undefined || decimals < 0 || decimals > 18) {
        return res.status(400).json({ error: 'Decimals must be 0-18' });
    }

    if (!cryptoPaymentService.isConfigured()) {
        return res.status(503).json({ error: 'Crypto payment rail is not configured' });
    }

    const result = await cryptoPaymentService.addToken(tokenAddress, symbol, Number(decimals));
    res.json({ success: true, txHash: result.txHash, tokenAddress, symbol, decimals });
}));

/**
 * PUT /api/v1/admin/crypto/tokens/:tokenAddress/toggle
 * Enable or disable a token on the contract.
 * Body: { enabled }
 */
router.put('/crypto/tokens/:tokenAddress/toggle', asyncHandler(async (req: Request, res: Response) => {
    const { tokenAddress } = req.params;
    const { enabled } = req.body;

    if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        return res.status(400).json({ error: 'Valid token contract address is required' });
    }
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    if (!cryptoPaymentService.isConfigured()) {
        return res.status(503).json({ error: 'Crypto payment rail is not configured' });
    }

    const result = await cryptoPaymentService.setTokenEnabled(tokenAddress, enabled);
    res.json({ success: true, txHash: result.txHash, tokenAddress, enabled });
}));

/**
 * DELETE /api/v1/admin/crypto/tokens/:tokenAddress
 * Remove a token from the on-chain allowlist.
 */
router.delete('/crypto/tokens/:tokenAddress', asyncHandler(async (req: Request, res: Response) => {
    const { tokenAddress } = req.params;

    if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        return res.status(400).json({ error: 'Valid token contract address is required' });
    }

    if (!cryptoPaymentService.isConfigured()) {
        return res.status(503).json({ error: 'Crypto payment rail is not configured' });
    }

    const result = await cryptoPaymentService.removeToken(tokenAddress);
    res.json({ success: true, txHash: result.txHash, tokenAddress });
}));

/**
 * POST /api/v1/admin/crypto/fee-calculator
 * Live fee calculation preview for admin dashboard.
 * Given an amount in GHS, returns the fee breakdown for all payment types in both GHS and USDT.
 */
router.post('/crypto/fee-calculator', asyncHandler(async (req: Request, res: Response) => {
    const { amountGHS } = req.body;

    if (!amountGHS || isNaN(parseFloat(amountGHS)) || parseFloat(amountGHS) <= 0) {
        return res.status(400).json({ error: 'amountGHS is required and must be a positive number' });
    }

    const amount = parseFloat(amountGHS);

    // Get fee configs from DB
    const feeResult = await pool.query(`
        SELECT payment_type, fee_mode, percentage_rate, flat_amount, min_fee, max_fee, currency
        FROM fee_configurations
        WHERE is_active = TRUE AND organization_id IS NULL
        ORDER BY payment_type
    `);

    // Get current exchange rate
    let exchangeRate = null;
    try {
        const rateResult = await exchangeRateService.getGHSPerUSD();
        exchangeRate = rateResult;
    } catch {
        // Exchange rate unavailable
    }

    const breakdown = feeResult.rows.map(row => {
        const pctRate = parseFloat(row.percentage_rate);
        const flatAmt = parseFloat(row.flat_amount);
        const minFee = row.min_fee ? parseFloat(row.min_fee) : null;
        const maxFee = row.max_fee ? parseFloat(row.max_fee) : null;

        let fee: number;
        switch (row.fee_mode) {
            case 'max_of':
                fee = Math.max(amount * pctRate, flatAmt);
                break;
            case 'percentage':
                fee = amount * pctRate;
                break;
            case 'flat':
                fee = flatAmt;
                break;
            default:
                fee = amount * pctRate;
        }

        if (minFee !== null) fee = Math.max(fee, minFee);
        if (maxFee !== null) fee = Math.min(fee, maxFee);

        const totalGHS = amount + fee;
        const usdRate = exchangeRate?.ghsPerUsd || null;

        return {
            paymentType: row.payment_type,
            feeMode: row.fee_mode,
            percentageRate: pctRate,
            flatAmount: flatAmt,
            principalGHS: amount,
            feeGHS: Math.round(fee * 100) / 100,
            totalGHS: Math.round(totalGHS * 100) / 100,
            principalUSDT: usdRate ? Math.round((amount / usdRate) * 1e6) / 1e6 : null,
            feeUSDT: usdRate ? Math.round((fee / usdRate) * 1e6) / 1e6 : null,
            totalUSDT: usdRate ? Math.round((totalGHS / usdRate) * 1e6) / 1e6 : null,
            exchangeRate: usdRate,
        };
    });

    res.json({ amountGHS: amount, breakdown, exchangeRateAvailable: !!exchangeRate });
}));

// Error handler
router.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('Admin route error', { error: err.message, stack: err.stack, path: req.path });
    res.status(500).json({ error: 'Internal server error' });
});

export default router;
