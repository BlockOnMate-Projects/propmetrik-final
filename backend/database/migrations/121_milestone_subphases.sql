-- Migration: Milestone Sub-phases
-- Description: Adds sub-phases/tasks within milestones for detailed tracking
-- Date: 2026-01-25

-- =====================================================
-- MILESTONE SUB-PHASES TABLE
-- =====================================================
-- Sub-phases allow breaking down milestones into smaller, 
-- trackable tasks while maintaining the milestone as the 
-- parent container.

CREATE TABLE IF NOT EXISTS milestone_subphases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  
  -- Sub-phase details
  name VARCHAR(200) NOT NULL,
  description TEXT,
  sequence_order INTEGER DEFAULT 0,
  
  -- Dates
  start_date DATE,
  end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  
  -- Progress tracking
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 
    'in_progress', 
    'completed', 
    'blocked',
    'cancelled'
  )),
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  
  -- Assignment
  assigned_to UUID[], -- Array of user IDs
  assigned_team VARCHAR(100), -- Team name
  
  -- Effort tracking
  estimated_hours DECIMAL(10,2),
  actual_hours DECIMAL(10,2),
  
  -- Dependencies (within the same milestone)
  depends_on_subphase_ids UUID[] DEFAULT '{}',
  
  -- Notes and attachments
  notes TEXT,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  
  -- Indexes for common queries
  CONSTRAINT fk_milestone_subphase_org 
    FOREIGN KEY (organization_id) 
    REFERENCES organizations(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_milestone_subphases_milestone_id 
  ON milestone_subphases(milestone_id);

CREATE INDEX IF NOT EXISTS idx_milestone_subphases_project_id 
  ON milestone_subphases(project_id);

CREATE INDEX IF NOT EXISTS idx_milestone_subphases_status 
  ON milestone_subphases(status);

CREATE INDEX IF NOT EXISTS idx_milestone_subphases_sequence 
  ON milestone_subphases(milestone_id, sequence_order);

-- =====================================================
-- UPDATE TRIGGER FOR updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_milestone_subphase_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_milestone_subphase_updated_at ON milestone_subphases;
CREATE TRIGGER trigger_milestone_subphase_updated_at
  BEFORE UPDATE ON milestone_subphases
  FOR EACH ROW
  EXECUTE FUNCTION update_milestone_subphase_updated_at();

-- =====================================================
-- VIEW: Milestone with Sub-phase Summary
-- =====================================================
CREATE OR REPLACE VIEW milestone_subphase_summary AS
SELECT 
  pm.id as milestone_id,
  pm.name as milestone_name,
  pm.project_id,
  pm.status as milestone_status,
  pm.target_date,
  COUNT(ms.id) as total_subphases,
  COUNT(ms.id) FILTER (WHERE ms.status = 'completed') as completed_subphases,
  COUNT(ms.id) FILTER (WHERE ms.status = 'in_progress') as in_progress_subphases,
  COUNT(ms.id) FILTER (WHERE ms.status = 'pending') as pending_subphases,
  COUNT(ms.id) FILTER (WHERE ms.status = 'blocked') as blocked_subphases,
  CASE 
    WHEN COUNT(ms.id) > 0 
    THEN ROUND(AVG(ms.progress_percentage)::numeric, 0)
    ELSE 0
  END as avg_progress,
  COALESCE(SUM(ms.estimated_hours), 0) as total_estimated_hours,
  COALESCE(SUM(ms.actual_hours), 0) as total_actual_hours
FROM project_milestones pm
LEFT JOIN milestone_subphases ms ON ms.milestone_id = pm.id
GROUP BY pm.id, pm.name, pm.project_id, pm.status, pm.target_date;

-- =====================================================
-- FUNCTION: Calculate milestone progress from sub-phases
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_milestone_progress(p_milestone_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_progress INTEGER;
BEGIN
  SELECT COALESCE(ROUND(AVG(progress_percentage)::numeric, 0), 0)
  INTO v_progress
  FROM milestone_subphases
  WHERE milestone_id = p_milestone_id;
  
  RETURN v_progress;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGER: Auto-update milestone status based on sub-phases
-- =====================================================
CREATE OR REPLACE FUNCTION update_milestone_from_subphases()
RETURNS TRIGGER AS $$
DECLARE
  v_total INTEGER;
  v_completed INTEGER;
  v_in_progress INTEGER;
  v_blocked INTEGER;
BEGIN
  -- Count sub-phase statuses
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'in_progress'),
    COUNT(*) FILTER (WHERE status = 'blocked')
  INTO v_total, v_completed, v_in_progress, v_blocked
  FROM milestone_subphases
  WHERE milestone_id = COALESCE(NEW.milestone_id, OLD.milestone_id);
  
  -- Only update if there are sub-phases
  IF v_total > 0 THEN
    -- Update milestone status based on sub-phases
    UPDATE project_milestones
    SET status = CASE
      WHEN v_completed = v_total THEN 'completed'
      WHEN v_blocked > 0 THEN 'blocked'
      WHEN v_in_progress > 0 OR v_completed > 0 THEN 'in_progress'
      ELSE 'pending'
    END,
    updated_at = NOW()
    WHERE id = COALESCE(NEW.milestone_id, OLD.milestone_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_milestone_from_subphases ON milestone_subphases;
CREATE TRIGGER trigger_update_milestone_from_subphases
  AFTER INSERT OR UPDATE OR DELETE ON milestone_subphases
  FOR EACH ROW
  EXECUTE FUNCTION update_milestone_from_subphases();

-- =====================================================
-- Grant permissions
-- =====================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON milestone_subphases TO propmetrik_app;
GRANT SELECT ON milestone_subphase_summary TO propmetrik_app;
