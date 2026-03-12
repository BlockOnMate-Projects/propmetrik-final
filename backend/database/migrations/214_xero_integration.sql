-- Migration 214: Xero Integration Columns
-- Adds xero tracking columns to project_costs for idempotent sync

-- Track the Xero Contact ID per cost (avoids duplicate contact creation)
ALTER TABLE project_costs
  ADD COLUMN IF NOT EXISTS xero_contact_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS xero_synced_at TIMESTAMPTZ;

-- Index for efficient "sync pending" queries (approved costs not yet synced)
CREATE INDEX IF NOT EXISTS idx_project_costs_xero_sync
  ON project_costs (organization_id, status, xero_synced_at)
  WHERE status = 'approved' AND xero_synced_at IS NULL;

-- Ensure integration_logs table can store request/response payloads (already exists in most deployments)
-- Add columns if missing (safe no-op if they already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'integration_logs' AND column_name = 'request_payload') THEN
    ALTER TABLE integration_logs ADD COLUMN request_payload JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'integration_logs' AND column_name = 'response_payload') THEN
    ALTER TABLE integration_logs ADD COLUMN response_payload JSONB;
  END IF;
END
$$;
