-- ============================================================================
-- KYB (Know-Your-Business) verification — Marketplace Trust & Anti-Fraud, Phase 1
--
-- Gate A of the marketplace verification pipeline: an organization must be
-- verified before its listings are served on the public marketplace.
--
-- Reuses existing organizations columns for the verified state:
--   is_verified, verified_at, registration_number, tin_number,
--   license_number, license_expiry  (002_core_tables.sql / 153_b2b_*).
-- This migration adds ONLY the submission/review trail; the boolean gate lives
-- on organizations.is_verified. is_platform_org is treated as implicitly verified.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS kyb_submissions (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id               UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- pending | approved | rejected | withdrawn
    status                        VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Business identity (KYB)
    legal_name                    VARCHAR(255),
    business_registration_number  VARCHAR(100),   -- RGD (Registrar General's Dept)
    tin_number                    VARCHAR(50),    -- GRA Tax Identification Number
    agency_license_number         VARCHAR(100),   -- Real Estate Agency Act 2020 (Act 1047)
    license_expiry                DATE,
    registered_address            TEXT,
    contact_email                 VARCHAR(255),
    contact_phone                 VARCHAR(50),

    -- Principal / responsible person (their KYC lands in Phase 2)
    principal_name                VARCHAR(255),
    principal_ghana_card          VARCHAR(50),

    -- Uploaded proof documents: [{type,url,key,filename,uploaded_at}]
    -- types: certificate_of_incorporation | tin_certificate | agency_license |
    --        principal_ghana_card | other
    documents                     JSONB NOT NULL DEFAULT '[]'::jsonb,

    submitted_by                  UUID REFERENCES users(id),
    submitted_at                  TIMESTAMPTZ DEFAULT NOW(),
    reviewed_by                   UUID REFERENCES users(id),
    reviewed_at                   TIMESTAMPTZ,
    review_notes                  TEXT,

    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyb_submissions_org    ON kyb_submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_kyb_submissions_status ON kyb_submissions(status);

-- One org should not accumulate multiple *pending* submissions.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kyb_submissions_org_pending
    ON kyb_submissions(organization_id)
    WHERE status = 'pending';

-- Speeds up the Gate-A marketplace read filter (verified-or-platform orgs).
CREATE INDEX IF NOT EXISTS idx_organizations_listable
    ON organizations(id)
    WHERE is_verified = TRUE OR is_platform_org = TRUE;
