/**
 * Location Module Types
 * 
 * Phase 3.5: Split projectLocationService
 * 
 * Shared types for project location management:
 * - Location validation and enrichment
 * - Ghana-specific geographic data
 * - Permit and regulatory tracking
 * 
 * @module services/project-management/location/types
 */

// =============================================================================
// LAND TENURE
// =============================================================================

export type LandTenureType = 
  | 'government_lease' 
  | 'stool_land_lease' 
  | 'family_land' 
  | 'freehold' 
  | 'leasehold' 
  | 'government_allocation';

// =============================================================================
// VALIDATION TYPES
// =============================================================================

export interface LocationValidationInput {
  ghana_post_gps?: string;
  latitude?: number;
  longitude?: number;
  address_line1?: string;
  city?: string;
  region?: string;
}

export interface LocationValidationResult {
  isValid: boolean;
  confidence: number;
  validated: {
    ghana_post_gps?: string;
    latitude?: number;
    longitude?: number;
    ghana_region?: string;
    ghana_district?: string;
    ghana_area?: string;
    city?: string;
    region?: string;
  };
  enrichments: Array<{
    field: string;
    value: string;
    source: string;
    confidence: number;
  }>;
  issues: Array<{
    type: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    field?: string;
  }>;
  source: string;
}

// =============================================================================
// PROJECT LOCATION
// =============================================================================

export interface ProjectLocationInput {
  // Core location
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  
  // Ghana PostGPS
  ghana_post_gps?: string;
  
  // Coordinates
  latitude?: number;
  longitude?: number;
  
  // Ghana-specific fields
  ghana_region?: string;
  ghana_district?: string;
  ghana_area?: string;
  
  // Land tenure
  land_tenure_type?: LandTenureType;
  land_parcel_id?: string;
  traditional_authority_id?: string;
  assembly_id?: string;
}

export interface ValidatedLocation extends ProjectLocationInput {
  validation_confidence: number;
  validation_source: string;
  validated_at: Date;
}

// =============================================================================
// SEARCH TYPES
// =============================================================================

export interface ProjectSearchParams {
  organizationId: string;
  region?: string;
  district?: string;
  city?: string;
  projectType?: string;
  status?: string;
  nearLatitude?: number;
  nearLongitude?: number;
  radiusKm?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ProjectSearchResult {
  id: string;
  name: string;
  projectType: string;
  status: string;
  address: string;
  city: string;
  region: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  unitCount?: number;
  availableUnits?: number;
  priceRange?: {
    min: number;
    max: number;
    currency: string;
  };
}

export interface NearbyProject {
  id: string;
  name: string;
  projectType: string;
  distanceKm: number;
  address: string;
}

// =============================================================================
// PERMIT TYPES
// =============================================================================

export type PermitStatus = 
  | 'not_applied'
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'suspended';

export type GhanaPermitType =
  | 'building_permit'
  | 'development_permit'
  | 'environmental_permit'
  | 'fire_certificate'
  | 'land_title_certificate'
  | 'stool_land_consent'
  | 'town_planning_approval'
  | 'epa_permit'
  | 'water_connection'
  | 'electricity_connection'
  | 'occupancy_certificate'
  | 'other';

export interface ProjectPermit {
  id: string;
  projectId: string;
  permitType: GhanaPermitType;
  permitNumber?: string;
  issuingAuthority: string;
  status: PermitStatus;
  applicationDate?: Date;
  approvalDate?: Date;
  expiryDate?: Date;
  fee?: number;
  feeCurrency?: string;
  notes?: string;
  documentUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermitCreateInput {
  projectId: string;
  permitType: GhanaPermitType;
  permitNumber?: string;
  issuingAuthority: string;
  applicationDate?: Date;
  fee?: number;
  feeCurrency?: string;
  notes?: string;
  documentUrl?: string;
}

export interface RequiredPermit {
  permitType: GhanaPermitType;
  name: string;
  issuingAuthority: string;
  description: string;
  typicalTimeline: string;
  estimatedFee?: {
    min: number;
    max: number;
    currency: string;
  };
  required: boolean;
}

// =============================================================================
// TRADITIONAL AUTHORITY
// =============================================================================

export interface TraditionalAuthority {
  id: string;
  name: string;
  chieftaincyTitle: string;
  region: string;
  district?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface RegulatoryAssembly {
  id: string;
  name: string;
  type: 'metropolitan' | 'municipal' | 'district';
  region: string;
  capital: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  physicalAddress?: string;
  website?: string;
}
