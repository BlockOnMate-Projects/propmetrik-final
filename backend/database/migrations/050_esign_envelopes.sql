-- E-Sign Envelopes for Electronic Signatures (DocuSign-like functionality)
-- Migration: 050_esign_envelopes.sql

-- Envelope status enum
DO $$ BEGIN
    CREATE TYPE esign_envelope_status AS ENUM (
        'draft',           -- Being prepared, not yet sent
        'sent',            -- Sent to signers, awaiting signatures
        'delivered',       -- Delivered to all signers
        'signed',          -- All signatures complete
        'completed',       -- Finalized and closed
        'declined',        -- A signer declined to sign
        'voided',          -- Sender voided the envelope
        'expired'          -- Envelope expired before completion
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Signer status enum
DO $$ BEGIN
    CREATE TYPE esign_signer_status AS ENUM (
        'pending',         -- Waiting for their turn
        'sent',            -- Email sent, awaiting action
        'delivered',       -- Email delivered
        'signed',          -- Signer completed their signature
        'declined',        -- Signer declined
        'authentication_failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Field type enum
DO $$ BEGIN
    CREATE TYPE esign_field_type AS ENUM (
        'signature',
        'initials',
        'date_signed',
        'text',
        'checkbox',
        'dropdown'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Main envelopes table
CREATE TABLE IF NOT EXISTS esign_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    
    -- Document info
    name VARCHAR(255) NOT NULL,
    document_html TEXT,                          -- Original HTML content
    document_pdf_url TEXT,                       -- Generated PDF storage URL
    
    -- Context linking (what this envelope is for)
    context_type VARCHAR(50),                    -- 'lease', 'amendment', 'notice', etc.
    context_entity_id UUID,                      -- ID of the related entity (e.g., application_id)
    context_entity_name TEXT,                    -- Human readable name
    
    -- Envelope settings
    message TEXT,                                -- Message to signers
    status esign_envelope_status DEFAULT 'draft',
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Tracking
    sent_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    voided_at TIMESTAMP WITH TIME ZONE,
    voided_by UUID REFERENCES users(id),
    void_reason TEXT,
    
    -- Metadata
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signers for each envelope
CREATE TABLE IF NOT EXISTS esign_signers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    
    -- Signer info
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(100),                           -- 'landlord', 'tenant', 'witness', etc.
    
    -- Signing order and status
    signing_order INTEGER DEFAULT 1,
    status esign_signer_status DEFAULT 'pending',
    
    -- Access token for signing
    access_token VARCHAR(255) UNIQUE,
    access_token_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Tracking
    sent_at TIMESTAMP WITH TIME ZONE,
    viewed_at TIMESTAMP WITH TIME ZONE,
    signed_at TIMESTAMP WITH TIME ZONE,
    declined_at TIMESTAMP WITH TIME ZONE,
    decline_reason TEXT,
    
    -- IP and device info for audit
    signed_from_ip VARCHAR(45),
    signed_user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signature fields placed on documents
CREATE TABLE IF NOT EXISTS esign_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    signer_id UUID NOT NULL REFERENCES esign_signers(id) ON DELETE CASCADE,
    
    -- Field type and position
    field_type esign_field_type NOT NULL DEFAULT 'signature',
    page INTEGER DEFAULT 1,
    x_position DECIMAL(10, 2) NOT NULL,
    y_position DECIMAL(10, 2) NOT NULL,
    width DECIMAL(10, 2) DEFAULT 200,
    height DECIMAL(10, 2) DEFAULT 50,
    
    -- Field value (after signing)
    value TEXT,                                  -- Base64 image data for signatures, text for other fields
    font_family VARCHAR(100),                    -- For typed signatures
    signed_at TIMESTAMP WITH TIME ZONE,
    
    -- Field settings
    required BOOLEAN DEFAULT TRUE,
    label VARCHAR(255),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log for envelope events
CREATE TABLE IF NOT EXISTS esign_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    signer_id UUID REFERENCES esign_signers(id),
    
    event_type VARCHAR(100) NOT NULL,            -- 'created', 'sent', 'viewed', 'signed', 'voided', etc.
    event_data JSONB,
    
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add envelope reference to applications table
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS envelope_id UUID REFERENCES esign_envelopes(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_esign_envelopes_org ON esign_envelopes(organization_id);
CREATE INDEX IF NOT EXISTS idx_esign_envelopes_context ON esign_envelopes(context_type, context_entity_id);
CREATE INDEX IF NOT EXISTS idx_esign_envelopes_status ON esign_envelopes(status);
CREATE INDEX IF NOT EXISTS idx_esign_signers_envelope ON esign_signers(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_signers_token ON esign_signers(access_token);
CREATE INDEX IF NOT EXISTS idx_esign_fields_envelope ON esign_fields(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_fields_signer ON esign_fields(signer_id);
CREATE INDEX IF NOT EXISTS idx_esign_audit_envelope ON esign_audit_log(envelope_id);
CREATE INDEX IF NOT EXISTS idx_applications_envelope ON applications(envelope_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_esign_envelope_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_esign_envelope_timestamp ON esign_envelopes;
CREATE TRIGGER trigger_update_esign_envelope_timestamp
    BEFORE UPDATE ON esign_envelopes
    FOR EACH ROW
    EXECUTE FUNCTION update_esign_envelope_timestamp();

COMMENT ON TABLE esign_envelopes IS 'Electronic signature envelopes for document signing (DocuSign-like)';
COMMENT ON TABLE esign_signers IS 'Signers assigned to each envelope with their status';
COMMENT ON TABLE esign_fields IS 'Signature/form fields placed on envelope documents';
COMMENT ON TABLE esign_audit_log IS 'Audit trail for all envelope events';
