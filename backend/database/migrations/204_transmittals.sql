-- Migration 204: PM Transmittals
-- Formal document distribution tracking with acknowledgement

-- Transmittal log: the main record
CREATE TABLE IF NOT EXISTS pm_transmittals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  organization_id UUID,

  -- Numbering
  transmittal_number TEXT NOT NULL,           -- e.g. "T-001"
  revision      INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  subject       TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','issued','partially_acknowledged','fully_acknowledged','closed','void')),

  -- Parties
  from_user_id  UUID,                         -- sender
  to_company    TEXT,                          -- receiving company name
  to_contact    TEXT,                          -- recipient name
  to_email      TEXT,                          -- recipient email
  cc_emails     TEXT[],                        -- CC recipients

  -- Distribution
  issued_at     TIMESTAMPTZ,
  due_date      DATE,
  purpose       TEXT NOT NULL DEFAULT 'for_review'
                CHECK (purpose IN ('for_review','for_approval','for_information','for_construction','for_record','as_requested')),
  priority      TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low','normal','high','urgent')),

  -- Response
  response_required BOOLEAN NOT NULL DEFAULT true,
  responded_at  TIMESTAMPTZ,
  response_notes TEXT,

  -- Audit
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transmittal items: one row per document in the transmittal
CREATE TABLE IF NOT EXISTS pm_transmittal_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transmittal_id  UUID NOT NULL REFERENCES pm_transmittals(id) ON DELETE CASCADE,

  -- What is being transmitted
  item_number     INTEGER NOT NULL DEFAULT 1,
  document_title  TEXT NOT NULL,
  document_ref    TEXT,                        -- drawing number, spec section, etc.
  revision        TEXT,                        -- document revision
  copies          INTEGER NOT NULL DEFAULT 1,
  format          TEXT DEFAULT 'digital'
                  CHECK (format IN ('digital','hardcopy','both')),

  -- Optional link to stored file
  file_url        TEXT,
  file_name       TEXT,
  file_size       BIGINT,

  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transmittal recipients with individual acknowledgement tracking
CREATE TABLE IF NOT EXISTS pm_transmittal_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transmittal_id  UUID NOT NULL REFERENCES pm_transmittals(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name  TEXT,
  acknowledged    BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity log for transmittal events
CREATE TABLE IF NOT EXISTS pm_transmittal_activity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transmittal_id  UUID NOT NULL REFERENCES pm_transmittals(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,               -- 'created','issued','acknowledged','responded','closed','revised'
  performed_by    UUID,
  details         JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pm_transmittals_project     ON pm_transmittals(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_transmittals_org         ON pm_transmittals(organization_id);
CREATE INDEX IF NOT EXISTS idx_pm_transmittals_status      ON pm_transmittals(status);
CREATE INDEX IF NOT EXISTS idx_pm_transmittals_from        ON pm_transmittals(from_user_id);
CREATE INDEX IF NOT EXISTS idx_pm_transmittals_issued      ON pm_transmittals(issued_at);
CREATE INDEX IF NOT EXISTS idx_pm_transmittal_items_tid    ON pm_transmittal_items(transmittal_id);
CREATE INDEX IF NOT EXISTS idx_pm_transmittal_recipients_tid ON pm_transmittal_recipients(transmittal_id);
CREATE INDEX IF NOT EXISTS idx_pm_transmittal_activity_tid ON pm_transmittal_activity(transmittal_id);
