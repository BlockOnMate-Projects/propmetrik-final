/**
 * Units Module - Type Definitions
 * Phase 3.12 - Split from unitService
 * 
 * Comprehensive type definitions for unit management
 * supporting real estate development sales tracking.
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Unit status representing sales lifecycle
 */
export type UnitStatus = 
  | 'available'
  | 'reserved'
  | 'under_contract'
  | 'sold'
  | 'handed_over'
  | 'rented'
  | 'not_for_sale'
  | 'on_hold';

/**
 * Unit type classifications
 */
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

/**
 * Valid status transitions for units
 */
export const UNIT_STATUS_TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  available: ['reserved', 'under_contract', 'not_for_sale', 'on_hold'],
  reserved: ['under_contract', 'available', 'on_hold'], // Can cancel back to available
  under_contract: ['sold', 'reserved', 'on_hold'], // Can fall back to reserved
  sold: ['handed_over'],
  handed_over: ['rented'], // Can rent out after handover
  rented: ['available'], // Can become available again
  not_for_sale: ['available', 'on_hold'],
  on_hold: ['available', 'reserved', 'not_for_sale']
};

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Upgrade/selection for a unit (Buildertrend-style)
 */
export interface UnitUpgrade {
  id: string;
  category: string;
  item: string;
  description?: string;
  price: number;
  selectedAt: string;
  selectedBy?: string;
}

/**
 * Upgrade category with available items
 */
export interface UpgradeCategory {
  category: string;
  items: UpgradeItem[];
}

/**
 * Available upgrade item
 */
export interface UpgradeItem {
  name: string;
  price: number;
  description?: string;
}

/**
 * Complete project unit entity
 */
export interface ProjectUnit {
  id: string;
  projectId: string;
  organizationId: string;
  
  // Identification
  unitNumber: string;
  unitCode?: string;
  building?: string;
  floor?: number;
  block?: string;
  
  // Type & Status
  unitType: UnitType;
  status: UnitStatus;
  
  // Physical attributes
  bedrooms: number;
  bathrooms: number;
  halfBaths: number;
  internalSqm?: number;
  externalSqm?: number;
  totalSqm?: number;
  
  // Pricing
  listPrice?: number;
  salePrice?: number;
  pricePerSqm?: number;
  currency: string;
  
  // Price breakdown
  basePrice?: number;
  finishingUpgradeCost: number;
  parkingCost: number;
  storageCost: number;
  otherCosts: number;
  
  // Upgrades
  selectedUpgrades: UnitUpgrade[];
  
  // Buyer information
  buyerId?: string;
  buyerName?: string;
  buyerPhone?: string;
  buyerEmail?: string;
  
  // Sales tracking
  reservedAt?: Date;
  reservedBy?: string;
  contractDate?: Date;
  handoverDate?: Date;
  
  // Payment tracking
  totalPaid: number;
  paymentPercentage: number;
  paymentPlanId?: string;
  
  // CRM integration
  dealId?: string;
  
  // Features
  features: string[];
  
  // Media
  floorPlanUrl?: string;
  images: string[];
  virtualTourUrl?: string;
  
  // Notes
  notes?: string;
  internalNotes?: string;
  
  metadata: Record<string, unknown>;
  
  // Audit
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Input for creating a single unit
 */
export interface CreateUnitInput {
  projectId: string;
  organizationId: string;
  
  unitNumber: string;
  unitCode?: string;
  building?: string;
  floor?: number;
  block?: string;
  
  unitType: UnitType;
  
  bedrooms?: number;
  bathrooms?: number;
  halfBaths?: number;
  internalSqm?: number;
  externalSqm?: number;
  
  listPrice?: number;
  basePrice?: number;
  currency?: string;
  
  features?: string[];
  
  floorPlanUrl?: string;
  images?: string[];
  virtualTourUrl?: string;
  
  notes?: string;
  
  createdBy?: string;
}

/**
 * Input for updating a unit
 */
export interface UpdateUnitInput {
  unitNumber?: string;
  unitCode?: string;
  building?: string;
  floor?: number;
  block?: string;
  
  unitType?: UnitType;
  status?: UnitStatus;
  
  bedrooms?: number;
  bathrooms?: number;
  halfBaths?: number;
  internalSqm?: number;
  externalSqm?: number;
  
  listPrice?: number;
  salePrice?: number;
  basePrice?: number;
  finishingUpgradeCost?: number;
  parkingCost?: number;
  storageCost?: number;
  otherCosts?: number;
  
  buyerId?: string;
  buyerName?: string;
  buyerPhone?: string;
  buyerEmail?: string;
  
  reservedAt?: Date;
  reservedBy?: string;
  contractDate?: Date;
  handoverDate?: Date;
  
  totalPaid?: number;
  paymentPlanId?: string;
  
  dealId?: string;
  
  features?: string[];
  
  floorPlanUrl?: string;
  images?: string[];
  virtualTourUrl?: string;
  
  notes?: string;
  internalNotes?: string;
  
  updatedBy?: string;
}

/**
 * Input for bulk unit creation
 */
export interface BulkCreateUnitInput {
  projectId: string;
  organizationId: string;
  building?: string;
  unitType: UnitType;
  
  // Range for bulk creation
  floorStart: number;
  floorEnd: number;
  unitsPerFloor: number;
  unitNumberPrefix?: string;
  
  // Common attributes
  bedrooms?: number;
  bathrooms?: number;
  internalSqm?: number;
  listPrice?: number;
  
