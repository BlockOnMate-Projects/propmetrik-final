/**
 * Stacking Plan Service
 *
 * Manages building floors/units for a visual stacking plan.
 * Auto-creates the `crm_building_floors` and `crm_building_units` tables on first use.
 *
 * @module services/crm-deal-management/stackingPlanService
 */

import db from '../../database';
import { logger } from '../../utils/logger';

// ─────────────────────────────────────────────────────
// Auto-create table
// ─────────────────────────────────────────────────────

let tableCreated = false;

async function ensureTables(): Promise<void> {
    if (tableCreated) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS crm_building_floors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id UUID NOT NULL,
            organization_id UUID NOT NULL,
            floor_number INTEGER NOT NULL,
            floor_name VARCHAR(100),
            total_units INTEGER DEFAULT 0,
            gross_area_sqm DECIMAL(12,2),
            net_leasable_sqm DECIMAL(12,2),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(property_id, floor_number)
        );

        CREATE INDEX IF NOT EXISTS idx_crm_floors_property ON crm_building_floors(property_id);

        CREATE TABLE IF NOT EXISTS crm_building_units (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            floor_id UUID NOT NULL REFERENCES crm_building_floors(id) ON DELETE CASCADE,
            property_id UUID NOT NULL,
            organization_id UUID NOT NULL,
            unit_number VARCHAR(50) NOT NULL,
            unit_type VARCHAR(50) DEFAULT 'office',
            area_sqm DECIMAL(12,2),
            status VARCHAR(30) DEFAULT 'vacant',
            tenant_name VARCHAR(255),
            tenant_contact_id UUID,
            deal_id UUID,
            lease_start DATE,
            lease_end DATE,
            monthly_rent DECIMAL(15,2),
            rent_currency VARCHAR(10) DEFAULT 'GHS',
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_crm_units_floor ON crm_building_units(floor_id);
        CREATE INDEX IF NOT EXISTS idx_crm_units_property ON crm_building_units(property_id);
        CREATE INDEX IF NOT EXISTS idx_crm_units_status ON crm_building_units(status);
    `);
    tableCreated = true;
}

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export interface Floor {
    id: string;
    property_id: string;
    floor_number: number;
    floor_name: string | null;
    total_units: number;
    gross_area_sqm: number | null;
    net_leasable_sqm: number | null;
    units: Unit[];
}

export interface Unit {
    id: string;
    floor_id: string;
    unit_number: string;
    unit_type: string;
    area_sqm: number | null;
    status: 'vacant' | 'occupied' | 'reserved' | 'maintenance';
    tenant_name: string | null;
    tenant_contact_id: string | null;
    deal_id: string | null;
    lease_start: string | null;
    lease_end: string | null;
    monthly_rent: number | null;
    rent_currency: string;
    notes: string | null;
}

export interface StackingPlanSummary {
    property_id: string;
    total_floors: number;
    total_units: number;
    occupied_units: number;
    vacant_units: number;
    occupancy_rate: number;
    total_leasable_sqm: number;
    occupied_sqm: number;
    monthly_revenue: number;
    floors: Floor[];
}

// ─────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────

export class StackingPlanService {
    /**
     * Get full stacking plan for a property
     */
    async getStackingPlan(propertyId: string, organizationId: string): Promise<StackingPlanSummary> {
        await ensureTables();

        const floorsResult = await db.query(
            `SELECT * FROM crm_building_floors
             WHERE property_id = $1 AND organization_id = $2
             ORDER BY floor_number DESC`,
            [propertyId, organizationId]
        );

        const unitsResult = await db.query(
            `SELECT * FROM crm_building_units
             WHERE property_id = $1 AND organization_id = $2
             ORDER BY unit_number`,
            [propertyId, organizationId]
        );

        const unitsByFloor = new Map<string, Unit[]>();
        for (const u of unitsResult.rows) {
            const list = unitsByFloor.get(u.floor_id) ?? [];
            list.push(u as unknown as Unit);
            unitsByFloor.set(u.floor_id, list);
        }

        const floors: Floor[] = floorsResult.rows.map((f: any) => ({
            ...f,
            units: unitsByFloor.get(f.id) ?? [],
        }));

        const allUnits = unitsResult.rows;
        const occupied = allUnits.filter((u: any) => u.status === 'occupied');
        const totalLeasable = allUnits.reduce((s: number, u: any) => s + parseFloat(u.area_sqm || 0), 0);
        const occupiedSqm = occupied.reduce((s: number, u: any) => s + parseFloat(u.area_sqm || 0), 0);
        const monthlyRevenue = occupied.reduce((s: number, u: any) => s + parseFloat(u.monthly_rent || 0), 0);

        return {
            property_id: propertyId,
            total_floors: floors.length,
            total_units: allUnits.length,
            occupied_units: occupied.length,
            vacant_units: allUnits.filter((u: any) => u.status === 'vacant').length,
            occupancy_rate: allUnits.length ? Math.round((occupied.length / allUnits.length) * 100) : 0,
            total_leasable_sqm: totalLeasable,
            occupied_sqm: occupiedSqm,
            monthly_revenue: monthlyRevenue,
            floors,
        };
    }

    /**
     * Add / update a floor
     */
    async upsertFloor(
        propertyId: string,
        organizationId: string,
        data: { floor_number: number; floor_name?: string; gross_area_sqm?: number; net_leasable_sqm?: number }
    ): Promise<any> {
        await ensureTables();
        const result = await db.query(
            `INSERT INTO crm_building_floors
                (property_id, organization_id, floor_number, floor_name, gross_area_sqm, net_leasable_sqm)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (property_id, floor_number)
             DO UPDATE SET floor_name = EXCLUDED.floor_name,
                           gross_area_sqm = EXCLUDED.gross_area_sqm,
                           net_leasable_sqm = EXCLUDED.net_leasable_sqm,
                           updated_at = NOW()
             RETURNING *`,
            [propertyId, organizationId, data.floor_number, data.floor_name || null,
             data.gross_area_sqm || null, data.net_leasable_sqm || null]
        );
        return result.rows[0];
    }

    /**
     * Delete a floor (cascades units)
     */
    async deleteFloor(floorId: string, organizationId: string): Promise<void> {
        await ensureTables();
        await db.query(
            'DELETE FROM crm_building_floors WHERE id = $1 AND organization_id = $2',
            [floorId, organizationId]
        );
    }

    /**
     * Add / update a unit
     */
    async upsertUnit(
        propertyId: string,
        organizationId: string,
        data: Partial<Unit> & { floor_id: string; unit_number: string }
    ): Promise<any> {
        await ensureTables();

        if (data.id) {
            // Update
            const fields = [
                'unit_number', 'unit_type', 'area_sqm', 'status', 'tenant_name',
                'tenant_contact_id', 'deal_id', 'lease_start', 'lease_end',
                'monthly_rent', 'rent_currency', 'notes',
            ];
            const sets: string[] = [];
            const params: any[] = [data.id, organizationId];
            let i = 3;
            for (const f of fields) {
                if ((data as any)[f] !== undefined) {
                    sets.push(`${f} = $${i}`);
                    params.push((data as any)[f]);
                    i++;
                }
            }
            if (sets.length === 0) return {};
            sets.push('updated_at = NOW()');
            const result = await db.query(
                `UPDATE crm_building_units SET ${sets.join(', ')}
                 WHERE id = $1 AND organization_id = $2 RETURNING *`,
                params
            );
            return result.rows[0];
        }

        // Insert
        const result = await db.query(
            `INSERT INTO crm_building_units
                (floor_id, property_id, organization_id, unit_number, unit_type,
                 area_sqm, status, tenant_name, tenant_contact_id, deal_id,
                 lease_start, lease_end, monthly_rent, rent_currency, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING *`,
            [
                data.floor_id, propertyId, organizationId, data.unit_number,
                data.unit_type || 'office', data.area_sqm || null,
                data.status || 'vacant', data.tenant_name || null,
                data.tenant_contact_id || null, data.deal_id || null,
                data.lease_start || null, data.lease_end || null,
                data.monthly_rent || null, data.rent_currency || 'GHS',
                data.notes || null,
            ]
        );

        // Update floor unit count
        await db.query(
            `UPDATE crm_building_floors SET total_units = (
                SELECT COUNT(*) FROM crm_building_units WHERE floor_id = $1
             ) WHERE id = $1`,
            [data.floor_id]
        );

        return result.rows[0];
    }

    /**
     * Delete a unit
     */
    async deleteUnit(unitId: string, organizationId: string): Promise<void> {
        await ensureTables();
        const unit = await db.query(
            'DELETE FROM crm_building_units WHERE id = $1 AND organization_id = $2 RETURNING floor_id',
            [unitId, organizationId]
        );
        if (unit.rows[0]) {
            await db.query(
                `UPDATE crm_building_floors SET total_units = (
                    SELECT COUNT(*) FROM crm_building_units WHERE floor_id = $1
                 ) WHERE id = $1`,
                [unit.rows[0].floor_id]
            );
        }
    }
}

export const stackingPlanService = new StackingPlanService();
