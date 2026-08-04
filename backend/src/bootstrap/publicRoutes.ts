import { Application, NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import { pool } from '../database';
import { getPresignedDownloadUrl, buckets } from '../database/minio';
import transmittalService from '../services/project-management/transmittalService';
import { validateRequest, pmPublicConfirmCryptoSchema, pmPublicInitiateCryptoSchema, pmPublicInvoiceIdParamSchema } from '../middleware/validation';

export function registerPublicPmInvoiceRoutes(app: Application): void {
app.get('/api/v1/pm-invoices/public/:id', async (req, res) => {
  try {
    const { invoiceService } = await import('../services/project-management/invoiceService');
    const invoice = await invoiceService.getById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Paystack Ghana only supports GHS — convert non-GHS amounts on-the-fly
    const invoiceCcy = (invoice.currency || 'GHS').toUpperCase();
    let paystackAmountGHS = (invoice as any).totalDue || invoice.totalAmount;
    let fxRate = 1;
    if (invoiceCcy !== 'GHS') {
      try {
        const { fxFeedService } = await import('../services/data-hub/scrapers/fxFeedService');
        const fx = await fxFeedService.convertToGHS(paystackAmountGHS, invoiceCcy);
        paystackAmountGHS = fx.converted_amount;
        fxRate = fx.rate;
      } catch (fxErr: any) {
        logger.warn('Public PM invoice: FX conversion failed, using raw amount', { error: fxErr.message });
      }
    }

    res.json({
      success: true,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: (invoice as any).clientName || null,
        clientEmail: (invoice as any).clientEmail || null,
        feeModel: 'project_management',
        propertyAddress: null,
        lineItems: (invoice.lineItems || []).map((li: any) => ({
          description: li.description || '',
          quantity: li.quantity || li.qty || 1,
          unitPrice: li.unitPrice || li.unitRate || li.unit_rate || 0,
          amount: li.amount || (li.quantity || li.qty || 1) * (li.unitPrice || li.unitRate || li.unit_rate || 0),
        })),
        subtotal: invoice.amount,
        platformFee: (invoice as any).platformFee || 0,
        totalAmount: (invoice as any).totalDue || invoice.totalAmount,
        currency: invoice.currency || 'GHS',
        // GHS amount for Paystack inline checkout (after FX conversion)
        paystackAmountGHS,
        fxRate,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        paymentLink: (invoice as any).paymentLink || null,
        paystackAccessCode: (invoice as any).paystackAccessCode || null,
        paystackPublicKey: config.paystack.publicKey || null,
        paidAt: invoice.paidDate || null,
        notes: invoice.notes,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch invoice' });
  }
});

// ── Public PM Invoice verify-payment endpoint (no auth — client payment page) ──
app.get('/api/v1/pm-invoices/public/:id/verify-payment/:reference', async (req, res) => {
  try {
    const { id: invoiceId, reference } = req.params;
    const secret = config.paystack.secretKey;
    if (!secret) {
      return res.status(500).json({ success: false, error: 'Payment verification unavailable' });
    }

    // Verify transaction with Paystack
    const axios = (await import('axios')).default;
    const verifyRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const verifyData = verifyRes.data;

    if (!verifyData.status || verifyData.data?.status !== 'success') {
      return res.json({ success: false, error: 'Payment not confirmed', paystackStatus: verifyData.data?.status });
    }

    // Mark the PM invoice as paid + link the ledger (idempotent — the Paystack
    // webhook may also reconcile this same reference).
    const { invoiceService } = await import('../services/project-management/invoiceService');
    const { invoice } = await invoiceService.confirmPayment(invoiceId, reference, {
      method: verifyData.data.channel || 'paystack',
      channel: verifyData.data.channel || 'paystack',
      provider: 'paystack',
      isPaystack: true,
    });

    logger.info('PM invoice payment verified', { invoiceId, reference, amount: verifyData.data.amount });
    res.json({ success: true, status: 'paid', invoiceId: invoice.id });
  } catch (error: any) {
    logger.error('Error verifying PM invoice payment', { error: error.message });
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// ── Public PM Invoice initiate-crypto endpoint (no auth — client crypto payment) ──
app.post(
  '/api/v1/pm-invoices/public/:id/initiate-crypto',
  validateRequest({ params: pmPublicInvoiceIdParamSchema, body: pmPublicInitiateCryptoSchema }),
  async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { invoiceService } = await import('../services/project-management/invoiceService');
    const invoice = await invoiceService.getById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    if (invoice.status === 'paid') {
      return res.status(400).json({ success: false, error: 'Invoice is already paid' });
    }

    const { payCurrency, payChain } = req.body;

    const { exchangeRateService } = await import('../../shared-services/payments/crypto');
    const { nowPaymentsService } = await import('../../shared-services/payments/crypto/nowPaymentsService');
    const { pool } = await import('../database');

    // Convert invoice total to USD for NOWPayments
    const invoiceCcy = (invoice.currency || 'GHS').toUpperCase();
    let usdAmount: number;
    if (invoiceCcy === 'USD') {
      usdAmount = (invoice as any).totalDue || invoice.totalAmount;
    } else {
      usdAmount = await exchangeRateService.convertGhsToUsd(
        (invoice as any).totalDue || invoice.totalAmount
      );
    }
    const ticker = payCurrency;

    const reference = `PM-INV-CRYPTO-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const frontendUrl = config.app.frontendUrl;

    const npResult = await nowPaymentsService.createPayment({
      priceAmount: usdAmount,
      priceCurrency: 'usd',
      payCurrency: ticker,
      orderId: reference,
      orderDescription: `PM Invoice ${invoice.invoiceNumber}`,
      ipnCallbackUrl: `${process.env.API_URL || 'https://api.propmetrik.com'}/api/v1/webhooks/nowpayments/ipn`,
      successUrl: `${frontendUrl}/payment/invoice?id=${invoice.id}&status=success`,
      cancelUrl: `${frontendUrl}/payment/invoice?id=${invoice.id}`,
    });

    // Link NOWPayments record to this PM invoice
    try {
      await pool.query(`
        UPDATE nowpayments_payments SET
          domain_record_type = $1,
          domain_record_id = $2,
          updated_at = NOW()
        WHERE nowpayments_id = $3
      `, ['project_invoice', invoice.id, npResult.payment_id]);
    } catch (dbErr: any) {
      logger.warn('Failed to link NOWPayments record to PM invoice:', dbErr.message);
    }

    // Record in payment_transactions ledger (pending until the NOWPayments IPN
    // confirms). Uses the real schema columns + the 'project' payment_type enum.
    try {
      await pool.query(`
        INSERT INTO payment_transactions (
          reference, payment_type, domain_record_type, domain_record_id,
          gross_amount, principal_amount, service_fee,
          currency, channel, provider, status,
          metadata, created_at
        ) VALUES ($1, 'project', 'project_invoice', $2, $3, $4, $5, $6, $7, 'nowpayments', 'pending', $8, NOW())
        ON CONFLICT (reference) DO NOTHING
      `, [
        reference,
        invoice.id,
        Math.round(invoice.totalAmount * 100),
        Math.round(invoice.amount * 100),
        Math.round(((invoice as any).platformFee || 0) * 100),
        invoice.currency || 'GHS',
        `crypto_${ticker}`,
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
      logger.warn('Failed to record PM payment transaction:', dbErr.message);
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
    logger.error('Error initiating crypto payment for PM invoice', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to initiate crypto payment' });
  }
});

// ── Public PM Invoice confirm-crypto endpoint (marks paid after NOWPayments confirms) ──
app.post(
  '/api/v1/pm-invoices/public/:id/confirm-crypto',
  validateRequest({ params: pmPublicInvoiceIdParamSchema, body: pmPublicConfirmCryptoSchema }),
  async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { pool } = await import('../database');
    const { paymentReference } = req.body;
    const invoiceId = req.params.id;

    // Verify this payment reference exists and is for this invoice.
    const txRow = await pool.query(
      `SELECT status FROM payment_transactions WHERE reference = $1 AND domain_record_id = $2`,
      [paymentReference, invoiceId]
    );
    if (txRow.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    // Trust the gateway, not the client: only confirm if NOWPayments actually
    // reports the payment finished, or the IPN already reconciled it to success.
    const npRow = await pool.query(
      `SELECT status, settled_at FROM nowpayments_payments WHERE payment_reference = $1`,
      [paymentReference]
    );
    const npStatus = (npRow.rows[0]?.status || '').toLowerCase();
    const gatewayConfirmed = ['finished', 'confirmed', 'sending'].includes(npStatus)
      || !!npRow.rows[0]?.settled_at
      || txRow.rows[0].status === 'success';

    if (!gatewayConfirmed) {
      // Not paid yet — let the client keep polling. Never mark paid on request alone.
      return res.json({ success: false, status: 'pending', gatewayStatus: npStatus || 'unknown' });
    }

    // Settle nowpayments_payments + reconcile the invoice idempotently.
    await pool.query(
      `UPDATE nowpayments_payments SET settled_at = COALESCE(settled_at, NOW()) WHERE payment_reference = $1`,
      [paymentReference]
    );
    const { invoiceService } = await import('../services/project-management/invoiceService');
    await invoiceService.confirmPayment(invoiceId, paymentReference, { method: 'crypto', channel: 'crypto', provider: 'nowpayments' });

    logger.info('PM invoice crypto payment confirmed', { invoiceId, paymentReference, gatewayStatus: npStatus });
    res.json({ success: true, status: 'paid' });
  } catch (error: any) {
    logger.error('Error confirming PM crypto payment', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to confirm payment' });
  }
});
}

export function registerGuideAssetsRoute(app: Application): void {
app.get('/api/guides/:folder/:file', async (req, res) => {
  try {
    const { folder, file } = req.params;
    // Sanitize path components
    if (!/^[\w-]+$/.test(folder) || !/^[\w.-]+$/.test(file)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    const { getFile } = await import('../database/minio');
    const key = `guides/${folder}/${file}`;
    const data = await getFile('propmetrik-media', key);
    const contentType = file.endsWith('.png') ? 'image/png'
      : file.endsWith('.md') ? 'text/markdown; charset=utf-8'
      : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h cache
    if (data.body && data.body.length > 0) {
      res.send(Buffer.from(data.body));
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: 'Guide asset not found' });
    }
    res.status(500).json({ error: 'Failed to serve guide asset' });
  }
});
}

export function registerTransmittalPublicRoutes(app: Application): void {
app.get('/api/v1/transmittals/public/acknowledge/:token', async (req, res) => {
  try {
    const result = await transmittalService.acknowledgeByToken(req.params.token, req.query.notes as string);
    if (!result.success) {
      return res.status(404).send(buildTransmittalAckPage({ error: result.error || 'Invalid or expired link.' }));
    }
    if (result.already) {
      return res.send(buildTransmittalAckPage({ title: 'Already Acknowledged', message: 'You have already acknowledged this transmittal. Thank you.' }));
    }
    return res.send(buildTransmittalAckPage({
      title: 'Acknowledged',
      message: `Transmittal ${result.transmittal_number} — "${result.subject}" has been acknowledged successfully.${result.recipient_name ? ` Thank you, ${result.recipient_name}.` : ''}`,
      items: result.items,
      token: result.token,
    }));
  } catch (err: any) {
    res.status(500).send(buildTransmittalAckPage({ error: 'An unexpected error occurred. Please try again.' }));
  }
});
app.get('/api/v1/transmittals/public/download/:token/:itemId', async (req, res) => {
  try {
    const { token, itemId } = req.params;
    // Validate token belongs to a real recipient
    const recipientResult = await pool.query(
      `SELECT r.transmittal_id FROM pm_transmittal_recipients r WHERE r.acknowledge_token = $1`,
      [token],
    );
    if (recipientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid link' });
    }
    // Fetch the item and verify it belongs to the transmittal
    const itemResult = await pool.query(
      `SELECT * FROM pm_transmittal_items WHERE id = $1 AND transmittal_id = $2`,
      [itemId, recipientResult.rows[0].transmittal_id],
    );
    if (itemResult.rows.length === 0 || !itemResult.rows[0].file_key) {
      return res.status(404).json({ error: 'File not found' });
    }
    const item = itemResult.rows[0];
    const bucket = buckets.documents || 'propmetrik-documents';
    const downloadUrl = await getPresignedDownloadUrl(bucket, item.file_key, 3600);
    res.redirect(downloadUrl);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate download link' });
  }
});
}

function buildTransmittalAckPage(opts: { title?: string; message?: string; error?: string; items?: any[]; token?: string }): string {
  const isError = !!opts.error;
  const heading = opts.title || (isError ? 'Error' : 'Success');
  const body = opts.error || opts.message || '';
  const color = isError ? '#ef4444' : '#10b981';
  const icon = isError
    ? '<svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    : '<svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

  const appUrl = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
  const itemsWithFiles = (opts.items || []).filter(i => i.file_key);
  const documentsHtml = itemsWithFiles.length > 0 && opts.token ? `
    <div style="margin-top:24px;text-align:left;border-top:1px solid #3f3f46;padding-top:20px;">
      <p style="color:#a1a1aa;font-size:11px;font-family:monospace;text-transform:uppercase;margin:0 0 12px;letter-spacing:1px;">Attached Documents</p>
      ${itemsWithFiles.map(item => `
        <a href="${appUrl}/api/v1/transmittals/public/download/${opts.token}/${item.id}" 
           style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#3f3f46;border-radius:8px;text-decoration:none;margin-bottom:8px;">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <div>
            <p style="color:#e4e4e7;font-size:14px;margin:0;">${item.document_title}</p>
            <p style="color:#71717a;font-size:11px;margin:2px 0 0;font-family:monospace;">${item.file_name || 'Download'}</p>
          </div>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2" style="margin-left:auto;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>
      `).join('')}
    </div>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${heading} | PROPMETRIK</title></head>
<body style="margin:0;padding:0;background:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
  <div style="background:#27272a;border-radius:12px;padding:48px;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.3);">
    <div style="margin-bottom:20px;">${icon}</div>
    <h1 style="color:${color};font-size:24px;font-family:monospace;margin:0 0 12px;">${heading}</h1>
    <p style="color:#d4d4d8;font-size:15px;line-height:1.6;margin:0 0 24px;">${body}</p>
    ${documentsHtml}
    <p style="color:#71717a;font-size:12px;font-family:monospace;margin:16px 0 0;">PROPMETRIK</p>
  </div>
</body></html>`;
}
