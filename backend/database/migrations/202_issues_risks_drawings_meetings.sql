-- ============================================================
-- 003_issues_risks_drawings_meetings.sql
-- Tables for Issues & Risks, Drawings, and Meeting Minutes
-- Pattern: gen_random_uuid(), no FKs to development_projects (soft refs)
-- ============================================================

-- ── Issues ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  issue_number VARCHAR(20),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  severity VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'open',
  priority VARCHAR(20) DEFAULT 'medium',
  assigned_to UUID,
  due_date DATE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,
  location VARCHAR(255),
  tags TEXT[],
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_issues_project ON project_issues(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_issues_org ON project_issues(organization_id);

-- ── Risks ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  risk_number VARCHAR(20),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  risk_level VARCHAR(20) DEFAULT 'medium',
  probability VARCHAR(20) DEFAULT 'possible',
  impact VARCHAR(20) DEFAULT 'moderate',
  status VARCHAR(20) DEFAULT 'identified',
  mitigation_plan TEXT,
  contingency_plan TEXT,
  owner_id UUID,
  trigger_conditions TEXT,
  response_strategy VARCHAR(50) DEFAULT 'mitigate',
  cost_impact NUMERIC(15,2),
  schedule_impact_days INTEGER,
  residual_risk_level VARCHAR(20),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_risks_project ON project_risks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_risks_org ON project_risks(organization_id);

-- ── Drawings ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  drawing_number VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  discipline VARCHAR(50) DEFAULT 'architectural',
  current_revision VARCHAR(20) DEFAULT 'A',
  status VARCHAR(20) DEFAULT 'draft',
  description TEXT,
  sheet_size VARCHAR(10) DEFAULT 'A1',
  scale VARCHAR(20),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drawing_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id UUID NOT NULL REFERENCES project_drawings(id) ON DELETE CASCADE,
  revision_number VARCHAR(20) NOT NULL,
  file_name VARCHAR(500),
  file_url TEXT,
  file_size BIGINT,
  mime_type VARCHAR(100),
  change_description TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'draft',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_drawings_project ON project_drawings(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_revisions_drawing ON drawing_revisions(drawing_id);

-- ── Meeting Minutes ────────────────────────────────
CREATE TABLE IF NOT EXISTS project_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  meeting_number VARCHAR(20),
  title VARCHAR(500) NOT NULL,
  meeting_type VARCHAR(50) DEFAULT 'general',
  meeting_date TIMESTAMPTZ NOT NULL,
  start_time TIME,
  end_time TIME,
  location VARCHAR(255),
  status VARCHAR(20) DEFAULT 'scheduled',
  summary TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES project_meetings(id) ON DELETE CASCADE,
  user_id UUID,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(100),
  attended BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meeting_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES project_meetings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  assigned_to UUID,
  assigned_to_name VARCHAR(255),
  due_date DATE,
  status VARCHAR(20) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'normal',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_meetings_project ON project_meetings(project_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting ON meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_action_items_meeting ON meeting_action_items(meeting_id);
