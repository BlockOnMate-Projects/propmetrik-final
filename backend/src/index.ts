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

// Import shared services
import { realtimeEmitter } from '../shared-services/realtime';
import { notificationRoutes } from '../shared-services/notifications/in-mail';

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-User-Id', 'X-Organization-Id', 'X-PropMetrik-Token'],
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
app.use('/api/v1/valuations', valuationRoutes);
app.use('/api/valuations', valuationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/properties', propertyRoutes);
app.use('/api/public/properties', propertyRoutes);  // Also mount at public path for frontend compatibility
app.use('/api/v1/ingestion', ingestionRouter);
app.use('/api/v1/contributions', contributionRoutes);
app.use('/api/v1/pull-integrations', pullIntegrationRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/reports', reportRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/valuers', valuersRoutes);
app.use('/api/valuers', valuersRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/pm', propertyManagementRoutes);
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



// TODO: Add more route modules as they are created
// app.use('/api/v1/users', userRoutes);
// app.use('/api/v1/search', searchRoutes);


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

  // Stop accepting new requests
  server.close(async (err) => {
    if (err) {
      logger.error('Error during server close', { error: err.message });
    }

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
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
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
const server = app.listen(config.port, async () => {
  await bootstrap();
  logger.info(`Propmetrik API server running on port ${config.port}`, {
    env: config.env,
    version: process.env.npm_package_version || '1.0.0',
  });
});

export { app, server };
