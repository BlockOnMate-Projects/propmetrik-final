-- Migration 243: harden the permanent signer id (PMT-XXXXXX-XXXXXX).
--
-- The legacy derivation used only 8 hex chars (32 bits) of the user UUID / email
-- hash, which already produced a collision. New ids use 12 hex chars and are
-- guarded by a UNIQUE constraint. This migration:
--   1. Re-derives a wider, unique id for any existing duplicate permanent_ids
--      (keeping the oldest row's id stable), using md5(email) (built-in, no
--      extension) purely to break the legacy ties.
--   2. Adds a UNIQUE(permanent_id) constraint so two signers can never share one.
-- Idempotent: the UPDATE is a no-op once unique; the constraint add is guarded.

-- The wider format (PMT-XXXXXX-XXXXXX = 17 chars, more on collision widening)
-- exceeds the legacy varchar(16). Widen the column first.
ALTER TABLE esign_signer_identities ALTER COLUMN permanent_id TYPE varchar(40);

UPDATE esign_signer_identities
SET permanent_id = 'PMT-' || UPPER(SUBSTRING(md5(lower(email)) FROM 1 FOR 6))
                 || '-' || UPPER(SUBSTRING(md5(lower(email)) FROM 7 FOR 6))
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY permanent_id ORDER BY created_at) AS rn
    FROM esign_signer_identities
  ) t
  WHERE t.rn > 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'esign_signer_identities_permanent_id_key'
  ) THEN
    ALTER TABLE esign_signer_identities
      ADD CONSTRAINT esign_signer_identities_permanent_id_key UNIQUE (permanent_id);
  END IF;
END $$;
