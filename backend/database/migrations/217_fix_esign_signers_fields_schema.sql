-- Fix esign schema mismatch: the envelopeService.ts expects UUID-based esign_signers
-- and an esign_fields table, but the live DB has an older integer-based esign_signers
-- linked to esign_signature_requests, and no esign_fields table at all.
-- Migration: 217_fix_esign_signers_fields_schema.sql

-- Step 1: Drop FK constraints that reference the old integer-based esign_signers
ALTER TABLE esign_audit_log DROP CONSTRAINT IF EXISTS esign_audit_log_signer_id_fkey;

-- Step 2: Rename the old integer-based esign_signers to preserve existing data.
-- Idempotent: only rename when the legacy table hasn't already been preserved.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'esign_signers')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'esign_signers_v1') THEN
    ALTER TABLE esign_signers RENAME TO esign_signers_v1;
  END IF;
END $$;

-- Step 3: Create new UUID-based esign_signers (matches envelopeService.ts expectations)
CREATE TABLE IF NOT EXISTS esign_signers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(100),
    signing_order INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending',
    access_token VARCHAR(255) UNIQUE,
    access_token_expires_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    viewed_at TIMESTAMP WITH TIME ZONE,
    signed_at TIMESTAMP WITH TIME ZONE,
    declined_at TIMESTAMP WITH TIME ZONE,
    decline_reason TEXT,
    signed_from_ip VARCHAR(45),
    signed_user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_signers_envelope ON esign_signers(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_signers_token ON esign_signers(access_token);
CREATE INDEX IF NOT EXISTS idx_esign_signers_email ON esign_signers(email);
CREATE INDEX IF NOT EXISTS idx_esign_signers_status ON esign_signers(status);

-- Step 4: Create esign_fields table (matches envelopeService.ts column names)
CREATE TABLE IF NOT EXISTS esign_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    signer_id UUID REFERENCES esign_signers(id) ON DELETE CASCADE,
    field_type VARCHAR(50) NOT NULL DEFAULT 'signature',
    page INTEGER DEFAULT 1,
    x_position DECIMAL(10, 2) NOT NULL DEFAULT 0,
    y_position DECIMAL(10, 2) NOT NULL DEFAULT 0,
    width DECIMAL(10, 2) DEFAULT 200,
    height DECIMAL(10, 2) DEFAULT 50,
    required BOOLEAN DEFAULT TRUE,
    label VARCHAR(255),
    value TEXT,
    signed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_fields_envelope ON esign_fields(envelope_id);
CREATE INDEX IF NOT EXISTS idx_esign_fields_signer ON esign_fields(signer_id);

COMMENT ON TABLE esign_signers IS 'UUID-based signers for envelope signing flow (v2 schema)';
COMMENT ON TABLE esign_fields IS 'Signature/form fields placed on envelope documents (matches envelopeService.ts)';
COMMENT ON TABLE esign_signers_v1 IS 'Legacy integer-based signers linked to esign_signature_requests (v1 schema, preserved)';
