-- ============================================================================
-- Migration 101: Ghana Compliance Requirements
-- 
-- Phase 4.1: Full Ghana Regulatory Compliance
-- 
-- This migration creates tables for:
-- 1. Compliance requirements tracking (EPA, Lands Commission, GRA, SSNIT, etc.)
-- 2. TIN validation cache
-- 3. SSNIT employer records
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------

-- Ghana regions (16 regions)
DO $$ BEGIN
    CREATE TYPE ghana_region AS ENUM (
        'greater_accra',
        'ashanti',
        'western',
        'central',
        'eastern',
        'volta',
        'oti',
        'northern',
        'savannah',
        'north_east',
        'upper_east',
        'upper_west',
        'bono',
        'bono_east',
        'ahafo',
        'western_north'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ghana regulatory bodies
DO $$ BEGIN
    CREATE TYPE ghana_regulatory_body AS ENUM (
        'epa',              -- Environmental Protection Agency
        'lands_commission', -- Lands Commission
        'gra',              -- Ghana Revenue Authority
        'ssnit',            -- Social Security
        'fire_service',     -- Ghana Fire Service
        'metro_assembly',   -- Metropolitan/Municipal/District Assembly
        'gipc',             -- Ghana Investment Promotion Centre
        'water_company',    -- Ghana Water Company Limited
        'ecg',              -- Electricity Company of Ghana
        'surveyor_general'  -- Survey and Mapping Division
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Permit types
DO $$ BEGIN
    CREATE TYPE ghana_permit_type AS ENUM (
        'environmental_permit',
        'eia',
        'land_title',
        'indenture',
        'site_plan',
        'survey_plan',
        'building_permit',
        'development_permit',
        'occupancy_certificate',
        'fire_safety_certificate',
        'tin_registration',
        'vat_registration',
        'ssnit_registration',
        'ssnit_clearance',
        'water_connection',
        'electricity_connection',
        'gipc_registration'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Compliance status
DO $$ BEGIN
    CREATE TYPE compliance_req_status AS ENUM (
        'not_started',
        'pending',
        'in_review',
        'approved',
        'rejected',
        'expired',
        'blocked',
        'completed',
        'overdue',
        'waived'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. COMPLIANCE REQUIREMENTS TABLE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pm_compliance_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Requirement details
    regulatory_body ghana_regulatory_body NOT NULL,
    permit_type ghana_permit_type NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Status
    status compliance_req_status DEFAULT 'not_started',
    
    -- Reference numbers
    application_number VARCHAR(100),
    permit_number VARCHAR(100),
    certificate_number VARCHAR(100),
    
    -- Dates
    application_date DATE,
    issued_date DATE,
    expiry_date DATE,
    renewal_due_date DATE,
    
    -- Fees (Ghana Cedis)
    application_fee DECIMAL(12, 2),
    issuance_fee DECIMAL(12, 2),
    renewal_fee DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'GHS',
    fee_paid BOOLEAN DEFAULT false,
    
    -- Documents
    application_document_url TEXT,
    permit_document_url TEXT,
    supporting_documents JSONB DEFAULT '[]'::jsonb,
    
    -- Location specific
    region ghana_region,
    district VARCHAR(100),
    
    -- Notes
    notes TEXT,
    rejection_reason TEXT,
    
    -- Responsible party
    assigned_to UUID,
    last_updated_by UUID,
    
    -- Dependencies
    depends_on JSONB DEFAULT '[]'::jsonb,  -- Array of permit types this depends on
    blocked_by JSONB DEFAULT '[]'::jsonb,  -- Array of permit types blocking this
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one requirement per permit type per project
    CONSTRAINT unique_project_permit_type UNIQUE (project_id, permit_type)
);

-- ----------------------------------------------------------------------------
-- 3. TIN VALIDATION CACHE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pm_tin_validation_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tin_number VARCHAR(20) NOT NULL UNIQUE,
    
    -- Validation result
    is_valid BOOLEAN NOT NULL,
    registered_name VARCHAR(255),
    business_type VARCHAR(100),
    registration_date DATE,
    status VARCHAR(20), -- 'active', 'inactive', 'suspended'
    
    -- Validation metadata
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validation_source VARCHAR(50) DEFAULT 'gra_api',
    raw_response JSONB,
    error_message TEXT,
    
    -- Cache management
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. SSNIT EMPLOYER RECORDS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pm_ssnit_employers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES development_projects(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL,
    
    -- SSNIT details
    employer_number VARCHAR(50) NOT NULL UNIQUE,
    employer_name VARCHAR(255) NOT NULL,
    registration_date DATE,
    
    -- Compliance status
    is_compliant BOOLEAN DEFAULT false,
    last_payment_date DATE,
    arrears_amount DECIMAL(12, 2) DEFAULT 0,
    
    -- Employees
    total_employees INTEGER DEFAULT 0,
    monthly_contribution DECIMAL(12, 2) DEFAULT 0,
    
    -- Verification
    last_verified_at TIMESTAMP WITH TIME ZONE,
    verification_document_url TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. COMPLIANCE AUDIT LOG
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pm_compliance_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id UUID REFERENCES pm_compliance_requirements(id) ON DELETE CASCADE,
    project_id UUID NOT NULL,
    
    -- Action details
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'status_changed', 'document_uploaded', etc.
    old_status compliance_req_status,
    new_status compliance_req_status,
    
    -- Changes
    changes JSONB,
    
    -- Actor
    performed_by UUID,
    performed_by_name VARCHAR(255),
    
    -- Metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. INDEXES
-- ----------------------------------------------------------------------------

-- Compliance requirements
CREATE INDEX IF NOT EXISTS idx_compliance_req_project ON pm_compliance_requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_compliance_req_org ON pm_compliance_requirements(organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_req_status ON pm_compliance_requirements(status);
CREATE INDEX IF NOT EXISTS idx_compliance_req_body ON pm_compliance_requirements(regulatory_body);
CREATE INDEX IF NOT EXISTS idx_compliance_req_permit_type ON pm_compliance_requirements(permit_type);
CREATE INDEX IF NOT EXISTS idx_compliance_req_expiry ON pm_compliance_requirements(expiry_date);
CREATE INDEX IF NOT EXISTS idx_compliance_req_renewal ON pm_compliance_requirements(renewal_due_date);

-- TIN cache
CREATE INDEX IF NOT EXISTS idx_tin_cache_expires ON pm_tin_validation_cache(expires_at);

-- SSNIT
CREATE INDEX IF NOT EXISTS idx_ssnit_project ON pm_ssnit_employers(project_id);
CREATE INDEX IF NOT EXISTS idx_ssnit_org ON pm_ssnit_employers(organization_id);

-- Audit log
CREATE INDEX IF NOT EXISTS idx_compliance_audit_req ON pm_compliance_audit_log(requirement_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_project ON pm_compliance_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_created ON pm_compliance_audit_log(created_at);

-- ----------------------------------------------------------------------------
-- 7. TRIGGER FOR AUDIT LOG
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_compliance_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO pm_compliance_audit_log (
            requirement_id, project_id, action, 
            old_status, new_status, 
            changes, performed_by
        ) VALUES (
            NEW.id, NEW.project_id, 'status_changed',
            OLD.status, NEW.status,
            jsonb_build_object(
                'old', to_jsonb(OLD),
                'new', to_jsonb(NEW)
            ),
            NEW.last_updated_by
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compliance_audit ON pm_compliance_requirements;
CREATE TRIGGER trg_compliance_audit
    AFTER UPDATE ON pm_compliance_requirements
    FOR EACH ROW EXECUTE FUNCTION log_compliance_changes();

-- ----------------------------------------------------------------------------
-- 8. COMMENTS
-- ----------------------------------------------------------------------------

COMMENT ON TABLE pm_compliance_requirements IS 
    'Ghana regulatory compliance requirements tracking for development projects';

COMMENT ON TABLE pm_tin_validation_cache IS 
    'Cache for GRA TIN validation results to reduce API calls';

COMMENT ON TABLE pm_ssnit_employers IS 
    'SSNIT employer registration and compliance tracking';

COMMENT ON TABLE pm_compliance_audit_log IS 
    'Audit trail for all compliance requirement changes';
