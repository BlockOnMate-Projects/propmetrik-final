-- QuickBooks Online integration — per-cost sync markers on project_costs (mirrors Xero, mig 214).
-- Idempotent.

ALTER TABLE project_costs
  ADD COLUMN IF NOT EXISTS quickbooks_vendor_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS quickbooks_synced_at TIMESTAMPTZ;

-- Fast lookup of approved-but-unsynced costs for the bulk sync job.
CREATE INDEX IF NOT EXISTS idx_project_costs_qb_unsynced
  ON project_costs (organization_id, status, quickbooks_synced_at)
  WHERE status = 'approved' AND quickbooks_synced_at IS NULL;
