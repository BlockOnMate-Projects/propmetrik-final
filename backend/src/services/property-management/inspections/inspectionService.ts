/**
 * Property Condition Inspection Service (PM)
 *
 * A property-management condition report (move-in / move-out / routine / periodic) with
 * room-by-room condition items. Distinct from valuation/permit inspections. Lifecycle:
 * scheduled → in_progress (first item added) → completed.
 *
 * @module services/property-management/inspections/inspectionService
 */

import { pool } from '../../../database';
import { logger } from '../../../utils/logger';

export interface InspectionInput {
    propertyId?: string | null;
    unitId?: string | null;
    tenancyId?: string | null;
    dealId?: string | null;
    contactId?: string | null;
    inspectionType?: string;
    scheduledFor?: string | null;
    inspectorId?: string | null;
    summary?: string | null;
}

export interface InspectionItemInput {
    area: string;
    item: string;
    condition?: string;
    notes?: string | null;
    photos?: string[];
    sortOrder?: number;
}

class InspectionService {
    async list(orgId: string, filters: { propertyId?: string; dealId?: string; status?: string; type?: string } = {}): Promise<any[]> {
        const clauses: string[] = ['i.organization_id = $1', 'i.deleted_at IS NULL'];
        const params: any[] = [orgId];
        const add = (v: any, f: (n: number) => string) => { params.push(v); clauses.push(f(params.length)); };
        if (filters.propertyId) add(filters.propertyId, (n) => `i.property_id = $${n}`);
        if (filters.dealId) add(filters.dealId, (n) => `i.deal_id = $${n}`);
        if (filters.status) add(filters.status, (n) => `i.status = $${n}`);
        if (filters.type) add(filters.type, (n) => `i.inspection_type = $${n}`);

        const res = await pool.query(
            `SELECT i.*,
                    COALESCE(p.title, p.address_street) AS property_name,
                    (SELECT COUNT(*) FROM property_inspection_items it WHERE it.inspection_id = i.id) AS item_count
               FROM property_inspections i
          LEFT JOIN properties p ON p.id = i.property_id
              WHERE ${clauses.join(' AND ')}
              ORDER BY COALESCE(i.scheduled_for, i.created_at::date) DESC, i.created_at DESC
              LIMIT 300`,
            params
        );
        return res.rows;
    }

    async getById(id: string, orgId: string): Promise<any | null> {
        const res = await pool.query(
            `SELECT i.*, COALESCE(p.title, p.address_street) AS property_name
               FROM property_inspections i
          LEFT JOIN properties p ON p.id = i.property_id
              WHERE i.id = $1 AND i.organization_id = $2 AND i.deleted_at IS NULL`,
            [id, orgId]
        );
        const inspection = res.rows[0];
        if (!inspection) return null;
        const items = await pool.query(
            `SELECT * FROM property_inspection_items WHERE inspection_id = $1 ORDER BY sort_order ASC, created_at ASC`,
            [id]
        );
        return { ...inspection, items: items.rows };
    }

    async create(orgId: string, input: InspectionInput, userId?: string): Promise<any> {
        const res = await pool.query(
            `INSERT INTO property_inspections
                (organization_id, property_id, unit_id, tenancy_id, deal_id, contact_id, inspection_type, scheduled_for, inspector_id, summary, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [orgId, input.propertyId || null, input.unitId || null, input.tenancyId || null,
             input.dealId || null, input.contactId || null,
             input.inspectionType || 'routine', input.scheduledFor || null, input.inspectorId || userId || null,
             input.summary || null, userId || null]
        );
        logger.info('Property inspection created', { id: res.rows[0].id, orgId });
        return res.rows[0];
    }

    async update(id: string, orgId: string, input: Partial<InspectionInput> & { status?: string; overallCondition?: string }): Promise<any | null> {
        const res = await pool.query(
            `UPDATE property_inspections SET
                inspection_type   = COALESCE($3, inspection_type),
                scheduled_for     = COALESCE($4, scheduled_for),
                inspector_id      = COALESCE($5, inspector_id),
                status            = COALESCE($6, status),
                overall_condition = COALESCE($7, overall_condition),
                summary           = COALESCE($8, summary)
              WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING *`,
            [id, orgId, input.inspectionType ?? null, input.scheduledFor ?? null, input.inspectorId ?? null,
             input.status ?? null, input.overallCondition ?? null, input.summary ?? null]
        );
        return res.rows[0] || null;
    }

    async complete(id: string, orgId: string, input: { overallCondition?: string; summary?: string }): Promise<any | null> {
        const res = await pool.query(
            `UPDATE property_inspections
                SET status = 'completed', completed_at = NOW(),
                    overall_condition = COALESCE($3, overall_condition),
                    summary = COALESCE($4, summary)
              WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING *`,
            [id, orgId, input.overallCondition ?? null, input.summary ?? null]
        );
        return res.rows[0] || null;
    }

    async remove(id: string, orgId: string): Promise<boolean> {
        const res = await pool.query(
            `UPDATE property_inspections SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [id, orgId]
        );
        return (res.rowCount ?? 0) > 0;
    }

    // ── Items ────────────────────────────────────────────────────────────────
    private async assertOwnsInspection(inspectionId: string, orgId: string): Promise<boolean> {
        const r = await pool.query(
            `SELECT 1 FROM property_inspections WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [inspectionId, orgId]
        );
        return !!r.rows[0];
    }

    async addItem(inspectionId: string, orgId: string, input: InspectionItemInput): Promise<any | null> {
        if (!(await this.assertOwnsInspection(inspectionId, orgId))) return null;
        const res = await pool.query(
            `INSERT INTO property_inspection_items (inspection_id, area, item, condition, notes, photos, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [inspectionId, input.area, input.item, input.condition || 'good', input.notes || null,
             JSON.stringify(input.photos || []), input.sortOrder ?? 0]
        );
        // First item moves a scheduled inspection into 'in_progress'.
        await pool.query(
            `UPDATE property_inspections SET status = 'in_progress' WHERE id = $1 AND status = 'scheduled'`,
            [inspectionId]
        );
        return res.rows[0];
    }

    async updateItem(itemId: string, orgId: string, input: Partial<InspectionItemInput>): Promise<any | null> {
        const res = await pool.query(
            `UPDATE property_inspection_items it SET
                area = COALESCE($3, it.area),
                item = COALESCE($4, it.item),
                condition = COALESCE($5, it.condition),
                notes = COALESCE($6, it.notes),
                photos = COALESCE($7, it.photos),
                sort_order = COALESCE($8, it.sort_order)
               FROM property_inspections i
              WHERE it.id = $1 AND it.inspection_id = i.id AND i.organization_id = $2 AND i.deleted_at IS NULL
          RETURNING it.*`,
            [itemId, orgId, input.area ?? null, input.item ?? null, input.condition ?? null,
             input.notes ?? null, input.photos ? JSON.stringify(input.photos) : null, input.sortOrder ?? null]
        );
        return res.rows[0] || null;
    }

    async deleteItem(itemId: string, orgId: string): Promise<boolean> {
        const res = await pool.query(
            `DELETE FROM property_inspection_items it
              USING property_inspections i
              WHERE it.id = $1 AND it.inspection_id = i.id AND i.organization_id = $2`,
            [itemId, orgId]
        );
        return (res.rowCount ?? 0) > 0;
    }
}

export const inspectionService = new InspectionService();
export default inspectionService;
