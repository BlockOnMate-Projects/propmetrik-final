/**
 * Payout Service — outbound disbursement with two-person maker-checker approval.
 *
 * The first path that MOVES MONEY OUT of PROPMETRIK. Backed by payout_requests
 * (migration 273). Money only leaves after a SECOND admin approves a request a first
 * admin created — enforced both in code and by a DB CHECK constraint.
 *
 * Lifecycle: requestPayout (maker) → approvePayout by a DIFFERENT admin (checker) →
 * execute() submits to the rail → transfer.* webhook → markPaidByReference/markFailed.
 *
 * Rails: Paystack transfer covers bank ('nuban') and mobile money ('mobile_money').
 * Crypto is intentionally an explicit "not yet enabled" branch — we fail loudly rather
 * than silently no-op a disbursement.
 *
 * Idempotency: a partial UNIQUE index (payout_type, source_id) WHERE status is non-terminal
 * means a commission can never spawn two live payouts; the Paystack transfer reference is
 * deterministic (`PO-<id>`) so a retried submit reconciles to the same transfer.
 *
 * @module services/property-management/payment/payoutService
 */

import { pool } from '../../../database';
import { paystackService } from './paystackService';
import { commissionService } from '../../crm-deal-management/commissionService';
import { logger, auditLog } from '../../../utils/logger';

export type SettlementMethod = 'bank' | 'momo' | 'crypto';
export type PayoutType = 'commission' | 'contractor' | 'vendor' | 'settlement' | 'manual';

export interface RequestPayoutParams {
    organizationId: string;
    payoutType: PayoutType;
    sourceId?: string | null;
    sourceReference?: string | null;
    amount: number;             // pesewas
    currency?: string;
    recipientId?: string | null;
    recipientType?: string | null;
    recipientName?: string | null;
    settlementMethod: SettlementMethod;
    bankCode?: string | null;
    accountNumber?: string | null;
    walletAddress?: string | null;
    settlementCoin?: string | null;
    settlementChain?: string | null;
    requestedBy: string;
    requestNotes?: string | null;
}

class PayoutService {
    // ── Maker ────────────────────────────────────────────────────────────────
    /** Create a payout request (pending_approval). Money does NOT move here. */
    async requestPayout(params: RequestPayoutParams): Promise<any> {
        const {
            organizationId, payoutType, sourceId = null, sourceReference = null,
            amount, currency = 'GHS', recipientId = null, recipientType = null, recipientName = null,
            settlementMethod, bankCode = null, accountNumber = null,
            walletAddress = null, settlementCoin = null, settlementChain = null,
            requestedBy, requestNotes = null,
        } = params;

        if (!amount || amount <= 0) throw new Error('Payout amount must be greater than zero (pesewas)');
        this.validateDestination(settlementMethod, { bankCode, accountNumber, walletAddress });

        // Idempotency: reuse an existing ACTIVE payout for this source.
        if (sourceId) {
            const existing = await this.findActiveBySource(payoutType, sourceId);
            if (existing) return existing;
        }

        try {
            const res = await pool.query(
                `INSERT INTO payout_requests
                    (organization_id, payout_type, source_id, source_reference, amount, currency,
                     recipient_id, recipient_type, recipient_name,
                     settlement_method, bank_code, account_number, wallet_address, settlement_coin, settlement_chain,
                     status, requested_by, request_notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending_approval',$16,$17)
                 RETURNING *`,
                [organizationId, payoutType, sourceId, sourceReference, amount, currency,
                 recipientId, recipientType, recipientName,
                 settlementMethod, bankCode, accountNumber, walletAddress, settlementCoin, settlementChain,
                 requestedBy, requestNotes]
            );
            const row = res.rows[0];
            auditLog({
                action: 'payout.requested', userId: requestedBy,
                resourceType: 'payout_request', resourceId: row.id,
                metadata: { organizationId, payoutType, sourceId, amount, settlementMethod },
            });
            logger.info('Payout requested', { payoutId: row.id, payoutType, amount });
            return row;
        } catch (err: any) {
            // Lost a race on the active-source unique index → return the winner.
            if (err?.code === '23505' && sourceId) {
                const existing = await this.findActiveBySource(payoutType, sourceId);
                if (existing) return existing;
            }
            throw err;
        }
    }

