-- Migration: 075_project_administrative_extensions.sql
-- Phase 1 Sprint 1: Project Management Ghana-Specific Administrative Data
-- NOTE: Leverages existing geocoding_cache and ghana bounds from Data Hub
--
-- This migration creates project-specific administrative tables that supplement
-- the Data Hub's GHANA_GPS_DISTRICTS. The Data Hub handles geocoding and GPS
-- validation, while these tables store project-specific regulatory data.

-- ============================================================================
-- 1. Traditional Authorities (for customary land projects)
-- ============================================================================
-- Ghana's customary land system requires tracking traditional authorities
-- (stools/skins) that govern land allocation in their jurisdictions.

CREATE TABLE IF NOT EXISTS traditional_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Authority identification
  name VARCHAR(150) NOT NULL,
  authority_type VARCHAR(50) DEFAULT 'stool', -- 'stool', 'skin', 'family', 'clan'
  
  -- Location (validated via Data Hub ghanaPostService)
  region VARCHAR(100) NOT NULL,
  district VARCHAR(100),
  area VARCHAR(200),
  headquarters_gps VARCHAR(20), -- Ghana PostGPS code
  
  -- Leadership
  paramount_chief VARCHAR(200),
  divisional_chief VARCHAR(200),
  stool_lands_secretary VARCHAR(200),
  
  -- Land information
  stool_land_area_km2 NUMERIC(10, 2),
  estimated_parcels INTEGER,
  
  -- Contact details (JSONB for flexibility)
  contact_info JSONB DEFAULT '{}'::jsonb,
  -- Expected: { "phone": "", "email": "", "address": "" }
  
  -- Administrative
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for region/district lookups
CREATE INDEX IF NOT EXISTS idx_traditional_authorities_region 
  ON traditional_authorities(region);
CREATE INDEX IF NOT EXISTS idx_traditional_authorities_district 
  ON traditional_authorities(district);
CREATE INDEX IF NOT EXISTS idx_traditional_authorities_active 
  ON traditional_authorities(is_active) WHERE is_active = true;

-- ============================================================================
-- 2. Assembly Regulatory Contacts
-- ============================================================================
-- Ghana's 261 Metropolitan, Municipal, and District Assemblies (MMDAs)
-- have permit offices with varying contact information and procedures.

CREATE TABLE IF NOT EXISTS assembly_regulatory_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Assembly identification
  assembly_name VARCHAR(150) NOT NULL,
  assembly_type VARCHAR(50) NOT NULL, -- 'metropolitan', 'municipal', 'district'
  region VARCHAR(100) NOT NULL,
  
  -- Permit office (Development & Building Permits)
  permit_office_address TEXT,
  permit_office_gps VARCHAR(20), -- Validated via ghanaPostService
  permit_office_phone VARCHAR(50),
  permit_office_email VARCHAR(255),
  permit_office_hours VARCHAR(200), -- e.g., "Mon-Fri 8:00 AM - 5:00 PM"
  
  -- Fee structure (JSONB for flexibility)
  fee_schedule JSONB DEFAULT '{}'::jsonb,
  -- Expected: { "development_permit": { "base_fee": 500, "per_sqm": 2 }, ... }
  
  -- Average processing times (in days)
  avg_development_permit_days INTEGER,
  avg_building_permit_days INTEGER,
  avg_habitation_cert_days INTEGER,
  
  -- Related regulatory bodies
  fire_service_contact JSONB DEFAULT '{}'::jsonb,
  -- Expected: { "name": "", "phone": "", "email": "", "address": "" }
  
  epa_regional_contact JSONB DEFAULT '{}'::jsonb,
  -- Expected: { "name": "", "phone": "", "email": "", "address": "" }
  
  lands_commission_contact JSONB DEFAULT '{}'::jsonb,
  -- Expected: { "name": "", "phone": "", "email": "", "address": "" }
  
  gwcl_contact JSONB DEFAULT '{}'::jsonb, -- Ghana Water Company Limited
  ecg_contact JSONB DEFAULT '{}'::jsonb,  -- Electricity Company of Ghana
  
  -- Special requirements for this assembly
  special_requirements TEXT,
  
  -- Administrative
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMP, -- When the contact info was last verified
  verified_by UUID,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint on assembly/region combo
CREATE UNIQUE INDEX IF NOT EXISTS idx_assembly_regulatory_unique 
  ON assembly_regulatory_contacts(assembly_name, region);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_regulatory_assembly 
  ON assembly_regulatory_contacts(assembly_name);
CREATE INDEX IF NOT EXISTS idx_regulatory_region 
  ON assembly_regulatory_contacts(region);
