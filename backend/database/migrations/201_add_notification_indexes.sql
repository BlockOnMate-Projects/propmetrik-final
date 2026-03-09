-- ============================================================
-- 201_add_notification_indexes.sql — Performance indexes
-- ============================================================
-- Adds indexes to improve query performance.
-- Note: Some tables are owned by propmetrik_admin. We wrap
-- each index creation in an exception handler so failures
-- on admin-owned tables do not block the migration.
-- ============================================================

-- Index for unread notifications per user (most common query)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
    ON user_notifications (user_id, is_read, is_archived)
    WHERE is_read = false AND is_archived = false;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping idx_user_notifications_unread — insufficient privileges';
END $$;

-- Index for category-based unread counts
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_user_notifications_category_unread
    ON user_notifications (user_id, category)
    WHERE is_read = false AND is_archived = false;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping idx_user_notifications_category_unread — insufficient privileges';
END $$;

-- Index for notification listing (sorted by created_at)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_user_notifications_created
    ON user_notifications (user_id, created_at DESC)
    WHERE is_archived = false;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping idx_user_notifications_created — insufficient privileges';
END $$;

-- Index for project search (used by global search)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_projects_search
    ON projects USING gin (to_tsvector('english', COALESCE(project_name, '') || ' ' || COALESCE(location, '')));
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'Skipping idx_projects_search — table not found or insufficient privileges';
END $$;

-- Index for RFI listing by project
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_rfis_project_status
    ON rfis (project_id, status);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping idx_rfis_project_status — insufficient privileges';
END $$;

-- Index for change orders by project
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_change_orders_project
    ON change_orders (project_id, status);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping idx_change_orders_project — insufficient privileges';
END $$;
