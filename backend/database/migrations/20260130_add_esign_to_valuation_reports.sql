-- =============================================================================
-- Phase 3: Valuation Integration - E-Sign Support
-- Migration: Add e-sign columns to valuation_reports table
-- Date: 2026-01-30
-- =============================================================================

-- Add e-sign columns to valuation_reports table
ALTER TABLE valuation_reports 
  ADD COLUMN IF NOT EXISTS client_esign_envelope_id UUID,
  ADD COLUMN IF NOT EXISTS client_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_esign_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS signed_report_url TEXT,
  ADD COLUMN IF NOT EXISTS esign_certificate_url TEXT,
  ADD COLUMN IF NOT EXISTS client_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);

-- Index for efficient e-sign queries
CREATE INDEX IF NOT EXISTS idx_valuation_reports_esign_envelope 
  ON valuation_reports(client_esign_envelope_id) 
  WHERE client_esign_envelope_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_valuation_reports_esign_status 
  ON valuation_reports(client_esign_status) 
  WHERE client_esign_status IS NOT NULL;

-- =============================================================================
-- Report Signature Field Configuration Table
-- Stores default signature placement positions for different report templates
-- =============================================================================

CREATE TABLE IF NOT EXISTS report_signature_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_type VARCHAR(100) NOT NULL,  -- ghis_standard, rics_residential, etc.
  
  -- Signature field configuration (JSON array of field placements)
  -- Each field: { type, page, x, y, width, height, label, required }
  signature_fields JSONB NOT NULL DEFAULT '[]',
  
  -- Client signature placement defaults
  client_signature_page INTEGER DEFAULT 1,
  client_signature_x DECIMAL(5,4) DEFAULT 0.60,
  client_signature_y DECIMAL(5,4) DEFAULT 0.20,
  client_signature_width DECIMAL(5,4) DEFAULT 0.25,
  client_signature_height DECIMAL(5,4) DEFAULT 0.08,
  
  -- Acknowledgment text
  acknowledgment_text TEXT DEFAULT 'I acknowledge receipt of this valuation report and confirm I have reviewed its contents.',
  
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, template_type)
);

CREATE INDEX IF NOT EXISTS idx_report_signature_configs_org 
  ON report_signature_configs(organization_id);

-- =============================================================================
-- Report E-Sign Audit Trail
-- Tracks all e-sign related events for valuation reports
-- =============================================================================

CREATE TABLE IF NOT EXISTS report_esign_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES valuation_reports(id) ON DELETE CASCADE,
  envelope_id UUID,
  
  event_type VARCHAR(50) NOT NULL,  -- 'esign_triggered', 'invitation_sent', 'client_signed', 'completed', 'voided'
  event_data JSONB,
  
  client_email VARCHAR(255),
  client_ip_address INET,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_report_esign_audit_report 
  ON report_esign_audit(report_id);

CREATE INDEX IF NOT EXISTS idx_report_esign_audit_envelope 
  ON report_esign_audit(envelope_id) 
  WHERE envelope_id IS NOT NULL;

-- =============================================================================
-- Insert default signature configurations for common templates
-- =============================================================================

-- Note: These will be inserted per-organization. For now, we'll create a function
-- that can be called when setting up new organizations.

CREATE OR REPLACE FUNCTION create_default_report_signature_config(org_id UUID)
RETURNS VOID AS $$
BEGIN
  -- GhIS Standard template
  INSERT INTO report_signature_configs (
    organization_id, template_type, is_default,
    client_signature_page, client_signature_x, client_signature_y,
    signature_fields
  ) VALUES (
    org_id, 'ghis_standard', TRUE, 1, 0.60, 0.20,
    '[
      {"type": "signature", "page": 1, "x": 0.60, "y": 0.20, "width": 0.25, "height": 0.08, "label": "Client Acknowledgment", "required": true},
      {"type": "date", "page": 1, "x": 0.60, "y": 0.30, "width": 0.15, "height": 0.04, "label": "Date", "required": true}
    ]'::jsonb
  )
  ON CONFLICT (organization_id, template_type) DO NOTHING;

  -- RICS Residential template
  INSERT INTO report_signature_configs (
    organization_id, template_type, is_default,
    client_signature_page, client_signature_x, client_signature_y,
    signature_fields
  ) VALUES (
    org_id, 'rics_residential', FALSE, 1, 0.60, 0.15,
    '[
      {"type": "signature", "page": 1, "x": 0.60, "y": 0.15, "width": 0.25, "height": 0.08, "label": "Client Acknowledgment", "required": true},
      {"type": "date", "page": 1, "x": 0.60, "y": 0.25, "width": 0.15, "height": 0.04, "label": "Date", "required": true}
    ]'::jsonb
  )
  ON CONFLICT (organization_id, template_type) DO NOTHING;

  -- RICS Commercial template
  INSERT INTO report_signature_configs (
    organization_id, template_type, is_default,
    client_signature_page, client_signature_x, client_signature_y,
    signature_fields
  ) VALUES (
    org_id, 'rics_commercial', FALSE, 1, 0.60, 0.15,
    '[
      {"type": "signature", "page": 1, "x": 0.60, "y": 0.15, "width": 0.25, "height": 0.08, "label": "Client Acknowledgment", "required": true},
      {"type": "date", "page": 1, "x": 0.60, "y": 0.25, "width": 0.15, "height": 0.04, "label": "Date", "required": true}
    ]'::jsonb
  )
  ON CONFLICT (organization_id, template_type) DO NOTHING;

  -- Bank Mortgage template
  INSERT INTO report_signature_configs (
    organization_id, template_type, is_default,
    client_signature_page, client_signature_x, client_signature_y,
    signature_fields
  ) VALUES (
    org_id, 'bank_mortgage', FALSE, 1, 0.55, 0.20,
    '[
      {"type": "signature", "page": 1, "x": 0.55, "y": 0.20, "width": 0.30, "height": 0.10, "label": "Bank Representative", "required": true},
      {"type": "date", "page": 1, "x": 0.55, "y": 0.32, "width": 0.15, "height": 0.04, "label": "Date", "required": true}
    ]'::jsonb
  )
  ON CONFLICT (organization_id, template_type) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Grant access for updates
COMMENT ON TABLE report_signature_configs IS 'Stores default signature field placements for different valuation report templates';
COMMENT ON TABLE report_esign_audit IS 'Audit trail for all e-sign events related to valuation reports';
