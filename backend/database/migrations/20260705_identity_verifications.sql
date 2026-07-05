-- ============================================================================
-- Identity Verification (KYC) — Marketplace Trust & Anti-Fraud, Phase 2 (Gate B)
--
-- Records the outcome of a person's Ghana-Card / passport verification via a KYC
-- provider (Didit). Used to (a) gate KYB approval on a verified principal, and
-- (b) later gate individual listers/owners. Stores verification RESULTS/refs and
-- minimal extracted fields — NOT raw ID images (Ghana Data Protection Act 2012).
--
-- Idempotent. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity_verifications (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
    -- kyb_principal | lister | owner_mandate
    purpose               VARCHAR(30) NOT NULL DEFAULT 'lister',
    provider              VARCHAR(30) NOT NULL DEFAULT 'didit',
    provider_session_id   VARCHAR(160),
    -- pending | in_progress | verified | declined | expired | abandoned | error
    status                VARCHAR(24) NOT NULL DEFAULT 'pending',

    -- Minimal extracted result (never raw images)
    document_type         VARCHAR(40),          -- ghana_card | passport | drivers_license | voter_id
    verified_name         VARCHAR(255),
    document_number       VARCHAR(120),          -- e.g. Ghana Card PIN
    date_of_birth         DATE,

    verification_url      TEXT,                  -- transient hosted session URL
    decision              JSONB,                 -- redacted provider decision summary
    verified_at           TIMESTAMPTZ,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_verifications_user   ON identity_verifications(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_org    ON identity_verifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_status ON identity_verifications(status);

-- Map a provider webhook back to its verification row by (provider, session_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_verifications_session
    ON identity_verifications(provider, provider_session_id)
    WHERE provider_session_id IS NOT NULL;

-- Fast "is this person verified?" lookups (Gate B).
CREATE INDEX IF NOT EXISTS idx_identity_verifications_verified
    ON identity_verifications(subject_user_id)
    WHERE status = 'verified';
