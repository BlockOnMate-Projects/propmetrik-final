import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger, logUnhandledException } from './utils/logger';
import { recordStep, finalizeReport, getStartupReport, printStartupSummary } from './utils/startupReport';
import { pool, checkHealth as checkDbHealth, checkPostGIS } from './database';
import { checkHealth as checkRedisHealth, closeAllConnections as closeRedis, connectAll as connectRedis } from './database/redis';
import { checkHealth as checkOpenSearchHealth, initializeIndices } from './database/opensearch';
import { checkHealth as checkMinioHealth, initializeBuckets, getPresignedDownloadUrl, buckets } from './database/minio';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { requestIdMiddleware } from './middleware/requestId';
import { authenticate, optionalAuth, requireAdmin } from './middleware/auth';
import { requirePMAccess } from './middleware/pmAuth';
import { requireServiceAccess } from './middleware/serviceAccess';
import { initSentry, installSentryErrorHandler, flushSentry } from './config/sentry';
import valuationClientsRouter from './routes/valuation-clients';

// Import routes
import healthRoutes from './routes/health';
import dataHubRoutes from './routes/dataHub';
import valuationRoutes from './routes/valuations';
import propertyRoutes from './routes/publicProperties';
import { ingestionRouter } from './routes/ingestion';
import contributionRoutes from './routes/contributions';
import pullIntegrationRoutes from './routes/pullIntegrations';
import reportRoutes from './routes/reports';
import valuersRoutes from './routes/valuers';
import propertyManagementRoutes from './routes/propertyManagement';
import crmRoutes from './routes/crm';
import marketplaceRoutes from './routes/marketplace';
import webhooksRoutes from './routes/webhooks';
import authIntegrationsRoutes from './routes/auth-integrations';
import authRoutes from './routes/auth';
import messagingRoutes from './routes/messaging';
import projectRoutes from './routes/projects';
import workflowRoutes from './routes/workflows';
import realtimeRoutes from './routes/realtime';
import calendarRoutes from './routes/calendar';
import analyticsRoutes from './routes/analytics';
import mlAnalyticsRoutes from './routes/mlAnalytics';
import analyticsFoundationRoutes from './routes/analyticsFoundation';
import valuationAnalyticsRoutes from './routes/valuationAnalytics';
import marketIntelligenceRoutes from './routes/marketIntelligence';
import managementMetricsRoutes from './routes/managementMetrics';
import tickerRoutes from './routes/ticker';
import budgetRoutes from './routes/budget';
import teamRoutes from './routes/team';
import vendorRoutes from './routes/vendors';
import integrationsRoutes from './routes/integrations';
import constructionRoutes from './routes/construction';
import rfiRoutes from './routes/rfis';
import changeOrderRoutes from './routes/changeOrders';
import submittalRoutes from './routes/submittals';
import portfolioRoutes from './routes/portfolio';
import whatsappRoutes from './routes/whatsapp';
import photoRoutes from './routes/photos';
import checklistRoutes from './routes/checklists';
import procurementRoutes from './routes/procurement';
import siteDiaryRoutes from './routes/siteDiaries';
import governanceRoutes from './routes/governance';
import docsRoutes from './routes/docs';
import litigationRoutes from './routes/litigation';
import shortStayRoutes from './routes/shortStay';
import ricsComplianceRoutes from './routes/ricsCompliance';
import floodRiskRoutes from './routes/floodRisk';
import adminRoutes from './routes/admin';
import tenantPortalRoutes from './routes/tenantPortal';
import eSignRoutes from './routes/eSign';
import valuationOrgRoutes from './routes/valuation-org';
import valuationInvoiceRoutes from './routes/valuation-invoices';
import enterpriseRoutes from './routes/enterprise';
import subscriptionRoutes from './routes/subscription';
import commercializationRoutes from './routes/commercialization';
import userProfileRoutes from './routes/user-profile';
import publicationsRoutes from './routes/publications';
import chartsRoutes from './routes/charts';
import autopilotRoutes from './routes/autopilot';
import workspaceRoutes from './routes/workspace';
import kobbyAIRoutes from './routes/kobbyAI';
import issueRoutes from './routes/issues';
import drawingRoutes from './routes/drawings';
import meetingRoutes from './routes/meetings';
import exportRoutes from './routes/exports';
import pmReportRoutes from './routes/pm-reports';
import safetyRoutes from './routes/safety';
import timesheetRoutes from './routes/timesheets';
import equipmentRoutes from './routes/equipment';
import biddingRoutes from './routes/bidding';
import bidManagementRoutes, { vendorRouter as bidVendorRouter } from './routes/bid-management';
import closeoutRoutes from './routes/closeout';
import auditLogRoutes from './routes/audit-log';
import customFieldRoutes from './routes/custom-fields';
import appIntegrationRoutes from './routes/app-integrations';
import xeroRoutes, { xeroPublicRouter } from './routes/xero';
import transmittalRoutes from './routes/transmittals';
import transmittalService from './services/project-management/transmittalService';
import invitationRoutes from './routes/invitations';
import rbacRoutes from './routes/rbac';
import serviceTeamRoutes from './routes/serviceTeam';
import { workspaceWebSocketServer } from '../shared-services/workspace/WorkspaceWebSocketServer';
import { initKobbyMonitor } from './jobs/kobbyAIMonitor';
import { initWhatsAppDigest } from './jobs/whatsappDigest';

