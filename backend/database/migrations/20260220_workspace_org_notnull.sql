-- Migration: Make workspace organization_id NOT NULL
-- Backfill any rows with NULL organization_id with the default dev org

-- Step 1: Backfill NULLs with default organization
UPDATE workspaces
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Step 2: Add NOT NULL constraint
ALTER TABLE workspaces
    ALTER COLUMN organization_id SET NOT NULL;

-- Step 3: Add edited_at column to workspace_messages if not exists
ALTER TABLE workspace_messages
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL;