  createdBy?: string;
}

/**
 * Input for reserving a unit
 */
export interface ReserveUnitInput {
  buyerId?: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  reservedBy: string;
  autoCreateDeal?: boolean;
}

/**
 * Input for moving unit to contract status
 */
export interface ContractUnitInput {
  salePrice: number;
  contractDate: Date;
  dealId?: string;
}

// ============================================================================
// FILTER & STATS TYPES
// ============================================================================

/**
 * Filters for querying units
 */
export interface UnitFilters {
  projectId: string;
  status?: UnitStatus | UnitStatus[];
  unitType?: UnitType | UnitType[];
  building?: string;
  floor?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  hasBuyer?: boolean;
  search?: string;
}

/**
 * Unit statistics for a project
 */
export interface UnitStats {
  totalUnits: number;
  byStatus: Record<UnitStatus, number>;
  byType: Record<string, number>;
  byBuilding: Record<string, number>;
  totalListValue: number;
  totalSoldValue: number;
  totalCollected: number;
  avgPricePerSqm: number;
}

/**
 * Paginated result for units
 */
export interface PaginatedUnits {
  units: ProjectUnit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Unit availability view
 */
export interface UnitAvailability {
  id: string;
  unitNumber: string;
  building?: string;
  floor?: number;
  status: UnitStatus;
  unitType: UnitType;
  bedrooms: number;
  listPrice?: number;
  isAvailable: boolean;
}

// ============================================================================
// ROW MAPPER
// ============================================================================

/**
 * Maps database row to ProjectUnit entity
 */
export function mapRowToUnit(row: Record<string, unknown>): ProjectUnit {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    organizationId: row.organization_id as string,
    
    unitNumber: row.unit_number as string,
    unitCode: row.unit_code as string | undefined,
    building: row.building as string | undefined,
    floor: row.floor as number | undefined,
    block: row.block as string | undefined,
    
    unitType: row.unit_type as UnitType,
    status: row.status as UnitStatus,
    
    bedrooms: (row.bedrooms as number) || 0,
    bathrooms: parseFloat(row.bathrooms as string) || 0,
    halfBaths: (row.half_baths as number) || 0,
    internalSqm: row.internal_sqm ? parseFloat(row.internal_sqm as string) : undefined,
    externalSqm: row.external_sqm ? parseFloat(row.external_sqm as string) : undefined,
    totalSqm: row.total_sqm ? parseFloat(row.total_sqm as string) : undefined,
    
    listPrice: row.list_price ? parseFloat(row.list_price as string) : undefined,
    salePrice: row.sale_price ? parseFloat(row.sale_price as string) : undefined,
    pricePerSqm: row.price_per_sqm ? parseFloat(row.price_per_sqm as string) : undefined,
    currency: (row.currency as string) || 'GHS',
    
    basePrice: row.base_price ? parseFloat(row.base_price as string) : undefined,
    finishingUpgradeCost: parseFloat(row.finishing_upgrade_cost as string) || 0,
    parkingCost: parseFloat(row.parking_cost as string) || 0,
    storageCost: parseFloat(row.storage_cost as string) || 0,
    otherCosts: parseFloat(row.other_costs as string) || 0,
    
    selectedUpgrades: mapUpgradesFromDb(row.selected_upgrades),
    
    buyerId: row.buyer_id as string | undefined,
    buyerName: row.buyer_name as string | undefined,
    buyerPhone: row.buyer_phone as string | undefined,
    buyerEmail: row.buyer_email as string | undefined,
    
    reservedAt: row.reserved_at as Date | undefined,
    reservedBy: row.reserved_by as string | undefined,
    contractDate: row.contract_date as Date | undefined,
    handoverDate: row.handover_date as Date | undefined,
    
    totalPaid: parseFloat(row.total_paid as string) || 0,
    paymentPercentage: parseFloat(row.payment_percentage as string) || 0,
    paymentPlanId: row.payment_plan_id as string | undefined,
    
    dealId: row.deal_id as string | undefined,
    
    features: (row.features as string[]) || [],
    
    floorPlanUrl: row.floor_plan_url as string | undefined,
    images: (row.images as string[]) || [],
    virtualTourUrl: row.virtual_tour_url as string | undefined,
    
    notes: row.notes as string | undefined,
    internalNotes: row.internal_notes as string | undefined,
    
    metadata: (row.metadata as Record<string, unknown>) || {},
    
    createdBy: row.created_by as string | undefined,
    updatedBy: row.updated_by as string | undefined,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date
  };
}

/**
 * Maps database upgrade JSON to UnitUpgrade array
 */
function mapUpgradesFromDb(upgrades: unknown): UnitUpgrade[] {
  if (!upgrades) return [];
  
  const parsed = typeof upgrades === 'string' ? JSON.parse(upgrades) : upgrades;
  if (!Array.isArray(parsed)) return [];
  
  return parsed.map((u: Record<string, unknown>) => ({
    id: u.id as string,
    category: u.category as string,
    item: u.item as string,
    description: u.description as string | undefined,
    price: u.price as number,
    selectedAt: (u.selected_at || u.selectedAt) as string,
    selectedBy: (u.selected_by || u.selectedBy) as string | undefined
  }));
}

/**
 * Maps UnitUpgrade array to database JSON format
 */
export function mapUpgradesToDb(upgrades: UnitUpgrade[]): string {
  return JSON.stringify(upgrades.map(u => ({
    id: u.id,
    category: u.category,
    item: u.item,
    description: u.description,
    price: u.price,
    selected_at: u.selectedAt,
    selected_by: u.selectedBy
  })));
}
