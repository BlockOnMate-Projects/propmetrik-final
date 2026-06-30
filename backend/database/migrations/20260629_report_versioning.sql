-- Report versioning: revision lineage + reason. `version` and `status` (incl. 'superseded') already exist.
ALTER TABLE valuation_reports ADD COLUMN IF NOT EXISTS supersedes_report_id UUID REFERENCES valuation_reports(id) ON DELETE SET NULL;
ALTER TABLE valuation_reports ADD COLUMN IF NOT EXISTS revision_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_valuation_reports_supersedes ON valuation_reports(supersedes_report_id);
