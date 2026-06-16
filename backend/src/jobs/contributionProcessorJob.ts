/**
 * Contribution Processor Scheduler (DH-C)
 *
 * Service hooks (PM/CRM/valuation) drop rows into the `contributions` queue with
 * validation_status='pending'. Nothing ever processed them, so they piled up
 * forever and the Data Hub looked dead. This job runs auto-validation over the
 * pending queue on a schedule: high-confidence contributions are approved and
 * marked applied (their property data already lives in `properties`), weak ones
 * are flagged for human review, and clearly bad ones are auto-rejected.
 *
 * @module jobs/contributionProcessorJob
 */

import cron from 'node-cron';
import { contributionService } from '../services/data-hub/contributionService';
import { logger } from '../utils/logger';

let running = false;

async function processOnce(): Promise<void> {
  if (running) {
    logger.info('Contribution processor: previous run still in progress, skipping this tick');
    return;
  }
  running = true;
  try {
    const summary = await contributionService.processPendingContributions(200);
    if (summary.processed > 0) {
      logger.info('Contribution processor sweep finished', summary);
    }
  } catch (error: any) {
    logger.error('Contribution processor sweep threw', { error: error.message });
  } finally {
    running = false;
  }
}

/**
 * Schedule the contribution processor hourly, plus a startup drain ~45s in.
 */
export function initContributionProcessorJob(): void {
  cron.schedule('15 * * * *', processOnce);
  setTimeout(() => { void processOnce(); }, 45_000);
  logger.info('Contribution processor job scheduled (hourly + startup drain)');
}

// CLI runner — `ts-node src/jobs/contributionProcessorJob.ts`
if (require.main === module) {
  contributionService.processPendingContributions(1000)
    .then((summary) => {
      console.log('Contribution processor sweep completed:', summary);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Contribution processor sweep failed:', error);
      process.exit(1);
    });
}
