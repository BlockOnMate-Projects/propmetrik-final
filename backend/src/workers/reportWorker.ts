/**
 * Scheduled Report Worker
 *
 * BullMQ worker that processes scheduled CRM reports.
 * - Polls crm_scheduled_reports for due reports
 * - Generates report data (JSON/CSV)
 * - Sends via email
 * - Updates next_send_at
 */

// @ts-ignore
import { Queue, Worker, Job } from 'bullmq';
import { pool } from '../database';
import { logger } from '../utils/logger';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const connection = {
    host: REDIS_HOST,
    port: REDIS_PORT,
};

// ── Queue ──────────────────────────────────────────
export const reportQueue = new Queue('crm-reports', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 200,
    },
});

// ── Job types ──────────────────────────────────────
interface ReportJob {
    type: 'process_due_reports';
}

interface GenerateReportJob {
    type: 'generate_report';
    reportId: string;
    organizationId: string;
    reportType: string;
    format: string;
    recipients: string[];
    pipelineId?: string;
}

// ── Helper: compute next send time ─────────────────
function getNextSendAt(frequency: string): Date {
    const now = new Date();
    switch (frequency) {
        case 'daily': {
            const next = new Date(now);
            next.setDate(next.getDate() + 1);
            next.setHours(8, 0, 0, 0);
            return next;
        }
        case 'weekly': {
            const next = new Date(now);
            next.setDate(now.getDate() + (7 - now.getDay()) + 1);
            next.setHours(8, 0, 0, 0);
            return next;
        }
        default: { // monthly
            return new Date(now.getFullYear(), now.getMonth() + 1, 1, 8, 0, 0, 0);
        }
    }
}

// ── Helper: generate report data ───────────────────
async function generateReportData(
    organizationId: string,
    reportType: string,
    pipelineId?: string
): Promise<{ subject: string; body: string }> {
    const client = await pool.connect();
    try {
        let subject = 'CRM Report';
        let body = '';

        switch (reportType) {
            case 'pipeline_summary': {
                subject = 'Pipeline Summary Report';
                const pipelineWhere = pipelineId ? `AND d.pipeline_id = '${pipelineId}'` : '';
                const res = await client.query(
                    `SELECT d.deal_status, COUNT(*) as count,
                            COALESCE(SUM(d.deal_value), 0) as total_value,
                            COALESCE(AVG(d.deal_value), 0) as avg_value
                     FROM deals d
                     WHERE d.organization_id = $1 AND d.deleted_at IS NULL ${pipelineWhere}
                     GROUP BY d.deal_status`,
                    [organizationId]
                );
                body = `Pipeline Summary\n${'='.repeat(40)}\n`;
                for (const row of res.rows) {
                    body += `\n${row.deal_status}: ${row.count} deals | Total: ${Number(row.total_value).toLocaleString()} | Avg: ${Number(row.avg_value).toLocaleString()}`;
                }
                break;
            }
            case 'agent_performance': {
                subject = 'Agent Performance Report';
                const res = await client.query(
                    `SELECT a.first_name, a.last_name,
                            COUNT(d.id) as deal_count,
                            COALESCE(SUM(CASE WHEN d.deal_status = 'won' THEN 1 ELSE 0 END), 0) as won,
                            COALESCE(SUM(d.deal_value), 0) as total_value
                     FROM agents a
                     LEFT JOIN deals d ON d.assigned_agent = a.id AND d.deleted_at IS NULL
                     WHERE a.organization_id = $1 AND a.deleted_at IS NULL
                     GROUP BY a.id, a.first_name, a.last_name
                     ORDER BY total_value DESC`,
                    [organizationId]
                );
                body = `Agent Performance\n${'='.repeat(40)}\n`;
                for (const row of res.rows) {
                    body += `\n${row.first_name} ${row.last_name}: ${row.deal_count} deals (${row.won} won) | Value: ${Number(row.total_value).toLocaleString()}`;
                }
                break;
            }
            case 'contact_activity': {
                subject = 'Contact Activity Report';
                const res = await client.query(
                    `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_contacts_7d,
                            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_contacts_30d,
                            COUNT(*) as total_contacts
                     FROM contacts
                     WHERE organization_id = $1 AND deleted_at IS NULL`,
                    [organizationId]
                );
                const stats = res.rows[0];
                body = `Contact Activity\n${'='.repeat(40)}\nNew (7d): ${stats.new_contacts_7d}\nNew (30d): ${stats.new_contacts_30d}\nTotal: ${stats.total_contacts}`;
                break;
            }
            default: {
                subject = `CRM Report: ${reportType}`;
                body = `Report type "${reportType}" generated at ${new Date().toISOString()}`;
            }
        }

        return { subject, body };
    } finally {
        client.release();
    }
}

