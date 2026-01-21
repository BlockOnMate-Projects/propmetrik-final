/**
 * Valuation Report Types
 * 
 * TypeScript definitions for the PROPMETRIK Valuation Report API.
 * Implements RICS/GhIS compliant report structures.
 */

// =====================================================
// ENUMS / STATUS TYPES
// =====================================================

export type ReportStatus = 
  | 'draft' 
  | 'pending_review' 
  | 'approved' 
  | 'superseded';

export type ReportTemplate = 
  | 'ghis_standard' 
  | 'rics_residential' 
  | 'rics_commercial' 
  | 'bank_mortgage' 
  | 'insurance'
  | 'custom';

export type PhotoCategory = 
  | 'exterior' 
  | 'interior' 
  | 'amenities' 
  | 'neighbourhood' 
  | 'damage';

export type AuditAction =
  | 'created'
  | 'updated'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'downloaded'
  | 'superseded';

// =====================================================
// CORE INTERFACES
// =====================================================

export interface ReportOptions {
  include_comparables?: boolean;
  include_market_analysis?: boolean;
  include_photos?: boolean;
  include_floor_plans?: boolean;
  include_maps?: boolean;
  language?: 'en' | 'fr';
  currency?: 'GHS' | 'USD';
  secondary_currency?: 'GHS' | 'USD' | null;
}

export interface CreateReportInput {
  valuation_id: string;
  template?: ReportTemplate;
  options?: ReportOptions;
}

export interface UpdateReportInput {
  sections?: Record<string, any>;
  content?: Record<string, any>;
}

export interface ValuationReport {
  id: string;
  valuation_id: string;
  status: ReportStatus;
  template: ReportTemplate;
  version: number;
  docx_url: string | null;
  pdf_url: string | null;
  content: Record<string, any>;
  options: ReportOptions;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  expires_at: string | null;
  digital_seal_hash: string | null;
  verification_url: string | null;
}

export interface ReportPhoto {
  id: string;
  report_id: string;
  storage_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  category: PhotoCategory;
  display_order: number;
  created_at: string;
  file_size_bytes: number | null;
}

export interface Valuer {
  id: string;
  name: string;
  qualifications: string | null;
  license_number: string | null;
  company_name: string | null;
  company_address: string | null;
  email: string | null;
  phone: string | null;
  signature_url: string | null;
  is_active: boolean;
}

export interface ReportWithValuer extends ValuationReport {
  valuer?: Valuer;
}

export interface ReportListFilters {
  status?: ReportStatus;
  template?: ReportTemplate;
  valuation_id?: string;
  valuer_id?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedReports {
  reports: ReportWithValuer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// =====================================================
// AUDIT LOG
// =====================================================

export interface ReportAuditEntry {
  id: string;
  report_id: string;
  action: AuditAction;
  user_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
  ip_address: string | null;
}

export interface ReportAuditLog {
  audit_log: ReportAuditEntry[];
}

// =====================================================
// API RESPONSES
// =====================================================

export interface PhotosResponse {
  photos: ReportPhoto[];
}

export interface ReportsForValuationResponse {
  reports: ValuationReport[];
}

export interface ReorderPhotosResponse {
  success: boolean;
}

// =====================================================
// REPORT CONTENT TYPES (for DOCX generation)
// =====================================================

export interface ReportCover {
  title: string;
  subtitle: string;
  property_location: string;
  requested_by: {
    name: string;
    address: string;
  };
  prepared_for: {
    name: string;
    address: string;
  };
  certified_by: {
    name: string;
    qualifications: string;
    title: string;
    address: string;
  };
  date: string;
  company_logo_url?: string;
}

export interface ReportTransmittal {
  recipient: {
    name: string;
    address: string;
  };
  date: string;
  subject: string;
  body: string;
  valuation_methods_summary: string;
  values: {
    market_value: {
      ghs: number;
      ghs_formatted: string;
      usd: number;
      usd_formatted: string;
    };
    forced_sale_value: {
      ghs: number;
      ghs_formatted: string;
      usd: number;
      usd_formatted: string;
    };
  };
  exchange_rate: {
    rate: number;
    source: string;
    date: string;
  };
  valuer_signature: {
    name: string;
    title: string;
  };
}

export interface ReportCertification {
  certification_text: string;
  disclosure: string;
  standards_compliance: string;
  values_table: {
    market_value: { ghs: number; usd: number };
    forced_sale_value: { ghs: number; usd: number };
  };
  valuation_date: string;
  exchange_rate: {
    rate: number;
    source: string;
    date: string;
  };
  valuer: {
    name: string;
    title: string;
    license_number: string;
    signature_url: string;
  };
}

export interface ReportDisclaimers {
  title: string;
  conditions: string[];
  standards_references: {
    code: string;
    name: string;
    year: number;
  }[];
}

export interface PropertyRiskAssessment {
  property_id: string;
  assessment_date: string;
  items: {
    item: string;
    rating: 'good' | 'average' | 'poor' | 'fair';
  }[];
  overall_risk_level: 'low' | 'medium' | 'high';
}

export interface PropertyLegal {
  property_id: string;
  tenure_type: 'freehold' | 'leasehold' | 'stool_land' | 'family_land' | 'government';
  tenure_details: {
    lease_term_years?: number;
    lease_start_date?: string;
    remaining_years?: number;
    ground_rent?: number;
    lessor?: string;
  };
  title_registration: {
    status: 'registered' | 'pending' | 'unregistered';
    reference?: string;
    date?: string;
  };
  encumbrances: string[];
  easements: string[];
  planning_zone: string;
  permitted_uses: string[];
}

export interface PropertyConstruction {
  property_id: string;
  structure_type: string;
  foundation: string;
  walls: string;
  roofing: string;
  flooring: string;
  ceiling: string;
  windows: string;
  doors: string;
  electrical: string;
  plumbing: string;
  hvac: string;
  age_years: number;
  condition: 'new' | 'excellent' | 'good' | 'fair' | 'poor';
  last_renovation_year?: number;
  effective_age_years?: number;
}

// =====================================================
// HELPER CONSTANTS
// =====================================================

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  approved: 'Approved',
  superseded: 'Superseded',
};

export const REPORT_TEMPLATE_LABELS: Record<ReportTemplate, string> = {
  ghis_standard: 'GhIS Standard',
  rics_residential: 'RICS Residential',
  rics_commercial: 'RICS Commercial',
  bank_mortgage: 'Bank/Mortgage',
  insurance: 'Insurance',
  custom: 'Custom',
};

export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  exterior: 'Exterior',
  interior: 'Interior',
  amenities: 'Amenities',
  neighbourhood: 'Neighbourhood',
  damage: 'Damage/Defects',
};

export const REPORT_STATUS_COLORS: Record<ReportStatus, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  pending_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  superseded: 'bg-gray-100 text-gray-800',
};
