-- Migration: 243_backfill_legacy_pmt_ids
-- Description: Widen legacy 4+4 permanent signer IDs (PMT-XXXX-XXXX, 8 hex) to the current
--              6+6 format (PMT-XXXXXX-XXXXXX, 12 hex) for visual consistency across signers.
-- Created: 2026-06-15
--
-- Background: commit 76cf046 (2026-06-13) changed HEX_HALF 4 -> 6 in permanentSignerId.ts.
-- The generator reuses any persisted id forever, so signers minted before that date kept the
-- short legacy form while newer signers get the long form (e.g. a lease showed landlord
-- PMT-ED4A-50D7 next to tenant PMT-AB4918-2DB601). This is a STRICT WIDENING: the new id is
-- derived from the SAME immutable source (user UUID / tenant UUID / sha256(email)), so the
-- first 8 hex are unchanged — only 4 more digits are revealed. No FKs reference permanent_id,
-- and the generator now only emits 6+6, so the legacy set is closed (no new 4+4 ids).
-- Already-signed PDFs keep their printed (old) id; this updates the canonical identity that
-- reports re-read live (e.g. reports.ts).
--
-- Run as propmetrik_admin (these are simple UPDATEs; the regex/derivation needs no extension).

BEGIN;

-- (a) Account-linked identities: widen from the user's UUID (the immutable source).
UPDATE esign_signer_identities
SET permanent_id =
      'PMT-' || upper(substr(replace(user_id::text, '-', ''), 1, 6))
            || '-' || upper(substr(replace(user_id::text, '-', ''), 7, 6))
WHERE permanent_id ~ '^PMT-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$'
  AND user_id IS NOT NULL;

-- (b) Account-less external signers: source = sha256(lower(email)). pgcrypto is not installed,
--     so the single known legacy external is inlined (sha256('newguy@test.com')[0:12]=45d5e447cbe6).
--     The set is closed, so this is complete.
UPDATE esign_signer_identities
SET permanent_id = 'PMT-45D5E4-47CBE6'
WHERE permanent_id = 'PMT-45D5-E447' AND email = 'newguy@test.com';

COMMIT;
