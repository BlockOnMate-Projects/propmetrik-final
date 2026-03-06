-- Migration: Create CRM & Deal Management Tables
-- Phase 5.1: Core Entities and Database Schema
-- Author: PropMetrik Development Team
-- Date: 2026-01-20

-- =============================================
-- ENUMS AND TYPES (Idempotent creation)
-- =============================================

DO $$ BEGIN
  CREATE TYPE contact_type_enum AS ENUM (
    'first_time_buyer','repeat_buyer','investor','developer','diaspora_buyer',
    'corporate_buyer','government_entity','tenant','landlord','agent','lawyer','other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE lead_source_enum AS ENUM (
    'website','property_listing','contact_form','valuation_request','facebook',
    'instagram','whatsapp','referral','event','walk_in','diaspora_campaign','google_ads','other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE lead_status_enum AS ENUM (
    'new','contacted','qualified','proposal_sent','negotiating','converted','lost','unresponsive'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE qualification_enum AS ENUM ('unqualified','low','medium','high','hot');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE contact_method_enum AS ENUM ('phone','whatsapp','email','sms','in_person','video_call');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE language_enum AS ENUM ('english','twi','ga','ewe','dagbani','fante','other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE deal_type_enum AS ENUM ('sale','rental','jv','land_acquisition','development','investment');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE deal_status_enum AS ENUM ('active','won','lost','archived','on_hold');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_type_enum AS ENUM (
    'phone_call','email','whatsapp_message','sms','in_person_meeting','video_call',
    'property_viewing','property_research','document_request','document_received','document_review',
    'offer_preparation','offer_submission','negotiation','contract_preparation','payment_processing',
    'title_verification','property_inspection','valuation_order','legal_review',
    'stage_change','note_added','task_created','task_completed','other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_outcome_enum AS ENUM (
    'successful','unsuccessful','pending','follow_up_required','no_answer',
    'not_interested','interested','scheduled','completed','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_priority_enum AS ENUM ('low','medium','high','urgent');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_status_enum AS ENUM ('pending','in_progress','completed','cancelled','overdue');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE document_type_enum AS ENUM (
    'contract','offer_letter','mou','deed_of_assignment','indenture','power_of_attorney',
    'lease_agreement','receipt','legal_document','property_document','identification','financial_statement','other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE employment_status_enum AS ENUM ('employed','self_employed','unemployed','student','retired','other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE income_range_enum AS ENUM ('under_2000','2000_5000','5000_10000','10000_20000','20000_50000','over_50000');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE company_type_enum AS ENUM (
    'developer','investor','corporate','real_estate_agency','construction','financial_institution','government','other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE signature_status_enum AS ENUM ('pending','sent','viewed','signed','declined','expired','cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- TABLE: companies
-- =============================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Company information
  company_name VARCHAR(255) NOT NULL,
  company_type company_type_enum,
  industry VARCHAR(100),
  company_size VARCHAR(50),
  registration_number VARCHAR(100),
  
  -- Contact information
  primary_contact_id UUID, -- References contacts table
  phone VARCHAR(20),
  email VARCHAR(255),
  website VARCHAR(255),
  
  -- Location
  address JSONB,
  region VARCHAR(100),
  city VARCHAR(100),
  digital_address VARCHAR(50), -- Ghana Post GPS
  
  -- Metadata
  notes TEXT,
  tags TEXT[],
  custom_fields JSONB,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete
  created_by UUID,
  updated_by UUID,
  
  -- Search vector
  search_vector TSVECTOR
);

-- Indexes for companies
CREATE INDEX idx_companies_org ON companies(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_name ON companies(company_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_type ON companies(company_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_search ON companies USING GIN (search_vector);

-- =============================================
-- TABLE: contacts
-- =============================================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Personal information
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  other_names VARCHAR(100),
  title VARCHAR(20), -- Mr, Mrs, Dr, etc.
  date_of_birth DATE,
  gender VARCHAR(20),
  marital_status VARCHAR(50),
  nationality VARCHAR(100) DEFAULT 'Ghanaian',
  languages language_enum[] DEFAULT ARRAY['english']::language_enum[],
  
  -- Contact details
  primary_phone VARCHAR(20) NOT NULL,
  alternate_phone VARCHAR(20),
  whatsapp_number VARCHAR(20),
  email VARCHAR(255),
  alternate_email VARCHAR(255),
  preferred_contact_method contact_method_enum DEFAULT 'phone',
  best_call_time TIME,
  
  -- Location
  current_address JSONB,
  permanent_address JSONB,
  country_of_residence VARCHAR(100) DEFAULT 'Ghana',
  region VARCHAR(100),
  city VARCHAR(100),
  digital_address VARCHAR(50), -- Ghana Post GPS
  
  -- Professional information
  occupation VARCHAR(200),
  employer VARCHAR(200),
  industry VARCHAR(100),
  work_address JSONB,
  monthly_income_range income_range_enum,
  employment_status employment_status_enum,
  
  -- CRM classification
  contact_type contact_type_enum NOT NULL DEFAULT 'first_time_buyer',
  lead_source lead_source_enum,
  lead_status lead_status_enum DEFAULT 'new',
  customer_segment VARCHAR(50),
  company_id UUID, -- Optional link to companies table
  
  -- Scoring and qualification
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  qualification_level qualification_enum DEFAULT 'unqualified',
  conversion_probability DECIMAL(5,2) CHECK (conversion_probability >= 0 AND conversion_probability <= 100),
  
  -- Property interests
  property_interests JSONB,
  budget_min DECIMAL(15,2),
  budget_max DECIMAL(15,2),
  preferred_locations TEXT[],
  preferred_property_types TEXT[],
  
  -- Communication preferences
  preferred_language language_enum DEFAULT 'english',
  communication_frequency VARCHAR(20) DEFAULT 'normal',
  opt_in_email BOOLEAN DEFAULT true,
  opt_in_sms BOOLEAN DEFAULT true,
  opt_in_whatsapp BOOLEAN DEFAULT true,
  
  -- Relationship mapping
  referred_by UUID, -- References contacts(id)
  family_connections JSONB,
  
  -- Assignment
  assigned_to UUID, -- Agent/user ID
  assigned_team UUID,
  
  -- Metadata
  notes TEXT,
  tags TEXT[],
  custom_fields JSONB,
  last_contact_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete
  created_by UUID,
  updated_by UUID,
  
  -- Search vector
  search_vector TSVECTOR,
  
  -- Constraints
  CONSTRAINT fk_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_referred_by FOREIGN KEY (referred_by) REFERENCES contacts(id) ON DELETE SET NULL
);

-- Indexes for contacts
CREATE INDEX idx_contacts_org ON contacts(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_name ON contacts(last_name, first_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_phone ON contacts(primary_phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_email ON contacts(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_assigned ON contacts(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_type ON contacts(contact_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_status ON contacts(lead_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_score ON contacts(lead_score) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_search ON contacts USING GIN (search_vector);

-- Trigger to update search_vector for contacts
CREATE OR REPLACE FUNCTION contacts_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.first_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.last_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.other_names, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.occupation, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_search_vector_update
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_search_vector_trigger();

-- =============================================
-- TABLE: deal_pipelines
-- =============================================
CREATE TABLE deal_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Pipeline details
  pipeline_name VARCHAR(255) NOT NULL,
  pipeline_type deal_type_enum NOT NULL,
  description TEXT,
  color VARCHAR(7), -- Hex color
  
  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  created_by UUID,
  
  -- Constraints
  CONSTRAINT unique_org_pipeline_name UNIQUE (organization_id, pipeline_name, deleted_at)
);

-- Indexes for deal_pipelines
CREATE INDEX idx_pipelines_org ON deal_pipelines(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pipelines_type ON deal_pipelines(pipeline_type) WHERE deleted_at IS NULL;

-- =============================================
-- TABLE: deal_stages
-- =============================================
CREATE TABLE deal_stages (
  id UUID PRIMARY  KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL,
  
  -- Stage details
  stage_name VARCHAR(100) NOT NULL,
  stage_order INTEGER NOT NULL,
  stage_color VARCHAR(7), -- Hex color
  description TEXT,
  
  -- Requirements and rules
  requirements JSONB, -- Array of requirements
  allowed_next_stages UUID[], -- Array of stage IDs
  auto_transition_rules JSONB,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT fk_pipeline FOREIGN KEY (pipeline_id) REFERENCES deal_pipelines(id) ON DELETE CASCADE,
  CONSTRAINT unique_pipeline_stage_order UNIQUE (pipeline_id, stage_order),
  CONSTRAINT unique_pipeline_stage_name UNIQUE (pipeline_id, stage_name)
);

-- Indexes for deal_stages
CREATE INDEX idx_stages_pipeline ON deal_stages(pipeline_id);
CREATE INDEX idx_stages_order ON deal_stages(pipeline_id, stage_order);

-- =============================================
-- TABLE: deals
-- =============================================
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Deal identification
  deal_number VARCHAR(50) UNIQUE NOT NULL, -- Auto-generated: DEAL-2024-001
  title VARCHAR(500) NOT NULL,
  description TEXT,
  
  -- Relationships
  primary_contact_id UUID NOT NULL,
  secondary_contacts UUID[], -- Array of contact IDs
  property_ids UUID[], -- Array of property IDs (can be multiple properties)
  company_id UUID,
  
  -- Assignment
  assigned_agent UUID NOT NULL, -- Primary agent
  assigned_team UUID,
  deal_owners UUID[], -- Additional owners/collaborators
  
  -- Classification
  deal_type deal_type_enum NOT NULL,
  pipeline_id UUID NOT NULL,
  stage_id UUID NOT NULL,
  deal_status deal_status_enum DEFAULT 'active',
  
  -- Financial information
  deal_value DECIMAL(15,2),
  currency VARCHAR(3) DEFAULT 'GHS',
  commission_amount DECIMAL(12,2),
  commission_percentage DECIMAL(5,2),
  estimated_close_date DATE,
  actual_close_date DATE,
  
  -- Probability and forecasting
  close_probability INTEGER DEFAULT 50 CHECK (close_probability >= 0 AND close_probability <= 100),
  weighted_value DECIMAL(15,2), -- Calculated: deal_value * (close_probability / 100)
  
  -- Attribution and source
  lead_source lead_source_enum,
  campaign_source VARCHAR(100),
  utm_data JSONB,
  
  -- Timeline tracking
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete
  stage_changed_at TIMESTAMP DEFAULT NOW(),
  first_contact_at TIMESTAMP,
  last_activity_at TIMESTAMP,
  
  -- Performance metrics (auto-calculated)
  days_in_pipeline INTEGER DEFAULT 0,
  stage_duration INTEGER DEFAULT 0,
  total_activities INTEGER DEFAULT 0,
  
  -- Additional data
  tags TEXT[],
  custom_fields JSONB,
  notes TEXT,
  
  -- Audit
  created_by UUID,
  updated_by UUID,
  
  -- Constraints
  CONSTRAINT fk_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_primary_contact FOREIGN KEY (primary_contact_id) REFERENCES contacts(id),
  CONSTRAINT fk_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_pipeline FOREIGN KEY (pipeline_id) REFERENCES deal_pipelines(id),
  CONSTRAINT fk_stage FOREIGN KEY (stage_id) REFERENCES deal_stages(id),
  CONSTRAINT valid_deal_value CHECK (deal_value >= 0 OR deal_value IS NULL),
  CONSTRAINT valid_commission_percentage CHECK (commission_percentage >= 0 AND commission_percentage <= 100 OR commission_percentage IS NULL)
);

-- Indexes for deals
CREATE INDEX idx_deals_org ON deals(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_number ON deals(deal_number);
CREATE INDEX idx_deals_contact ON deals(primary_contact_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_company ON deals(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_agent ON deals(assigned_agent) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_pipeline ON deals(pipeline_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_stage ON deals(stage_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_status ON deals(deal_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_type ON deals(deal_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_close_date ON deals(estimated_close_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_property_ids ON deals USING GIN (property_ids);

-- Trigger to auto-generate deal_number
CREATE OR REPLACE FUNCTION generate_deal_number() RETURNS trigger AS $$
DECLARE
  year_part VARCHAR(4);
  sequence_num INTEGER;
  new_number VARCHAR(50);
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  -- Get next sequence number for this year
  SELECT COALESCE(MAX(CAST(SUBSTRING(deal_number FROM 'DEAL-' || year_part || '-(.*)') AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM deals
  WHERE deal_number LIKE 'DEAL-' || year_part || '-%';
  
  -- Generate new deal number
  new_number := 'DEAL-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');
  
  NEW.deal_number := new_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deals_generate_number
  BEFORE INSERT ON deals
  FOR EACH ROW
  WHEN (NEW.deal_number IS NULL)
  EXECUTE FUNCTION generate_deal_number();

-- Trigger to update weighted_value
CREATE OR REPLACE FUNCTION update_deal_weighted_value() RETURNS trigger AS $$
BEGIN
  IF NEW.deal_value IS NOT NULL AND NEW.close_probability IS NOT NULL THEN
    NEW.weighted_value := NEW.deal_value * (NEW.close_probability / 100.0);
  ELSE
    NEW.weighted_value := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deals_update_weighted_value
  BEFORE INSERT OR UPDATE OF deal_value, close_probability ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_deal_weighted_value();

-- =============================================
-- TABLE: deal_activities (IMMUTABLE)
-- =============================================
CREATE TABLE deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  contact_id UUID,
  user_id UUID NOT NULL, -- Who performed the activity
  
  -- Activity details
  activity_type activity_type_enum NOT NULL,
  subject VARCHAR(500),
  description TEXT,
  outcome activity_outcome_enum,
  
  -- State change tracking
  old_value JSONB,
  new_value JSONB,
  
  -- Timing
  activity_date TIMESTAMP DEFAULT NOW(),
  duration_minutes INTEGER,
  
  -- Follow-up
  next_action VARCHAR(500),
  next_action_date DATE,
  next_action_assigned_to UUID,
  
  -- Documentation
  documents JSONB, -- Array of document metadata {id, name, url}
  attachments TEXT[], -- Array of file URLs
  notes TEXT,
  
  -- Metadata (IMMUTABLE - no updated_at, no deleted_at)
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT fk_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
  CONSTRAINT fk_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

-- Indexes for deal_activities
CREATE INDEX idx_activities_deal ON deal_activities(deal_id);
CREATE INDEX idx_activities_user ON deal_activities(user_id);
CREATE INDEX idx_activities_date ON deal_activities(activity_date DESC);
CREATE INDEX idx_activities_type ON deal_activities(activity_type);
CREATE INDEX idx_activities_next_action ON deal_activities(next_action_date) WHERE next_action_date IS NOT NULL;

-- Trigger to update deal's last_activity_at and total_activities
CREATE OR REPLACE FUNCTION update_deal_activity_metrics() RETURNS trigger AS $$
BEGIN
  UPDATE deals
  SET 
    last_activity_at = NOW(),
    total_activities = total_activities + 1,
    updated_at = NOW()
  WHERE id = NEW.deal_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activities_update_deal_metrics
  AFTER INSERT ON deal_activities
  FOR EACH ROW
  EXECUTE FUNCTION update_deal_activity_metrics();

-- =============================================
-- TABLE: tasks
-- =============================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Task details
  title VARCHAR(500) NOT NULL,
  description TEXT,
  task_type VARCHAR(50), -- follow_up, document_request, viewing, call, etc.
  priority task_priority_enum DEFAULT 'medium',
  
  -- Relationships (polymorphic)
  deal_id UUID,
  contact_id UUID,
  property_id UUID,
  
  -- Assignment
  assigned_to UUID NOT NULL,
  assigned_by UUID,
  assigned_team UUID,
  
  -- Status
  task_status task_status_enum DEFAULT 'pending',
  
  -- Timing
  due_date TIMESTAMP,
  start_date TIMESTAMP,
  completed_at TIMESTAMP,
  reminder_date TIMESTAMP,
  
  -- Recurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern JSONB, -- {frequency: 'daily/weekly/monthly', interval: 1, end_date: ...}
  parent_task_id UUID, -- For recurring tasks
  
  -- Metadata
  tags TEXT[],
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete
  created_by UUID,
  
  -- Constraints
  CONSTRAINT fk_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
  CONSTRAINT fk_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_task FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Indexes for tasks
CREATE INDEX idx_tasks_org ON tasks(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_deal ON tasks(deal_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_contact ON tasks(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_due ON tasks(due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_status ON tasks(task_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_priority ON tasks(priority) WHERE deleted_at IS NULL;

-- Trigger to mark overdue tasks
CREATE OR REPLACE FUNCTION mark_overdue_tasks() RETURNS trigger AS $$
BEGIN
  IF NEW.task_status IN ('pending', 'in_progress') AND NEW.due_date < NOW() THEN
    NEW.task_status := 'overdue';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_mark_overdue
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION mark_overdue_tasks();

-- =============================================
-- TABLE: notes
-- =============================================
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Content
  content TEXT NOT NULL,
  
  -- Relationships (polymorphic)
  entity_type VARCHAR(50) NOT NULL, -- 'deal', 'contact', 'property', 'task', 'company'
  entity_id UUID NOT NULL,
  
  -- Visibility
  is_private BOOLEAN DEFAULT false,
  is_pinned BOOLEAN DEFAULT false,
  
  -- Mentions
  mentions UUID[], -- Array of user IDs mentioned in note
  
  -- Metadata
  tags TEXT[],
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete
  created_by UUID NOT NULL,
  updated_by UUID,
  
  -- Search vector
  search_vector TSVECTOR
);

-- Indexes for notes
CREATE INDEX idx_notes_org ON notes(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_entity ON notes(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_created_by ON notes(created_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_search ON notes USING GIN (search_vector);

-- Trigger to update search_vector for notes
CREATE OR REPLACE FUNCTION notes_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_search_vector_update
  BEFORE INSERT OR UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION notes_search_vector_trigger();

-- =============================================
-- TABLE: documents
-- =============================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Document information
  document_name VARCHAR(255) NOT NULL,
  document_type document_type_enum,
  file_url VARCHAR(500) NOT NULL, -- MinIO URL
  file_size BIGINT,
  mime_type VARCHAR(100),
  checksum VARCHAR(64), -- SHA-256 hash
  
  -- Relationships (polymorphic)
  entity_type VARCHAR(50), -- 'deal', 'contact', 'property', 'company'
  entity_id UUID,
  
  -- Versioning
  version INTEGER DEFAULT 1,
  parent_document_id UUID, -- Link to previous version
  is_latest_version BOOLEAN DEFAULT true,
  
  -- E-Sign integration
  signature_envelope_id UUID,
  is_signed BOOLEAN DEFAULT false,
  signed_at TIMESTAMP,
  signed_by JSONB, -- Array of {user_id, signed_at, ip_address}
  
  -- Metadata
  description TEXT,
  tags TEXT[],
  folder VARCHAR(255),
  
  -- Access control
  is_public BOOLEAN DEFAULT false,
  allowed_users UUID[], -- Array of user IDs with access
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete
  created_by UUID,
  updated_by UUID,
  
  -- Constraints
  CONSTRAINT fk_parent_document FOREIGN KEY (parent_document_id) REFERENCES documents(id) ON DELETE SET NULL
);

-- Indexes for documents
CREATE INDEX idx_documents_org ON documents(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_type ON documents(document_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_signature ON documents(signature_envelope_id) WHERE signature_envelope_id IS NOT NULL;
CREATE INDEX idx_documents_created_by ON documents(created_by) WHERE deleted_at IS NULL;

-- =============================================
-- TABLE: signature_envelopes
-- =============================================
CREATE TABLE signature_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  deal_id UUID,
  document_id UUID NOT NULL,
  
  -- E-sign tracking
  esign_envelope_id UUID, -- From shared e-sign service
  status signature_status_enum DEFAULT 'pending',
  
  -- Signers
  signers JSONB NOT NULL, -- Array of {contact_id, email, name, status, signed_at, ip_address}
  signing_order INTEGER DEFAULT 1, -- Sequential signing
  
  -- Tracking
  sent_at TIMESTAMP,
  viewed_at TIMESTAMP,
  completed_at TIMESTAMP,
  expires_at TIMESTAMP,
  
  -- Metadata
  subject VARCHAR(255),
  message TEXT,
  reminder_settings JSONB,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,
  
  -- Constraints
  CONSTRAINT fk_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL,
  CONSTRAINT fk_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Indexes for signature_envelopes
CREATE INDEX idx_envelopes_org ON signature_envelopes(organization_id);
CREATE INDEX idx_envelopes_deal ON signature_envelopes(deal_id);
CREATE INDEX idx_envelopes_document ON signature_envelopes(document_id);
CREATE INDEX idx_envelopes_status ON signature_envelopes(status);
CREATE INDEX idx_envelopes_esign ON signature_envelopes(esign_envelope_id) WHERE esign_envelope_id IS NOT NULL;

-- =============================================
-- SYSTEM FUNCTIONS
-- =============================================

-- Function update_updated_at_column() already exists from earlier migrations
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- Apply update trigger to relevant tables
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deal_pipelines_updated_at BEFORE UPDATE ON deal_pipelines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deal_stages_updated_at BEFORE UPDATE ON deal_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signature_envelopes_updated_at BEFORE UPDATE ON signature_envelopes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE companies IS 'Companies and corporate entities in the CRM system';
COMMENT ON TABLE contacts IS 'Individual contacts, leads, and customers in the CRM system';
COMMENT ON TABLE deal_pipelines IS 'Configurable sales pipelines per organization';
COMMENT ON TABLE deal_stages IS 'Stages within each pipeline with transition rules';
COMMENT ON TABLE deals IS 'Real estate deals and transactions';
COMMENT ON TABLE deal_activities IS 'Immutable activity log for deals (audit trail)';
COMMENT ON TABLE tasks IS 'Tasks and to-dos for deals, contacts, and properties';
COMMENT ON TABLE notes IS 'Notes attached to various entities (polymorphic)';
COMMENT ON TABLE documents IS 'Document storage and versioning with e-sign support';
COMMENT ON TABLE signature_envelopes IS 'E-signature workflow tracking';

COMMENT ON COLUMN deal_activities.created_at IS 'IMMUTABLE - Activities never update';
COMMENT ON COLUMN deals.weighted_value IS 'Auto-calculated: deal_value * (close_probability / 100)';
COMMENT ON COLUMN deals.deal_number IS 'Auto-generated: DEAL-YYYY-NNNN';
