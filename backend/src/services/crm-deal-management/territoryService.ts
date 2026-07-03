/**
 * Agent Territory Service (PostGIS geo-fencing)
 *
 * Carves the map into agent territories and routes inbound leads/contacts to the owning
 * agent by point-in-polygon. Boundaries are stored as MultiPolygon/4326; a single drawn
 * polygon is wrapped to a 1-part MultiPolygon (ST_Multi).
 *
 * Routing precedence when a point sits inside several territories: exclusive first, then
 * higher priority, then oldest. Exclusivity overlaps are detected and surfaced (the route
 * decides whether to block) rather than DB-enforced, since adjacent territories touch.
 *
 * @module services/crm-deal-management/territoryService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { geocodingService } from '../data-hub/geocodingService';

export interface TerritoryInput {
    agentId: string;
    name: string;
    description?: string | null;
    boundary: any;             // GeoJSON geometry — Polygon or MultiPolygon
    isExclusive?: boolean;
    priority?: number;
    color?: string | null;
}

export interface TerritoryOverlap {
    id: string;
    name: string;
    agent_id: string;
}

class TerritoryService {
    /** List active territories (boundary as GeoJSON) with the owning agent's name. */
    async list(organizationId: string): Promise<any[]> {
        const res = await pool.query(
            `SELECT t.id, t.organization_id, t.agent_id, t.name, t.description,
                    ST_AsGeoJSON(t.boundary)::json AS boundary,
                    t.is_exclusive, t.priority, t.color, t.is_active, t.created_at, t.updated_at,
                    COALESCE(a.display_name, NULLIF(TRIM(CONCAT(a.first_name, ' ', a.last_name)), '')) AS agent_name
               FROM crm_agent_territories t
          LEFT JOIN agents a ON a.id = t.agent_id
              WHERE t.organization_id = $1 AND t.deleted_at IS NULL
              ORDER BY t.created_at DESC`,
            [organizationId]
        );
        return res.rows;
    }

    async getById(id: string, organizationId: string): Promise<any | null> {
        const res = await pool.query(
            `SELECT t.id, t.organization_id, t.agent_id, t.name, t.description,
                    ST_AsGeoJSON(t.boundary)::json AS boundary,
                    t.is_exclusive, t.priority, t.color, t.is_active, t.created_at, t.updated_at
               FROM crm_agent_territories t
              WHERE t.id = $1 AND t.organization_id = $2 AND t.deleted_at IS NULL`,
            [id, organizationId]
        );
        return res.rows[0] || null;
    }

    /** Active EXCLUSIVE territories that intersect a candidate boundary (GeoJSON). */
    async detectOverlaps(organizationId: string, boundaryGeoJson: any, excludeId?: string): Promise<TerritoryOverlap[]> {
        const res = await pool.query(
            `SELECT t.id, t.name, t.agent_id
               FROM crm_agent_territories t
              WHERE t.organization_id = $1
                AND t.deleted_at IS NULL
                AND t.is_active = true
                AND t.is_exclusive = true
                AND ($3::uuid IS NULL OR t.id <> $3)
                AND ST_Intersects(t.boundary, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)))`,
            [organizationId, JSON.stringify(boundaryGeoJson), excludeId || null]
        );
        return res.rows;
    }

    /** Create a territory. Returns the row + any exclusive overlaps (caller decides to block). */
    async create(organizationId: string, input: TerritoryInput, userId?: string): Promise<{ territory: any; overlaps: TerritoryOverlap[] }> {
        this.validateBoundary(input.boundary);
        const isExclusive = input.isExclusive !== false;
        const overlaps = isExclusive ? await this.detectOverlaps(organizationId, input.boundary) : [];

        const res = await pool.query(
            `INSERT INTO crm_agent_territories
                (organization_id, agent_id, name, description, boundary, is_exclusive, priority, color, created_by)
             VALUES ($1, $2, $3, $4, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)), $6, $7, $8, $9)
             RETURNING id`,
            [organizationId, input.agentId, input.name, input.description || null,
             JSON.stringify(input.boundary), isExclusive, input.priority ?? 0, input.color || null, userId || null]
        );
        const territory = await this.getById(res.rows[0].id, organizationId);
        logger.info('CRM territory created', { id: res.rows[0].id, agentId: input.agentId, overlaps: overlaps.length });
        return { territory, overlaps };
    }

    async update(id: string, organizationId: string, input: Partial<TerritoryInput> & { isActive?: boolean }): Promise<{ territory: any; overlaps: TerritoryOverlap[] } | null> {
        const existing = await this.getById(id, organizationId);
        if (!existing) return null;
        if (input.boundary) this.validateBoundary(input.boundary);
        const isExclusive = input.isExclusive ?? existing.is_exclusive;
        const overlaps = (input.boundary && isExclusive)
            ? await this.detectOverlaps(organizationId, input.boundary, id)
            : [];

        await pool.query(
            `UPDATE crm_agent_territories SET
                agent_id     = COALESCE($3, agent_id),
                name         = COALESCE($4, name),
                description  = COALESCE($5, description),
                boundary     = COALESCE(ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)), boundary),
                is_exclusive = COALESCE($7, is_exclusive),
                priority     = COALESCE($8, priority),
                color        = COALESCE($9, color),
                is_active    = COALESCE($10, is_active)
              WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [id, organizationId, input.agentId ?? null, input.name ?? null, input.description ?? null,
             input.boundary ? JSON.stringify(input.boundary) : null,
             input.isExclusive ?? null, input.priority ?? null, input.color ?? null, input.isActive ?? null]
        );
        const territory = await this.getById(id, organizationId);
        return { territory, overlaps };
    }

    async remove(id: string, organizationId: string): Promise<boolean> {
        const res = await pool.query(
            `UPDATE crm_agent_territories SET deleted_at = NOW()
              WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [id, organizationId]
        );
        return (res.rowCount ?? 0) > 0;
    }

    /** Core routing: which agent owns a lng/lat point. Exclusive first, then priority. */
    async findAgentForPoint(organizationId: string, lng: number, lat: number): Promise<{ agent_id: string; territory_id: string; name: string } | null> {
        const res = await pool.query(
            `SELECT agent_id, id AS territory_id, name
               FROM crm_agent_territories
              WHERE organization_id = $1 AND is_active = true AND deleted_at IS NULL
                AND ST_Contains(boundary, ST_SetSRID(ST_MakePoint($2, $3), 4326))
              ORDER BY is_exclusive DESC, priority DESC, created_at ASC
              LIMIT 1`,
            [organizationId, lng, lat]
        );
        return res.rows[0] || null;
    }

    /**
     * Best-effort: geocode a contact's location and, if it falls inside a territory, assign the
     * owning agent. Touches only contacts with no agent yet. Returns the assignment or null.
     */
    async resolveAndAssignContact(organizationId: string, contactId: string): Promise<{ agent_id: string; territory_id: string } | null> {
        // Skip entirely if the org has no territories (avoid a pointless geocode per contact).
        const has = await pool.query(
            `SELECT 1 FROM crm_agent_territories WHERE organization_id = $1 AND is_active AND deleted_at IS NULL LIMIT 1`,
            [organizationId]
        );
        if (!has.rows[0]) return null;

        const cRes = await pool.query(
            `SELECT id, assigned_agent, digital_address, city, region, current_address
               FROM contacts WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [contactId, organizationId]
        );
        const c = cRes.rows[0];
        if (!c || c.assigned_agent) return null;

        const point = await this.resolveContactPoint(c);
        if (!point) return null;

        const owner = await this.findAgentForPoint(organizationId, point.lng, point.lat);
        if (!owner) return null;

        // Assign only if still unassigned (race-safe compare-and-set).
        const upd = await pool.query(
            `UPDATE contacts SET assigned_agent = $3, updated_at = NOW()
              WHERE id = $1 AND organization_id = $2 AND assigned_agent IS NULL AND deleted_at IS NULL
          RETURNING id`,
            [contactId, organizationId, owner.agent_id]
        );
        if (!upd.rows[0]) return null;
        logger.info('Contact auto-routed to agent by territory', { contactId, agentId: owner.agent_id, territoryId: owner.territory_id });
        return { agent_id: owner.agent_id, territory_id: owner.territory_id };
    }

    private async resolveContactPoint(contact: any): Promise<{ lng: number; lat: number } | null> {
        // 1. Coordinates already on the structured address.
        const addr = contact.current_address;
        const lat = Number(addr?.latitude ?? addr?.lat);
        const lng = Number(addr?.longitude ?? addr?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) return { lng, lat };

        // 2. Geocode the best textual location we have (Ghana Post GPS digital address, then city/region).
        const parts = [contact.digital_address, contact.city, contact.region].filter(Boolean).join(', ');
        if (!parts) return null;
        const query = /ghana/i.test(parts) ? parts : `${parts}, Ghana`;
        const geo = await geocodingService.geocode(query);
        if (!geo || !Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude)) return null;
        return { lng: geo.longitude, lat: geo.latitude };
    }

    private validateBoundary(geojson: any): void {
        const t = geojson?.type;
        if (t !== 'Polygon' && t !== 'MultiPolygon') {
            throw new Error('boundary must be a GeoJSON Polygon or MultiPolygon');
        }
    }
}

export const territoryService = new TerritoryService();
export default territoryService;
