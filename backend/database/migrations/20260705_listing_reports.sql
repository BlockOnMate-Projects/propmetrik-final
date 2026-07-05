-- ============================================================================
-- Listing Reports & Moderation — Marketplace Trust & Anti-Fraud, Phase 5 (Gate E).
--
-- Community abuse reporting: anyone can report a public listing (scam, wrong info,
-- already sold/rented, not the owner, etc.). After a threshold of distinct reports a
-- listing is AUTO-SUSPENDED (hidden from the marketplace) and queued for admin review.
-- Admins can uphold/dismiss reports and suspend/reinstate listings.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS listing_reports (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_source       VARCHAR(8)  NOT NULL,          -- pm | crm
    property_id           UUID        NOT NULL,
    permanent_link_token  VARCHAR(255),
    organization_id       UUID,
    -- scam | wrong_info | duplicate | already_sold_rented | not_owner | offensive | other
    reason                VARCHAR(40) NOT NULL,
    details               TEXT,
    reporter_email        VARCHAR(255),
    reporter_ip           VARCHAR(45),
    status                VARCHAR(20) NOT NULL DEFAULT 'open',  -- open | dismissed | upheld
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by           UUID,
    reviewed_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_listing_reports_prop   ON listing_reports(property_source, property_id, status);
CREATE INDEX IF NOT EXISTS idx_listing_reports_status ON listing_reports(status);
-- Anti-spam: at most one OPEN report per reporter IP per listing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_reports_ip
    ON listing_reports(property_source, property_id, reporter_ip)
    WHERE status = 'open' AND reporter_ip IS NOT NULL;

CREATE TABLE IF NOT EXISTS listing_moderation (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_source   VARCHAR(8)  NOT NULL,
    property_id       UUID        NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | suspended
    reason            TEXT,
    report_count      INT         NOT NULL DEFAULT 0,
    suspended_at      TIMESTAMPTZ,
    updated_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (property_source, property_id)
);
-- Cheap Gate-E read lookup: is this listing suspended?
CREATE INDEX IF NOT EXISTS idx_listing_moderation_suspended
    ON listing_moderation(property_source, property_id)
    WHERE status = 'suspended';
