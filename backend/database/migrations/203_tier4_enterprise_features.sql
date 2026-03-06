-- ============================================================================
-- Migration 004: Tier 4 Enterprise Features
-- Safety/Incident, Time Tracking, Equipment, Bidding, Closeout/Warranty,
-- Audit Logging, Custom Fields, Integration Framework
-- ============================================================================

-- ============================================================================
-- 1. SAFETY & INCIDENT MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS safety_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  incident_number VARCHAR(20) NOT NULL,
  title VARCHAR(500) NOT NULL,
  incident_type VARCHAR(50) NOT NULL DEFAULT 'near_miss',  -- near_miss, first_aid, recordable, lost_time, fatality, property_damage, environmental
  severity VARCHAR(20) NOT NULL DEFAULT 'low',  -- low, medium, high, critical
  status VARCHAR(30) NOT NULL DEFAULT 'reported',  -- reported, under_investigation, corrective_action, resolved, closed
  description TEXT,
  location VARCHAR(500),
  incident_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reported_by UUID,
  reported_by_name VARCHAR(255),
  assigned_investigator UUID,
  investigator_name VARCHAR(255),
  root_cause TEXT,
  corrective_actions TEXT,
  preventive_actions TEXT,
  witnesses TEXT,  -- JSON array of names
  injuries_count INT DEFAULT 0,
  property_damage_cost DECIMAL(15,2) DEFAULT 0,
  lost_work_days INT DEFAULT 0,
  osha_recordable BOOLEAN DEFAULT FALSE,
  photos TEXT,  -- JSON array of URLs
  attachments TEXT,  -- JSON array of URLs
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  observation_number VARCHAR(20) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'unsafe_condition',  -- unsafe_condition, unsafe_act, positive, environmental, housekeeping, ppe, fall_protection, electrical
  severity VARCHAR(20) NOT NULL DEFAULT 'low',
  status VARCHAR(20) NOT NULL DEFAULT 'open',  -- open, in_progress, resolved, closed
  description TEXT NOT NULL,
  location VARCHAR(500),
  observed_by UUID,
  observer_name VARCHAR(255),
  corrective_action TEXT,
  due_date DATE,
  resolved_at TIMESTAMPTZ,
  photos TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  inspection_number VARCHAR(20) NOT NULL,
  inspection_type VARCHAR(50) NOT NULL DEFAULT 'routine',  -- routine, pre_task, weekly, monthly, regulatory, special
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',  -- scheduled, in_progress, completed, failed
  inspector_id UUID,
  inspector_name VARCHAR(255),
  inspection_date DATE NOT NULL,
  score DECIMAL(5,2),  -- percentage score
  total_items INT DEFAULT 0,
  passed_items INT DEFAULT 0,
  failed_items INT DEFAULT 0,
  findings TEXT,  -- JSON array
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_safety_incidents_project ON safety_incidents(project_id);
CREATE INDEX idx_safety_incidents_status ON safety_incidents(status);
CREATE INDEX idx_safety_incidents_type ON safety_incidents(incident_type);
CREATE INDEX idx_safety_observations_project ON safety_observations(project_id);
CREATE INDEX idx_safety_inspections_project ON safety_inspections(project_id);

-- ============================================================================
-- 2. TIME TRACKING / TIMESHEETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_name VARCHAR(255),
  entry_date DATE NOT NULL,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  hours_worked DECIMAL(5,2),
  overtime_hours DECIMAL(5,2) DEFAULT 0,
  break_minutes INT DEFAULT 0,
  cost_code VARCHAR(50),
  activity_type VARCHAR(50) DEFAULT 'labor',  -- labor, supervision, inspection, meeting, travel, training
  description TEXT,
  location VARCHAR(500),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  clock_in_latitude DECIMAL(10,7),
  clock_in_longitude DECIMAL(10,7),
  clock_out_latitude DECIMAL(10,7),
  clock_out_longitude DECIMAL(10,7),
  geo_fenced BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, submitted, approved, rejected
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  hourly_rate DECIMAL(10,2),
  total_cost DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_name VARCHAR(255),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, submitted, approved, rejected
  total_regular_hours DECIMAL(6,2) DEFAULT 0,
  total_overtime_hours DECIMAL(6,2) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crew_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  crew_name VARCHAR(255) NOT NULL,
  foreman_id UUID,
  foreman_name VARCHAR(255),
  schedule_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  headcount INT DEFAULT 0,
  trade VARCHAR(100),
  area VARCHAR(255),
  task_description TEXT,
  status VARCHAR(20) DEFAULT 'scheduled',  -- scheduled, active, completed, cancelled
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_entries_project ON time_entries(project_id);
CREATE INDEX idx_time_entries_user ON time_entries(user_id);
CREATE INDEX idx_time_entries_date ON time_entries(entry_date);
CREATE INDEX idx_timesheets_project ON timesheets(project_id);
CREATE INDEX idx_timesheets_user ON timesheets(user_id);
CREATE INDEX idx_crew_schedules_project ON crew_schedules(project_id);
CREATE INDEX idx_crew_schedules_date ON crew_schedules(schedule_date);

