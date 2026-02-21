import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger, logUnhandledException } from './utils/logger';
import { pool, checkHealth as checkDbHealth, checkPostGIS } from './database';
import { checkHealth as checkRedisHealth, closeAllConnections as closeRedis, connectAll as connectRedis } from './database/redis';
import { checkHealth as checkOpenSearchHealth, initializeIndices } from './database/opensearch';
import { checkHealth as checkMinioHealth, initializeBuckets } from './database/minio';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { requestIdMiddleware } from './middleware/requestId';
import { authenticate, optionalAuth } from './middleware/auth';
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
import { workspaceWebSocketServer } from '../shared-services/workspace/WorkspaceWebSocketServer';
import { initKobbyMonitor } from './jobs/kobbyAIMonitor';
import { initWhatsAppDigest } from './jobs/whatsappDigest';

// Import shared services
import { realtimeEmitter } from '../shared-services/realtime';
import { notificationRoutes } from '../shared-services/notifications/in-mail';

// Import autopilot scheduler
import { autopilotScheduler } from './services/publications/autopilot';

// Import Data Hub queue manager
import { dataHubQueueManager } from './services/data-hub';

// Create Express application
const app: Application = express();

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-User-Id', 'X-Organization-Id', 'X-PropMetrik-Token', 'Cache-Control'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
}));

