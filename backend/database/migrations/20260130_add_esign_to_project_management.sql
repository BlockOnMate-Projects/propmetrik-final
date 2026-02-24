-- Phase 5: Project Management E-Sign Integration
-- Migration: 20260130_add_esign_to_project_management.sql
-- 
-- Adds e-sign support to:
-- 1. Change Orders - multi-party approval signatures
-- 2. Contractor Assignments - contract signing workflow
-- 3. Draw Requests - lender/owner approval signatures

BEGIN;

-- ============================================================================
-- 1. Change Orders E-Sign Fields
-- ============================================================================

-- Add e-sign tracking columns to change_orders table
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS esign_envelope_id UUID;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS esign_status VARCHAR(50);
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS esign_triggered_at TIMESTAMPTZ;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS esign_completed_at TIMESTAMPTZ;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS signed_document_url TEXT;

-- E-sign configuration for change orders (org-level)
CREATE TABLE IF NOT EXISTS change_order_esign_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- When to trigger e-sign
    trigger_on_approval BOOLEAN DEFAULT TRUE,
    min_amount_threshold NUMERIC(15,2) DEFAULT 0,  -- Only require e-sign above this amount
    
    -- Signer configuration
    signer_roles JSONB DEFAULT '["project_manager", "owner_representative", "contractor"]'::jsonb,
    
    -- Field placements template (page/position for each role)
    field_placements JSONB DEFAULT '[]'::jsonb,
    
    -- Auto-execute after all signatures
    auto_execute_on_complete BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uq_co_esign_config_org UNIQUE(organization_id)
);

-- ============================================================================
-- 2. Contractor Assignments E-Sign Fields
-- ============================================================================

-- Add e-sign tracking to contractor assignments
ALTER TABLE project_contractor_assignments ADD COLUMN IF NOT EXISTS esign_envelope_id UUID;
ALTER TABLE project_contractor_assignments ADD COLUMN IF NOT EXISTS esign_status VARCHAR(50);
ALTER TABLE project_contractor_assignments ADD COLUMN IF NOT EXISTS esign_triggered_at TIMESTAMPTZ;
ALTER TABLE project_contractor_assignments ADD COLUMN IF NOT EXISTS esign_completed_at TIMESTAMPTZ;
ALTER TABLE project_contractor_assignments ADD COLUMN IF NOT EXISTS signed_contract_url TEXT;
ALTER TABLE project_contractor_assignments ADD COLUMN IF NOT EXISTS contract_status VARCHAR(50) DEFAULT 'draft';

-- Contractor contract e-sign configuration
CREATE TABLE IF NOT EXISTS contractor_contract_esign_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Auto-trigger on assignment creation
    auto_trigger_on_assignment BOOLEAN DEFAULT FALSE,
    
    -- Signer configuration  
    signer_roles JSONB DEFAULT '["project_owner", "contractor_representative"]'::jsonb,
    
    -- Field placements
    field_placements JSONB DEFAULT '[]'::jsonb,
    
    -- Template to use for contracts
    default_contract_template_id UUID,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uq_contractor_esign_config_org UNIQUE(organization_id)
);

-- ============================================================================
-- 3. Draw Requests E-Sign Fields
-- ============================================================================

-- Add e-sign tracking to draw requests
ALTER TABLE draw_requests ADD COLUMN IF NOT EXISTS esign_envelope_id UUID;
ALTER TABLE draw_requests ADD COLUMN IF NOT EXISTS esign_status VARCHAR(50);
ALTER TABLE draw_requests ADD COLUMN IF NOT EXISTS esign_triggered_at TIMESTAMPTZ;
ALTER TABLE draw_requests ADD COLUMN IF NOT EXISTS esign_completed_at TIMESTAMPTZ;
ALTER TABLE draw_requests ADD COLUMN IF NOT EXISTS signed_draw_url TEXT;

