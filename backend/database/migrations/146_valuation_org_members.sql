-- Migration: 146_valuation_org_members
-- Description: Organization invitations and valuation team member tables
-- Created: 2026-02-17
--
-- Supports:
-- 1. B2B org invitations (admin invites valuers to their org)
-- 2. Valuation-specific team assignments (lead valuer, reviewer, trainee)
-- 3. RBAC policies for valuation resources

-- =====================================================
-- ORGANIZATION INVITATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS org_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Invitation details
    email VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'agent',
    invitation_token VARCHAR(255) NOT NULL UNIQUE,
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    
    -- Metadata
    invited_by UUID NOT NULL REFERENCES users(id),
    message TEXT,  -- Optional personal message
    
    -- Expiry
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    
    -- Resolution
    accepted_by UUID REFERENCES users(id),
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON org_invitations(status) WHERE status = 'pending';

-- =====================================================
-- VALUATION TEAM MEMBERS
-- =====================================================
-- Links users to specific valuation engagements with roles

DO $$ BEGIN
    CREATE TYPE valuation_team_role AS ENUM (
        'lead_valuer',    -- Primary valuer responsible for the engagement
        'valuer',         -- Supporting valuer
        'reviewer',       -- QA / senior review
        'trainee',        -- Observer / learning
        'inspector'       -- Site inspection only
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS valuation_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role on this valuation
    team_role valuation_team_role NOT NULL DEFAULT 'valuer',
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Assignment
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMPTZ,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate assignments
    UNIQUE(valuation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_val_team_valuation ON valuation_team_members(valuation_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_val_team_user ON valuation_team_members(user_id) WHERE is_active = TRUE;

-- =====================================================
-- AUTHORIZATION POLICIES FOR VALUATION RESOURCES
-- =====================================================

INSERT INTO authorization_policies (policy_name, description, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org)
VALUES
    -- Valuation access
    ('valuation_read_own', 'Agents/valuers can read valuations assigned to them', 'valuation', 'read',
     ARRAY['agent']::user_role_enum[], FALSE, TRUE, TRUE),
    ('valuation_read_all', 'Managers can read all org valuations', 'valuation', 'read',
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    ('valuation_write_own', 'Agents can update valuations assigned to them', 'valuation', 'write',
     ARRAY['agent']::user_role_enum[], FALSE, TRUE, TRUE),
    ('valuation_write_all', 'Managers can update any org valuation', 'valuation', 'write',
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    
    -- Finance access (restricted to admin/manager)
    ('finance_read', 'Only admin/manager can view finance data', 'finance', 'read',
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    ('finance_write', 'Only admin/manager can create/edit invoices', 'finance', 'write',
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    
    -- Team/invitation management
    ('invitation_manage', 'Only admin/manager can manage invitations', 'invitation', 'manage',
     ARRAY['manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE),
    ('team_read', 'All org members can view team list', 'team', 'read',
     ARRAY['agent', 'analyst', 'viewer', 'manager', 'admin', 'super_admin']::user_role_enum[], FALSE, FALSE, TRUE)

ON CONFLICT (policy_name) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE org_invitations IS 'Tracks email invitations for org membership. Supports B2B model where orgs invite valuation staff.';
COMMENT ON TABLE valuation_team_members IS 'Links users to specific valuation engagements with role-based responsibilities.';
COMMENT ON TYPE valuation_team_role IS 'Roles users can have on a specific valuation engagement.';
