-- Migration: 033_valuation_reports_phase1.sql
-- Description: Phase 1 Foundation for RICS/GhIS compliant valuation reports
-- Created: 2026-01-15
-- Reference: docs/valuation-report-api-specification.md

-- ============================================================================
-- VALUATION REPORTS TABLE
-- Stores report drafts, versions, and finalized documents
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generating', 'pending_review', 'approved', 'superseded')),
  template VARCHAR(50) NOT NULL DEFAULT 'ghis_standard'
    CHECK (template IN ('ghis_standard', 'rics_residential', 'rics_commercial', 'bank_mortgage', 'insurance', 'custom')),
  
  -- Document storage (MinIO/S3 keys)
  docx_storage_key VARCHAR(255),
  pdf_storage_key VARCHAR(255),
  
  -- Content (structured JSON for each section)
  content JSONB DEFAULT '{}',
  custom_sections JSONB DEFAULT '[]',
  
  -- Approval workflow
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  valuer_signature_key VARCHAR(255),
  digital_seal_hash VARCHAR(64), -- SHA-256 hash for verification
  verification_url VARCHAR(500), -- URL with QR code for verification
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Ensure unique version per valuation
  UNIQUE(valuation_id, version)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_valuation_reports_valuation_id ON valuation_reports(valuation_id);
CREATE INDEX IF NOT EXISTS idx_valuation_reports_status ON valuation_reports(status);
CREATE INDEX IF NOT EXISTS idx_valuation_reports_created_by ON valuation_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_valuation_reports_created_at ON valuation_reports(created_at DESC);

-- ============================================================================
-- REPORT PHOTOS TABLE
-- Stores property photos attached to reports
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES valuation_reports(id) ON DELETE CASCADE,
  storage_key VARCHAR(255) NOT NULL, -- MinIO/S3 key for full-size image
  thumbnail_key VARCHAR(255), -- MinIO/S3 key for thumbnail
  filename VARCHAR(255),
  file_size_bytes INT,
  mime_type VARCHAR(50),
  width INT,
  height INT,
  caption TEXT,
  category VARCHAR(30) DEFAULT 'general'
    CHECK (category IN ('exterior', 'interior', 'amenities', 'neighbourhood', 'damage', 'documents', 'general')),
  display_order INT NOT NULL DEFAULT 0,
  taken_at TIMESTAMPTZ, -- When photo was taken
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_report_photos_report_id ON report_photos(report_id);
CREATE INDEX IF NOT EXISTS idx_report_photos_category ON report_photos(category);
CREATE INDEX IF NOT EXISTS idx_report_photos_order ON report_photos(report_id, display_order);

-- ============================================================================
-- VALUATION INSPECTIONS TABLE
-- Records property inspection details for RICS compliance
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  inspection_time TIME,
  inspector_id UUID REFERENCES users(id),
  inspector_name VARCHAR(255),
  
  -- Scope and access
  scope TEXT, -- e.g., "Full internal and external inspection"
  access_notes TEXT, -- e.g., "Keys provided by owner"
  access_restrictions TEXT[], -- Areas not accessible
  
  -- Conditions
  weather_conditions VARCHAR(100),
  occupancy_status VARCHAR(50), -- occupied, vacant, partially_occupied
  
  -- Measurement
  measurement_standard VARCHAR(100) DEFAULT 'GhIS Standard', -- GhIS Standard, RICS IPMS, etc.
  measurement_basis VARCHAR(50) DEFAULT 'GEA', -- GEA, GIA, NIA
  
  -- Coverage
  areas_inspected TEXT[], -- e.g., ['ground_floor', 'first_floor', 'roof', 'external']
  limitations TEXT[], -- e.g., ['Roof space not accessible', 'Tenant refused access to bedroom 2']
  
  -- Additional notes
  notes TEXT,
  photos_taken INT DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_valuation_inspections_valuation_id ON valuation_inspections(valuation_id);
