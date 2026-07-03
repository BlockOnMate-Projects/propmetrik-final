/**
 * CRM Drip Campaign Execution Engine
 *
 * Completes the half-built drip feature: the schema (migration 219), CRUD routes,
 * and enrollment existed, but nothing ever *sent* a step. This node-cron job polls
 * for enrollments whose current step is due and delivers it by email via notify(),
 * then advances the enrollment.
 *
 * Enterprise properties:
 *  - Idempotent: crm_drip_step_sends (migration 271) is a send ledger keyed
 *    UNIQUE(enrollment_id, step_id). A step can never be emailed twice to the same
 *    enrollment — even across overlapping ticks or a crash between "email sent" and
 *    "enrollment advanced".
 *  - Bounded retries: failed sends are retried up to MAX_ATTEMPTS, then parked.
 *  - Atomic advance: "mark sent" + "advance enrollment" run in one transaction.
 *  - Org-scoped: organization_id is carried on every ledger row (derived from the
 *    campaign); no cross-tenant leakage.
 *  - Ordinal stepping: current_step is treated as a 0-based position into the
 *    campaign's steps ordered by step_order, so it works whether the author numbered
 *    steps 0-based, 1-based, or with gaps.
 *  - Merge fields: subject/body render through the shared CRM merge engine
 *    (documentGenerationService.renderString) — the same {{contact.*}} pipeline as
 *    generated documents (no duplicated rendering).
 *
 * @module jobs/dripExecutionJob
 */

import cron from 'node-cron';
import { notify } from '../../shared-services/notifications/in-mail';
import { logger } from '../utils/logger';
import db, { transaction } from '../database';
import { documentGenerationService } from '../services/crm-deal-management/documentGenerationService';
import { injectTracking } from '../services/crm-deal-management/campaignTracking';

export interface DripExecutionResult {
    processed: number;   // due steps examined this run
    sent: number;        // steps successfully emailed + advanced
    failed: number;      // steps whose send/advance threw
    completed: number;   // enrollments that finished their last step
    errors: string[];
}

const MAX_ATTEMPTS = 3;         // bounded retries per (enrollment, step)
const MAX_STEPS_PER_RUN = 200;  // batch cap per tick

type StepOutcome = 'sent' | 'failed' | 'skipped';

export class DripExecutionJob {
    private running = false;

    async run(): Promise<DripExecutionResult> {
        const result: DripExecutionResult = { processed: 0, sent: 0, failed: 0, completed: 0, errors: [] };

        // In-process guard: a slow tick must not overlap the next one (the ledger's
        // UNIQUE key is the hard guarantee, this just avoids wasted work).
        if (this.running) {
            logger.warn('[dripExecution] previous run still in progress — skipping tick');
            return result;
        }
        this.running = true;

        try {
            const due = await this.findDueSteps();
            for (const row of due) {
                result.processed++;
                try {
                    const outcome = await this.processStep(row);
                    if (outcome === 'sent') {
                        result.sent++;
                        if (row.is_last_step) result.completed++;
                    } else if (outcome === 'failed') {
                        result.failed++;
                    }
                } catch (err: any) {
                    result.failed++;
                    result.errors.push(err?.message || String(err));
                    logger.error('[dripExecution] step processing threw', {
                        enrollmentId: row.enrollment_id,
                        error: err?.message,
                    });
                }
            }
        } catch (err: any) {
            result.errors.push(err?.message || String(err));
            logger.error('[dripExecution] run failed', { error: err?.message });
        } finally {
            this.running = false;
        }

        return result;
    }

