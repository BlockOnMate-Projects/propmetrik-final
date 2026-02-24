-- Migration: 055_authorization_layer
-- Description: Layer 2 Authorization - Roles, Policies, Ownership
-- Created: 2026-01-21
-- 
-- INTENTIONAL TECHNICAL DEBT:
-- This migration sets all existing users to SUPER_ADMIN role to prevent
-- breaking existing workflows during the Service Construction Phase.
-- This MUST be reviewed and refined before production hardening.
--
-- Keycloak/Kong/SSO are intentionally NOT implemented yet.
-- This layer provides the interfaces that will integrate with them later.

-- =====================================================
-- ROLE ENUM
-- =====================================================
-- Standard roles for PropMetrik platform
-- These map to future Keycloak realm roles

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM (
        'super_admin',    -- Full system access (temporary migration role)
        'admin',          -- Organization admin - full org access
        'manager',        -- Team manager - can manage agents and view all org data
        'agent',          -- Sales/Rental agent - sees only assigned deals
        'analyst',        -- Read-only analytics access
        'viewer'          -- Read-only basic access
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- ADD ROLE COLUMN TO USERS
-- =====================================================
-- Primary role for quick access (avoids join to user_roles for common checks)
-- user_roles table still exists for fine-grained multi-role scenarios

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role user_role_enum DEFAULT 'viewer';

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- =====================================================
-- MIGRATE EXISTING USERS TO SUPER_ADMIN
-- =====================================================
-- INTENTIONAL: All existing users get super_admin to prevent breaking
-- existing workflows. This is documented technical debt.

UPDATE users 
SET role = 'super_admin', 
    status = 'active'
WHERE role IS NULL OR role = 'viewer';

-- Log the migration
DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM users WHERE role = 'super_admin';
    RAISE NOTICE 'Migrated % users to super_admin role', migrated_count;
END $$;

-- =====================================================
-- LINK AGENTS TO USERS
-- =====================================================
-- Create user accounts for existing agents that don't have one
-- This allows agents to log in and access their workspace

-- First, ensure agents have user accounts
INSERT INTO users (id, keycloak_id, organization_id, email, first_name, last_name, display_name, status, role)
SELECT 
    COALESCE(a.user_id, gen_random_uuid()),
    'agent_' || a.id,  -- Temporary keycloak_id until Keycloak integration
    a.organization_id,
    a.email,
    a.first_name,
    a.last_name,
    COALESCE(a.display_name, a.first_name || ' ' || a.last_name),
    'active',
    'agent'::user_role_enum
FROM agents a
WHERE a.user_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = a.email)
ON CONFLICT (email) DO NOTHING;

-- Update agents to link to their user accounts
UPDATE agents a
SET user_id = u.id
FROM users u
WHERE a.email = u.email
  AND a.user_id IS NULL;

-- =====================================================
-- AUTHORIZATION POLICIES TABLE
-- =====================================================
-- Declarative policy definitions for resource access
-- Enables policy-based access control without hardcoding rules

CREATE TABLE IF NOT EXISTS authorization_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Policy identification
    policy_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    
    -- Resource scope
    resource_type VARCHAR(50) NOT NULL,  -- 'deal', 'contact', 'property', 'document', etc.
    action VARCHAR(20) NOT NULL,          -- 'read', 'write', 'delete', 'manage'
    
    -- Role requirements (any of these roles grants access)
    allowed_roles user_role_enum[] NOT NULL DEFAULT ARRAY['super_admin']::user_role_enum[],
    
    -- Ownership requirements
    require_ownership BOOLEAN DEFAULT FALSE,  -- User must own the resource
    require_assignment BOOLEAN DEFAULT FALSE, -- User must be assigned to the resource
    
    -- Organization scope
    require_same_org BOOLEAN DEFAULT TRUE,    -- Resource must be in user's org
    
    -- Additional conditions (JSONB for flexibility)
    conditions JSONB DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_policies_resource ON authorization_policies(resource_type, action);
CREATE INDEX IF NOT EXISTS idx_auth_policies_active ON authorization_policies(is_active) WHERE is_active = TRUE;

-- =====================================================
-- SEED DEFAULT POLICIES
-- =====================================================

