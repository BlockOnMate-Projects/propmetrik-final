-- =====================================================
-- Migration: 126_phase12_esign_migration.sql
-- Description: Drop legacy e-sign tables and create Phase12 E-Sign schema
-- Created: 2026-01-29
-- 
-- This migration removes all legacy Documenso/custom e-sign tables and 
-- replaces them with the Phase12 E-Sign schema that integrates with PropMetrik auth.
-- =====================================================

-- =====================================================
-- SECTION 1: DROP LEGACY E-SIGN TABLES
-- Remove all tables from migrations 037, 050, 051, 071 (e-sign related)
-- =====================================================

-- Drop dependent foreign keys first
ALTER TABLE applications DROP COLUMN IF EXISTS envelope_id;

-- Drop Phase 2 enhancements (migration 051)
DROP TABLE IF EXISTS esign_reminders CASCADE;
DROP TABLE IF EXISTS esign_certificates CASCADE;
DROP TABLE IF EXISTS esign_signatures CASCADE;
DROP TABLE IF EXISTS esign_templates CASCADE;

-- Drop envelope tables (migration 050)
DROP TABLE IF EXISTS esign_audit_log CASCADE;
DROP TABLE IF EXISTS esign_fields CASCADE;
DROP TABLE IF EXISTS esign_signers CASCADE;
DROP TABLE IF EXISTS esign_envelopes CASCADE;

-- Drop original e-sign schema (migration 037)
DROP TABLE IF EXISTS consent_statement_versions CASCADE;
DROP TABLE IF EXISTS esign_audit_logs CASCADE;
DROP TABLE IF EXISTS signature_evidences CASCADE;
DROP TABLE IF EXISTS signing_request_signees CASCADE;
DROP TABLE IF EXISTS signing_requests CASCADE;
DROP TABLE IF EXISTS user_signing_keys CASCADE;

-- Drop legacy enums
DROP TYPE IF EXISTS esign_envelope_status CASCADE;
DROP TYPE IF EXISTS esign_signer_status CASCADE;
DROP TYPE IF EXISTS esign_field_type CASCADE;

-- =====================================================
-- SECTION 2: CREATE PHASE12 E-SIGN SCHEMA
-- Tables from phase12-esign platform, adapted for PropMetrik
-- =====================================================

