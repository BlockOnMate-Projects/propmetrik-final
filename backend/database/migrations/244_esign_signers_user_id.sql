-- Migration 244: link e-sign signers to the platform account.
--
-- Signers were identified only by email, so a signer's permanent PMT id was
-- inferred from the email string. Carrying the account user_id explicitly lets
-- the PMT key off the IMMUTABLE account id — so the same user gets the same PMT
-- across every service regardless of which email a given module uses for them.
-- External signers (no account) keep user_id NULL and fall back to the email hash.

ALTER TABLE esign_signers ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS idx_esign_signers_user_id
  ON esign_signers(user_id) WHERE user_id IS NOT NULL;

-- Backfill from the email→users / email→tenants mapping for existing rows.
UPDATE esign_signers s
SET user_id = u.id
FROM users u
WHERE s.user_id IS NULL AND LOWER(s.email) = LOWER(u.email);
