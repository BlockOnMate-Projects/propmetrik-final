-- Migration: 211_unified_invitations
-- Description: Unified invitation system (replaces overloaded org_invitations for new flows)
-- Phase 2 of RBAC security hardening
-- Created: 2026-03-08
--
-- The existing org_invitations table is preserved for backward compatibility.
-- New invitations (staff + customer) go through this table.

BEGIN;

-- =====================================================
-- UNIFIED INVITATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS unified_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Invitation target
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role user_role_enum NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('staff', 'customer')),

    -- Organization context
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invited_by_id UUID NOT NULL REFERENCES users(id),

    -- Token & status
    token VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),

    -- Customer-specific fields (nullable, no FK due to composite PKs)
    property_id UUID,
    tenancy_id UUID,

    -- Staff-specific fields
    department VARCHAR(100),
    team_id UUID,

    -- Keycloak
    keycloak_user_id VARCHAR(255),
    keycloak_provisioned BOOLEAN DEFAULT FALSE,

    -- Result
    accepted_by_user_id UUID REFERENCES users(id),

    -- Messaging
    personal_message TEXT,

    -- Tracking
    email_sent_at TIMESTAMPTZ,
    email_resent_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancelled_by_id UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_unified_invitations_token ON unified_invitations(token);
CREATE INDEX IF NOT EXISTS idx_unified_invitations_email ON unified_invitations(email);
CREATE INDEX IF NOT EXISTS idx_unified_invitations_org ON unified_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_unified_invitations_status ON unified_invitations(status);
CREATE INDEX IF NOT EXISTS idx_unified_invitations_expires ON unified_invitations(expires_at) WHERE status = 'pending';

-- Partial unique index: prevent duplicate pending invites to same email+org
CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_invitations_pending_unique
    ON unified_invitations(email, organization_id) WHERE status = 'pending';

-- Comments
COMMENT ON TABLE unified_invitations IS 'Unified invitation system for both staff and customer invites. Replaces overloaded org_invitations for new flows.';
COMMENT ON COLUMN unified_invitations.user_type IS 'staff = org team member, customer = tenant/property owner';
COMMENT ON COLUMN unified_invitations.token IS '64-char hex token for accept link (crypto.randomBytes(32).toString(hex))';
COMMENT ON COLUMN unified_invitations.keycloak_provisioned IS 'Whether a Keycloak user was provisioned as part of this invitation';

DO $$
BEGIN
    RAISE NOTICE 'Migration 211: unified_invitations table created';
END $$;

COMMIT;
