-- ============================================================================
-- Generalize identity_verifications to polymorphic subjects — Phase 2 extension.
--
-- Phase 2 verified platform USERS (KYB principal / lister). We now also verify
-- TENANTS (before lease generation) and CRM CONTACTS/leads via the same Didit flow.
-- Tenants/contacts are not platform-user accounts, so add a polymorphic subject
-- (subject_type + subject_id). subject_user_id is retained for the user path.
--
-- Idempotent. Safe to re-run. (identity_verifications is not partitioned.)
-- ============================================================================

ALTER TABLE identity_verifications ADD COLUMN IF NOT EXISTS subject_type VARCHAR(20);  -- user | tenant | contact
ALTER TABLE identity_verifications ADD COLUMN IF NOT EXISTS subject_id   UUID;

-- Backfill existing user rows.
UPDATE identity_verifications
   SET subject_type = 'user', subject_id = subject_user_id
 WHERE subject_type IS NULL AND subject_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_identity_verifications_subject
    ON identity_verifications(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_subject_verified
    ON identity_verifications(subject_type, subject_id) WHERE status = 'verified';
