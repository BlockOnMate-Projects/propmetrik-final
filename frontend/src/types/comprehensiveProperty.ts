// =====================================================
// COMPREHENSIVE PROPERTY FORM FIELDS
// Based on RICS Red Book Standards & PROPMETRIK Demo
// =====================================================

export const PROPERTY_TYPES = [
  { value: 'house', label: 'Detached House' },
  { value: 'semi_detached', label: 'Semi-Detached House' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'apartment', label: 'Apartment/Flat' },
  { value: 'condo', label: 'Condominium' },
  { value: 'villa', label: 'Villa' },
  { value: 'bungalow', label: 'Bungalow' },
  { value: 'duplex', label: 'Duplex' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'office', label: 'Office' },
  { value: 'retail', label: 'Retail' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'land', label: 'Vacant Land' },
  { value: 'mixed_use', label: 'Mixed Use' },
]

export const QUALITY_RATINGS = [
  { value: 'luxury', label: 'Luxury', description: 'Premium finishes, custom features' },
  { value: 'high', label: 'High Quality', description: 'Above-average materials and workmanship' },
  { value: 'standard', label: 'Standard', description: 'Typical market standard quality' },
  { value: 'economy', label: 'Economy', description: 'Basic finishes, cost-effective materials' },
]

export const CONDITIONS = [
  { value: 'excellent', label: 'Excellent', description: 'Like new, no repairs needed' },
  { value: 'good', label: 'Good', description: 'Well-maintained, minor wear only' },
  { value: 'average', label: 'Average', description: 'Normal wear, some maintenance needed' },
  { value: 'fair', label: 'Fair', description: 'Deferred maintenance, repairs needed' },
  { value: 'poor', label: 'Poor', description: 'Significant repairs required' },
]

export const TENURE_TYPES = [
  // Low Risk
  { value: 'freehold', label: 'Freehold (Registered)', description: 'Outright ownership registered at Lands Commission', riskAdjustment: 0, riskLevel: 'low' },
  { value: 'leasehold_99', label: 'Leasehold (99+ years)', description: 'Long leasehold with substantial remaining term', riskAdjustment: -3, riskLevel: 'low' },
  { value: 'government_lease', label: 'Government Lease', description: 'Lease from Lands Commission', riskAdjustment: -5, riskLevel: 'low' },
  
  // Medium Risk
  { value: 'leasehold_50_99', label: 'Leasehold (50-99 years)', description: 'Medium-term leasehold', riskAdjustment: -8, riskLevel: 'medium' },
  { value: 'customary_freehold', label: 'Customary Freehold', description: 'Customary grant converted to freehold', riskAdjustment: -10, riskLevel: 'medium' },
  { value: 'stool_land_documented', label: 'Stool Land (Documented)', description: 'Traditional stool land with documentation', riskAdjustment: -12, riskLevel: 'medium' },
  
  // High Risk
  { value: 'leasehold_under_50', label: 'Leasehold (Under 50 years)', description: 'Short remaining term, affects financing', riskAdjustment: -15, riskLevel: 'medium-high' },
  { value: 'family_land_documented', label: 'Family Land (Documented)', description: 'Family-owned land with documentation', riskAdjustment: -18, riskLevel: 'high' },
  
  // Very High Risk
  { value: 'stool_land_undocumented', label: 'Stool Land (Undocumented)', description: 'Traditional stool land without documentation', riskAdjustment: -25, riskLevel: 'high' },
  { value: 'family_land_undocumented', label: 'Family Land (Undocumented)', description: 'Family land without proper documentation', riskAdjustment: -30, riskLevel: 'very_high' },
]

// Helper function to get tenure risk adjustment
export const getTenureRiskAdjustment = (tenureType: string): number => {
  const tenure = TENURE_TYPES.find(t => t.value === tenureType);
  return tenure?.riskAdjustment ?? 0;
};

// Helper function to get tenure risk level
export const getTenureRiskLevel = (tenureType: string): string => {
  const tenure = TENURE_TYPES.find(t => t.value === tenureType);
  return tenure?.riskLevel ?? 'medium';
};

