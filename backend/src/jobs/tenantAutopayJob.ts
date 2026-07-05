/**
 * Tenant Rent Auto-Pay Scheduler
 * Daily job that charges outstanding rent against saved authorizations for every
 * active mandate due on the current day of the month (one attempt per mandate/month).
 *
 * @module jobs/tenantAutopayJob
 */

import cron from 'node-cron';
import { autopayService } from '../services/property-management/payment/autopayService';
import { logger } from '../utils/logger';

/**
 * Schedule the autopay sweep daily at 07:00 (server time) — after midnight rent
 * schedules have flipped to due/overdue, and within business hours so declines can
 * be actioned same-day.
 */
export function initTenantAutopayJob(): void {
    cron.schedule('0 7 * * *', async () => {
        try {
            const summary = await autopayService.chargeDueMandates();
            logger.info('Scheduled tenant autopay job finished', summary);
        } catch (error: any) {
            logger.error('Scheduled tenant autopay job threw', { error: error.message });
        }
    });
    logger.info('Tenant autopay job scheduled (daily 07:00)');
}

// CLI runner — `ts-node src/jobs/tenantAutopayJob.ts`
if (require.main === module) {
    autopayService.chargeDueMandates()
        .then((summary) => {
            console.log('Autopay sweep completed:', summary);
            process.exit(0);
        })
        .catch((error) => {
            console.error('Autopay sweep failed:', error);
            process.exit(1);
        });
}
