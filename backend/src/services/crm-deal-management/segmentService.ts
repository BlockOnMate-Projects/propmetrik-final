/**
 * Campaign Audience Segments
 *
 * A segment is a saved, allow-listed filter over `contacts`. It resolves to a contact set
 * that can be previewed and bulk-enrolled into a drip campaign. Filter values are always
 * parameterized (never interpolated) and only known columns are queryable.
 *
 * @module services/crm-deal-management/segmentService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

export interface SegmentFilter {
    lead_status?: string[];
    contact_type?: string[];
    region?: string[];
    lead_source?: string[];
    city?: string;
    assigned_agent?: string;
    tags?: string[];      // array overlap
    search?: string;      // name/email ILIKE
}

/** Parameterized WHERE from an allow-listed filter — no value is ever interpolated. */
function buildWhere(orgId: string, filter: SegmentFilter): { sql: string; params: any[] } {
    const clauses: string[] = ['c.organization_id = $1', 'c.deleted_at IS NULL'];
    const params: any[] = [orgId];
    const add = (val: any, fn: (i: number) => string) => { params.push(val); clauses.push(fn(params.length)); };

    // lead_status / contact_type are enum columns — compare as text so a text[] param matches.
    if (Array.isArray(filter.lead_status) && filter.lead_status.length) add(filter.lead_status, (i) => `c.lead_status::text = ANY($${i})`);
    if (Array.isArray(filter.contact_type) && filter.contact_type.length) add(filter.contact_type, (i) => `c.contact_type::text = ANY($${i})`);
    if (Array.isArray(filter.region) && filter.region.length) add(filter.region, (i) => `c.region = ANY($${i})`);
    if (Array.isArray(filter.lead_source) && filter.lead_source.length) add(filter.lead_source, (i) => `c.lead_source = ANY($${i})`);
    if (filter.city) add(`%${filter.city}%`, (i) => `c.city ILIKE $${i}`);
    if (filter.assigned_agent) add(filter.assigned_agent, (i) => `c.assigned_agent = $${i}`);
    if (Array.isArray(filter.tags) && filter.tags.length) add(filter.tags, (i) => `c.tags && $${i}`);
    if (filter.search) add(`%${filter.search}%`, (i) => `(c.first_name ILIKE $${i} OR c.last_name ILIKE $${i} OR c.email ILIKE $${i})`);

    return { sql: clauses.join(' AND '), params };
}

class SegmentService {
    async list(orgId: string): Promise<any[]> {
        const res = await pool.query(
            `SELECT * FROM crm_campaign_segments WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
            [orgId]
        );
        return res.rows;
    }

    async getById(id: string, orgId: string): Promise<any | null> {
        const res = await pool.query(
            `SELECT * FROM crm_campaign_segments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [id, orgId]
        );
        return res.rows[0] || null;
    }

    async create(orgId: string, input: { name: string; description?: string; filter?: SegmentFilter }, userId?: string): Promise<any> {
        const res = await pool.query(
            `INSERT INTO crm_campaign_segments (organization_id, name, description, filter, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [orgId, input.name, input.description || null, JSON.stringify(input.filter || {}), userId || null]
        );
        return res.rows[0];
    }

    async update(id: string, orgId: string, input: { name?: string; description?: string; filter?: SegmentFilter }): Promise<any | null> {
        const res = await pool.query(
            `UPDATE crm_campaign_segments SET
                name = COALESCE($3, name),
                description = COALESCE($4, description),
                filter = COALESCE($5, filter)
              WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING *`,
            [id, orgId, input.name ?? null, input.description ?? null, input.filter ? JSON.stringify(input.filter) : null]
        );
        return res.rows[0] || null;
    }

    async remove(id: string, orgId: string): Promise<boolean> {
        const res = await pool.query(
            `UPDATE crm_campaign_segments SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [id, orgId]
        );
        return (res.rowCount ?? 0) > 0;
    }

    async resolveContacts(orgId: string, filter: SegmentFilter, limit?: number): Promise<{ id: string; first_name: string; last_name: string; email: string | null }[]> {
        const { sql, params } = buildWhere(orgId, filter);
        const lim = limit ? ` LIMIT ${Math.min(Math.max(1, limit), 1000)}` : '';
        const res = await pool.query(
            `SELECT c.id, c.first_name, c.last_name, c.email FROM contacts c WHERE ${sql} ORDER BY c.created_at DESC${lim}`,
            params
        );
        return res.rows;
    }

    async count(orgId: string, filter: SegmentFilter): Promise<number> {
        const { sql, params } = buildWhere(orgId, filter);
        const res = await pool.query(`SELECT COUNT(*)::int AS n FROM contacts c WHERE ${sql}`, params);
        return res.rows[0]?.n ?? 0;
    }

    /** Enroll every contact matching the segment into a drip campaign (idempotent). */
    async enrollIntoCampaign(orgId: string, segmentId: string, campaignId: string): Promise<{ enrolled: number; matched: number }> {
        const segment = await this.getById(segmentId, orgId);
        if (!segment) throw new Error('Segment not found');
        const camp = await pool.query(
            `SELECT id FROM crm_drip_campaigns WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [campaignId, orgId]
        );
        if (!camp.rows[0]) throw new Error('Campaign not found');

        const contacts = await this.resolveContacts(orgId, segment.filter || {});
        let enrolled = 0;
        for (const c of contacts) {
            const r = await pool.query(
                `INSERT INTO crm_drip_enrollments (campaign_id, contact_id) VALUES ($1, $2)
                 ON CONFLICT (campaign_id, contact_id) DO NOTHING RETURNING id`,
                [campaignId, c.id]
            );
            if (r.rows[0]) enrolled++;
        }
        await pool.query(
            `UPDATE crm_drip_campaigns SET enrollment_count = (SELECT COUNT(*) FROM crm_drip_enrollments WHERE campaign_id = $1) WHERE id = $1`,
            [campaignId]
        );
        logger.info('Segment enrolled into campaign', { segmentId, campaignId, matched: contacts.length, enrolled });
        return { enrolled, matched: contacts.length };
    }
}

export const segmentService = new SegmentService();
export default segmentService;