-- ============================================================================
-- 3. EQUIPMENT TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  equipment_number VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'heavy',  -- heavy, light, power_tools, vehicles, scaffolding, safety, measuring, other
  make VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  year INT,
  status VARCHAR(30) NOT NULL DEFAULT 'available',  -- available, in_use, maintenance, repair, retired, disposed
  condition_rating VARCHAR(20) DEFAULT 'good',  -- excellent, good, fair, poor, critical
  current_project_id UUID,
  current_location VARCHAR(500),
  ownership_type VARCHAR(20) DEFAULT 'owned',  -- owned, rented, leased
  purchase_date DATE,
  purchase_cost DECIMAL(12,2),
  rental_rate_daily DECIMAL(10,2),
  rental_rate_weekly DECIMAL(10,2),
  rental_rate_monthly DECIMAL(10,2),
  insurance_expiry DATE,
  registration_expiry DATE,
  last_inspection_date DATE,
  next_inspection_date DATE,
  hours_meter DECIMAL(10,1) DEFAULT 0,
  odometer DECIMAL(10,1) DEFAULT 0,
  fuel_type VARCHAR(30),
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  assigned_to UUID,
  assigned_to_name VARCHAR(255),
  assigned_date DATE NOT NULL,
  return_date DATE,
  actual_return_date DATE,
  daily_rate DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'active',  -- active, returned, overdue
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  maintenance_type VARCHAR(50) NOT NULL DEFAULT 'preventive',  -- preventive, corrective, emergency, inspection
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',  -- scheduled, in_progress, completed, cancelled
  scheduled_date DATE,
  completed_date DATE,
  cost DECIMAL(10,2) DEFAULT 0,
  performed_by VARCHAR(255),
  vendor VARCHAR(255),
  parts_used TEXT,  -- JSON
  hours_at_service DECIMAL(10,1),
  next_service_hours DECIMAL(10,1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_equipment_org ON equipment(organization_id);
CREATE INDEX idx_equipment_status ON equipment(status);
CREATE INDEX idx_equipment_category ON equipment(category);
CREATE INDEX idx_equipment_assignments_project ON equipment_assignments(project_id);
CREATE INDEX idx_equipment_assignments_equipment ON equipment_assignments(equipment_id);
CREATE INDEX idx_equipment_maintenance_equipment ON equipment_maintenance(equipment_id);

-- ============================================================================
-- 4. BIDDING & PREQUALIFICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS bid_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  package_number VARCHAR(20) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  trade VARCHAR(100),
  scope_of_work TEXT,
  budget_estimate DECIMAL(15,2),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',  -- draft, published, bidding, evaluation, awarded, cancelled
  bid_due_date TIMESTAMPTZ,
  pre_bid_meeting_date TIMESTAMPTZ,
  pre_bid_meeting_location VARCHAR(500),
  published_at TIMESTAMPTZ,
  awarded_at TIMESTAMPTZ,
  awarded_to UUID,  -- vendor/contractor id
  awarded_to_name VARCHAR(255),
  awarded_amount DECIMAL(15,2),
  documents TEXT,  -- JSON array of document URLs
  requirements TEXT,  -- JSON array of requirements
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_package_id UUID NOT NULL REFERENCES bid_packages(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  vendor_id UUID,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_email VARCHAR(255),
  vendor_phone VARCHAR(50),
  bid_amount DECIMAL(15,2) NOT NULL,
  alternate_amounts TEXT,  -- JSON: [{description, amount}]
  unit_prices TEXT,  -- JSON: [{item, unit, price}]
  exclusions TEXT,
  inclusions TEXT,
  proposed_schedule_days INT,
  bond_included BOOLEAN DEFAULT FALSE,
  insurance_verified BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'received',  -- received, under_review, shortlisted, accepted, rejected, withdrawn
  score DECIMAL(5,2),
  evaluation_notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  documents TEXT,  -- JSON
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_prequalifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  vendor_id UUID,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  trades TEXT,  -- JSON array
  years_in_business INT,
  annual_revenue DECIMAL(15,2),
  employee_count INT,
  bonding_capacity DECIMAL(15,2),
  insurance_general_liability BOOLEAN DEFAULT FALSE,
  insurance_workers_comp BOOLEAN DEFAULT FALSE,
  insurance_auto BOOLEAN DEFAULT FALSE,
  insurance_umbrella BOOLEAN DEFAULT FALSE,
  safety_emr DECIMAL(5,3),  -- Experience Modification Rate
  safety_trir DECIMAL(5,3),  -- Total Recordable Incident Rate
  osha_violations INT DEFAULT 0,
  references TEXT,  -- JSON array
  certifications TEXT,  -- JSON array (MBE, WBE, DBE, etc.)
  financial_statements_provided BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, approved, conditional, rejected, expired
  qualification_score DECIMAL(5,2),
  valid_until DATE,
  notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bid_packages_project ON bid_packages(project_id);
CREATE INDEX idx_bid_packages_status ON bid_packages(status);
CREATE INDEX idx_bids_package ON bids(bid_package_id);
CREATE INDEX idx_bids_status ON bids(status);
CREATE INDEX idx_vendor_prequalifications_org ON vendor_prequalifications(organization_id);
CREATE INDEX idx_vendor_prequalifications_status ON vendor_prequalifications(status);

-- ============================================================================
-- 5. CLOSEOUT & WARRANTY MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_closeout (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'not_started',  -- not_started, in_progress, substantial_completion, final_completion, closed
  substantial_completion_date DATE,
  final_completion_date DATE,
  certificate_of_occupancy BOOLEAN DEFAULT FALSE,
  co_date DATE,
  final_inspection_passed BOOLEAN DEFAULT FALSE,
  final_inspection_date DATE,
  as_built_drawings_received BOOLEAN DEFAULT FALSE,
  om_manuals_received BOOLEAN DEFAULT FALSE,
  training_completed BOOLEAN DEFAULT FALSE,
  spare_parts_delivered BOOLEAN DEFAULT FALSE,
  final_lien_waivers_received BOOLEAN DEFAULT FALSE,
  consent_of_surety BOOLEAN DEFAULT FALSE,
  final_payment_processed BOOLEAN DEFAULT FALSE,
  retainage_released BOOLEAN DEFAULT FALSE,
  retainage_amount DECIMAL(15,2),
  punch_list_complete BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS closeout_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closeout_id UUID NOT NULL REFERENCES project_closeout(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  category VARCHAR(50) NOT NULL,  -- document, inspection, training, delivery, financial, permit
  title VARCHAR(500) NOT NULL,
  description TEXT,
  responsible_party VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, in_progress, completed, waived, na
  due_date DATE,
  completed_date DATE,
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  warranty_number VARCHAR(20) NOT NULL,
  title VARCHAR(500) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'standard',  -- standard, extended, manufacturer, labor, material, equipment, roof, structural
  contractor_name VARCHAR(255),
  contractor_id UUID,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_months INT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, expiring_soon, expired, claimed, void
  scope TEXT,
  terms TEXT,
  exclusions TEXT,
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  document_url TEXT,
  max_claim_amount DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warranty_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id UUID NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  claim_number VARCHAR(20) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',  -- submitted, acknowledged, in_progress, resolved, denied, escalated
  reported_by VARCHAR(255),
  reported_date DATE NOT NULL DEFAULT CURRENT_DATE,
  resolution_description TEXT,
  resolution_cost DECIMAL(12,2),
  resolved_date DATE,
  photos TEXT,  -- JSON
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_closeout_project ON project_closeout(project_id);
CREATE INDEX idx_closeout_items_closeout ON closeout_items(closeout_id);
CREATE INDEX idx_warranties_project ON warranties(project_id);
CREATE INDEX idx_warranties_status ON warranties(status);
CREATE INDEX idx_warranties_end_date ON warranties(end_date);
CREATE INDEX idx_warranty_claims_warranty ON warranty_claims(warranty_id);

-- ============================================================================
-- 6. GLOBAL AUDIT LOG (SOC 2 Compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  user_id UUID,
  user_email VARCHAR(255),
  user_name VARCHAR(255),
  action VARCHAR(50) NOT NULL,  -- create, read, update, delete, login, logout, export, approve, reject, assign
  resource_type VARCHAR(50) NOT NULL,  -- project, issue, drawing, meeting, document, user, setting, etc.
  resource_id UUID,
  resource_name VARCHAR(500),
  details JSONB,  -- changed fields, old/new values, etc.
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR(100),
  request_method VARCHAR(10),
  request_path TEXT,
  response_status INT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_org ON audit_log(organization_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- ============================================================================
-- 7. CUSTOM FIELDS FRAMEWORK
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  entity_type VARCHAR(50) NOT NULL,  -- project, issue, risk, drawing, meeting, equipment, bid_package, warranty, etc.
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(30) NOT NULL DEFAULT 'text',  -- text, number, date, select, multi_select, checkbox, url, email, phone, textarea, currency
  options TEXT,  -- JSON array for select/multi_select
  default_value TEXT,
  required BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  validation_regex VARCHAR(500),
  min_value DECIMAL(15,2),
  max_value DECIMAL(15,2),
  placeholder VARCHAR(255),
  help_text VARCHAR(500),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, entity_type, field_name)
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_definition_id UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,  -- the ID of the project/issue/drawing/etc.
  entity_type VARCHAR(50) NOT NULL,
  value_text TEXT,
  value_number DECIMAL(15,4),
  value_date DATE,
  value_boolean BOOLEAN,
  value_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(field_definition_id, entity_id)
);

CREATE INDEX idx_custom_field_defs_org ON custom_field_definitions(organization_id, entity_type);
CREATE INDEX idx_custom_field_values_entity ON custom_field_values(entity_type, entity_id);
CREATE INDEX idx_custom_field_values_def ON custom_field_values(field_definition_id);

-- ============================================================================
-- 8. INTEGRATION FRAMEWORK / APP MARKETPLACE
-- ============================================================================

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  integration_type VARCHAR(50) NOT NULL,  -- quickbooks, xero, sage, yardi, webhook, zapier, custom_api
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'inactive',  -- inactive, active, error, suspended
  config JSONB NOT NULL DEFAULT '{}',  -- encrypted connection config
  auth_type VARCHAR(20) DEFAULT 'api_key',  -- api_key, oauth2, basic, bearer
  api_key_hash VARCHAR(255),
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_expires_at TIMESTAMPTZ,
  webhook_url TEXT,
  webhook_secret VARCHAR(255),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  sync_frequency VARCHAR(20) DEFAULT 'manual',  -- manual, hourly, daily, weekly, realtime
  events_subscribed TEXT,  -- JSON array of event types
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  direction VARCHAR(10) NOT NULL DEFAULT 'outbound',  -- inbound, outbound
  event_type VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'success',  -- success, failed, pending, retrying
  request_payload JSONB,
  response_payload JSONB,
  response_status INT,
  error_message TEXT,
  duration_ms INT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,  -- first 8 chars for identification
  key_hash VARCHAR(255) NOT NULL,  -- bcrypt hash of full key
  scopes TEXT,  -- JSON array of permitted scopes
  rate_limit INT DEFAULT 1000,  -- requests per hour
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_integrations_org ON integrations(organization_id);
CREATE INDEX idx_integrations_type ON integrations(integration_type);
CREATE INDEX idx_integrations_status ON integrations(status);
CREATE INDEX idx_integration_logs_integration ON integration_logs(integration_id);
CREATE INDEX idx_integration_logs_created ON integration_logs(created_at);
CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