    /**
     * Find steps that are due to send.
     *
     * Due = active enrollment on an ACTIVE, non-deleted campaign, whose current step's
     * delay has elapsed (measured from the previous step's send, or from enrollment for
     * the first step), whose contact has a deliverable email, and which either has no
     * ledger row yet OR a failed one still under the retry cap.
     */
    private async findDueSteps(): Promise<any[]> {
        const { rows } = await db.query(
            `WITH ordered_steps AS (
                 SELECT s.id, s.campaign_id, s.subject, s.body, s.delay_days,
                        (ROW_NUMBER() OVER (PARTITION BY s.campaign_id
                                            ORDER BY s.step_order ASC, s.created_at ASC) - 1) AS ordinal,
                        COUNT(*) OVER (PARTITION BY s.campaign_id) AS total_steps
                   FROM crm_drip_campaign_steps s
             )
             SELECT e.id                     AS enrollment_id,
                    e.campaign_id,
                    e.contact_id,
                    e.current_step,
                    st.id                     AS step_id,
                    st.subject,
                    st.body,
                    st.total_steps,
                    c.email,
                    c.first_name,
                    c.last_name,
                    ca.organization_id,
                    COALESCE(sl.attempts, 0)  AS prior_attempts
               FROM crm_drip_enrollments e
               JOIN crm_drip_campaigns ca    ON ca.id = e.campaign_id
               JOIN ordered_steps st         ON st.campaign_id = ca.id AND st.ordinal = e.current_step
               JOIN contacts c               ON c.id = e.contact_id
          LEFT JOIN crm_drip_step_sends sl   ON sl.enrollment_id = e.id AND sl.step_id = st.id
              WHERE e.status = 'active'
                AND ca.is_active = TRUE
                AND ca.deleted_at IS NULL
                AND c.deleted_at IS NULL
                AND c.email IS NOT NULL AND c.email <> ''
                AND (sl.id IS NULL OR (sl.status = 'failed' AND sl.attempts < $1))
                AND COALESCE(e.last_step_at, e.enrolled_at) + (st.delay_days::text || ' days')::interval <= NOW()
              ORDER BY e.enrolled_at ASC
              LIMIT $2`,
            [MAX_ATTEMPTS, MAX_STEPS_PER_RUN]
        );

        return rows.map((r: any) => ({
            ...r,
            is_last_step: Number(r.current_step) + 1 >= Number(r.total_steps),
        }));
    }

