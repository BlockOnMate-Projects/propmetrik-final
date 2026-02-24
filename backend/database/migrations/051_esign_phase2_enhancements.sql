-- E-Sign Phase 2 Enhancements
-- Migration: 051_esign_phase2_enhancements.sql
-- Purpose: Add signature records, certificates, templates, and reminders

-- ============================================================================
-- 1. ESIGN_SIGNATURES - Individual signature records with unique compliance IDs
-- ============================================================================
CREATE TABLE IF NOT EXISTS esign_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Unique cryptographic signature ID (SIG-2026-PM-000001-A7F3)
    signature_id VARCHAR(64) UNIQUE NOT NULL,
    
    -- Relations
    envelope_id UUID REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    signer_id UUID REFERENCES esign_signers(id) ON DELETE CASCADE,
    field_id UUID REFERENCES esign_fields(id) ON DELETE CASCADE,
    
    -- Also support signing_requests (existing table)
    signing_request_id UUID REFERENCES signing_requests(id) ON DELETE CASCADE,
    signee_id UUID REFERENCES signing_request_signees(id) ON DELETE CASCADE,
    
    -- Signature Data
    signature_data TEXT NOT NULL,                    -- Base64 encoded signature image
    signature_type VARCHAR(20) NOT NULL DEFAULT 'drawn', -- drawn, typed, uploaded
    signature_hash VARCHAR(128),                     -- SHA-256 hash for tamper detection
    
    -- Legal Metadata (Ghana Electronic Transactions Act compliance)
    ip_address VARCHAR(45),
    user_agent TEXT,
    geolocation JSONB,
    device_fingerprint VARCHAR(128),
    
    -- Timestamps
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: must have either envelope or signing_request
    CONSTRAINT signature_context_check CHECK (
        (envelope_id IS NOT NULL AND signer_id IS NOT NULL) OR 
        (signing_request_id IS NOT NULL AND signee_id IS NOT NULL)
    ),
    
    -- Unique signature per field
    CONSTRAINT signature_unique_per_field UNIQUE (field_id)
);

-- Indexes for esign_signatures
CREATE INDEX IF NOT EXISTS idx_esign_signatures_envelope ON esign_signatures(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_signatures_signer ON esign_signatures(signer_id);
CREATE INDEX IF NOT EXISTS idx_esign_signatures_request ON esign_signatures(signing_request_id);
CREATE INDEX IF NOT EXISTS idx_esign_signatures_signee ON esign_signatures(signee_id);
CREATE INDEX IF NOT EXISTS idx_esign_signatures_id ON esign_signatures(signature_id);
CREATE INDEX IF NOT EXISTS idx_esign_signatures_signed_at ON esign_signatures(signed_at);

-- ============================================================================
-- 2. ESIGN_CERTIFICATES - Certificate of Completion for finalized documents
-- ============================================================================
CREATE TABLE IF NOT EXISTS esign_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Unique certificate ID (CERT-2026-PM-000001-B2C4)
    certificate_id VARCHAR(64) UNIQUE NOT NULL,
    
    -- Relations (one per envelope or signing_request)
    envelope_id UUID UNIQUE REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    signing_request_id UUID UNIQUE REFERENCES signing_requests(id) ON DELETE CASCADE,
    
    -- Certificate Content
    certificate_pdf_url TEXT,                        -- S3/MinIO storage URL
    certificate_html TEXT,                           -- For web viewing
    
    -- Metadata
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    document_hash VARCHAR(128),                      -- Hash of final signed document
    
    -- Signer summary snapshot (array of {name, email, signed_at, signature_id, ip})
    signers_summary JSONB NOT NULL DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: must have either envelope or signing_request
    CONSTRAINT certificate_context_check CHECK (
        envelope_id IS NOT NULL OR signing_request_id IS NOT NULL
    )
);

