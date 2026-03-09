-- ============================================================================
-- Migration 206: Saved Cost Estimates
-- Persistent storage for the Cost Estimator historical estimates dashboard.
-- Stores full estimate snapshots (settings + computed results) as JSONB,
-- with key columns indexed for listing / filtering.
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_cost_estimates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    created_by      UUID NOT NULL,          -- Keycloak user ID
    name            VARCHAR(255) NOT NULL,
    -- Key summary fields (indexed for sorting / filtering on dashboard)
    project_type    VARCHAR(100) NOT NULL,  -- residential_single, commercial_office, etc.
    region          VARCHAR(100) NOT NULL,  -- greater_accra, ashanti, etc.
    gfa_sqm         NUMERIC(12,2) NOT NULL,
    floors          INTEGER NOT NULL DEFAULT 1,
    spec_tier       VARCHAR(50) NOT NULL,   -- standard, premium, luxury
    currency        VARCHAR(10) NOT NULL DEFAULT 'GHS',
    total_cost      NUMERIC(15,2) NOT NULL,
    hard_cost       NUMERIC(15,2) NOT NULL,
    soft_cost       NUMERIC(15,2) NOT NULL,
    contingency     NUMERIC(15,2) NOT NULL,
    cost_per_sqm    NUMERIC(12,2) NOT NULL,
    -- Full snapshot of all inputs + computed data
    snapshot        JSONB NOT NULL DEFAULT '{}',
    -- Metadata
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'archived', 'deleted')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for dashboard listing
CREATE INDEX IF NOT EXISTS idx_cost_estimates_org
    ON project_cost_estimates (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_estimates_user
    ON project_cost_estimates (created_by, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_estimates_type
    ON project_cost_estimates (project_type);
CREATE INDEX IF NOT EXISTS idx_cost_estimates_region
    ON project_cost_estimates (region);
