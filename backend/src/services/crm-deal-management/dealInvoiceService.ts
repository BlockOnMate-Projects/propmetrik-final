/**
 * Deal Invoice Service — the CRM receivables/AR layer.
 *
 * A deal can raise one or more invoices; each is tracked draft → sent →
 * (partially_)paid, with partial payments and AR aging. Money is NUMERIC in PG
 * (returned as strings) so everything is coerced through num().
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
// Invoices are stored in their own `currency` — GHS-normalize summed money.
import { getGhsRateMap, ghsValueSql } from '../property-management/utils/currencyFx';

const num = (v: unknown): number => {
    const x = typeof v === 'string' ? parseFloat(v) : (v as number);
    return Number.isFinite(x) ? x : 0;
};

export interface DealInvoice {
    id: string;
    organization_id: string;
    deal_id?: string;
    invoice_number: string;
    client_name?: string;
    amount: number;
    paid_amount: number;
    status: string;
    issue_date: string;
    due_date: string;
    [k: string]: any;
}

class DealInvoiceService {
    /** Human invoice number: INV-YYYY-NNNN, sequential per org per year. */
    private async nextInvoiceNumber(organizationId: string): Promise<string> {
        const year = new Date().getFullYear();
        const res = await pool.query(
            `SELECT COUNT(*)::int AS c FROM deal_invoices
             WHERE organization_id = $1 AND invoice_number LIKE $2`,
            [organizationId, `INV-${year}-%`],
        );
        const seq = (Number(res.rows[0]?.c) || 0) + 1;
        return `INV-${year}-${String(seq).padStart(4, '0')}`;
    }

    async create(organizationId: string, data: {
        deal_id?: string;
        client_name?: string;
        contact_id?: string;
        description?: string;
        amount: number;
        currency?: string;
        due_date?: string;
        issue_date?: string;
        notes?: string;
        created_by?: string;
    }): Promise<DealInvoice> {
        const invoiceNumber = await this.nextInvoiceNumber(organizationId);
        const res = await pool.query(
            `INSERT INTO deal_invoices (
                organization_id, deal_id, invoice_number, client_name, contact_id,
                description, amount, currency, issue_date, due_date, notes, created_by, status
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'GHS'),
                COALESCE($9, CURRENT_DATE),
                COALESCE($10, CURRENT_DATE + INTERVAL '30 days'),
                $11,$12,'draft')
            RETURNING *`,
            [
                organizationId, data.deal_id || null, invoiceNumber, data.client_name || null,
                data.contact_id || null, data.description || null, num(data.amount),
                data.currency || null, data.issue_date || null, data.due_date || null,
                data.notes || null, data.created_by || null,
            ],
        );
        return res.rows[0];
    }

    async getById(id: string, organizationId: string): Promise<DealInvoice | null> {
        const res = await pool.query(
            `SELECT di.*, d.title AS deal_title, d.deal_number
             FROM deal_invoices di
             LEFT JOIN deals d ON di.deal_id = d.id
             WHERE di.id = $1 AND di.organization_id = $2`,
            [id, organizationId],
        );
        if (!res.rows[0]) return null;
        const payments = await pool.query(
            `SELECT * FROM deal_invoice_payments WHERE invoice_id = $1 ORDER BY paid_at DESC, created_at DESC`,
            [id],
        );
        return { ...res.rows[0], payments: payments.rows };
    }

    async list(organizationId: string, filters: { status?: string; deal_id?: string; overdue?: boolean } = {}): Promise<DealInvoice[]> {
        let where = 'WHERE di.organization_id = $1';
        const params: any[] = [organizationId];
        let i = 2;
        if (filters.status) { where += ` AND di.status = $${i++}`; params.push(filters.status); }
        if (filters.deal_id) { where += ` AND di.deal_id = $${i++}`; params.push(filters.deal_id); }
        if (filters.overdue) { where += ` AND di.status IN ('sent','partially_paid','overdue') AND di.due_date < CURRENT_DATE`; }
        const res = await pool.query(
            `SELECT di.*, d.title AS deal_title, d.deal_number
             FROM deal_invoices di
             LEFT JOIN deals d ON di.deal_id = d.id
             ${where}
             ORDER BY di.issue_date DESC, di.created_at DESC`,
            params,
        );
        return res.rows;
    }

    async send(id: string, organizationId: string): Promise<DealInvoice | null> {
        const res = await pool.query(
            `UPDATE deal_invoices
             SET status = 'sent', sent_at = COALESCE(sent_at, NOW()), updated_at = NOW()
             WHERE id = $1 AND organization_id = $2 AND status IN ('draft','sent')
             RETURNING *`,
            [id, organizationId],
        );
        return res.rows[0] || null;
    }

    async cancel(id: string, organizationId: string): Promise<DealInvoice | null> {
        const res = await pool.query(
            `UPDATE deal_invoices SET status = 'cancelled', updated_at = NOW()
             WHERE id = $1 AND organization_id = $2 AND status <> 'paid'
             RETURNING *`,
            [id, organizationId],
        );
        return res.rows[0] || null;
    }

    /** Apply a payment; recomputes paid_amount + status atomically. */
    async recordPayment(id: string, organizationId: string, data: {
        amount: number; payment_method?: string; payment_reference?: string; recorded_by?: string;
    }): Promise<DealInvoice | null> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const inv = await client.query(
                `SELECT * FROM deal_invoices WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
                [id, organizationId],
            );
            if (!inv.rows[0]) { await client.query('ROLLBACK'); return null; }
            const row = inv.rows[0];
            if (row.status === 'cancelled') { await client.query('ROLLBACK'); return null; }

            await client.query(
                `INSERT INTO deal_invoice_payments (organization_id, invoice_id, amount, payment_method, payment_reference, recorded_by)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
                [organizationId, id, num(data.amount), data.payment_method || null, data.payment_reference || null, data.recorded_by || null],
            );

            const newPaid = num(row.paid_amount) + num(data.amount);
            const total = num(row.amount);
            const fullyPaid = newPaid + 0.001 >= total;
            const status = fullyPaid ? 'paid' : 'partially_paid';

            const upd = await client.query(
                `UPDATE deal_invoices
                 SET paid_amount = $3,
                     status = $4,
                     paid_at = CASE WHEN $5 THEN NOW() ELSE paid_at END,
                     payment_method = COALESCE($6, payment_method),
                     payment_reference = COALESCE($7, payment_reference),
                     updated_at = NOW()
                 WHERE id = $1 AND organization_id = $2
                 RETURNING *`,
                [id, organizationId, newPaid, status, fullyPaid, data.payment_method || null, data.payment_reference || null],
            );
            await client.query('COMMIT');
            return upd.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /** Outstanding / overdue / paid / draft roll-up for the AR dashboard. */
    async summary(organizationId: string): Promise<any> {
        const fx = await getGhsRateMap();
        const amtGhs = ghsValueSql('amount', 'currency', fx);
        const paidGhs = ghsValueSql('paid_amount', 'currency', fx);
        const balGhs = ghsValueSql('(amount - paid_amount)', 'currency', fx);
        const res = await pool.query(
            `SELECT
                COALESCE(SUM(${amtGhs}) FILTER (WHERE status <> 'cancelled'), 0) AS total_invoiced,
                COALESCE(SUM(${paidGhs}) FILTER (WHERE status <> 'cancelled'), 0) AS total_collected,
                COALESCE(SUM(${balGhs}) FILTER (WHERE status IN ('sent','partially_paid','overdue')), 0) AS outstanding,
                COALESCE(SUM(${balGhs}) FILTER (WHERE status IN ('sent','partially_paid','overdue') AND due_date < CURRENT_DATE), 0) AS overdue,
                COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_count,
                COUNT(*) FILTER (WHERE status IN ('sent','partially_paid','overdue'))::int AS open_count,
                COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count
             FROM deal_invoices
             WHERE organization_id = $1`,
            [organizationId],
        );
        const r = res.rows[0] || {};
        return {
            total_invoiced: num(r.total_invoiced),
            total_collected: num(r.total_collected),
            outstanding: num(r.outstanding),
            overdue: num(r.overdue),
            draft_count: Number(r.draft_count) || 0,
            open_count: Number(r.open_count) || 0,
            paid_count: Number(r.paid_count) || 0,
        };
    }

    /** AR aging buckets on the unpaid balance of open invoices. */
    async arAging(organizationId: string): Promise<any> {
        const fx = await getGhsRateMap();
        const balGhs = ghsValueSql('(amount - paid_amount)', 'currency', fx);
        const res = await pool.query(
            `SELECT
                COALESCE(SUM(bal) FILTER (WHERE days <= 0), 0)              AS current,
                COALESCE(SUM(bal) FILTER (WHERE days BETWEEN 1 AND 30), 0)  AS d1_30,
                COALESCE(SUM(bal) FILTER (WHERE days BETWEEN 31 AND 60), 0) AS d31_60,
                COALESCE(SUM(bal) FILTER (WHERE days BETWEEN 61 AND 90), 0) AS d61_90,
                COALESCE(SUM(bal) FILTER (WHERE days > 90), 0)             AS d90_plus
             FROM (
                SELECT ${balGhs} AS bal,
                       (CURRENT_DATE - due_date) AS days
                FROM deal_invoices
                WHERE organization_id = $1
                  AND status IN ('sent','partially_paid','overdue')
                  AND (amount - paid_amount) > 0
             ) t`,
            [organizationId],
        );
        const r = res.rows[0] || {};
        const buckets = {
            current: num(r.current),
            d1_30: num(r.d1_30),
            d31_60: num(r.d31_60),
            d61_90: num(r.d61_90),
            d90_plus: num(r.d90_plus),
        };
        const total = Object.values(buckets).reduce((a, b) => a + b, 0);
        return { ...buckets, total };
    }

    /**
     * Auto-raise a draft invoice for a won deal (idempotent — one per deal).
     * The receivable equals the deal value; net-30 terms by default.
     */
    async generateForWonDeal(organizationId: string, deal: {
        id: string; deal_value?: number | string | null; title?: string; actual_close_date?: string | Date | null;
    }): Promise<DealInvoice | null> {
        const amount = num(deal.deal_value);
        if (!deal.id || !(amount > 0)) return null;
        const existing = await pool.query(
            `SELECT 1 FROM deal_invoices WHERE deal_id = $1 AND organization_id = $2 LIMIT 1`,
            [deal.id, organizationId],
        );
        if ((existing.rowCount || 0) > 0) return null;

        // Resolve a client name from the deal's primary contact when available.
        let clientName: string | null = null;
        try {
            const c = await pool.query(
                `SELECT NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), '') AS name
                 FROM deals d
                 LEFT JOIN contacts c ON c.id = d.primary_contact_id
                 WHERE d.id = $1`,
                [deal.id],
            );
            clientName = c.rows[0]?.name || null;
        } catch { /* non-fatal */ }

        const issue = deal.actual_close_date ? new Date(deal.actual_close_date) : new Date();
        const inv = await this.create(organizationId, {
            deal_id: deal.id,
            client_name: clientName || undefined,
            description: deal.title ? `Invoice for deal: ${deal.title}` : undefined,
            amount,
            issue_date: issue.toISOString().slice(0, 10),
        });
        logger.info('Auto-generated draft invoice for won deal', { dealId: deal.id, organizationId, invoiceId: inv.id });
        return inv;
    }
}

export const dealInvoiceService = new DealInvoiceService();
