-- Migration: 044_tenant_applications
-- Description: Tenant Application system with state machines for tenant onboarding workflow
-- Created: 2026-01-19
-- Phase: Tenant Portal Phase 1

-- =====================================================
-- APPLICATION STATUS ENUM
-- State machine: draft → submitted → under_review → approved/rejected → lease_generated
-- =====================================================
DO $$ BEGIN
  CREATE TYPE application_status_enum AS ENUM (
    'draft',
    'submitted', 
    'under_review',
    'approved',
    'rejected',
    'withdrawn',
    'lease_generated',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- APPLICATIONS TABLE
-- Tenant applications for properties
-- Note: properties table is partitioned, so we use a UUID column without FK constraint
-- =====================================================
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Core relationships
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL, -- References properties(id) but no FK due to partitioned table
  
  -- Applicant info (before they become a tenant)
  applicant_full_name VARCHAR(255) NOT NULL,
  applicant_email VARCHAR(255) NOT NULL,
  applicant_phone VARCHAR(50) NOT NULL,
  applicant_phone_secondary VARCHAR(50),
  applicant_date_of_birth DATE,
  applicant_ghana_card VARCHAR(50),
  applicant_current_address TEXT,
  applicant_digital_address VARCHAR(50),
  
  -- Employment info
  occupation VARCHAR(255),
  employer_name VARCHAR(255),
  employer_address TEXT,
  employer_phone VARCHAR(50),
  monthly_income DECIMAL(15, 2),
  employment_duration_months INTEGER,
  
  -- Emergency contact
  emergency_contact_name VARCHAR(255),
  emergency_contact_relationship VARCHAR(100),
  emergency_contact_phone VARCHAR(50),
  
  -- Lease preferences
  desired_move_in_date DATE,
  desired_lease_term_months INTEGER DEFAULT 12,
  number_of_occupants INTEGER DEFAULT 1,
  has_pets BOOLEAN DEFAULT FALSE,
  pet_details TEXT,
  
  -- Additional info
  reason_for_moving TEXT,
  special_requirements TEXT,
  how_did_you_hear VARCHAR(255),
  
  -- References (stored as JSONB for flexibility)
  character_references JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"name": "John Doe", "phone": "0241234567", "relationship": "Employer"}]
  
  previous_addresses JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"address": "123 Main St", "landlord_name": "Jane", "landlord_phone": "0241234567", "duration": "2 years", "reason_for_leaving": "Relocation"}]
  
  -- Document uploads (references to MinIO)
  uploaded_documents JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"type": "ghana_card", "url": "...", "uploaded_at": "..."}]
  
  -- Application link tracking
  application_token VARCHAR(255) UNIQUE,
  application_token_expires_at TIMESTAMPTZ,
  
  -- Status and workflow
  status application_status_enum NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Approval/Rejection details
  approval_notes TEXT,
  rejection_reason TEXT,
  
  -- Resulting tenant (created after approval)
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  tenancy_id UUID REFERENCES tenancies(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ, -- Application link expiration
  
  -- Soft delete
  deleted_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_applications_org ON applications(organization_id);
CREATE INDEX IF NOT EXISTS idx_applications_property ON applications(property_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(applicant_email);
CREATE INDEX IF NOT EXISTS idx_applications_token ON applications(application_token) WHERE application_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_submitted ON applications(submitted_at) WHERE submitted_at IS NOT NULL;

-- =====================================================
-- APPLICATION STATUS HISTORY TABLE
-- Audit trail for all status changes
-- =====================================================
CREATE TABLE IF NOT EXISTS application_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  
  -- Status transition
  from_status application_status_enum,
  to_status application_status_enum NOT NULL,
  
  -- Who made the change
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_by_type VARCHAR(50) DEFAULT 'user', -- 'user', 'system', 'tenant'
  
  -- Additional context
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamp
  changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_status_history_app ON application_status_history(application_id);
CREATE INDEX IF NOT EXISTS idx_app_status_history_changed ON application_status_history(changed_at);

-- =====================================================
-- APPLICATION LINKS TABLE
-- Pre-generated links for properties
-- Note: properties table is partitioned, so we use a UUID column without FK constraint
-- =====================================================
CREATE TABLE IF NOT EXISTS application_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL, -- References properties(id) but no FK due to partitioned table
  
  -- Link token
  token VARCHAR(255) UNIQUE NOT NULL,
  
  -- Configuration
  application_type VARCHAR(50) DEFAULT 'standard', -- 'standard', 'express', 'premium'
  max_uses INTEGER, -- NULL = unlimited
  current_uses INTEGER DEFAULT 0,
  
  -- Validity
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Created by
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Deactivation
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_app_links_property ON application_links(property_id);
CREATE INDEX IF NOT EXISTS idx_app_links_token ON application_links(token);
CREATE INDEX IF NOT EXISTS idx_app_links_active ON application_links(is_active, expires_at) WHERE is_active = TRUE;

-- =====================================================
-- LEASE STATUS ENUM (if not exists)
-- State machine: generated → sent_to_tenant → tenant_signed → countersigned → active
-- =====================================================
DO $$ BEGIN
  CREATE TYPE lease_status_enum AS ENUM (
    'draft',
    'generated',
    'sent_to_tenant',
    'tenant_signed',
    'countersigned',
    'active',
    'expired',
    'terminated',
    'voided'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- UPDATE TENANCIES TABLE WITH LEASE STATUS
-- =====================================================
DO $$ BEGIN
  ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS lease_status lease_status_enum DEFAULT 'draft';
  ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS lease_document_url TEXT;
  ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS lease_signed_url TEXT;
  ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS lease_sent_at TIMESTAMPTZ;
  ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS tenant_signed_at TIMESTAMPTZ;
  ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS landlord_signed_at TIMESTAMPTZ;
  ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES applications(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- =====================================================
-- SIGNATURES TABLE ENHANCEMENT
-- Link signatures to applications and tenancies
-- =====================================================
CREATE TABLE IF NOT EXISTS signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What is being signed
  document_type VARCHAR(100) NOT NULL, -- 'lease', 'application', 'maintenance_approval'
  document_id UUID NOT NULL, -- Reference to the document
  
  -- Entity references
  signing_request_id UUID REFERENCES signing_requests(id) ON DELETE SET NULL,
  tenancy_id UUID REFERENCES tenancies(id) ON DELETE SET NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  
  -- Signer info
  signer_type VARCHAR(50) NOT NULL, -- 'tenant', 'landlord', 'witness', 'manager'
  signer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  signer_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  signer_name VARCHAR(255) NOT NULL,
  signer_email VARCHAR(255),
  signer_phone VARCHAR(50),
  
  -- Signature data
  signature_data TEXT NOT NULL, -- Base64 encoded signature image
  signature_type VARCHAR(50) DEFAULT 'drawn', -- 'drawn', 'typed', 'uploaded'
  signature_font VARCHAR(100), -- For typed signatures
  
  -- Verification
  ip_address INET,
  user_agent TEXT,
  consent_text TEXT,
  consent_acknowledged BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  signed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_tenancy ON signatures(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_signatures_application ON signatures(application_id);
CREATE INDEX IF NOT EXISTS idx_signatures_signer ON signatures(signer_user_id);

-- =====================================================
-- TRIGGER: Update updated_at on applications
-- =====================================================
CREATE OR REPLACE FUNCTION update_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_applications_updated_at ON applications;
CREATE TRIGGER trigger_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_applications_updated_at();

-- =====================================================
-- TRIGGER: Log status changes to history
-- =====================================================
CREATE OR REPLACE FUNCTION log_application_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO application_status_history (
      application_id,
      from_status,
      to_status,
      changed_by,
      changed_by_type,
      reason
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      COALESCE(NEW.reviewed_by, current_setting('app.current_user_id', true)::uuid),
      'user',
      CASE 
        WHEN NEW.status = 'rejected' THEN NEW.rejection_reason
        WHEN NEW.status = 'approved' THEN NEW.approval_notes
        ELSE NULL
      END
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_application_status_history ON applications;
CREATE TRIGGER trigger_application_status_history
  AFTER UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION log_application_status_change();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE applications IS 'Tenant applications for properties with full workflow state machine';
COMMENT ON TABLE application_status_history IS 'Audit trail for application status changes';
COMMENT ON TABLE application_links IS 'Pre-generated application links for properties';
COMMENT ON TABLE signatures IS 'Digital signatures for leases and other documents';
