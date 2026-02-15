#!/usr/bin/env node
/**
 * Data Hub Queue Worker
 * 
 * Dedicated process for processing background jobs from the ETL pipeline.
 * This worker has full Redis permissions and processes jobs independently.
 */

import { config } from '../src/config';
import { logger, logUnhandledException } from '../src/utils/logger';
import { pool, checkHealth as checkDbHealth } from '../src/database';
import { checkHealth as checkRedisHealth, closeAllConnections as closeRedis } from '../src/database/redis';
import { dataHubQueueManager } from '../src/services/data-hub';
import { scheduledGeocodingService } from '../src/services/data-hub/scheduledGeocodingService';

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logUnhandledException(error, 'uncaughtException');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logUnhandledException(
    reason instanceof Error ? reason : new Error(String(reason)),
    'unhandledRejection'
  );
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`Queue worker received ${signal}, starting graceful shutdown...`);
  
  try {
    // Stop scheduled geocoding service
    scheduledGeocodingService.stop();
    logger.info('Scheduled geocoding service stopped');
    
    // Shutdown queues
    await dataHubQueueManager.shutdown();
    logger.info('Queue workers shut down');
    
    // Close database connections
    await pool.end();
    logger.info('PostgreSQL pool closed');
    
    // Close Redis connections
    await closeRedis();
    logger.info('Redis connections closed');
    
    logger.info('Queue worker shutdown completed');
    process.exit(0);
  } catch (shutdownError) {
    logger.error('Error during queue worker shutdown', { error: shutdownError });
    process.exit(1);
  }
}

// Initialize and start queue worker
async function startWorker(): Promise<void> {
  try {
    logger.info('Starting PROPMETRIK Data Hub Queue Worker...');
    
    // Check database connections
    logger.info('Checking database connections...');
    
    const [dbHealth, redisHealth] = await Promise.all([
      checkDbHealth(),
      checkRedisHealth(),
    ]);
    
    if (!dbHealth) {
      throw new Error('PostgreSQL connection failed');
    }
    logger.info('PostgreSQL connected');
    
    if (!redisHealth.connected) {
      throw new Error('Redis connection failed');
    }
    logger.info('Redis connected', { clients: redisHealth.clients });
    
    // Initialize Data Hub queues with full processing
    await dataHubQueueManager.initializeWithProcessors();
    logger.info('Data Hub queue worker started with full processing');
    
    // Start scheduled geocoding service (runs every 5 minutes)
    const geocodingIntervalMinutes = parseInt(process.env.GEOCODING_INTERVAL_MINUTES || '5', 10);
    scheduledGeocodingService.start(geocodingIntervalMinutes);
    logger.info('Scheduled geocoding service started', { intervalMinutes: geocodingIntervalMinutes });
    
    // Keep the worker running
    logger.info('Queue worker is running and processing jobs...');
    
  } catch (error) {
    logger.fatal('Failed to start queue worker', { error });
    process.exit(1);
  }
}

// Handle termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the worker
startWorker().catch((error) => {
  logger.fatal('Queue worker startup failed', { error });
  process.exit(1);
});

export {};