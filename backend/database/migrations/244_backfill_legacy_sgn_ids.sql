-- Migration: 244_backfill_legacy_sgn_ids
-- Description: Convert the remaining legacy `SGN-XXXXXXXX` permanent signer IDs (an even older
--              scheme from since-removed code, all minted 2026-01-28) to the current 6+6 PMT
--              format, so every signer identity is consistent (PMT-XXXXXX-XXXXXX).
-- Created: 2026-06-15
--
-- Unlike 243 (a strict widening), SGN ids share no digits with the PMT scheme, so each new id is
-- derived fresh from the signer's immutable source using the SAME order as the live generator
-- (deriveHex): users.id UUID -> tenants.id UUID -> sha256(lower(email)). No FKs reference
-- permanent_id; already-signed Jan PDFs keep their printed SGN id (historical/immutable).
-- The SGN generator no longer exists, so this set is closed (these 3 rows are all of them).
-- Run as propmetrik_admin.

BEGIN;

-- cedynhq@gmail.com — an account exists for this email → derive from the user UUID
-- (181f2370-224d-…) and link user_id, exactly as the current generator would.
UPDATE esign_signer_identities
SET permanent_id = 'PMT-181F23-70224D',
    user_id = '181f2370-224d-49f5-b6ab-a9aecefa5fcb'
WHERE permanent_id = 'SGN-7K4M2NX9' AND email = 'cedynhq@gmail.com';

-- External signers with no account → sha256(lower(email))[0:12].
UPDATE esign_signer_identities
SET permanent_id = 'PMT-A31314-E5F65A'   -- sha256('john.tenant@test.com')
WHERE permanent_id = 'SGN-7PRQEEWU' AND email = 'john.tenant@test.com';

UPDATE esign_signer_identities
SET permanent_id = 'PMT-B5529B-91F2FB'   -- sha256('rt@tr.com')
WHERE permanent_id = 'SGN-M8475FAU' AND email = 'rt@tr.com';

COMMIT;