CREATE INDEX IF NOT EXISTS idx_regulatory_assembly_type 
  ON assembly_regulatory_contacts(assembly_type);

-- ============================================================================
-- 3. Permit Types Reference Table
-- ============================================================================
-- Standard permit types in Ghana's real estate development process

CREATE TABLE IF NOT EXISTS permit_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  code VARCHAR(50) NOT NULL UNIQUE, -- e.g., 'DEV_PERMIT', 'BUILD_PERMIT'
  name VARCHAR(150) NOT NULL,
  description TEXT,
  
  -- Issuing authority
  authority_type VARCHAR(100) NOT NULL, -- 'assembly', 'epa', 'fire_service', 'lands_commission', 'gwcl', 'ecg'
  
  -- Requirements
  required_documents JSONB DEFAULT '[]'::jsonb,
  -- Expected: ["site_plan", "architectural_drawings", "structural_drawings"]
  
  -- Conditions when required
  required_for_project_types TEXT[], -- e.g., {'residential_multi', 'commercial'}
  required_if_units_exceed INTEGER, -- e.g., 40 for EPA
  required_if_area_exceeds NUMERIC(10, 2), -- sqm, e.g., 5000 for EPA
  
  -- Typical timeline
  typical_processing_days INTEGER,
  max_processing_days INTEGER,
  
  -- Fees
  fee_structure TEXT, -- Description of how fees are calculated
  typical_fee_range_ghs NUMRANGE, -- e.g., [500, 5000]
  
  -- Validity
  validity_period_months INTEGER, -- How long the permit is valid
  is_renewable BOOLEAN DEFAULT false,
  
  -- Ordering for display
  display_order INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. Seed Initial Permit Types
-- ============================================================================

INSERT INTO permit_types (code, name, description, authority_type, required_documents, typical_processing_days, validity_period_months, is_renewable, display_order)
VALUES
  ('DEV_PERMIT', 'Development Permit', 'Permission to develop land for specified purpose', 'assembly', 
   '["site_plan", "land_documents", "development_proposal"]'::jsonb, 90, 24, true, 1),
  
  ('BUILD_PERMIT', 'Building Permit', 'Permission to commence construction', 'assembly',
   '["approved_site_plan", "architectural_drawings", "structural_drawings", "mep_drawings"]'::jsonb, 60, 24, true, 2),
   
  ('COMMENCE_PERMIT', 'Commencement Permit', 'Permission to start physical construction work', 'assembly',
   '["approved_building_permit", "contractor_registration"]'::jsonb, 14, 12, false, 3),
   
  ('EPA_PERMIT', 'Environmental Permit', 'EPA clearance for projects over 40 units or 5000sqm', 'epa',
   '["eia_report", "site_plan", "environmental_management_plan"]'::jsonb, 120, 60, true, 4),
   
  ('FIRE_CERT', 'Fire Safety Certificate', 'Ghana National Fire Service safety clearance', 'fire_service',
   '["building_plans", "fire_safety_plan", "evacuation_plan"]'::jsonb, 30, 12, true, 5),
   
  ('GWCL_CONNECT', 'Water Connection Approval', 'GWCL approval for water connection', 'gwcl',
   '["approved_building_permit", "plumbing_drawings"]'::jsonb, 60, NULL, false, 6),
   
  ('ECG_CONNECT', 'Electricity Connection Approval', 'ECG approval for electricity connection', 'ecg',
   '["approved_building_permit", "electrical_drawings"]'::jsonb, 60, NULL, false, 7),
   
  ('HABITATION_CERT', 'Habitation Certificate', 'Certificate of completion and occupancy', 'assembly',
   '["completion_report", "fire_certificate", "as_built_drawings"]'::jsonb, 30, NULL, false, 8),
   
  ('LAND_TITLE', 'Land Title Registration', 'Lands Commission title registration', 'lands_commission',
   '["indenture", "site_plan", "search_report"]'::jsonb, 180, NULL, false, 9)
   
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  typical_processing_days = EXCLUDED.typical_processing_days,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- 5. Project Permits Tracking Table
-- ============================================================================
-- Track permits for each development project

