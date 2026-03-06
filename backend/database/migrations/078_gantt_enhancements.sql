-- Migration: 078_gantt_enhancements.sql
-- Phase 2 Sprint 4: Gantt Chart & Timeline Enhancements
-- 
-- Creates tables for:
-- - project_milestones: Key milestones with Ghana-specific types
-- - project_baselines: Snapshot storage for baseline comparisons
-- - Phase enhancements: baseline dates, critical path flags

-- ============================================================================
-- PHASE ENHANCEMENTS
-- ============================================================================

-- Add baseline and critical path columns to project_phases
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_phases' AND column_name = 'baseline_start_date') 
  THEN
    ALTER TABLE project_phases ADD COLUMN baseline_start_date DATE;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_phases' AND column_name = 'baseline_end_date') 
  THEN
    ALTER TABLE project_phases ADD COLUMN baseline_end_date DATE;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_phases' AND column_name = 'is_critical_path') 
  THEN
    ALTER TABLE project_phases ADD COLUMN is_critical_path BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_phases' AND column_name = 'slack_days') 
  THEN
    ALTER TABLE project_phases ADD COLUMN slack_days INTEGER DEFAULT 0;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_phases' AND column_name = 'dependency_ids') 
  THEN
    ALTER TABLE project_phases ADD COLUMN dependency_ids UUID[] DEFAULT '{}';
  END IF;
END $$;

-- Comments for phase enhancements
COMMENT ON COLUMN project_phases.baseline_start_date IS 'Original planned start date captured at baseline';
COMMENT ON COLUMN project_phases.baseline_end_date IS 'Original planned end date captured at baseline';
COMMENT ON COLUMN project_phases.is_critical_path IS 'Whether this phase is on the critical path';
COMMENT ON COLUMN project_phases.slack_days IS 'Number of days this phase can slip without affecting project end date';
COMMENT ON COLUMN project_phases.dependency_ids IS 'Array of phase IDs that must complete before this phase starts';

