-- ============================================================================
-- 207: Link cost estimates → development projects
-- ============================================================================
-- Adds project_id FK so we can track which estimates were converted to projects.

ALTER TABLE project_cost_estimates
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES development_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cost_estimates_project_id
  ON project_cost_estimates(project_id) WHERE project_id IS NOT NULL;
