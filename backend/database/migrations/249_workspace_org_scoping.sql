-- Migration 249: scope workspaces per-organization (fix cross-org chat leak).
--
-- PROBLEM: `workspaces` was keyed globally by UNIQUE (entity_type, entity_id) with no
-- organization in the key. The platform (company-wide) workspace is mounted with a single
-- HARDCODED entity_id ('00000000-0000-0000-0000-000000000000') for every user on every org,
-- so all organizations collapsed onto ONE shared workspace row. Each org's open-event then
-- bulk-added its own users into that same row → members and message history from different
-- companies were visible to each other (e.g. a PropMetrik user seeing a FinMarketIQ user).
--
-- MODEL (approved): Teams-tenant. One platform workspace PER organization; all members of
-- that org auto-join; PropMetrik staff get their own isolated company workspace. Server now
-- forces the platform workspace's entity_id = the caller's organization_id (see
-- routes/workspace.ts + WorkspaceService.ensureWorkspace).
--
-- This migration re-keys uniqueness per org and purges the poisoned shared workspace(s).
-- Idempotent.

BEGIN;

-- 1. Drop the global unique constraint (entity_type, entity_id). The inline UNIQUE from the
--    original CREATE TABLE is auto-named workspaces_entity_type_entity_id_key.
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_entity_type_entity_id_key;

-- 2. Purge the poisoned shared platform workspace(s): any platform workspace whose entity_id
--    is NOT its own organization_id is the old cross-org shared row. Its members/messages mix
--    multiple companies and cannot be cleanly attributed, so we drop it (CASCADE removes
--    members, messages, conversations, read-receipts, files). Each org's platform workspace is
--    recreated cleanly on next open with that org's members auto-synced.
--    Correctly-keyed per-org platform workspaces (entity_id = organization_id) are preserved,
--    so re-running this migration is safe.
DELETE FROM workspaces
WHERE entity_type = 'platform'
  AND entity_id <> organization_id;

-- 3. Re-key uniqueness to include organization so two orgs can never collapse onto one row.
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_entity_org_key;
ALTER TABLE workspaces ADD CONSTRAINT workspaces_entity_org_key
    UNIQUE (entity_type, entity_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_org_entity
    ON workspaces (organization_id, entity_type, entity_id);

COMMIT;