    /**
     * Send one due step and advance its enrollment.
     * Returns 'sent' | 'failed' | 'skipped' (skipped = another worker already claimed it).
     */
    private async processStep(row: any): Promise<StepOutcome> {
        // Atomically claim the send (idempotency + retry counter). First attempt INSERTs;
        // a prior *failed* attempt flips 'failed' → 'sending' and increments attempts.
        // A row that is already 'sending'/'sent' (or over the cap) fails the DO UPDATE
        // guard, returns no row, and we skip — no double-send.
        const claim = await db.query(
            `INSERT INTO crm_drip_step_sends
                 (enrollment_id, campaign_id, step_id, contact_id, organization_id, status, attempts)
             VALUES ($1, $2, $3, $4, $5, 'sending', 1)
             ON CONFLICT (enrollment_id, step_id) DO UPDATE
                SET status = 'sending',
                    attempts = crm_drip_step_sends.attempts + 1,
                    error = NULL,
                    updated_at = NOW()
              WHERE crm_drip_step_sends.status = 'failed'
                AND crm_drip_step_sends.attempts < $6
          RETURNING id`,
            [row.enrollment_id, row.campaign_id, row.step_id, row.contact_id, row.organization_id, MAX_ATTEMPTS]
        );
        if (claim.rowCount === 0) return 'skipped';
        const sendId = claim.rows[0].id as string;

        try {
            // A/B: weighted random pick among {control + active variants} (mig 276).
            // Control (the step's own subject/body) has an implicit weight of 1; variant_id NULL = control.
            let variantId: string | null = null;
            let pickSubject = row.subject;
            let pickBody = row.body;
            const variants = await db.query(
                `SELECT id, subject, body, weight FROM crm_drip_step_variants WHERE step_id = $1 AND is_active = true`,
                [row.step_id]
            );
            if (variants.rows.length > 0) {
                const pool = [
                    { id: null as string | null, subject: row.subject, body: row.body, weight: 1 },
                    ...variants.rows.map((v: any) => ({ id: v.id as string, subject: v.subject, body: v.body, weight: Math.max(0, Number(v.weight) || 0) })),
                ];
                const total = pool.reduce((s, p) => s + p.weight, 0);
                if (total > 0) {
                    let r = Math.random() * total;
                    for (const p of pool) { r -= p.weight; if (r <= 0) { variantId = p.id; pickSubject = p.subject; pickBody = p.body; break; } }
                }
            }

            const context = { contactId: row.contact_id };
            const subject = (await documentGenerationService.renderString(row.organization_id, context, pickSubject || '')).trim() || 'Message';
            const body = await documentGenerationService.renderString(row.organization_id, context, pickBody || '');
            // Inject the open pixel + rewrite links through the signed click tracker (mig 275).
            const trackedHtml = injectTracking(body, sendId);

            await notify({
                recipients: {
                    audience: 'staff',
                    userId: row.contact_id,
                    email: row.email,
                    name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || null,
                },
                category: 'crm',
                type: 'drip_step.sent',
                title: subject,
                body: body || subject,
                organizationId: row.organization_id,
                sourceType: 'drip_enrollment',
                sourceId: row.enrollment_id,
                channels: { email: true },   // external lead → email only (no in-app inbox)
                email: { subject, html: trackedHtml },
            });

            // Mark sent + advance the enrollment in one transaction so progress is never
            // lost between "email delivered" and "advanced".
            const nextStep = Number(row.current_step) + 1;
            const isLast = nextStep >= Number(row.total_steps);
            await transaction(async (client) => {
                await client.query(
                    `UPDATE crm_drip_step_sends
                        SET status = 'sent', sent_at = NOW(), error = NULL, updated_at = NOW(), variant_id = $3
                      WHERE enrollment_id = $1 AND step_id = $2`,
                    [row.enrollment_id, row.step_id, variantId]
                );
                if (isLast) {
                    await client.query(
                        `UPDATE crm_drip_enrollments
                            SET current_step = $1, last_step_at = NOW(), status = 'completed', completed_at = NOW()
                          WHERE id = $2`,
                        [nextStep, row.enrollment_id]
                    );
                } else {
                    await client.query(
                        `UPDATE crm_drip_enrollments
                            SET current_step = $1, last_step_at = NOW()
                          WHERE id = $2`,
                        [nextStep, row.enrollment_id]
                    );
                }
            });

            return 'sent';
        } catch (err: any) {
            // Record the failure on the ledger; findDueSteps will retry it next tick
            // until MAX_ATTEMPTS, then leave it parked (status='failed') for inspection.
            await db.query(
                `UPDATE crm_drip_step_sends
                    SET status = 'failed', error = $3, updated_at = NOW()
                  WHERE enrollment_id = $1 AND step_id = $2`,
                [row.enrollment_id, row.step_id, String(err?.message || err).slice(0, 500)]
            );
            logger.error('[dripExecution] send failed', {
                enrollmentId: row.enrollment_id,
                stepId: row.step_id,
                error: err?.message,
            });
            return 'failed';
        }
    }
}

export const dripExecutionJob = new DripExecutionJob();

/**
 * Register the drip execution cron. Every 15 minutes — the smallest useful cadence
 * given delay_days granularity is days; keeps a first step with delay_days = 0
 * ("send now") under ~15 min of latency without hammering the DB.
 */
export function initDripExecutionJob(): void {
    cron.schedule('*/15 * * * *', async () => {
        try {
            const result = await dripExecutionJob.run();
            if (result.processed > 0 || result.errors.length > 0) {
                logger.info('[dripExecution] tick complete', result);
            }
        } catch (err: any) {
            logger.error('[dripExecution] scheduled run threw', { error: err?.message });
        }
    });
    logger.info('Drip execution job scheduled (every 15 minutes)');
}

// CLI runner for manual/test execution: `ts-node src/jobs/dripExecutionJob.ts`
if (require.main === module) {
    dripExecutionJob
        .run()
        .then((r) => {
            console.log('Drip execution complete:', r);
            process.exit(0);
        })
        .catch((e) => {
            console.error('Drip execution failed:', e);
            process.exit(1);
        });
}
