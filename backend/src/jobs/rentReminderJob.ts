/**
 * Rent Reminder Scheduler
 * Daily job to send rent reminders and overdue notices
 * 
 * @module scripts/rent-reminder-job
 */

import cron from 'node-cron';
import { rentScheduleService, RentScheduleStatus } from '../services/property-management/rent-collection/rentScheduleService';
import { notificationService } from '../../shared-services/notifications/unified';
import { notify } from '../../shared-services/notifications/in-mail';
import { logger } from '../utils/logger';
import { config } from '../config';
import db from '../database';

interface RentReminderConfig {
    daysBeforeDue: number[]; // e.g., [7, 3, 1] = 7 days, 3 days, 1 day before
    overdueReminders: number[]; // e.g., [1, 3, 7, 14] = days after overdue
    channel: 'sms' | 'email' | 'both';
}

const DEFAULT_CONFIG: RentReminderConfig = {
    daysBeforeDue: [7, 3, 1],
    overdueReminders: [1, 3, 7, 14, 30],
    channel: 'sms' // SMS primary for Ghana
};

export class RentReminderJob {
    private config: RentReminderConfig;

    constructor(config?: Partial<RentReminderConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Run the daily rent reminder job
     */
    async run(): Promise<{
        remindersSent: number;
        overdueNoticesSent: number;
        errors: string[];
    }> {
        logger.info('Starting rent reminder job');

        const results = {
            remindersSent: 0,
            overdueNoticesSent: 0,
            errors: [] as string[]
        };

        try {
            // 1. Update all schedule statuses first
            await rentScheduleService.updateScheduleStatuses();

            // 2. Send upcoming due reminders
            for (const daysAhead of this.config.daysBeforeDue) {
                const count = await this.sendDueReminders(daysAhead);
                results.remindersSent += count;
            }

            // 3. Send overdue notices
            for (const daysOverdue of this.config.overdueReminders) {
                const count = await this.sendOverdueNotices(daysOverdue);
                results.overdueNoticesSent += count;
            }

            // 4. Apply late fees where applicable
            await this.applyLateFees();

            logger.info('Rent reminder job completed', results);
        } catch (error: any) {
            logger.error('Rent reminder job failed', { error: error.message });
            results.errors.push(error.message);
        }

        return results;
    }

    /**
     * Send reminders for rent due in X days
     */
    private async sendDueReminders(daysAhead: number): Promise<number> {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysAhead);
        targetDate.setHours(0, 0, 0, 0);

        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        // Get schedules due on target date
        const query = `
            SELECT 
                rs.*,
                t.tenant_id,
                tn.full_name as tenant_name,
                tn.phone_primary as tenant_phone,
                tn.email as tenant_email,
                p.title as property_title,
                t.organization_id
            FROM rent_schedules rs
            JOIN tenancies t ON rs.tenancy_id = t.id
            JOIN tenants tn ON t.tenant_id = tn.id
            JOIN properties p ON t.property_id = p.id
            WHERE rs.due_date >= $1 AND rs.due_date < $2
            AND rs.status IN ($3, $4)
            AND rs.amount_paid < rs.expected_amount
        `;

        const result = await db.query(query, [
            targetDate.toISOString(),
            nextDay.toISOString(),
            RentScheduleStatus.UPCOMING,
            RentScheduleStatus.PARTIALLY_PAID
        ]);

        let sentCount = 0;

        for (const row of result.rows) {
            try {
                // Generate payment link
                const paymentLink = `${config.app.tenantPortalUrl}/dashboard/tenant/payments?tenancy=${row.tenancy_id}`;

                await notificationService.sendRentReminder(
                    this.config.channel,
                    { phone: row.tenant_phone, email: row.tenant_email },
                    {
                        tenantName: row.tenant_name,
                        propertyTitle: row.property_title,
                        amount: parseFloat(row.amount_outstanding || row.expected_amount),
                        currency: row.currency || 'GHS',
                        dueDate: new Date(row.due_date).toLocaleDateString('en-GB'),
                        paymentLink
                    },
                    row.organization_id
                );

                // In-app inbox push (email/SMS already handled above by notificationService)
                await notify({
                    recipients: {
                        audience: 'tenant',
                        userId: row.tenant_id,
                        email: row.tenant_email,
                        phone: row.tenant_phone,
                    },
                    category: 'finance',
                    type: 'rent.reminder',
                    title: 'Rent due soon',
                    body: `Your rent of ${row.currency || 'GHS'} ${parseFloat(row.amount_outstanding || row.expected_amount)} for ${row.property_title} is due on ${new Date(row.due_date).toLocaleDateString('en-GB')}.`,
                    organizationId: row.organization_id,
                    tenantActionUrl: `/dashboard/tenant/payments?tenancy=${row.tenancy_id}`,
                    channels: { inApp: true },
                });

                sentCount++;

                // Log the reminder
                await this.logNotification(row.organization_id, row.tenancy_id, row.id, 'rent_reminder', daysAhead);
            } catch (error: any) {
                logger.error('Failed to send rent reminder', {
                    tenancyId: row.tenancy_id,
                    error: error.message
                });
            }
        }

        logger.info(`Sent ${sentCount} rent reminders for ${daysAhead} days ahead`);
        return sentCount;
    }

