-- =============================================================================
-- Phase 4: CRM Integration - E-Sign Support
-- Migration: Add e-sign columns to deal_stages and deals tables
-- Date: 2026-01-30
-- =============================================================================

-- =============================================================================
-- Add e-sign configuration to deal_stages table
-- =============================================================================

-- E-Sign trigger configuration for stages
ALTER TABLE deal_stages 
  ADD COLUMN IF NOT EXISTS trigger_esign BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS esign_template_id UUID,  -- Document template to use
  ADD COLUMN IF NOT EXISTS esign_document_subject VARCHAR(255),  -- Email subject
  ADD COLUMN IF NOT EXISTS esign_document_message TEXT,  -- Email message
  ADD COLUMN IF NOT EXISTS signer_config JSONB DEFAULT '[]',  -- Array of signer role configs
  ADD COLUMN IF NOT EXISTS field_placements JSONB DEFAULT '[]',  -- Array of signature field placements
  ADD COLUMN IF NOT EXISTS auto_advance_on_sign BOOLEAN DEFAULT FALSE,  -- Auto-advance to next stage on completion
  ADD COLUMN IF NOT EXISTS next_stage_on_sign UUID REFERENCES deal_stages(id);  -- Stage to advance to

-- Add index for stages with e-sign triggers
CREATE INDEX IF NOT EXISTS idx_deal_stages_esign_trigger 
  ON deal_stages(trigger_esign) 
  WHERE trigger_esign = TRUE;

COMMENT ON COLUMN deal_stages.trigger_esign IS 'Whether entering this stage triggers e-sign workflow';
COMMENT ON COLUMN deal_stages.signer_config IS 'JSON array of signer configurations, e.g. [{"role": "buyer", "source": "primary_contact"}, {"role": "seller", "source": "property_owner"}]';
COMMENT ON COLUMN deal_stages.field_placements IS 'JSON array of signature field placements with page, coordinates, and signer role';

-- =============================================================================
-- Add e-sign columns to deals table
-- =============================================================================

ALTER TABLE deals 
  ADD COLUMN IF NOT EXISTS current_esign_envelope_id UUID,
  ADD COLUMN IF NOT EXISTS esign_status VARCHAR(50) DEFAULT 'none',  -- none, pending, in_progress, completed, voided
  ADD COLUMN IF NOT EXISTS esign_triggered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS esign_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_contract_url TEXT,
  ADD COLUMN IF NOT EXISTS esign_certificate_url TEXT;

CREATE INDEX IF NOT EXISTS idx_deals_esign_envelope 
  ON deals(current_esign_envelope_id) 
  WHERE current_esign_envelope_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_esign_status 
  ON deals(esign_status) 
  WHERE esign_status != 'none';

-- =============================================================================
-- Add e-sign columns to crm_generated_documents table
-- =============================================================================

ALTER TABLE crm_generated_documents 
  ADD COLUMN IF NOT EXISTS esign_envelope_id UUID,
  ADD COLUMN IF NOT EXISTS esign_status VARCHAR(50) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS esign_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS esign_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_document_url TEXT,
  ADD COLUMN IF NOT EXISTS esign_certificate_url TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_generated_documents_esign 
  ON crm_generated_documents(esign_envelope_id) 
  WHERE esign_envelope_id IS NOT NULL;

-- =============================================================================
-- CRM E-Sign Audit Trail
-- Tracks all e-sign related events for CRM deals
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_esign_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  document_id UUID,
  envelope_id UUID,
  
  event_type VARCHAR(50) NOT NULL,  -- 'esign_triggered', 'invitation_sent', 'signer_signed', 'completed', 'voided', 'auto_advanced'
  event_data JSONB,
  
  signer_email VARCHAR(255),
  signer_name VARCHAR(255),
  signer_role VARCHAR(50),
  signer_ip_address INET,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_crm_esign_audit_deal 
  ON crm_esign_audit(deal_id);

