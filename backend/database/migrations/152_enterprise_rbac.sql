-- ============================================================================
-- Migration 152: Enterprise RBAC for Valuation Services
-- ============================================================================
-- Adds valuation-specific roles to user_role_enum and seeds comprehensive
-- authorization policies for enterprise-grade B2B/B2C valuation firms.
--
-- New Roles:
--   firm_principal   — Director / Principal Valuer (highest authority, signs reports)
--   senior_valuer    — Lead Valuer, QA reviewer, engagement lead
--   valuer           — Independent valuer (conducts valuations)
--   probationer      — RICS APC trainee (supervised work only)
--   inspector        — Field inspection specialist
--   finance_manager  — Finance, billing, fee management
--   compliance_officer — Regulatory compliance, audit trails
-- ============================================================================

-- 1. Extend user_role_enum using the safe "recreate" pattern
--    (ALTER TYPE ... ADD VALUE cannot run inside a transaction,
--     so we recreate the enum type with all values instead)

-- 1a. Drop the function that references user_role_enum (will recreate below)
DROP FUNCTION IF EXISTS check_user_access(UUID, VARCHAR, VARCHAR, UUID, UUID);

-- 1b. Create the new enum with both original and new values
CREATE TYPE user_role_enum_v2 AS ENUM (
    'super_admin', 'admin', 'manager', 'agent', 'analyst', 'viewer',
    'firm_principal', 'senior_valuer', 'valuer', 'probationer',
    'inspector', 'finance_manager', 'compliance_officer'
);

-- 1c. Drop defaults on columns before altering type
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE org_invitations ALTER COLUMN role DROP DEFAULT;
ALTER TABLE authorization_policies ALTER COLUMN allowed_roles DROP DEFAULT;

-- 1d. Migrate all columns that reference the old enum
ALTER TABLE users
    ALTER COLUMN role TYPE user_role_enum_v2
    USING role::text::user_role_enum_v2;

ALTER TABLE org_invitations
    ALTER COLUMN role TYPE user_role_enum_v2
    USING role::text::user_role_enum_v2;

ALTER TABLE authorization_policies
    ALTER COLUMN allowed_roles TYPE user_role_enum_v2[]
    USING allowed_roles::text[]::user_role_enum_v2[];

-- 1e. Drop old enum and rename new one
DROP TYPE user_role_enum;
ALTER TYPE user_role_enum_v2 RENAME TO user_role_enum;

-- 1f. Restore defaults
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'viewer'::user_role_enum;
ALTER TABLE org_invitations ALTER COLUMN role SET DEFAULT 'agent'::user_role_enum;
ALTER TABLE authorization_policies ALTER COLUMN allowed_roles SET DEFAULT ARRAY['super_admin'::user_role_enum];

-- 1g. Recreate the check_user_access function with the new enum
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
BEGIN
    SELECT role, organization_id INTO v_user_role, v_user_org_id
    FROM users WHERE id = p_user_id;

    IF v_user_role IS NULL THEN RETURN FALSE; END IF;
    IF v_user_role = 'super_admin' THEN RETURN TRUE; END IF;

    FOR v_policy IN
        SELECT * FROM authorization_policies
        WHERE resource_type = p_resource_type
          AND action = p_action
          AND is_active = TRUE
          AND v_user_role = ANY(allowed_roles)
    LOOP
        IF v_policy.require_same_org AND p_resource_org_id IS NOT NULL THEN
            IF v_user_org_id != p_resource_org_id THEN CONTINUE; END IF;
        END IF;

        IF v_policy.require_assignment AND p_resource_id IS NOT NULL THEN
            IF p_resource_type = 'deal' THEN
                SELECT EXISTS(
                    SELECT 1 FROM deals d
                    JOIN agents a ON d.assigned_agent = a.id
                    WHERE d.id = p_resource_id AND a.user_id = p_user_id
                ) INTO v_is_assigned;
                IF NOT v_is_assigned THEN CONTINUE; END IF;
            END IF;
            IF p_resource_type = 'valuation' THEN
                SELECT EXISTS(
                    SELECT 1 FROM valuation_team_members vtm
                    WHERE vtm.valuation_id = p_resource_id AND vtm.user_id = p_user_id
                ) INTO v_is_assigned;
                IF NOT v_is_assigned THEN CONTINUE; END IF;
            END IF;
        END IF;

        RETURN TRUE;
    END LOOP;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add professional credential columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS professional_title VARCHAR(100);       -- e.g. MRICS, MGhIS, ANIVS 
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_number VARCHAR(50);            -- GhIS registration number
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_expiry DATE;                   -- Expiry date for license
ALTER TABLE users ADD COLUMN IF NOT EXISTS specializations TEXT[];                -- e.g. {residential, commercial, industrial}
ALTER TABLE users ADD COLUMN IF NOT EXISTS years_experience INTEGER;              -- Professional experience
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_report_value NUMERIC(15,2);        -- Maximum property value this valuer can sign off on
ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_supervision BOOLEAN DEFAULT FALSE; -- Probationers/trainees
ALTER TABLE users ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES users(id);    -- Supervisor for probationers

