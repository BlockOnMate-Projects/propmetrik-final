// =====================================================
// COMPREHENSIVE PROPERTY FORM FIELDS
// Based on RICS Red Book Standards & PropMetrik Demo
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
  { value: 'freehold', label: 'Freehold', description: 'Outright ownership of property and land' },
  { value: 'leasehold', label: 'Leasehold', description: 'Lease agreement for specific period' },
  { value: 'customary', label: 'Customary', description: 'Traditional family/customary land' },
  { value: 'government', label: 'Government Lease', description: 'Lease from government authority' },
]

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

// Comprehensive Property Interface
export interface ComprehensivePropertyData {
  // Basic Information
  address: string
  city: string
  region: string
  digital_address?: string
  property_type: string

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

  // Location Quality
  view_quality: string
  neighborhood_rating: string
  accessibility_rating: string

  // Legal & Tenure
  tenure_type: string
  lease_years_remaining?: number
  
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
}

// Default values for new property
export const DEFAULT_PROPERTY_DATA: Partial<ComprehensivePropertyData> = {
  region: 'greater_accra',
  property_type: 'house',
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
}

// Validation rules
export const VALIDATION_RULES = {
  required: ['address', 'city', 'region', 'property_type'],
  numeric: ['gfa', 'plot_size', 'land_area', 'year_built', 'bedrooms', 'bathrooms', 'total_floors', 'parking_spaces', 'lease_years_remaining'],
  positive: ['gfa', 'plot_size', 'land_area', 'bedrooms', 'bathrooms', 'total_floors', 'parking_spaces'],
  maxYear: new Date().getFullYear(),
  minYear: 1900,
}