-- Migration: 103_dashboard_alerts
-- Description: Dashboard alerts table for Phase 3.1 analytics split
-- Created: 2024
-- 
-- This migration creates the pm_dashboard_alerts table and supporting
-- structures for the DashboardAlertsService.

BEGIN;

-- =============================================================================
-- ALERT SEVERITY AND STATUS ENUMS
-- =============================================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN
    CREATE TYPE alert_severity AS ENUM (
      'critical',
      'high', 
      'medium',
      'low',
      'info'
    );
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_status') THEN
    CREATE TYPE alert_status AS ENUM (
      'active',
      'acknowledged',
      'resolved',
      'dismissed',
      'snoozed'
    );
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_category') THEN
    CREATE TYPE alert_category AS ENUM (
      'budget',
      'schedule',
      'quality',
      'risk',
      'compliance',
      'resource',
      'safety',
      'contract',
      'approval',
      'system'
    );
  END IF;
END $$;

-- =============================================================================
-- DASHBOARD ALERTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS pm_dashboard_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  
  -- Alert details
  category alert_category NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'medium',
  status alert_status NOT NULL DEFAULT 'active',
  
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  -- Source tracking (what generated this alert)
  source VARCHAR(100) NOT NULL, -- e.g., 'health_check', 'budget_monitor', 'schedule_check'
  source_id UUID, -- Optional reference to source entity
  
  -- Action link
  action_url TEXT,
  
  -- Acknowledgment
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  
  -- Resolution
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  
  -- Snoozing
  snoozed_until TIMESTAMPTZ,
  
  -- Additional data
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary query indexes
CREATE INDEX IF NOT EXISTS idx_pm_alerts_org_status 
  ON pm_dashboard_alerts(organization_id, status);
  
CREATE INDEX IF NOT EXISTS idx_pm_alerts_project 
  ON pm_dashboard_alerts(project_id) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pm_alerts_severity_status
  ON pm_dashboard_alerts(severity, status);

CREATE INDEX IF NOT EXISTS idx_pm_alerts_source 
  ON pm_dashboard_alerts(source, source_id);

-- Snooze expiration check
CREATE INDEX IF NOT EXISTS idx_pm_alerts_snoozed 
  ON pm_dashboard_alerts(snoozed_until) 
  WHERE status = 'snoozed';

-- Cleanup old alerts
CREATE INDEX IF NOT EXISTS idx_pm_alerts_cleanup 
  ON pm_dashboard_alerts(updated_at, status) 
  WHERE status IN ('resolved', 'dismissed');

-- =============================================================================
-- PROJECT HEALTH HISTORY TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS pm_project_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Health scores
  overall_score DECIMAL(5,2) NOT NULL,
  cost_score DECIMAL(5,2) NOT NULL,
  schedule_score DECIMAL(5,2) NOT NULL,
  quality_score DECIMAL(5,2) NOT NULL,
  risk_score DECIMAL(5,2),
  resource_score DECIMAL(5,2),
  compliance_score DECIMAL(5,2),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint per project per day
  CONSTRAINT pm_project_health_history_unique UNIQUE (project_id, date)
);

-- Index for trend queries
CREATE INDEX IF NOT EXISTS idx_pm_health_history_project_date
  ON pm_project_health_history(project_id, date DESC);

-- =============================================================================
-- PROGRESS HISTORY TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS pm_progress_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Progress metrics
  planned_progress DECIMAL(5,2) NOT NULL,
  actual_progress DECIMAL(5,2) NOT NULL,
  
  -- Task breakdown
  total_tasks INT,
  completed_tasks INT,
  in_progress_tasks INT,
  blocked_tasks INT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint per project per day
  CONSTRAINT pm_progress_history_unique UNIQUE (project_id, date)
);

-- Index for trend queries
CREATE INDEX IF NOT EXISTS idx_pm_progress_history_project_date
  ON pm_progress_history(project_id, date DESC);

-- =============================================================================
-- TRIGGER: Auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_pm_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_pm_alerts_updated_at ON pm_dashboard_alerts;

CREATE TRIGGER tr_pm_alerts_updated_at
  BEFORE UPDATE ON pm_dashboard_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_pm_alerts_updated_at();

-- =============================================================================
-- FUNCTION: Record daily health snapshot
-- =============================================================================

CREATE OR REPLACE FUNCTION record_project_health_snapshot()
RETURNS void AS $$
BEGIN
  -- This would be called by a scheduled job
  INSERT INTO pm_project_health_history (
    project_id, 
    date, 
    overall_score, 
    cost_score, 
    schedule_score, 
    quality_score
  )
  SELECT 
    p.id,
    CURRENT_DATE,
    COALESCE(p.overall_progress, 0), -- Placeholder - real calculation would be more complex
    50.0, -- Placeholder
    50.0, -- Placeholder
    50.0  -- Placeholder
  FROM development_projects p
  WHERE p.status NOT IN ('completed', 'cancelled', 'on_hold')
    AND p.deleted_at IS NULL
  ON CONFLICT (project_id, date) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Record daily progress snapshot
-- =============================================================================

CREATE OR REPLACE FUNCTION record_project_progress_snapshot()
RETURNS void AS $$
BEGIN
  INSERT INTO pm_progress_history (
    project_id,
    date,
    planned_progress,
    actual_progress,
    total_tasks,
    completed_tasks,
    in_progress_tasks,
    blocked_tasks
  )
  SELECT 
    p.id,
    CURRENT_DATE,
    -- Calculate planned progress based on timeline
    LEAST(100, GREATEST(0,
      EXTRACT(EPOCH FROM (CURRENT_DATE - p.planned_start_date)) /
      NULLIF(EXTRACT(EPOCH FROM (p.planned_completion_date - p.planned_start_date)), 0) * 100
    )),
    COALESCE(p.overall_progress, 0),
    (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status = 'completed' AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status = 'in_progress' AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status = 'blocked' AND deleted_at IS NULL)
  FROM development_projects p
  WHERE p.status NOT IN ('completed', 'cancelled')
    AND p.deleted_at IS NULL
  ON CONFLICT (project_id, date) DO UPDATE SET
    actual_progress = EXCLUDED.actual_progress,
    total_tasks = EXCLUDED.total_tasks,
    completed_tasks = EXCLUDED.completed_tasks,
    in_progress_tasks = EXCLUDED.in_progress_tasks,
    blocked_tasks = EXCLUDED.blocked_tasks;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE pm_dashboard_alerts IS 'Dashboard alerts for project management monitoring';
COMMENT ON TABLE pm_project_health_history IS 'Historical health scores for trend analysis';
COMMENT ON TABLE pm_progress_history IS 'Historical progress data for trend analysis';

COMMIT;