-- Draw request e-sign configuration
CREATE TABLE IF NOT EXISTS draw_request_esign_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Trigger on approval
    trigger_on_approval BOOLEAN DEFAULT TRUE,
    min_amount_threshold NUMERIC(15,2) DEFAULT 0,
    
    -- Signer configuration (lender, owner, GC typically sign draws)
    signer_roles JSONB DEFAULT '["project_owner", "general_contractor", "lender_representative"]'::jsonb,
    
    -- Field placements
    field_placements JSONB DEFAULT '[]'::jsonb,
    
    -- Auto-fund after signatures
    auto_fund_on_complete BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uq_draw_esign_config_org UNIQUE(organization_id)
);

-- ============================================================================
-- 4. Project Management E-Sign Audit Trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_esign_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Entity reference
    entity_type VARCHAR(50) NOT NULL,  -- change_order, contractor_contract, draw_request
    entity_id UUID NOT NULL,
    
    -- Envelope reference
    esign_envelope_id UUID NOT NULL,
    
    -- Action tracking
    action VARCHAR(50) NOT NULL,  -- created, sent, signed, completed, voided, expired
    performed_by UUID,  -- User who triggered or signed (null for system actions)
    performed_by_name VARCHAR(255),
    signer_email VARCHAR(255),  -- For signing events
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_esign_audit_entity 
    ON project_esign_audit(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_project_esign_audit_envelope 
    ON project_esign_audit(esign_envelope_id);
CREATE INDEX IF NOT EXISTS idx_project_esign_audit_org_date 
    ON project_esign_audit(organization_id, created_at DESC);

-- ============================================================================
-- 5. Signer Role Configuration for Projects
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_signer_role_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    role_key VARCHAR(50) NOT NULL,  -- project_manager, owner_representative, contractor, lender, etc.
    role_display_name VARCHAR(100) NOT NULL,
    
    -- How to resolve the signer
    resolution_type VARCHAR(50) NOT NULL,  -- 'project_team', 'contractor', 'external', 'manual'
    resolution_config JSONB DEFAULT '{}'::jsonb,  -- team_role, contact_type, etc.
    
    is_active BOOLEAN DEFAULT TRUE,
    signing_order INT DEFAULT 1,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uq_project_signer_role UNIQUE(organization_id, role_key)
);

-- Insert default signer roles for project management
CREATE OR REPLACE FUNCTION create_default_project_signer_roles(org_id UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO project_signer_role_config (organization_id, role_key, role_display_name, resolution_type, resolution_config, signing_order)
    VALUES
        (org_id, 'project_manager', 'Project Manager', 'project_team', '{"team_role": "project_manager"}', 1),
        (org_id, 'owner_representative', 'Owner Representative', 'project_team', '{"team_role": "owner_representative"}', 2),
        (org_id, 'contractor', 'Contractor', 'contractor', '{"use_assignment_contractor": true}', 3),
        (org_id, 'general_contractor', 'General Contractor', 'project_team', '{"team_role": "general_contractor"}', 2),
        (org_id, 'lender_representative', 'Lender Representative', 'external', '{"contact_type": "lender"}', 3),
        (org_id, 'superintendent', 'Superintendent', 'project_team', '{"team_role": "superintendent"}', 4)
    ON CONFLICT (organization_id, role_key) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_change_orders_esign_envelope 
    ON change_orders(esign_envelope_id) WHERE esign_envelope_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_change_orders_esign_status 
    ON change_orders(esign_status) WHERE esign_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contractor_assignments_esign_envelope 
    ON project_contractor_assignments(esign_envelope_id) WHERE esign_envelope_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contractor_assignments_contract_status 
    ON project_contractor_assignments(contract_status);

CREATE INDEX IF NOT EXISTS idx_draw_requests_esign_envelope 
    ON draw_requests(esign_envelope_id) WHERE esign_envelope_id IS NOT NULL;

COMMIT;
