import { Application } from 'express';
import { Server } from 'http';
import { config } from '../config';
import { logger } from '../utils/logger';
import { logUnhandledException } from '../utils/logger';
import { runStartupChecks } from './startup';
import { createShutdownHandler } from './shutdown';
import { workspaceWebSocketServer } from '../../shared-services/workspace/WorkspaceWebSocketServer';
import { analyticsStreamServer } from '../services/analytics/analyticsStreamServer';
import { initKobbyMonitor } from '../jobs/kobbyAIMonitor';
import { initWhatsAppDigest } from '../jobs/whatsappDigest';
import { initRentReminderJob } from '../jobs/rentReminderJob';
import { initCrmTaskReminderJob } from '../jobs/crmTaskReminderJob';
import { initDripExecutionJob } from '../jobs/dripExecutionJob';
import { initSubscriptionRenewalJob } from '../jobs/subscriptionRenewalJob';
import { initTenantAutopayJob } from '../jobs/tenantAutopayJob';
import { initDataHubSyncJob } from '../jobs/dataHubSyncJob';
import { initContributionProcessorJob } from '../jobs/contributionProcessorJob';
import { initAnalyticsRefreshJob } from '../jobs/analyticsRefreshJob';

const MAX_RETRIES = 5;

function registerBackgroundJobs(): void {
  initKobbyMonitor();
  initWhatsAppDigest();
  initRentReminderJob();
  initCrmTaskReminderJob();
  initDripExecutionJob();
  initSubscriptionRenewalJob();
  initTenantAutopayJob();
  initDataHubSyncJob();
  initContributionProcessorJob();
  initAnalyticsRefreshJob();
}

function registerProcessHandlers(shutdown: (signal: string) => Promise<void>): void {
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

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export function startServer(app: Application): Server {
  let retryCount = 0;

  const server = app.listen(config.port, async () => {
    retryCount = 0;

    // Allow long-lived SSE connections — default Node.js timeouts kill SSE streams.
    server.headersTimeout = 0;
    server.requestTimeout = 0;
    server.keepAliveTimeout = 65000;

    await runStartupChecks();

    if (config.app.runBackgroundJobs) {
      registerBackgroundJobs();
    } else {
      logger.info('Background cron jobs disabled (RUN_BACKGROUND_JOBS is not true in this environment)');
    }

    workspaceWebSocketServer.attach(server);
    analyticsStreamServer.attach(server);
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

  registerProcessHandlers(createShutdownHandler(server));
  return server;
}
