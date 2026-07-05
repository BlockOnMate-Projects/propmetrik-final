/**
 * Tenant Rent Auto-Pay Service
 *
 * Standing-mandate rent collection. A tenant enables autopay (creates a `pending`
 * mandate); the mandate activates when a successful CARD rent payment yields a
 * REUSABLE Paystack authorization (captured in paymentProcessor.verifyAndRecordPayment).
 * The daily job (chargeDueMandates) then charges outstanding rent customer-not-present
 * on the tenant's chosen day, routing every charge through the SAME ledger / schedule /
 * receipt path as a manual payment.
 *
 * @module services/property-management/payment/autopayService
 */

import { pool } from '../../../database';
import { logger } from '../../../utils/logger';
import { paymentProcessor } from './paymentProcessor';
import { rentScheduleService } from '../rent-collection/rentScheduleService';
import { notify, resolveTenantByTenancy } from '../../../../shared-services/notifications/in-mail';

const MAX_CONSECUTIVE_FAILURES = 3; // pause the mandate after this many failed months

export interface AutopayStatus {
    enabled: boolean;
    status: 'none' | 'pending' | 'active' | 'paused' | 'revoked';
    chargeDay: number | null;
    card: { last4?: string; bank?: string; exp?: string; channel?: string } | null;
    lastChargeAt: string | null;
    lastError: string | null;
    /** True when active + a reusable authorization is on file (autopay will actually run). */
    ready: boolean;
}

class AutopayService {
    /** Current autopay state for a tenancy (safe fields only — never returns the auth token). */
    async getStatus(tenancyId: string): Promise<AutopayStatus> {
        const r = await pool.query(
            `SELECT status, charge_day, channel, card_last4, card_bank, card_exp,
                    authorization_code, last_charge_at, last_error
             FROM tenant_autopay_mandates
             WHERE tenancy_id = $1 AND status <> 'revoked'
             ORDER BY updated_at DESC LIMIT 1`,
            [tenancyId]
        );
        if (r.rows.length === 0) {
            return { enabled: false, status: 'none', chargeDay: null, card: null, lastChargeAt: null, lastError: null, ready: false };
        }
        const m = r.rows[0];
        const hasAuth = !!m.authorization_code;
        return {
            enabled: m.status === 'active' || m.status === 'pending',
            status: m.status,
            chargeDay: m.charge_day,
            card: hasAuth ? { last4: m.card_last4, bank: m.card_bank, exp: m.card_exp, channel: m.channel } : null,
            lastChargeAt: m.last_charge_at ? new Date(m.last_charge_at).toISOString() : null,
            lastError: m.last_error || null,
            ready: m.status === 'active' && hasAuth,
        };
    }

    /**
     * Enable autopay (or update the charge day). Creates a `pending` mandate — it only
     * becomes chargeable once a reusable card authorization is captured from a real
     * card rent payment. Preserves an already-captured authorization if one exists.
     */
    async enable(params: {
        tenancyId: string;
        tenantId: string;
        organizationId: string;
        chargeDay: number;
    }): Promise<AutopayStatus> {
        const chargeDay = Math.min(28, Math.max(1, Math.round(params.chargeDay || 5)));

        const existing = await pool.query(
            `SELECT id, authorization_code FROM tenant_autopay_mandates
             WHERE tenancy_id = $1 AND status <> 'revoked' LIMIT 1`,
            [params.tenancyId]
        );

        if (existing.rows.length > 0) {
            // Keep any captured authorization; re-activate if it was paused; refresh day.
            await pool.query(
                `UPDATE tenant_autopay_mandates
                 SET charge_day = $1,
                     status = CASE WHEN authorization_code IS NOT NULL THEN 'active' ELSE 'pending' END,
                     consecutive_failures = 0,
                     last_error = NULL,
                     updated_at = NOW()
                 WHERE id = $2`,
                [chargeDay, existing.rows[0].id]
            );
        } else {
            await pool.query(
                `INSERT INTO tenant_autopay_mandates
                    (tenancy_id, tenant_id, organization_id, charge_day, status, enabled_by)
                 VALUES ($1, $2, $3, $4, 'pending', 'tenant')`,
                [params.tenancyId, params.tenantId, params.organizationId, chargeDay]
            );
        }

        logger.info('Tenant autopay enabled', { tenancyId: params.tenancyId, chargeDay });
        return this.getStatus(params.tenancyId);
    }

    /** Disable (revoke) autopay for a tenancy. The saved token is dropped. */
    async disable(tenancyId: string): Promise<AutopayStatus> {
        await pool.query(
            `UPDATE tenant_autopay_mandates
             SET status = 'revoked', authorization_code = NULL, updated_at = NOW()
             WHERE tenancy_id = $1 AND status <> 'revoked'`,
            [tenancyId]
        );
        logger.info('Tenant autopay disabled', { tenancyId });
        return this.getStatus(tenancyId);
    }

