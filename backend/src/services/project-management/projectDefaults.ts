/**
 * Project Defaults Configuration
 * Phase 1: Project Management Ghana-Specific Defaults
 * 
 * Contains:
 * - Ghana regions and districts
 * - Land tenure types
 * - Project type configurations
 * - Default phase templates
 * - Amenity lists
 * - Cost category defaults
 */

// ============================================================================
// GHANA ADMINISTRATIVE DIVISIONS
// ============================================================================

/**
 * Ghana's 16 Regions (as of 2019 after the creation of 6 new regions)
 */
export const GHANA_REGIONS = [
  { code: 'greater_accra', name: 'Greater Accra', capital: 'Accra' },
  { code: 'ashanti', name: 'Ashanti', capital: 'Kumasi' },
  { code: 'eastern', name: 'Eastern', capital: 'Koforidua' },
  { code: 'western', name: 'Western', capital: 'Sekondi-Takoradi' },
  { code: 'central', name: 'Central', capital: 'Cape Coast' },
  { code: 'volta', name: 'Volta', capital: 'Ho' },
  { code: 'northern', name: 'Northern', capital: 'Tamale' },
  { code: 'upper_east', name: 'Upper East', capital: 'Bolgatanga' },
  { code: 'upper_west', name: 'Upper West', capital: 'Wa' },
  { code: 'bono', name: 'Bono', capital: 'Sunyani' },
  { code: 'bono_east', name: 'Bono East', capital: 'Techiman' },
  { code: 'ahafo', name: 'Ahafo', capital: 'Goaso' },
  { code: 'savannah', name: 'Savannah', capital: 'Damongo' },
  { code: 'north_east', name: 'North East', capital: 'Nalerigu' },
  { code: 'oti', name: 'Oti', capital: 'Dambai' },
  { code: 'western_north', name: 'Western North', capital: 'Wiawso' },
] as const;

export type GhanaRegionCode = typeof GHANA_REGIONS[number]['code'];

/**
 * Major districts/municipalities in Greater Accra (for example)
 * Full list would be loaded from database or Data Hub
 */
export const GREATER_ACCRA_DISTRICTS = [
  { code: 'accra_metro', name: 'Accra Metropolitan', type: 'metropolitan' },
  { code: 'tema_metro', name: 'Tema Metropolitan', type: 'metropolitan' },
  { code: 'ga_east', name: 'Ga East Municipal', type: 'municipal' },
  { code: 'ga_west', name: 'Ga West Municipal', type: 'municipal' },
  { code: 'ga_south', name: 'Ga South Municipal', type: 'municipal' },
  { code: 'ga_central', name: 'Ga Central Municipal', type: 'municipal' },
  { code: 'adenta', name: 'Adentan Municipal', type: 'municipal' },
  { code: 'madina', name: 'La Nkwantanang Madina Municipal', type: 'municipal' },
  { code: 'la_dadekotopon', name: 'La Dadekotopon Municipal', type: 'municipal' },
  { code: 'ledzokuku', name: 'Ledzokuku Municipal', type: 'municipal' },
  { code: 'krowor', name: 'Krowor Municipal', type: 'municipal' },
  { code: 'ashaiman', name: 'Ashaiman Municipal', type: 'municipal' },
  { code: 'kpone_katamanso', name: 'Kpone Katamanso District', type: 'district' },
  { code: 'ningo_prampram', name: 'Ningo Prampram District', type: 'district' },
  { code: 'ada_east', name: 'Ada East District', type: 'district' },
  { code: 'ada_west', name: 'Ada West District', type: 'district' },
  { code: 'shai_osudoku', name: 'Shai Osudoku District', type: 'district' },
] as const;

// ============================================================================
// LAND TENURE TYPES
// ============================================================================

