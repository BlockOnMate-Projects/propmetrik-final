-- Migration 246: distinguish PropMetrik (the platform owner) from customer orgs.
--
-- PROBLEM: `users.user_type` defaulted to 'staff' and signup/invites never set it,
-- so customer-org owners and their invited teammates silently became 'staff' —
-- which grants the full service catalogue + bypasses all subscription tiers, and
-- (combined with role-only admin gates) leaked platform access to customers.
--
-- MODEL (approved): "PropMetrik employee" is a property of WHICH ORG you belong to,
-- not a self-declared role string. A customer can grant roles inside their own org
-- but can never move a user into PropMetrik's org — so org membership is unforgeable.
--
--   * organizations.is_platform_org = true  → the seeded PropMetrik org
--   * user_type='staff'    → member of a platform org (PropMetrik employee)
--   * user_type='customer' → everyone else (default for all new signups/invites)
--   * super_admin/admin still gate the Admin portal, but now ALSO require platform-org membership.
--
-- Idempotent.

BEGIN;

-- 1. Platform-org marker (boolean flag avoids the enum-in-transaction caveat and
--    keeps the org's functional `type` untouched).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_platform_org BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Mark PropMetrik as the platform org: any org that is home to a super_admin,
--    plus the seeded slug, so it is correct across environments.
UPDATE organizations
   SET is_platform_org = TRUE
 WHERE slug = 'propmetrik-group'
    OR id IN (SELECT organization_id FROM users WHERE role = 'super_admin' AND organization_id IS NOT NULL);

-- 3. Backfill user_type from org membership (this RECLASSIFIES the leaked customers,
--    e.g. an org owner of a customer org wrongly marked 'staff' → 'customer').
UPDATE users u
   SET user_type = 'staff'
 WHERE u.organization_id IN (SELECT id FROM organizations WHERE is_platform_org)
   AND u.user_type IS DISTINCT FROM 'staff';

UPDATE users u
   SET user_type = 'customer'
 WHERE (u.organization_id IS NULL
        OR u.organization_id NOT IN (SELECT id FROM organizations WHERE is_platform_org))
   AND u.user_type IS DISTINCT FROM 'customer';

-- 4. Flip the DEFAULT to the SAFE value: a brand-new user is a customer unless
--    explicitly provisioned into the platform org.
ALTER TABLE users ALTER COLUMN user_type SET DEFAULT 'customer';

CREATE INDEX IF NOT EXISTS idx_organizations_platform ON organizations(is_platform_org) WHERE is_platform_org;

COMMIT;
