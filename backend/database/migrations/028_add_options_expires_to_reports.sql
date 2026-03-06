-- Migration 028: Add options and expires_at columns to valuation_reports
-- These columns were missing from the original schema but expected by reportService

-- Add options column for report generation options
ALTER TABLE valuation_reports 
ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '{}'::jsonb;

-- Add expires_at column for report expiry tracking
ALTER TABLE valuation_reports 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Add index on expires_at for efficient expiry queries
CREATE INDEX IF NOT EXISTS idx_valuation_reports_expires_at 
ON valuation_reports(expires_at) 
WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN valuation_reports.options IS 'Report generation options and preferences';
COMMENT ON COLUMN valuation_reports.expires_at IS 'Report expiration date (typically 6 months from approval)';
