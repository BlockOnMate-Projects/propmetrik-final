-- Migration: 081_compliance_reports.sql
-- Phase 3: Compliance Reports with E-Sign integration
-- Stores generated compliance reports and links to e-sign requests

-- Create compliance_reports table
CREATE TABLE IF NOT EXISTS compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  
  -- Report metadata
  report_type VARCHAR(50) NOT NULL DEFAULT 'full_compliance',
  report_title VARCHAR(500),
  
  -- Generated PDF
  pdf_url TEXT NOT NULL,
  pdf_size_bytes INTEGER,
  
  -- E-Sign integration
  signing_request_id UUID REFERENCES signing_requests(id) ON DELETE SET NULL,
  
  -- Report data snapshot (for historical reference)
  report_data JSONB DEFAULT '{}'::jsonb,
  
  -- Audit
  generated_by UUID,
  viewed_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_compliance_reports_project ON compliance_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_org ON compliance_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_signing ON compliance_reports(signing_request_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_created ON compliance_reports(created_at DESC);

-- Add comments
COMMENT ON TABLE compliance_reports IS 'Stores generated compliance report PDFs with optional e-sign integration';
COMMENT ON COLUMN compliance_reports.report_data IS 'JSON snapshot of report data at generation time';
COMMENT ON COLUMN compliance_reports.signing_request_id IS 'Links to e-sign request if report requires sign-off';

-- ============================================================================
-- GHANA-SPECIFIC DOCUMENT TEMPLATES
-- ============================================================================

-- Note: Only insert if document_templates has document_type column
-- Otherwise skip this insert (schema mismatch with existing table)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_templates' AND column_name = 'document_type'
    ) THEN
        INSERT INTO document_templates (id, name, description, category, document_type, file_url, is_public, is_active, created_at)
        VALUES 
          (gen_random_uuid(), 
           'Consent Letter - Lands Commission', 
           'Standard consent letter template for Lands Commission submissions in Ghana',
           'land_legal',
           'consent_letter',
           '/templates/ghana/consent-letter-lands-commission.docx',
           true, true, NOW())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- Add e-sign enabled flag to document templates
ALTER TABLE document_templates 
ADD COLUMN IF NOT EXISTS esign_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS esign_roles JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS esign_fields JSONB DEFAULT '[]'::jsonb;

-- Update templates that support e-signing
UPDATE document_templates 
SET esign_enabled = true,
    esign_roles = '[{"name": "Project Manager", "order": 1, "required": true}, {"name": "Contractor", "order": 2, "required": true}]'::jsonb,
    esign_fields = '[{"type": "signature", "role": "Project Manager", "page": 1, "x": 70, "y": 85}, {"type": "date_signed", "role": "Project Manager", "page": 1, "x": 70, "y": 80}, {"type": "signature", "role": "Contractor", "page": 1, "x": 70, "y": 70}, {"type": "date_signed", "role": "Contractor", "page": 1, "x": 70, "y": 65}]'::jsonb
WHERE name IN (
  'Payment Certificate',
  'Variation Order Form',
  'Handover Certificate',
  'Warranty Document',
  'Meeting Minutes Template',
  'Inspection Report Form'
);

COMMENT ON COLUMN document_templates.esign_enabled IS 'Whether this template supports e-signing';
COMMENT ON COLUMN document_templates.esign_roles IS 'Defined signing roles for the template';
COMMENT ON COLUMN document_templates.esign_fields IS 'Predefined signature field positions';

-- ============================================================================
-- TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_compliance_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_compliance_reports_updated_at ON compliance_reports;
CREATE TRIGGER trigger_compliance_reports_updated_at
  BEFORE UPDATE ON compliance_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_compliance_reports_updated_at();
