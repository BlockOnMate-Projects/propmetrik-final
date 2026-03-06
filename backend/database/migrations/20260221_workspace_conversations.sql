-- Enterprise workspace conversations (DMs, groups, channels)

CREATE TABLE IF NOT EXISTS workspace_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_type TEXT NOT NULL CHECK (conversation_type IN ('channel','dm','group')),
  name              TEXT,
  dm_key            TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  archived_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_conversations_dm_key
  ON workspace_conversations(workspace_id, dm_key)
  WHERE dm_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_conversations_workspace
  ON workspace_conversations(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_conversation_members (
  conversation_id UUID NOT NULL REFERENCES workspace_conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  added_by        UUID,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_conversation_members_user
  ON workspace_conversation_members(user_id);

-- Add scoped conversation_id to messages
ALTER TABLE workspace_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES workspace_conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_workspace_messages_conversation_time
  ON workspace_messages(conversation_id, created_at DESC);

-- Backfill: create a default channel conversation per workspace
WITH created AS (
  INSERT INTO workspace_conversations (workspace_id, conversation_type, name, dm_key)
  SELECT w.id, 'channel', 'General', NULL
  FROM workspaces w
  WHERE NOT EXISTS (
    SELECT 1 FROM workspace_conversations c
    WHERE c.workspace_id = w.id AND c.conversation_type = 'channel' AND c.name = 'General'
  )
  RETURNING id, workspace_id
)
INSERT INTO workspace_conversation_members (conversation_id, user_id, role)
SELECT c.id, wm.user_id, CASE WHEN wm.role = 'admin' THEN 'admin' ELSE 'member' END
FROM created c
JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Ensure default channel membership for existing conversations/workspaces
INSERT INTO workspace_conversation_members (conversation_id, user_id, role)
SELECT c.id, wm.user_id, CASE WHEN wm.role = 'admin' THEN 'admin' ELSE 'member' END
FROM workspace_conversations c
JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
WHERE c.conversation_type = 'channel' AND c.name = 'General'
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Backfill messages with default 'General' conversation
UPDATE workspace_messages m
SET conversation_id = c.id
FROM workspace_conversations c
WHERE m.conversation_id IS NULL
  AND c.workspace_id = m.workspace_id
  AND c.conversation_type = 'channel'
  AND c.name = 'General';

ALTER TABLE workspace_messages
  ALTER COLUMN conversation_id SET NOT NULL;
