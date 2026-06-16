/**
 * Data Hub Sync Scheduler (DH-B)
 *
 * CRM/Deal properties live in their own `crm_properties` table. To become
 * valuation comparables they must be copied into the centralized `properties`
 * table (the data hub the valuation engine reads). That copy is done by
 * crmPropertySyncService.syncToDataHub — but historically it only ran when an
 * admin clicked a manual "sync" button, so CRM properties piled up at
 * sync_status='pending' and never enriched valuation.
 *
 * This job drains pending CRM property syncs across ALL organizations on a
 * schedule, so the data hub enriches itself automatically as people use Deal
 * Management. (PM-managed properties need no sync — they are written directly
 * into `properties`. Bridge mirrors are excluded to avoid double-counting.)
 *
 * @module jobs/dataHubSyncJob
 */

import cron from 'node-cron';
import { crmPropertySyncService } from '../services/crm-deal-management';
import { logger } from '../utils/logger';

let running = false;

async function drainOnce(): Promise<void> {
  if (running) {
    logger.info('Data Hub sync: previous run still in progress, skipping this tick');
    return;
  }
  running = true;
  try {
    const summary = await crmPropertySyncService.syncAllPending(200);
    if (summary.processed > 0) {
      logger.info('Data Hub sync sweep finished', summary);
    }
  } catch (error: any) {
    logger.error('Data Hub sync sweep threw', { error: error.message });
  } finally {
    running = false;
  }
}

/**
 * Schedule the CRM→data-hub sync sweep every 30 minutes.
 * Also runs once ~30s after startup to drain any existing backlog promptly.
 */
export function initDataHubSyncJob(): void {
  cron.schedule('*/30 * * * *', drainOnce);
  setTimeout(() => { void drainOnce(); }, 30_000);
  logger.info('Data Hub sync job scheduled (every 30 min + startup drain)');
}

// CLI runner — `ts-node src/jobs/dataHubSyncJob.ts`
if (require.main === module) {
  crmPropertySyncService.syncAllPending(500)
    .then((summary) => {
      console.log('Data Hub sync sweep completed:', summary);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Data Hub sync sweep failed:', error);
      process.exit(1);
    });
}
