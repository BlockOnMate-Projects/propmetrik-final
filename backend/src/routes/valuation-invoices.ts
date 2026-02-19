/**
 * Valuation Invoice Routes
 * Finance Tab — Invoice / Payment System
 *
 * Endpoints:
 * - POST   /                     - Create invoice
 * - GET    /                     - List invoices
 * - GET    /summary              - Get financial summary
 * - GET    /fee-calculator       - Calculate fee preview
 * - GET    /man-day-rates        - Get MWH 2021 rates
 * - GET    /:id                  - Get invoice detail
 * - PUT    /:id                  - Update draft invoice
 * - POST   /:id/send             - Send invoice (Paystack)
 * - POST   /:id/mark-paid        - Record manual payment
 * - POST   /:id/cancel           - Cancel invoice
 * - GET    /:id/receipt           - Get receipt
 * - POST   /webhook/paystack     - Paystack webhook
 */

import { Router, Request, Response } from 'express';
import { valuationInvoiceService, MWH_MAN_DAY_RATES, type FeeModel } from '../services/valuation-engine/valuationInvoiceService';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const router = Router();

/** Extract organization ID from the authenticated user (set by auth middleware) */
function getOrgId(req: Request): string {
    return (req as any).user?.organizationId
        || (req as any).user?.organization_id
        || '00000000-0000-0000-0000-000000000001';
}

// All routes require authentication (except webhook and public pay page)
router.use((req, res, next) => {
    if (req.path === '/webhook/paystack') return next();
    if (req.path.startsWith('/public/')) return next();
    return authenticate(req, res, next);
});

// ============================================================================
// FEE CALCULATOR & RATES
// ============================================================================

/**
 * GET /fee-calculator
 * Calculate fee preview
 */
router.get('/fee-calculator', async (req: Request, res: Response) => {
    try {
        const { feeModel, propertyValue, manDays, flatFee } = req.query;
        const organizationId = getOrgId(req);

        const calculation = await valuationInvoiceService.calculateFee({
            feeModel: (feeModel as FeeModel) || 'percentage_of_value',
            propertyValue: propertyValue ? parseFloat(propertyValue as string) : undefined,
            manDays: manDays ? JSON.parse(manDays as string) : undefined,
            flatFee: flatFee ? parseFloat(flatFee as string) : undefined,
            organizationId,
        });

        res.json({ success: true, data: calculation });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /man-day-rates
 * Get MWH 2021 professional rates
 */
router.get('/man-day-rates', async (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: MWH_MAN_DAY_RATES,
        source: 'Ministry of Works and Housing (MWH) 2021 Schedule',
    });
});

// ============================================================================
// INVOICE CRUD
// ============================================================================

/**
 * POST /
 * Create a new invoice
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrgId(req);
        const createdBy = (req as any).user?.id || req.headers['x-user-id'] as string;

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'Organization ID required' });
        }

        const invoice = await valuationInvoiceService.createInvoice({
            ...req.body,
            organizationId,
            createdBy,
        });

        res.status(201).json({ success: true, data: invoice });
    } catch (error: any) {
        logger.error('Error creating invoice', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /
 * List invoices
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrgId(req);
        const { status, search, limit, offset } = req.query;

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'Organization ID required' });
        }

        const result = await valuationInvoiceService.listInvoices(organizationId, {
            status: status as any,
            search: search as string,
            limit: limit ? parseInt(limit as string) : 50,
            offset: offset ? parseInt(offset as string) : 0,
        });

        res.json({ success: true, ...result });
    } catch (error: any) {
        logger.error('Error listing invoices', { error: error.message });
        res.status(500).json({ success: false, error: 'Failed to list invoices' });
    }
});

/**
 * GET /summary
 * Get financial summary
 */
router.get('/summary', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrgId(req);

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'Organization ID required' });
        }

        const summary = await valuationInvoiceService.getSummary(organizationId);
        res.json({ success: true, data: summary });
    } catch (error: any) {
        logger.error('Error getting summary', { error: error.message });
        res.status(500).json({ success: false, error: 'Failed to get summary' });
    }
});