export const LAND_TENURE_TYPES = [
  {
    code: 'government_lease',
    name: 'Government Lease',
    description: 'Land leased from the Government of Ghana (typically 50-99 year leases)',
    typical_lease_years: 99,
    requires_approval_from: ['Lands Commission'],
  },
  {
    code: 'stool_land_lease',
    name: 'Stool/Skin Land Lease',
    description: 'Customary land leased from a traditional authority (stool or skin)',
    typical_lease_years: 99,
    requires_approval_from: ['Traditional Authority', 'Lands Commission'],
  },
  {
    code: 'family_land',
    name: 'Family Land',
    description: 'Land held collectively by a family and allocated to a developer',
    typical_lease_years: 99,
    requires_approval_from: ['Family Head', 'Lands Commission'],
  },
  {
    code: 'freehold',
    name: 'Freehold',
    description: 'Outright ownership of land (rare in Ghana, mainly for Ghanaians)',
    typical_lease_years: null, // Perpetual
    requires_approval_from: ['Lands Commission'],
  },
  {
    code: 'leasehold',
    name: 'Leasehold',
    description: 'General leasehold interest in land',
    typical_lease_years: 50,
    requires_approval_from: ['Lands Commission'],
  },
  {
    code: 'government_allocation',
    name: 'Government Allocation',
    description: 'Land directly allocated by the government for specific purposes',
    typical_lease_years: 50,
    requires_approval_from: ['Lands Commission', 'Relevant Ministry'],
  },
] as const;

export type LandTenureType = typeof LAND_TENURE_TYPES[number]['code'];

// ============================================================================
// PROJECT TYPES
// ============================================================================

export const PROJECT_TYPES = [
  {
    code: 'residential_single',
    name: 'Single Residential',
    description: 'Single-family home construction',
    icon: 'home',
    typical_units: 1,
    requires_epa: false,
    typical_phases: 6,
  },
  {
    code: 'residential_multi',
    name: 'Multi-Unit Residential',
    description: 'Apartment building, townhouses, or estate development',
    icon: 'apartment',
    typical_units: 48,
    requires_epa: true, // If > 40 units
    typical_phases: 8,
  },
  {
    code: 'mixed_use',
    name: 'Mixed Use Development',
    description: 'Combination of residential, commercial, and/or retail',
    icon: 'business',
    typical_units: 60,
    requires_epa: true,
    typical_phases: 10,
  },
  {
    code: 'commercial',
    name: 'Commercial Building',
    description: 'Office building, retail center, or commercial space',
    icon: 'store',
    typical_units: 0,
    requires_epa: true, // If > 5000 sqm
    typical_phases: 8,
  },
  {
    code: 'industrial',
    name: 'Industrial Facility',
    description: 'Warehouse, factory, or industrial park',
    icon: 'factory',
    typical_units: 0,
    requires_epa: true,
    typical_phases: 6,
  },
  {
    code: 'land_development',
    name: 'Land Development',
    description: 'Infrastructure and serviced plots development',
    icon: 'terrain',
    typical_units: 0,
    requires_epa: false,
    typical_phases: 5,
  },
  {
    code: 'renovation',
    name: 'Renovation/Retrofit',
    description: 'Major renovation or conversion of existing building',
    icon: 'construction',
    typical_units: 0,
    requires_epa: false,
    typical_phases: 4,
  },
] as const;

export type ProjectTypeCode = typeof PROJECT_TYPES[number]['code'];

// ============================================================================
// DEFAULT PHASE TEMPLATES
// ============================================================================

export interface PhaseTemplate {
  phase_number: number;
  name: string;
  weight: number;
  duration_days: number;
  color: string;
  description?: string;
  milestones?: string[];
}

export const RESIDENTIAL_MULTI_PHASES: PhaseTemplate[] = [
  {
    phase_number: 1,
    name: 'Land Acquisition & Due Diligence',
    weight: 5,
    duration_days: 60,
    color: '#6B7280',
    description: 'Land title verification, surveys, and legal documentation',
    milestones: ['Title search complete', 'Survey complete', 'Indenture signed'],
  },
  {
    phase_number: 2,
    name: 'Design & Approvals',
    weight: 10,
    duration_days: 90,
    color: '#3B82F6',
    description: 'Architectural design, structural engineering, and permit applications',
    milestones: ['Concept design approved', 'Development permit issued', 'Building permit issued'],
  },
  {
    phase_number: 3,
    name: 'Site Preparation',
    weight: 5,
    duration_days: 30,
    color: '#F59E0B',
    description: 'Demolition, clearing, and site works',
    milestones: ['Site cleared', 'Temporary facilities set up', 'Access roads complete'],
  },
  {
    phase_number: 4,
    name: 'Foundation',
    weight: 15,
    duration_days: 45,
    color: '#EF4444',
    description: 'Excavation, piling (if needed), and foundation construction',
    milestones: ['Excavation complete', 'Foundation poured', 'Foundation cured'],
  },
  {
    phase_number: 5,
    name: 'Structural Works',
    weight: 25,
    duration_days: 120,
    color: '#8B5CF6',
    description: 'Columns, beams, slabs, and structural frame',
    milestones: ['Ground floor complete', 'Mid-level complete', 'Top floor complete', 'Roofing complete'],
  },
  {
    phase_number: 6,
    name: 'MEP Rough-In',
    weight: 15,
    duration_days: 60,
    color: '#10B981',
    description: 'Electrical, plumbing, and HVAC rough installation',
    milestones: ['Electrical rough-in', 'Plumbing rough-in', 'HVAC installation'],
  },
  {
    phase_number: 7,
    name: 'Finishing Works',
    weight: 20,
    duration_days: 90,
    color: '#EC4899',
    description: 'Interior and exterior finishing, painting, tiling',
    milestones: ['Interior walls complete', 'Flooring complete', 'Kitchen/bath fixtures', 'Painting complete'],
  },
  {
    phase_number: 8,
    name: 'External Works & Handover',
    weight: 5,
    duration_days: 30,
    color: '#14B8A6',
    description: 'Landscaping, external works, and final handover',
    milestones: ['Landscaping complete', 'Snagging complete', 'Fire certificate obtained', 'Habitation certificate'],
  },
];