    /**
     * Daily sweep: charge every active mandate that is due this month and has an
     * outstanding balance. One attempt per calendar month per mandate (guarded by
     * last_attempt_at) so a declined card is not hammered repeatedly.
     */
    async chargeDueMandates(): Promise<{ scanned: number; charged: number; skippedNoBalance: number; failed: number }> {
        const today = new Date().getDate();
        const summary = { scanned: 0, charged: 0, skippedNoBalance: 0, failed: 0 };

        // Claim due mandates atomically: stamp last_attempt_at NOW() and return the rows.
        // Eligible = active + has token + charge_day reached + not already attempted this month.
        const due = await pool.query(
            `UPDATE tenant_autopay_mandates
             SET last_attempt_at = NOW(), updated_at = NOW()
             WHERE status = 'active'
               AND authorization_code IS NOT NULL
               AND charge_day <= $1
               AND (last_attempt_at IS NULL OR last_attempt_at < date_trunc('month', NOW()))
             RETURNING id, tenancy_id, organization_id, authorization_code, authorization_email`,
            [today]
        );

        summary.scanned = due.rows.length;
        if (due.rows.length === 0) return summary;

        logger.info(`Autopay sweep: ${due.rows.length} mandate(s) due`, { day: today });

        for (const m of due.rows) {
            try {
                // Compute outstanding rent (arrears + currently-due) in the lease currency.
                const arrears = await rentScheduleService.calculateArrears(m.tenancy_id, m.organization_id);
                const outstanding = Number(arrears.totalOutstanding || 0);

                if (outstanding <= 0) {
                    summary.skippedNoBalance++;
                    await pool.query(
                        `UPDATE tenant_autopay_mandates SET last_error = NULL WHERE id = $1`, [m.id]
                    );
                    continue;
                }

                const scheduleIds: string[] = [
                    ...(arrears.overdueSchedules || []),
                    ...(arrears.dueSchedules || []),
                ].map((s: any) => s.id);

                const result = await paymentProcessor.chargeRentWithAuthorization({
                    tenancyId: m.tenancy_id,
                    organizationId: m.organization_id,
                    authorizationCode: m.authorization_code,
                    payerEmail: m.authorization_email,   // MUST match the auth's customer email
                    amount: outstanding,
                    scheduleIds,
                });

                if (result.success) {
                    summary.charged++;
                    await pool.query(
                        `UPDATE tenant_autopay_mandates
                         SET last_charge_at = NOW(), last_charge_reference = $1,
                             consecutive_failures = 0, last_error = NULL, updated_at = NOW()
                         WHERE id = $2`,
                        [result.reference, m.id]
                    );
                    // Success receipt already sent by verifyAndRecordPayment.
                } else {
                    summary.failed++;
                    await this.recordFailure(m.id, m.tenancy_id, m.organization_id, result.error || 'Charge failed', arrears.currency, outstanding);
                }
            } catch (err: any) {
                summary.failed++;
                await this.recordFailure(m.id, m.tenancy_id, m.organization_id, err.message || 'Charge error', 'GHS', 0);
                logger.error('Autopay charge threw', { mandateId: m.id, tenancyId: m.tenancy_id, error: err.message });
            }
        }

        logger.info('Autopay sweep finished', summary);
        return summary;
    }

    /** Increment failure count, pause after the cap, and notify the tenant. Best-effort. */
    private async recordFailure(
        mandateId: string,
        tenancyId: string,
        organizationId: string,
        error: string,
        currency: string,
        amount: number,
    ): Promise<void> {
        try {
            const upd = await pool.query(
                `UPDATE tenant_autopay_mandates
                 SET consecutive_failures = consecutive_failures + 1,
                     last_error = $1,
                     status = CASE WHEN consecutive_failures + 1 >= $2 THEN 'paused' ELSE status END,
                     updated_at = NOW()
                 WHERE id = $3
                 RETURNING consecutive_failures, status`,
                [error, MAX_CONSECUTIVE_FAILURES, mandateId]
            );
            const paused = upd.rows[0]?.status === 'paused';

            const tenant = await resolveTenantByTenancy(tenancyId);
            if (tenant) {
                const amt = amount > 0 ? `${currency || 'GHS'} ${Number(amount).toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : 'your rent';
                await notify({
                    recipients: tenant,
                    category: 'finance',
                    type: 'payment.failed',
                    title: paused ? 'Auto-Pay paused' : 'Auto-Pay attempt failed',
                    body: paused
                        ? `We couldn't collect ${amt} automatically after several tries, so Auto-Pay is paused. Please pay manually and re-enable Auto-Pay.`
                        : `We couldn't collect ${amt} automatically (${error}). We'll try again, or you can pay manually.`,
                    summary: paused ? 'Auto-Pay paused after repeated failures' : 'Auto-Pay attempt failed',
                    priority: 'high',
                    sourceType: 'autopay',
                    sourceId: mandateId,
                    tenantActionUrl: '/dashboard/tenant/payments',
                    organizationId,
                    channels: { inApp: true, email: true },
                });
            }
        } catch (e: any) {
            logger.warn('Autopay recordFailure notify failed', { mandateId, error: e.message });
        }
    }
}

export const autopayService = new AutopayService();
