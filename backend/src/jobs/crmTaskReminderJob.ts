/**
 * CRM Task Reminder Scheduler
 * Daily job to remind assignees of tasks due soon and tasks that are overdue.
 *
 * Uses exact-day thresholds (due in N days / overdue by N days) so a given task
 * is reminded at most once per threshold — no per-day spam and no dedup table.
 *
 * @module jobs/crmTaskReminderJob
 */

import cron from 'node-cron';
import { notify } from '../../shared-services/notifications/in-mail';
import { logger } from '../utils/logger';
import db from '../database';

interface CrmTaskReminderConfig {
    daysBeforeDue: number[];   // e.g. [1] = remind 1 day before due
    overdueReminders: number[]; // e.g. [1, 3, 7] = days after due
}

const DEFAULT_CONFIG: CrmTaskReminderConfig = {
    daysBeforeDue: [1],
    overdueReminders: [1, 3, 7],
};

export class CrmTaskReminderJob {
    private config: CrmTaskReminderConfig;

    constructor(config?: Partial<CrmTaskReminderConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async run(): Promise<{ dueRemindersSent: number; overdueRemindersSent: number; errors: string[] }> {
        logger.info('Starting CRM task reminder job');

        const results = { dueRemindersSent: 0, overdueRemindersSent: 0, errors: [] as string[] };

        try {
            for (const daysAhead of this.config.daysBeforeDue) {
                results.dueRemindersSent += await this.sendDueReminders(daysAhead);
            }
            for (const daysOverdue of this.config.overdueReminders) {
                results.overdueRemindersSent += await this.sendOverdueReminders(daysOverdue);
            }
            logger.info('CRM task reminder job completed', results);
        } catch (error: any) {
            logger.error('CRM task reminder job failed', { error: error.message });
            results.errors.push(error.message);
        }

        return results;
    }

    private async sendDueReminders(daysAhead: number): Promise<number> {
        const rows = await this.fetchTasks(`t.due_date::date = (CURRENT_DATE + ($1 || ' days')::interval)::date`, daysAhead);
        let sent = 0;
        for (const row of rows) {
            const ok = await this.notifyAssignee(row, 'task.due_soon', 'Task due soon',
                `Your task "${row.title}" is due ${this.formatDate(row.due_date)}.`,
                row.priority === 'high' || row.priority === 'urgent' ? 'high' : 'normal');
            if (ok) sent++;
        }
        logger.info(`Sent ${sent} CRM task due reminders for ${daysAhead} day(s) ahead`);
        return sent;
    }

    private async sendOverdueReminders(daysOverdue: number): Promise<number> {
        const rows = await this.fetchTasks(`t.due_date::date = (CURRENT_DATE - ($1 || ' days')::interval)::date`, daysOverdue);
        let sent = 0;
        for (const row of rows) {
            const ok = await this.notifyAssignee(row, 'task.overdue', 'Task overdue',
                `Your task "${row.title}" is ${daysOverdue} day(s) overdue.`, 'high');
            if (ok) sent++;
        }
        logger.info(`Sent ${sent} CRM task overdue reminders for ${daysOverdue} day(s) overdue`);
        return sent;
    }

    private async fetchTasks(dateCondition: string, dayParam: number): Promise<any[]> {
        const result = await db.query(
            `SELECT t.id, t.title, t.priority, t.assigned_to, t.organization_id, t.deal_id, t.due_date,
                    u.email AS assignee_email, u.phone AS assignee_phone
               FROM tasks t
               JOIN users u ON t.assigned_to = u.id
              WHERE t.assigned_to IS NOT NULL
                AND t.task_status IN ('pending', 'in_progress')
                AND t.deleted_at IS NULL
                AND ${dateCondition}`,
            [dayParam],
        );
        return result.rows;
    }

    private async notifyAssignee(
        row: any,
        type: string,
        title: string,
        body: string,
        priority: 'normal' | 'high',
    ): Promise<boolean> {
        try {
            await notify({
                recipients: {
                    audience: 'staff',
                    userId: row.assigned_to,
                    email: row.assignee_email,
                    phone: row.assignee_phone,
                },
                category: 'crm',
                type,
                title,
                body,
                priority,
                organizationId: row.organization_id,
                sourceType: 'task',
                sourceId: row.id,
                sourceUrl: row.deal_id ? `/dashboard/deals/${row.deal_id}` : '/dashboard/deals/tasks',
                channels: { inApp: true, email: true },
            });
            return true;
        } catch (error: any) {
            logger.error('Failed to send CRM task reminder', { taskId: row.id, error: error.message });
            return false;
        }
    }

    private formatDate(date: Date | string): string {
        return new Date(date).toLocaleDateString('en-GB');
    }
}

export const crmTaskReminderJob = new CrmTaskReminderJob();

/**
 * Schedule the CRM task reminder job to run daily at 08:00 (server time).
 */
export function initCrmTaskReminderJob(): void {
    cron.schedule('0 8 * * *', async () => {
        try {
            const results = await crmTaskReminderJob.run();
            logger.info('Scheduled CRM task reminder job finished', results);
        } catch (error: any) {
            logger.error('Scheduled CRM task reminder job threw', { error: error.message });
        }
    });
    logger.info('CRM task reminder job scheduled (daily 08:00)');
}

// CLI runner
if (require.main === module) {
    crmTaskReminderJob.run()
        .then((results) => {
            console.log('Job completed:', results);
            process.exit(0);
        })
        .catch((error) => {
            console.error('Job failed:', error);
            process.exit(1);
        });
}
