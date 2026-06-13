/**
 * Subscription Renewal Scheduler
 * Daily job that auto-charges subscriptions whose billing period has ended,
 * retries past_due ones, and expires those cancelled at period end.
 *
 * @module jobs/subscriptionRenewalJob
 */

import cron from 'node-cron';
import { processDueRenewals } from '../../shared-services/payments/subscriptions/subscriptionBillingService';
import { logger } from '../utils/logger';

/**
 * Schedule the subscription renewal sweep daily at 02:00 (server time).
 * Off-peak so renewal charges don't compete with daytime traffic.
 */
export function initSubscriptionRenewalJob(): void {
  cron.schedule('0 2 * * *', async () => {
    try {
      const summary = await processDueRenewals();
      logger.info('Scheduled subscription renewal job finished', summary);
    } catch (error: any) {
      logger.error('Scheduled subscription renewal job threw', { error: error.message });
    }
  });
  logger.info('Subscription renewal job scheduled (daily 02:00)');
}

// CLI runner — `ts-node src/jobs/subscriptionRenewalJob.ts`
if (require.main === module) {
  processDueRenewals()
    .then((summary) => {
      console.log('Renewal sweep completed:', summary);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Renewal sweep failed:', error);
      process.exit(1);
    });
}
