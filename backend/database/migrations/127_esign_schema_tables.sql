-- =====================================================
-- Migration: 127_esign_schema_tables.sql
-- Description: Create Phase12 E-Sign tables (using public schema with esign_ prefix)
-- Created: 2026-01-29
-- 
-- Adapted to use public schema due to permission issues with creating new schemas.
-- =====================================================

-- =====================================================
-- SECTION 1: DROP LEGACY E-SIGN TABLES (if any)
-- =====================================================

-- Drop any legacy tables from previous migrations (in public schema)
DROP TABLE IF EXISTS public.esign_reminders CASCADE;
DROP TABLE IF EXISTS public.esign_certificates CASCADE;
DROP TABLE IF EXISTS public.esign_signatures CASCADE;
DROP TABLE IF EXISTS public.esign_templates CASCADE;
DROP TABLE IF EXISTS public.esign_audit_log CASCADE;
DROP TABLE IF EXISTS public.esign_fields CASCADE;
DROP TABLE IF EXISTS public.esign_signers CASCADE;
DROP TABLE IF EXISTS public.esign_envelopes CASCADE;
DROP TABLE IF EXISTS public.consent_statement_versions CASCADE;
DROP TABLE IF EXISTS public.esign_audit_logs CASCADE;
DROP TABLE IF EXISTS public.signature_evidences CASCADE;
DROP TABLE IF EXISTS public.signing_request_signees CASCADE;
DROP TABLE IF EXISTS public.signing_requests CASCADE;
DROP TABLE IF EXISTS public.user_signing_keys CASCADE;

-- Drop any p12_ prefixed tables from migration 126
DROP TABLE IF EXISTS public.p12_certificates CASCADE;
DROP TABLE IF EXISTS public.p12_envelope_fields CASCADE;
DROP TABLE IF EXISTS public.p12_envelope_documents CASCADE;
DROP TABLE IF EXISTS public.p12_envelope_recipients CASCADE;
DROP TABLE IF EXISTS public.p12_envelopes CASCADE;
DROP TABLE IF EXISTS public.p12_templates CASCADE;
DROP TABLE IF EXISTS public.p12_audit_log CASCADE;
DROP TABLE IF EXISTS public.p12_signatures CASCADE;
DROP TABLE IF EXISTS public.p12_signature_fields CASCADE;
DROP TABLE IF EXISTS public.p12_signers CASCADE;
DROP TABLE IF EXISTS public.p12_signature_requests CASCADE;
DROP TABLE IF EXISTS public.p12_documents CASCADE;
DROP TABLE IF EXISTS public.p12_google_tokens CASCADE;
DROP TABLE IF EXISTS public.p12_esign_users CASCADE;

-- Drop legacy enums
DROP TYPE IF EXISTS public.p12_document_status CASCADE;
DROP TYPE IF EXISTS public.p12_signature_request_status CASCADE;
DROP TYPE IF EXISTS public.p12_signer_status CASCADE;
DROP TYPE IF EXISTS public.esign_envelope_status CASCADE;
DROP TYPE IF EXISTS public.esign_signer_status CASCADE;
DROP TYPE IF EXISTS public.esign_field_type CASCADE;

-- =====================================================
-- SECTION 2: CREATE ENUMS
-- =====================================================