INSERT INTO authorization_policies (policy_name, description, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org)
VALUES
    -- Deal policies
    ('deal_read_own', 'Agents can read their assigned deals', 'deal', 'read', 
     ARRAY['agent']::user_role_enum[], FALSE, TRUE, TRUE),
    ('deal_read_all', 'Managers can read all org deals', 'deal', 'read', 
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    ('deal_write_own', 'Agents can update their assigned deals', 'deal', 'write', 
     ARRAY['agent']::user_role_enum[], FALSE, TRUE, TRUE),
    ('deal_write_all', 'Managers can update any org deal', 'deal', 'write', 
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    ('deal_delete', 'Only admins can delete deals', 'deal', 'delete', 
     ARRAY['admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    
    -- Contact policies
    ('contact_read_assigned', 'Agents can read contacts linked to their deals', 'contact', 'read', 
     ARRAY['agent']::user_role_enum[], FALSE, TRUE, TRUE),
    ('contact_read_all', 'Managers can read all org contacts', 'contact', 'read', 
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    ('contact_write', 'Agents and above can create/update contacts', 'contact', 'write', 
     ARRAY['agent', 'manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    
    -- Property policies
    ('property_read_linked', 'Agents can read properties linked to their deals', 'property', 'read', 
     ARRAY['agent']::user_role_enum[], FALSE, TRUE, TRUE),
    ('property_read_all', 'Managers can read all org properties', 'property', 'read', 
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    
    -- Document policies
    ('document_read_own', 'Agents can read documents for their deals', 'document', 'read', 
     ARRAY['agent']::user_role_enum[], FALSE, TRUE, TRUE),
    ('document_upload', 'Agents can upload documents to their deals', 'document', 'write', 
     ARRAY['agent', 'manager', 'admin', 'super_admin']::user_role_enum[], FALSE, TRUE, TRUE),
    ('document_sign_trigger', 'Managers can trigger e-sign workflows', 'document', 'sign', 
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    
    -- Task policies
    ('task_read_own', 'Agents can read their assigned tasks', 'task', 'read', 
     ARRAY['agent']::user_role_enum[], FALSE, TRUE, TRUE),
    ('task_read_all', 'Managers can read all org tasks', 'task', 'read', 
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    ('task_write', 'Agents and above can create/update tasks', 'task', 'write', 
     ARRAY['agent', 'manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    
    -- Agent policies
    ('agent_manage', 'Only admins can manage agent accounts', 'agent', 'manage', 
     ARRAY['admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    ('agent_read_own', 'Agents can view their own profile', 'agent', 'read', 
     ARRAY['agent']::user_role_enum[], TRUE, FALSE, TRUE)
    
ON CONFLICT (policy_name) DO NOTHING;

-- =====================================================
-- HELPER FUNCTION: CHECK USER ACCESS
-- =====================================================
-- Can be called from application code or DB triggers

CREATE OR REPLACE FUNCTION check_user_access(
    p_user_id UUID,
    p_resource_type VARCHAR(50),
    p_action VARCHAR(20),
    p_resource_id UUID DEFAULT NULL,
    p_resource_org_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_role user_role_enum;
    v_user_org_id UUID;
    v_policy RECORD;
    v_is_assigned BOOLEAN := FALSE;
    v_is_owner BOOLEAN := FALSE;
BEGIN
    -- Get user role and org
    SELECT role, organization_id INTO v_user_role, v_user_org_id
    FROM users WHERE id = p_user_id;
    
    IF v_user_role IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Super admin bypasses all checks
    IF v_user_role = 'super_admin' THEN
        RETURN TRUE;
    END IF;
    
    -- Check each applicable policy
    FOR v_policy IN 
        SELECT * FROM authorization_policies 
        WHERE resource_type = p_resource_type 
          AND action = p_action 
          AND is_active = TRUE
          AND v_user_role = ANY(allowed_roles)
    LOOP
        -- Check org requirement
        IF v_policy.require_same_org AND p_resource_org_id IS NOT NULL THEN
            IF v_user_org_id != p_resource_org_id THEN
                CONTINUE;
            END IF;
        END IF;
        
        -- Check assignment requirement (for deals)
        IF v_policy.require_assignment AND p_resource_id IS NOT NULL THEN
            IF p_resource_type = 'deal' THEN
                SELECT EXISTS(
                    SELECT 1 FROM deals d
                    JOIN agents a ON d.assigned_agent = a.id
                    WHERE d.id = p_resource_id AND a.user_id = p_user_id
                ) INTO v_is_assigned;
                
                IF NOT v_is_assigned THEN
                    CONTINUE;
                END IF;
            END IF;
        END IF;
        
        -- If we got here, policy grants access
        RETURN TRUE;
    END LOOP;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TYPE user_role_enum IS 'Standard platform roles. Maps to Keycloak realm roles when integrated.';
COMMENT ON COLUMN users.role IS 'Primary role for quick authorization checks. Migrate to Keycloak when ready.';
COMMENT ON TABLE authorization_policies IS 'Declarative access policies. Enforced in application layer.';
COMMENT ON FUNCTION check_user_access IS 'Database-level access check. Use for row-level security or complex queries.';
