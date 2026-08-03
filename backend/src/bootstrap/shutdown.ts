import { Server } from 'http';
import { logger } from '../utils/logger';
import { pool } from '../database';
import { closeAllConnections as closeRedis } from '../database/redis';
import { flushSentry } from '../config/sentry';
import { realtimeEmitter } from '../../shared-services/realtime';
import { dataHubQueueManager } from '../services/data-hub';
import { analyticsStreamServer } from '../services/analytics/analyticsStreamServer';

export function createShutdownHandler(server: Server) {
  return async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Close analytics WebSocket clients + Redis subscriber before the HTTP server.
  await analyticsStreamServer.shutdown().catch(() => {});

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
  };
}