// Compression
app.use(compression());

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
// app.use('/api/docs', docsRoutes);  // OpenAPI documentation - TODO: fix zod-to-openapi integration
app.use('/api/v1/data-hub', dataHubRoutes);
app.use('/api/v1/valuations', optionalAuth, valuationRoutes);
app.use('/api/valuations', optionalAuth, valuationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/properties', propertyRoutes);
app.use('/api/public/properties', propertyRoutes);  // Also mount at public path for frontend compatibility
app.use('/api/v1/ingestion', ingestionRouter);
app.use('/api/v1/contributions', contributionRoutes);
app.use('/api/v1/pull-integrations', pullIntegrationRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/reports', reportRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/valuers', valuersRoutes);
app.use('/api/valuers', valuersRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/pm', optionalAuth, propertyManagementRoutes);
app.use('/api/v1/crm', crmRoutes);
app.use('/api/crm', crmRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/webhooks', webhooksRoutes);
app.use('/api/v1/auth', authRoutes);  // User authentication routes
app.use('/api/v1/auth', authIntegrationsRoutes);  // OAuth integrations
app.use('/api/v1/messaging', messagingRoutes);
app.use('/api/messaging', messagingRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/projects', projectRoutes);
app.use('/api/projects', projectRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/workflows', workflowRoutes);
app.use('/api/workflows', workflowRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/realtime', realtimeRoutes);
app.use('/api/realtime', realtimeRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/calendar', calendarRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/analytics', analyticsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/ml', mlAnalyticsRoutes);  // ML Analytics (Sections 1-4, 8.1-8.7)
app.use('/api/analytics/ml', mlAnalyticsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/platform', analyticsFoundationRoutes);  // Phase 1 Foundation (CCI, GHAI, Alerts)
app.use('/api/analytics/platform', analyticsFoundationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/valuations', valuationAnalyticsRoutes);  // Phase 2 Valuation Analytics
app.use('/api/analytics/valuations', valuationAnalyticsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/market', marketIntelligenceRoutes);  // Phase 3 Market Intelligence
app.use('/api/analytics/market', marketIntelligenceRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/management', managementMetricsRoutes);  // Property Management Metrics
app.use('/api/analytics/management', managementMetricsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/ticker', tickerRoutes);
app.use('/api/ticker', tickerRoutes);
app.use('/api/v1/budget', budgetRoutes);
app.use('/api/budget', budgetRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/team', teamRoutes);
app.use('/api/team', teamRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/vendors', vendorRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/integrations', integrationsRoutes);
app.use('/api/integrations', integrationsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1', constructionRoutes); // Construction Ops (Site Diaries, Petty Cash, Market Prices)
app.use('/api/v1/rfis', rfiRoutes);
app.use('/api/rfis', rfiRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/change-orders', changeOrderRoutes);
app.use('/api/change-orders', changeOrderRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/submittals', submittalRoutes);
app.use('/api/submittals', submittalRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/portfolio', portfolioRoutes);
app.use('/api/portfolio', portfolioRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/whatsapp', whatsappRoutes);
app.use('/api/whatsapp', whatsappRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/photos', photoRoutes);
app.use('/api/photos', photoRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/checklists', checklistRoutes);
app.use('/api/checklists', checklistRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/procurement', procurementRoutes);
app.use('/api/procurement', procurementRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/site-diaries', siteDiaryRoutes);
app.use('/api/site-diaries', siteDiaryRoutes);  // Also mount for frontend compatibility
app.use('/api/v1', governanceRoutes);  // Governance: milestone-frameworks, framework-phases, milestone-templates

// Critical Data Gaps: Litigation Risk & Short-Stay Metrics
app.use('/api/v1/litigation', litigationRoutes);
app.use('/api/litigation', litigationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/short-stay', shortStayRoutes);
app.use('/api/short-stay', shortStayRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/rics-compliance', ricsComplianceRoutes);
app.use('/api/rics-compliance', ricsComplianceRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/flood-risk', floodRiskRoutes);
app.use('/api/flood-risk', floodRiskRoutes);  // Also mount for frontend compatibility

// In-Mail Notification System
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/notifications', notificationRoutes);  // Also mount for frontend compatibility

// Admin Routes (fee config, crypto payments admin, platform settings)
app.use('/api/v1/admin', adminRoutes);
app.use('/api/admin', adminRoutes);  // Also mount for frontend compatibility

// User Profile Routes (profile, password, notification prefs, stats)
app.use('/api/v1/user', userProfileRoutes);
app.use('/api/user', userProfileRoutes);  // Also mount for frontend compatibility

// Commercialization Routes (usage analytics, customer success, API catalog, onboarding)
app.use('/api/v1/admin/platform', commercializationRoutes);
app.use('/api/admin/platform', commercializationRoutes);

// Tenant Portal Routes (auth, conversations, payments, maintenance, documents)
app.use('/api/v1/tenant-portal', tenantPortalRoutes);
app.use('/api/tenant-portal', tenantPortalRoutes);  // Also mount for frontend compatibility

// E-Sign Routes (signature envelopes, signer IDs, certificate of completion)
app.use('/api/v1/esign', eSignRoutes);
app.use('/api/esign', eSignRoutes);  // Also mount for frontend compatibility

// Valuation Org Routes (RBAC, team management, invitations)
app.use('/api/v1/valuation-org', valuationOrgRoutes);
app.use('/api/valuation-org', valuationOrgRoutes);  // Also mount for frontend compatibility

// Valuation Invoice Routes (finance, invoicing, Paystack payments)
app.use('/api/v1/valuation-invoices', valuationInvoiceRoutes);
app.use('/api/valuation-invoices', valuationInvoiceRoutes);  // Also mount for frontend compatibility

// Enterprise B2B Routes (org settings, approval chains, API keys, firm analytics)
app.use('/api/v1/enterprise', enterpriseRoutes);
app.use('/api/enterprise', enterpriseRoutes);  // Also mount for frontend compatibility

// Subscription & Billing Routes (plans, subscriptions, invoices, usage)
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/subscriptions', subscriptionRoutes);  // Also mount for frontend compatibility

// Valuation Clients Routes
app.use('/api/v1/valuation-clients', valuationClientsRouter);
app.use('/api/valuation-clients', valuationClientsRouter);  // Also mount for frontend compatibility



// Publications & Research CMS Routes
app.use('/api/v1/publications', publicationsRoutes);
app.use('/api/publications', publicationsRoutes);  // Also mount for frontend compatibility

// Charts API (catalog, preview, snapshots for publications)
app.use('/api/v1/charts', chartsRoutes);
app.use('/api/charts', chartsRoutes);  // Also mount for frontend compatibility

// Autopilot Pipeline Routes (autonomous publication scheduling & management)
app.use('/api/v1/autopilot', autopilotRoutes);
app.use('/api/autopilot', autopilotRoutes);  // Also mount for frontend compatibility

// Workspace Collaboration Routes
app.use('/api/v1/workspace', workspaceRoutes);
app.use('/api/workspace', workspaceRoutes);  // Also mount for frontend compatibility

// Kobby AI Routes (workspace AI assistant)
app.use('/api/v1/ai/kobby', kobbyAIRoutes);
app.use('/api/ai/kobby', kobbyAIRoutes);  // Also mount for frontend compatibility


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

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

    // Connect Redis clients first (they use lazyConnect)
    logger.info('Connecting to Redis...');
    await connectRedis();

    // Check database connections
    logger.info('Checking database connections...');

    const [dbHealth, postgis, redisHealth, osHealth, minioHealth] = await Promise.all([
      checkDbHealth(),
      checkPostGIS(),
      checkRedisHealth(),
      checkOpenSearchHealth(),
      checkMinioHealth(),
    ]);

    if (!dbHealth) {
      throw new Error('PostgreSQL connection failed');
    }
    logger.info('PostgreSQL connected');

    if (!postgis) {
      logger.warn('PostGIS extension not available - spatial queries will fail');
    } else {
      logger.info('PostGIS extension available');
    }

    if (!redisHealth.connected) {
      throw new Error('Redis connection failed');
    }
    logger.info('Redis connected', { clients: redisHealth.clients });

    if (!osHealth) {
      logger.warn('OpenSearch connection failed - search will be unavailable');
    } else {
      logger.info('OpenSearch connected');
    }

    if (!minioHealth.connected) {
      logger.warn('MinIO connection failed - file storage will be unavailable');
    } else {
      logger.info('MinIO connected', { buckets: Object.keys(minioHealth.buckets) });
    }

    // Initialize OpenSearch indices if connected
    if (osHealth) {
      try {
        await initializeIndices();
        logger.info('OpenSearch indices initialized');
      } catch (indexError) {
        logger.warn('Failed to initialize OpenSearch indices', { error: indexError });
      }
    }

    // Initialize MinIO buckets if connected
    if (minioHealth.connected) {
      try {
        await initializeBuckets();
        logger.info('MinIO buckets initialized');
      } catch (bucketError) {
        logger.warn('Failed to initialize MinIO buckets', { error: bucketError });
      }
    }

    // Initialize Data Hub job queues
    try {
      await dataHubQueueManager.initialize();
      logger.info('Data Hub job queues initialized');
    } catch (queueError) {
      logger.warn('Failed to initialize Data Hub queues', { error: queueError });
    }

    // Start autopilot scheduler (non-blocking)
    try {
      await autopilotScheduler.start();
      logger.info('Autopilot scheduler initialized');
    } catch (autopilotError) {
      logger.warn('Failed to start autopilot scheduler', { error: autopilotError });
    }

    logger.info('All services initialized');

  } catch (error) {
    // Log full error details for debugging
    const err = error as Error;
    console.error('=== FATAL ERROR DETAILS ===');
    console.error('Message:', err.message);
    console.error('Name:', err.name);
    console.error('Stack:', err.stack);
    console.error('Full error:', error);
    logger.fatal('Failed to initialize services', {
      error: err.message,
      stack: err.stack,
      name: err.name
    });
    process.exit(1);
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
