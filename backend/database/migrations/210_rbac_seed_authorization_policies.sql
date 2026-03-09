-- Migration 210: Seed comprehensive authorization_policies from rbac.md spec
-- This replaces the old ad-hoc policies with the full specification

BEGIN;

-- 1. Widen action column (some actions like 'approve_reconciliation' exceed 20 chars)
ALTER TABLE authorization_policies ALTER COLUMN action TYPE VARCHAR(50);

-- 2. Deactivate all old policies (new ones will replace them)
UPDATE authorization_policies SET is_active = false, updated_at = NOW();

-- 3. Insert all policies from the spec. ON CONFLICT updates existing rows.
INSERT INTO authorization_policies (policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org)
VALUES

-- ═══════════════════════════════════════════════════════════════
-- VALUATIONS SERVICE
-- ═══════════════════════════════════════════════════════════════
('valuation_list',                 'valuation', 'list',                 '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst,viewer}', false, false, true),
('valuation_read',                 'valuation', 'read',                 '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst,viewer}', false, false, true),
('valuation_create',               'valuation', 'create',               '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent}', false, false, true),
('valuation_update',               'valuation', 'update',               '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer}', false, true, true),
('valuation_delete',               'valuation', 'delete',               '{super_admin,firm_principal,admin}', false, false, true),
('valuation_run_engine',           'valuation', 'run_engine',           '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer}', false, true, true),
('valuation_search_comparables',   'valuation', 'search_comparables',   '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent,analyst}', false, false, true),
('valuation_manage_floor_plans',   'valuation', 'manage_floor_plans',   '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,inspector}', false, true, true),
('valuation_perform_hbu',          'valuation', 'perform_hbu',          '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer}', false, true, true),
('valuation_override',             'valuation', 'override',             '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('valuation_approve_override',     'valuation', 'approve_override',     '{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('valuation_reject_override',      'valuation', 'reject_override',      '{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('valuation_sensitivity_analysis', 'valuation', 'sensitivity_analysis', '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,analyst}', false, false, true),
('valuation_reconcile',            'valuation', 'reconcile',            '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('valuation_approve_reconciliation','valuation', 'approve_reconciliation','{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('valuation_lock_reconciliation',  'valuation', 'lock_reconciliation',  '{super_admin,firm_principal,admin}', false, false, true),
('valuation_manage_inspection',    'valuation', 'manage_inspection',    '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,inspector}', false, true, true),
('valuation_manage_engagement',    'valuation', 'manage_engagement',    '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, false, true),
('valuation_generate_report',      'valuation', 'generate_report',      '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer}', false, true, true),

-- ═══════════════════════════════════════════════════════════════
-- VALUATION REPORTS SERVICE
-- ═══════════════════════════════════════════════════════════════
('report_list',           'report', 'list',           '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent,analyst,viewer}', false, false, true),
('report_read',           'report', 'read',           '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent,analyst,viewer}', false, false, true),
('report_create',         'report', 'create',         '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, false, true),
('report_update',         'report', 'update',         '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('report_delete',         'report', 'delete',         '{super_admin,firm_principal,admin}', false, false, true),
('report_supersede',      'report', 'supersede',      '{super_admin,firm_principal,admin,senior_valuer}', false, false, true),
('report_manage_photos',  'report', 'manage_photos',  '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,inspector}', false, true, true),
('report_submit_review',  'report', 'submit_review',  '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('report_approve',        'report', 'approve',        '{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('report_reject',         'report', 'reject',         '{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('report_generate_pdf',   'report', 'generate_pdf',   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('report_download',       'report', 'download',       '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent,analyst}', false, false, true),
('report_prepare_esign',  'report', 'prepare_esign',  '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),

-- ═══════════════════════════════════════════════════════════════
-- VALUATION ORG / TEAM
-- ═══════════════════════════════════════════════════════════════
('valuation_org_read_invitations',      'valuation_org', 'read_invitations',      '{super_admin,firm_principal,admin,manager}', false, false, true),
('valuation_org_manage_invitations',    'valuation_org', 'manage_invitations',    '{super_admin,firm_principal,admin}', false, false, true),
('valuation_org_read_members',          'valuation_org', 'read_members',          '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent,analyst,viewer}', false, false, true),
('valuation_org_manage_members',        'valuation_org', 'manage_members',        '{super_admin,firm_principal,admin}', false, false, true),
('valuation_org_manage_valuation_team', 'valuation_org', 'manage_valuation_team', '{super_admin,firm_principal,admin,senior_valuer,manager}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- VALUATION INVOICES
-- ═══════════════════════════════════════════════════════════════
('val_invoice_list',                   'valuation_invoice', 'list',                   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager,agent}', false, false, true),
('val_invoice_read',                   'valuation_invoice', 'read',                   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager,agent}', false, false, true),
('val_invoice_create',                 'valuation_invoice', 'create',                 '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, false, true),
('val_invoice_update',                 'valuation_invoice', 'update',                 '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager}', false, true, true),
('val_invoice_delete',                 'valuation_invoice', 'delete',                 '{super_admin,firm_principal,admin}', false, false, true),
('val_invoice_send',                   'valuation_invoice', 'send',                   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('val_invoice_mark_paid',              'valuation_invoice', 'mark_paid',              '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('val_invoice_cancel',                 'valuation_invoice', 'cancel',                 '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager}', false, true, true),
('val_invoice_calculate_fees',         'valuation_invoice', 'calculate_fees',         '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager,agent}', false, false, true),
('val_invoice_manage_payment_accounts','valuation_invoice', 'manage_payment_accounts','{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('val_invoice_crypto_payments',        'valuation_invoice', 'crypto_payments',        '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- VALUATION CLIENTS
-- ═══════════════════════════════════════════════════════════════
('val_client_list',   'valuation_client', 'list',   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,agent}', false, false, true),
('val_client_read',   'valuation_client', 'read',   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,agent}', false, false, true),
('val_client_create', 'valuation_client', 'create', '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,agent}', false, false, true),
('val_client_update', 'valuation_client', 'update', '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, false, true),
('val_client_delete', 'valuation_client', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('val_client_email',  'valuation_client', 'email',  '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- PROPERTY MANAGEMENT
-- ═══════════════════════════════════════════════════════════════
('pm_property_list',   'pm_property', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,finance_manager,analyst,viewer}', false, false, true),
('pm_property_read',   'pm_property', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,finance_manager,analyst,viewer}', false, false, true),
('pm_property_create', 'pm_property', 'create', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_property_update', 'pm_property', 'update', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_property_delete', 'pm_property', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('pm_tenant_list',   'pm_tenant', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_tenant_read',   'pm_tenant', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_tenant_create', 'pm_tenant', 'create', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_tenant_update', 'pm_tenant', 'update', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_tenant_delete', 'pm_tenant', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('pm_tenant_screen', 'pm_tenant', 'screen', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_tenant_verify', 'pm_tenant', 'verify', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_tenancy_list',      'pm_tenancy', 'list',      '{super_admin,firm_principal,admin,manager,project_manager,agent,finance_manager}', false, false, true),
('pm_tenancy_read',      'pm_tenancy', 'read',      '{super_admin,firm_principal,admin,manager,project_manager,agent,finance_manager}', false, false, true),
('pm_tenancy_create',    'pm_tenancy', 'create',    '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_tenancy_update',    'pm_tenancy', 'update',    '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_tenancy_activate',  'pm_tenancy', 'activate',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_tenancy_terminate', 'pm_tenancy', 'terminate', '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_tenancy_renew',     'pm_tenancy', 'renew',     '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_payment_record',          'pm_payment', 'record',          '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('pm_payment_read',            'pm_payment', 'read',            '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('pm_payment_initialize',      'pm_payment', 'initialize',      '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('pm_payment_manage_accounts', 'pm_payment', 'manage_accounts', '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('pm_work_order_list',           'pm_work_order', 'list',           '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('pm_work_order_read',           'pm_work_order', 'read',           '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('pm_work_order_create',         'pm_work_order', 'create',         '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('pm_work_order_update',         'pm_work_order', 'update',         '{super_admin,firm_principal,admin,manager,project_manager}', false, true, true),
('pm_work_order_assign',         'pm_work_order', 'assign',         '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_work_order_complete',       'pm_work_order', 'complete',       '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, true, true),
('pm_work_order_approve_budget', 'pm_work_order', 'approve_budget', '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('pm_report_read',    'pm_report', 'read',    '{super_admin,firm_principal,admin,manager,project_manager,finance_manager,analyst}', false, false, true),
('pm_document_create','pm_document','create',  '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent}', false, false, true),
('pm_document_list',  'pm_document','list',    '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,analyst}', false, false, true),
('pm_document_delete','pm_document','delete',  '{super_admin,firm_principal,admin}', false, false, true),
('pm_financials_create','pm_financials','create','{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('pm_financials_read', 'pm_financials','read',  '{super_admin,firm_principal,admin,manager,project_manager,finance_manager,analyst}', false, false, true),
('pm_bulk_rent_increase','pm_bulk','rent_increase','{super_admin,firm_principal,admin}', false, false, true),
('pm_bulk_import',     'pm_bulk','import',     '{super_admin,firm_principal,admin}', false, false, true),
('pm_bulk_export',     'pm_bulk','export',     '{super_admin,firm_principal,admin,manager,project_manager,analyst}', false, false, true),
('pm_application_list',    'pm_application', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_application_read',    'pm_application', 'read',    '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_application_create',  'pm_application', 'create',  '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_application_update',  'pm_application', 'update',  '{super_admin,firm_principal,admin,manager,project_manager}', false, true, true),
('pm_application_delete',  'pm_application', 'delete',  '{super_admin,firm_principal,admin}', false, false, true),
('pm_application_review',  'pm_application', 'review',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_application_approve', 'pm_application', 'approve', '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_application_reject',  'pm_application', 'reject',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_application_convert', 'pm_application', 'convert', '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_lease_template_list',   'pm_lease_template', 'list',   '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_lease_template_create', 'pm_lease_template', 'create', '{super_admin,firm_principal,admin}', false, false, true),
('pm_lease_template_update', 'pm_lease_template', 'update', '{super_admin,firm_principal,admin}', false, false, true),
('pm_lease_template_delete', 'pm_lease_template', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('pm_audit_read', 'pm_audit', 'read', '{super_admin,firm_principal,admin}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- CRM SERVICE
-- ═══════════════════════════════════════════════════════════════
('crm_contact_list',   'crm_contact', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_contact_read',   'crm_contact', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_contact_create', 'crm_contact', 'create', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_contact_update', 'crm_contact', 'update', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_contact_delete', 'crm_contact', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('crm_contact_merge',  'crm_contact', 'merge',  '{super_admin,firm_principal,admin}', false, false, true),
('crm_contact_import', 'crm_contact', 'import', '{super_admin,firm_principal,admin}', false, false, true),
('crm_company_list',   'crm_company', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_company_read',   'crm_company', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_company_create', 'crm_company', 'create', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_company_update', 'crm_company', 'update', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_company_delete', 'crm_company', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('crm_agent_list',   'crm_agent', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_agent_read',   'crm_agent', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_agent_create', 'crm_agent', 'create', '{super_admin,firm_principal,admin}', false, false, true),
('crm_agent_update', 'crm_agent', 'update', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_agent_delete', 'crm_agent', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('crm_deal_list',          'crm_deal', 'list',          '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_deal_read',          'crm_deal', 'read',          '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_deal_create',        'crm_deal', 'create',        '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_deal_update',        'crm_deal', 'update',        '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, true, true),
('crm_deal_delete',        'crm_deal', 'delete',        '{super_admin,firm_principal,admin}', false, false, true),
('crm_deal_move_stage',    'crm_deal', 'move_stage',    '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, true, true),
('crm_deal_change_status', 'crm_deal', 'change_status', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, true, true),
('crm_deal_clone',         'crm_deal', 'clone',         '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_pipeline_list',          'crm_pipeline', 'list',          '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_pipeline_read',          'crm_pipeline', 'read',          '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_pipeline_create',        'crm_pipeline', 'create',        '{super_admin,firm_principal,admin}', false, false, true),
('crm_pipeline_update',        'crm_pipeline', 'update',        '{super_admin,firm_principal,admin}', false, false, true),
('crm_pipeline_delete',        'crm_pipeline', 'delete',        '{super_admin,firm_principal,admin}', false, false, true),
('crm_pipeline_clone',         'crm_pipeline', 'clone',         '{super_admin,firm_principal,admin}', false, false, true),
('crm_pipeline_manage_stages', 'crm_pipeline', 'manage_stages', '{super_admin,firm_principal,admin}', false, false, true),
('crm_task_list',     'crm_task', 'list',     '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_task_read',     'crm_task', 'read',     '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_task_create',   'crm_task', 'create',   '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_task_update',   'crm_task', 'update',   '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, true, true),
('crm_task_delete',   'crm_task', 'delete',   '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_task_complete', 'crm_task', 'complete', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, true, true),
('crm_commission_read_plans',        'crm_commission', 'read_plans',        '{super_admin,firm_principal,admin,manager,finance_manager,agent}', false, false, true),
('crm_commission_manage_plans',      'crm_commission', 'manage_plans',      '{super_admin,firm_principal,admin}', false, false, true),
('crm_commission_read_records',      'crm_commission', 'read_records',      '{super_admin,firm_principal,admin,manager,finance_manager,agent}', false, false, true),
('crm_commission_approve',           'crm_commission', 'approve',           '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_commission_pay',               'crm_commission', 'pay',               '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('crm_commission_clawback',          'crm_commission', 'clawback',          '{super_admin,firm_principal,admin}', false, false, true),
('crm_commission_bulk_approve',      'crm_commission', 'bulk_approve',      '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_commission_calculate',         'crm_commission', 'calculate',         '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('crm_commission_manage_splits',     'crm_commission', 'manage_splits',     '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_commission_manage_adjustments','crm_commission', 'manage_adjustments','{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_drip_campaign_list',         'crm_drip_campaign', 'list',         '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_drip_campaign_read',         'crm_drip_campaign', 'read',         '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_drip_campaign_create',       'crm_drip_campaign', 'create',       '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_drip_campaign_update',       'crm_drip_campaign', 'update',       '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_drip_campaign_delete',       'crm_drip_campaign', 'delete',       '{super_admin,firm_principal,admin}', false, false, true),
('crm_drip_campaign_manage_steps', 'crm_drip_campaign', 'manage_steps', '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_drip_campaign_enroll',       'crm_drip_campaign', 'enroll',       '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- PROJECTS SERVICE
-- ═══════════════════════════════════════════════════════════════
('project_list',          'project', 'list',          '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,analyst,viewer}', false, false, true),
('project_read',          'project', 'read',          '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,analyst,viewer}', false, false, true),
('project_create',        'project', 'create',        '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_update',        'project', 'update',        '{super_admin,firm_principal,admin,manager,project_manager}', false, true, true),
('project_delete',        'project', 'delete',        '{super_admin,firm_principal,admin}', false, false, true),
('project_change_status', 'project', 'change_status', '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_phase_list',          'project_phase', 'list',          '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,analyst}', false, false, true),
('project_phase_create',        'project_phase', 'create',        '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_phase_update',        'project_phase', 'update',        '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_phase_delete',        'project_phase', 'delete',        '{super_admin,firm_principal,admin}', false, false, true),
('project_milestone_list',      'project_milestone', 'list',      '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,analyst}', false, false, true),
('project_milestone_create',    'project_milestone', 'create',    '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_milestone_complete',  'project_milestone', 'complete',  '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_milestone_reschedule','project_milestone', 'reschedule','{super_admin,firm_principal,admin,manager}', false, false, true),
('project_unit_list',     'project_unit', 'list',     '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('project_unit_create',   'project_unit', 'create',   '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_unit_update',   'project_unit', 'update',   '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_unit_reserve',  'project_unit', 'reserve',  '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('project_unit_sell',     'project_unit', 'sell',      '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_unit_handover', 'project_unit', 'handover', '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_cost_list',         'project_cost', 'list',         '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('project_cost_create',       'project_cost', 'create',       '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_cost_approve',      'project_cost', 'approve',      '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('project_cost_pay',          'project_cost', 'pay',          '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('project_cost_bulk_approve', 'project_cost', 'bulk_approve', '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('project_cost_delete',       'project_cost', 'delete',       '{super_admin,firm_principal,admin}', false, false, true),
('project_contractor_list',               'project_contractor', 'list',               '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('project_contractor_create',             'project_contractor', 'create',             '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_contractor_approve',            'project_contractor', 'approve',            '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_contractor_suspend',            'project_contractor', 'suspend',            '{super_admin,firm_principal,admin}', false, false, true),
('project_contractor_manage_assignments', 'project_contractor', 'manage_assignments', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_draw_request_list',    'project_draw_request', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('project_draw_request_create',  'project_draw_request', 'create',  '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_draw_request_approve', 'project_draw_request', 'approve', '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_draw_request_reject',  'project_draw_request', 'reject',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_draw_request_fund',    'project_draw_request', 'fund',    '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('project_daily_log_list',    'project_daily_log', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('project_daily_log_create',  'project_daily_log', 'create',  '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('project_daily_log_approve', 'project_daily_log', 'approve', '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_punch_list_list',     'project_punch_list', 'list',     '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('project_punch_list_create',   'project_punch_list', 'create',   '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('project_punch_list_assign',   'project_punch_list', 'assign',   '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_punch_list_complete', 'project_punch_list', 'complete', '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, true, true),
('project_punch_list_verify',   'project_punch_list', 'verify',   '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_punch_list_reject',   'project_punch_list', 'reject',   '{super_admin,firm_principal,admin,manager}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- DATA HUB
-- ═══════════════════════════════════════════════════════════════
('datahub_source_list',          'datahub_source', 'list',   '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('datahub_source_create',        'datahub_source', 'create', '{super_admin,firm_principal,admin}', false, false, true),
('datahub_source_sync',          'datahub_source', 'sync',   '{super_admin,firm_principal,admin}', false, false, true),
('datahub_source_delete',        'datahub_source', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('datahub_contribution_list',    'datahub_contribution', 'list',    '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('datahub_contribution_create',  'datahub_contribution', 'create',  '{super_admin,firm_principal,admin,manager,valuer,agent}', false, false, true),
('datahub_contribution_approve', 'datahub_contribution', 'approve', '{super_admin,firm_principal,admin}', false, false, true),
('datahub_contribution_reject',  'datahub_contribution', 'reject',  '{super_admin,firm_principal,admin}', false, false, true),
('datahub_quality_read',         'datahub_quality', 'read',  '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('datahub_geocoding_geocode',    'datahub_geocoding', 'geocode', '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent}', false, false, true),
('datahub_economic_read',        'datahub_economic', 'read',  '{super_admin,firm_principal,admin,manager,analyst,valuer}', false, false, true),
('datahub_economic_sync',        'datahub_economic', 'sync',  '{super_admin,firm_principal,admin}', false, false, false),
('datahub_scheduler_read',       'datahub_scheduler', 'read',  '{super_admin,admin}', false, false, false),
('datahub_scheduler_start',      'datahub_scheduler', 'start', '{super_admin,admin}', false, false, false),
('datahub_scheduler_stop',       'datahub_scheduler', 'stop',  '{super_admin,admin}', false, false, false),
('datahub_config_read',          'datahub_config', 'read',   '{super_admin,admin}', false, false, false),
('datahub_config_update',        'datahub_config', 'update', '{super_admin}', false, false, false),
('datahub_spider_list',          'datahub_spider', 'list',  '{super_admin,admin}', false, false, false),
('datahub_spider_start',         'datahub_spider', 'start', '{super_admin,admin}', false, false, false),

-- ═══════════════════════════════════════════════════════════════
-- BUDGET / FINANCE
-- ═══════════════════════════════════════════════════════════════
('budget_analytics_read',       'budget_analytics', 'read',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager,analyst}', false, false, true),
('budget_rate_lock_create',     'budget_rate_lock', 'create',   '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_rate_lock_list',       'budget_rate_lock', 'list',     '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('budget_rate_lock_delete',     'budget_rate_lock', 'delete',   '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_snapshot_create',      'budget_snapshot', 'create',    '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_alert_list',           'budget_alert', 'list',         '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_alert_acknowledge',    'budget_alert', 'acknowledge',  '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_invoice_list',         'budget_invoice', 'list',       '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_invoice_read',         'budget_invoice', 'read',       '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_invoice_create',       'budget_invoice', 'create',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_invoice_update',       'budget_invoice', 'update',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, true, true),
('budget_invoice_delete',       'budget_invoice', 'delete',     '{super_admin,firm_principal,admin}', false, false, true),
('budget_invoice_submit',       'budget_invoice', 'submit',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, true, true),
('budget_invoice_approve',      'budget_invoice', 'approve',    '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_invoice_reject',       'budget_invoice', 'reject',     '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_invoice_pay',          'budget_invoice', 'pay',        '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_expense_list',         'budget_expense', 'list',       '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_expense_create',       'budget_expense', 'create',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_expense_update',       'budget_expense', 'update',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, true, true),
('budget_expense_delete',       'budget_expense', 'delete',     '{super_admin,firm_principal,admin}', false, false, true),
('budget_expense_approve',      'budget_expense', 'approve',    '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_expense_reject',       'budget_expense', 'reject',     '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_expense_bulk_approve', 'budget_expense', 'bulk_approve','{super_admin,firm_principal,admin,finance_manager}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- CONSTRUCTION MODULE
-- ═══════════════════════════════════════════════════════════════
('rfi_list',    'rfi', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('rfi_read',    'rfi', 'read',    '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('rfi_create',  'rfi', 'create',  '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('rfi_assign',  'rfi', 'assign',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('rfi_respond', 'rfi', 'respond', '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, true, true),
('rfi_close',   'rfi', 'close',   '{super_admin,firm_principal,admin,manager}', false, false, true),
('rfi_void',    'rfi', 'void',    '{super_admin,firm_principal,admin}', false, false, true),
('rfi_delete',  'rfi', 'delete',  '{super_admin,firm_principal,admin}', false, false, true),
('change_order_list',    'change_order', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('change_order_create',  'change_order', 'create',  '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('change_order_approve', 'change_order', 'approve', '{super_admin,firm_principal,admin,manager}', false, false, true),
('change_order_reject',  'change_order', 'reject',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('change_order_execute', 'change_order', 'execute', '{super_admin,firm_principal,admin}', false, false, true),
('change_order_void',    'change_order', 'void',    '{super_admin,firm_principal,admin}', false, false, true),
('submittal_list',    'submittal', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('submittal_create',  'submittal', 'create',  '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('submittal_assign',  'submittal', 'assign',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('submittal_review',  'submittal', 'review',  '{super_admin,firm_principal,admin,manager,project_manager}', false, true, true),
('submittal_void',    'submittal', 'void',    '{super_admin,firm_principal,admin}', false, false, true),
('procurement_list',    'procurement', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('procurement_create',  'procurement', 'create',  '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('procurement_approve', 'procurement', 'approve', '{super_admin,firm_principal,admin,manager}', false, false, true),
('procurement_order',   'procurement', 'order',   '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('procurement_cancel',  'procurement', 'cancel',  '{super_admin,firm_principal,admin}', false, false, true),
('site_diary_list',   'site_diary', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('site_diary_create', 'site_diary', 'create', '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('site_diary_delete', 'site_diary', 'delete', '{super_admin,firm_principal,admin}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- ADMIN SERVICE (STAFF ONLY)
-- ═══════════════════════════════════════════════════════════════
('admin_fees_list',              'admin_fees', 'list',              '{super_admin,admin}', false, false, false),
('admin_fees_update',            'admin_fees', 'update',            '{super_admin,admin}', false, false, false),
('admin_fees_create',            'admin_fees', 'create',            '{super_admin,admin}', false, false, false),
('admin_crypto_read_status',     'admin_crypto', 'read_status',     '{super_admin,admin}', false, false, false),
('admin_crypto_manage_wallets',  'admin_crypto', 'manage_wallets',  '{super_admin}', false, false, false),
('admin_crypto_manage_tokens',   'admin_crypto', 'manage_tokens',   '{super_admin}', false, false, false),
('admin_crypto_read_transactions','admin_crypto','read_transactions','{super_admin,admin}', false, false, false),
('admin_crypto_manage_escrow',   'admin_crypto', 'manage_escrow',   '{super_admin}', false, false, false),
('admin_users_list',             'admin_users', 'list',             '{super_admin,admin}', false, false, false),
('admin_users_update',           'admin_users', 'update',           '{super_admin,admin}', false, false, false),
('admin_users_delete',           'admin_users', 'delete',           '{super_admin}', false, false, false),
('admin_integrations_read',      'admin_integrations', 'read',      '{super_admin,admin}', false, false, false),
('admin_integrations_manage',    'admin_integrations', 'manage',    '{super_admin}', false, false, false),
('admin_billing_read',           'admin_billing', 'read',           '{super_admin,admin}', false, false, false),
('admin_billing_manage',         'admin_billing', 'manage',         '{super_admin,admin}', false, false, false),
('admin_platform_read_usage',    'admin_platform', 'read_usage',    '{super_admin,admin}', false, false, false),
('admin_platform_manage',        'admin_platform', 'manage',        '{super_admin}', false, false, false),

-- ═══════════════════════════════════════════════════════════════
-- ANALYTICS
-- ═══════════════════════════════════════════════════════════════
('analytics_read_dashboard',        'analytics', 'read_dashboard',        '{super_admin,firm_principal,admin,manager,project_manager,analyst}', false, false, true),
('analytics_read_cohorts',          'analytics', 'read_cohorts',          '{super_admin,firm_principal,admin,manager,project_manager,analyst}', false, false, true),
('analytics_read_win_loss',         'analytics', 'read_win_loss',         '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('analytics_read_funnel',           'analytics', 'read_funnel',           '{super_admin,firm_principal,admin,manager,project_manager,analyst}', false, false, true),
('analytics_read_agent_performance','analytics', 'read_agent_performance','{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('analytics_export',                'analytics', 'export',               '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- SMALLER SERVICES
-- ═══════════════════════════════════════════════════════════════

-- Workflows
('workflow_list',             'workflow', 'list',             '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('workflow_read',             'workflow', 'read',             '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('workflow_create',           'workflow', 'create',           '{super_admin,firm_principal,admin,manager}', false, false, true),
('workflow_update',           'workflow', 'update',           '{super_admin,firm_principal,admin,manager}', false, false, true),
('workflow_delete',           'workflow', 'delete',           '{super_admin,firm_principal,admin}', false, false, true),
('workflow_activate',         'workflow', 'activate',         '{super_admin,firm_principal,admin,manager}', false, false, true),
('workflow_trigger',          'workflow', 'trigger',          '{super_admin,firm_principal,admin,manager}', false, false, true),
('workflow_cancel_execution', 'workflow', 'cancel_execution', '{super_admin,firm_principal,admin,manager}', false, false, true),

-- Governance
('governance_list',           'governance', 'list',           '{super_admin,firm_principal,admin,manager,project_manager,compliance_officer}', false, false, true),
('governance_read',           'governance', 'read',           '{super_admin,firm_principal,admin,manager,project_manager,compliance_officer}', false, false, true),
('governance_create',         'governance', 'create',         '{super_admin,firm_principal,admin}', false, false, true),
('governance_update',         'governance', 'update',         '{super_admin,firm_principal,admin}', false, false, true),
('governance_delete',         'governance', 'delete',         '{super_admin,firm_principal,admin}', false, false, true),
('governance_lock',           'governance', 'lock',           '{super_admin,firm_principal,admin}', false, false, true),

-- Publications
('publication_list',    'publication', 'list',    '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('publication_read',    'publication', 'read',    '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('publication_create',  'publication', 'create',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('publication_update',  'publication', 'update',  '{super_admin,firm_principal,admin,manager}', false, true, true),
('publication_delete',  'publication', 'delete',  '{super_admin,firm_principal,admin}', false, false, true),
('publication_publish', 'publication', 'publish', '{super_admin,firm_principal,admin}', false, false, true),

-- Autopilot (STAFF ONLY)
('autopilot_run',             'autopilot', 'run',             '{super_admin,admin}', false, false, false),
('autopilot_read',            'autopilot', 'read',            '{super_admin,admin}', false, false, false),
('autopilot_update_settings', 'autopilot', 'update_settings', '{super_admin}', false, false, false),
('autopilot_manage_deferred', 'autopilot', 'manage_deferred', '{super_admin,admin}', false, false, false),

-- Litigation
('litigation_read',         'litigation', 'read',         '{super_admin,firm_principal,admin,senior_valuer,manager,compliance_officer}', false, false, true),
('litigation_assess_risk',  'litigation', 'assess_risk',  '{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('litigation_refresh',      'litigation', 'refresh',      '{super_admin,firm_principal,admin}', false, false, true),

-- Portfolio
('portfolio_read', 'portfolio', 'read', '{super_admin,firm_principal,admin,manager,project_manager,analyst}', false, false, true),

-- Workspace
('workspace_list',             'workspace', 'list',             '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('workspace_read',             'workspace', 'read',             '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('workspace_create',           'workspace', 'create',           '{super_admin,firm_principal,admin,manager}', false, false, true),
('workspace_delete',           'workspace', 'delete',           '{super_admin,firm_principal,admin}', false, false, true),
('workspace_manage_boards',    'workspace', 'manage_boards',    '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('workspace_manage_documents', 'workspace', 'manage_documents', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),

-- Short Stay
('short_stay_read',    'short_stay', 'read',    '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('short_stay_refresh', 'short_stay', 'refresh', '{super_admin,firm_principal,admin}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- SHARED SERVICES
-- ═══════════════════════════════════════════════════════════════
('notifications_read', 'notifications', 'read', '{super_admin,firm_principal,admin,manager,project_manager,senior_valuer,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst,viewer}', true, false, true),
('messaging_read',   'messaging', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,senior_valuer,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst}', false, false, true),
('messaging_create', 'messaging', 'create', '{super_admin,firm_principal,admin,manager,project_manager,senior_valuer,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst}', false, false, true),
('user_profile_read',   'user_profile', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,senior_valuer,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst,viewer}', true, false, false),
('user_profile_update', 'user_profile', 'update', '{super_admin,firm_principal,admin,manager,project_manager,senior_valuer,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst,viewer}', true, false, false),
('invitations_read',   'invitations', 'read',   '{super_admin,firm_principal,admin,manager}', false, false, true),
('invitations_create', 'invitations', 'create', '{super_admin,firm_principal,admin,manager}', false, false, true),
('invitations_manage', 'invitations', 'manage', '{super_admin,firm_principal,admin}', false, false, true),
('team_read',   'team', 'read',   '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('team_manage', 'team', 'manage', '{super_admin,firm_principal,admin}', false, false, true),
('team_invite', 'team', 'invite', '{super_admin,firm_principal,admin,manager}', false, false, true)

ON CONFLICT (policy_name) DO UPDATE SET
  resource_type = EXCLUDED.resource_type,
  action = EXCLUDED.action,
  allowed_roles = EXCLUDED.allowed_roles,
  require_ownership = EXCLUDED.require_ownership,
  require_assignment = EXCLUDED.require_assignment,
  require_same_org = EXCLUDED.require_same_org,
  is_active = true,
  updated_at = NOW();

-- 4. Verify counts
DO $$
DECLARE
  active_count INTEGER;
  inactive_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO active_count FROM authorization_policies WHERE is_active = true;
  SELECT COUNT(*) INTO inactive_count FROM authorization_policies WHERE is_active = false;
  RAISE NOTICE 'Active policies: %, Inactive (legacy): %', active_count, inactive_count;
END $$;

COMMIT;