export const VIEW_QUALITIES = [
  { value: 'premium', label: 'Premium View', description: 'Ocean, city skyline, or exceptional vista' },
  { value: 'city', label: 'City View', description: 'Urban cityscape view' },
  { value: 'garden', label: 'Garden View', description: 'Landscaped garden or green space' },
  { value: 'courtyard', label: 'Courtyard View', description: 'Internal courtyard or atrium' },
  { value: 'standard', label: 'Standard View', description: 'Typical neighborhood view' },
  { value: 'limited', label: 'Limited View', description: 'Restricted or blocked view' },
]

export const NEIGHBORHOOD_RATINGS = [
  { value: 'prime_plus', label: 'Prime+', description: 'Exceptional location, highest desirability' },
  { value: 'prime', label: 'Prime', description: 'Highly desirable location' },
  { value: 'prime_minus', label: 'Prime-', description: 'Good location with minor drawbacks' },
  { value: 'secondary', label: 'Secondary', description: 'Established neighborhood, moderate desirability' },
  { value: 'tertiary', label: 'Tertiary', description: 'Developing area, lower desirability' },
]

export const ACCESSIBILITY_RATINGS = [
  { value: 'excellent', label: 'Excellent', description: 'Multiple transport options, main roads' },
  { value: 'good', label: 'Good', description: 'Good transport links, accessible' },
  { value: 'average', label: 'Average', description: 'Standard accessibility' },
  { value: 'limited', label: 'Limited', description: 'Few transport options' },
  { value: 'poor', label: 'Poor', description: 'Difficult access, remote location' },
]

export const CONTACT_PREFERENCES = [
  { value: 'email', label: 'Email', description: 'Preferred contact via email' },
  { value: 'phone', label: 'Phone', description: 'Preferred contact via phone call' },
  { value: 'mail', label: 'Mail', description: 'Preferred contact via postal mail' },
  { value: 'any', label: 'Any Method', description: 'Any contact method is acceptable' },
]

// Request/Engagement Types (for RICS/GhIS compliance)
export const REQUEST_TYPES = [
  { value: 'written', label: 'Written Request', description: 'Formal written instruction' },
  { value: 'verbal', label: 'Verbal Communication', description: 'Verbal instruction from client' },
  { value: 'email', label: 'Email Request', description: 'Instruction via email' },
  { value: 'letter', label: 'Letter', description: 'Formal letter of instruction' },
]

// Valuation Purpose Options (RICS Red Book compliant)
export const VALUATION_PURPOSES = [
  { value: 'sale', label: 'Market Value (Sale)', description: 'Fair market value for sale/purchase' },
  { value: 'mortgage', label: 'Mortgage/Lending', description: 'Valuation for loan security' },
  { value: 'insurance', label: 'Insurance', description: 'Replacement cost for insurance' },
  { value: 'tax', label: 'Tax Assessment', description: 'Property tax basis valuation' },
  { value: 'investment', label: 'Investment Analysis', description: 'Investment returns analysis' },
  { value: 'development', label: 'Development Feasibility', description: 'Development appraisal' },
  { value: 'rental', label: 'Rental Value', description: 'Market rental determination' },
  { value: 'accounting', label: 'Financial Reporting', description: 'Fair value for accounts (IFRS)' },
  { value: 'litigation', label: 'Litigation/Dispute', description: 'Expert valuation for court' },
]

// Water Supply Options
export const WATER_SUPPLY_OPTIONS = [
  { value: 'public_mains', label: 'Public Mains (GWCL)', description: 'Ghana Water Company Limited' },
  { value: 'borehole', label: 'Borehole', description: 'Private borehole on property' },
  { value: 'well', label: 'Well', description: 'Private well on property' },
  { value: 'both', label: 'Public + Borehole', description: 'Connected to mains with borehole backup' },
]

// Electricity Supply Options
export const ELECTRICITY_SUPPLY_OPTIONS = [
  { value: 'ecg', label: 'ECG/NEDCo Grid', description: 'Connected to national grid' },
  { value: 'solar', label: 'Solar Power', description: 'Solar panel installation' },
  { value: 'generator', label: 'Generator Only', description: 'Private generator power' },
  { value: 'grid_solar', label: 'Grid + Solar', description: 'Grid with solar backup' },
  { value: 'grid_generator', label: 'Grid + Generator', description: 'Grid with generator backup' },
]

