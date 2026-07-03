-- Create the missing agent_commission_assignments table.
--
-- Root cause: both calculate_deal_commission() (the DB engine that prices every
-- commission) and commissionService.assignAgentToPlan() reference the table
-- `agent_commission_assignments`, but it was never created. As a result the
-- commission engine threw "relation does not exist" for every call, so no deal
-- ever booked a commission and the calculator dialog 500'd. This table restores
-- the engine: it maps a CRM agent (agents.id) to a commission plan, optionally
-- overriding the plan's base rate for that agent, with an effective-dating window.
--
-- Idempotent + safe to re-run.

CREATE TABLE IF NOT EXISTS agent_commission_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    plan_id         UUID NOT NULL REFERENCES commission_plans(id) ON DELETE CASCADE,
    custom_rate     NUMERIC,                       -- overrides plan.base_rate for this agent when set
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to    DATE,                          -- NULL = open-ended
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT agent_commission_assignments_unique UNIQUE (agent_id, plan_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_aca_agent ON agent_commission_assignments (agent_id);
CREATE INDEX IF NOT EXISTS idx_aca_plan  ON agent_commission_assignments (plan_id);
-- Hot path: "which plan is active for this agent today" (calculate_deal_commission)
CREATE INDEX IF NOT EXISTS idx_aca_agent_effective
    ON agent_commission_assignments (agent_id, effective_from DESC);

-- Keep updated_at fresh (matches the platform-wide set_updated_at trigger convention).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at')
       AND NOT EXISTS (
           SELECT 1 FROM pg_trigger
           WHERE tgname = 'set_updated_at_agent_commission_assignments'
       )
    THEN
        CREATE TRIGGER set_updated_at_agent_commission_assignments
        BEFORE UPDATE ON agent_commission_assignments
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;