export const COMMERCIAL_PHASES: PhaseTemplate[] = [
  {
    phase_number: 1,
    name: 'Land & Approvals',
    weight: 10,
    duration_days: 120,
    color: '#6B7280',
    description: 'Site acquisition, statutory approvals and permits',
    milestones: ['Site secured', 'EPA permit / EIA approved', 'Development permit issued', 'Building permit issued'],
  },
  {
    phase_number: 2,
    name: 'Design Development',
    weight: 10,
    duration_days: 60,
    color: '#3B82F6',
    description: 'Schematic to detailed design and tendering',
    milestones: ['Schematic design approved', 'Detailed design complete', 'Tender documents issued'],
  },
  {
    phase_number: 3,
    name: 'Groundworks',
    weight: 10,
    duration_days: 45,
    color: '#F59E0B',
    description: 'Site clearance, excavation and foundations',
    milestones: ['Site cleared', 'Excavation complete', 'Foundation inspection passed'],
  },
  {
    phase_number: 4,
    name: 'Structure',
    weight: 30,
    duration_days: 150,
    color: '#8B5CF6',
    description: 'Substructure and superstructure construction',
    milestones: ['Substructure complete', 'Superstructure complete', 'Topping out complete'],
  },
  {
    phase_number: 5,
    name: 'Building Services',
    weight: 20,
    duration_days: 90,
    color: '#10B981',
    description: 'MEP, vertical transport and fire systems',
    milestones: ['MEP rough-in complete', 'Lifts installed', 'Fire systems installed'],
  },
  {
    phase_number: 6,
    name: 'Finishes',
    weight: 15,
    duration_days: 60,
    color: '#EC4899',
    description: 'Internal and external finishes, fit-out',
    milestones: ['Internal finishes complete', 'External cladding complete', 'Fit-out complete'],
  },
  {
    phase_number: 7,
    name: 'Commissioning & Handover',
    weight: 5,
    duration_days: 30,
    color: '#14B8A6',
    description: 'Testing, statutory certification and handover',
    milestones: ['Services commissioned', 'Fire certificate obtained', 'Certificate of occupancy obtained', 'Handover complete'],
  },
];

export const SINGLE_HOUSE_PHASES: PhaseTemplate[] = [
  {
    phase_number: 1,
    name: 'Land & Design',
    weight: 10,
    duration_days: 45,
    color: '#3B82F6',
    description: 'Title verification, design and permitting',
    milestones: ['Title verified', 'Building permit issued'],
  },
  {
    phase_number: 2,
    name: 'Foundation',
    weight: 20,
    duration_days: 21,
    color: '#EF4444',
    description: 'Site clearance and foundation works',
    milestones: ['Site cleared', 'Foundation poured', 'Foundation inspection passed'],
  },
  {
    phase_number: 3,
    name: 'Structure & Roofing',
    weight: 30,
    duration_days: 45,
    color: '#8B5CF6',
    description: 'Walls, lintels and roofing',
    milestones: ['Walls complete', 'Roofing complete'],
  },
  {
    phase_number: 4,
    name: 'MEP Installation',
    weight: 15,
    duration_days: 21,
    color: '#10B981',
    description: 'Electrical and plumbing rough-in',
    milestones: ['Electrical rough-in', 'Plumbing rough-in'],
  },
  {
    phase_number: 5,
    name: 'Finishing',
    weight: 20,
    duration_days: 30,
    color: '#EC4899',
    description: 'Plastering, painting and fixtures',
    milestones: ['Plastering & painting complete', 'Fixtures installed'],
  },
  {
    phase_number: 6,
    name: 'External & Handover',
    weight: 5,
    duration_days: 14,
    color: '#14B8A6',
    description: 'External works, snagging and handover',
    milestones: ['Snagging complete', 'Safety certificate obtained', 'Handover complete'],
  },
];

