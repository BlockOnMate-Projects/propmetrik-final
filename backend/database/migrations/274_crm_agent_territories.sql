-- Migration 274: agent territory management (PostGIS geo-fencing + exclusivity)
--
-- Lets an org carve the map into agent territories and auto-route inbound leads/contacts
-- to the owning agent by point-in-polygon. Reuses the PostGIS extension already enabled
-- (mig 006). Boundaries are MultiPolygon/4326 so a territory can be one area or several
-- disjoint areas; a single drawn polygon is stored as a 1-part MultiPolygon.
--
-- Routing precedence when a point falls inside multiple territories: exclusive first,
-- then higher priority. Exclusivity overlaps are surfaced to the UI (and blockable at the
-- service layer) rather than DB-enforced, since adjacent territories legitimately touch.
--
-- Idempotent (IF NOT EXISTS); safe to re-run.

CREATE TABLE IF NOT EXISTS crm_agent_territories (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    agent_id         UUID NOT NULL REFERENCES agents(id),
    name             VARCHAR(160) NOT NULL,
    description      TEXT,
    boundary         geometry(MultiPolygon, 4326) NOT NULL,
    is_exclusive     BOOLEAN NOT NULL DEFAULT true,   -- exclusive → no other exclusive territory should overlap
    priority         INTEGER NOT NULL DEFAULT 0,      -- higher wins when a point is inside multiple territories
    color            VARCHAR(20),                     -- map display
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_by       UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

-- Spatial index for point-in-polygon routing + overlap checks.
CREATE INDEX IF NOT EXISTS idx_crm_territories_boundary ON crm_agent_territories USING GIST (boundary);
CREATE INDEX IF NOT EXISTS idx_crm_territories_org   ON crm_agent_territories (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_territories_agent ON crm_agent_territories (agent_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_crm_territory_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_territory_updated_at ON crm_agent_territories;
CREATE TRIGGER trg_crm_territory_updated_at
    BEFORE UPDATE ON crm_agent_territories
    FOR EACH ROW EXECUTE FUNCTION set_crm_territory_updated_at();
