-- Migration 126: Tenant Keycloak Onboarding
-- Adds enterprise tenant portal onboarding fields linked to Keycloak identity

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS keycloak_user_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS portal_access_status VARCHAR(30) NOT NULL DEFAULT 'not_invited',
    ADD COLUMN IF NOT EXISTS portal_invited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS portal_invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS portal_invite_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS portal_activated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_keycloak_user_id
    ON tenants(keycloak_user_id)
    WHERE keycloak_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_portal_access_status
    ON tenants(portal_access_status);

ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_portal_access_status_check;

ALTER TABLE tenants
    ADD CONSTRAINT tenants_portal_access_status_check
    CHECK (portal_access_status IN ('not_invited', 'invited', 'active', 'disabled'));

COMMENT ON COLUMN tenants.keycloak_user_id IS 'Keycloak user id (sub) used for tenant portal SSO';
COMMENT ON COLUMN tenants.portal_access_status IS 'Tenant portal onboarding status';
COMMENT ON COLUMN tenants.portal_invited_at IS 'When tenant was invited to the portal';
COMMENT ON COLUMN tenants.portal_invite_expires_at IS 'When invite link expires';
COMMENT ON COLUMN tenants.portal_activated_at IS 'First successful tenant portal login via Keycloak';
