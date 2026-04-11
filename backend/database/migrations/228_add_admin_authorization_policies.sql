-- Migration 228: Add admin authorization policies
-- 
-- The admin tab in the top nav is built from authorization_policies with
-- resource_type='admin'.  Without these rows the backend returns an empty
-- allowed-roles list for the admin tab, which overrides the frontend fallback
-- and hides the tab for everyone — including super_admin.

INSERT INTO authorization_policies (id, policy_name, description, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org, conditions, is_active)
VALUES
  (gen_random_uuid(), 'admin_list',  'Access admin panel (list view)',  'admin', 'list',  '{super_admin,admin}', false, false, false, '{}', true),
  (gen_random_uuid(), 'admin_read',  'Read admin panel resources',      'admin', 'read',  '{super_admin,admin}', false, false, false, '{}', true),
  (gen_random_uuid(), 'admin_write', 'Write/modify admin panel items',  'admin', 'write', '{super_admin,admin}', false, false, false, '{}', true)
ON CONFLICT DO NOTHING;