DO $$ BEGIN
    CREATE TYPE esign_document_status AS ENUM (
        'pending',
        'converted',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE esign_signature_request_status AS ENUM (
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
    CREATE TYPE esign_signer_status AS ENUM (
        'pending',
        'signed',
        'declined'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE esign_envelope_status AS ENUM (
        'draft',
        'pending',
        'sent',
        'completed',
        'voided',
        'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE esign_recipient_role AS ENUM (
        'signer',
        'cc',
        'viewer'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- SECTION 3: CREATE ESIGN TABLES (public schema)
-- =====================================================

-- -----------------------------------------------------
-- 3.1: USERS (E-Sign users linking to PropMetrik)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_users (
    id SERIAL PRIMARY KEY,
    
    -- Link to PropMetrik users (NULL for external signers)
    propmetrik_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- User identification
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique per org
    CONSTRAINT esign_users_unique_email_org UNIQUE (email, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_esign_users_propmetrik ON esign_users(propmetrik_user_id);
CREATE INDEX IF NOT EXISTS idx_esign_users_email ON esign_users(email);
CREATE INDEX IF NOT EXISTS idx_esign_users_org ON esign_users(organization_id);

-- -----------------------------------------------------
-- 3.2: GOOGLE_TOKENS (Google OAuth)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_google_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES esign_users(id) ON DELETE CASCADE,
    
    -- Token data
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE,
    scopes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_google_tokens_user ON esign_google_tokens(user_id);

-- -----------------------------------------------------
-- 3.3: DOCUMENTS (Source documents)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_documents (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES esign_users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Google Drive integration
    google_drive_id VARCHAR(255),
    
    -- Document metadata
    title VARCHAR(500) NOT NULL,
    original_format VARCHAR(50),
    file_path VARCHAR(1000),
    signed_file_path VARCHAR(1000),
    file_size INTEGER,
    mime_type VARCHAR(100),
    
    -- Processing status
    status esign_document_status DEFAULT 'pending',
    conversion_error TEXT,
    
    -- Google Drive sync
    signed_drive_id VARCHAR(255),
    extra_data JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_docs_owner ON esign_documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_esign_docs_org ON esign_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_esign_docs_status ON esign_documents(status);
CREATE INDEX IF NOT EXISTS idx_esign_docs_drive_id ON esign_documents(google_drive_id);

-- -----------------------------------------------------
-- 3.4: SIGNATURE_REQUESTS
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_signature_requests (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES esign_documents(id) ON DELETE CASCADE,
    creator_id INTEGER NOT NULL REFERENCES esign_users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Request info
    title VARCHAR(500) NOT NULL,
    message TEXT,
    
    -- Context linking
    context_type VARCHAR(50),
    context_entity_id UUID,
    context_entity_name TEXT,
    
    -- Status
    status esign_signature_request_status DEFAULT 'draft',
    
    -- Expiration
    expires_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_requests_doc ON esign_signature_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_esign_requests_creator ON esign_signature_requests(creator_id);
CREATE INDEX IF NOT EXISTS idx_esign_requests_org ON esign_signature_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_esign_requests_status ON esign_signature_requests(status);
CREATE INDEX IF NOT EXISTS idx_esign_requests_context ON esign_signature_requests(context_type, context_entity_id);

-- -----------------------------------------------------
-- 3.5: SIGNERS
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_signers (
    id SERIAL PRIMARY KEY,
    signature_request_id INTEGER NOT NULL REFERENCES esign_signature_requests(id) ON DELETE CASCADE,
    
    -- Signer identification
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(100),
    
    -- Signing order
    signing_order INTEGER DEFAULT 1,
    
    -- Status
    status esign_signer_status DEFAULT 'pending',
    
    -- Magic link
    access_token VARCHAR(64) UNIQUE,
    access_token_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Signing metadata
    signed_at TIMESTAMP WITH TIME ZONE,
    declined_at TIMESTAMP WITH TIME ZONE,
    decline_reason TEXT,
    
    -- Audit data
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_signers_request ON esign_signers(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_esign_signers_email ON esign_signers(email);
CREATE INDEX IF NOT EXISTS idx_esign_signers_status ON esign_signers(status);
CREATE INDEX IF NOT EXISTS idx_esign_signers_token ON esign_signers(access_token);

-- -----------------------------------------------------
-- 3.6: SIGNATURE_FIELDS (Field positions)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_signature_fields (
    id SERIAL PRIMARY KEY,
    signer_id INTEGER NOT NULL REFERENCES esign_signers(id) ON DELETE CASCADE,
    
    -- Position
    page INTEGER NOT NULL DEFAULT 1,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    width FLOAT NOT NULL,
    height FLOAT NOT NULL,
    
    -- Field type
    field_type VARCHAR(50) DEFAULT 'signature',
    
    -- Settings
    required BOOLEAN DEFAULT TRUE,
    label VARCHAR(255),
    
    -- Value
    value TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_fields_signer ON esign_signature_fields(signer_id);
CREATE INDEX IF NOT EXISTS idx_esign_fields_type ON esign_signature_fields(field_type);

-- -----------------------------------------------------
-- 3.7: SIGNATURES (Captured signature data)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_signatures (
    id SERIAL PRIMARY KEY,
    signature_request_id INTEGER NOT NULL REFERENCES esign_signature_requests(id) ON DELETE CASCADE,
    signer_id INTEGER NOT NULL REFERENCES esign_signers(id) ON DELETE CASCADE,
    field_id INTEGER REFERENCES esign_signature_fields(id) ON DELETE SET NULL,
    
    -- Unique signature ID
    signature_id VARCHAR(64) UNIQUE NOT NULL,
    
    -- Signature data
    signature_data TEXT NOT NULL,
    signature_type VARCHAR(50) DEFAULT 'drawn',
    signature_hash VARCHAR(128),
    
    -- Audit data
    ip_address VARCHAR(45),
    user_agent TEXT,
    geolocation JSONB,
    device_fingerprint VARCHAR(128),
    
    -- Timestamps
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_sigs_request ON esign_signatures(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_esign_sigs_signer ON esign_signatures(signer_id);
CREATE INDEX IF NOT EXISTS idx_esign_sigs_sig_id ON esign_signatures(signature_id);
CREATE INDEX IF NOT EXISTS idx_esign_sigs_signed_at ON esign_signatures(signed_at);

-- -----------------------------------------------------
-- 3.8: AUDIT_LOG
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    
    -- References
    user_id INTEGER REFERENCES esign_users(id) ON DELETE SET NULL,
    signature_request_id INTEGER REFERENCES esign_signature_requests(id) ON DELETE SET NULL,
    signer_id INTEGER REFERENCES esign_signers(id) ON DELETE SET NULL,
    envelope_id UUID,
    
    -- Event details
    event_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    
    -- Context data
    event_data JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Hash chain
    previous_hash VARCHAR(64),
    row_hash VARCHAR(64),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_audit_user ON esign_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_esign_audit_request ON esign_audit_log(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_esign_audit_envelope ON esign_audit_log(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_audit_event_type ON esign_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_esign_audit_created ON esign_audit_log(created_at);

-- -----------------------------------------------------
-- 3.9: TEMPLATES
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Template info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'General',
    
    -- Document source
    document_name VARCHAR(500),
    document_drive_id VARCHAR(255),
    
    -- Field definitions
    fields JSONB DEFAULT '[]',
    
    -- Sharing
    is_shared BOOLEAN DEFAULT FALSE,
    
    -- Usage tracking
    used_count INTEGER DEFAULT 0,
    
    -- Ownership
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_templates_org ON esign_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_esign_templates_category ON esign_templates(category);
CREATE INDEX IF NOT EXISTS idx_esign_templates_shared ON esign_templates(is_shared);
CREATE INDEX IF NOT EXISTS idx_esign_templates_created_by ON esign_templates(created_by);

-- -----------------------------------------------------
-- 3.10: ENVELOPES
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Envelope info
    subject VARCHAR(500) NOT NULL,
    message TEXT,
    
    -- Status
    status esign_envelope_status DEFAULT 'draft',
    
    -- Context linking
    context_type VARCHAR(50),
    context_entity_id UUID,
    context_entity_name TEXT,
    
    -- Settings
    reminder_frequency_days INTEGER DEFAULT 3,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Ownership
    created_by UUID NOT NULL REFERENCES public.users(id),
    
    -- Completion tracking
    sent_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    voided_at TIMESTAMP WITH TIME ZONE,
    voided_by UUID REFERENCES public.users(id),
    void_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_envelopes_org ON esign_envelopes(organization_id);
CREATE INDEX IF NOT EXISTS idx_esign_envelopes_status ON esign_envelopes(status);
CREATE INDEX IF NOT EXISTS idx_esign_envelopes_context ON esign_envelopes(context_type, context_entity_id);
CREATE INDEX IF NOT EXISTS idx_esign_envelopes_created_by ON esign_envelopes(created_by);

-- -----------------------------------------------------
-- 3.11: ENVELOPE_RECIPIENTS
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_envelope_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    
    -- Recipient info
    name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    role esign_recipient_role DEFAULT 'signer',
    signing_order INTEGER DEFAULT 1,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    
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

CREATE INDEX IF NOT EXISTS idx_esign_recipients_envelope ON esign_envelope_recipients(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_recipients_email ON esign_envelope_recipients(email);
CREATE INDEX IF NOT EXISTS idx_esign_recipients_token ON esign_envelope_recipients(access_token);
CREATE INDEX IF NOT EXISTS idx_esign_recipients_status ON esign_envelope_recipients(status);

-- -----------------------------------------------------
-- 3.12: ENVELOPE_DOCUMENTS
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_envelope_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    
    -- Document info
    name VARCHAR(500) NOT NULL,
    source VARCHAR(50) DEFAULT 'desktop',
    drive_id VARCHAR(255),
    file_path VARCHAR(1000),
    
    -- Ordering
    order_index INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_esign_env_docs_envelope ON esign_envelope_documents(envelope_id);

-- -----------------------------------------------------
-- 3.13: ENVELOPE_FIELDS
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_envelope_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    document_id UUID REFERENCES esign_envelope_documents(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES esign_envelope_recipients(id) ON DELETE SET NULL,
    
    -- Field type
    type VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255),
    
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
    value TEXT,
    signature_data TEXT,
    filled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_esign_env_fields_envelope ON esign_envelope_fields(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_env_fields_doc ON esign_envelope_fields(document_id);
CREATE INDEX IF NOT EXISTS idx_esign_env_fields_recipient ON esign_envelope_fields(recipient_id);
CREATE INDEX IF NOT EXISTS idx_esign_env_fields_type ON esign_envelope_fields(type);

-- -----------------------------------------------------
-- 3.14: CERTIFICATES (Certificate of Completion)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS esign_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Unique certificate ID
    certificate_id VARCHAR(64) UNIQUE NOT NULL,
    
    -- References
    envelope_id UUID UNIQUE REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    signature_request_id INTEGER UNIQUE REFERENCES esign_signature_requests(id) ON DELETE CASCADE,
    
    -- Certificate content
    certificate_pdf_url TEXT,
    certificate_html TEXT,
    
    -- Metadata
    document_hash VARCHAR(128),
    signers_summary JSONB NOT NULL DEFAULT '[]',
    
    -- Timestamps
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT esign_cert_context_check CHECK (
        envelope_id IS NOT NULL OR signature_request_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_esign_certs_envelope ON esign_certificates(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_certs_request ON esign_certificates(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_esign_certs_cert_id ON esign_certificates(certificate_id);

-- =====================================================
-- SECTION 4: TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION esign_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS esign_users_updated ON esign_users;
CREATE TRIGGER esign_users_updated
    BEFORE UPDATE ON esign_users
    FOR EACH ROW EXECUTE FUNCTION esign_update_timestamp();

DROP TRIGGER IF EXISTS esign_google_tokens_updated ON esign_google_tokens;
CREATE TRIGGER esign_google_tokens_updated
    BEFORE UPDATE ON esign_google_tokens
    FOR EACH ROW EXECUTE FUNCTION esign_update_timestamp();

DROP TRIGGER IF EXISTS esign_documents_updated ON esign_documents;
CREATE TRIGGER esign_documents_updated
    BEFORE UPDATE ON esign_documents
    FOR EACH ROW EXECUTE FUNCTION esign_update_timestamp();

DROP TRIGGER IF EXISTS esign_signature_requests_updated ON esign_signature_requests;
CREATE TRIGGER esign_signature_requests_updated
    BEFORE UPDATE ON esign_signature_requests
    FOR EACH ROW EXECUTE FUNCTION esign_update_timestamp();

DROP TRIGGER IF EXISTS esign_signers_updated ON esign_signers;
CREATE TRIGGER esign_signers_updated
    BEFORE UPDATE ON esign_signers
    FOR EACH ROW EXECUTE FUNCTION esign_update_timestamp();

DROP TRIGGER IF EXISTS esign_templates_updated ON esign_templates;
CREATE TRIGGER esign_templates_updated
    BEFORE UPDATE ON esign_templates
    FOR EACH ROW EXECUTE FUNCTION esign_update_timestamp();

DROP TRIGGER IF EXISTS esign_envelopes_updated ON esign_envelopes;
CREATE TRIGGER esign_envelopes_updated
    BEFORE UPDATE ON esign_envelopes
    FOR EACH ROW EXECUTE FUNCTION esign_update_timestamp();
