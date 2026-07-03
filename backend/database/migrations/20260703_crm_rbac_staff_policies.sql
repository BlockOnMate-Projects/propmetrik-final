-- Staff-side CRM policy matrix (authorization_policies). Split out from the
-- combined matrix migration because authorization_policies.allowed_roles is
-- user_role_enum[], not text[], so the arrays must be cast. Idempotent via
-- WHERE NOT EXISTS — existing crm_deal/crm_contact/etc. rows are preserved.

-- General entities
INSERT INTO authorization_policies (policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org, is_active)
SELECT r || '_' || a, r, a,
  (CASE
    WHEN a IN ('read','list') THEN ARRAY['super_admin','firm_principal','admin','manager','project_manager','agent','analyst']
    WHEN a = 'delete'          THEN ARRAY['super_admin','firm_principal','admin']
    ELSE                            ARRAY['super_admin','firm_principal','admin','manager','project_manager','agent']
  END)::user_role_enum[],
  false, false, true, true
FROM unnest(ARRAY['crm_deal','crm_contact','crm_company','crm_lead','crm_activity','crm_document','crm_campaign','crm_analytics']) r
CROSS JOIN unnest(ARRAY['list','read','create','update','delete']) a
WHERE NOT EXISTS (SELECT 1 FROM authorization_policies ap WHERE ap.resource_type = r AND ap.action = a);

-- Finance (commission, invoice)
INSERT INTO authorization_policies (policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org, is_active)
SELECT r || '_' || a, r, a,
  (CASE
    WHEN a IN ('read','list') THEN ARRAY['super_admin','firm_principal','admin','manager','finance_manager','analyst']
    WHEN a = 'delete'          THEN ARRAY['super_admin','firm_principal','admin']
    ELSE                            ARRAY['super_admin','firm_principal','admin','manager','finance_manager']
  END)::user_role_enum[],
  false, false, true, true
FROM unnest(ARRAY['crm_commission','crm_invoice']) r
CROSS JOIN unnest(ARRAY['list','read','create','update','delete']) a
WHERE NOT EXISTS (SELECT 1 FROM authorization_policies ap WHERE ap.resource_type = r AND ap.action = a);

-- Admin resources (pipeline, agent)
INSERT INTO authorization_policies (policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org, is_active)
SELECT r || '_' || a, r, a,
  (CASE
    WHEN a IN ('read','list') THEN ARRAY['super_admin','firm_principal','admin','manager','project_manager','agent','analyst']
    ELSE                            ARRAY['super_admin','firm_principal','admin','manager']
  END)::user_role_enum[],
  false, false, true, true
FROM unnest(ARRAY['crm_pipeline','crm_agent']) r
CROSS JOIN unnest(ARRAY['list','read','create','update','delete']) a
WHERE NOT EXISTS (SELECT 1 FROM authorization_policies ap WHERE ap.resource_type = r AND ap.action = a);