// Drainage Options
export const DRAINAGE_OPTIONS = [
  { value: 'public_sewer', label: 'Public Sewer', description: 'Connected to municipal sewer' },
  { value: 'septic', label: 'Septic Tank', description: 'Private septic system' },
  { value: 'soakaway', label: 'Soakaway', description: 'Soakaway pit drainage' },
  { value: 'septic_soakaway', label: 'Septic + Soakaway', description: 'Combined system' },
]

// Risk Rating Options
export const RISK_RATINGS = [
  { value: 'good', label: 'Good' },
  { value: 'average', label: 'Average' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
]

// Property Risk Assessment Interface
export interface PropertyRiskAssessment {
  employment_stability: 'good' | 'average' | 'fair' | 'poor'
  convenience_employment: 'good' | 'average' | 'fair' | 'poor'
  convenience_shopping: 'good' | 'average' | 'fair' | 'poor'
  convenience_school: 'good' | 'average' | 'fair' | 'poor'
  public_transportation: 'good' | 'average' | 'fair' | 'poor'
  utilities_adequacy: 'good' | 'average' | 'fair' | 'poor'
  recreation_facilities: 'good' | 'average' | 'fair' | 'poor'
  police_fire_protection: 'good' | 'average' | 'fair' | 'poor'
  accessibility: 'good' | 'average' | 'fair' | 'poor'
}

// Construction Details Interface
export interface ConstructionDetails {
  construction_type?: string
  floor_finish?: string
  wall_finish?: string
  door_types?: string
  window_types?: string
  ceiling_types?: string
  roof_types?: string
  fixtures?: string[]
}

// External Works Interface
export interface ExternalWorks {
  boundary_type?: string
  boundary_height_m?: number
  landscaping?: string[]
  ground_finishes?: string[]
  water_storage_capacity_litres?: number
  has_swimming_pool?: boolean
  has_car_park?: boolean
  car_park_spaces?: number
}

// Services Interface
export interface PropertyServices {
  water_supply?: 'public_mains' | 'borehole' | 'well' | 'both'
  electricity_supply?: 'ecg' | 'solar' | 'generator' | 'grid_solar' | 'grid_generator'
  drainage_type?: 'public_sewer' | 'septic' | 'soakaway' | 'septic_soakaway'
  telecom_available?: boolean
  internet_available?: boolean
}

// Condition Defects Interface
export interface ConditionDefects {
  wall_cracks?: boolean
  roof_deterioration?: boolean
  paint_peeling?: boolean
  flooring_wear?: boolean
  door_window_damage?: boolean
  dampness?: boolean
  ceiling_damage?: boolean
  other_defects?: string[]
  structural_notes?: string
}

// Comprehensive Property Interface
export interface ComprehensivePropertyData {
  // Basic Information
  address: string
  city: string
  region: string
  digital_address?: string
  property_type: string
  property_use?: 'residential' | 'commercial' | 'industrial' | 'mixed_use' | 'agricultural'

  // Physical Characteristics
  gfa?: number  // Gross Floor Area
  plot_size?: number
  land_area?: number
  year_built?: number
  age?: number
  bedrooms?: number
  bathrooms?: number
  total_floors?: number
  floor_number?: number  // For apartments
  parking_spaces?: number

  // Quality & Condition
  quality_rating: string
  condition: string

  // Amenities (Boolean flags)
  has_pool?: boolean
  has_garden?: boolean
  has_security?: boolean
  has_elevator?: boolean
  has_balcony?: boolean
  has_terrace?: boolean
  has_gym?: boolean
  has_generator?: boolean
  has_solar?: boolean
  has_borehole?: boolean
  has_parking?: boolean

  // Location Quality
  view_quality: string
  neighborhood_rating: string
  accessibility_rating: string

  // Legal & Tenure
  tenure_type: string
  lease_years_remaining?: number
  lease_start_date?: string
  ground_rent?: number
  lessor?: string
  land_title_registered?: boolean
  registration_number?: string
  encumbrances?: string[]
  
  // Owner Information
  owner_name?: string
  owner_email?: string
  owner_phone?: string
  owner_address?: string
  owner_contact_preference?: 'email' | 'phone' | 'mail' | 'any'
  
  // Financial/Transaction (for comparables)
  sale_price?: number
  sale_date?: string
  transaction_type?: 'verified_sale' | 'sale' | 'asking_price'
  
  // Distances (for comparables)
  distance_km?: number
  similarity_score?: number
  quality_score?: number
  
  // Construction Details (for RICS/GhIS Report)
  construction?: ConstructionDetails
  
  // External Works (for RICS/GhIS Report)
  externals?: ExternalWorks
  
  // Services (for RICS/GhIS Report)
  services?: PropertyServices
  
  // Condition Defects (for RICS/GhIS Report)
  defects?: ConditionDefects
  
  // Risk Assessment (for RICS/GhIS Report)
  risk_assessment?: PropertyRiskAssessment
  
  // Neighbourhood Description (for RICS/GhIS Report)
  neighbourhood_description?: string
  nearby_landmarks?: string[]
  
  // Property Description (for RICS/GhIS Report)
  property_description?: string
  grounds_description?: string
  
  // Chapter 3: Data Influencing Property Values (for RICS/GhIS Report)
  // City Data
  city_description?: string             // Description of the city/metropolitan area
  city_details?: string                 // Additional city details (economic activities, etc.)
  
  // Neighbourhood Data
  neighborhood_class?: 'first_class' | 'second_class' | 'third_class' | 'middle_class' | 'high_class' | 'low_class'
  resident_income_level?: 'high_income' | 'middle_income' | 'low_income' | 'mixed_income'
  primary_use?: 'residential' | 'commercial' | 'industrial' | 'mixed_use'
  neighborhood_details?: string         // Additional neighborhood details
  
  // Location Description
  location_description?: string         // Specific location description
  
  // Brief Property Description
  brief_description?: string            // Brief description of the property
  
  // Grounds and External Works
  grounds_external_works?: string       // Description of grounds and external works
  
  // Construction Details (expanded for report)
  floor_finish?: string                 // e.g., "Ceramic tiles in all areas"
  wall_construction?: string            // e.g., "Reinforced columns and beams..."
  doors?: string                        // e.g., "Polished wooden panel doors"
  windows?: string                      // e.g., "Aluminum sliding windows"
  ceiling?: string                      // e.g., "Plaster of paris (POP)"
  roofing?: string                      // e.g., "Aluminum roofing sheets"
  
  // Fixtures and Fittings
  fixtures_fittings?: string            // List of fixtures and fittings
  
  // Drainage/Sanitation
  drainage_sanitation?: string          // Drainage and sanitation description
  
  // Condition State
  condition_state?: string              // General condition and state of repair
  
  // Services
  services_description?: string         // Services available description
  
  // Land Value Evidence
  land_value_evidence?: string          // Evidence of land values analysis
  
  // Valuation Dates (RICS Red Book VPS 3 Compliant)
  // These dates are critical for RICS/GhIS compliance and exchange rate determination
  inspection_date?: string              // Date of physical inspection (ISO 8601: YYYY-MM-DD)
  valuation_date?: string               // Effective date of valuation - determines exchange rates (ISO 8601)
  instruction_date?: string             // Date client instructed the valuation (ISO 8601)
  report_date?: string                  // Date report is issued (ISO 8601, defaults to current date)
  is_retrospective?: boolean            // True if valuation_date is before instruction_date
  
  // Engagement/Client Information (who instructed the valuation)
  // This is stored in valuation_engagements table and shown in General Introduction
  client_name?: string                  // Name of person/entity who instructed the valuation
  client_address?: string               // Address of the instructing client
  client_email?: string                 // Email of the instructing client
  client_phone?: string                 // Phone of the instructing client
  client_company?: string               // Company / organisation of the instructing client
  client_id?: string                    // Linked saved client (valuation_clients) id
  request_type?: 'written' | 'verbal' | 'email' | 'letter'  // How the instruction was received
  
  // Purpose of Valuation
  valuation_purpose?: 'sale' | 'mortgage' | 'insurance' | 'tax' | 'investment' | 'development' | 'rental' | 'accounting' | 'litigation'
}

// Default values for new property
export const DEFAULT_PROPERTY_DATA: Partial<ComprehensivePropertyData> = {
  region: 'greater_accra',
  property_type: 'house',
  property_use: 'residential',
  quality_rating: 'standard',
  condition: 'good',
  view_quality: 'standard',
  neighborhood_rating: 'secondary',
  accessibility_rating: 'good',
  tenure_type: 'freehold',
  has_pool: false,
  has_garden: false,
  has_security: false,
  has_elevator: false,
  has_balcony: false,
  has_terrace: false,
  has_gym: false,
  has_generator: false,
  has_solar: false,
  has_borehole: false,
  has_parking: false,
  land_title_registered: false,
  request_type: 'written',
  valuation_purpose: 'sale',
  services: {
    water_supply: 'public_mains',
    electricity_supply: 'ecg',
    drainage_type: 'septic',
    telecom_available: true,
    internet_available: true,
  },
  risk_assessment: {
    employment_stability: 'good',
    convenience_employment: 'good',
    convenience_shopping: 'average',
    convenience_school: 'average',
    public_transportation: 'good',
    utilities_adequacy: 'good',
    recreation_facilities: 'average',
    police_fire_protection: 'good',
    accessibility: 'good',
  },
}

// Default Risk Assessment
export const DEFAULT_RISK_ASSESSMENT: PropertyRiskAssessment = {
  employment_stability: 'good',
  convenience_employment: 'good',
  convenience_shopping: 'average',
  convenience_school: 'average',
  public_transportation: 'good',
  utilities_adequacy: 'good',
  recreation_facilities: 'average',
  police_fire_protection: 'good',
  accessibility: 'good',
}

// Validation rules
export const VALIDATION_RULES = {
  required: ['address', 'city', 'region', 'property_type'],
  // Date fields required for subject property valuations (RICS VPS 3)
  requiredForValuation: ['inspection_date', 'valuation_date'],
  numeric: ['gfa', 'plot_size', 'land_area', 'year_built', 'bedrooms', 'bathrooms', 'total_floors', 'parking_spaces', 'lease_years_remaining'],
  positive: ['gfa', 'plot_size', 'land_area', 'bedrooms', 'bathrooms', 'total_floors', 'parking_spaces'],
  dateFields: ['inspection_date', 'valuation_date', 'instruction_date', 'report_date'],
  maxYear: new Date().getFullYear(),
  minYear: 1900,
}

// RICS/GhIS Valuation Date Validation Helper
export const validateValuationDates = (
  data: Partial<ComprehensivePropertyData>
): { valid: boolean; errors: Record<string, string> } => {
  const errors: Record<string, string> = {}
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Parse dates
  const inspectionDate = data.inspection_date ? new Date(data.inspection_date) : null
  const valuationDate = data.valuation_date ? new Date(data.valuation_date) : null
  const instructionDate = data.instruction_date ? new Date(data.instruction_date) : null
  
  // RICS VPS 3: Inspection date cannot be in the future
  if (inspectionDate && inspectionDate > today) {
    errors.inspection_date = 'Inspection date cannot be in the future'
  }
  
  // RICS VPS 3: Valuation date typically should not be more than 3 months in the future
  if (valuationDate) {
    const maxFutureDate = new Date(today)
    maxFutureDate.setMonth(maxFutureDate.getMonth() + 3)
    if (valuationDate > maxFutureDate) {
      errors.valuation_date = 'Valuation date cannot be more than 3 months in the future'
    }
  }
  
  // RICS VPS 3: Inspection date should typically be on or before valuation date
  // (except for desktop valuations or re-inspections)
  if (inspectionDate && valuationDate && inspectionDate > valuationDate) {
    errors.inspection_date = 'Inspection date should be on or before the valuation date'
  }
  
  // RICS VPS 3: Instruction date should be before or on valuation date for current valuations
  if (instructionDate && valuationDate) {
    if (instructionDate > valuationDate && !data.is_retrospective) {
      errors.is_retrospective = 'This appears to be a retrospective valuation. Please confirm.'
    }
  }
  
  // GhIS: For retrospective valuations, valuation date must be in the past
  if (data.is_retrospective && valuationDate && valuationDate >= today) {
    errors.valuation_date = 'Retrospective valuation date must be in the past'
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  }
}