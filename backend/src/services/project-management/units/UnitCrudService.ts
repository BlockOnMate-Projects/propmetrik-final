/**
 * Unit CRUD Service
 * Phase 3.12 - Split from unitService
 * 
 * Handles core unit CRUD operations including:
 * - Single and bulk unit creation
 * - Read with filtering and pagination
 * - Update with automatic calculations
 * - Safe deletion
 */

import { pool } from '../../../database';
import { BaseService } from '../BaseService';
import { v4 as uuidv4 } from 'uuid';
import {
  ProjectUnit,
  CreateUnitInput,
  UpdateUnitInput,
  BulkCreateUnitInput,
  UnitFilters,
  PaginatedUnits,
  UnitAvailability,
  mapRowToUnit
} from './types';

class UnitCrudService extends BaseService {
  constructor() {
    super('UnitCrudService');
  }

  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------

  /**
   * Create a single unit
   */
  async create(input: CreateUnitInput): Promise<ProjectUnit> {
    // Calculate total sqm
    let totalSqm: number | null = null;
    if (input.internalSqm) {
      totalSqm = input.internalSqm + (input.externalSqm || 0);
    }
    
    // Calculate price per sqm
    let pricePerSqm: number | null = null;
    if (input.listPrice && totalSqm) {
      pricePerSqm = input.listPrice / totalSqm;
    }
    
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO project_units (
        id, project_id, organization_id,
        unit_number, unit_code, building, floor, block,
        unit_type, status,
        bedrooms, bathrooms, half_baths,
        internal_sqm, external_sqm, total_sqm,
        list_price, base_price, price_per_sqm, currency,
        features,
        floor_plan_url, images, virtual_tour_url,
        notes,
        created_by
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7, $8,
        $9, 'available',
        $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18, $19,
        $20,
        $21, $22, $23,
        $24,
        $25
      ) RETURNING *`,
      [
        id, input.projectId, input.organizationId,
        input.unitNumber, input.unitCode, input.building, input.floor, input.block,
        input.unitType,
        input.bedrooms || 0, input.bathrooms || 0, input.halfBaths || 0,
        input.internalSqm, input.externalSqm, totalSqm,
        input.listPrice, input.basePrice || input.listPrice, pricePerSqm, input.currency || 'GHS',
        JSON.stringify(input.features || []),
        input.floorPlanUrl, JSON.stringify(input.images || []), input.virtualTourUrl,
        input.notes,
        input.createdBy
      ]
    );
    
    this.log('info', `Created unit ${input.unitNumber} for project ${input.projectId}`);
    
    return mapRowToUnit(result.rows[0]);
  }

  /**
   * Create multiple units based on floor/unit ranges
   */
  async createBulk(input: BulkCreateUnitInput): Promise<ProjectUnit[]> {
    const units: ProjectUnit[] = [];
    
    for (let floor = input.floorStart; floor <= input.floorEnd; floor++) {
      for (let unit = 1; unit <= input.unitsPerFloor; unit++) {
        const unitNumber = `${input.unitNumberPrefix || ''}${floor}${unit.toString().padStart(2, '0')}`;
        
        const created = await this.create({
          projectId: input.projectId,
          organizationId: input.organizationId,
          unitNumber: unitNumber,
          building: input.building,
          floor: floor,
          unitType: input.unitType,
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
          internalSqm: input.internalSqm,
          listPrice: input.listPrice,
          createdBy: input.createdBy
        });
        
        units.push(created);
      }
    }
    
    this.log('info', `Bulk created ${units.length} units for project ${input.projectId}`);
    
    return units;
  }

  // --------------------------------------------------------------------------
  // READ
  // --------------------------------------------------------------------------

  /**
   * Get unit by ID
   */
  async getById(id: string): Promise<ProjectUnit | null> {
    const result = await pool.query(
      'SELECT * FROM project_units WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToUnit(result.rows[0]);
  }

  /**
   * Get all units for a project (without pagination)
   */
  async getByProject(projectId: string): Promise<ProjectUnit[]> {
    const result = await pool.query(
      `SELECT * FROM project_units 
       WHERE project_id = $1 
       ORDER BY building ASC, floor ASC, unit_number ASC`,
      [projectId]
    );
    
    return result.rows.map(row => mapRowToUnit(row));
  }

  /**
   * Get units with filtering and pagination
   */
  async getAll(
    filters: UnitFilters,
    page: number = 1,
    limit: number = 50
  ): Promise<PaginatedUnits> {
    const conditions: string[] = ['project_id = $1'];
    const params: unknown[] = [filters.projectId];
    let paramIndex = 2;
    
    // Status filter
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`status = ANY($${paramIndex})`);
        params.push(filters.status);
      } else {
        conditions.push(`status = $${paramIndex}`);
        params.push(filters.status);
      }
      paramIndex++;
    }
    
    // Type filter
    if (filters.unitType) {
      if (Array.isArray(filters.unitType)) {
        conditions.push(`unit_type = ANY($${paramIndex})`);
        params.push(filters.unitType);
      } else {
        conditions.push(`unit_type = $${paramIndex}`);
        params.push(filters.unitType);
      }
      paramIndex++;
    }
    
    // Building filter
    if (filters.building) {
      conditions.push(`building = $${paramIndex}`);
      params.push(filters.building);
      paramIndex++;
    }
    
    // Floor filter
    if (filters.floor !== undefined) {
      conditions.push(`floor = $${paramIndex}`);
      params.push(filters.floor);
      paramIndex++;
    }
    
    // Bedroom filters
    if (filters.minBedrooms !== undefined) {
      conditions.push(`bedrooms >= $${paramIndex}`);
      params.push(filters.minBedrooms);
      paramIndex++;
    }
    
    if (filters.maxBedrooms !== undefined) {
      conditions.push(`bedrooms <= $${paramIndex}`);
      params.push(filters.maxBedrooms);
      paramIndex++;
    }
    
    // Price filters
    if (filters.minPrice !== undefined) {
      conditions.push(`list_price >= $${paramIndex}`);
      params.push(filters.minPrice);
      paramIndex++;
    }
    
    if (filters.maxPrice !== undefined) {
      conditions.push(`list_price <= $${paramIndex}`);
      params.push(filters.maxPrice);
      paramIndex++;
    }
    
    // Has buyer filter
    if (filters.hasBuyer !== undefined) {
      if (filters.hasBuyer) {
        conditions.push(`buyer_id IS NOT NULL`);
      } else {
        conditions.push(`buyer_id IS NULL`);
      }
    }
    
    // Search
    if (filters.search) {
      conditions.push(`(
        unit_number ILIKE $${paramIndex} OR
        buyer_name ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM project_units WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Get paginated results
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    
    const result = await pool.query(
      `SELECT * FROM project_units 
       WHERE ${whereClause}
       ORDER BY building ASC, floor ASC, unit_number ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    
    return {
      units: result.rows.map(row => mapRowToUnit(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get availability view for project
   */
  async getAvailability(projectId: string): Promise<UnitAvailability[]> {
    const result = await pool.query(
      `SELECT 
        id, unit_number, building, floor, status, unit_type, bedrooms, list_price,
        status = 'available' as is_available
       FROM project_units 
       WHERE project_id = $1 
       ORDER BY building, floor, unit_number`,
      [projectId]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      unitNumber: row.unit_number,
      building: row.building,
      floor: row.floor,
      status: row.status,
      unitType: row.unit_type,
      bedrooms: row.bedrooms,
      listPrice: row.list_price ? parseFloat(row.list_price) : undefined,
      isAvailable: row.is_available
    }));
  }

  /**
   * Check if unit exists
   */
  async exists(id: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT 1 FROM project_units WHERE id = $1',
      [id]
    );
    return result.rows.length > 0;
  }

  /**
   * Check if unit number exists in project
   */
  async unitNumberExists(projectId: string, unitNumber: string, excludeId?: string): Promise<boolean> {
    let query = 'SELECT 1 FROM project_units WHERE project_id = $1 AND unit_number = $2';
    const params: string[] = [projectId, unitNumber];
    
    if (excludeId) {
      query += ' AND id != $3';
      params.push(excludeId);
    }
    
    const result = await pool.query(query, params);
    return result.rows.length > 0;
  }

  // --------------------------------------------------------------------------
  // UPDATE
  // --------------------------------------------------------------------------

  /**
   * Update a unit
   */
  async update(id: string, input: UpdateUnitInput): Promise<ProjectUnit | null> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;
    
    // Field mapping from camelCase to snake_case
    const fieldMap: Record<string, string> = {
      unitNumber: 'unit_number',
      unitCode: 'unit_code',
      unitType: 'unit_type',
      halfBaths: 'half_baths',
      internalSqm: 'internal_sqm',
      externalSqm: 'external_sqm',
      listPrice: 'list_price',
      salePrice: 'sale_price',
      basePrice: 'base_price',
      finishingUpgradeCost: 'finishing_upgrade_cost',
      parkingCost: 'parking_cost',
      storageCost: 'storage_cost',
      otherCosts: 'other_costs',
      buyerId: 'buyer_id',
      buyerName: 'buyer_name',
      buyerPhone: 'buyer_phone',
      buyerEmail: 'buyer_email',
      reservedAt: 'reserved_at',
      reservedBy: 'reserved_by',
      contractDate: 'contract_date',
      handoverDate: 'handover_date',
      totalPaid: 'total_paid',
      paymentPlanId: 'payment_plan_id',
      dealId: 'deal_id',
      floorPlanUrl: 'floor_plan_url',
      virtualTourUrl: 'virtual_tour_url',
      internalNotes: 'internal_notes',
      updatedBy: 'updated_by'
    };
    
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      
      const dbField = fieldMap[key] || key;
      
      if (key === 'features' || key === 'images') {
        updates.push(`${dbField} = $${paramIndex}`);
        params.push(JSON.stringify(value));
      } else {
        updates.push(`${dbField} = $${paramIndex}`);
        params.push(value);
      }
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return this.getById(id);
    }
    
    // Recalculate total sqm and price per sqm if needed
    if (input.internalSqm !== undefined || input.externalSqm !== undefined) {
      const unit = await this.getById(id);
      if (unit) {
        const internal = input.internalSqm ?? unit.internalSqm ?? 0;
        const external = input.externalSqm ?? unit.externalSqm ?? 0;
        const totalSqm = internal + external;
        updates.push(`total_sqm = $${paramIndex}`);
        params.push(totalSqm);
        paramIndex++;
        
        const price = input.listPrice ?? unit.listPrice;
        if (price && totalSqm > 0) {
          updates.push(`price_per_sqm = $${paramIndex}`);
          params.push(price / totalSqm);
          paramIndex++;
        }
      }
    }
    
    updates.push(`updated_at = NOW()`);
    params.push(id);
    
    const result = await pool.query(
      `UPDATE project_units 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    this.log('info', `Updated unit ${id}`);
    
    return mapRowToUnit(result.rows[0]);
  }

  // --------------------------------------------------------------------------
  // DELETE
  // --------------------------------------------------------------------------

  /**
   * Delete a unit (only if available or not for sale)
   */
  async delete(id: string): Promise<boolean> {
    const unit = await this.getById(id);
    if (!unit || !['available', 'not_for_sale'].includes(unit.status)) {
      this.log('warn', `Cannot delete unit ${id} - has buyers or invalid status`);
      return false; // Can't delete units with buyers
    }
    
    const result = await pool.query(
      'DELETE FROM project_units WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length > 0) {
      this.log('info', `Deleted unit ${id}`);
      return true;
    }
    
    return false;
  }

  /**
   * Bulk delete units (only available/not_for_sale)
   */
  async bulkDelete(ids: string[]): Promise<{ deleted: number; skipped: number }> {
    const result = await pool.query(
      `DELETE FROM project_units 
       WHERE id = ANY($1) AND status IN ('available', 'not_for_sale')
       RETURNING id`,
      [ids]
    );
    
    const deleted = result.rows.length;
    const skipped = ids.length - deleted;
    
    this.log('info', `Bulk deleted ${deleted} units, skipped ${skipped}`);
    
    return { deleted, skipped };
  }
}

export const unitCrudService = new UnitCrudService();