CREATE TABLE IF NOT EXISTS project_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  permit_type_id UUID REFERENCES permit_types(id),
  
  -- Permit details
  permit_type_code VARCHAR(50) NOT NULL, -- Denormalized for easier queries
  permit_number VARCHAR(100),
  authority_name VARCHAR(200), -- The specific assembly/office that issued it
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'not_started',
  -- 'not_started', 'documents_gathering', 'submitted', 'under_review', 
  -- 'additional_info_required', 'approved', 'rejected', 'expired', 'renewed'
  
  -- Timeline
  submitted_date DATE,
  expected_approval_date DATE,
  approval_date DATE,
  expiration_date DATE,
  
  -- Fees
  fee_amount NUMERIC(15, 2),
  fee_paid BOOLEAN DEFAULT false,
  fee_paid_date DATE,
  fee_receipt_url TEXT,
  
  -- Documents
  submitted_documents JSONB DEFAULT '[]'::jsonb,
  -- Array of { "name": "", "url": "", "uploaded_at": "" }
  
  approval_document_url TEXT,
  
  -- Notes and issues
  notes TEXT,
  rejection_reason TEXT,
  additional_info_requested TEXT,
  
  -- Renewal tracking
  renewal_reminder_sent BOOLEAN DEFAULT false,
  renewal_reminder_date DATE,
  previous_permit_id UUID REFERENCES project_permits(id),
  
  -- Audit
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for project permits
CREATE INDEX IF NOT EXISTS idx_project_permits_project 
  ON project_permits(project_id);
CREATE INDEX IF NOT EXISTS idx_project_permits_org 
  ON project_permits(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_permits_status 
  ON project_permits(status);
CREATE INDEX IF NOT EXISTS idx_project_permits_type 
  ON project_permits(permit_type_code);
CREATE INDEX IF NOT EXISTS idx_project_permits_expiration 
  ON project_permits(expiration_date) WHERE expiration_date IS NOT NULL;

-- ============================================================================
-- 6. Seed Major Assemblies in Greater Accra (Initial Data)
-- ============================================================================

INSERT INTO assembly_regulatory_contacts (
  assembly_name, assembly_type, region, 
  permit_office_phone, 
  avg_development_permit_days, avg_building_permit_days
) VALUES
  ('Accra Metropolitan Assembly', 'metropolitan', 'Greater Accra', '+233-302-666801', 90, 60),
  ('Tema Metropolitan Assembly', 'metropolitan', 'Greater Accra', '+233-303-206111', 75, 45),
  ('Ga East Municipal Assembly', 'municipal', 'Greater Accra', '+233-302-509066', 60, 45),
  ('Ga West Municipal Assembly', 'municipal', 'Greater Accra', '+233-302-316411', 60, 45),
  ('Ga South Municipal Assembly', 'municipal', 'Greater Accra', '+233-302-309124', 60, 45),
  ('La Dadekotopon Municipal Assembly', 'municipal', 'Greater Accra', '+233-302-764411', 60, 45),
  ('La Nkwantanang Madina Municipal Assembly', 'municipal', 'Greater Accra', '+233-302-507288', 60, 45),
  ('Adentan Municipal Assembly', 'municipal', 'Greater Accra', '+233-302-509090', 60, 45),
  ('Ashaiman Municipal Assembly', 'municipal', 'Greater Accra', '+233-303-302050', 60, 45),
  ('Kpone Katamanso District Assembly', 'district', 'Greater Accra', '+233-303-200000', 45, 30),
  ('Ningo Prampram District Assembly', 'district', 'Greater Accra', '+233-303-300000', 45, 30)
ON CONFLICT (assembly_name, region) DO NOTHING;

-- ============================================================================
-- 7. Add updated_at trigger function (if not exists)
-- ============================================================================

-- Only create the function if it doesn't already exist (avoid ownership issues)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        EXECUTE $func$
            CREATE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $trigger$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $trigger$ LANGUAGE plpgsql
        $func$;
    END IF;
END $$;

-- Apply triggers
DROP TRIGGER IF EXISTS update_traditional_authorities_updated_at ON traditional_authorities;
CREATE TRIGGER update_traditional_authorities_updated_at
  BEFORE UPDATE ON traditional_authorities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assembly_regulatory_contacts_updated_at ON assembly_regulatory_contacts;
CREATE TRIGGER update_assembly_regulatory_contacts_updated_at
  BEFORE UPDATE ON assembly_regulatory_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_permit_types_updated_at ON permit_types;
CREATE TRIGGER update_permit_types_updated_at
  BEFORE UPDATE ON permit_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_permits_updated_at ON project_permits;
CREATE TRIGGER update_project_permits_updated_at
  BEFORE UPDATE ON project_permits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE traditional_authorities IS 'Ghana traditional authorities (stools/skins) for customary land tracking';
COMMENT ON TABLE assembly_regulatory_contacts IS 'Ghana MMDA permit office and regulatory body contact information';
COMMENT ON TABLE permit_types IS 'Reference table of Ghana real estate development permit types';
COMMENT ON TABLE project_permits IS 'Tracking permits and approvals for development projects';