export const PHASE_TEMPLATES_BY_TYPE: Record<string, PhaseTemplate[]> = {
  residential_single: SINGLE_HOUSE_PHASES,
  residential_multi: RESIDENTIAL_MULTI_PHASES,
  mixed_use: RESIDENTIAL_MULTI_PHASES,
  commercial: COMMERCIAL_PHASES,
  industrial: COMMERCIAL_PHASES,
  land_development: SINGLE_HOUSE_PHASES.slice(0, 3),
  renovation: SINGLE_HOUSE_PHASES.slice(2),
};

/**
 * Resolve the default phase+milestone framework for a project type. Used to
 * auto-apply a structured plan when the user doesn't pick one explicitly.
 * Falls back to the multi-residential template (the richest) for unknown types.
 */
export function getDefaultPhasesForType(projectType?: string): PhaseTemplate[] {
  if (projectType && PHASE_TEMPLATES_BY_TYPE[projectType]) {
    return PHASE_TEMPLATES_BY_TYPE[projectType];
  }
  return RESIDENTIAL_MULTI_PHASES;
}

/**
 * Classify a milestone label into a type + whether it's a Ghana statutory item,
 * so seeded milestones get the right reminders/treatment without manual tagging.
 */
export function classifyMilestone(label: string): { milestone_type: string; is_ghana_specific: boolean } {
  const l = label.toLowerCase();
  if (/(permit|epa|eia|indenture|certificate of occupancy|habitation|title)/.test(l)) {
    return { milestone_type: 'permit', is_ghana_specific: true };
  }
  if (/(fire certificate|fire cert|safety certificate)/.test(l)) {
    return { milestone_type: 'inspection', is_ghana_specific: true };
  }
  if (/(inspection|snagging|commission|test)/.test(l)) {
    return { milestone_type: 'inspection', is_ghana_specific: false };
  }
  if (/(handover|habitation|occupancy)/.test(l)) {
    return { milestone_type: 'handover', is_ghana_specific: true };
  }
  return { milestone_type: 'construction', is_ghana_specific: false };
}

// ============================================================================
// AMENITIES
// ============================================================================

export const RESIDENTIAL_AMENITIES = [
  // Security
  { code: 'gated_entry', name: 'Gated Entry', category: 'security' },
  { code: 'security_post', name: '24/7 Security Post', category: 'security' },
  { code: 'cctv', name: 'CCTV Surveillance', category: 'security' },
  { code: 'intercom', name: 'Intercom System', category: 'security' },
  { code: 'access_control', name: 'Access Control', category: 'security' },
  
  // Utilities
  { code: 'generator_backup', name: 'Generator Backup', category: 'utilities' },
  { code: 'water_storage', name: 'Water Storage Tank', category: 'utilities' },
  { code: 'borehole', name: 'Borehole', category: 'utilities' },
  { code: 'solar_power', name: 'Solar Power', category: 'utilities' },
  { code: 'fiber_internet', name: 'Fiber Internet', category: 'utilities' },
  
  // Building Features
  { code: 'elevators', name: 'Elevators', category: 'building' },
  { code: 'lobby', name: 'Reception Lobby', category: 'building' },
  { code: 'central_ac', name: 'Central Air Conditioning', category: 'building' },
  { code: 'fire_system', name: 'Fire Detection & Suppression', category: 'building' },
  
  // Recreation
  { code: 'swimming_pool', name: 'Swimming Pool', category: 'recreation' },
  { code: 'gym', name: 'Gym/Fitness Center', category: 'recreation' },
  { code: 'tennis_court', name: 'Tennis Court', category: 'recreation' },
  { code: 'basketball_court', name: 'Basketball Court', category: 'recreation' },
  { code: 'playground', name: 'Children\'s Playground', category: 'recreation' },
  { code: 'clubhouse', name: 'Clubhouse', category: 'recreation' },
  { code: 'green_spaces', name: 'Green Spaces/Gardens', category: 'recreation' },
  
  // Parking
  { code: 'covered_parking', name: 'Covered Parking', category: 'parking' },
  { code: 'basement_parking', name: 'Basement Parking', category: 'parking' },
  { code: 'visitor_parking', name: 'Visitor Parking', category: 'parking' },
  
  // Services
  { code: 'property_management', name: 'Property Management', category: 'services' },
  { code: 'maintenance_staff', name: 'On-site Maintenance', category: 'services' },
  { code: 'waste_management', name: 'Waste Management', category: 'services' },
  { code: 'laundry_service', name: 'Laundry Service', category: 'services' },
] as const;

