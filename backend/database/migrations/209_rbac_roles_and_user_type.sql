-- Migration 209: RBAC Security Hardening — Add missing roles & user_type column
-- ═══════════════════════════════════════════════════════════════════════════════
-- Part of Phase 1 RBAC implementation per rbac.md specification.
-- 
-- Changes:
--   1. Add 'project_manager' to user_role_enum (exists in frontend, missing in backend)
--   2. Add 'api_client' to user_role_enum (for automated integrations)
--   3. Add user_type column to users table (staff vs customer discriminator)
--   4. Add is_service_account flag to users table
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add missing roles to user_role_enum
--    ALTER TYPE ... ADD VALUE is idempotent with IF NOT EXISTS
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'project_manager';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'api_client';

-- 2. Add user_type column (staff vs customer)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'user_type'
  ) THEN
    ALTER TABLE users ADD COLUMN user_type VARCHAR(20) NOT NULL DEFAULT 'staff';
    ALTER TABLE users ADD CONSTRAINT chk_user_type 
      CHECK (user_type IN ('staff', 'customer'));
    CREATE INDEX idx_users_user_type ON users(user_type);
  END IF;
END $$;

-- 3. Add is_service_account flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_service_account'
  ) THEN
    ALTER TABLE users ADD COLUMN is_service_account BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