CREATE INDEX IF NOT EXISTS idx_crm_esign_audit_envelope 
  ON crm_esign_audit(envelope_id) 
  WHERE envelope_id IS NOT NULL;

-- =============================================================================
-- Signer Role Configuration Reference Table
-- Defines available signer roles and their data sources
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_signer_role_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  role_name VARCHAR(50) NOT NULL,  -- buyer, seller, agent, witness, lawyer, guarantor
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Data source configuration
  data_source VARCHAR(50) NOT NULL,  -- primary_contact, secondary_contact, company_contact, property_owner, assigned_agent, manual
  data_source_config JSONB,  -- Additional config for data extraction
  
  -- Default field placement
  default_signature_page INTEGER DEFAULT 1,
  default_signature_x DECIMAL(5,4) DEFAULT 0.10,
  default_signature_y DECIMAL(5,4) DEFAULT 0.70,
  default_signature_width DECIMAL(5,4) DEFAULT 0.30,
  default_signature_height DECIMAL(5,4) DEFAULT 0.10,
  
  is_required BOOLEAN DEFAULT TRUE,
  signing_order INTEGER DEFAULT 1,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_crm_signer_role_config_org 
  ON crm_signer_role_config(organization_id);

-- =============================================================================
-- Insert default signer role configurations
-- =============================================================================

CREATE OR REPLACE FUNCTION create_default_crm_signer_roles(org_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Buyer role (from primary contact)
  INSERT INTO crm_signer_role_config (
    organization_id, role_name, display_name, description,
    data_source, signing_order, default_signature_y
  ) VALUES (
    org_id, 'buyer', 'Buyer', 'Primary buyer or purchaser',
    'primary_contact', 1, 0.70
  )
  ON CONFLICT (organization_id, role_name) DO NOTHING;

  -- Seller role (from property owner)
  INSERT INTO crm_signer_role_config (
    organization_id, role_name, display_name, description,
    data_source, signing_order, default_signature_y
  ) VALUES (
    org_id, 'seller', 'Seller', 'Property seller or owner',
    'property_owner', 2, 0.55
  )
  ON CONFLICT (organization_id, role_name) DO NOTHING;

  -- Agent role (from assigned agent)
  INSERT INTO crm_signer_role_config (
    organization_id, role_name, display_name, description,
    data_source, signing_order, default_signature_y, is_required
  ) VALUES (
    org_id, 'agent', 'Agent', 'Real estate agent handling the deal',
    'assigned_agent', 3, 0.40, FALSE
  )
  ON CONFLICT (organization_id, role_name) DO NOTHING;

  -- Witness role (manual entry)
  INSERT INTO crm_signer_role_config (
    organization_id, role_name, display_name, description,
    data_source, signing_order, default_signature_y, is_required
  ) VALUES (
    org_id, 'witness', 'Witness', 'Witness to the signing',
    'manual', 4, 0.25, FALSE
  )
  ON CONFLICT (organization_id, role_name) DO NOTHING;

  -- Lawyer role (from secondary contact with type filter)
  INSERT INTO crm_signer_role_config (
    organization_id, role_name, display_name, description,
    data_source, data_source_config, signing_order, default_signature_y, is_required
  ) VALUES (
    org_id, 'lawyer', 'Legal Representative', 'Lawyer or legal representative',
    'secondary_contact', '{"contact_type": "lawyer"}'::jsonb, 5, 0.10, FALSE
  )
  ON CONFLICT (organization_id, role_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Link signature_envelopes to e-sign.envelopes
-- =============================================================================

ALTER TABLE signature_envelopes
  ADD COLUMN IF NOT EXISTS esign_envelope_id_external UUID;

COMMENT ON COLUMN signature_envelopes.esign_envelope_id_external IS 'Reference to the e-sign service envelope ID';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE crm_esign_audit IS 'Audit trail for all e-sign events in CRM deal management';
COMMENT ON TABLE crm_signer_role_config IS 'Configuration for signer roles and their data sources in CRM e-sign workflows';