-- ============================================================================
-- PROJECT MILESTONES
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL,
  
  -- Milestone details
  name VARCHAR(200) NOT NULL,
  description TEXT,
  milestone_code VARCHAR(50), -- e.g., 'EPA-001', 'FIRE-001'
  
  -- Dates
  target_date DATE NOT NULL,
  actual_date DATE,
  baseline_date DATE,
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 
    'in_progress', 
    'completed', 
    'missed', 
    'rescheduled',
    'blocked'
  )),
  
  -- Categorization
  milestone_type VARCHAR(50) CHECK (milestone_type IN (
    'permit',        -- Regulatory permits (EPA, Building, Fire)
    'inspection',    -- Site inspections
    'payment',       -- Payment milestones
    'handover',      -- Unit/project handovers
    'construction',  -- Construction milestones (foundation, roofing)
    'legal',         -- Legal milestones (land title, contracts)
    'internal',      -- Internal checkpoints
    'external'       -- External dependencies
  )),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  
  -- Ghana-specific
  is_ghana_specific BOOLEAN DEFAULT false,
  permit_type_id UUID REFERENCES permit_types(id), -- Link to permit if applicable
  
  -- Notifications
  reminder_days INTEGER[] DEFAULT '{7, 3, 1}', -- Days before target to send reminders
  notify_users UUID[] DEFAULT '{}', -- User IDs to notify
  last_reminder_sent TIMESTAMP WITH TIME ZONE,
  
  -- Dependencies
  depends_on_milestone_ids UUID[] DEFAULT '{}',
  blocks_milestone_ids UUID[] DEFAULT '{}',
  
  -- Additional data
  notes TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Audit
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for milestones
CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_phase ON project_milestones(phase_id);
CREATE INDEX IF NOT EXISTS idx_milestones_org ON project_milestones(organization_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON project_milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_target_date ON project_milestones(target_date);
CREATE INDEX IF NOT EXISTS idx_milestones_type ON project_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_milestones_upcoming ON project_milestones(target_date) 
  WHERE status IN ('pending', 'in_progress');

-- ============================================================================
-- PROJECT BASELINES
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  
  -- Baseline info
  name VARCHAR(100) NOT NULL,
  description TEXT,
  baseline_number INTEGER NOT NULL, -- 1, 2, 3... for versioning
  
  -- Snapshot data
  snapshot_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  phases_snapshot JSONB NOT NULL, -- Array of phase data at baseline time
  milestones_snapshot JSONB DEFAULT '[]'::jsonb, -- Array of milestone data
  budget_snapshot JSONB DEFAULT '{}'::jsonb, -- Budget figures at baseline
  
  -- Project metrics at baseline
  total_budget NUMERIC(15, 2),
  planned_start_date DATE,
  planned_end_date DATE,
  total_phases INTEGER,
  total_milestones INTEGER,
  
  -- Status
  is_active BOOLEAN DEFAULT true, -- Is this the current comparison baseline?
  is_locked BOOLEAN DEFAULT false, -- Prevent modifications
  
  -- Audit
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for baselines
CREATE INDEX IF NOT EXISTS idx_baselines_project ON project_baselines(project_id);
CREATE INDEX IF NOT EXISTS idx_baselines_active ON project_baselines(project_id, is_active) WHERE is_active = true;

-- ============================================================================
-- MILESTONE TEMPLATES (Ghana-specific)
-- ============================================================================

CREATE TABLE IF NOT EXISTS milestone_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID, -- NULL for system templates
  
  -- Template details
  name VARCHAR(200) NOT NULL,
  description TEXT,
  milestone_type VARCHAR(50) NOT NULL,
  
  -- Default timing
  phase_code VARCHAR(50), -- Which phase this typically belongs to
  typical_offset_days INTEGER DEFAULT 0, -- Days from phase start
  typical_duration_days INTEGER DEFAULT 0, -- For multi-day milestones
  
  -- Ghana-specific
  is_ghana_specific BOOLEAN DEFAULT false,
  permit_type_id UUID REFERENCES permit_types(id),
  required_for_project_types VARCHAR[] DEFAULT '{}', -- e.g., {'residential_multi', 'commercial'}
  
  -- Display
  display_order INTEGER DEFAULT 0,
  icon VARCHAR(50),
  color VARCHAR(20),
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Ghana-specific milestone templates
INSERT INTO milestone_templates (name, description, milestone_type, phase_code, is_ghana_specific, required_for_project_types, display_order) VALUES
  ('Land Title Registration', 'Complete registration with Ghana Lands Commission', 'legal', 'land_acquisition', true, '{"residential_single","residential_multi","commercial","mixed_use"}', 1),
  ('Site Survey Completion', 'Licensed surveyor site survey and documentation', 'legal', 'land_acquisition', true, '{"residential_single","residential_multi","commercial","mixed_use"}', 2),
  ('EPA Permit Approved', 'Environmental Protection Agency permit approval', 'permit', 'pre_construction', true, '{"residential_multi","commercial","mixed_use"}', 3),
  ('Development Permit Approved', 'Metropolitan/Municipal Assembly development permit', 'permit', 'pre_construction', true, '{"residential_single","residential_multi","commercial","mixed_use"}', 4),
  ('Building Permit Approved', 'Metropolitan/Municipal Assembly building permit', 'permit', 'pre_construction', true, '{"residential_single","residential_multi","commercial","mixed_use"}', 5),
  ('Commencement Permit Obtained', 'Permit to commence construction works', 'permit', 'construction', true, '{"residential_single","residential_multi","commercial","mixed_use"}', 6),
  ('Foundation Inspection Passed', 'Structural foundation inspection by Assembly', 'inspection', 'construction', true, '{"residential_single","residential_multi","commercial","mixed_use"}', 7),
  ('First Floor Slab Inspection', 'Inspection of first floor concrete slab', 'inspection', 'construction', true, '{"residential_multi","commercial","mixed_use"}', 8),
  ('Roofing Completion', 'Roof structure and covering complete', 'construction', 'construction', false, '{"residential_single","residential_multi","commercial","mixed_use"}', 9),
  ('GWCL Water Connection', 'Ghana Water Company Limited connection approval', 'permit', 'finishing', true, '{"residential_single","residential_multi","commercial","mixed_use"}', 10),
  ('ECG Electricity Connection', 'Electricity Company of Ghana connection approval', 'permit', 'finishing', true, '{"residential_single","residential_multi","commercial","mixed_use"}', 11),
  ('Fire Safety Certificate Issued', 'Ghana National Fire Service certificate', 'permit', 'finishing', true, '{"residential_multi","commercial","mixed_use"}', 12),
  ('Habitation Certificate Obtained', 'Certificate of habitability from Assembly', 'permit', 'handover', true, '{"residential_single","residential_multi","commercial","mixed_use"}', 13),
  ('First Unit Handover', 'First completed unit handed over to buyer', 'handover', 'handover', false, '{"residential_single","residential_multi"}', 14),
  ('Project Completion', 'All units complete and common areas finished', 'internal', 'handover', false, '{"residential_single","residential_multi","commercial","mixed_use"}', 15)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- ALERT TRACKING TABLE (for dashboard alerts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  
  -- Alert details
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
    'budget_warning',      -- 80-95% budget utilized
    'budget_exceeded',     -- >100% budget utilized
    'milestone_due',       -- Milestone approaching
    'milestone_missed',    -- Milestone passed without completion
    'permit_expiring',     -- Permit expiration approaching
    'permit_expired',      -- Permit has expired
    'phase_delayed',       -- Phase behind schedule
    'payment_due',         -- Payment milestone approaching
    'inspection_required', -- Inspection needed
    'document_expiring',   -- Document expiration warning
    'low_progress',        -- Construction progress stalled
    'cost_variance'        -- Significant cost variance detected
  )),
  severity VARCHAR(20) DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  
  -- Content
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  
  -- Reference
  reference_type VARCHAR(50), -- 'phase', 'milestone', 'permit', 'cost', etc.
  reference_id UUID,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'snoozed', 'dismissed')),
  snoozed_until TIMESTAMP WITH TIME ZONE,
  
  -- Actions
  action_url TEXT,
  action_label VARCHAR(100),
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID
);