// Import shared services
import { realtimeEmitter } from '../shared-services/realtime';
import { notificationRoutes } from '../shared-services/notifications/in-mail';

// Import autopilot scheduler
import { autopilotScheduler } from '../shared-services/publications/autopilot';

// Import Data Hub queue manager and scrapy scheduler
import { dataHubQueueManager } from './services/data-hub';
import { scrapyScheduler } from './services/data-hub/scrapyScheduler';
import { economicDataScheduler } from './services/data-hub/schedulers';

// Create Express application
const app: Application = express();

// Sentry APM — must be initialised before any route registration
initSentry(app);

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);



// Security middleware
app.use(helmet({
  contentSecurityPolicy: config.env === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origins,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-User-Id', 'X-Organization-Id', 'X-PROPMETRIK-Token', 'Cache-Control'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
}));

// Compression — exclude SSE endpoints (compression breaks EventSource streaming)
const compressMiddleware = compression();
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/realtime') || req.path.startsWith('/api/realtime')) {
    return next();
  }
  return compressMiddleware(req, res, next);
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID
app.use(requestIdMiddleware);

// Request logging
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/health/live',
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
}));

// Rate limiting
app.use(rateLimiter);

// API routes
app.use('/health', healthRoutes);
app.use('/api/docs', docsRoutes);  // OpenAPI documentation (PM + CRM)
app.use('/api/v1/data-hub', authenticate, requireServiceAccess('data_hub'), dataHubRoutes);
app.use('/api/v1/valuations', optionalAuth, valuationRoutes);
app.use('/api/valuations', optionalAuth, valuationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/properties', propertyRoutes);
app.use('/api/public/properties', propertyRoutes);  // Also mount at public path for frontend compatibility
app.use('/api/v1/ingestion', ingestionRouter);
app.use('/api/v1/contributions', authenticate, contributionRoutes);
app.use('/api/v1/pull-integrations', pullIntegrationRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/reports', reportRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/valuers', authenticate, requireServiceAccess('valuations'), valuersRoutes);
app.use('/api/valuers', authenticate, requireServiceAccess('valuations'), valuersRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/pm', authenticate, requireServiceAccess('property_management'), propertyManagementRoutes);
app.use('/api/v1/crm', authenticate, requireServiceAccess('crm'), crmRoutes);
app.use('/api/crm', authenticate, requireServiceAccess('crm'), crmRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/marketplace', marketplaceRoutes);  // Public marketplace - no auth required

// ── Public PM Invoice endpoint (no auth — client payment page) ──
app.get('/api/v1/pm-invoices/public/:id', async (req, res) => {
  try {
    const { invoiceService } = await import('./services/project-management/invoiceService');
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
        const { fxFeedService } = await import('./services/data-hub/scrapers/fxFeedService');
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

    // Mark the PM invoice as paid
    const { invoiceService } = await import('./services/project-management/invoiceService');
    const invoice = await invoiceService.markAsPaid(
      invoiceId,
      new Date(),
      reference,
      verifyData.data.channel || 'paystack'
    );

    logger.info('PM invoice payment verified', { invoiceId, reference, amount: verifyData.data.amount });
    res.json({ success: true, status: 'paid', invoiceId: invoice.id });
  } catch (error: any) {
    logger.error('Error verifying PM invoice payment', { error: error.message });
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// ── Public PM Invoice initiate-crypto endpoint (no auth — client crypto payment) ──
app.post('/api/v1/pm-invoices/public/:id/initiate-crypto', async (req, res) => {
  try {
    const { invoiceService } = await import('./services/project-management/invoiceService');
    const invoice = await invoiceService.getById(req.params.id);
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

    const { exchangeRateService } = await import('../shared-services/payments/crypto');
    const { nowPaymentsService } = await import('../shared-services/payments/crypto/nowPaymentsService');
    const { pool } = await import('./database');

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
    const ticker = payCurrency.toLowerCase();

    const reference = `PM-INV-CRYPTO-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.propmetrik.com';

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

    // Record in payment_transactions ledger
    try {
      await pool.query(`
        INSERT INTO payment_transactions (
          reference, payment_type, domain_record_type,
          entity_id, entity_type,
          gross_amount_pesewas, principal_amount_pesewas, service_fee_pesewas,
          currency, channel, status,
          metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      `, [
        reference,
        'project_management',
        'pm_invoice_payment',
        invoice.id,
        'project_invoice',
        Math.round(invoice.totalAmount * 100),
        Math.round(invoice.amount * 100),
        Math.round(((invoice as any).platformFee || 0) * 100),
        invoice.currency || 'GHS',
        `crypto_${ticker}`,
        'pending',
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
app.post('/api/v1/pm-invoices/public/:id/confirm-crypto', async (req, res) => {
  try {
    const { pool } = await import('./database');
    const { paymentReference } = req.body;
    const invoiceId = req.params.id;

    if (!paymentReference) {
      return res.status(400).json({ success: false, error: 'paymentReference required' });
    }

    // Verify this payment reference exists and is for this invoice
    const txRow = await pool.query(
      `SELECT status FROM payment_transactions WHERE reference = $1 AND entity_id = $2`,
      [paymentReference, invoiceId]
    );
    if (txRow.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    // Mark payment_transactions as success
    await pool.query(
      `UPDATE payment_transactions SET status = 'success', verified_at = NOW() WHERE reference = $1 AND status = 'pending'`,
      [paymentReference]
    );

    // Mark the PM invoice as paid
    await pool.query(
      `UPDATE project_invoices SET status = 'paid', paid_date = NOW(), payment_reference = $1, payment_method = 'crypto' WHERE id = $2 AND status != 'paid'`,
      [paymentReference, invoiceId]
    );

    // Settle nowpayments_payments
    await pool.query(
      `UPDATE nowpayments_payments SET settled_at = COALESCE(settled_at, NOW()) WHERE payment_reference = $1`,
      [paymentReference]
    );

    logger.info('PM invoice crypto payment confirmed', { invoiceId, paymentReference });
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error confirming PM crypto payment', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to confirm payment' });
  }
});

// ── Guide Assets (public, served from S3/MinIO) ──────────────────────────────
// MUST be registered before any broad /api auth middleware mounts
app.get('/api/guides/:folder/:file', async (req, res) => {
  try {
    const { folder, file } = req.params;
    // Sanitize path components
    if (!/^[\w-]+$/.test(folder) || !/^[\w.-]+$/.test(file)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    const { getFile } = await import('./database/minio');
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

app.use('/api/v1/webhooks', webhooksRoutes);
app.use('/api/v1/auth', authRoutes);  // User authentication routes
app.use('/api/v1/auth', authIntegrationsRoutes);  // OAuth integrations
app.use('/api/v1/messaging', authenticate, messagingRoutes);
app.use('/api/messaging', authenticate, messagingRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/projects', authenticate, requirePMAccess, requireServiceAccess('projects'), projectRoutes);
app.use('/api/projects', authenticate, requirePMAccess, requireServiceAccess('projects'), projectRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/workflows', authenticate, requirePMAccess, requireServiceAccess('projects'), workflowRoutes);
app.use('/api/workflows', authenticate, requirePMAccess, requireServiceAccess('projects'), workflowRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/realtime', authenticate, requirePMAccess, requireServiceAccess('projects'), realtimeRoutes);
app.use('/api/realtime', authenticate, requirePMAccess, requireServiceAccess('projects'), realtimeRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/calendar', authenticate, requirePMAccess, requireServiceAccess('projects'), calendarRoutes);
app.use('/api/calendar', authenticate, requirePMAccess, requireServiceAccess('projects'), calendarRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics', authenticate, requireServiceAccess('analytics'), analyticsRoutes);
app.use('/api/analytics', authenticate, requireServiceAccess('analytics'), analyticsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/ml', authenticate, requireServiceAccess('analytics'), mlAnalyticsRoutes);  // ML Analytics (Sections 1-4, 8.1-8.7)
app.use('/api/analytics/ml', authenticate, requireServiceAccess('analytics'), mlAnalyticsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/platform', authenticate, requireServiceAccess('analytics'), analyticsFoundationRoutes);  // Phase 1 Foundation (CCI, GHAI, Alerts)
app.use('/api/analytics/platform', authenticate, requireServiceAccess('analytics'), analyticsFoundationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/valuations', authenticate, requireServiceAccess('analytics'), valuationAnalyticsRoutes);  // Phase 2 Valuation Analytics
app.use('/api/analytics/valuations', authenticate, requireServiceAccess('analytics'), valuationAnalyticsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/market', authenticate, requireServiceAccess('market_intelligence'), marketIntelligenceRoutes);  // Phase 3 Market Intelligence
app.use('/api/analytics/market', authenticate, requireServiceAccess('market_intelligence'), marketIntelligenceRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/management', authenticate, requireServiceAccess('analytics'), managementMetricsRoutes);  // Property Management Metrics
app.use('/api/analytics/management', authenticate, requireServiceAccess('analytics'), managementMetricsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/ticker', optionalAuth, tickerRoutes);
app.use('/api/ticker', optionalAuth, tickerRoutes);
app.use('/api/v1/budget', authenticate, requirePMAccess, requireServiceAccess('budget'), budgetRoutes);
app.use('/api/budget', authenticate, requirePMAccess, requireServiceAccess('budget'), budgetRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/team', authenticate, requirePMAccess, requireServiceAccess('projects'), teamRoutes);
app.use('/api/team', authenticate, requirePMAccess, requireServiceAccess('projects'), teamRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/vendors', authenticate, requirePMAccess, requireServiceAccess('projects'), vendorRoutes);
app.use('/api/vendors', authenticate, requirePMAccess, requireServiceAccess('projects'), vendorRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/integrations', authenticate, requireAdmin, integrationsRoutes);
app.use('/api/integrations', authenticate, requireAdmin, integrationsRoutes);  // Also mount for frontend compatibility

// Valuation Invoice Routes — mounted BEFORE catch-all /api/v1 auth routes so public endpoints work
app.use('/api/v1/valuation-invoices', valuationInvoiceRoutes);
app.use('/api/valuation-invoices', valuationInvoiceRoutes);  // Also mount for frontend compatibility

// ── Shared / Universal services ──────────────────────────────────────────────
// These MUST be mounted BEFORE any catch-all /api/v1 routers (construction,
// governance, issues, drawings, etc.) whose middleware would otherwise block
// requests from users without the relevant service subscription.
app.use('/api/v1/notifications', authenticate, notificationRoutes);
app.use('/api/notifications', authenticate, notificationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/admin', authenticate, requireAdmin, adminRoutes);
app.use('/api/admin', authenticate, requireAdmin, adminRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/user', authenticate, userProfileRoutes);
app.use('/api/user', authenticate, userProfileRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/rbac', authenticate, rbacRoutes);
app.use('/api/rbac', authenticate, rbacRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/service-team', authenticate, serviceTeamRoutes);
app.use('/api/service-team', authenticate, serviceTeamRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/workspace', authenticate, workspaceRoutes);
app.use('/api/workspace', authenticate, workspaceRoutes);  // Also mount for frontend compatibility

// ── Catch-all /api/v1 routers (construction, governance, etc.) ───────────────
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), constructionRoutes); // Construction Ops (Site Diaries, Petty Cash, Market Prices)
app.use('/api/v1/rfis', authenticate, requirePMAccess, requireServiceAccess('construction'), rfiRoutes);
app.use('/api/rfis', authenticate, requirePMAccess, requireServiceAccess('construction'), rfiRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/change-orders', authenticate, requirePMAccess, requireServiceAccess('construction'), changeOrderRoutes);
app.use('/api/change-orders', authenticate, requirePMAccess, requireServiceAccess('construction'), changeOrderRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/submittals', authenticate, requirePMAccess, requireServiceAccess('construction'), submittalRoutes);
app.use('/api/submittals', authenticate, requirePMAccess, requireServiceAccess('construction'), submittalRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/portfolio', authenticate, requirePMAccess, requireServiceAccess('portfolio'), portfolioRoutes);
app.use('/api/portfolio', authenticate, requirePMAccess, requireServiceAccess('portfolio'), portfolioRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/whatsapp', whatsappRoutes);
app.use('/api/whatsapp', whatsappRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/photos', authenticate, requirePMAccess, requireServiceAccess('construction'), photoRoutes);
app.use('/api/photos', authenticate, requirePMAccess, requireServiceAccess('construction'), photoRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/checklists', authenticate, requirePMAccess, requireServiceAccess('construction'), checklistRoutes);
app.use('/api/checklists', authenticate, requirePMAccess, requireServiceAccess('construction'), checklistRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/procurement', authenticate, requirePMAccess, requireServiceAccess('procurement'), procurementRoutes);
app.use('/api/procurement', authenticate, requirePMAccess, requireServiceAccess('procurement'), procurementRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/site-diaries', authenticate, requirePMAccess, requireServiceAccess('construction'), siteDiaryRoutes);
app.use('/api/site-diaries', authenticate, requirePMAccess, requireServiceAccess('construction'), siteDiaryRoutes);  // Also mount for frontend compatibility
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), governanceRoutes);  // Governance: milestone-frameworks, framework-phases, milestone-templates

// Critical Data Gaps: Litigation Risk & Short-Stay Metrics
app.use('/api/v1/litigation', authenticate, requireServiceAccess('litigation'), litigationRoutes);
app.use('/api/litigation', authenticate, requireServiceAccess('litigation'), litigationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/short-stay', authenticate, requireServiceAccess('short_stay'), shortStayRoutes);
app.use('/api/short-stay', authenticate, requireServiceAccess('short_stay'), shortStayRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/rics-compliance', authenticate, requireServiceAccess('valuations'), ricsComplianceRoutes);
app.use('/api/rics-compliance', authenticate, requireServiceAccess('valuations'), ricsComplianceRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/flood-risk', authenticate, requireServiceAccess('valuations'), floodRiskRoutes);
app.use('/api/flood-risk', authenticate, requireServiceAccess('valuations'), floodRiskRoutes);  // Also mount for frontend compatibility

// Issues & Risks Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), issueRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), issueRoutes);  // frontend compat

// Drawing Management Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), drawingRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), drawingRoutes);  // frontend compat

// Meeting Minutes Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), meetingRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), meetingRoutes);  // frontend compat

// Data Export Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), exportRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), exportRoutes);  // frontend compat

// PM PDF Report Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), pmReportRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), pmReportRoutes);  // frontend compat

// Safety & Incident Management Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), safetyRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), safetyRoutes);

// Time Tracking & Timesheets Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), timesheetRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), timesheetRoutes);

// Equipment Tracking Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), equipmentRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), equipmentRoutes);

// Bidding & Prequalification Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), biddingRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), biddingRoutes);

// Bid Management Routes (authenticated)
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), bidManagementRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), bidManagementRoutes);

// Public Vendor Bid Portal (token-based, no auth)
app.use('/api/v1', bidVendorRouter);
app.use('/api', bidVendorRouter);

// Closeout & Warranty Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), closeoutRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), closeoutRoutes);

// Audit Log Routes (SOC 2)
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), auditLogRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), auditLogRoutes);

// Custom Fields Framework Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), customFieldRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), customFieldRoutes);

// App Marketplace & Integration Framework Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), appIntegrationRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), appIntegrationRoutes);

// Xero OAuth2 + Cost Sync Routes
// Public callback — no auth (Xero redirects back without our Bearer token)
app.use('/api/v1', xeroPublicRouter);
app.use('/api', xeroPublicRouter);
// Protected Xero routes (auth + status + sync)
app.use('/api/v1', authenticate, requirePMAccess, xeroRoutes);
app.use('/api', authenticate, requirePMAccess, xeroRoutes);

// PM Transmittals Routes (document distribution & acknowledgement)
// Public acknowledge endpoint (no auth — token-based from email link)
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
// Public download endpoint — token-based file access from email link
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
// Authenticated transmittal routes
app.use('/api/v1/transmittals', authenticate, requirePMAccess, requireServiceAccess('projects'), transmittalRoutes);
app.use('/api/transmittals', authenticate, requirePMAccess, requireServiceAccess('projects'), transmittalRoutes);

// Commercialization Routes (usage analytics, customer success, API catalog, onboarding)
app.use('/api/v1/admin/platform', authenticate, requireAdmin, commercializationRoutes);
app.use('/api/admin/platform', authenticate, requireAdmin, commercializationRoutes);

// Tenant Portal Routes (auth, conversations, payments, maintenance, documents)
app.use('/api/v1/tenant-portal', tenantPortalRoutes);
app.use('/api/tenant-portal', tenantPortalRoutes);  // Also mount for frontend compatibility

// E-Sign Routes (signature envelopes, signer IDs, certificate of completion)
// Uses optionalAuth: public signing endpoints use token-based auth, internal endpoints check req.user
app.use('/api/v1/esign', optionalAuth, eSignRoutes);
app.use('/api/esign', optionalAuth, eSignRoutes);  // Also mount for frontend compatibility

// Unified Invitations (public token endpoints + authenticated management)
// Auth handled internally: token routes are public, management routes use authenticate + authorize
app.use('/api/v1/invitations', invitationRoutes);
app.use('/api/invitations', invitationRoutes);  // Also mount for frontend compatibility

// Valuation Org Routes (RBAC, team management, invitations)
app.use('/api/v1/valuation-org', valuationOrgRoutes);
app.use('/api/valuation-org', valuationOrgRoutes);  // Also mount for frontend compatibility

// Enterprise B2B Routes (org settings, approval chains, API keys, firm analytics)
app.use('/api/v1/enterprise', enterpriseRoutes);
app.use('/api/enterprise', enterpriseRoutes);  // Also mount for frontend compatibility

// Subscription & Billing Routes (plans, subscriptions, invoices, usage)
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/subscriptions', subscriptionRoutes);  // Also mount for frontend compatibility

// Valuation Clients Routes
app.use('/api/v1/valuation-clients', authenticate, valuationClientsRouter);
app.use('/api/valuation-clients', authenticate, valuationClientsRouter);  // Also mount for frontend compatibility



// Publications & Research CMS Routes
app.use('/api/v1/publications', authenticate, requireServiceAccess('valuations'), publicationsRoutes);
app.use('/api/publications', authenticate, requireServiceAccess('valuations'), publicationsRoutes);  // Also mount for frontend compatibility

// Charts API (catalog, preview, snapshots for publications)
app.use('/api/v1/charts', authenticate, requireServiceAccess('valuations'), chartsRoutes);
app.use('/api/charts', authenticate, requireServiceAccess('valuations'), chartsRoutes);  // Also mount for frontend compatibility

// Autopilot Pipeline Routes (autonomous publication scheduling & management)
app.use('/api/v1/autopilot', authenticate, requireAdmin, autopilotRoutes);
app.use('/api/autopilot', authenticate, requireAdmin, autopilotRoutes);  // Also mount for frontend compatibility

// Kobby AI Routes (workspace AI assistant)
app.use('/api/v1/ai/kobby', authenticate, kobbyAIRoutes);
app.use('/api/ai/kobby', authenticate, kobbyAIRoutes);  // Also mount for frontend compatibility


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Sentry error handler (must be after routes, before our error handler)
installSentryErrorHandler(app);

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Close the HTTP server first to release the port immediately
  await new Promise<void>((resolve) => {
    server.close((err) => {
      if (err) {
        logger.error('Error during server close', { error: err.message });
      }
      resolve();
    });
    // If server.close hangs (e.g. keep-alive connections), force after 3s
    setTimeout(resolve, 3000);
  });

  try {
    // Shutdown realtime connections
    realtimeEmitter.shutdown();
    logger.info('Realtime connections closed');

    // Shutdown Data Hub queues
    await dataHubQueueManager.shutdown();
    logger.info('Data Hub queues closed');

    // Close database connections
    await pool.end();
    logger.info('PostgreSQL pool closed');

    // Close Redis connections
    await closeRedis();
    logger.info('Redis connections closed');

    // Flush Sentry events before exit
    await flushSentry();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (shutdownError) {
    logger.error('Error during graceful shutdown', { error: shutdownError });
    process.exit(1);
  }
}

// Initialize services and start server
async function bootstrap(): Promise<void> {
  try {
    logger.info('Starting Propmetrik API server...');

    // ── 1. Redis ────────────────────────────────────────
    await recordStep('Redis connect', async () => {
      try {
        await connectRedis();
        const h = await checkRedisHealth();
        return h.connected
          ? { status: 'ok', detail: `clients: ${h.clients}` }
          : { status: 'warn', detail: 'connected but health check reports disconnected' };
      } catch (e) {
        return { status: 'warn', detail: (e as Error).message };
      }
    });

    // ── 2. PostgreSQL ──────────────────────────────────
    await recordStep('PostgreSQL', async () => {
      const h = await checkDbHealth();
      return h.connected
        ? { status: 'ok', detail: `pool=${h.poolSize} latency=${h.latency}ms` }
        : { status: 'fail', detail: `latency=${h.latency}ms pool=${h.poolSize}` };
    });

    // ── 3. PostGIS ─────────────────────────────────────
    await recordStep('PostGIS', async () => {
      const h = await checkPostGIS();
      return h.available
        ? { status: 'ok', detail: `v${h.version}` }
        : { status: 'warn', detail: 'extension not available' };
    });

    // ── 4. OpenSearch ──────────────────────────────────
    const osOk = (await recordStep('OpenSearch', async () => {
      const h = await checkOpenSearchHealth();
      return h ? { status: 'ok' } : { status: 'warn', detail: 'unreachable' };
    })).status === 'ok';

    // ── 5. MinIO ──────────────────────────────────────
    const minioOk = (await recordStep('MinIO', async () => {
      const h = await checkMinioHealth();
      return h.connected
        ? { status: 'ok', detail: `buckets: ${Object.keys(h.buckets).join(', ')}` }
        : { status: 'warn', detail: 'unreachable' };
    })).status === 'ok';

    // ── 6. OpenSearch indices ──────────────────────────
    if (osOk) {
      await recordStep('OpenSearch indices', async () => {
        await initializeIndices();
        return { status: 'ok' };
      });
    }

    // ── 7. MinIO buckets ──────────────────────────────
    if (minioOk) {
      await recordStep('MinIO buckets', async () => {
        await initializeBuckets();
        return { status: 'ok' };
      });
    }

    // ── 8. Data Hub queues ─────────────────────────────
    await recordStep('Data Hub queues', async () => {
      await dataHubQueueManager.initialize();
      return { status: 'ok' };
    });

    // ── 9. Scrapy scheduler ───────────────────────────
    await recordStep('Scrapy scheduler', async () => {
      await scrapyScheduler.start();
      return { status: 'ok', detail: `spiders: ${scrapyScheduler.getStatus().config.enabledSpiders}` };
    });

    // ── 10. Economic data scheduler ───────────────────
    await recordStep('Economic data scheduler', async () => {
      economicDataScheduler.start();
      return { status: 'ok', detail: `jobs: ${Object.keys(economicDataScheduler.getStatus()).join(', ')}` };
    });

    // ── 11. Autopilot scheduler ───────────────────────
    await recordStep('Autopilot scheduler', async () => {
      await autopilotScheduler.start();
      return { status: 'ok' };
    });

  } catch (error) {
    const err = error as Error;
    logger.error('Unexpected error in bootstrap — server stays alive for diagnostics', {
      error: err.message,
      stack: err.stack,
    });
  } finally {
    // Always print the full report so `docker logs` has everything in one place
    finalizeReport();
    printStartupSummary();
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logUnhandledException(error, 'uncaughtException');
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logUnhandledException(
    reason instanceof Error ? reason : new Error(String(reason)),
    'unhandledRejection'
  );
});

// Handle termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
let retryCount = 0;
const MAX_RETRIES = 5;

const server = app.listen(config.port, async () => {
  retryCount = 0; // reset on successful listen

  // Allow long-lived SSE connections — default Node.js timeouts (60s headers,
  // 120s request) kill SSE streams before heartbeats can keep them alive.
  server.headersTimeout = 0;   // No timeout on header reception
  server.requestTimeout = 0;   // No timeout on request duration (SSE is indefinite)
  server.keepAliveTimeout = 65000; // Slightly above typical proxy keep-alive (60s)

  await bootstrap();
  // Start Kobby AI Proactive Monitor
  initKobbyMonitor();
  // Start WhatsApp Daily Digest
  initWhatsAppDigest();
  // Attach WebSocket server for workspace real-time collaboration
  workspaceWebSocketServer.attach(server);
  logger.info(`Propmetrik API server running on port ${config.port}`, {
    env: config.env,
    version: process.env.npm_package_version || '1.0.0',
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    retryCount++;
    if (retryCount > MAX_RETRIES) {
      logger.error(`Port ${config.port} still in use after ${MAX_RETRIES} retries. Exiting.`);
      process.exit(1);
    }
    logger.warn(`Port ${config.port} in use, retry ${retryCount}/${MAX_RETRIES} in 2s...`);
    setTimeout(() => {
      server.close();
      server.listen(config.port);
    }, 2000);
  } else {
    logger.error('Server error', { error: err.message });
    process.exit(1);
  }
});

export { app, server };

// ── Helper: Transmittal public acknowledge page ─────────────────────────────
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
