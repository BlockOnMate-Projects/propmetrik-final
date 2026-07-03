-- Complete the CRM authorization policy matrix in BOTH policy tables so the new
-- central CRM policy dispatcher (crm/index.ts) always finds a policy for every
-- (resource, action) it emits. Idempotent: only inserts rows that don't already
-- exist, so the hand-seeded crm_deal/crm_contact/etc. policies are preserved.
--
--   authorization_policies          → STAFF (platform roles)
--   customer_authorization_policies → CUSTOMER (per-service roles)
--
-- Canonical CRM resources the dispatcher uses:
--   crm_deal crm_contact crm_company crm_lead crm_pipeline crm_activity
--   crm_document crm_commission crm_invoice crm_analytics crm_agent crm_campaign
-- Actions: list read create update delete

-- ─────────────────────────────────────────────────────────────
-- STAFF policies (authorization_policies) live in the companion migration
-- 20260703_crm_rbac_staff_policies.sql — its allowed_roles column is
-- user_role_enum[] (needs a cast), so it is kept separate from this file.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- CUSTOMER policies (customer_authorization_policies)
-- roles: service_admin, sales_manager, sales_agent, viewer
-- ─────────────────────────────────────────────────────────────

-- General entities: everyone reads; agents+ create/update; managers delete.
INSERT INTO customer_authorization_policies (service_key, resource_type, action, allowed_roles, require_ownership, is_active)
SELECT 'crm', r, a,
  CASE
    WHEN a IN ('read','list') THEN ARRAY['service_admin','sales_manager','sales_agent','viewer']
    WHEN a = 'delete'          THEN ARRAY['service_admin','sales_manager']
    ELSE                            ARRAY['service_admin','sales_manager','sales_agent']
  END,
  false, true
FROM unnest(ARRAY['crm_deal','crm_contact','crm_company','crm_lead','crm_activity','crm_document']) r
CROSS JOIN unnest(ARRAY['list','read','create','update','delete']) a
WHERE NOT EXISTS (
  SELECT 1 FROM customer_authorization_policies c
  WHERE c.service_key = 'crm' AND c.resource_type = r AND c.action = a
);

-- Finance (commission, invoice): managers+ only — agents cannot see team finances.
INSERT INTO customer_authorization_policies (service_key, resource_type, action, allowed_roles, require_ownership, is_active)
SELECT 'crm', r, a,
  CASE
    WHEN a = 'delete' THEN ARRAY['service_admin']
    ELSE                   ARRAY['service_admin','sales_manager']
  END,
  false, true
FROM unnest(ARRAY['crm_commission','crm_invoice']) r
CROSS JOIN unnest(ARRAY['list','read','create','update','delete']) a
WHERE NOT EXISTS (
  SELECT 1 FROM customer_authorization_policies c
  WHERE c.service_key = 'crm' AND c.resource_type = r AND c.action = a
);

-- Analytics/campaign: everyone reads; managers+ mutate.
INSERT INTO customer_authorization_policies (service_key, resource_type, action, allowed_roles, require_ownership, is_active)
SELECT 'crm', r, a,
  CASE
    WHEN a IN ('read','list') THEN ARRAY['service_admin','sales_manager','sales_agent','viewer']
    ELSE                            ARRAY['service_admin','sales_manager']
  END,
  false, true
FROM unnest(ARRAY['crm_analytics','crm_campaign']) r
CROSS JOIN unnest(ARRAY['list','read','create','update','delete']) a
WHERE NOT EXISTS (
  SELECT 1 FROM customer_authorization_policies c
  WHERE c.service_key = 'crm' AND c.resource_type = r AND c.action = a
);

-- Admin resources (pipeline, agent): everyone reads; only service_admin/sales_manager mutate.
INSERT INTO customer_authorization_policies (service_key, resource_type, action, allowed_roles, require_ownership, is_active)
SELECT 'crm', r, a,
  CASE
    WHEN a IN ('read','list') THEN ARRAY['service_admin','sales_manager','sales_agent','viewer']
    ELSE                            ARRAY['service_admin','sales_manager']
  END,
  false, true
FROM unnest(ARRAY['crm_pipeline','crm_agent']) r
CROSS JOIN unnest(ARRAY['list','read','create','update','delete']) a
WHERE NOT EXISTS (
  SELECT 1 FROM customer_authorization_policies c
  WHERE c.service_key = 'crm' AND c.resource_type = r AND c.action = a
);