/**
 * GET /:id
 * Get invoice by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const invoice = await valuationInvoiceService.getById(req.params.id);
        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }
        res.json({ success: true, data: invoice });
    } catch (error: any) {
        res.status(500).json({ success: false, error: 'Failed to get invoice' });
    }
});

/**
 * PUT /:id
 * Update draft invoice
 */
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const invoice = await valuationInvoiceService.updateInvoice(req.params.id, req.body);
        res.json({ success: true, data: invoice });
    } catch (error: any) {
        res.status(error.message.includes('draft') ? 400 : 500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /:id/send
 * Send invoice and generate Paystack link
 */
router.post('/:id/send', async (req: Request, res: Response) => {
    try {
        const invoice = await valuationInvoiceService.sendInvoice(req.params.id);
        res.json({
            success: true,
            data: invoice,
            message: invoice.paymentLink
                ? 'Invoice sent with payment link'
                : 'Invoice marked as sent (Paystack not configured)',
        });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /:id/mark-paid
 * Record manual payment
 */
router.post('/:id/mark-paid', async (req: Request, res: Response) => {
    try {
        const { amount, paymentMethod, paymentReference } = req.body;

        if (!amount || !paymentMethod) {
            return res.status(400).json({ success: false, error: 'amount and paymentMethod are required' });
        }

        const invoice = await valuationInvoiceService.markAsPaid(req.params.id, {
            amount,
            paymentMethod,
            paymentReference: paymentReference || `MANUAL-${Date.now()}`,
        });

        res.json({ success: true, data: invoice });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /:id/cancel
 * Cancel an invoice
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
    try {
        const { reason } = req.body;
        const invoice = await valuationInvoiceService.cancelInvoice(req.params.id, reason || 'Cancelled by user');
        res.json({ success: true, data: invoice });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /:id
 * Permanently delete a draft or cancelled invoice
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrgId(req);
        await valuationInvoiceService.deleteInvoice(req.params.id, organizationId);
        res.json({ success: true, message: 'Invoice deleted' });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /:id/receipt
 * Get receipt for paid invoice
 */
router.get('/:id/receipt', async (req: Request, res: Response) => {
    try {
        const receipt = await valuationInvoiceService.getReceipt(req.params.id);
        if (!receipt) {
            return res.status(404).json({ success: false, error: 'No receipt found for this invoice' });
        }
        res.json({ success: true, data: receipt });
    } catch (error: any) {
        res.status(500).json({ success: false, error: 'Failed to get receipt' });
    }
});

// ============================================================================
// PUBLIC ENDPOINTS (no auth required — for client payment page)
// ============================================================================

/**
 * GET /public/invoice/:id
 * Fetch invoice details for the client-facing payment page.
 * Returns limited info (no internal IDs beyond what the client needs).
 */
router.get('/public/invoice/:id', async (req: Request, res: Response) => {
    try {
        const invoice = await valuationInvoiceService.getById(req.params.id);
        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        // Only expose what the client needs to see
        res.json({
            success: true,
            data: {
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                clientName: invoice.clientName,
                clientEmail: invoice.clientEmail,
                feeModel: invoice.feeModel,
                propertyAddress: invoice.propertyAddress,
                lineItems: invoice.lineItems,
                subtotal: invoice.subtotal,
                platformFee: invoice.platformFee,
                totalAmount: invoice.totalAmount,
                currency: invoice.currency || 'GHS',
                status: invoice.status,
                invoiceDate: invoice.invoiceDate,
                dueDate: invoice.dueDate,
                paymentLink: invoice.paymentLink,
                paystackAccessCode: invoice.paystackAccessCode,
                paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
                paidAt: invoice.paidAt,
                notes: invoice.notes,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: 'Failed to fetch invoice' });
    }
});

/**
 * GET /public/crypto/settlement-coins
 * Get all supported crypto coins for payment (on-chain + NOWPayments).
 * Mirrors tenant-portal settlement-coins endpoint — no auth required.
 */
router.get('/public/crypto/settlement-coins', async (req: Request, res: Response) => {
    try {
        const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');

        // Get on-chain (Polygon) coins from DB
        const dbCoins = await nowPaymentsService.getSupportedSettlementCoins();
        const dbCoinsNormalized = dbCoins.map((c: any) => ({
            ...c,
            display_name: c.display_name || c.coin_name || c.coin_symbol.toUpperCase(),
        }));
        const onChainCoins = dbCoinsNormalized.filter((c: any) => c.is_evm_native);

        // Get all available NOWPayments currencies dynamically
        let nowPaymentsCoins: any[] = [];
        try {
            if (nowPaymentsService.isConfigured()) {
                const allCurrencies = await nowPaymentsService.getAvailableCurrencies();
                const onChainSymbols = new Set(onChainCoins.map((c: any) => c.coin_symbol));
                const NP_LOGO_BASE = 'https://nowpayments.io';
                nowPaymentsCoins = allCurrencies
                    .filter((c: any) => c.available_for_payment !== false && !onChainSymbols.has((c.code || c.currency || '').toLowerCase()))
                    .map((c: any) => {
                        const symbol = (c.code || c.currency || '').toLowerCase();
                        const ticker = c.ticker || symbol;
                        return {
                            id: `np-${symbol}-${c.network || 'default'}`,
                            coin_symbol: ticker,
                            coin_name: c.name || symbol.toUpperCase(),
                            display_name: c.name || symbol.toUpperCase(),
                            chain: c.network || ticker,
                            nowpayments_ticker: symbol,
                            is_evm_native: false,
                            is_enabled: true,
                            logo_url: c.logo_url ? `${NP_LOGO_BASE}${c.logo_url}` : null,
                            is_popular: c.is_popular || false,
                            is_stable: c.is_stable || false,
                        };
                    });
                nowPaymentsCoins.sort((a: any, b: any) => {
                    if (a.is_popular !== b.is_popular) return a.is_popular ? -1 : 1;
                    if (a.is_stable !== b.is_stable) return a.is_stable ? -1 : 1;
                    return a.coin_name.localeCompare(b.coin_name);
                });
            }
        } catch (err: any) {
            logger.warn('Failed to fetch NOWPayments currencies for invoice crypto:', err.message);
        }

        res.json({ coins: [...onChainCoins, ...nowPaymentsCoins] });
    } catch (error: any) {
        logger.error('Error fetching settlement coins for invoice', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch settlement coins' });
    }
});

/**
 * GET /public/crypto/estimate
 * Get estimated conversion amount for a coin before paying an invoice.
 * Query: amount (GHS), payCurrency, payChain, invoiceId
 */
router.get('/public/crypto/estimate', async (req: Request, res: Response) => {
    try {
        const { amount, payCurrency, invoiceId } = req.query;
        if (!amount || !payCurrency) {
            return res.status(400).json({ error: 'amount and payCurrency are required' });
        }

        const { exchangeRateService } = await import('../../shared-services/payments/crypto');
        const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');

        const amountGhs = parseFloat(amount as string);
        const ticker = (payCurrency as string).toLowerCase();

        // For invoices, the platform fee is already included in the totalAmount,
        // so we just convert the full amount to USD → crypto
        const usdAmount = await exchangeRateService.convertGhsToUsd(amountGhs);

        try {
            const estimate = await nowPaymentsService.getEstimate(usdAmount, 'usd', ticker);
            const minAmount = await nowPaymentsService.getMinimumAmount(ticker, 'usd');

            res.json({
                amountGhs,
                amountUsd: usdAmount,
                platformFeeGhs: 0,
                platformFeeUsd: 0,
                totalChargeGhs: amountGhs,
                totalChargeUsd: usdAmount,
                feeDescription: 'Platform fee included in invoice total',
                payCurrency: ticker,
                estimatedPayAmount: estimate.estimated_amount,
                minimumPayAmount: minAmount.min_amount,
                isBelowMinimum: estimate.estimated_amount < minAmount.min_amount,
            });
        } catch (err: any) {
            res.json({
                amountGhs,
                amountUsd: usdAmount,
                totalChargeGhs: amountGhs,
                totalChargeUsd: usdAmount,
                payCurrency: ticker,
                error: err.message,
            });
        }
    } catch (error: any) {
        logger.error('Error getting crypto estimate for invoice', { error: error.message });
        res.status(500).json({ error: 'Failed to get estimate' });
    }
});

/**
 * POST /public/invoice/:id/initiate-crypto
 * Initialize a NOWPayments crypto payment for an invoice.
 * Body: { payCurrency: string, payChain: string }
 */
router.post('/public/invoice/:id/initiate-crypto', async (req: Request, res: Response) => {
    try {
        const invoice = await valuationInvoiceService.getById(req.params.id);
        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }
        if (invoice.status === 'paid') {
            return res.status(400).json({ success: false, error: 'Invoice is already paid' });
        }

        const { payCurrency, payChain } = req.body;
        if (!payCurrency) {
            return res.status(400).json({ success: false, error: 'payCurrency is required' });
        }

        const { exchangeRateService } = await import('../../shared-services/payments/crypto');
        const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');
        const { pool } = await import('../database');

        // Convert invoice total GHS → USD for NOWPayments
        const usdAmount = await exchangeRateService.convertGhsToUsd(invoice.totalAmount);
        const ticker = payCurrency.toLowerCase();

        // Generate a unique reference for this crypto payment
        const reference = `PM-INV-CRYPTO-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        const frontendUrl = process.env.FRONTEND_URL || 'https://app.propmetrik.com';

        // Create NOWPayments payment
        const npResult = await nowPaymentsService.createPayment({
            priceAmount: usdAmount,
            priceCurrency: 'usd',
            payCurrency: ticker,
            orderId: reference,
            orderDescription: `Invoice ${invoice.invoiceNumber} — ${invoice.clientName}`,
            ipnCallbackUrl: `${process.env.API_URL || 'https://api.propmetrik.com'}/api/v1/valuation-invoices/webhook/nowpayments-ipn`,
            successUrl: `${frontendUrl}/payment/invoice?id=${invoice.id}&status=success`,
            cancelUrl: `${frontendUrl}/payment/invoice?id=${invoice.id}`,
        });

        // Update the nowpayments_payments record with invoice context
        // (The base record is already created by nowPaymentsService.createPayment → recordPaymentCreated)
        try {
            await pool.query(`
                UPDATE nowpayments_payments SET
                    domain_record_type = $1,
                    domain_record_id = $2,
                    updated_at = NOW()
                WHERE nowpayments_id = $3
            `, [
                'valuation_invoice',
                invoice.id,
                npResult.payment_id,
            ]);
        } catch (dbErr: any) {
            logger.warn('Failed to record NOWPayments payment in DB (non-blocking):', dbErr.message);
        }

        // Record in payment_transactions ledger
        try {
            await pool.query(`
                INSERT INTO payment_transactions (
                    reference, payment_type, domain_record_type,
                    entity_id, entity_type,
                    gross_amount_pesewas, principal_amount_pesewas, service_fee_pesewas,
                    currency, channel, status,
                    payer_email,
                    metadata, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            `, [
                reference,
                'valuation',
                'valuation_invoice_payment',
                invoice.id,
                'valuation_invoice',
                Math.round(invoice.totalAmount * 100),
                Math.round(invoice.subtotal * 100),
                Math.round((invoice.platformFee || 0) * 100),
                'GHS',
                `crypto_${ticker}`,
                'pending',
                invoice.clientEmail,
                JSON.stringify({
                    invoice_id: invoice.id,
                    invoice_number: invoice.invoiceNumber,
                    pay_currency: ticker,
                    pay_chain: payChain,
                    usd_amount: usdAmount,
                    nowpayments_id: npResult.payment_id,
                }),
            ]);
        } catch (dbErr: any) {
            logger.warn('Failed to record payment transaction (non-blocking):', dbErr.message);
        }

        res.json({
            success: true,
            data: {
                route: 'nowpayments',
                paymentId: npResult.payment_id,
                depositAddress: npResult.pay_address,
                payAmount: npResult.pay_amount,
                payCurrency: npResult.pay_currency,
                priceAmountUsd: usdAmount,
                outcomeCurrency: npResult.outcome_currency || null,
                expiresAt: npResult.expiration_estimate_date || null,
                status: npResult.payment_status || 'waiting',
                paymentReference: reference,
            },
        });
    } catch (error: any) {
        logger.error('Error initiating crypto payment for invoice', { error: error.message });
        res.status(500).json({ success: false, error: 'Failed to initiate crypto payment' });
    }
});

/**
 * GET /public/crypto/nowpayments-status/:paymentId
 * Poll NOWPayments payment status for an invoice crypto payment.
 * Also syncs status to DB and marks invoice as paid when finished.
 */
router.get('/public/crypto/nowpayments-status/:paymentId', async (req: Request, res: Response) => {
    try {
        const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');
        const { pool } = await import('../database');
        const paymentId = parseInt(req.params.paymentId, 10);

        if (isNaN(paymentId)) {
            return res.status(400).json({ error: 'Invalid paymentId' });
        }

        const status = await nowPaymentsService.getPaymentStatus(paymentId);

        // Sync status back to DB
        try {
            await pool.query(`
                UPDATE nowpayments_payments SET
                    status = $1,
                    actually_paid = COALESCE($2, actually_paid),
                    outcome_amount = COALESCE($3, outcome_amount),
                    outcome_currency = COALESCE($4, outcome_currency),
                    updated_at = NOW()
                WHERE nowpayments_id = $5
            `, [
                status.payment_status,
                status.actually_paid || null,
                status.outcome_amount || null,
                status.outcome_currency || null,
                paymentId,
            ]);

            // If finished/confirmed, mark invoice as paid
            if (status.payment_status === 'finished' || status.payment_status === 'confirmed') {
                const npRow = await pool.query(
                    `SELECT payment_reference, domain_record_type, domain_record_id FROM nowpayments_payments WHERE nowpayments_id = $1`,
                    [paymentId]
                );
                if (npRow.rows.length > 0) {
                    const paymentRef = npRow.rows[0].payment_reference;
                    const invoiceId = npRow.rows[0].domain_record_id;

                    // Update payment_transactions ledger
                    await pool.query(
                        `UPDATE payment_transactions SET status = 'success', verified_at = NOW() WHERE reference = $1 AND status = 'pending'`,
                        [paymentRef]
                    );

                    // Mark nowpayments_payments as settled
                    await pool.query(
                        `UPDATE nowpayments_payments SET settled_at = COALESCE(settled_at, NOW()) WHERE nowpayments_id = $1`,
                        [paymentId]
                    );

                    // Mark the invoice as paid
                    if (invoiceId && npRow.rows[0].domain_record_type === 'valuation_invoice') {
                        await pool.query(
                            `UPDATE valuation_invoices SET status = 'paid', paid_at = NOW(), payment_reference = $1 WHERE id = $2 AND status != 'paid'`,
                            [paymentRef, invoiceId]
                        );
                        logger.info('Crypto polling: invoice marked as paid', { invoiceId, paymentRef, paymentId });
                    }
                }
            } else if (status.payment_status === 'failed' || status.payment_status === 'expired' || status.payment_status === 'refunded') {
                const npRow = await pool.query(
                    `SELECT payment_reference FROM nowpayments_payments WHERE nowpayments_id = $1`,
                    [paymentId]
                );
                if (npRow.rows.length > 0) {
                    const txStatus = status.payment_status === 'refunded' ? 'refunded' : 'failed';
                    await pool.query(
                        `UPDATE payment_transactions SET status = $1 WHERE reference = $2 AND status = 'pending'`,
                        [txStatus, npRow.rows[0].payment_reference]
                    );
                }
            }
        } catch (syncErr: any) {
            logger.error('Failed to sync NOWPayments invoice status to DB:', syncErr.message);
        }

        res.json({
            paymentId: status.payment_id,
            status: status.payment_status,
            actuallyPaid: status.actually_paid,
            payAmount: status.pay_amount,
            payCurrency: status.pay_currency,
            outcomeAmount: status.outcome_amount,
            outcomeCurrency: status.outcome_currency,
            updatedAt: status.updated_at,
        });
    } catch (error: any) {
        logger.error('Error polling NOWPayments status for invoice', { error: error.message });
        res.status(500).json({ error: 'Failed to get payment status' });
    }
});

/**
 * GET /public/invoice/:id/verify-payment/:reference
 * Verify a Paystack payment after inline checkout completion.
 * Called by the frontend inline callback — no auth required.
 */
router.get('/public/invoice/:id/verify-payment/:reference', async (req: Request, res: Response) => {
    try {
        const { id: invoiceId, reference } = req.params;
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) {
            return res.status(500).json({ success: false, error: 'Payment verification unavailable' });
        }

        // Verify transaction with Paystack
        const axios = (await import('axios')).default;
        const verifyRes = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            headers: { Authorization: `Bearer ${secret}` },
        });
        const verifyData = verifyRes.data;

        if (!verifyData.status || verifyData.data?.status !== 'success') {
            return res.json({ success: false, error: 'Payment not confirmed', paystackStatus: verifyData.data?.status });
        }

        // Try webhook lookup by reference first (matches server-initialized payments)
        let result = await valuationInvoiceService.handlePaymentWebhook(reference, verifyData.data);

        // If not found by reference (inline newTransaction creates a new reference),
        // process directly using the invoice ID from the URL
        if (!result) {
            result = await valuationInvoiceService.processInlinePayment(invoiceId, reference, verifyData.data);
        }

        if (!result) {
            return res.json({ success: false, error: 'Invoice not found' });
        }

        res.json({ success: true, status: 'paid', invoiceId: result.id });
    } catch (error: any) {
        logger.error('Error verifying inline payment', { error: error.message });
        res.status(500).json({ success: false, error: 'Verification failed' });
    }
});

// ============================================================================
// PAYSTACK WEBHOOK
// ============================================================================

/**
 * POST /webhook/paystack
 * Handle Paystack payment webhook
 */
router.post('/webhook/paystack', async (req: Request, res: Response) => {
    try {
        // Verify Paystack signature
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (secret) {
            const hash = crypto
                .createHmac('sha512', secret)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (hash !== req.headers['x-paystack-signature']) {
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        const { event, data } = req.body;

        if (event === 'charge.success') {
            await valuationInvoiceService.handlePaymentWebhook(data.reference, data);
            logger.info('Paystack webhook processed', { reference: data.reference });
        }

        res.sendStatus(200);
    } catch (error: any) {
        logger.error('Paystack webhook error', { error: error.message });
        res.sendStatus(200); // Always return 200 to Paystack
    }
});

// ============================================================================
// NOWPAYMENTS IPN WEBHOOK
// ============================================================================

/**
 * POST /webhook/nowpayments-ipn
 * Instant Payment Notification from NOWPayments for invoice crypto payments.
 * NOWPayments sends IPNs when payment status changes:
 *   waiting → confirming → confirmed → sending → finished
 *   waiting → failed / expired / refunded
 *
 * This is the reliability safety net — even if the user closes the browser,
 * the IPN ensures the invoice gets marked as paid.
 */
router.post('/webhook/nowpayments-ipn', async (req: Request, res: Response) => {
    try {
        const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');
        const { pool } = await import('../database');

        // 1. Verify IPN signature
        const signature = req.headers['x-nowpayments-sig'] as string;
        const isSandbox = process.env.NOWPAYMENTS_SANDBOX === 'true';

        if (!signature) {
            logger.warn('NOWPayments invoice IPN: missing x-nowpayments-sig header');
            if (!isSandbox) {
                return res.status(400).json({ error: 'Missing IPN signature' });
            }
            logger.warn('NOWPayments invoice IPN: proceeding without signature (sandbox mode)');
        } else {
            const isValid = nowPaymentsService.verifyIpnSignature(req.body, signature);
            if (!isValid) {
                logger.error('NOWPayments invoice IPN: INVALID signature', {
                    paymentId: req.body?.payment_id,
                    orderId: req.body?.order_id,
                });
                return res.status(403).json({ error: 'Invalid IPN signature' });
            }
        }

        // 2. Extract payload
        const payload = req.body;
        const paymentId = payload.payment_id;
        const paymentStatus = payload.payment_status;

        logger.info('NOWPayments invoice IPN received', {
            paymentId,
            status: paymentStatus,
            orderId: payload.order_id,
            actuallyPaid: payload.actually_paid,
            outcomeAmount: payload.outcome_amount,
        });

        // 3. Update nowpayments_payments table
        await pool.query(`
            UPDATE nowpayments_payments SET
                status = $1,
                actually_paid = COALESCE($2, actually_paid),
                outcome_amount = COALESCE($3, outcome_amount),
                outcome_currency = COALESCE($4, outcome_currency),
                updated_at = NOW()
            WHERE nowpayments_id = $5
        `, [
            paymentStatus,
            payload.actually_paid || null,
            payload.outcome_amount || null,
            payload.outcome_currency || null,
            paymentId,
        ]);

        // 4. If finished/confirmed, mark invoice as paid
        if (paymentStatus === 'finished' || paymentStatus === 'confirmed') {
            const npRow = await pool.query(
                `SELECT payment_reference, domain_record_type, domain_record_id FROM nowpayments_payments WHERE nowpayments_id = $1`,
                [paymentId]
            );

            if (npRow.rows.length > 0) {
                const paymentRef = npRow.rows[0].payment_reference;
                const invoiceId = npRow.rows[0].domain_record_id;

                // Update payment_transactions ledger
                await pool.query(
                    `UPDATE payment_transactions SET status = 'success', verified_at = NOW() WHERE reference = $1 AND status = 'pending'`,
                    [paymentRef]
                );

                // Mark nowpayments_payments as settled
                await pool.query(
                    `UPDATE nowpayments_payments SET settled_at = COALESCE(settled_at, NOW()) WHERE nowpayments_id = $1`,
                    [paymentId]
                );

                // Mark the invoice as paid
                if (invoiceId && npRow.rows[0].domain_record_type === 'valuation_invoice') {
                    await pool.query(
                        `UPDATE valuation_invoices SET status = 'paid', paid_at = NOW(), payment_reference = $1 WHERE id = $2 AND status != 'paid'`,
                        [paymentRef, invoiceId]
                    );
                    logger.info('NOWPayments IPN: invoice marked as paid', {
                        invoiceId,
                        paymentRef,
                        paymentId,
                    });
                }
            }
        } else if (['failed', 'expired', 'refunded'].includes(paymentStatus)) {
            const npRow = await pool.query(
                `SELECT payment_reference FROM nowpayments_payments WHERE nowpayments_id = $1`,
                [paymentId]
            );
            if (npRow.rows.length > 0) {
                const txStatus = paymentStatus === 'refunded' ? 'refunded' : 'failed';
                await pool.query(
                    `UPDATE payment_transactions SET status = $1 WHERE reference = $2 AND status = 'pending'`,
                    [txStatus, npRow.rows[0].payment_reference]
                );
            }
        }

        // Always return 200 (NOWPayments retries on non-200)
        res.status(200).json({ status: 'ok' });
    } catch (error: any) {
        logger.error('NOWPayments invoice IPN error', {
            error: error.message,
            stack: error.stack,
        });
        // Still return 200 to prevent retries on our app errors
        res.status(200).json({ status: 'error', message: error.message });
    }
});

// ============================================================================
// PAYMENT ACCOUNT CONFIGURATION
// (Bank/MoMo + Paystack subaccount + crypto wallet — mirrors PM/CRM/Projects)
// ============================================================================

/**
 * GET /payments/account
 * Get current payout account config for the organization
 */
router.get('/payments/account', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrgId(req);
        const { pool } = await import('../database');

        const result = await pool.query(
            `SELECT * FROM payment_accounts
             WHERE entity_id = $1 AND entity_type = 'organization' AND is_active = TRUE
             LIMIT 1`,
            [organizationId]
        );

        if (result.rows.length === 0) {
            return res.json({ configured: false });
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
            platformFeePercentage: parseFloat(row.platform_fee_percentage || 0.025) * 100,
            platformFeeFlat: parseFloat(row.platform_fee_flat || 0),
            isVerified: row.is_verified,
            verifiedAt: row.verified_at,
            createdAt: row.created_at,
        });
    } catch (error: any) {
        logger.error('Error fetching payment account', { error: error.message });
        res.status(500).json({ error: 'Failed to get payment account' });
    }
});

/**
 * GET /payments/banks
 * Get list of supported banks for payout setup
 */
router.get('/payments/banks', async (_req: Request, res: Response) => {
    try {
        const { paystackService } = await import('../services/property-management/payment/paystackService');
        const banks = await paystackService.getBanks('ghana');
        res.json(banks);
    } catch (error: any) {
        logger.error('Error fetching banks', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch banks' });
    }
});

/**
 * POST /payments/register-account
 * Register or update the organization's bank/MoMo account for payouts.
 * Creates a Paystack sub-account so payment splits happen automatically.
 */
router.post('/payments/register-account', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrgId(req);
        const { bankCode, accountNumber, businessName, contactEmail, contactPhone } = req.body;

        if (!bankCode || !accountNumber || !businessName) {
            return res.status(400).json({ error: 'bankCode, accountNumber, and businessName are required' });
        }

        const { paystackService } = await import('../services/property-management/payment/paystackService');
        const result = await paystackService.registerPropertyManagerAccount(
            organizationId, bankCode, accountNumber, businessName, contactEmail, contactPhone
        );

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        res.json({ success: true, subaccountCode: result.subaccountCode });
    } catch (error: any) {
        logger.error('Error registering payment account', { error: error.message });
        res.status(500).json({ error: 'Failed to register account' });
    }
});

/**
 * POST /payments/resolve-account
 * Verify a bank account number (name enquiry via Paystack)
 */
router.post('/payments/resolve-account', async (req: Request, res: Response) => {
    try {
        const { accountNumber, bankCode } = req.body;

        if (!accountNumber || !bankCode) {
            return res.status(400).json({ error: 'accountNumber and bankCode are required' });
        }

        const { paystackService } = await import('../services/property-management/payment/paystackService');
        const result = await paystackService.resolveAccount(accountNumber, bankCode);
        res.json(result);
    } catch (err: any) {
        const status = err.status || 422;
        res.status(status).json({
            status: false,
            error: err.paystackMessage || err.message || 'Account verification failed',
        });
    }
});

/**
 * GET /payments/crypto-wallet
 * Get current crypto wallet configuration
 */
router.get('/payments/crypto-wallet', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrgId(req);
        const { pool } = await import('../database');

        const result = await pool.query(
            `SELECT crypto_wallet_address, crypto_wallet_verified, crypto_wallet_registered_at
             FROM payment_accounts
             WHERE entity_id = $1 AND entity_type = 'organization' AND is_active = TRUE
             LIMIT 1`,
            [organizationId]
        );

        if (result.rows.length === 0 || !result.rows[0].crypto_wallet_address) {
            return res.json({ configured: false });
        }

        const row = result.rows[0];
        res.json({
            configured: true,
            walletAddress: row.crypto_wallet_address,
            isVerified: row.crypto_wallet_verified || false,
            registeredAt: row.crypto_wallet_registered_at,
        });
    } catch (error: any) {
        logger.error('Error fetching crypto wallet', { error: error.message });
        res.status(500).json({ error: 'Failed to get crypto wallet' });
    }
});

/**
 * POST /payments/crypto-wallet
 * Save/update crypto wallet address. Registers on-chain if contract is configured.
 */
router.post('/payments/crypto-wallet', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrgId(req);
        const { walletAddress } = req.body;

        if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return res.status(400).json({ error: 'Invalid wallet address. Must be a valid Polygon address (0x + 40 hex chars)' });
        }

        const { pool } = await import('../database');
        const upsertResult = await pool.query(`
            INSERT INTO payment_accounts (id, entity_type, entity_id, crypto_wallet_address, crypto_wallet_registered_at, updated_at, is_active)
            VALUES (gen_random_uuid(), 'organization', $1, $2, NOW(), NOW(), TRUE)
            ON CONFLICT (entity_type, entity_id) DO UPDATE SET
                crypto_wallet_address = $2,
                crypto_wallet_registered_at = NOW(),
                updated_at = NOW()
            RETURNING id, crypto_wallet_address, crypto_wallet_verified, crypto_wallet_registered_at
        `, [organizationId, walletAddress]);

        const row = upsertResult.rows[0];

        // Try on-chain registration (optional — requires contract deployment)
        let onChainRegistered = false;
        try {
            const { cryptoPaymentService } = await import('../../shared-services/payments/crypto');
            if (cryptoPaymentService.isConfigured()) {
                await cryptoPaymentService.registerRecipientWallet('organization', organizationId, walletAddress);
                onChainRegistered = true;
                await pool.query(`UPDATE payment_accounts SET crypto_wallet_verified = true WHERE id = $1`, [row.id]);
            }
        } catch {
            // On-chain registration is optional
        }

        res.json({
            success: true,
            walletAddress: row.crypto_wallet_address,
            isVerified: onChainRegistered || row.crypto_wallet_verified || false,
            registeredAt: row.crypto_wallet_registered_at,
        });
    } catch (error: any) {
        logger.error('Error saving crypto wallet', { error: error.message });
        res.status(500).json({ error: 'Failed to save crypto wallet' });
    }
});

/**
 * GET /payments/settlement-coins
 * Get supported settlement coins for the crypto wallet UI dropdown
 */
router.get('/payments/settlement-coins', async (req: Request, res: Response) => {
    try {
        const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');
        const coins = await nowPaymentsService.getSupportedSettlementCoins();
        res.json(coins);
    } catch (error: any) {
        logger.error('Error fetching settlement coins', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch settlement coins' });
    }
});

export default router;
