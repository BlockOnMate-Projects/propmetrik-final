-- Migration 245: enforce ONE permanent signer identity per platform account.
--
-- Legacy data created identities per-email before user_id was linked, so a single
-- account could end up with several identity rows (and thus several PMT ids).
-- This collapses them: the OLDEST row per user_id stays canonical (preserving the
-- already-issued PMT), and the rest release their user_id claim — they keep their
-- email + permanent_id for documents already signed under that email, but the
-- account now resolves to exactly one permanent PMT. A partial UNIQUE index then
-- prevents an account from ever holding two identities again.

UPDATE esign_signer_identities
SET user_id = NULL
WHERE user_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM esign_signer_identities
    WHERE user_id IS NOT NULL
    ORDER BY user_id, created_at ASC
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_esign_identity_user_id
  ON esign_signer_identities(user_id)
  WHERE user_id IS NOT NULL;