export const COMMERCIAL_AMENITIES = [
  { code: 'elevators', name: 'Elevators', category: 'building' },
  { code: 'central_ac', name: 'Central Air Conditioning', category: 'building' },
  { code: 'fire_system', name: 'Fire System', category: 'building' },
  { code: 'generator_backup', name: 'Full Generator Backup', category: 'utilities' },
  { code: 'fiber_internet', name: 'Fiber Internet Infrastructure', category: 'utilities' },
  { code: 'underground_parking', name: 'Underground Parking', category: 'parking' },
  { code: 'surface_parking', name: 'Surface Parking', category: 'parking' },
  { code: 'conference_rooms', name: 'Shared Conference Rooms', category: 'services' },
  { code: 'reception', name: 'Manned Reception', category: 'services' },
  { code: 'cafeteria', name: 'Cafeteria/Food Court', category: 'services' },
  { code: 'retail_ground', name: 'Retail on Ground Floor', category: 'building' },
] as const;

// ============================================================================
// COST CATEGORIES
// ============================================================================

export const COST_CATEGORIES = [
  { code: 'land_acquisition', name: 'Land Acquisition', description: 'Land purchase, legal fees, and transfer costs' },
  { code: 'permits_approvals', name: 'Permits & Approvals', description: 'Development permits, building permits, EPA, fire certificate' },
  { code: 'design_engineering', name: 'Design & Engineering', description: 'Architectural, structural, MEP design' },
  { code: 'site_preparation', name: 'Site Preparation', description: 'Clearing, demolition, access roads' },
  { code: 'foundation', name: 'Foundation', description: 'Excavation, piling, concrete foundation' },
  { code: 'structural', name: 'Structural Works', description: 'Columns, beams, slabs, reinforcement' },
  { code: 'roofing', name: 'Roofing', description: 'Roof structure and covering' },
  { code: 'mep', name: 'MEP (Electrical, Plumbing, HVAC)', description: 'Mechanical, electrical, plumbing systems' },
  { code: 'exterior_finishing', name: 'Exterior Finishing', description: 'External walls, cladding, windows' },
  { code: 'interior_finishing', name: 'Interior Finishing', description: 'Plastering, tiling, painting, joinery' },
  { code: 'landscaping', name: 'Landscaping', description: 'Gardens, paving, external works' },
  { code: 'amenities', name: 'Amenities', description: 'Pool, gym, playground, etc.' },
  { code: 'contingency', name: 'Contingency', description: 'Reserve for unforeseen costs' },
  { code: 'professional_fees', name: 'Professional Fees', description: 'QS, project management, supervision' },
  { code: 'insurance', name: 'Insurance', description: 'Construction all-risk, third-party liability' },
  { code: 'marketing_sales', name: 'Marketing & Sales', description: 'Advertising, show unit, commissions' },
  { code: 'legal', name: 'Legal Fees', description: 'Contracts, documentation, compliance' },
  { code: 'financing_costs', name: 'Financing Costs', description: 'Interest, loan fees, bank charges' },
  { code: 'other', name: 'Other', description: 'Miscellaneous costs' },
] as const;

export type CostCategoryCode = typeof COST_CATEGORIES[number]['code'];

// ============================================================================
// UNIT TYPES
// ============================================================================

