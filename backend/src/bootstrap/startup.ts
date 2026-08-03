import { config } from '../config';
import { logger } from '../utils/logger';
import { recordStep, finalizeReport, printStartupSummary } from '../utils/startupReport';
import { checkHealth as checkDbHealth, checkPostGIS } from '../database';
import { checkHealth as checkRedisHealth, connectAll as connectRedis } from '../database/redis';
import { checkHealth as checkOpenSearchHealth, initializeIndices } from '../database/opensearch';
import { checkHealth as checkMinioHealth, initializeBuckets } from '../database/minio';
import { dataHubQueueManager } from '../services/data-hub';
import { scrapyScheduler } from '../services/data-hub/scrapyScheduler';
import { economicDataScheduler } from '../services/data-hub/schedulers';
import { analyticsScheduler } from '../services/analytics/analyticsScheduler';
import { autopilotScheduler } from '../../shared-services/publications/autopilot';

export async function runStartupChecks(): Promise<void> {
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
    if (config.app.runBackgroundJobs) {
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

      // ── 12. Analytics scheduler (derived snapshots + history) ──
      await recordStep('Analytics scheduler', async () => {
        await analyticsScheduler.start();
        return { status: 'ok', detail: 'GHAI/CCI/market/investment/valuation/RHDS monthly + startup catch-up' };
      });
    } else {
      await recordStep('Background jobs', async () => ({
        status: 'warn',
        detail: 'disabled (set RUN_BACKGROUND_JOBS=true to enable schedulers)',
      }));
    }

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