    /** Convenience: request a payout for an APPROVED commission (amount from agent_share). */
    async requestCommissionPayout(params: {
        organizationId: string;
        commissionId: string;
        requestedBy: string;
        settlementMethod: SettlementMethod;
        bankCode?: string;
        accountNumber?: string;
        walletAddress?: string;
        settlementCoin?: string;
        settlementChain?: string;
        recipientName?: string;
        requestNotes?: string;
    }): Promise<any> {
        const { organizationId, commissionId, requestedBy } = params;
        const cRes = await pool.query(
            `SELECT id, agent_id, agent_share, status FROM commission_records
              WHERE id = $1 AND organization_id = $2`,
            [commissionId, organizationId]
        );
        const c = cRes.rows[0];
        if (!c) throw new Error('Commission not found');
        if (c.status !== 'approved') throw new Error(`Only approved commissions can be paid out (status: ${c.status})`);

        const amountPesewas = Math.round(Number(c.agent_share) * 100);   // commission_records is cedis (DECIMAL); rail is pesewas
        if (amountPesewas <= 0) throw new Error('Commission agent share is zero');

        return this.requestPayout({
            organizationId,
            payoutType: 'commission',
            sourceId: commissionId,
            sourceReference: `commission:${commissionId}`,
            amount: amountPesewas,
            currency: 'GHS',
            recipientId: c.agent_id,
            recipientType: 'agent',
            recipientName: params.recipientName || null,
            settlementMethod: params.settlementMethod,
            bankCode: params.bankCode,
            accountNumber: params.accountNumber,
            walletAddress: params.walletAddress,
            settlementCoin: params.settlementCoin,
            settlementChain: params.settlementChain,
            requestedBy,
            requestNotes: params.requestNotes,
        });
    }

    // ── Checker ──────────────────────────────────────────────────────────────
    /** Approve (must be a DIFFERENT user from the maker) and execute the payout. */
    async approvePayout(payoutId: string, approverId: string, notes?: string): Promise<any> {
        const pRes = await pool.query(`SELECT * FROM payout_requests WHERE id = $1`, [payoutId]);
        const payout = pRes.rows[0];
        if (!payout) throw new Error('Payout request not found');
        if (payout.status !== 'pending_approval') throw new Error(`Payout is not awaiting approval (status: ${payout.status})`);
        if (payout.requested_by === approverId) {
            throw new Error('Maker-checker violation: the approver must be different from the requester');
        }

        // Compare-and-set → 'approved' (records the checker); race-safe, re-asserts maker≠checker.
        const claim = await pool.query(
            `UPDATE payout_requests
                SET status = 'approved', approved_by = $2, approved_at = NOW(), review_notes = $3
              WHERE id = $1 AND status = 'pending_approval' AND requested_by <> $2
          RETURNING *`,
            [payoutId, approverId, notes || null]
        );
        if (claim.rowCount === 0) throw new Error('Payout could not be approved (already handled or maker-checker violation)');
        const approved = claim.rows[0];

        auditLog({
            action: 'payout.approved', userId: approverId,
            resourceType: 'payout_request', resourceId: payoutId,
            metadata: { organizationId: approved.organization_id, amount: approved.amount, requestedBy: approved.requested_by },
        });

        return this.execute(approved);
    }

    /** Reject a pending payout (also a checker action; maker cannot self-reject-then-edit). */
    async rejectPayout(payoutId: string, approverId: string, reason?: string): Promise<any> {
        const claim = await pool.query(
            `UPDATE payout_requests
                SET status = 'rejected', approved_by = $2, approved_at = NOW(), review_notes = $3
              WHERE id = $1 AND status = 'pending_approval' AND requested_by <> $2
          RETURNING *`,
            [payoutId, approverId, reason || null]
        );
        if (claim.rowCount === 0) throw new Error('Payout could not be rejected (already handled or maker-checker violation)');
        auditLog({ action: 'payout.rejected', userId: approverId, resourceType: 'payout_request', resourceId: payoutId, metadata: { reason } });
        return claim.rows[0];
    }

