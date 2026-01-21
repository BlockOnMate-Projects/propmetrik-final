/**
 * Unit Service
 * Phase 5.8 Week 1 - Project Unit Management
 * Competitive Inspiration: Buildertrend (selections/upgrades)
 * 
 * Handles:
 * - Unit CRUD with bulk creation
 * - Status management (available → reserved → sold → handed over)
 * - Buyer assignment and tracking
 * - Upgrade/selection management (Buildertrend-style)
 * - CRM deal integration (auto-create deals on unit sale)
 * - Pricing calculations with upgrades
 */

import { pool } from '../../../database';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export type UnitStatus = 
  | 'available'
  | 'reserved'
  | 'under_contract'
  | 'sold'
  | 'handed_over'
  | 'rented'
  | 'not_for_sale'
  | 'on_hold';

export type UnitType = 
  | 'studio'
  | '1_bedroom'
  | '2_bedroom'
  | '3_bedroom'
  | '4_bedroom'
  | '5_plus_bedroom'
  | 'penthouse'
  | 'townhouse'
  | 'duplex'
  | 'triplex'
  | 'commercial_unit'
  | 'retail_unit'
  | 'office_unit'
  | 'parking'
  | 'storage'
  | 'other';

export interface UnitUpgrade {
  id: string;
  category: string;
  item: string;
  description?: string;
  price: number;
  selected_at: string;
  selected_by?: string;
}

export interface ProjectUnit {
  id: string;
  project_id: string;
  organization_id: string;
  
  // Identification
  unit_number: string;
  unit_code?: string;
  building?: string;
  floor?: number;
  block?: string;
  
  // Type & Status
  unit_type: UnitType;
  status: UnitStatus;
  
  // Physical
  bedrooms: number;
  bathrooms: number;
  half_baths: number;
  internal_sqm?: number;
  external_sqm?: number;
  total_sqm?: number;
  
  // Pricing
  list_price?: number;
  sale_price?: number;
  price_per_sqm?: number;
  currency: string;
  
  // Price breakdown
  base_price?: number;
  finishing_upgrade_cost: number;
  parking_cost: number;
  storage_cost: number;
  other_costs: number;
  
  // Upgrades
  selected_upgrades: UnitUpgrade[];
  
  // Buyer
  buyer_id?: string;
  buyer_name?: string;
  buyer_phone?: string;
  buyer_email?: string;
  
  // Sales tracking
  reserved_at?: Date;
  reserved_by?: string;
  contract_date?: Date;
  handover_date?: Date;
  
  // Payment
  total_paid: number;
  payment_percentage: number;
  payment_plan_id?: string;
  
  // CRM integration
  deal_id?: string;
  
  // Features
  features: string[];
  
  // Media
  floor_plan_url?: string;
  images: string[];
  virtual_tour_url?: string;
  
  // Notes
  notes?: string;
  internal_notes?: string;
  
  metadata: Record<string, any>;
  
  // Audit
  created_by?: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUnitInput {
  project_id: string;
  organization_id: string;
  
  unit_number: string;
  unit_code?: string;
  building?: string;
  floor?: number;
  block?: string;
  
  unit_type: UnitType;
  
  bedrooms?: number;
  bathrooms?: number;
  half_baths?: number;
  internal_sqm?: number;
  external_sqm?: number;
  
  list_price?: number;
  base_price?: number;
  currency?: string;
  
  features?: string[];
  
  floor_plan_url?: string;
  images?: string[];
  virtual_tour_url?: string;
  
  notes?: string;
  
  created_by?: string;
}

export interface UpdateUnitInput {
  unit_number?: string;
  unit_code?: string;
  building?: string;
  floor?: number;
  block?: string;
  
  unit_type?: UnitType;
  status?: UnitStatus;
  
  bedrooms?: number;
  bathrooms?: number;
  half_baths?: number;
  internal_sqm?: number;
  external_sqm?: number;
  
  list_price?: number;
  sale_price?: number;
  base_price?: number;
  finishing_upgrade_cost?: number;
  parking_cost?: number;
  storage_cost?: number;
  other_costs?: number;
  
