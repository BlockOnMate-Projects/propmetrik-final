-- Add permanent signer IDs and certification fields
ALTER TABLE esign.users
  ADD COLUMN IF NOT EXISTS signer_id VARCHAR(32),
  ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_signer_id ON esign.users (signer_id);

ALTER TABLE esign.signers
  ADD COLUMN IF NOT EXISTS signer_pmt_id VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_signers_pmt_id ON esign.signers (signer_pmt_id);

ALTER TABLE esign.signature_requests
  ADD COLUMN IF NOT EXISTS security_hash VARCHAR(128),
  ADD COLUMN IF NOT EXISTS security_hash_algorithm VARCHAR(20) DEFAULT 'SHA-256',
  ADD COLUMN IF NOT EXISTS security_hash_generated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS certificate_file_path VARCHAR(1000);

ALTER TABLE esign.envelope_documents
  ADD COLUMN IF NOT EXISTS file_path VARCHAR(1000);
