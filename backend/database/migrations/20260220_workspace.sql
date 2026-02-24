-- ============================================================
-- Workspace & Collaboration Migration
-- Phase 1: Core workspace tables for real-time chat
-- ============================================================

-- WORKSPACES (one per entity)
CREATE TABLE IF NOT EXISTS workspaces (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      TEXT NOT NULL CHECK (entity_type IN ('project','valuation','deal','property')),
  entity_id        UUID NOT NULL,
  organization_id  UUID NOT NULL,
  name             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_entity ON workspaces(entity_type, entity_id);

-- WORKSPACE MEMBERS
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  role         TEXT DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY  (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- MESSAGES
CREATE TABLE IF NOT EXISTS workspace_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sender_id    UUID,  -- NULL means system/kobby_ai
  sender_type  TEXT DEFAULT 'user' CHECK (sender_type IN ('user','system','kobby_ai')),
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text','file','system','ai_response')),
  content      TEXT NOT NULL,
  metadata     JSONB,
  thread_id    UUID REFERENCES workspace_messages(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  edited_at    TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ  -- soft delete for GDPR compliance
);

CREATE INDEX IF NOT EXISTS idx_wm_workspace_time ON workspace_messages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_sender ON workspace_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_wm_thread ON workspace_messages(thread_id);

-- READ RECEIPTS
CREATE TABLE IF NOT EXISTS workspace_message_reads (
  message_id UUID NOT NULL REFERENCES workspace_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  read_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wmr_user ON workspace_message_reads(user_id);

-- FILES
CREATE TABLE IF NOT EXISTS workspace_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id   UUID REFERENCES workspace_messages(id),
  uploaded_by  UUID,
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_size    BIGINT,
  mime_type    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_files_ws ON workspace_files(workspace_id);
