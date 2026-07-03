-- Migration 277: property condition inspections (PM)
--
-- Distinct from valuation/permit inspections: a property-management condition report
-- (move-in / move-out / routine / periodic) with room-by-room condition items. Backs the
-- inspection lifecycle scheduled → in_progress → completed and a per-element condition log.
-- (photos jsonb is present on items for a later photo-capture pipeline.)
--
-- Idempotent (IF NOT EXISTS); safe to re-run.

CREATE TABLE IF NOT EXISTS property_inspections (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id),
    property_id       UUID,   -- no FK: properties is LIST-partitioned by region, so id alone isn't a unique key
    unit_id           UUID,
    tenancy_id        UUID,
    inspection_type   VARCHAR(30) NOT NULL DEFAULT 'routine',    -- move_in | move_out | routine | periodic | maintenance
    status            VARCHAR(20) NOT NULL DEFAULT 'scheduled',  -- scheduled | in_progress | completed | cancelled
    scheduled_for     DATE,
    completed_at      TIMESTAMPTZ,
    inspector_id      UUID,
    overall_condition VARCHAR(20),                               -- excellent | good | fair | poor
    summary           TEXT,
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_inspections_org      ON property_inspections (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inspections_property ON property_inspections (property_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS property_inspection_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES property_inspections(id) ON DELETE CASCADE,
    area          VARCHAR(120) NOT NULL,                          -- room / zone
    item          VARCHAR(160) NOT NULL,                          -- element
    condition     VARCHAR(20) NOT NULL DEFAULT 'good',            -- excellent | good | fair | poor | damaged | na
    notes         TEXT,
    photos        JSONB NOT NULL DEFAULT '[]'::jsonb,             -- [url, ...] (photo pipeline is a follow-up)
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inspection_items ON property_inspection_items (inspection_id);

CREATE OR REPLACE FUNCTION set_property_inspection_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_property_inspection_updated_at ON property_inspections;
CREATE TRIGGER trg_property_inspection_updated_at
    BEFORE UPDATE ON property_inspections
    FOR EACH ROW EXECUTE FUNCTION set_property_inspection_updated_at();