  buyer_id?: string;
  buyer_name?: string;
  buyer_phone?: string;
  buyer_email?: string;
  
  reserved_at?: Date;
  reserved_by?: string;
  contract_date?: Date;
  handover_date?: Date;
  
  total_paid?: number;
  payment_plan_id?: string;
  
  deal_id?: string;
  
  features?: string[];
  
  floor_plan_url?: string;
  images?: string[];
  virtual_tour_url?: string;
  
  notes?: string;
  internal_notes?: string;
  
  updated_by?: string;
}

export interface BulkCreateUnitInput {
  project_id: string;
  organization_id: string;
  building?: string;
  unit_type: UnitType;
  
  // Range for bulk creation
  floor_start: number;
  floor_end: number;
  units_per_floor: number;
  unit_number_prefix?: string;
  
  // Common attributes
  bedrooms?: number;
  bathrooms?: number;
  internal_sqm?: number;
  list_price?: number;
  
  created_by?: string;
}

export interface UnitFilters {
  project_id: string;
  status?: UnitStatus | UnitStatus[];
  unit_type?: UnitType | UnitType[];
  building?: string;
  floor?: number;
  min_bedrooms?: number;
  max_bedrooms?: number;
  min_price?: number;
  max_price?: number;
  has_buyer?: boolean;
  search?: string;
}

export interface UnitStats {
  total_units: number;
  by_status: Record<UnitStatus, number>;
  by_type: Record<string, number>;
  by_building: Record<string, number>;
  total_list_value: number;
  total_sold_value: number;
  total_collected: number;
  avg_price_per_sqm: number;
}

export interface ReserveUnitInput {
  buyer_id?: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_email?: string;
  reserved_by: string;
  auto_create_deal?: boolean;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class UnitService {
  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------

  async create(input: CreateUnitInput): Promise<ProjectUnit> {
    // Calculate total sqm
    let totalSqm: number | null = null;
    if (input.internal_sqm) {
      totalSqm = input.internal_sqm + (input.external_sqm || 0);
    }
    
    // Calculate price per sqm
    let pricePerSqm: number | null = null;
    if (input.list_price && totalSqm) {
      pricePerSqm = input.list_price / totalSqm;
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
        id, input.project_id, input.organization_id,
        input.unit_number, input.unit_code, input.building, input.floor, input.block,
        input.unit_type,
        input.bedrooms || 0, input.bathrooms || 0, input.half_baths || 0,
        input.internal_sqm, input.external_sqm, totalSqm,
        input.list_price, input.base_price || input.list_price, pricePerSqm, input.currency || 'GHS',
        JSON.stringify(input.features || []),
        input.floor_plan_url, JSON.stringify(input.images || []), input.virtual_tour_url,
        input.notes,
        input.created_by
      ]
    );
    
    return this.mapRow(result.rows[0]);
  }

  async createBulk(input: BulkCreateUnitInput): Promise<ProjectUnit[]> {
    const units: ProjectUnit[] = [];
    
    for (let floor = input.floor_start; floor <= input.floor_end; floor++) {
      for (let unit = 1; unit <= input.units_per_floor; unit++) {
        const unitNumber = `${input.unit_number_prefix || ''}${floor}${unit.toString().padStart(2, '0')}`;
        
        const created = await this.create({
          project_id: input.project_id,
          organization_id: input.organization_id,
          unit_number: unitNumber,
          building: input.building,
          floor: floor,
          unit_type: input.unit_type,
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
          internal_sqm: input.internal_sqm,
          list_price: input.list_price,
          created_by: input.created_by
        });
        
        units.push(created);
      }
    }
    
    return units;
  }

  // --------------------------------------------------------------------------
  // READ
  // --------------------------------------------------------------------------