    // ── Execution + reconciliation ───────────────────────────────────────────
    /** Submit an approved payout to its rail; sets 'processing' + provider_reference. */
    private async execute(payout: any): Promise<any> {
        const reference = `PO-${payout.id}`;   // deterministic → a retried submit maps to one transfer
        try {
            if (payout.settlement_method === 'bank' || payout.settlement_method === 'momo') {
                let recipientCode = payout.recipient_code;
                if (!recipientCode) {
                    const recipient = await paystackService.createTransferRecipient({
                        type: payout.settlement_method === 'momo' ? 'mobile_money' : 'nuban',
                        name: payout.recipient_name || payout.recipient_type || 'Recipient',
                        accountNumber: payout.account_number,
                        bankCode: payout.bank_code,
                    });
                    recipientCode = recipient?.data?.recipient_code;
                    if (!recipientCode) throw new Error('Failed to create Paystack transfer recipient');
                }

                const transfer = await paystackService.initiateTransfer({
                    recipientCode,
                    amount: Number(payout.amount),
                    reference,
                    reason: payout.source_reference || `Payout ${payout.payout_type}`,
                });
                const providerRef = transfer?.data?.reference || reference;

                await pool.query(
                    `UPDATE payout_requests
                        SET status = 'processing', provider = 'paystack', provider_reference = $2,
                            recipient_code = $3, error = NULL
                      WHERE id = $1`,
                    [payout.id, providerRef, recipientCode]
                );
                logger.info('Payout submitted to Paystack', { payoutId: payout.id, providerRef, amount: payout.amount });
                return { ...payout, status: 'processing', provider: 'paystack', provider_reference: providerRef };
            }

            // Crypto rail not yet enabled — fail explicitly rather than silently no-op money.
            throw new Error(`Settlement method '${payout.settlement_method}' is not yet supported by the payout rail`);
        } catch (err: any) {
            await pool.query(
                `UPDATE payout_requests SET status = 'failed', error = $2 WHERE id = $1`,
                [payout.id, String(err?.message || err).slice(0, 500)]
            ).catch(() => { /* best-effort */ });
            logger.error('Payout execution failed', { payoutId: payout.id, error: err?.message });
            throw err;
        }
    }

    /** Webhook: Paystack confirmed the transfer. Mark paid + advance the source record. */
    async markPaidByReference(providerReference: string): Promise<void> {
        const res = await pool.query(
            `UPDATE payout_requests
                SET status = 'paid', paid_at = NOW(), error = NULL
              WHERE provider_reference = $1 AND status IN ('processing', 'approved')
          RETURNING *`,
            [providerReference]
        );
        const payout = res.rows[0];
        if (!payout) { logger.info('Payout webhook: no matching in-flight payout', { providerReference }); return; }
        logger.info('Payout confirmed paid', { payoutId: payout.id, providerReference });
        await this.closeSource(payout).catch((e: any) =>
            logger.error('Payout source close failed', { payoutId: payout.id, error: e?.message }));
    }

    /** Webhook: transfer failed. Mark failed so it becomes re-requestable. */
    async markFailedByReference(providerReference: string, reason?: string): Promise<void> {
        await pool.query(
            `UPDATE payout_requests SET status = 'failed', error = $2
              WHERE provider_reference = $1 AND status IN ('processing', 'approved')`,
            [providerReference, reason || 'transfer.failed']
        ).catch(() => { /* best-effort */ });
        logger.error('Payout failed (per webhook)', { providerReference, reason });
    }

    /** On successful payout, advance the underlying record (commission → paid). */
    private async closeSource(payout: any): Promise<void> {
        if (payout.payout_type === 'commission' && payout.source_id) {
            await commissionService.markAsPaid(payout.source_id, payout.organization_id);
        }
    }

    // ── Reads ────────────────────────────────────────────────────────────────
    async getById(id: string, organizationId: string): Promise<any> {
        const res = await pool.query(`SELECT * FROM payout_requests WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
        return res.rows[0] || null;
    }

    async list(organizationId: string, status?: string): Promise<any[]> {
        if (status) {
            const res = await pool.query(
                `SELECT * FROM payout_requests WHERE organization_id = $1 AND status = $2 ORDER BY requested_at DESC LIMIT 200`,
                [organizationId, status]);
            return res.rows;
        }
        const res = await pool.query(
            `SELECT * FROM payout_requests WHERE organization_id = $1 ORDER BY requested_at DESC LIMIT 200`,
            [organizationId]);
        return res.rows;
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    private async findActiveBySource(payoutType: string, sourceId: string): Promise<any | null> {
        const res = await pool.query(
            `SELECT * FROM payout_requests
              WHERE payout_type = $1 AND source_id = $2 AND status NOT IN ('failed','rejected','cancelled')
              LIMIT 1`,
            [payoutType, sourceId]
        );
        return res.rows[0] || null;
    }

    private validateDestination(
        method: SettlementMethod,
        d: { bankCode?: string | null; accountNumber?: string | null; walletAddress?: string | null }
    ): void {
        if (method === 'bank' || method === 'momo') {
            if (!d.accountNumber || !d.bankCode) throw new Error(`${method} payout requires accountNumber and bankCode`);
        } else if (method === 'crypto') {
            if (!d.walletAddress) throw new Error('crypto payout requires walletAddress');
        } else {
            throw new Error(`Unsupported settlement method: ${method}`);
        }
    }
}

export const payoutService = new PayoutService();
export default payoutService;
