-- ============================================================================
-- Phase 2: Property Management E-Sign Integration
-- Migration: 20260130_add_esign_to_tenancies.sql
-- 
-- Adds e-sign envelope tracking and signature field configuration to tenancies
-- ============================================================================

-- Add e-sign envelope reference to tenancies
ALTER TABLE tenancies 
ADD COLUMN IF NOT EXISTS esign_envelope_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS esign_status VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS esign_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS esign_completed_at TIMESTAMPTZ;

-- Create index for envelope lookups
CREATE INDEX IF NOT EXISTS idx_tenancies_esign_envelope 
ON tenancies(esign_envelope_id)
WHERE esign_envelope_id IS NOT NULL;

-- ============================================================================
-- Lease Templates Table
-- Stores reusable lease document templates with Handlebars variables
-- ============================================================================

CREATE TABLE IF NOT EXISTS lease_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT NOT NULL, -- Handlebars/HTML template
    variables JSONB DEFAULT '[]'::jsonb, -- Extracted variable names
    category VARCHAR(50) DEFAULT 'residential', -- residential, commercial, short_term, custom
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lease_templates_org ON lease_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_lease_templates_category ON lease_templates(organization_id, category);

-- ============================================================================
-- Lease Documents Table
-- Tracks generated lease documents from templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS lease_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    template_id UUID REFERENCES lease_templates(id),
    document_key VARCHAR(500) NOT NULL, -- S3/MinIO key
    filename VARCHAR(255) NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    organization_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lease_documents_tenancy ON lease_documents(tenancy_id);

-- ============================================================================
-- Lease Template Signature Field Placements
-- Stores signature field positions for each lease template
-- ============================================================================

CREATE TABLE IF NOT EXISTS lease_template_signature_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES lease_templates(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    signer_role VARCHAR(50) NOT NULL, -- 'tenant', 'landlord', 'witness'
    field_type VARCHAR(20) NOT NULL DEFAULT 'signature', -- 'signature', 'initials', 'date', 'text'
    page_number INTEGER NOT NULL DEFAULT 1,
    x_position DECIMAL(5,4) NOT NULL, -- 0-1 percentage
    y_position DECIMAL(5,4) NOT NULL,
    width DECIMAL(5,4) NOT NULL DEFAULT 0.25,
    height DECIMAL(5,4) NOT NULL DEFAULT 0.08,
    required BOOLEAN DEFAULT TRUE,
    label VARCHAR(100),
    display_order INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lease_template_sig_fields_template 
ON lease_template_signature_fields(template_id);

-- Add comments for documentation
COMMENT ON TABLE lease_templates IS 'Reusable lease document templates with Handlebars variables';
COMMENT ON TABLE lease_documents IS 'Generated lease documents linked to tenancies';
COMMENT ON TABLE lease_template_signature_fields IS 'Signature field placement configuration for lease templates';
COMMENT ON COLUMN lease_template_signature_fields.signer_role IS 'Role of signer: tenant, landlord, witness, co_tenant';
COMMENT ON COLUMN lease_template_signature_fields.x_position IS 'Horizontal position as 0-1 percentage from left edge';
COMMENT ON COLUMN lease_template_signature_fields.y_position IS 'Vertical position as 0-1 percentage from top edge';
COMMENT ON COLUMN lease_template_signature_fields.page_number IS 'Page number for field placement. -1 means last page.';

-- ============================================================================
-- Helper function to insert default signature fields for a template
-- ============================================================================

CREATE OR REPLACE FUNCTION insert_default_signature_fields(p_template_id UUID, p_organization_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Tenant signature
    INSERT INTO lease_template_signature_fields 
        (template_id, organization_id, signer_role, field_type, page_number, x_position, y_position, width, height, required, label, display_order)
    VALUES 
        (p_template_id, p_organization_id, 'tenant', 'signature', -1, 0.10, 0.70, 0.30, 0.08, TRUE, 'Tenant Signature', 1),
        (p_template_id, p_organization_id, 'tenant', 'date', -1, 0.45, 0.70, 0.15, 0.05, TRUE, 'Date', 2);
    
    -- Landlord signature  
    INSERT INTO lease_template_signature_fields 
        (template_id, organization_id, signer_role, field_type, page_number, x_position, y_position, width, height, required, label, display_order)
    VALUES 
        (p_template_id, p_organization_id, 'landlord', 'signature', -1, 0.10, 0.55, 0.30, 0.08, TRUE, 'Landlord Signature', 1),
        (p_template_id, p_organization_id, 'landlord', 'date', -1, 0.45, 0.55, 0.15, 0.05, TRUE, 'Date', 2);
    
    -- Optional witness signature
    INSERT INTO lease_template_signature_fields 
        (template_id, organization_id, signer_role, field_type, page_number, x_position, y_position, width, height, required, label, display_order)
    VALUES 
        (p_template_id, p_organization_id, 'witness', 'signature', -1, 0.55, 0.70, 0.30, 0.08, FALSE, 'Witness Signature', 1);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION insert_default_signature_fields IS 'Inserts default signature field positions for a lease template. page_number=-1 means last page.';
