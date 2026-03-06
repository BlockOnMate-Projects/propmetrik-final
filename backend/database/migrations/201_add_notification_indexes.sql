-- ============================================================
-- 002_add_notification_indexes.sql — Performance indexes
-- ============================================================
-- Adds indexes to the user_notifications table to support
-- the new notification UI (dropdown + full page).
-- ============================================================

-- Index for unread notifications per user (most common query)
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON user_notifications (user_id, is_read, is_archived)
  WHERE is_read = false AND is_archived = false;

-- Index for category-based unread counts
CREATE INDEX IF NOT EXISTS idx_user_notifications_category_unread
  ON user_notifications (user_id, category)
  WHERE is_read = false AND is_archived = false;

-- Index for notification listing (sorted by created_at)
CREATE INDEX IF NOT EXISTS idx_user_notifications_created
  ON user_notifications (user_id, created_at DESC)
  WHERE is_archived = false;

-- Index for project search (used by global search)
CREATE INDEX IF NOT EXISTS idx_projects_search
  ON projects USING gin (to_tsvector('english', COALESCE(project_name, '') || ' ' || COALESCE(location, '')))
  ;

-- Index for RFI listing by project
CREATE INDEX IF NOT EXISTS idx_rfis_project_status
  ON rfis (project_id, status);

-- Index for change orders by project
CREATE INDEX IF NOT EXISTS idx_change_orders_project
  ON change_orders (project_id, status);