-- 3. Seed comprehensive valuation-specific authorization policies
-- Delete stale policies first (safe: ON CONFLICT would also work)
INSERT INTO authorization_policies (policy_name, description, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org)
VALUES
    -- ═══════════════════════════════════════════════════════════════════
    -- VALUATION POLICIES (override migration 146 seeds with expanded roles)
    -- ═══════════════════════════════════════════════════════════════════
    
    -- Read own assigned valuations
    ('valuation_read_assigned', 'Read valuations assigned to user', 'valuation', 'read',
     ARRAY['valuer', 'probationer', 'inspector', 'agent']::user_role_enum[],
     FALSE, TRUE, TRUE),

    -- Read all org valuations
    ('valuation_read_all_v2', 'Read all org valuations', 'valuation', 'read',
     ARRAY['firm_principal', 'senior_valuer', 'manager', 'admin', 'super_admin', 'compliance_officer']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- Write assigned valuations
    ('valuation_write_assigned', 'Edit assigned valuations', 'valuation', 'write',
     ARRAY['valuer', 'agent']::user_role_enum[],
     FALSE, TRUE, TRUE),

    -- Write all valuations (leads + admins)
    ('valuation_write_all_v2', 'Edit any org valuation', 'valuation', 'write',
     ARRAY['firm_principal', 'senior_valuer', 'manager', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- Approve / QA review valuations
    ('valuation_approve', 'Approve / QA review a valuation', 'valuation', 'approve',
     ARRAY['firm_principal', 'senior_valuer']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- Sign valuation reports (regulatory authority)
    ('valuation_sign_report', 'Sign final valuation report', 'valuation', 'sign',
     ARRAY['firm_principal', 'senior_valuer']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- Delete valuations (admin only)
    ('valuation_delete', 'Delete a valuation', 'valuation', 'delete',
     ARRAY['firm_principal', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- ═══════════════════════════════════════════════════════════════════
    -- INSPECTION POLICIES
    -- ═══════════════════════════════════════════════════════════════════
    
    ('inspection_read', 'Read inspection data', 'inspection', 'read',
     ARRAY['firm_principal', 'senior_valuer', 'valuer', 'probationer', 'inspector', 'manager', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    ('inspection_write', 'Conduct / write inspections', 'inspection', 'write',
     ARRAY['firm_principal', 'senior_valuer', 'valuer', 'inspector']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- ═══════════════════════════════════════════════════════════════════
    -- FINANCE POLICIES (invoicing, billing, fee management)
    -- ═══════════════════════════════════════════════════════════════════
    
    ('finance_read_v2', 'View invoices, fees, payment status', 'finance', 'read',
     ARRAY['firm_principal', 'finance_manager', 'compliance_officer', 'admin', 'super_admin', 'manager']::user_role_enum[],
     FALSE, FALSE, TRUE),

    ('finance_write_v2', 'Create/send invoices, configure payouts', 'finance', 'write',
     ARRAY['firm_principal', 'finance_manager', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- ═══════════════════════════════════════════════════════════════════
    -- CLIENT MANAGEMENT POLICIES
    -- ═══════════════════════════════════════════════════════════════════
    
    ('client_read', 'View client directory', 'client', 'read',
     ARRAY['firm_principal', 'senior_valuer', 'valuer', 'finance_manager', 'manager', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    ('client_write', 'Add/edit clients', 'client', 'write',
     ARRAY['firm_principal', 'senior_valuer', 'finance_manager', 'manager', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    ('client_delete', 'Remove clients', 'client', 'delete',
     ARRAY['firm_principal', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- ═══════════════════════════════════════════════════════════════════
    -- TEAM / ORG MANAGEMENT POLICIES
    -- ═══════════════════════════════════════════════════════════════════
    
    ('team_read_v2', 'View team members', 'team', 'read',
     ARRAY['firm_principal', 'senior_valuer', 'valuer', 'probationer', 'inspector', 'finance_manager',
            'compliance_officer', 'manager', 'admin', 'super_admin', 'analyst', 'viewer', 'agent']::user_role_enum[],
     FALSE, FALSE, TRUE),

    ('team_manage_v2', 'Invite, remove, change roles', 'team', 'manage',
     ARRAY['firm_principal', 'manager', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- ═══════════════════════════════════════════════════════════════════
    -- REPORT GENERATION POLICIES
    -- ═══════════════════════════════════════════════════════════════════
    
    ('report_generate', 'Generate valuation reports', 'report', 'write',
     ARRAY['firm_principal', 'senior_valuer', 'valuer']::user_role_enum[],
     FALSE, FALSE, TRUE),

    ('report_sign', 'Sign and finalise reports', 'report', 'sign',
     ARRAY['firm_principal', 'senior_valuer']::user_role_enum[],
     FALSE, FALSE, TRUE),

    ('report_read', 'Read / download reports', 'report', 'read',
     ARRAY['firm_principal', 'senior_valuer', 'valuer', 'probationer', 'finance_manager', 'compliance_officer',
            'manager', 'admin', 'super_admin', 'analyst']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- ═══════════════════════════════════════════════════════════════════
    -- ANALYTICS POLICIES
    -- ═══════════════════════════════════════════════════════════════════
    
    ('analytics_read', 'View analytics dashboards', 'analytics', 'read',
     ARRAY['firm_principal', 'senior_valuer', 'finance_manager', 'compliance_officer',
            'manager', 'admin', 'super_admin', 'analyst']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- ═══════════════════════════════════════════════════════════════════
    -- SETTINGS / CONFIGURATION POLICIES
    -- ═══════════════════════════════════════════════════════════════════
    
    ('settings_manage', 'Manage org settings', 'settings', 'manage',
     ARRAY['firm_principal', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    ('template_manage', 'Manage report templates', 'template', 'manage',
     ARRAY['firm_principal', 'senior_valuer', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    -- ═══════════════════════════════════════════════════════════════════
    -- COMPLIANCE / AUDIT POLICIES
    -- ═══════════════════════════════════════════════════════════════════
    
    ('audit_read', 'Read audit trails', 'audit', 'read',
     ARRAY['firm_principal', 'compliance_officer', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE),

    ('compliance_manage', 'Manage compliance workflows', 'compliance', 'manage',
     ARRAY['firm_principal', 'compliance_officer', 'admin', 'super_admin']::user_role_enum[],
     FALSE, FALSE, TRUE)

ON CONFLICT (policy_name) DO UPDATE SET
    allowed_roles = EXCLUDED.allowed_roles,
    description = EXCLUDED.description,
    require_ownership = EXCLUDED.require_ownership,
    require_assignment = EXCLUDED.require_assignment,
    require_same_org = EXCLUDED.require_same_org;

-- 4. Create role hierarchy/metadata table for UI display
CREATE TABLE IF NOT EXISTS role_metadata (
    role_name VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'general',  -- 'valuation', 'operations', 'general'
    hierarchy_level INTEGER NOT NULL DEFAULT 100,       -- Lower = more authority (10=highest, 100=lowest)
    is_invitable BOOLEAN DEFAULT TRUE,                  -- Can this role be invited via team page?
    requires_credentials BOOLEAN DEFAULT FALSE,          -- Must have professional credentials?
    max_report_value_default NUMERIC(15,2),              -- Default max property value for this role
    color_theme VARCHAR(20) DEFAULT 'zinc',              -- UI color: red, amber, blue, green, purple, etc.
    icon VARCHAR(50) DEFAULT 'User',                     -- Lucide icon name
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO role_metadata (role_name, display_name, description, category, hierarchy_level, is_invitable, requires_credentials, color_theme, icon)
VALUES
    ('super_admin',        'SUPER ADMIN',         'Full system access — platform owner',                        'general',    1,   FALSE, FALSE, 'red',    'Shield'),
    ('firm_principal',     'FIRM PRINCIPAL',       'Director / Principal Valuer — signs reports, full authority', 'valuation',  10,  TRUE,  TRUE,  'amber',  'Crown'),
    ('admin',              'ADMIN',                'Organization administrator — full org access',               'general',    15,  TRUE,  FALSE, 'red',    'ShieldCheck'),
    ('senior_valuer',      'SENIOR VALUER',        'Lead Valuer — reviews, QA, engagement lead',                'valuation',  20,  TRUE,  TRUE,  'blue',   'Award'),
    ('manager',            'MANAGER',              'Team manager — manages agents, views all org data',         'operations', 25,  TRUE,  FALSE, 'blue',   'Users'),
    ('valuer',             'VALUER',               'Independent valuer — conducts valuations',                  'valuation',  30,  TRUE,  TRUE,  'green',  'Briefcase'),
    ('finance_manager',    'FINANCE MANAGER',      'Finance & billing — invoices, payouts, fee config',         'operations', 35,  TRUE,  FALSE, 'emerald','Banknote'),
    ('compliance_officer', 'COMPLIANCE OFFICER',   'Regulatory compliance — audit trails, QA oversight',        'operations', 40,  TRUE,  FALSE, 'purple', 'FileCheck'),
    ('agent',              'AGENT',                'Sales/rental agent (legacy) — same access as valuer',       'general',    30,  TRUE,  FALSE, 'green',  'Briefcase'),
    ('probationer',        'PROBATIONER',          'Trainee valuer (RICS APC) — supervised, read-heavy',        'valuation',  50,  TRUE,  FALSE, 'yellow', 'GraduationCap'),
    ('inspector',          'INSPECTOR',            'Field inspection specialist — site visits only',            'valuation',  55,  TRUE,  FALSE, 'cyan',   'Search'),
    ('analyst',            'ANALYST',              'Read-only analytics access',                                'general',    60,  TRUE,  FALSE, 'purple', 'BarChart3'),
    ('viewer',             'VIEWER',               'Read-only basic access',                                    'general',    90,  FALSE, FALSE, 'zinc',   'Eye')
ON CONFLICT (role_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    hierarchy_level = EXCLUDED.hierarchy_level,
    is_invitable = EXCLUDED.is_invitable,
    requires_credentials = EXCLUDED.requires_credentials,
    color_theme = EXCLUDED.color_theme,
    icon = EXCLUDED.icon;

-- 5. Update existing agent users to valuer role (optional: only affects new invitations)
-- Note: We keep 'agent' as a valid role for backward compatibility but new invitations
-- should use the specific valuation roles. Existing agents continue to work.

-- 6. Create index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(organization_id, role);
CREATE INDEX IF NOT EXISTS idx_authorization_policies_resource ON authorization_policies(resource_type, action);

-- Done
COMMENT ON TABLE role_metadata IS 'UI display metadata for user_role_enum values. Used by team page to render role dropdowns, colors, and hierarchy.';
