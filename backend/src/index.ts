import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger, logUnhandledException } from './utils/logger';
import { pool, checkHealth as checkDbHealth, checkPostGIS } from './database';
import { checkHealth as checkRedisHealth, closeAllConnections as closeRedis } from './database/redis';
import { checkHealth as checkOpenSearchHealth, initializeIndices } from './database/opensearch';
import { checkHealth as checkMinioHealth, initializeBuckets } from './database/minio';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { requestIdMiddleware } from './middleware/requestId';

// Import routes
import healthRoutes from './routes/health';
import dataHubRoutes from './routes/dataHub';

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
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
app.use('/api/v1/data-hub', dataHubRoutes);

// TODO: Add more route modules as they are created
// app.use('/api/v1/auth', authRoutes);
// app.use('/api/v1/users', userRoutes);
// app.use('/api/v1/properties', propertyRoutes);
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
