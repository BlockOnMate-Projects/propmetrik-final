-- ============================================================================
-- Property Registry & Conflicts — Marketplace Trust & Anti-Fraud, Phase 4 (Gate D).
--
-- Structurally blocks DOUBLE-LISTING (same property listed by multiple parties) and
-- DOUBLE-SALE (a sold property re-listed). A property's identity is fingerprinted from
-- its land title / parcel id / Ghana-Post-GPS digital address. The FIRST listing to
-- register an identity is the incumbent; a later listing of the same identity (or of an
-- identity marked sold) is recorded as a CONFLICT and hidden from the marketplace
-- (Gate D read filter) until an admin resolves it.
--
-- Properties without any identifier (untitled/customary land — the Ghana majority) simply
-- have no fingerprint and are not de-duplicated; they are NOT blocked.
--
-- NOTE: `properties` is region-partitioned and NOT alterable by the app DB user, so the
-- title/parcel identifiers live in a non-partitioned side table keyed by (source, id);
-- digital_address already exists on both base tables.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- Extra identity fields for any property (PM or CRM), side-table (avoids partition ALTER).
CREATE TABLE IF NOT EXISTS property_identifiers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_source    VARCHAR(8) NOT NULL,           -- pm | crm
    property_id        UUID NOT NULL,
    land_title_number  VARCHAR(120),
    parcel_id          VARCHAR(120),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (property_source, property_id)
);

-- Canonical identity registry: one row per fingerprint (first claimant = incumbent).
CREATE TABLE IF NOT EXISTS property_registry (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint       VARCHAR(255) NOT NULL UNIQUE,   -- 'title:…' | 'parcel:…' | 'gps:…'
    fingerprint_kind  VARCHAR(20)  NOT NULL,          -- land_title | parcel | digital_address
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_source   VARCHAR(8)   NOT NULL,          -- pm | crm
    property_id       UUID         NOT NULL,
    -- available | under_offer | sale_pending | sold | leased | withdrawn
    disposition       VARCHAR(20)  NOT NULL DEFAULT 'available',
    disposition_at    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_property_registry_prop ON property_registry(property_source, property_id);
CREATE INDEX IF NOT EXISTS idx_property_registry_org  ON property_registry(organization_id);

-- Conflicts: a challenger listing that collides with an incumbent identity or a sold one.
-- The Gate-D read filter hides any listing that is an OPEN challenger here.
CREATE TABLE IF NOT EXISTS property_listing_conflicts (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint            VARCHAR(255) NOT NULL,
    fingerprint_kind       VARCHAR(20),
    reason                 VARCHAR(30)  NOT NULL,       -- duplicate_claim | sold_elsewhere
    incumbent_org_id       UUID,
    incumbent_source       VARCHAR(8),
    incumbent_property_id  UUID,
    challenger_org_id      UUID,
    challenger_source      VARCHAR(8),
    challenger_property_id  UUID,
    -- open | resolved_incumbent | resolved_challenger | dismissed
    status                 VARCHAR(20)  NOT NULL DEFAULT 'open',
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at            TIMESTAMPTZ,
    resolved_by            UUID
);
CREATE INDEX IF NOT EXISTS idx_conflicts_challenger
    ON property_listing_conflicts(challenger_source, challenger_property_id, status);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON property_listing_conflicts(status);
