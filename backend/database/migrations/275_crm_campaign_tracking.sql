-- Migration 275: campaign audience segmentation + drip open/click tracking
--
-- Completes the "campaigns" gap (§3.1 "no audience segmentation, no open/click tracking"):
--   1. crm_campaign_segments — a saved audience filter (JSON rules over contacts) that can be
--      resolved to a contact set and bulk-enrolled into a drip campaign.
--   2. Open/click tracking on the drip send ledger — the execution engine injects a 1x1 open
--      pixel + rewrites links through a signed redirect; the public tracking endpoints record
--      hits here. Denormalized counts on crm_drip_step_sends for fast display; a granular event
--      log (crm_drip_tracking_events) for audit.
--
-- Idempotent (IF NOT EXISTS); safe to re-run.

-- ── 1. Audience segments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_campaign_segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(160) NOT NULL,
    description     TEXT,
    filter          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- audience rules (lead_status/region/city/tags/...)
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_segments_org ON crm_campaign_segments (organization_id) WHERE deleted_at IS NULL;

-- ── 2. Open/click tracking on the drip send ledger (mig 271) ──────────────────
ALTER TABLE crm_drip_step_sends
    ADD COLUMN IF NOT EXISTS opened_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS open_count       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS first_clicked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS click_count      INTEGER NOT NULL DEFAULT 0;

-- ── 3. Granular tracking event log ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_drip_tracking_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    send_id         UUID NOT NULL REFERENCES crm_drip_step_sends(id) ON DELETE CASCADE,
    organization_id UUID,
    event_type      VARCHAR(10) NOT NULL,   -- 'open' | 'click'
    url             TEXT,                   -- clicked target (NULL for opens)
    ip              VARCHAR(64),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drip_tracking_send ON crm_drip_tracking_events (send_id);

CREATE OR REPLACE FUNCTION set_crm_segment_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_segment_updated_at ON crm_campaign_segments;
CREATE TRIGGER trg_crm_segment_updated_at
    BEFORE UPDATE ON crm_campaign_segments
    FOR EACH ROW EXECUTE FUNCTION set_crm_segment_updated_at();