// ── Worker ─────────────────────────────────────────
const worker = new Worker(
    'crm-reports',
    async (job: Job<ReportJob | GenerateReportJob>) => {
        const { type } = job.data;
        logger.info(`[ReportWorker] Processing job ${job.id}: ${type}`);

        if (type === 'process_due_reports') {
            // Find all due reports
            const client = await pool.connect();
            try {
                const { rows } = await client.query(
                    `SELECT * FROM crm_scheduled_reports
                     WHERE is_active = true AND deleted_at IS NULL
                       AND next_send_at <= NOW()`
                );

                logger.info(`[ReportWorker] Found ${rows.length} due reports`);

                for (const report of rows) {
                    // Queue individual report generation
                    await reportQueue.add('generate-report', {
                        type: 'generate_report',
                        reportId: report.id,
                        organizationId: report.organization_id,
                        reportType: report.report_type,
                        format: report.format,
                        recipients: report.recipients,
                        pipelineId: report.pipeline_id,
                    } as GenerateReportJob);
                }
            } catch (err: any) {
                if (err.code === '42P01') {
                    logger.info('[ReportWorker] crm_scheduled_reports table not yet created — skipping');
                } else {
                    throw err;
                }
            } finally {
                client.release();
            }
        } else if (type === 'generate_report') {
            const data = job.data as GenerateReportJob;

            // Generate report content
            const { subject, body } = await generateReportData(
                data.organizationId,
                data.reportType,
                data.pipelineId
            );

            // Send email (best-effort — log if mailer unavailable)
            try {
                // Try to use the existing email service if available
                // @ts-ignore - dynamic import may not resolve at compile time
                const emailModule = await import('../services/emailService').catch(() => null);
                if (emailModule?.sendEmail) {
                    for (const recipient of data.recipients) {
                        await emailModule.sendEmail({
                            to: recipient,
                            subject: `[PropMetrik] ${subject}`,
                            text: body,
                        });
                    }
                    logger.info(`[ReportWorker] Sent "${subject}" to ${data.recipients.length} recipients`);
                } else {
                    logger.info(`[ReportWorker] Email service unavailable — report generated but not sent. Recipients: ${data.recipients.join(', ')}`);
                    logger.info(`[ReportWorker] Report content:\n${body}`);
                }
            } catch (emailErr) {
                logger.warn(`[ReportWorker] Failed to send email: ${emailErr}`);
            }

            // Update last_sent_at and next_send_at
            const client = await pool.connect();
            try {
                const { rows } = await client.query(
                    `SELECT frequency FROM crm_scheduled_reports WHERE id = $1`,
                    [data.reportId]
                );
                const frequency = rows[0]?.frequency || 'weekly';
                const nextSend = getNextSendAt(frequency);

                await client.query(
                    `UPDATE crm_scheduled_reports SET last_sent_at = NOW(), next_send_at = $2, updated_at = NOW() WHERE id = $1`,
                    [data.reportId, nextSend]
                );
            } finally {
                client.release();
            }
        }
    },
    {
        connection,
        concurrency: 2,
    }
);

worker.on('completed', (job: Job) => {
    logger.info(`[ReportWorker] Job ${job.id} completed`);
});

worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`[ReportWorker] Job ${job?.id} failed: ${err.message}`);
});

// Schedule recurring check every 5 minutes
export async function startReportScheduler() {
    // Add repeatable job to check for due reports
    await reportQueue.add(
        'check-due-reports',
        { type: 'process_due_reports' } as ReportJob,
        {
            repeat: { every: 5 * 60 * 1000 }, // every 5 minutes
        }
    );
    logger.info('[ReportWorker] Scheduled report checker started (every 5 min)');
}

export default worker;