-- Indexes for esign_certificates
CREATE INDEX IF NOT EXISTS idx_esign_certificates_envelope ON esign_certificates(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_certificates_request ON esign_certificates(signing_request_id);
CREATE INDEX IF NOT EXISTS idx_esign_certificates_id ON esign_certificates(certificate_id);

-- ============================================================================
-- 3. ESIGN_TEMPLATES - Reusable document templates with predefined fields
-- ============================================================================
CREATE TABLE IF NOT EXISTS esign_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    
    -- Template info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'General',
    
    -- Document Source (one of these should be populated)
    document_html TEXT,                              -- HTML template content
    document_pdf_url TEXT,                           -- Pre-existing PDF URL
    document_drive_id VARCHAR(255),                  -- Google Drive ID if applicable
    
    -- Field Definitions (reusable placeholders)
    -- Example: [{ role: 'landlord', type: 'signature', x: 50, y: 80, page: 1, width: 200, height: 50 }]
    field_definitions JSONB NOT NULL DEFAULT '[]',
    
    -- Role Definitions
    -- Example: [{ name: 'landlord', order: 1, required: true }, { name: 'tenant', order: 2, required: true }]
    roles JSONB NOT NULL DEFAULT '[]',
    
    -- Settings
    is_shared BOOLEAN DEFAULT FALSE,                 -- Available to all organizations
    is_active BOOLEAN DEFAULT TRUE,                  -- Soft delete
    used_count INTEGER DEFAULT 0,                    -- Usage tracking
    
    -- Ownership
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for esign_templates
CREATE INDEX IF NOT EXISTS idx_esign_templates_org ON esign_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_esign_templates_category ON esign_templates(category);
CREATE INDEX IF NOT EXISTS idx_esign_templates_shared ON esign_templates(is_shared) WHERE is_shared = TRUE;
CREATE INDEX IF NOT EXISTS idx_esign_templates_active ON esign_templates(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_esign_templates_name ON esign_templates(name);

-- ============================================================================
-- 4. ESIGN_REMINDERS - Scheduled reminder notifications for pending signers
-- ============================================================================
CREATE TABLE IF NOT EXISTS esign_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relations
    envelope_id UUID REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    signer_id UUID REFERENCES esign_signers(id) ON DELETE CASCADE,
    signing_request_id UUID REFERENCES signing_requests(id) ON DELETE CASCADE,
    signee_id UUID REFERENCES signing_request_signees(id) ON DELETE CASCADE,
    
    -- Reminder details
    reminder_type VARCHAR(50) NOT NULL,              -- 'initial', 'follow_up', 'final_warning'
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending',            -- pending, sent, cancelled, failed
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: must have valid context
    CONSTRAINT reminder_context_check CHECK (
        (envelope_id IS NOT NULL AND signer_id IS NOT NULL) OR 
        (signing_request_id IS NOT NULL AND signee_id IS NOT NULL)
    )
);

-- Indexes for esign_reminders
CREATE INDEX IF NOT EXISTS idx_esign_reminders_pending ON esign_reminders(scheduled_for) 
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_esign_reminders_envelope ON esign_reminders(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_reminders_request ON esign_reminders(signing_request_id);
CREATE INDEX IF NOT EXISTS idx_esign_reminders_status ON esign_reminders(status);

-- ============================================================================
-- 5. ALTERATIONS - Add reminder settings to existing tables
-- ============================================================================

-- Add reminder settings to esign_envelopes
ALTER TABLE esign_envelopes 
ADD COLUMN IF NOT EXISTS reminder_frequency_days INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT TRUE;

-- Add reminder settings to signing_requests
ALTER TABLE signing_requests 
ADD COLUMN IF NOT EXISTS reminder_frequency_days INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT TRUE;

-- Add template reference to envelopes
ALTER TABLE esign_envelopes
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES esign_templates(id);

-- ============================================================================
-- 6. TRIGGERS - Auto-update timestamps
-- ============================================================================

-- Updated at trigger for templates
CREATE OR REPLACE FUNCTION update_esign_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_esign_template_timestamp ON esign_templates;
CREATE TRIGGER trigger_update_esign_template_timestamp
    BEFORE UPDATE ON esign_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_esign_template_timestamp();

-- ============================================================================
-- 7. COMMENTS - Documentation
-- ============================================================================
COMMENT ON TABLE esign_signatures IS 'Individual signature records with unique compliance IDs for audit trail';
COMMENT ON TABLE esign_certificates IS 'Certificate of Completion generated when all signers complete';
COMMENT ON TABLE esign_templates IS 'Reusable document templates with predefined signature fields';
COMMENT ON TABLE esign_reminders IS 'Scheduled reminder notifications for pending signers';

COMMENT ON COLUMN esign_signatures.signature_id IS 'Unique verifiable ID format: SIG-YYYY-ORG-NNNNNN-CCCC';
COMMENT ON COLUMN esign_certificates.certificate_id IS 'Unique verifiable ID format: CERT-YYYY-ORG-NNNNNN-CCCC';
COMMENT ON COLUMN esign_templates.field_definitions IS 'JSON array of field placements with role, type, position';
COMMENT ON COLUMN esign_templates.roles IS 'JSON array of role definitions with name, order, required flags';