    /**
     * Send overdue notices for rent X days past due
     */
    private async sendOverdueNotices(daysOverdue: number): Promise<number> {
        // Get schedules that are exactly X days overdue
        const query = `
            SELECT 
                rs.*,
                t.tenant_id,
                t.late_fee_amount,
                tn.full_name as tenant_name,
                tn.phone_primary as tenant_phone,
                tn.email as tenant_email,
                p.title as property_title,
                t.organization_id
            FROM rent_schedules rs
            JOIN tenancies t ON rs.tenancy_id = t.id
            JOIN tenants tn ON t.tenant_id = tn.id
            JOIN properties p ON t.property_id = p.id
            WHERE rs.status = $1
            AND rs.days_overdue = $2
            AND rs.amount_paid < rs.expected_amount
        `;

        const result = await db.query(query, [RentScheduleStatus.OVERDUE, daysOverdue]);

        let sentCount = 0;

        for (const row of result.rows) {
            try {
                const paymentLink = `${config.app.tenantPortalUrl}/dashboard/tenant/payments?tenancy=${row.tenancy_id}`;

                await notificationService.sendRentOverdueNotice(
                    this.config.channel,
                    { phone: row.tenant_phone, email: row.tenant_email },
                    {
                        tenantName: row.tenant_name,
                        propertyTitle: row.property_title,
                        amount: parseFloat(row.amount_outstanding || row.expected_amount),
                        currency: row.currency || 'GHS',
                        daysOverdue: row.days_overdue,
                        lateFee: parseFloat(row.late_fee_applied || row.late_fee_amount || 0),
                        paymentLink
                    },
                    row.organization_id
                );

                await notify({
                    recipients: {
                        audience: 'tenant',
                        userId: row.tenant_id,
                        email: row.tenant_email,
                        phone: row.tenant_phone,
                    },
                    category: 'finance',
                    type: 'rent.overdue',
                    title: 'Rent overdue',
                    body: `Your rent of ${row.currency || 'GHS'} ${parseFloat(row.amount_outstanding || row.expected_amount)} for ${row.property_title} is ${row.days_overdue} day(s) overdue.`,
                    priority: 'high',
                    organizationId: row.organization_id,
                    tenantActionUrl: `/dashboard/tenant/payments?tenancy=${row.tenancy_id}`,
                    channels: { inApp: true },
                });

                sentCount++;

                await this.logNotification(row.organization_id, row.tenancy_id, row.id, 'overdue_notice', daysOverdue);
            } catch (error: any) {
                logger.error('Failed to send overdue notice', {
                    tenancyId: row.tenancy_id,
                    error: error.message
                });
            }
        }

        logger.info(`Sent ${sentCount} overdue notices for ${daysOverdue} days overdue`);
        return sentCount;
    }

    /**
     * Apply late fees to overdue schedules past grace period
     */
    private async applyLateFees(): Promise<void> {
        // Get all organizations with overdue schedules
        const orgsResult = await db.query(`
            SELECT DISTINCT organization_id 
            FROM rent_schedules 
            WHERE status = 'overdue'
        `);

        for (const org of orgsResult.rows) {
            // Get all tenancies with overdue schedules
            const tenanciesResult = await db.query(`
                SELECT DISTINCT tenancy_id 
                FROM rent_schedules 
                WHERE organization_id = $1 AND status = 'overdue'
            `, [org.organization_id]);

            for (const tenancy of tenanciesResult.rows) {
                try {
                    await rentScheduleService.applyLateFees(tenancy.tenancy_id, org.organization_id);
                } catch (error: any) {
                    logger.error('Failed to apply late fees', {
                        tenancyId: tenancy.tenancy_id,
                        error: error.message
                    });
                }
            }
        }
    }

    /**
     * Log notification for audit trail
     */
    private async logNotification(
        organizationId: string,
        tenancyId: string,
        scheduleId: string,
        type: string,
        daysMark: number
    ): Promise<void> {
        try {
            await db.query(`
                INSERT INTO pm_audit_logs (
                    organization_id,
                    action,
                    resource_type,
                    resource_id,
                    details,
                    performed_by
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                organizationId,
                'notification_sent',
                'rent_schedule',
                scheduleId,
                JSON.stringify({
                    type,
                    tenancyId,
                    daysMark,
                    sentAt: new Date().toISOString()
                }),
                'system'
            ]);
        } catch (error) {
            // Non-critical, just log
            logger.warn('Failed to log notification', { scheduleId, type });
        }
    }
}

// CLI runner
if (require.main === module) {
    const job = new RentReminderJob();
    job.run()
        .then(results => {
            console.log('Job completed:', results);
            process.exit(0);
        })
        .catch(error => {
            console.error('Job failed:', error);
            process.exit(1);
        });
}

export const rentReminderJob = new RentReminderJob();

/**
 * Schedule the rent reminder job to run daily at 08:00 (server time).
 */
export function initRentReminderJob(): void {
    cron.schedule('0 8 * * *', async () => {
        try {
            const results = await rentReminderJob.run();
            logger.info('Scheduled rent reminder job finished', results);
        } catch (error: any) {
            logger.error('Scheduled rent reminder job threw', { error: error.message });
        }
    });
    logger.info('Rent reminder job scheduled (daily 08:00)');
}