export const RESIDENTIAL_UNIT_TYPES = [
  { code: 'studio', name: 'Studio', bedrooms: 0, typical_sqm: 35 },
  { code: '1br', name: '1 Bedroom', bedrooms: 1, typical_sqm: 55 },
  { code: '2br', name: '2 Bedroom', bedrooms: 2, typical_sqm: 80 },
  { code: '3br', name: '3 Bedroom', bedrooms: 3, typical_sqm: 120 },
  { code: '4br', name: '4 Bedroom', bedrooms: 4, typical_sqm: 180 },
  { code: '5br', name: '5 Bedroom', bedrooms: 5, typical_sqm: 250 },
  { code: 'penthouse', name: 'Penthouse', bedrooms: 3, typical_sqm: 200 },
  { code: 'townhouse', name: 'Townhouse', bedrooms: 3, typical_sqm: 150 },
  { code: 'duplex', name: 'Duplex', bedrooms: 4, typical_sqm: 200 },
  { code: 'triplex', name: 'Triplex', bedrooms: 5, typical_sqm: 280 },
] as const;

export const COMMERCIAL_UNIT_TYPES = [
  { code: 'retail_shop', name: 'Retail Shop', typical_sqm: 50 },
  { code: 'office_small', name: 'Small Office', typical_sqm: 50 },
  { code: 'office_medium', name: 'Medium Office', typical_sqm: 150 },
  { code: 'office_large', name: 'Large Office', typical_sqm: 500 },
  { code: 'full_floor', name: 'Full Floor', typical_sqm: 1000 },
  { code: 'warehouse', name: 'Warehouse', typical_sqm: 500 },
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get phase template for a project type
 */
export function getPhaseTemplateForType(projectType: string): PhaseTemplate[] {
  return PHASE_TEMPLATES_BY_TYPE[projectType] || RESIDENTIAL_MULTI_PHASES;
}

/**
 * Get amenities for project type
 */
export function getAmenitiesForType(projectType: string): typeof RESIDENTIAL_AMENITIES | typeof COMMERCIAL_AMENITIES {
  if (projectType === 'commercial' || projectType === 'industrial') {
    return COMMERCIAL_AMENITIES;
  }
  return RESIDENTIAL_AMENITIES;
}

/**
 * Get unit types for project type
 */
export function getUnitTypesForType(projectType: string): typeof RESIDENTIAL_UNIT_TYPES | typeof COMMERCIAL_UNIT_TYPES {
  if (projectType === 'commercial' || projectType === 'industrial' || projectType === 'mixed_use') {
    return COMMERCIAL_UNIT_TYPES;
  }
  return RESIDENTIAL_UNIT_TYPES;
}

/**
 * Calculate estimated project duration from phases
 */
export function calculateProjectDuration(phases: PhaseTemplate[]): number {
  return phases.reduce((total, phase) => total + phase.duration_days, 0);
}

/**
 * Find region by code or name
 */
export function findGhanaRegion(query: string): typeof GHANA_REGIONS[number] | undefined {
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, '_');
  return GHANA_REGIONS.find(
    r => r.code === normalizedQuery || 
         r.name.toLowerCase() === query.toLowerCase()
  );
}

/**
 * Find land tenure type by code
 */
export function findLandTenureType(code: string): typeof LAND_TENURE_TYPES[number] | undefined {
  return LAND_TENURE_TYPES.find(t => t.code === code);
}

/**
 * Check if project requires EPA permit
 */
export function requiresEPAPermit(projectType: string, totalUnits?: number, totalSqm?: number): boolean {
  const typeConfig = PROJECT_TYPES.find(t => t.code === projectType);
  if (!typeConfig) return false;
  
  if (typeConfig.requires_epa) {
    // EPA required if > 40 units or > 5000 sqm
    if (totalUnits && totalUnits > 40) return true;
    if (totalSqm && totalSqm > 5000) return true;
    return false;
  }
  
  return false;
}

export default {
  GHANA_REGIONS,
  GREATER_ACCRA_DISTRICTS,
  LAND_TENURE_TYPES,
  PROJECT_TYPES,
  RESIDENTIAL_MULTI_PHASES,
  COMMERCIAL_PHASES,
  SINGLE_HOUSE_PHASES,
  PHASE_TEMPLATES_BY_TYPE,
  RESIDENTIAL_AMENITIES,
  COMMERCIAL_AMENITIES,
  COST_CATEGORIES,
  RESIDENTIAL_UNIT_TYPES,
  COMMERCIAL_UNIT_TYPES,
  getPhaseTemplateForType,
  getAmenitiesForType,
  getUnitTypesForType,
  calculateProjectDuration,
  findGhanaRegion,
  findLandTenureType,
  requiresEPAPermit,
};
