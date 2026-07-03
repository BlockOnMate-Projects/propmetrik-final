-- Migration 276: A/B step variants for drip campaigns
--
-- Each step's own subject/body is the control ("A"). Additional rows here are alternate
-- variants (B/C/…) with a weight; the execution engine does a weighted random pick among
-- {control + active variants} per send and records which one it sent (crm_drip_step_sends.
-- variant_id, NULL = control) so open/click can be compared per variant.
--
-- Idempotent (IF NOT EXISTS); safe to re-run.

CREATE TABLE IF NOT EXISTS crm_drip_step_variants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id     UUID NOT NULL REFERENCES crm_drip_campaign_steps(id) ON DELETE CASCADE,
    label       VARCHAR(40) NOT NULL DEFAULT 'B',
    subject     VARCHAR(300) NOT NULL,
    body        TEXT NOT NULL,
    weight      INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drip_variants_step ON crm_drip_step_variants (step_id) WHERE is_active;

-- Which variant a send used (NULL = the step's control body).
ALTER TABLE crm_drip_step_sends ADD COLUMN IF NOT EXISTS variant_id UUID;
