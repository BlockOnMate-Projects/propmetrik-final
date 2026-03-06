-- =====================================================
-- MIGRATION: Add Password Authentication Support
-- =====================================================
-- This migration adds support for email/password authentication
-- alongside the existing Keycloak SSO authentication.
-- 
-- SSO remains available for enterprise organizations.
-- Email/password is the default authentication method.
-- =====================================================

-- Add password_hash column for email/password auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add is_active column for account status
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add role column for quick role access (replaces join to user_roles for primary role)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

-- Make keycloak_id nullable for non-SSO users
ALTER TABLE users ALTER COLUMN keycloak_id DROP NOT NULL;

-- Create index for login performance
CREATE INDEX IF NOT EXISTS idx_users_password_hash ON users(email) WHERE password_hash IS NOT NULL;

-- Add last_login_at if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password for email/password auth. NULL for SSO-only users.';
COMMENT ON COLUMN users.is_active IS 'Whether the user account is active and can login.';
COMMENT ON COLUMN users.role IS 'Primary role: user, admin, super_admin, etc.';