-- -----------------------------------------------------
-- 2.1: DOCUMENT STATUS TYPES
-- -----------------------------------------------------
DO $$ BEGIN
    CREATE TYPE p12_document_status AS ENUM (
        'pending',
        'converted',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE p12_signature_request_status AS ENUM (
        'draft',
        'pending',
        'completed',
        'cancelled',
        'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE p12_signer_status AS ENUM (
        'pending',
        'signed',
        'declined'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------
-- 2.2: P12_ESIGN_USERS (User mapping table)
-- Links PropMetrik users to e-sign user records
-- For external signers who don't have PropMetrik accounts
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_esign_users (
    id SERIAL PRIMARY KEY,
    -- Link to PropMetrik users (optional - null for external signers)
    propmetrik_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- User identification
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint per organization
    CONSTRAINT p12_esign_users_unique_email_org UNIQUE (email, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_p12_esign_users_propmetrik ON p12_esign_users(propmetrik_user_id);
CREATE INDEX IF NOT EXISTS idx_p12_esign_users_email ON p12_esign_users(email);
CREATE INDEX IF NOT EXISTS idx_p12_esign_users_org ON p12_esign_users(organization_id);

-- -----------------------------------------------------
-- 2.3: P12_GOOGLE_TOKENS (Google OAuth for Drive integration)
-- Encrypted Google OAuth tokens for Google Drive/Docs access
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_google_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES p12_esign_users(id) ON DELETE CASCADE,
    
    -- Token data (encrypted in production)
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE,
    scopes TEXT, -- JSON array of granted scopes
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p12_google_tokens_user ON p12_google_tokens(user_id);

-- -----------------------------------------------------
-- 2.4: P12_DOCUMENTS (Source documents from Drive/Upload)
-- Documents from Google Drive or uploaded files
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_documents (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES p12_esign_users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Google Drive integration
    google_drive_id VARCHAR(255),
    
    -- Document metadata
    title VARCHAR(500) NOT NULL,
    original_format VARCHAR(50), -- 'google_doc', 'pdf', 'google_drive', 'upload'
    file_path VARCHAR(1000), -- Local or S3/MinIO path
    signed_file_path VARCHAR(1000), -- Path to signed document
    file_size INTEGER,
    mime_type VARCHAR(100),
    
    -- Processing status
    status p12_document_status DEFAULT 'pending',
    conversion_error TEXT,
    
    -- Google Drive sync
    signed_drive_id VARCHAR(255), -- ID of signed doc in Drive
    extra_data JSONB DEFAULT '{}', -- Additional metadata
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p12_documents_owner ON p12_documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_p12_documents_org ON p12_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_p12_documents_status ON p12_documents(status);
CREATE INDEX IF NOT EXISTS idx_p12_documents_drive_id ON p12_documents(google_drive_id);

-- -----------------------------------------------------
-- 2.5: P12_SIGNATURE_REQUESTS (Signature workflows)
-- Main table for signature request workflows
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_signature_requests (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES p12_documents(id) ON DELETE CASCADE,
    creator_id INTEGER NOT NULL REFERENCES p12_esign_users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Request info
    title VARCHAR(500) NOT NULL,
    message TEXT,
    
    -- Context linking (what this signature is for)
    context_type VARCHAR(50), -- 'lease', 'valuation_report', 'change_order', 'sow', 'contract'
    context_entity_id UUID, -- ID of the related entity
    context_entity_name TEXT, -- Human readable name
    
    -- Status
    status p12_signature_request_status DEFAULT 'draft',
    
    -- Expiration
    expires_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p12_sig_requests_doc ON p12_signature_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_p12_sig_requests_creator ON p12_signature_requests(creator_id);
CREATE INDEX IF NOT EXISTS idx_p12_sig_requests_org ON p12_signature_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_p12_sig_requests_status ON p12_signature_requests(status);
CREATE INDEX IF NOT EXISTS idx_p12_sig_requests_context ON p12_signature_requests(context_type, context_entity_id);

-- -----------------------------------------------------
-- 2.6: P12_SIGNERS (Individual signers in a request)
-- People who need to sign a document
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_signers (
    id SERIAL PRIMARY KEY,
    signature_request_id INTEGER NOT NULL REFERENCES p12_signature_requests(id) ON DELETE CASCADE,
    
    -- Signer identification
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(100), -- 'landlord', 'tenant', 'valuer', 'witness'
    
    -- Signing order (for sequential signing)
    signing_order INTEGER DEFAULT 1,
    
    -- Status
    status p12_signer_status DEFAULT 'pending',
    
    -- Magic link token for signing
    access_token VARCHAR(64) UNIQUE,
    access_token_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Signing metadata
    signed_at TIMESTAMP WITH TIME ZONE,
    declined_at TIMESTAMP WITH TIME ZONE,
    decline_reason TEXT,
    
    -- Audit data
    ip_address VARCHAR(45), -- IPv6 compatible
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p12_signers_request ON p12_signers(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_p12_signers_email ON p12_signers(email);
CREATE INDEX IF NOT EXISTS idx_p12_signers_status ON p12_signers(status);
CREATE INDEX IF NOT EXISTS idx_p12_signers_token ON p12_signers(access_token);

-- -----------------------------------------------------
-- 2.7: P12_SIGNATURE_FIELDS (Field positions on documents)
-- Signature and form field positions on document pages
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_signature_fields (
    id SERIAL PRIMARY KEY,
    signer_id INTEGER NOT NULL REFERENCES p12_signers(id) ON DELETE CASCADE,
    
    -- Position
    page INTEGER NOT NULL DEFAULT 1,
    x FLOAT NOT NULL, -- X coordinate
    y FLOAT NOT NULL, -- Y coordinate
    width FLOAT NOT NULL,
    height FLOAT NOT NULL,
    
    -- Field type
    field_type VARCHAR(50) DEFAULT 'signature', -- 'signature', 'initial', 'date', 'text', 'checkbox'
    
    -- Settings
    required BOOLEAN DEFAULT TRUE,
    label VARCHAR(255),
    
    -- Value (filled when signed)
    value TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p12_sig_fields_signer ON p12_signature_fields(signer_id);
CREATE INDEX IF NOT EXISTS idx_p12_sig_fields_type ON p12_signature_fields(field_type);

-- -----------------------------------------------------
-- 2.8: P12_SIGNATURES (Actual signature data)
-- Captured signature data with audit information
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_signatures (
    id SERIAL PRIMARY KEY,
    signature_request_id INTEGER NOT NULL REFERENCES p12_signature_requests(id) ON DELETE CASCADE,
    signer_id INTEGER NOT NULL REFERENCES p12_signers(id) ON DELETE CASCADE,
    field_id INTEGER REFERENCES p12_signature_fields(id) ON DELETE SET NULL,
    
    -- Unique signature ID for compliance
    signature_id VARCHAR(64) UNIQUE NOT NULL, -- e.g., SIG-2026-PM-000001-A7F3
    
    -- Signature data
    signature_data TEXT NOT NULL, -- Base64 encoded signature image
    signature_type VARCHAR(50) DEFAULT 'drawn', -- 'drawn', 'typed', 'uploaded'
    signature_hash VARCHAR(128), -- SHA-256 hash for tamper detection
    
    -- Audit data
    ip_address VARCHAR(45),
    user_agent TEXT,
    geolocation JSONB,
    device_fingerprint VARCHAR(128),
    
    -- Timestamps
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p12_signatures_request ON p12_signatures(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_p12_signatures_signer ON p12_signatures(signer_id);
CREATE INDEX IF NOT EXISTS idx_p12_signatures_sig_id ON p12_signatures(signature_id);
CREATE INDEX IF NOT EXISTS idx_p12_signatures_signed_at ON p12_signatures(signed_at);

-- -----------------------------------------------------
-- 2.9: P12_AUDIT_LOG (Comprehensive audit trail)
-- Immutable audit log for all e-sign events
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    
    -- References
    user_id INTEGER REFERENCES p12_esign_users(id) ON DELETE SET NULL,
    signature_request_id INTEGER REFERENCES p12_signature_requests(id) ON DELETE SET NULL,
    signer_id INTEGER REFERENCES p12_signers(id) ON DELETE SET NULL,
    envelope_id UUID, -- For envelope-based workflows
    
    -- Event details
    event_type VARCHAR(100) NOT NULL, -- 'document_uploaded', 'request_created', 'signer_added', 'document_viewed', 'signed', 'completed'
    resource_type VARCHAR(50), -- 'document', 'signature_request', 'signer', 'envelope'
    resource_id VARCHAR(255),
    
    -- Context data
    event_data JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Hash chain for tamper evidence
    previous_hash VARCHAR(64),
    row_hash VARCHAR(64),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p12_audit_user ON p12_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_p12_audit_request ON p12_audit_log(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_p12_audit_envelope ON p12_audit_log(envelope_id);
CREATE INDEX IF NOT EXISTS idx_p12_audit_event_type ON p12_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_p12_audit_created ON p12_audit_log(created_at);

-- -----------------------------------------------------
-- 2.10: P12_TEMPLATES (Reusable document templates)
-- Templates with predefined field positions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Template info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'General',
    
    -- Document source
    document_name VARCHAR(500),
    document_drive_id VARCHAR(255), -- Google Drive file ID
    
    -- Field definitions (reusable positions)
    fields JSONB DEFAULT '[]', -- [{role, type, page, x, y, width, height, required}]
    
    -- Sharing
    is_shared BOOLEAN DEFAULT FALSE, -- Available to all orgs
    
    -- Usage tracking
    used_count INTEGER DEFAULT 0,
    
    -- Ownership
    created_by VARCHAR(255) NOT NULL, -- Username/email
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p12_templates_org ON p12_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_p12_templates_category ON p12_templates(category);
CREATE INDEX IF NOT EXISTS idx_p12_templates_shared ON p12_templates(is_shared);
CREATE INDEX IF NOT EXISTS idx_p12_templates_created_by ON p12_templates(created_by);

-- -----------------------------------------------------
-- 2.11: P12_ENVELOPES (DocuSign-style workflow)
-- Envelopes containing documents and recipients
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Envelope info
    subject VARCHAR(500) NOT NULL,
    message TEXT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- draft, pending, completed, voided, expired
    
    -- Context linking
    context_type VARCHAR(50), -- 'lease', 'valuation_report', 'change_order', 'sow', 'contract'
    context_entity_id UUID,
    context_entity_name TEXT,
    
    -- Settings
    reminder_frequency_days INTEGER DEFAULT 3,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Ownership
    created_by UUID NOT NULL REFERENCES users(id),
    
    -- Completion tracking
    sent_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    voided_at TIMESTAMP WITH TIME ZONE,
    voided_by UUID REFERENCES users(id),
    void_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p12_envelopes_org ON p12_envelopes(organization_id);
CREATE INDEX IF NOT EXISTS idx_p12_envelopes_status ON p12_envelopes(status);
CREATE INDEX IF NOT EXISTS idx_p12_envelopes_context ON p12_envelopes(context_type, context_entity_id);
CREATE INDEX IF NOT EXISTS idx_p12_envelopes_created_by ON p12_envelopes(created_by);

-- -----------------------------------------------------
-- 2.12: P12_ENVELOPE_RECIPIENTS (Envelope signers)
-- Recipients for each envelope
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_envelope_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES p12_envelopes(id) ON DELETE CASCADE,
    
    -- Recipient info
    name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'signer', -- signer, cc, viewer
    signing_order INTEGER DEFAULT 1,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, signed, declined
    
    -- Magic link
    access_token VARCHAR(64) UNIQUE,
    access_token_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Tracking
    sent_at TIMESTAMP WITH TIME ZONE,
    viewed_at TIMESTAMP WITH TIME ZONE,
    signed_at TIMESTAMP WITH TIME ZONE,
    declined_at TIMESTAMP WITH TIME ZONE,
    decline_reason TEXT,
    
    -- Audit
    signed_from_ip VARCHAR(45),
    signed_user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_p12_env_recipients_envelope ON p12_envelope_recipients(envelope_id);
CREATE INDEX IF NOT EXISTS idx_p12_env_recipients_email ON p12_envelope_recipients(email);
CREATE INDEX IF NOT EXISTS idx_p12_env_recipients_token ON p12_envelope_recipients(access_token);
CREATE INDEX IF NOT EXISTS idx_p12_env_recipients_status ON p12_envelope_recipients(status);

-- -----------------------------------------------------
-- 2.13: P12_ENVELOPE_DOCUMENTS (Documents in envelope)
-- Documents attached to an envelope
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_envelope_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES p12_envelopes(id) ON DELETE CASCADE,
    
    -- Document info
    name VARCHAR(500) NOT NULL,
    source VARCHAR(50) DEFAULT 'desktop', -- 'desktop', 'drive', 'template'
    drive_id VARCHAR(255), -- Google Drive ID if applicable
    file_path VARCHAR(1000), -- Local or S3/MinIO path
    
    -- Ordering
    order_index INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_p12_env_docs_envelope ON p12_envelope_documents(envelope_id);

-- -----------------------------------------------------
-- 2.14: P12_ENVELOPE_FIELDS (Fields on envelope docs)
-- Field placements on envelope documents
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_envelope_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES p12_envelopes(id) ON DELETE CASCADE,
    document_id UUID REFERENCES p12_envelope_documents(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES p12_envelope_recipients(id) ON DELETE SET NULL,
    
    -- Field type
    type VARCHAR(50) NOT NULL, -- 'signature', 'initial', 'date_signed', 'name', 'email', 'text', 'checkbox'
    recipient_email VARCHAR(255), -- For backwards compatibility
    
    -- Position
    document_index INTEGER DEFAULT 0,
    page INTEGER DEFAULT 1,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    width FLOAT NOT NULL,
    height FLOAT NOT NULL,
    
    -- Settings
    required BOOLEAN DEFAULT TRUE,
    label VARCHAR(255),
    
    -- Value
    value TEXT, -- Filled value
    signature_data TEXT, -- Base64 signature if type='signature'
    filled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_p12_env_fields_envelope ON p12_envelope_fields(envelope_id);
CREATE INDEX IF NOT EXISTS idx_p12_env_fields_doc ON p12_envelope_fields(document_id);
CREATE INDEX IF NOT EXISTS idx_p12_env_fields_recipient ON p12_envelope_fields(recipient_id);
CREATE INDEX IF NOT EXISTS idx_p12_env_fields_type ON p12_envelope_fields(type);

-- -----------------------------------------------------
-- 2.15: P12_CERTIFICATES (Certificate of Completion)
-- Certificate for finalized signed documents
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS p12_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Unique certificate ID
    certificate_id VARCHAR(64) UNIQUE NOT NULL, -- e.g., CERT-2026-PM-000001-B2C4
    
    -- References (one per envelope or signature_request)
    envelope_id UUID UNIQUE REFERENCES p12_envelopes(id) ON DELETE CASCADE,
    signature_request_id INTEGER UNIQUE REFERENCES p12_signature_requests(id) ON DELETE CASCADE,
    
    -- Certificate content
    certificate_pdf_url TEXT, -- S3/MinIO storage URL
    certificate_html TEXT, -- For web viewing
    
    -- Metadata
    document_hash VARCHAR(128), -- Hash of final signed document
    signers_summary JSONB NOT NULL DEFAULT '[]', -- Array of {name, email, signed_at, signature_id, ip}
    
    -- Timestamps
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: must have either envelope or signature_request
    CONSTRAINT p12_cert_context_check CHECK (
        envelope_id IS NOT NULL OR signature_request_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_p12_certs_envelope ON p12_certificates(envelope_id);
CREATE INDEX IF NOT EXISTS idx_p12_certs_request ON p12_certificates(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_p12_certs_cert_id ON p12_certificates(certificate_id);

-- =====================================================
-- SECTION 3: TRIGGERS
-- =====================================================

-- Updated at trigger function
CREATE OR REPLACE FUNCTION p12_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
DROP TRIGGER IF EXISTS p12_esign_users_updated ON p12_esign_users;
CREATE TRIGGER p12_esign_users_updated
    BEFORE UPDATE ON p12_esign_users
    FOR EACH ROW EXECUTE FUNCTION p12_update_timestamp();

DROP TRIGGER IF EXISTS p12_google_tokens_updated ON p12_google_tokens;
CREATE TRIGGER p12_google_tokens_updated
    BEFORE UPDATE ON p12_google_tokens
    FOR EACH ROW EXECUTE FUNCTION p12_update_timestamp();

DROP TRIGGER IF EXISTS p12_documents_updated ON p12_documents;
CREATE TRIGGER p12_documents_updated
    BEFORE UPDATE ON p12_documents
    FOR EACH ROW EXECUTE FUNCTION p12_update_timestamp();

DROP TRIGGER IF EXISTS p12_signature_requests_updated ON p12_signature_requests;
CREATE TRIGGER p12_signature_requests_updated
    BEFORE UPDATE ON p12_signature_requests
    FOR EACH ROW EXECUTE FUNCTION p12_update_timestamp();

DROP TRIGGER IF EXISTS p12_signers_updated ON p12_signers;
CREATE TRIGGER p12_signers_updated
    BEFORE UPDATE ON p12_signers
    FOR EACH ROW EXECUTE FUNCTION p12_update_timestamp();

DROP TRIGGER IF EXISTS p12_templates_updated ON p12_templates;
CREATE TRIGGER p12_templates_updated
    BEFORE UPDATE ON p12_templates
    FOR EACH ROW EXECUTE FUNCTION p12_update_timestamp();

DROP TRIGGER IF EXISTS p12_envelopes_updated ON p12_envelopes;
CREATE TRIGGER p12_envelopes_updated
    BEFORE UPDATE ON p12_envelopes
    FOR EACH ROW EXECUTE FUNCTION p12_update_timestamp();

-- =====================================================
-- SECTION 4: COMMENTS
-- =====================================================

COMMENT ON TABLE p12_esign_users IS 'E-Sign users - links PropMetrik users to e-sign records, also stores external signers';
COMMENT ON TABLE p12_google_tokens IS 'Encrypted Google OAuth tokens for Drive/Docs integration';
COMMENT ON TABLE p12_documents IS 'Source documents from Google Drive or uploads';
COMMENT ON TABLE p12_signature_requests IS 'Signature request workflows linking documents to signers';
COMMENT ON TABLE p12_signers IS 'Individual signers assigned to signature requests';
COMMENT ON TABLE p12_signature_fields IS 'Signature/form field positions on document pages';
COMMENT ON TABLE p12_signatures IS 'Captured signature data with audit information';
COMMENT ON TABLE p12_audit_log IS 'Immutable audit trail for all e-sign events';
COMMENT ON TABLE p12_templates IS 'Reusable document templates with predefined field positions';
COMMENT ON TABLE p12_envelopes IS 'DocuSign-style envelopes containing documents and recipients';
COMMENT ON TABLE p12_envelope_recipients IS 'Recipients (signers, viewers, CC) for envelopes';
COMMENT ON TABLE p12_envelope_documents IS 'Documents attached to envelopes';
COMMENT ON TABLE p12_envelope_fields IS 'Signature/form field placements on envelope documents';
COMMENT ON TABLE p12_certificates IS 'Certificate of Completion for finalized signed documents';