CREATE INDEX IF NOT EXISTS idx_valuation_inspections_date ON valuation_inspections(inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_valuation_inspections_inspector ON valuation_inspections(inspector_id);

-- ============================================================================
-- VALUATION ENGAGEMENTS TABLE
-- Stores terms of engagement and client information (RICS VPS 1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Request details
  request_type VARCHAR(30) NOT NULL DEFAULT 'written'
    CHECK (request_type IN ('written', 'verbal', 'online')),
  request_date DATE,
  reference_number VARCHAR(100),
  
  -- Client (the party commissioning the valuation)
  client_name VARCHAR(255),
  client_company VARCHAR(255),
  client_address TEXT,
  client_city VARCHAR(100),
  client_region VARCHAR(100),
  client_contact VARCHAR(100),
  client_email VARCHAR(255),
  
  -- Intended user (if different from client)
  intended_user_name VARCHAR(255),
  intended_user_relationship VARCHAR(100), -- e.g., "Bank providing mortgage"
  intended_user_address TEXT,
  
  -- Valuation scope
  purpose TEXT NOT NULL, -- e.g., "Mortgage security", "Sale/Purchase", "Financial reporting"
  basis_of_value VARCHAR(50) NOT NULL DEFAULT 'market_value'
    CHECK (basis_of_value IN ('market_value', 'market_rent', 'investment_value', 'fair_value', 'synergistic_value', 'liquidation_value', 'existing_use_value')),
  valuation_date DATE,
  
  -- RICS requirements
  special_assumptions TEXT[], -- Assumptions that may differ from market
  departures TEXT[], -- Any departures from RICS standards
  extent_of_investigation TEXT, -- Scope of work
  nature_and_source_of_information TEXT, -- Data sources used
  
  -- Restrictions
  restrictions_on_use TEXT,
  restrictions_on_distribution TEXT,
  restrictions_on_publication TEXT,
  
  -- Fee
  fee_basis VARCHAR(100), -- fixed, hourly, percentage
  fee_amount DECIMAL(15,2),
  fee_currency VARCHAR(3) DEFAULT 'GHS',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_valuation_engagements_valuation_id ON valuation_engagements(valuation_id);
CREATE INDEX IF NOT EXISTS idx_valuation_engagements_client ON valuation_engagements(client_name);

-- ============================================================================
-- PROPERTY LEGAL TABLE
-- Stores legal and tenure information for properties
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_legal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  
  -- Tenure type (Ghana-specific options)
  tenure_type VARCHAR(50) NOT NULL DEFAULT 'freehold'
    CHECK (tenure_type IN ('freehold', 'leasehold', 'stool_land', 'family_land', 'government_land', 'customary', 'other')),
  tenure_description TEXT, -- Additional context
  
  -- Leasehold details (if applicable)
  lease_term_years INT,
  lease_start_date DATE,
  lease_expiry_date DATE,
  unexpired_term_years DECIMAL(5,2), -- Calculated field
  ground_rent DECIMAL(15,2),
  ground_rent_frequency VARCHAR(20), -- annual, quarterly, monthly
  rent_review_dates DATE[],
  lessor VARCHAR(255), -- Name of landlord/lessor
  
  -- Title registration
  land_title_registered BOOLEAN DEFAULT FALSE,
  registration_number VARCHAR(100),
  registration_district VARCHAR(100),
  title_type VARCHAR(50), -- e.g., "Freehold Title", "Leasehold Title", "Deed of Assignment"
  title_date DATE,
  
  -- Ghana-specific: Stool/Family land details
  stool_name VARCHAR(255), -- Name of stool if stool land
  family_name VARCHAR(255), -- Name of family if family land
  customary_allocation_date DATE,
  
  -- Encumbrances
  encumbrances JSONB DEFAULT '[]', -- Array of {type, holder, amount, notes}
  
  -- Permits and approvals
  permits JSONB DEFAULT '{}', -- {planning: {...}, building: {...}, occupancy: {...}}
  
  -- Planning/zoning
  zoning_classification VARCHAR(100),
  planning_scheme VARCHAR(255),
  permitted_uses TEXT[],
  planning_constraints TEXT[],
  
  -- Assumptions for valuation
  assumptions TEXT[],
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_property_legal_property_id ON property_legal(property_id);
CREATE INDEX IF NOT EXISTS idx_property_legal_tenure ON property_legal(tenure_type);
CREATE INDEX IF NOT EXISTS idx_property_legal_registration ON property_legal(registration_number) WHERE registration_number IS NOT NULL;

-- ============================================================================
-- PROPERTY CONSTRUCTION TABLE
-- Stores detailed construction and building specifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_construction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  
  -- Structure
  construction_type VARCHAR(255), -- e.g., "Reinforced concrete frame", "Load-bearing masonry"
  foundation_type VARCHAR(255), -- e.g., "Strip foundation", "Raft foundation"
  structural_frame VARCHAR(255), -- e.g., "Reinforced concrete columns and beams"
  
  -- Walls
  external_walls VARCHAR(255), -- e.g., "Sandcrete blocks with cement render"
  internal_walls VARCHAR(255), -- e.g., "Sandcrete blocks, plastered and painted"
  wall_finish TEXT, -- e.g., "Smooth cement render with emulsion paint"
  
  -- Floors
  floor_structure VARCHAR(255), -- e.g., "Reinforced concrete slab"
  floor_finish TEXT, -- e.g., "Porcelain floor tiles in living areas, vitrified tiles in bedrooms"
  
  -- Doors and windows
  door_types TEXT, -- e.g., "Solid hardwood panel doors internally, steel security doors at entrances"
  window_types TEXT, -- e.g., "Aluminum sliding windows with glass louvers"
  
  -- Ceiling and roof
  ceiling_types TEXT, -- e.g., "Suspended PVC ceiling throughout"
  roof_structure VARCHAR(255), -- e.g., "Timber truss with aluminum roofing sheets"
  roof_types TEXT, -- e.g., "Long-span aluminum roofing (0.55mm gauge)"
  roof_finish VARCHAR(255),
  
  -- Fixtures and fittings
  fixtures TEXT[], -- Array of notable fixtures
  kitchen_fittings TEXT,
  bathroom_fittings TEXT,
  
  -- Services
  water_supply VARCHAR(100), -- e.g., "Ghana Water Company mains + underground storage"
  water_storage_capacity INT, -- Liters
  electricity_supply VARCHAR(100), -- e.g., "ECG mains supply"
  electricity_phase VARCHAR(20), -- single, three_phase
  backup_power VARCHAR(255), -- e.g., "10KVA automatic transfer generator"
  drainage_system VARCHAR(255), -- e.g., "Septic tank with soakaway"
  telecom_available BOOLEAN DEFAULT TRUE,
  internet_available BOOLEAN DEFAULT TRUE,
  
  -- Condition assessment
  condition_overall VARCHAR(20) DEFAULT 'good'
    CHECK (condition_overall IN ('excellent', 'good', 'fair', 'poor', 'very_poor')),
  condition_age_years INT,
  effective_age_years INT, -- May differ from actual age due to renovations
  remaining_life_years INT,
  
  -- Defects and issues
  structural_notes TEXT,
  defects TEXT[], -- Array of identified defects
  deferred_maintenance TEXT[],
  recommended_repairs TEXT[],
  estimated_repair_cost DECIMAL(15,2),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_property_construction_property_id ON property_construction(property_id);
CREATE INDEX IF NOT EXISTS idx_property_construction_condition ON property_construction(condition_overall);

-- ============================================================================
-- PROPERTY RISK ASSESSMENTS TABLE
-- Stores risk assessment matrix for properties
-- ============================================================================
CREATE TABLE IF NOT EXISTS property_risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessor_id UUID REFERENCES users(id),
  
  -- Neighbourhood/Location Factors (Rating: good, average, fair, poor)
  employment_stability VARCHAR(10) CHECK (employment_stability IN ('good', 'average', 'fair', 'poor')),
  convenience_employment VARCHAR(10) CHECK (convenience_employment IN ('good', 'average', 'fair', 'poor')),
  convenience_shopping VARCHAR(10) CHECK (convenience_shopping IN ('good', 'average', 'fair', 'poor')),
  convenience_school VARCHAR(10) CHECK (convenience_school IN ('good', 'average', 'fair', 'poor')),
  convenience_healthcare VARCHAR(10) CHECK (convenience_healthcare IN ('good', 'average', 'fair', 'poor')),
  public_transportation VARCHAR(10) CHECK (public_transportation IN ('good', 'average', 'fair', 'poor')),
  utilities_adequacy VARCHAR(10) CHECK (utilities_adequacy IN ('good', 'average', 'fair', 'poor')),
  recreation_facilities VARCHAR(10) CHECK (recreation_facilities IN ('good', 'average', 'fair', 'poor')),
  police_fire_protection VARCHAR(10) CHECK (police_fire_protection IN ('good', 'average', 'fair', 'poor')),
  general_appearance VARCHAR(10) CHECK (general_appearance IN ('good', 'average', 'fair', 'poor')),
  
  -- Property-specific factors
  accessibility VARCHAR(10) CHECK (accessibility IN ('good', 'average', 'fair', 'poor')),
  road_condition VARCHAR(10) CHECK (road_condition IN ('good', 'average', 'fair', 'poor')),
  drainage_adequacy VARCHAR(10) CHECK (drainage_adequacy IN ('good', 'average', 'fair', 'poor')),
  flood_risk VARCHAR(10) CHECK (flood_risk IN ('low', 'medium', 'high', 'very_high')),
  environmental_hazards VARCHAR(10) CHECK (environmental_hazards IN ('none', 'low', 'medium', 'high')),
  
  -- Overall assessment
  overall_risk_level VARCHAR(10) NOT NULL DEFAULT 'low'
    CHECK (overall_risk_level IN ('low', 'medium', 'high', 'very_high')),
  risk_score INT CHECK (risk_score >= 0 AND risk_score <= 100), -- 0-100 score
  
  -- Notes
  notes TEXT,
  key_risks TEXT[], -- Array of key risk factors identified
  mitigating_factors TEXT[],
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_property_risk_assessments_property_id ON property_risk_assessments(property_id);
CREATE INDEX IF NOT EXISTS idx_property_risk_assessments_risk_level ON property_risk_assessments(overall_risk_level);
CREATE INDEX IF NOT EXISTS idx_property_risk_assessments_date ON property_risk_assessments(assessment_date DESC);

-- ============================================================================
-- VALUERS TABLE
-- Stores valuer credentials and professional information
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Personal information
  name VARCHAR(255) NOT NULL,
  title VARCHAR(100), -- e.g., "Registered Valuer", "Estate Surveyor & Valuer"
  qualifications TEXT, -- e.g., "BSc. (Hons) Land Economy, MSc. Real Estate"
  
  -- Professional license
  license_number VARCHAR(100),
  license_issuer VARCHAR(255), -- e.g., "Ghana Institution of Surveyors (GhIS)"
  license_valid_from DATE,
  license_valid_until DATE,
  license_status VARCHAR(20) DEFAULT 'active'
    CHECK (license_status IN ('active', 'expired', 'suspended', 'revoked')),
  
  -- Professional memberships
  memberships JSONB DEFAULT '[]', -- Array of {organization, number, grade}
  
  -- Professional indemnity insurance
  pi_provider VARCHAR(255),
  pi_policy_number VARCHAR(100),
  pi_coverage DECIMAL(15,2),
  pi_coverage_currency VARCHAR(3) DEFAULT 'GHS',
  pi_valid_from DATE,
  pi_valid_until DATE,
  
  -- Contact information
  company_name VARCHAR(255),
  contact_address TEXT,
  contact_city VARCHAR(100),
  contact_region VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  
  -- Signature (for report signing)
  signature_storage_key VARCHAR(255), -- MinIO/S3 key for signature image
  
  -- Specializations
  specializations TEXT[], -- e.g., ['residential', 'commercial', 'industrial', 'agricultural']
  regions_covered VARCHAR(255)[], -- Ghana regions covered
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_valuers_user_id ON valuers(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_valuers_license_number ON valuers(license_number) WHERE license_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_valuers_status ON valuers(license_status);
CREATE INDEX IF NOT EXISTS idx_valuers_active ON valuers(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- REPORT AUDIT LOG TABLE
-- Tracks all actions on valuation reports for compliance
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES valuation_reports(id) ON DELETE CASCADE,
  
  -- Action details
  action VARCHAR(50) NOT NULL
    CHECK (action IN ('created', 'edited', 'viewed', 'downloaded', 'approved', 'rejected', 'superseded', 'shared', 'printed')),
  action_details TEXT, -- Additional context
  
  -- User information
  user_id UUID REFERENCES users(id),
  user_name VARCHAR(255), -- Denormalized for audit purposes
  user_email VARCHAR(255),
  
  -- Request context
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR(255),
  
  -- Additional metadata
  details JSONB, -- Any additional structured data
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_report_audit_log_report_id ON report_audit_log(report_id);
CREATE INDEX IF NOT EXISTS idx_report_audit_log_action ON report_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_report_audit_log_user ON report_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_report_audit_log_created ON report_audit_log(created_at DESC);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Trigger function (reuse if exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $func$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
    END IF;
END $$;

-- Apply triggers
DROP TRIGGER IF EXISTS update_valuation_reports_updated_at ON valuation_reports;
CREATE TRIGGER update_valuation_reports_updated_at
  BEFORE UPDATE ON valuation_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_valuation_inspections_updated_at ON valuation_inspections;
CREATE TRIGGER update_valuation_inspections_updated_at
  BEFORE UPDATE ON valuation_inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_valuation_engagements_updated_at ON valuation_engagements;
CREATE TRIGGER update_valuation_engagements_updated_at
  BEFORE UPDATE ON valuation_engagements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_property_legal_updated_at ON property_legal;
CREATE TRIGGER update_property_legal_updated_at
  BEFORE UPDATE ON property_legal
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_property_construction_updated_at ON property_construction;
CREATE TRIGGER update_property_construction_updated_at
  BEFORE UPDATE ON property_construction
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_property_risk_assessments_updated_at ON property_risk_assessments;
CREATE TRIGGER update_property_risk_assessments_updated_at
  BEFORE UPDATE ON property_risk_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_valuers_updated_at ON valuers;
CREATE TRIGGER update_valuers_updated_at
  BEFORE UPDATE ON valuers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE valuation_reports IS 'Stores valuation report drafts, versions, and finalized documents compliant with RICS Red Book and GhIS standards';
COMMENT ON TABLE report_photos IS 'Property photographs attached to valuation reports';
COMMENT ON TABLE valuation_inspections IS 'Records of property inspections conducted for valuations';
COMMENT ON TABLE valuation_engagements IS 'Terms of engagement and client information per RICS VPS 1';
COMMENT ON TABLE property_legal IS 'Legal and tenure information for properties including Ghana-specific land types';
COMMENT ON TABLE property_construction IS 'Detailed construction specifications and condition assessments';
COMMENT ON TABLE property_risk_assessments IS 'Risk assessment matrix for properties';
COMMENT ON TABLE valuers IS 'Professional valuer credentials and licensing information';
COMMENT ON TABLE report_audit_log IS 'Audit trail for all actions on valuation reports';