  async getById(id: string): Promise<ProjectUnit | null> {
    const result = await pool.query(
      'SELECT * FROM project_units WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  async getByProject(projectId: string): Promise<ProjectUnit[]> {
    const result = await pool.query(
      `SELECT * FROM project_units 
       WHERE project_id = $1 
       ORDER BY building ASC, floor ASC, unit_number ASC`,
      [projectId]
    );
    
    return result.rows.map(row => this.mapRow(row));
  }

  async getAll(
    filters: UnitFilters,
    page: number = 1,
    limit: number = 50
  ): Promise<{ units: ProjectUnit[]; total: number }> {
    const conditions: string[] = ['project_id = $1'];
    const params: any[] = [filters.project_id];
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
    if (filters.unit_type) {
      if (Array.isArray(filters.unit_type)) {
        conditions.push(`unit_type = ANY($${paramIndex})`);
        params.push(filters.unit_type);
      } else {
        conditions.push(`unit_type = $${paramIndex}`);
        params.push(filters.unit_type);
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
    if (filters.min_bedrooms !== undefined) {
      conditions.push(`bedrooms >= $${paramIndex}`);
      params.push(filters.min_bedrooms);
      paramIndex++;
    }
    
    if (filters.max_bedrooms !== undefined) {
      conditions.push(`bedrooms <= $${paramIndex}`);
      params.push(filters.max_bedrooms);
      paramIndex++;
    }
    
    // Price filters
    if (filters.min_price !== undefined) {
      conditions.push(`list_price >= $${paramIndex}`);
      params.push(filters.min_price);
      paramIndex++;
    }
    
    if (filters.max_price !== undefined) {
      conditions.push(`list_price <= $${paramIndex}`);
      params.push(filters.max_price);
      paramIndex++;
    }
    
    // Has buyer filter
    if (filters.has_buyer !== undefined) {
      if (filters.has_buyer) {
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
    
    // Count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM project_units WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Get paginated
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
      units: result.rows.map(row => this.mapRow(row)),
      total
    };
  }

  async getAvailability(projectId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM v_unit_availability WHERE project_id = $1 ORDER BY building, floor, unit_number`,
      [projectId]
    );
    
    return result.rows;
  }

  async getStats(projectId: string): Promise<UnitStats> {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_units,
        COUNT(*) FILTER (WHERE status = 'available') as available,
        COUNT(*) FILTER (WHERE status = 'reserved') as reserved,
        COUNT(*) FILTER (WHERE status = 'under_contract') as under_contract,
        COUNT(*) FILTER (WHERE status = 'sold') as sold,
        COUNT(*) FILTER (WHERE status = 'handed_over') as handed_over,
        COUNT(*) FILTER (WHERE status = 'rented') as rented,
        COUNT(*) FILTER (WHERE status = 'not_for_sale') as not_for_sale,
        COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold,
        COALESCE(SUM(list_price), 0) as total_list_value,
        COALESCE(SUM(sale_price) FILTER (WHERE status IN ('sold', 'handed_over')), 0) as total_sold_value,
        COALESCE(SUM(total_paid), 0) as total_collected,
        COALESCE(AVG(price_per_sqm) FILTER (WHERE price_per_sqm > 0), 0) as avg_price_per_sqm
       FROM project_units 
       WHERE project_id = $1`,
      [projectId]
    );
    
    const row = result.rows[0];
    
    // Get by type
    const typeResult = await pool.query(
      `SELECT unit_type, COUNT(*) as count FROM project_units WHERE project_id = $1 GROUP BY unit_type`,
      [projectId]
    );
    const byType: Record<string, number> = {};
    typeResult.rows.forEach(r => {
      byType[r.unit_type] = parseInt(r.count, 10);
    });
    
    // Get by building
    const buildingResult = await pool.query(
      `SELECT building, COUNT(*) as count FROM project_units WHERE project_id = $1 AND building IS NOT NULL GROUP BY building`,
      [projectId]
    );
    const byBuilding: Record<string, number> = {};
    buildingResult.rows.forEach(r => {
      byBuilding[r.building] = parseInt(r.count, 10);
    });
    
    return {
      total_units: parseInt(row.total_units, 10),
      by_status: {
        available: parseInt(row.available, 10),
        reserved: parseInt(row.reserved, 10),
        under_contract: parseInt(row.under_contract, 10),
        sold: parseInt(row.sold, 10),
        handed_over: parseInt(row.handed_over, 10),
        rented: parseInt(row.rented, 10),
        not_for_sale: parseInt(row.not_for_sale, 10),
        on_hold: parseInt(row.on_hold, 10)
      },
      by_type: byType,
      by_building: byBuilding,
      total_list_value: parseFloat(row.total_list_value),
      total_sold_value: parseFloat(row.total_sold_value),
      total_collected: parseFloat(row.total_collected),
      avg_price_per_sqm: parseFloat(row.avg_price_per_sqm)
    };
  }

  // --------------------------------------------------------------------------
  // UPDATE
  // --------------------------------------------------------------------------

  async update(id: string, input: UpdateUnitInput): Promise<ProjectUnit | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    const updateFields = Object.entries(input).filter(([_, value]) => value !== undefined);
    
    for (const [key, value] of updateFields) {
      if (key === 'features' || key === 'images') {
        updates.push(`${key} = $${paramIndex}`);
        params.push(JSON.stringify(value));
      } else {
        updates.push(`${key} = $${paramIndex}`);
        params.push(value);
      }
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return this.getById(id);
    }
    
    // Recalculate total sqm and price per sqm if needed
    if (input.internal_sqm !== undefined || input.external_sqm !== undefined) {
      const unit = await this.getById(id);
      if (unit) {
        const internal = input.internal_sqm ?? unit.internal_sqm ?? 0;
        const external = input.external_sqm ?? unit.external_sqm ?? 0;
        const totalSqm = internal + external;
        updates.push(`total_sqm = $${paramIndex}`);
        params.push(totalSqm);
        paramIndex++;
        
        const price = input.list_price ?? unit.list_price;
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
    
    return this.mapRow(result.rows[0]);
  }

  // --------------------------------------------------------------------------
  // STATUS TRANSITIONS
  // --------------------------------------------------------------------------

  async reserve(id: string, input: ReserveUnitInput): Promise<ProjectUnit | null> {
    const unit = await this.getById(id);
    if (!unit || unit.status !== 'available') {
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'reserved',
           buyer_id = $2,
           buyer_name = $3,
           buyer_phone = $4,
           buyer_email = $5,
           reserved_at = NOW(),
           reserved_by = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, input.buyer_id, input.buyer_name, input.buyer_phone, input.buyer_email, input.reserved_by]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const updatedUnit = this.mapRow(result.rows[0]);
    
    // Auto-create deal if enabled
    if (input.auto_create_deal) {
      await this.createDealForUnit(updatedUnit);
    }
    
    return updatedUnit;
  }

  async moveToContract(
    id: string, 
    salePrice: number, 
    contractDate: Date,
    dealId?: string
  ): Promise<ProjectUnit | null> {
    const unit = await this.getById(id);
    if (!unit || !['available', 'reserved'].includes(unit.status)) {
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'under_contract',
           sale_price = $2,
           contract_date = $3,
           deal_id = COALESCE($4, deal_id),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, salePrice, contractDate, dealId]
    );
    
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async markAsSold(id: string): Promise<ProjectUnit | null> {
    const unit = await this.getById(id);
    if (!unit || !['reserved', 'under_contract'].includes(unit.status)) {
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'sold',
           payment_percentage = 100,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async handover(id: string, handoverDate: Date): Promise<ProjectUnit | null> {
    const unit = await this.getById(id);
    if (!unit || unit.status !== 'sold') {
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'handed_over',
           handover_date = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, handoverDate]
    );
    
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async cancelReservation(id: string, reason?: string): Promise<ProjectUnit | null> {
    const unit = await this.getById(id);
    if (!unit || unit.status !== 'reserved') {
      return null;
    }
    
    const result = await pool.query(
      `UPDATE project_units 
       SET status = 'available',
           buyer_id = NULL,
           buyer_name = NULL,
           buyer_phone = NULL,
           buyer_email = NULL,
           reserved_at = NULL,
           reserved_by = NULL,
           internal_notes = COALESCE(internal_notes || E'\n', '') || $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, reason ? `Reservation cancelled: ${reason}` : 'Reservation cancelled']
    );
    
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  // --------------------------------------------------------------------------
  // UPGRADES / SELECTIONS (Buildertrend-style)
  // --------------------------------------------------------------------------

  async addUpgrade(id: string, upgrade: Omit<UnitUpgrade, 'id' | 'selected_at'>): Promise<ProjectUnit | null> {
    const unit = await this.getById(id);
    if (!unit) return null;
    
    const newUpgrade: UnitUpgrade = {
      id: uuidv4(),
      ...upgrade,
      selected_at: new Date().toISOString()
    };
    
    const upgrades = [...unit.selected_upgrades, newUpgrade];
    const totalUpgradeCost = upgrades.reduce((sum, u) => sum + u.price, 0);
    
    const result = await pool.query(
      `UPDATE project_units 
       SET selected_upgrades = $1,
           finishing_upgrade_cost = $2,
           list_price = COALESCE(base_price, list_price) + $2 + parking_cost + storage_cost + other_costs,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(upgrades), totalUpgradeCost, id]
    );
    
    return this.mapRow(result.rows[0]);
  }

  async removeUpgrade(id: string, upgradeId: string): Promise<ProjectUnit | null> {
    const unit = await this.getById(id);
    if (!unit) return null;
    
    const upgrades = unit.selected_upgrades.filter(u => u.id !== upgradeId);
    const totalUpgradeCost = upgrades.reduce((sum, u) => sum + u.price, 0);
    
    const result = await pool.query(
      `UPDATE project_units 
       SET selected_upgrades = $1,
           finishing_upgrade_cost = $2,
           list_price = COALESCE(base_price, list_price) + $2 + parking_cost + storage_cost + other_costs,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(upgrades), totalUpgradeCost, id]
    );
    
    return this.mapRow(result.rows[0]);
  }

  async getUpgradeCategories(): Promise<{ category: string; items: { name: string; price: number }[] }[]> {
    // Return standard upgrade categories for Ghana real estate
    return [
      {
        category: 'Kitchen',
        items: [
          { name: 'Granite Countertops', price: 5000 },
          { name: 'Premium Cabinets', price: 8000 },
          { name: 'Island Upgrade', price: 12000 },
          { name: 'Built-in Appliances Package', price: 15000 }
        ]
      },
      {
        category: 'Flooring',
        items: [
          { name: 'Porcelain Tiles (Premium)', price: 3000 },
          { name: 'Hardwood Flooring', price: 10000 },
          { name: 'Marble Flooring', price: 20000 }
        ]
      },
      {
        category: 'Bathroom',
        items: [
          { name: 'Rain Shower System', price: 2500 },
          { name: 'Jacuzzi Tub', price: 8000 },
          { name: 'Premium Fixtures Package', price: 5000 }
        ]
      },
      {
        category: 'Electrical',
        items: [
          { name: 'Smart Home Package', price: 15000 },
          { name: 'Solar Panel System', price: 25000 },
          { name: 'Backup Generator Connection', price: 5000 },
          { name: 'EV Charging Point', price: 3000 }
        ]
      },
      {
        category: 'Security',
        items: [
          { name: 'CCTV Package', price: 5000 },
          { name: 'Smart Lock System', price: 3000 },
          { name: 'Alarm System', price: 4000 }
        ]
      },
      {
        category: 'Outdoor',
        items: [
          { name: 'Balcony Enclosure', price: 8000 },
          { name: 'Private Garden Setup', price: 5000 },
          { name: 'BBQ Area', price: 6000 }
        ]
      }
    ];
  }

  // --------------------------------------------------------------------------
  // PAYMENTS
  // --------------------------------------------------------------------------

  async recordPayment(id: string, amount: number): Promise<ProjectUnit | null> {
    const unit = await this.getById(id);
    if (!unit) return null;
    
    const newTotalPaid = unit.total_paid + amount;
    const salePrice = unit.sale_price || unit.list_price || 0;
    const percentage = salePrice > 0 ? (newTotalPaid / salePrice) * 100 : 0;
    
    const result = await pool.query(
      `UPDATE project_units 
       SET total_paid = $1,
           payment_percentage = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newTotalPaid, Math.min(percentage, 100), id]
    );
    
    return this.mapRow(result.rows[0]);
  }

  // --------------------------------------------------------------------------
  // CRM INTEGRATION
  // --------------------------------------------------------------------------

  private async createDealForUnit(unit: ProjectUnit): Promise<string | null> {
    try {
      // Get project to check settings
      const projectResult = await pool.query(
        `SELECT auto_create_deals, default_pipeline_id, name 
         FROM development_projects WHERE id = $1`,
        [unit.project_id]
      );
      
      if (projectResult.rows.length === 0 || !projectResult.rows[0].auto_create_deals) {
        return null;
      }
      
      const project = projectResult.rows[0];
      
      // Create deal via CRM
      // This would typically call the deal service
      // For now, we'll just update the unit with a placeholder
      console.log(`Would create deal for unit ${unit.unit_number} in project ${project.name}`);
      
      return null; // Return deal ID when implemented
    } catch (error) {
      console.error('Error creating deal for unit:', error);
      return null;
    }
  }

  async linkDeal(unitId: string, dealId: string): Promise<ProjectUnit | null> {
    const result = await pool.query(
      `UPDATE project_units SET deal_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [unitId, dealId]
    );
    
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  // --------------------------------------------------------------------------
  // DELETE
  // --------------------------------------------------------------------------

  async delete(id: string): Promise<boolean> {
    const unit = await this.getById(id);
    if (!unit || !['available', 'not_for_sale'].includes(unit.status)) {
      return false; // Can't delete units with buyers
    }
    
    const result = await pool.query(
      'DELETE FROM project_units WHERE id = $1 RETURNING id',
      [id]
    );
    
    return result.rows.length > 0;
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  private mapRow(row: any): ProjectUnit {
    return {
      id: row.id,
      project_id: row.project_id,
      organization_id: row.organization_id,
      
      unit_number: row.unit_number,
      unit_code: row.unit_code,
      building: row.building,
      floor: row.floor,
      block: row.block,
      
      unit_type: row.unit_type,
      status: row.status,
      
      bedrooms: row.bedrooms || 0,
      bathrooms: parseFloat(row.bathrooms) || 0,
      half_baths: row.half_baths || 0,
      internal_sqm: row.internal_sqm ? parseFloat(row.internal_sqm) : undefined,
      external_sqm: row.external_sqm ? parseFloat(row.external_sqm) : undefined,
      total_sqm: row.total_sqm ? parseFloat(row.total_sqm) : undefined,
      
      list_price: row.list_price ? parseFloat(row.list_price) : undefined,
      sale_price: row.sale_price ? parseFloat(row.sale_price) : undefined,
      price_per_sqm: row.price_per_sqm ? parseFloat(row.price_per_sqm) : undefined,
      currency: row.currency || 'GHS',
      
      base_price: row.base_price ? parseFloat(row.base_price) : undefined,
      finishing_upgrade_cost: parseFloat(row.finishing_upgrade_cost) || 0,
      parking_cost: parseFloat(row.parking_cost) || 0,
      storage_cost: parseFloat(row.storage_cost) || 0,
      other_costs: parseFloat(row.other_costs) || 0,
      
      selected_upgrades: row.selected_upgrades || [],
      
      buyer_id: row.buyer_id,
      buyer_name: row.buyer_name,
      buyer_phone: row.buyer_phone,
      buyer_email: row.buyer_email,
      
      reserved_at: row.reserved_at,
      reserved_by: row.reserved_by,
      contract_date: row.contract_date,
      handover_date: row.handover_date,
      
      total_paid: parseFloat(row.total_paid) || 0,
      payment_percentage: parseFloat(row.payment_percentage) || 0,
      payment_plan_id: row.payment_plan_id,
      
      deal_id: row.deal_id,
      
      features: row.features || [],
      
      floor_plan_url: row.floor_plan_url,
      images: row.images || [],
      virtual_tour_url: row.virtual_tour_url,
      
      notes: row.notes,
      internal_notes: row.internal_notes,
      
      metadata: row.metadata || {},
      
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const unitService = new UnitService();
export default unitService;
