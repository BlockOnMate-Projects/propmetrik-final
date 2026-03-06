-- Migration: Add audit/certification columns to Envelope tables
-- This adds security hash, certificate, and PMT signer ID columns for audit-grade e-signatures

-- Add security hash and certificate columns to envelopes
ALTER TABLE esign.envelopes ADD COLUMN IF NOT EXISTS security_hash VARCHAR(128);
ALTER TABLE esign.envelopes ADD COLUMN IF NOT EXISTS security_hash_algorithm VARCHAR(20) DEFAULT 'SHA-256';
ALTER TABLE esign.envelopes ADD COLUMN IF NOT EXISTS security_hash_generated_at TIMESTAMP;
ALTER TABLE esign.envelopes ADD COLUMN IF NOT EXISTS certificate_file_path VARCHAR(1000);
ALTER TABLE esign.envelopes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Add permanent signer ID to envelope recipients
ALTER TABLE esign.envelope_recipients ADD COLUMN IF NOT EXISTS signer_pmt_id VARCHAR(32);

-- Create index on security_hash for quick lookup
CREATE INDEX IF NOT EXISTS idx_envelopes_security_hash ON esign.envelopes(security_hash);
CREATE INDEX IF NOT EXISTS idx_envelope_recipients_pmt_id ON esign.envelope_recipients(signer_pmt_id);

-- Ensure users table has signer_id column (if not already added)
ALTER TABLE esign.users ADD COLUMN IF NOT EXISTS signer_id VARCHAR(32);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_signer_id ON esign.users(signer_id);
