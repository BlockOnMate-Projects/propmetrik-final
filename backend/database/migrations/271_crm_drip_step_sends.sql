-- Migration 271: CRM drip-campaign send ledger (idempotent execution log)
--
-- Backs the drip execution engine (src/jobs/dripExecutionJob.ts). One row per
-- (enrollment, step) that has been attempted. UNIQUE(enrollment_id, step_id) is the
-- idempotency key: a step can never be emailed twice to the same enrollment, even
-- across overlapping cron ticks or a crash between "email sent" and "enrollment
-- advanced". The row also carries an attempt counter (bounded retries) + status/error
-- so failed sends are visible and re-tried, and serves as the audit trail for drip
-- sends (which run in a background job, outside the HTTP auditMutations middleware).
--
-- Idempotent (IF NOT EXISTS throughout); safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Harden crm_drip_enrollments with the unique (campaign, contact) pair the
--    enroll route already assumes. Its `INSERT ... ON CONFLICT DO NOTHING` was a
--    no-op without a matching constraint, so the same contact could be enrolled
--    twice → drip sent twice. De-dupe first (safe: drip has never executed, so no
--    send history exists to lose), keeping the earliest enrollment per pair.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM crm_drip_enrollments a
USING crm_drip_enrollments b
WHERE a.campaign_id = b.campaign_id
  AND a.contact_id  = b.contact_id
  AND a.enrolled_at > b.enrolled_at;

-- break exact-timestamp ties deterministically by id
DELETE FROM crm_drip_enrollments a
USING crm_drip_enrollments b
WHERE a.campaign_id = b.campaign_id
  AND a.contact_id  = b.contact_id
  AND a.enrolled_at = b.enrolled_at
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_drip_enrollment_campaign_contact
    ON crm_drip_enrollments (campaign_id, contact_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The send ledger.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_drip_step_sends (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id   UUID NOT NULL REFERENCES crm_drip_enrollments(id) ON DELETE CASCADE,
    campaign_id     UUID NOT NULL REFERENCES crm_drip_campaigns(id) ON DELETE CASCADE,
    step_id         UUID NOT NULL REFERENCES crm_drip_campaign_steps(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL,
    organization_id UUID NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'sending',  -- sending | sent | failed
    attempts        INTEGER NOT NULL DEFAULT 1,
    error           TEXT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_drip_step_send UNIQUE (enrollment_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_drip_step_sends_enrollment ON crm_drip_step_sends (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_drip_step_sends_org        ON crm_drip_step_sends (organization_id);
-- Partial index for the retry scan (skips the common terminal 'sent' rows).
CREATE INDEX IF NOT EXISTS idx_drip_step_sends_retryable  ON crm_drip_step_sends (status) WHERE status <> 'sent';
