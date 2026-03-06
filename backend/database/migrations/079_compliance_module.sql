-- Migration: 079_compliance_module.sql
-- Phase 3: Compliance & Document Management - Sprint 5
-- Ghana-specific regulatory compliance tracking

-- ============================================================================
-- PERMIT TYPES ENUM (Ghana-specific)
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE permit_type AS ENUM (
    'development_permit',        -- Town & Country Planning
    'building_permit',           -- Metropolitan/Municipal Assembly
    'environmental_permit',      -- EPA Ghana
    'fire_safety_certificate',   -- Ghana Fire Service
    'water_connection',          -- Ghana Water Company
    'electricity_connection',    -- ECG/VRA
    'land_title',                -- Lands Commission
    'site_plan_approval',        -- Survey Department
    'occupancy_certificate',     -- Building Inspectorate
    'commencement_permit',       -- Assembly approval to start
    'structural_approval',       -- Structural engineer certification
    'drainage_permit',           -- Hydrological Services
    'road_access_permit',        -- Highways Authority
    'heritage_clearance',        -- National Museum/Heritage
    'aviation_clearance',        -- Ghana Civil Aviation (height restrictions)
    'telecom_permit',            -- NCA for towers
    'mining_permit',             -- Minerals Commission (if applicable)
    'forestry_clearance',        -- Forestry Commission
    'customs_exemption',         -- For imported materials
    'traditional_consent',       -- Stool/Skin lands consent
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE permit_status AS ENUM (
    'not_started',
    'draft',
    'applied',
    'under_review',
    'additional_info_required',
    'conditionally_approved',
    'approved',
    'rejected',
    'expired',
    'suspended',
    'renewed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inspection_result AS ENUM (
    'passed',
    'failed',
    'pending_corrections',
    'partial_pass',
    'rescheduled',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PROJECT PERMITS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  
  -- Permit details
  permit_type VARCHAR(100) NOT NULL,
  permit_number VARCHAR(100),
  authority VARCHAR(200) NOT NULL,
  authority_contact_name VARCHAR(200),
  authority_contact_phone VARCHAR(50),
  authority_contact_email VARCHAR(200),
  authority_office_address TEXT,
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'not_started',
  
  -- Dates
  application_date DATE,
  submission_date DATE,
  expected_approval_date DATE,
  approval_date DATE,
  expiration_date DATE,
  renewal_date DATE,
  
  -- Reminders
  renewal_reminder_days INTEGER DEFAULT 30,
  reminder_sent_at TIMESTAMP,
  
  -- Financial
  fees JSONB DEFAULT '[]'::jsonb,
  -- Format: [{ "description": "Application Fee", "amount": 5000, "currency": "GHS", "paid": true, "paid_date": "2024-01-15", "receipt_number": "RC-123" }]
  total_fees_paid DECIMAL(15, 2) DEFAULT 0,
  
  -- Documents
  documents JSONB DEFAULT '[]'::jsonb,
  -- Format: [{ "id": "uuid", "name": "EPA Application Form", "url": "...", "uploaded_at": "..." }]
  
  -- Notes and conditions
  notes TEXT,
  conditions TEXT[], -- Array of approval conditions
  rejection_reason TEXT,
  
  -- Priority and tracking
  priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'critical'
  is_blocking BOOLEAN DEFAULT false, -- If true, blocks project progress
  blocking_phase_id UUID, -- Phase that cannot proceed without this permit
  
  -- Audit
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- ============================================================================
-- PERMIT INSPECTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS permit_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id UUID NOT NULL REFERENCES project_permits(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  
  -- Inspector details
  inspector_name VARCHAR(200),
  inspector_title VARCHAR(100),
  inspector_contact VARCHAR(100),
  inspector_organization VARCHAR(200),
  
  -- Inspection details
  inspection_type VARCHAR(100), -- 'initial', 'follow_up', 'final', 'routine'
  scheduled_date DATE,
  inspection_date DATE,
  result VARCHAR(50),
  
  -- Findings
  findings TEXT,
  deficiencies JSONB DEFAULT '[]'::jsonb,
  -- Format: [{ "code": "D001", "description": "Missing fire extinguisher", "severity": "minor", "deadline": "2024-02-01", "resolved": false }]
  recommendations TEXT[],
  
  -- Follow-up
  requires_reinspection BOOLEAN DEFAULT false,
  next_inspection_date DATE,
  reinspection_fee DECIMAL(10, 2),
  
  -- Attachments
  attachments JSONB DEFAULT '[]'::jsonb,
  
  -- Signature
  inspector_signature_url TEXT,
  signed_at TIMESTAMP,
  
  -- Audit
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- REGULATORY TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS regulatory_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Location specificity
  region VARCHAR(100), -- Ghana region
  assembly_name VARCHAR(200),
  assembly_type VARCHAR(50), -- 'metropolitan', 'municipal', 'district'
  
  -- Project specificity
  project_type VARCHAR(100), -- residential, commercial, industrial, etc.
  project_scale VARCHAR(50), -- 'small', 'medium', 'large', 'mega'
  
  -- Required permits
  required_permits JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Format: [{ "type": "development_permit", "authority": "Town & Country Planning", "typical_days": 90, "required": true, "order": 1 }]
  
  -- Timeline
  typical_timeline_days INTEGER,
  
  -- Fees estimate
  fees_estimate JSONB DEFAULT '{}'::jsonb,
  -- Format: { "total_min": 50000, "total_max": 150000, "currency": "GHS", "breakdown": [...] }
  
  -- Process notes
  process_notes TEXT,
  tips TEXT[],
  common_issues TEXT[],
  
  -- Contacts
  key_contacts JSONB DEFAULT '[]'::jsonb,
  -- Format: [{ "role": "Planning Officer", "name": "...", "phone": "...", "email": "..." }]
  
  -- Validity
  is_active BOOLEAN DEFAULT true,
  effective_from DATE,
  effective_until DATE,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- COMPLIANCE SCORES TABLE (for historical tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_compliance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  
  -- Scores (0-100)
  overall_score INTEGER NOT NULL,
  permit_score INTEGER,
  inspection_score INTEGER,
  document_score INTEGER,
  timeline_score INTEGER,
  
  -- Breakdown
  score_details JSONB DEFAULT '{}'::jsonb,
  -- Format: { "permits": { "total": 10, "approved": 7, "expired": 1 }, ... }
  
  -- Gaps identified
  compliance_gaps JSONB DEFAULT '[]'::jsonb,
  -- Format: [{ "type": "missing_permit", "description": "EPA permit not applied", "severity": "high", "recommendation": "..." }]
  
  -- Snapshot date
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- GHANA-SPECIFIC REGULATORY AUTHORITIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS ghana_regulatory_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name VARCHAR(200) NOT NULL,
  abbreviation VARCHAR(20),
  authority_type VARCHAR(100), -- 'national', 'regional', 'district'
  
  -- Jurisdiction
  jurisdiction_level VARCHAR(50), -- 'national', 'regional', 'local'
  regions TEXT[], -- Regions covered (null = all)
  
  -- Permit types handled
  permit_types TEXT[],
  
  -- Contact
  headquarters_address TEXT,
  phone VARCHAR(50),
  email VARCHAR(200),
  website VARCHAR(300),
  
  -- Regional offices
  regional_offices JSONB DEFAULT '[]'::jsonb,
  
  -- Operating hours
  operating_hours VARCHAR(200),
  
  -- Process info
  average_processing_days INTEGER,
  online_portal_url VARCHAR(300),
  has_online_application BOOLEAN DEFAULT false,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_permits_project ON project_permits(project_id);
CREATE INDEX IF NOT EXISTS idx_permits_org ON project_permits(organization_id);
CREATE INDEX IF NOT EXISTS idx_permits_status ON project_permits(status);
CREATE INDEX IF NOT EXISTS idx_permits_type ON project_permits(permit_type_code);
CREATE INDEX IF NOT EXISTS idx_permits_expiration ON project_permits(expiration_date) 
  WHERE expiration_date IS NOT NULL;
-- idx_permits_blocking removed - is_blocking column may not exist

CREATE INDEX IF NOT EXISTS idx_inspections_permit ON permit_inspections(permit_id);
CREATE INDEX IF NOT EXISTS idx_inspections_date ON permit_inspections(inspection_date);
CREATE INDEX IF NOT EXISTS idx_inspections_result ON permit_inspections(result);

CREATE INDEX IF NOT EXISTS idx_reg_templates_location ON regulatory_templates(region, assembly_name);
CREATE INDEX IF NOT EXISTS idx_reg_templates_project ON regulatory_templates(project_type, project_scale);

CREATE INDEX IF NOT EXISTS idx_compliance_scores_project ON project_compliance_scores(project_id);
CREATE INDEX IF NOT EXISTS idx_compliance_scores_date ON project_compliance_scores(calculated_at);

-- ============================================================================
-- SEED GHANA REGULATORY AUTHORITIES
-- ============================================================================
INSERT INTO ghana_regulatory_authorities (name, abbreviation, authority_type, jurisdiction_level, permit_types, phone, email, website, has_online_application)
VALUES
  ('Environmental Protection Agency', 'EPA', 'environmental', 'national', 
   ARRAY['environmental_permit'], '+233-302-664697', 'info@epa.gov.gh', 'https://epa.gov.gh', true),
  
  ('Lands Commission', 'LC', 'land', 'national', 
   ARRAY['land_title', 'site_plan_approval'], '+233-302-662700', 'info@lc.gov.gh', 'https://lc.gov.gh', true),
  
  ('Ghana National Fire Service', 'GNFS', 'safety', 'national', 
   ARRAY['fire_safety_certificate'], '+233-302-772446', 'info@gnfs.gov.gh', 'https://gnfs.gov.gh', false),
  
  ('Town and Country Planning Department', 'TCPD', 'planning', 'national', 
   ARRAY['development_permit', 'building_permit'], '+233-302-666476', 'info@tcpd.gov.gh', 'https://tcpd.gov.gh', false),
  
  ('Ghana Water Company Limited', 'GWCL', 'utility', 'national', 
   ARRAY['water_connection'], '+233-302-666781', 'info@gwcl.com.gh', 'https://gwcl.com.gh', false),
  
  ('Electricity Company of Ghana', 'ECG', 'utility', 'national', 
   ARRAY['electricity_connection'], '+233-302-676727', 'info@ecggh.com', 'https://ecggh.com', true),
  
  ('Ghana Highways Authority', 'GHA', 'infrastructure', 'national', 
   ARRAY['road_access_permit'], '+233-302-666467', 'info@highways.gov.gh', 'https://highways.gov.gh', false),
  
  ('Ghana Civil Aviation Authority', 'GCAA', 'aviation', 'national', 
   ARRAY['aviation_clearance'], '+233-302-776171', 'info@gcaa.com.gh', 'https://gcaa.com.gh', false),
  
  ('Forestry Commission', 'FC', 'environmental', 'national', 
   ARRAY['forestry_clearance'], '+233-302-401210', 'info@fcghana.org', 'https://fcghana.org', false)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SEED REGULATORY TEMPLATES FOR GREATER ACCRA
-- ============================================================================
INSERT INTO regulatory_templates (
  region, assembly_name, assembly_type, project_type, project_scale,
  required_permits, typical_timeline_days, fees_estimate, process_notes
)
VALUES
  (
    'Greater Accra', 'Accra Metropolitan Assembly', 'metropolitan', 'residential_multi', 'medium',
    '[
      {"type": "development_permit", "authority": "Town & Country Planning", "typical_days": 90, "required": true, "order": 1, "fee_range": "3000-10000 GHS"},
      {"type": "building_permit", "authority": "AMA Building Inspectorate", "typical_days": 60, "required": true, "order": 2, "fee_range": "5000-20000 GHS"},
      {"type": "environmental_permit", "authority": "EPA Ghana", "typical_days": 120, "required": true, "order": 3, "fee_range": "10000-50000 GHS"},
      {"type": "fire_safety_certificate", "authority": "Ghana Fire Service", "typical_days": 30, "required": true, "order": 4, "fee_range": "2000-5000 GHS"},
      {"type": "water_connection", "authority": "Ghana Water Company", "typical_days": 45, "required": true, "order": 5, "fee_range": "1000-3000 GHS"},
      {"type": "electricity_connection", "authority": "ECG", "typical_days": 45, "required": true, "order": 6, "fee_range": "2000-10000 GHS"}
    ]'::jsonb,
    360,
    '{"total_min": 25000, "total_max": 100000, "currency": "GHS"}'::jsonb,
    'Start with development permit from TCPD. EPA permit may be required for projects over 4 floors or in sensitive areas. Fire certificate required before occupancy.'
  ),
  (
    'Greater Accra', 'Accra Metropolitan Assembly', 'metropolitan', 'commercial', 'large',
    '[
      {"type": "development_permit", "authority": "Town & Country Planning", "typical_days": 120, "required": true, "order": 1},
      {"type": "environmental_permit", "authority": "EPA Ghana", "typical_days": 180, "required": true, "order": 2},
      {"type": "building_permit", "authority": "AMA Building Inspectorate", "typical_days": 90, "required": true, "order": 3},
      {"type": "structural_approval", "authority": "Ghana Institution of Engineers", "typical_days": 30, "required": true, "order": 4},
      {"type": "fire_safety_certificate", "authority": "Ghana Fire Service", "typical_days": 45, "required": true, "order": 5},
      {"type": "water_connection", "authority": "Ghana Water Company", "typical_days": 60, "required": true, "order": 6},
      {"type": "electricity_connection", "authority": "ECG", "typical_days": 60, "required": true, "order": 7},
      {"type": "road_access_permit", "authority": "Ghana Highways Authority", "typical_days": 90, "required": false, "order": 8}
    ]'::jsonb,
    540,
    '{"total_min": 100000, "total_max": 500000, "currency": "GHS"}'::jsonb,
    'Large commercial projects require full EIA from EPA. Highway permit needed if affecting public roads. Consider applying for permits in parallel where possible.'
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FUNCTION: Calculate compliance score
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_compliance_score(p_project_id UUID)
RETURNS TABLE (
  overall_score INTEGER,
  permit_score INTEGER,
  inspection_score INTEGER,
  gaps JSONB
) AS $$
DECLARE
  v_total_permits INTEGER;
  v_approved_permits INTEGER;
  v_expired_permits INTEGER;
  v_blocking_unapproved INTEGER;
  v_total_inspections INTEGER;
  v_passed_inspections INTEGER;
  v_permit_score INTEGER;
  v_inspection_score INTEGER;
  v_overall_score INTEGER;
  v_gaps JSONB := '[]'::jsonb;
BEGIN
  -- Count permits
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'approved'),
    COUNT(*) FILTER (WHERE status = 'expired'),
    COUNT(*) FILTER (WHERE is_blocking = true AND status NOT IN ('approved', 'renewed'))
  INTO v_total_permits, v_approved_permits, v_expired_permits, v_blocking_unapproved
  FROM project_permits
  WHERE project_id = p_project_id AND deleted_at IS NULL;
  
  -- Count inspections
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE result = 'passed')
  INTO v_total_inspections, v_passed_inspections
  FROM permit_inspections pi
  JOIN project_permits pp ON pi.permit_id = pp.id
  WHERE pp.project_id = p_project_id;
  
  -- Calculate permit score (0-100)
  IF v_total_permits = 0 THEN
    v_permit_score := 100; -- No permits required yet
  ELSE
    v_permit_score := ROUND((v_approved_permits::DECIMAL / v_total_permits) * 100);
    -- Penalty for expired permits
    v_permit_score := v_permit_score - (v_expired_permits * 10);
    -- Major penalty for blocking permits not approved
    v_permit_score := v_permit_score - (v_blocking_unapproved * 20);
    v_permit_score := GREATEST(0, v_permit_score);
  END IF;
  
  -- Calculate inspection score
  IF v_total_inspections = 0 THEN
    v_inspection_score := 100;
  ELSE
    v_inspection_score := ROUND((v_passed_inspections::DECIMAL / v_total_inspections) * 100);
  END IF;
  
  -- Overall score (weighted average)
  v_overall_score := ROUND(v_permit_score * 0.7 + v_inspection_score * 0.3);
  
  -- Build gaps array
  IF v_expired_permits > 0 THEN
    v_gaps := v_gaps || jsonb_build_object('type', 'expired_permits', 'count', v_expired_permits, 'severity', 'critical');
  END IF;
  IF v_blocking_unapproved > 0 THEN
    v_gaps := v_gaps || jsonb_build_object('type', 'blocking_unapproved', 'count', v_blocking_unapproved, 'severity', 'high');
  END IF;
  
  RETURN QUERY SELECT v_overall_score, v_permit_score, v_inspection_score, v_gaps;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Update timestamp on permit update
-- ============================================================================
CREATE OR REPLACE FUNCTION update_permit_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS permit_updated_at ON project_permits;
CREATE TRIGGER permit_updated_at
  BEFORE UPDATE ON project_permits
  FOR EACH ROW EXECUTE FUNCTION update_permit_timestamp();