-- Indexes for alerts
CREATE INDEX IF NOT EXISTS idx_alerts_project ON project_alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_alerts_org ON project_alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON project_alerts(organization_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON project_alerts(severity, status);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON project_alerts(alert_type);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp triggers
DROP TRIGGER IF EXISTS update_project_milestones_updated_at ON project_milestones;
CREATE TRIGGER update_project_milestones_updated_at
  BEFORE UPDATE ON project_milestones
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_project_baselines_updated_at ON project_baselines;
CREATE TRIGGER update_project_baselines_updated_at
  BEFORE UPDATE ON project_baselines
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to auto-generate alerts for milestone due dates
CREATE OR REPLACE FUNCTION check_milestone_alerts()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if milestone is approaching (within reminder days)
  IF NEW.status = 'pending' AND NEW.target_date IS NOT NULL THEN
    -- Check if within 7 days
    IF NEW.target_date - CURRENT_DATE <= 7 AND NEW.target_date >= CURRENT_DATE THEN
      INSERT INTO project_alerts (
        project_id, organization_id, alert_type, severity,
        title, message, reference_type, reference_id
      ) VALUES (
        NEW.project_id, NEW.organization_id, 'milestone_due', 
        CASE 
          WHEN NEW.target_date - CURRENT_DATE <= 1 THEN 'critical'
          WHEN NEW.target_date - CURRENT_DATE <= 3 THEN 'error'
          ELSE 'warning'
        END,
        'Milestone Due: ' || NEW.name,
        'Milestone "' || NEW.name || '" is due on ' || NEW.target_date::text,
        'milestone', NEW.id
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  -- Check if milestone was missed
  IF NEW.status = 'pending' AND OLD.status = 'pending' 
     AND NEW.target_date < CURRENT_DATE THEN
    INSERT INTO project_alerts (
      project_id, organization_id, alert_type, severity,
      title, message, reference_type, reference_id
    ) VALUES (
      NEW.project_id, NEW.organization_id, 'milestone_missed', 'critical',
      'Milestone Missed: ' || NEW.name,
      'Milestone "' || NEW.name || '" was due on ' || NEW.target_date::text || ' and has not been completed',
      'milestone', NEW.id
    ) ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger for milestone alerts
DROP TRIGGER IF EXISTS trigger_milestone_alerts ON project_milestones;
CREATE TRIGGER trigger_milestone_alerts
  AFTER INSERT OR UPDATE ON project_milestones
  FOR EACH ROW EXECUTE FUNCTION check_milestone_alerts();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE project_milestones IS 'Key project milestones with Ghana-specific permit and inspection tracking';
COMMENT ON TABLE project_baselines IS 'Point-in-time snapshots for baseline comparison analysis';
COMMENT ON TABLE milestone_templates IS 'Reusable milestone templates including Ghana regulatory milestones';
COMMENT ON TABLE project_alerts IS 'System-generated and manual project alerts for dashboard notifications';
