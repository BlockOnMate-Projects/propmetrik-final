/**
 * Valuation Invoice Service
 * Finance Tab — Invoice / Payment System
 *
 * Handles:
 * - Ghana fee calculation (percentage-of-value & man-day rates)
 * - Invoice CRUD with professional lifecycle
 * - Paystack payment link generation
 * - Payment webhook processing
 * - Receipt generation
 *
 * @module services/valuation-engine/valuationInvoiceService
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { feeEngine } from '../../../shared-services/payments/feeEngine';
import { notificationService } from '../../../shared-services/notifications/unified';
import { notify, resolveOrgStaff } from '../../../shared-services/notifications/in-mail';

// ============================================================================
// TYPES
// ============================================================================

export type FeeModel = 'percentage_of_value' | 'man_day_rate' | 'flat_fee' | 'hybrid';
export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled' | 'partially_paid';

export interface LineItem {
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    amount: number;
}

export interface FeeCalculation {
    feeModel: FeeModel;
    subtotal: number;
    vatAmount: number;
    nhilAmount: number;
    getfundAmount: number;
    covidLevyAmount: number;
    totalTax: number;
    platformFee: number;
    totalAmount: number;
    lineItems: LineItem[];
    breakdown: string;
}

export interface ValuationInvoice {
    id: string;
    organizationId: string;
    invoiceNumber: string;
    referenceNumber: string | null;
    valuationId: string | null;
    clientName: string;
    clientEmail: string | null;
    clientPhone: string | null;
    clientAddress: string | null;
    clientCompany: string | null;
    clientTin: string | null;
    feeModel: FeeModel;
    propertyAddress: string | null;
    propertyValue: number | null;
    lineItems: LineItem[];
    subtotal: number;
    discountAmount: number;
    discountDescription: string | null;
    vatAmount: number;
    nhilAmount: number;
    getfundAmount: number;
    covidLevyAmount: number;
    totalTax: number;
    totalAmount: number;
    platformFee: number;
    currency: string;
    status: InvoiceStatus;
    invoiceDate: string;
    dueDate: string | null;
    paystackReference: string | null;
    paystackAccessCode: string | null;
    paymentLink: string | null;
    paymentChannel: string | null;
    paidAt: string | null;
    paidAmount: number | null;
    paymentReference: string | null;
    notes: string | null;
    termsAndConditions: string | null;
    sentAt: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateInvoiceInput {
    organizationId: string;
    valuationId?: string;
    clientId?: string;
    clientName: string;
    clientEmail?: string;
    clientPhone?: string;
    clientAddress?: string;
    clientCompany?: string;
    clientTin?: string;
    feeModel: FeeModel;
    propertyAddress?: string;
    propertyValue?: number;
    lineItems: LineItem[];
    discountAmount?: number;
    discountDescription?: string;
    invoiceDate?: string;
    dueDate?: string;
    notes?: string;
    termsAndConditions?: string;
    createdBy?: string;
}

export interface InvoiceSummary {
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
    totalOverdue: number;
    invoiceCount: number;
    paidCount: number;
    overdueCount: number;
}

// Ghana MWH 2021 Man-Day Rates
export const MWH_MAN_DAY_RATES: Record<string, { label: string; dailyRate: number }> = {
    project_director: { label: 'Project Director', dailyRate: 2859.80 },
    senior_consultant: { label: 'Senior Consultant', dailyRate: 2757.29 },
    consultant: { label: 'Consultant', dailyRate: 2143.46 },
    assistant_consultant: { label: 'Assistant Consultant', dailyRate: 1733.89 },
    technical_officer: { label: 'Technical Officer', dailyRate: 1426.27 },
    senior_technician: { label: 'Senior Technician', dailyRate: 1222.11 },
    technician: { label: 'Technician', dailyRate: 1018.40 },
    craftsman: { label: 'Craftsman', dailyRate: 814.70 },
    survey_assistant: { label: 'Survey Assistant', dailyRate: 611.00 },
    labourer: { label: 'Labourer', dailyRate: 407.29 },
};

// Platform processing fee — uses centralized FeeEngine (fee_configurations table)
// Default: 2.5% for valuation, configurable per-org via admin API

// ============================================================================
// SERVICE
// ============================================================================

class ValuationInvoiceService {

    /**
     * Calculate valuation fee based on model
     * Uses centralized FeeEngine for platform fee (consistent with rent/deal/project)
     */
    async calculateFee(params: {
        feeModel: FeeModel;
        propertyValue?: number;
        manDays?: { category: string; days: number }[];
        flatFee?: number;
        organizationId?: string;
    }): Promise<FeeCalculation> {
        const { feeModel, propertyValue, manDays, flatFee, organizationId } = params;
        let subtotal = 0;
        const lineItems: LineItem[] = [];
        let breakdown = '';

        switch (feeModel) {
            case 'percentage_of_value': {
                if (!propertyValue) throw new Error('Property value required for percentage model');
                const rate = 0.005; // 0.5% GhIS standard
                subtotal = propertyValue * rate;
                lineItems.push({
                    description: `Valuation Fee (0.5% of GHS ${propertyValue.toLocaleString()})`,
                    quantity: 1,
                    unit: 'lot',
                    unitPrice: subtotal,
                    amount: subtotal,
                });
                breakdown = `0.5% of GHS ${propertyValue.toLocaleString()} = GHS ${subtotal.toLocaleString()}`;
                break;
            }

            case 'man_day_rate': {
                if (!manDays || manDays.length === 0) throw new Error('Man-day breakdown required');
                for (const item of manDays) {
                    const rateInfo = MWH_MAN_DAY_RATES[item.category];
                    if (!rateInfo) throw new Error(`Unknown professional category: ${item.category}`);
                    // Allow custom rate override — fall back to MWH default
                    const effectiveRate = (item as any).rate && (item as any).rate > 0 ? (item as any).rate : rateInfo.dailyRate;
                    const isCustom = effectiveRate !== rateInfo.dailyRate;
                    const amount = effectiveRate * item.days;
                    subtotal += amount;
                    lineItems.push({
                        description: `${rateInfo.label} — ${item.days} day(s) @ GHS ${effectiveRate.toFixed(2)}/day${isCustom ? ' (adjusted)' : ''}`,
                        quantity: item.days,
                        unit: 'day',
                        unitPrice: effectiveRate,
                        amount,
                    });
                }
                breakdown = `Man-day rates per MWH 2021 Schedule`;
                break;
            }

            case 'flat_fee': {
                if (!flatFee) throw new Error('Flat fee amount required');
                subtotal = flatFee;
                lineItems.push({
                    description: 'Valuation Professional Fee (Flat Rate)',
                    quantity: 1,
                    unit: 'lot',
                    unitPrice: flatFee,
                    amount: flatFee,
                });
                breakdown = `Flat fee: GHS ${flatFee.toLocaleString()}`;
                break;
            }

            default:
                throw new Error(`Unsupported fee model: ${feeModel}`);
        }

        // Use centralized FeeEngine for platform fee (mirrors rent/deal/project)
        const feeCalc = await feeEngine.calculate('valuation', subtotal, organizationId, 'organization');
        const platformFee = Number(feeCalc.serviceFee.toFixed(2));
        const totalAmount = Number((subtotal + platformFee).toFixed(2));

        return {
            feeModel,
            subtotal: Number(subtotal.toFixed(2)),
            vatAmount: 0,
            nhilAmount: 0,
            getfundAmount: 0,
            covidLevyAmount: 0,
            totalTax: 0,
            platformFee,
            totalAmount,
            lineItems,
            breakdown,
        };
    }

    /**
     * Generate next invoice number
     */
    async generateInvoiceNumber(organizationId: string): Promise<string> {
        const year = new Date().getFullYear();
        const result = await pool.query(
            `SELECT COUNT(*) as count FROM valuation_invoices 
       WHERE organization_id = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
            [organizationId, year]
        );
        const seq = (parseInt(result.rows[0].count) + 1).toString().padStart(6, '0');
        return `PM-INV-${year}-${seq}`;
    }

    /**
     * Create a new invoice
     */
    async createInvoice(input: CreateInvoiceInput): Promise<ValuationInvoice> {
        const invoiceNumber = await this.generateInvoiceNumber(input.organizationId);

        // Calculate taxes from line items
        const subtotal = input.lineItems.reduce((sum, item) => sum + item.amount, 0);
        const discountAmount = input.discountAmount || 0;
        const taxableAmount = subtotal - discountAmount;

        // No taxes — platform fee only
        const createFeeCalc = await feeEngine.calculate('valuation', taxableAmount, input.organizationId, 'organization');
        const platformFee = Number(createFeeCalc.serviceFee.toFixed(2));
        const totalAmount = taxableAmount + platformFee;

        const id = uuidv4();

        const result = await pool.query(
            `INSERT INTO valuation_invoices (
        id, organization_id, invoice_number, valuation_id, client_id,
        client_name, client_email, client_phone, client_address, client_company, client_tin,
        fee_model, property_address, property_value,
        line_items, subtotal, discount_amount, discount_description,
        vat_amount, nhil_amount, getfund_amount, covid_levy_amount, total_tax, platform_fee, total_amount,
        invoice_date, due_date, notes, terms_and_conditions, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12::valuation_fee_model, $13, $14,
        $15::jsonb, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25,
        $26, $27, $28, $29, $30
      ) RETURNING *`,
            [
                id, input.organizationId, invoiceNumber, input.valuationId || null, input.clientId || null,
                input.clientName, input.clientEmail || null, input.clientPhone || null,
                input.clientAddress || null, input.clientCompany || null, input.clientTin || null,
                input.feeModel, input.propertyAddress || null, input.propertyValue || null,
                JSON.stringify(input.lineItems), subtotal, discountAmount, input.discountDescription || null,
                0, 0, 0, 0, 0, platformFee, totalAmount,
                input.invoiceDate || new Date().toISOString().split('T')[0],
                input.dueDate || null, input.notes || null,
                input.termsAndConditions || 'Payment is due within 14 days of invoice date.',
                input.createdBy || null,
            ]
        );

        logger.info('Valuation invoice created', { id, invoiceNumber, totalAmount });
        return this.mapInvoice(result.rows[0]);
    }

    /**
     * Get invoice by ID
     */
    async getById(id: string): Promise<ValuationInvoice | null> {
        const result = await pool.query(
            `SELECT * FROM valuation_invoices WHERE id = $1`, [id]
        );
        return result.rows.length > 0 ? this.mapInvoice(result.rows[0]) : null;
    }

    /**
     * List invoices for an organization
     */
    async listInvoices(
        organizationId: string,
        filters?: { status?: InvoiceStatus; search?: string; limit?: number; offset?: number }
    ): Promise<{ invoices: ValuationInvoice[]; total: number }> {
        let query = `SELECT * FROM valuation_invoices WHERE organization_id = $1`;
        let countQuery = `SELECT COUNT(*) FROM valuation_invoices WHERE organization_id = $1`;
        const params: any[] = [organizationId];
        let paramIdx = 2;

        if (filters?.status) {
            query += ` AND status = $${paramIdx}::invoice_status_enum`;
            countQuery += ` AND status = $${paramIdx}::invoice_status_enum`;
            params.push(filters.status);
            paramIdx++;
        } else {
            // By default, exclude cancelled invoices from the list
            query += ` AND status != 'cancelled'`;
            countQuery += ` AND status != 'cancelled'`;
        }

        if (filters?.search) {
            query += ` AND (client_name ILIKE $${paramIdx} OR invoice_number ILIKE $${paramIdx} OR client_email ILIKE $${paramIdx})`;
            countQuery += ` AND (client_name ILIKE $${paramIdx} OR invoice_number ILIKE $${paramIdx} OR client_email ILIKE $${paramIdx})`;
            params.push(`%${filters.search}%`);
            paramIdx++;
        }

        // Get total
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Get paginated results
        query += ` ORDER BY created_at DESC`;
        if (filters?.limit) {
            query += ` LIMIT $${paramIdx}`;
            params.push(filters.limit);
            paramIdx++;
        }
        if (filters?.offset) {
            query += ` OFFSET $${paramIdx}`;
            params.push(filters.offset);
            paramIdx++;
        }

        const result = await pool.query(query, params);

        return {
            invoices: result.rows.map((r: any) => this.mapInvoice(r)),
            total,
        };
    }

    /**
     * Update a draft invoice
     */
    async updateInvoice(id: string, updates: Partial<CreateInvoiceInput>): Promise<ValuationInvoice> {
        // Only draft invoices can be updated
        const existing = await this.getById(id);
        if (!existing) throw new Error('Invoice not found');
        if (existing.status !== 'draft') throw new Error('Only draft invoices can be edited');

        // Recalculate if line items changed
        let subtotal = existing.subtotal;
        let lineItems = existing.lineItems;

        if (updates.lineItems) {
            lineItems = updates.lineItems;
            subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
        }

        const discountAmount = updates.discountAmount ?? existing.discountAmount;
        const taxableAmount = subtotal - discountAmount;
        // No taxes — platform fee only
        const updateFeeCalc = await feeEngine.calculate('valuation', taxableAmount, existing.organizationId, 'organization');
        const platformFee = Number(updateFeeCalc.serviceFee.toFixed(2));
        const totalAmount = taxableAmount + platformFee;

        const result = await pool.query(
            `UPDATE valuation_invoices SET
        client_name = COALESCE($2, client_name),
        client_email = COALESCE($3, client_email),
        client_phone = COALESCE($4, client_phone),
        client_address = COALESCE($5, client_address),
        client_company = COALESCE($6, client_company),
        line_items = $7::jsonb,
        subtotal = $8, discount_amount = $9,
        vat_amount = $10, nhil_amount = $11, getfund_amount = $12,
        covid_levy_amount = $13, total_tax = $14, platform_fee = $15, total_amount = $16,
        notes = COALESCE($17, notes),
        due_date = COALESCE($18, due_date),
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [
                id,
                updates.clientName || null, updates.clientEmail || null,
                updates.clientPhone || null, updates.clientAddress || null,
                updates.clientCompany || null,
                JSON.stringify(lineItems), subtotal, discountAmount,
                0, 0, 0, 0, 0, platformFee, totalAmount,
                updates.notes || null, updates.dueDate || null,
            ]
        );

        return this.mapInvoice(result.rows[0]);
    }

    /**
     * Send invoice — generates Paystack payment link (with split payment if subaccount configured)
     * Uses Paystack sub-accounts so that client payment goes directly to the valuer's bank/MoMo,
     * and PROPMETRIK's platform fee is retained automatically via transaction_charge.
     */
    async sendInvoice(id: string): Promise<ValuationInvoice> {
        const invoice = await this.getById(id);
        if (!invoice) throw new Error('Invoice not found');
        if (invoice.status !== 'draft') throw new Error('Only draft invoices can be sent');

        // Generate a unique reference for Paystack
        const reference = `PM-PAY-${Date.now()}-${uuidv4().slice(0, 8)}`;

        // Try Paystack integration (if PAYSTACK_SECRET_KEY is configured)
        let paymentLink: string | null = null;
        let accessCode: string | null = null;
        // FX settlement context (populated when the invoice is in a non-GHS currency)
        let chargedGhs: number | null = null;
        let fxRate: number | null = null;
        let fxSource: string | null = null;
        let fxLockedAt: Date | null = null;

        try {
            const { paystackService } = await import('../property-management/payment/paystackService').catch(() => ({ paystackService: null }));

            if (paystackService && invoice.clientEmail) {
                // Settle in GHS — Paystack Ghana cannot settle foreign currencies. A
                // USD invoice is charged in its GHS equivalent at a LIVE, locked rate;
                // if no live rate is available normalizeToGhs throws (no fallback) and
                // we skip the charge rather than bill a guessed amount.
                const { exchangeRateService } = await import('../../../shared-services/payments/crypto/exchangeRateService');
                const obligationCurrency = (invoice.currency || 'GHS').toUpperCase();
                const isForeign = obligationCurrency !== 'GHS';
                const fxConv = await exchangeRateService.normalizeToGhs(invoice.subtotal, obligationCurrency);
                const subtotalGhs = fxConv.ghsAmount;

                // Platform fee always computed on the GHS principal (fees are GHS-denominated)
                const platformFeeCalc = await feeEngine.calculate('valuation', subtotalGhs, invoice.organizationId, 'organization');
                const platformFeePesewas = platformFeeCalc.serviceFeeSubunits;
                const totalGhs = Number((subtotalGhs + platformFeeCalc.serviceFee).toFixed(2));
                const totalPesewas = Math.round(totalGhs * 100);

                chargedGhs = totalGhs;
                if (isForeign) { fxRate = fxConv.rate; fxSource = fxConv.source; fxLockedAt = fxConv.fetchedAt; }

                const fxMetadata = isForeign ? {
                    obligation_currency: obligationCurrency,
                    obligation_amount: invoice.totalAmount,
                    fx_rate: fxConv.rate,
                    fx_source: fxConv.source,
                    fx_locked_at: fxConv.fetchedAt.toISOString(),
                } : {};

                // Check if org has a payout account (subaccount) configured
                const payoutConfig = await paystackService.getPaymentAccountConfig(invoice.organizationId, 'organization', 'valuation');

                if (payoutConfig?.subaccountCode) {
                    // Split payment: client pays → valuer receives principal, PROPMETRIK retains platform fee
                    const response = await paystackService.initializeWithSubaccount(
                        {
                            email: invoice.clientEmail,
                            amount: totalPesewas,
                            currency: 'GHS',
                            reference,
                            channels: ['mobile_money', 'card', 'bank_transfer', 'bank', 'ussd', 'qr'],
                            callback_url: `${process.env.FRONTEND_URL || 'https://propmetrik.com'}/payment/invoice?id=${invoice.id}&status=success`,
                            metadata: {
                                invoiceId: invoice.id,
                                invoiceNumber: invoice.invoiceNumber,
                                clientName: invoice.clientName,
                                type: 'valuation_invoice',
                                splitPayment: true,
                                ...fxMetadata,
                            },
                        },
                        payoutConfig.subaccountCode,
                        platformFeePesewas
                    );

                    if (response.status) {
                        paymentLink = response.data.authorization_url;
                        accessCode = response.data.access_code;
                    }

                    logger.info('Invoice sent with split payment', {
                        id, reference,
                        subaccount: payoutConfig.subaccountCode,
                        obligationCurrency,
                        obligationTotal: invoice.totalAmount,
                        chargedGhs: totalGhs,
                        platformFee: platformFeeCalc.serviceFee,
                    });
                } else {
                    // No subaccount — all funds go to main Paystack account
                    const paystackKey = config.paystack.secretKey;
                    if (paystackKey) {
                        const axios = (await import('axios')).default;
                        const response = await axios.post(
                            'https://api.paystack.co/transaction/initialize',
                            {
                                email: invoice.clientEmail,
                                amount: totalPesewas,
                                reference,
                                currency: 'GHS',
                                channels: ['mobile_money', 'card', 'bank_transfer', 'bank', 'ussd', 'qr'],
                                send_notification: false,
                                callback_url: `${config.app.frontendUrl}/payment/invoice?id=${invoice.id}&status=success`,
                                metadata: {
                                    invoiceId: invoice.id,
                                    invoiceNumber: invoice.invoiceNumber,
                                    clientName: invoice.clientName,
                                    type: 'valuation_invoice',
                                    ...fxMetadata,
                                },
                            },
                            {
                                headers: {
                                    Authorization: `Bearer ${paystackKey}`,
                                    'Content-Type': 'application/json',
                                },
                            }
                        );

                        if (response.data.status) {
                            paymentLink = response.data.data.authorization_url;
                            accessCode = response.data.data.access_code;
                        }
                    }
                }
            }
        } catch (error: any) {
            logger.warn('Paystack initialization failed, invoice still marked as sent', { error: error.message });
        }

        // Store the inline payment page URL (NOT the Paystack checkout redirect URL).
        // The accessCode is stored separately for resumeTransaction fallback.
        const inlinePaymentUrl = `${process.env.FRONTEND_URL || 'https://propmetrik.com'}/payment/invoice?id=${id}`;

        const result = await pool.query(
            `UPDATE valuation_invoices SET
        status = 'sent'::invoice_status_enum,
        paystack_reference = $2,
        paystack_access_code = $3,
        payment_link = $4,
        charged_amount_ghs = $5,
        fx_rate = $6,
        fx_source = $7,
        fx_locked_at = $8,
        sent_at = NOW(),
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [id, reference, accessCode, inlinePaymentUrl, chargedGhs, fxRate, fxSource, fxLockedAt]
        );

        const sentInvoice = this.mapInvoice(result.rows[0]);

        // ────────────────────────────────────────────────────────
        // SEND INVOICE EMAIL TO CLIENT
        // ────────────────────────────────────────────────────────
        if (sentInvoice.clientEmail) {
            try {
                // Fetch org name for branding
                let organizationName = 'PROPMETRIK Valuations';
                try {
                    const orgResult = await pool.query(
                        `SELECT name FROM organizations WHERE id = $1`,
                        [sentInvoice.organizationId]
                    );
                    if (orgResult.rows[0]?.name) organizationName = orgResult.rows[0].name;
                } catch { /* fallback to default */ }

                const dueDate = sentInvoice.dueDate
                    ? new Date(sentInvoice.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : 'Upon receipt';

                const paymentPageUrl = `${process.env.FRONTEND_URL || 'https://propmetrik.com'}/payment/invoice?id=${sentInvoice.id}`;
                const paymentSection = paymentLink
                    ? `
                        <div style="text-align: center; margin: 32px 0;">
                            <a href="${paymentPageUrl}"
                               style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #eab308 100%); color: #000; padding: 16px 40px; text-decoration: none; font-weight: 700; font-size: 15px; border-radius: 8px; letter-spacing: 0.5px;">
                                VIEW & PAY INVOICE — GHS ${sentInvoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </a>
                            <p style="margin-top: 12px; font-size: 12px; color: #94a3b8;">Pay securely via Mobile Money, Card, or Crypto</p>
                        </div>`
                    : `
                        <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px 20px; margin: 24px 0; text-align: center;">
                            <p style="margin: 0; font-size: 14px; color: #92400e; font-weight: 600;">Amount Due: GHS ${sentInvoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            <p style="margin: 4px 0 0; font-size: 12px; color: #a16207;">Please contact ${organizationName} for payment instructions.</p>
                        </div>`;

                // Build line items HTML
                const lineItemsHtml = (sentInvoice.lineItems || []).map((li: any) =>
                    `<tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155;">${li.description}</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; text-align: center;">${li.quantity}</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; text-align: right;">GHS ${li.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>`
                ).join('');

                await notificationService.sendEmail({
                    to: sentInvoice.clientEmail,
                    subject: `Invoice ${sentInvoice.invoiceNumber} from ${organizationName}`,
                    html: `
                        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1e293b;">
                            <!-- Header -->
                            <div style="background: #09090b; padding: 28px 32px; border-radius: 12px 12px 0 0; text-align: center;">
                                <h1 style="color: #f59e0b; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 2px;">PROPMETRIK</h1>
                                <p style="color: #71717a; margin: 4px 0 0; font-size: 11px; letter-spacing: 1px;">${organizationName}</p>
                            </div>

                            <!-- Body -->
                            <div style="background: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-top: none;">
                                <p style="font-size: 15px; margin-top: 0;">Dear <strong>${sentInvoice.clientName}</strong>,</p>

                                <p style="font-size: 14px; line-height: 1.6; color: #475569;">
                                    Please find below the details of your invoice. Payment is due by <strong>${dueDate}</strong>.
                                </p>

                                <!-- Invoice Details -->
                                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
                                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                        <tr>
                                            <td style="padding: 4px 0; color: #64748b;">Invoice No.</td>
                                            <td style="padding: 4px 0; text-align: right; font-weight: 700; color: #f59e0b;">${sentInvoice.invoiceNumber}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 4px 0; color: #64748b;">Date</td>
                                            <td style="padding: 4px 0; text-align: right;">${new Date(sentInvoice.invoiceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 4px 0; color: #64748b;">Due Date</td>
                                            <td style="padding: 4px 0; text-align: right;">${dueDate}</td>
                                        </tr>
                                        ${sentInvoice.propertyAddress ? `
                                        <tr>
                                            <td style="padding: 4px 0; color: #64748b;">Property</td>
                                            <td style="padding: 4px 0; text-align: right;">${sentInvoice.propertyAddress}</td>
                                        </tr>` : ''}
                                    </table>
                                </div>

                                <!-- Line Items -->
                                <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
                                    <thead>
                                        <tr style="background: #f1f5f9;">
                                            <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">Description</th>
                                            <th style="padding: 10px 12px; text-align: center; font-size: 11px; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">Qty</th>
                                            <th style="padding: 10px 12px; text-align: right; font-size: 11px; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${lineItemsHtml}
                                    </tbody>
                                </table>

                                <!-- Totals -->
                                <div style="border-top: 2px solid #e2e8f0; padding-top: 16px; margin-top: 8px;">
                                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                        <tr>
                                            <td style="padding: 4px 0; color: #64748b;">Subtotal</td>
                                            <td style="padding: 4px 0; text-align: right;">GHS ${sentInvoice.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                        ${sentInvoice.platformFee > 0 ? `<tr>
                                            <td style="padding: 4px 0; color: #64748b;">Platform Fee (2.5%)</td>
                                            <td style="padding: 4px 0; text-align: right;">GHS ${sentInvoice.platformFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                        </tr>` : ''}
                                        <tr style="font-size: 16px; font-weight: 700;">
                                            <td style="padding: 12px 0 4px; border-top: 2px solid #09090b;">Total Due</td>
                                            <td style="padding: 12px 0 4px; border-top: 2px solid #09090b; text-align: right; color: #f59e0b;">GHS ${sentInvoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    </table>
                                </div>

                                <!-- Payment Button -->
                                ${paymentSection}

                                ${sentInvoice.notes ? `
                                <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-top: 24px; font-size: 13px; color: #64748b;">
                                    <strong style="color: #334155;">Notes:</strong><br/>${sentInvoice.notes}
                                </div>` : ''}
                            </div>

                            <!-- Footer -->
                            <div style="background: #09090b; padding: 20px 32px; border-radius: 0 0 12px 12px; text-align: center;">
                                <p style="color: #71717a; font-size: 11px; margin: 0;">This invoice was generated by PROPMETRIK on behalf of ${organizationName}.</p>
                                <p style="color: #52525b; font-size: 10px; margin: 8px 0 0;">
                                    Questions about this invoice? Contact ${organizationName} directly.
                                </p>
                            </div>
                        </div>
                    `,
                    text: `Invoice ${sentInvoice.invoiceNumber} from ${organizationName}\n\nDear ${sentInvoice.clientName},\n\nAmount Due: GHS ${sentInvoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\nDue Date: ${dueDate}\n${paymentPageUrl ? `Pay here: ${paymentPageUrl}` : 'Please contact us for payment instructions.'}\n\nThank you.`
                });

                logger.info('Invoice email sent to client', { id, email: sentInvoice.clientEmail });
            } catch (emailError: any) {
                logger.error('Failed to send invoice email', { id, error: emailError.message });
                // Don't throw — invoice is already marked as sent
            }
        } else {
            logger.warn('Invoice sent without email — no client email on record', { id });
        }

        logger.info('Invoice sent', { id, reference, paymentLink: !!paymentLink });
        return sentInvoice;
    }

    /**
     * Process an inline Paystack payment by invoice ID.
     * Used when newTransaction creates a fresh reference that doesn't match the
     * server-initialized reference stored in the DB.
     */
    async processInlinePayment(invoiceId: string, reference: string, data: any): Promise<ValuationInvoice | null> {
        const invoiceResult = await pool.query(
            `SELECT * FROM valuation_invoices WHERE id = $1 AND status IN ('sent', 'overdue')`,
            [invoiceId]
        );

        if (invoiceResult.rows.length === 0) {
            logger.warn('No unpaid invoice found for inline payment', { invoiceId, reference });
            return null;
        }

        const invoice = invoiceResult.rows[0];
        const paidAmount = (data.amount || 0) / 100;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update invoice — also store the new inline reference
            const updated = await client.query(
                `UPDATE valuation_invoices SET
          status = 'paid'::invoice_status_enum,
          paid_at = NOW(),
          paid_amount = $2,
          payment_reference = $3,
          payment_channel = $4,
          paystack_reference = $3,
          updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
                [invoice.id, paidAmount, reference, data.channel || 'paystack']
            );

            // Generate receipt
            const receiptNumber = `PM-RCP-${new Date().getFullYear()}-${uuidv4().slice(0, 8).toUpperCase()}`;
            await client.query(
                `INSERT INTO valuation_receipts (
          id, invoice_id, organization_id, receipt_number,
          amount_paid, currency, payment_method, payment_reference,
          payment_channel, paystack_reference, paystack_transaction_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    uuidv4(), invoice.id, invoice.organization_id, receiptNumber,
                    paidAmount, 'GHS', data.channel || 'paystack', reference,
                    data.authorization?.channel || data.channel, reference,
                    data.id?.toString() || null,
                ]
            );

            await client.query('COMMIT');

            logger.info('Inline payment processed and receipt generated', { invoiceId: invoice.id, receiptNumber, reference });

            const mappedInvoice = this.mapInvoice(updated.rows[0]);
            try {
                await this.sendReceiptEmail(mappedInvoice, receiptNumber, paidAmount, data.channel || 'paystack', data.authorization);
            } catch (emailErr: any) {
                logger.error('Failed to send receipt email', { invoiceId: invoice.id, error: emailErr.message });
            }
            await this.notifyInvoicePaid(mappedInvoice, paidAmount);

            return mappedInvoice;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Handle Paystack payment webhook
     */
    async handlePaymentWebhook(reference: string, data: any): Promise<ValuationInvoice | null> {
        // Find invoice by Paystack reference
        const invoiceResult = await pool.query(
            `SELECT * FROM valuation_invoices WHERE paystack_reference = $1`,
            [reference]
        );

        if (invoiceResult.rows.length === 0) {
            logger.warn('No invoice found for Paystack reference', { reference });
            return null;
        }

        const invoice = invoiceResult.rows[0];
        const paidAmount = (data.amount || 0) / 100; // Convert from pesewas

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update invoice status
            const updated = await client.query(
                `UPDATE valuation_invoices SET
          status = 'paid'::invoice_status_enum,
          paid_at = NOW(),
          paid_amount = $2,
          payment_reference = $3,
          payment_channel = $4,
          updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
                [invoice.id, paidAmount, data.reference, data.channel || 'paystack']
            );

            // Generate receipt
            const receiptNumber = `PM-RCP-${new Date().getFullYear()}-${uuidv4().slice(0, 8).toUpperCase()}`;
            await client.query(
                `INSERT INTO valuation_receipts (
          id, invoice_id, organization_id, receipt_number,
          amount_paid, currency, payment_method, payment_reference,
          payment_channel, paystack_reference, paystack_transaction_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    uuidv4(), invoice.id, invoice.organization_id, receiptNumber,
                    paidAmount, 'GHS', data.channel || 'paystack', data.reference,
                    data.authorization?.channel || data.channel, reference,
                    data.id?.toString() || null,
                ]
            );

            await client.query('COMMIT');

            logger.info('Payment processed and receipt generated', { invoiceId: invoice.id, receiptNumber });

            // Send branded PROPMETRIK receipt email
            const mappedInvoice = this.mapInvoice(updated.rows[0]);
            try {
                await this.sendReceiptEmail(mappedInvoice, receiptNumber, paidAmount, data.channel || 'paystack', data.authorization);
            } catch (emailErr: any) {
                logger.error('Failed to send receipt email', { invoiceId: invoice.id, error: emailErr.message });
            }
            await this.notifyInvoicePaid(mappedInvoice, paidAmount);

            return mappedInvoice;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Send branded PROPMETRIK payment receipt email to client
     */
    private async sendReceiptEmail(
        invoice: ValuationInvoice,
        receiptNumber: string,
        amountPaid: number,
        paymentMethod: string,
        authorization?: any
    ): Promise<void> {
        if (!invoice.clientEmail) return;

        // Fetch organization details
        let organizationName = 'PROPMETRIK Valuation Services';
        let orgPhone = '';
        let orgEmail = '';
        try {
            const orgResult = await pool.query(
                `SELECT name, phone, email FROM organizations WHERE id = $1`,
                [invoice.organizationId]
            );
            if (orgResult.rows[0]) {
                organizationName = orgResult.rows[0].name || organizationName;
                orgPhone = orgResult.rows[0].phone || '';
                orgEmail = orgResult.rows[0].email || '';
            }
        } catch { /* fallback */ }

        // Determine payment channel display name
        const channelMap: Record<string, string> = {
            'mobile_money': 'Mobile Money',
            'card': 'Card Payment',
            'bank_transfer': 'Bank Transfer',
            'bank': 'Bank Payment',
            'ussd': 'USSD',
            'qr': 'QR Code',
            'crypto': 'Cryptocurrency',
            'paystack': 'Online Payment',
        };
        const channelDisplay = channelMap[paymentMethod] || paymentMethod;

        // Card/MoMo last digits info
        let paymentInfo = '';
        if (authorization) {
            if (authorization.last4) {
                paymentInfo = `${authorization.brand || authorization.channel || 'Card'} ending in ${authorization.last4}`;
            } else if (authorization.sender_name) {
                paymentInfo = authorization.sender_name;
            }
        }

        const paidDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const paidTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        // Build line items HTML
        const lineItemsHtml = (invoice.lineItems || []).map((li: any) =>
            `<tr>
                <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155;">${li.description}</td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; text-align: center;">${li.quantity}</td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; text-align: right;">GHS ${li.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>`
        ).join('');

        await notificationService.sendEmail({
            to: invoice.clientEmail,
            subject: `Payment Receipt — ${receiptNumber} | ${organizationName}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1e293b;">
                    <!-- Header -->
                    <div style="background: #09090b; padding: 28px 32px; border-radius: 12px 12px 0 0; text-align: center;">
                        <h1 style="color: #f59e0b; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 2px;">PROPMETRIK</h1>
                        <p style="color: #71717a; margin: 4px 0 0; font-size: 11px; letter-spacing: 1px;">PAYMENT RECEIPT</p>
                    </div>

                    <!-- Success Banner -->
                    <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 24px 32px; text-align: center;">
                        <div style="width: 48px; height: 48px; background: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 12px; line-height: 48px; font-size: 24px;">✓</div>
                        <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 700;">Payment Received</h2>
                        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 32px; font-weight: 800;">GHS ${amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>

                    <!-- Body -->
                    <div style="background: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-top: none;">
                        <p style="font-size: 15px; margin-top: 0;">Dear <strong>${invoice.clientName}</strong>,</p>

                        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
                            Thank you for your payment. This receipt confirms that your payment has been successfully processed.
                        </p>

                        <!-- Receipt Details -->
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
                            <h3 style="margin: 0 0 12px; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Receipt Details</h3>
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <tr>
                                    <td style="padding: 6px 0; color: #64748b;">Receipt No.</td>
                                    <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #059669;">${receiptNumber}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #64748b;">Invoice No.</td>
                                    <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #f59e0b;">${invoice.invoiceNumber}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #64748b;">Date</td>
                                    <td style="padding: 6px 0; text-align: right;">${paidDate}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #64748b;">Time</td>
                                    <td style="padding: 6px 0; text-align: right;">${paidTime}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #64748b;">Payment Method</td>
                                    <td style="padding: 6px 0; text-align: right;">${channelDisplay}</td>
                                </tr>
                                ${paymentInfo ? `<tr>
                                    <td style="padding: 6px 0; color: #64748b;">Payment Details</td>
                                    <td style="padding: 6px 0; text-align: right;">${paymentInfo}</td>
                                </tr>` : ''}
                                ${invoice.propertyAddress ? `<tr>
                                    <td style="padding: 6px 0; color: #64748b;">Property</td>
                                    <td style="padding: 6px 0; text-align: right;">${invoice.propertyAddress}</td>
                                </tr>` : ''}
                            </table>
                        </div>

                        <!-- Line Items -->
                        <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
                            <thead>
                                <tr style="background: #f1f5f9;">
                                    <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">Description</th>
                                    <th style="padding: 10px 12px; text-align: center; font-size: 11px; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">Qty</th>
                                    <th style="padding: 10px 12px; text-align: right; font-size: 11px; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${lineItemsHtml}
                            </tbody>
                        </table>

                        <!-- Totals -->
                        <div style="border-top: 2px solid #e2e8f0; padding-top: 16px; margin-top: 8px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <tr>
                                    <td style="padding: 4px 0; color: #64748b;">Subtotal</td>
                                    <td style="padding: 4px 0; text-align: right;">GHS ${invoice.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                ${invoice.platformFee > 0 ? `<tr>
                                    <td style="padding: 4px 0; color: #64748b;">Platform Fee</td>
                                    <td style="padding: 4px 0; text-align: right;">GHS ${invoice.platformFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                </tr>` : ''}
                                <tr style="font-size: 16px; font-weight: 700;">
                                    <td style="padding: 12px 0 4px; border-top: 2px solid #059669;">Amount Paid</td>
                                    <td style="padding: 12px 0 4px; border-top: 2px solid #059669; text-align: right; color: #059669;">GHS ${amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            </table>
                        </div>

                        <!-- Status Badge -->
                        <div style="text-align: center; margin: 32px 0 16px;">
                            <span style="display: inline-block; background: #ecfdf5; color: #059669; padding: 10px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 1px; border: 1px solid #a7f3d0;">✓ PAID IN FULL</span>
                        </div>

                        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 24px 0 0;">
                            Please retain this receipt for your records. No further action is required.
                        </p>
                    </div>

                    <!-- Footer -->
                    <div style="background: #09090b; padding: 20px 32px; border-radius: 0 0 12px 12px; text-align: center;">
                        <p style="color: #a1a1aa; font-size: 11px; margin: 0;">This receipt was issued by <strong style="color: #f59e0b;">PROPMETRIK</strong> on behalf of ${organizationName}.</p>
                        ${orgPhone || orgEmail ? `<p style="color: #71717a; font-size: 10px; margin: 8px 0 0;">
                            ${orgPhone ? `Tel: ${orgPhone}` : ''}${orgPhone && orgEmail ? ' | ' : ''}${orgEmail ? `Email: ${orgEmail}` : ''}
                        </p>` : ''}
                        <p style="color: #52525b; font-size: 10px; margin: 8px 0 0;">Questions? Contact ${organizationName} directly.</p>
                    </div>
                </div>
            `,
            text: `PAYMENT RECEIPT\n\nReceipt No: ${receiptNumber}\nInvoice: ${invoice.invoiceNumber}\n\nDear ${invoice.clientName},\n\nWe confirm receipt of your payment of GHS ${amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}.\n\nDate: ${paidDate}\nPayment Method: ${channelDisplay}\n\nThank you for your payment.\n\n— ${organizationName} via PROPMETRIK`
        });

        logger.info('Receipt email sent to client', { invoiceId: invoice.id, email: invoice.clientEmail, receiptNumber });
    }

    /**
     * Mark invoice as paid manually
     */
    async markAsPaid(id: string, paymentDetails: {
        amount: number;
        paymentMethod: string;
        paymentReference: string;
    }): Promise<ValuationInvoice> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const updated = await client.query(
                `UPDATE valuation_invoices SET
          status = 'paid'::invoice_status_enum,
          paid_at = NOW(),
          paid_amount = $2,
          payment_reference = $3,
          payment_channel = $4,
          updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
                [id, paymentDetails.amount, paymentDetails.paymentReference, paymentDetails.paymentMethod]
            );

            if (updated.rows.length === 0) throw new Error('Invoice not found');

            // Generate receipt
            const receiptNumber = `PM-RCP-${new Date().getFullYear()}-${uuidv4().slice(0, 8).toUpperCase()}`;
            await client.query(
                `INSERT INTO valuation_receipts (
          id, invoice_id, organization_id, receipt_number,
          amount_paid, currency, payment_method, payment_reference
        ) VALUES ($1, $2, $3, $4, $5, 'GHS', $6, $7)`,
                [
                    uuidv4(), id, updated.rows[0].organization_id, receiptNumber,
                    paymentDetails.amount, paymentDetails.paymentMethod, paymentDetails.paymentReference,
                ]
            );

            await client.query('COMMIT');
            const mappedInvoice = this.mapInvoice(updated.rows[0]);
            await this.notifyInvoicePaid(mappedInvoice, paymentDetails.amount);
            return mappedInvoice;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Notify org staff that a valuation invoice has been paid.
     * Best-effort: the client receipt email is sent elsewhere; this is the staff inbox push.
     */
    private async notifyInvoicePaid(invoice: ValuationInvoice, amountPaid: number): Promise<void> {
        try {
            if (!invoice.organizationId) return;
            const staff = await resolveOrgStaff(invoice.organizationId);
            if (!staff.length) return;
            await notify({
                recipients: staff,
                category: 'finance',
                type: 'valuation_invoice.paid',
                title: 'Valuation invoice paid',
                body: `Invoice ${invoice.invoiceNumber} from ${invoice.clientName} was paid (GHS ${amountPaid}).`,
                priority: 'normal',
                organizationId: invoice.organizationId,
                sourceType: 'valuation_invoice',
                sourceId: invoice.id,
                sourceUrl: '/dashboard/valuations/finance',
                channels: { inApp: true },
            });
        } catch (err: any) {
            logger.warn('notifyInvoicePaid failed', { invoiceId: invoice.id, error: err.message });
        }
    }

    /**
     * Notify staff of a paid valuation invoice by id — used by payment paths that
     * update the invoice row directly (e.g. crypto settlement) instead of markAsPaid.
     */
    async notifyPaidById(invoiceId: string): Promise<void> {
        const invoice = await this.getById(invoiceId);
        if (invoice) await this.notifyInvoicePaid(invoice, invoice.paidAmount ?? invoice.totalAmount);
    }

    /**
     * Delete an invoice (hard delete — draft, cancelled, or sent)
     * Paid invoices cannot be deleted (financial records must be preserved).
     */
    async deleteInvoice(id: string, organizationId: string): Promise<void> {
        const result = await pool.query(
            `DELETE FROM valuation_invoices
             WHERE id = $1 AND organization_id = $2 AND status IN ('draft', 'cancelled', 'sent')
             RETURNING id`,
            [id, organizationId]
        );
        if (result.rows.length === 0) {
            throw new Error('Invoice not found or cannot be deleted (only draft, sent, or cancelled invoices can be deleted)');
        }
        logger.info(`Invoice ${id} permanently deleted`);
    }

    /**
     * Cancel an invoice
     */
    async cancelInvoice(id: string, reason: string): Promise<ValuationInvoice> {
        const result = await pool.query(
            `UPDATE valuation_invoices SET
        status = 'cancelled'::invoice_status_enum,
        cancelled_at = NOW(),
        cancellation_reason = $2,
        updated_at = NOW()
       WHERE id = $1 AND status NOT IN ('paid', 'cancelled')
       RETURNING *`,
            [id, reason]
        );

        if (result.rows.length === 0) throw new Error('Invoice not found or cannot be cancelled');
        return this.mapInvoice(result.rows[0]);
    }

    /**
     * Get invoice summary for an organization
     */
    async getSummary(organizationId: string): Promise<InvoiceSummary> {
        const result = await pool.query(
            `SELECT 
        COALESCE(SUM(total_amount), 0) as total_invoiced,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN paid_amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'viewed') THEN total_amount ELSE 0 END), 0) as total_outstanding,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END), 0) as total_overdue,
        COUNT(*) as invoice_count,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
       FROM valuation_invoices
       WHERE organization_id = $1 AND status != 'cancelled'`,
            [organizationId]
        );

        const row = result.rows[0];
        return {
            totalInvoiced: parseFloat(row.total_invoiced),
            totalPaid: parseFloat(row.total_paid),
            totalOutstanding: parseFloat(row.total_outstanding),
            totalOverdue: parseFloat(row.total_overdue),
            invoiceCount: parseInt(row.invoice_count),
            paidCount: parseInt(row.paid_count),
            overdueCount: parseInt(row.overdue_count),
        };
    }

    /**
     * Get receipt for an invoice
     */
    async getReceipt(invoiceId: string): Promise<any | null> {
        const result = await pool.query(
            `SELECT * FROM valuation_receipts WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [invoiceId]
        );
        return result.rows.length > 0 ? result.rows[0] : null;
    }

    // --------------------------------------------------------------------------
    // HELPERS
    // --------------------------------------------------------------------------

    private mapInvoice(row: any): ValuationInvoice {
        return {
            id: row.id,
            organizationId: row.organization_id,
            invoiceNumber: row.invoice_number,
            referenceNumber: row.reference_number,
            valuationId: row.valuation_id,
            clientName: row.client_name,
            clientEmail: row.client_email,
            clientPhone: row.client_phone,
            clientAddress: row.client_address,
            clientCompany: row.client_company,
            clientTin: row.client_tin,
            feeModel: row.fee_model,
            propertyAddress: row.property_address,
            propertyValue: row.property_value ? parseFloat(row.property_value) : null,
            lineItems: typeof row.line_items === 'string' ? JSON.parse(row.line_items) : (row.line_items || []),
            subtotal: parseFloat(row.subtotal),
            discountAmount: parseFloat(row.discount_amount || 0),
            discountDescription: row.discount_description,
            vatAmount: parseFloat(row.vat_amount || 0),
            nhilAmount: parseFloat(row.nhil_amount || 0),
            getfundAmount: parseFloat(row.getfund_amount || 0),
            covidLevyAmount: parseFloat(row.covid_levy_amount || 0),
            totalTax: parseFloat(row.total_tax || 0),
            totalAmount: parseFloat(row.total_amount),
            platformFee: parseFloat(row.platform_fee || 0),
            currency: row.currency,
            status: row.status,
            invoiceDate: row.invoice_date,
            dueDate: row.due_date,
            paystackReference: row.paystack_reference,
            paystackAccessCode: row.paystack_access_code || null,
            paymentLink: row.payment_link,
            paymentChannel: row.payment_channel,
            paidAt: row.paid_at,
            paidAmount: row.paid_amount ? parseFloat(row.paid_amount) : null,
            paymentReference: row.payment_reference,
            notes: row.notes,
            termsAndConditions: row.terms_and_conditions,
            sentAt: row.sent_at,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

export const valuationInvoiceService = new ValuationInvoiceService();
export default valuationInvoiceService;
