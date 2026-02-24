-- Migration: 080_document_management.sql
-- Phase 3: Compliance & Document Management - Sprint 6
-- Project document management with version control

-- ============================================================================
-- DOCUMENT TYPES ENUM (Ghana-specific)
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    -- Land & Legal
    'land_title',
    'indenture',
    'consent_letter',
    'site_plan',
    'survey_report',
    'traditional_authority_letter',
    'stool_lands_consent',
    'lease_agreement',
    
    -- Permits & Approvals
    'development_permit',
    'building_permit',
    'epa_permit',
    'fire_certificate',
    'occupancy_certificate',
    'commencement_permit',
    
    -- Design & Drawings
    'architectural_drawing',
    'structural_drawing',
    'mep_drawing',
    'landscape_drawing',
    'as_built_drawing',
    'shop_drawing',
    'detail_drawing',
    
    -- Contracts & Agreements
    'main_contract',
    'subcontract',
    'consultant_agreement',
    'vendor_agreement',
    'variation_order',
    'completion_certificate',
    
    -- Financial
    'budget_document',
    'invoice',
    'receipt',
    'payment_certificate',
    'bank_guarantee',
    'insurance_certificate',
    'valuation_report',
    
    -- Site Reports
    'daily_log',
    'weekly_report',
    'monthly_report',
    'progress_report',
    'inspection_report',
    'test_report',
    'quality_report',
    
    -- Marketing
    'brochure',
    'floor_plan',
    'render',
    'photography',
    'video',
    'sales_material',
    
    -- Handover
    'snag_list',
    'warranty_document',
    'operation_manual',
    'maintenance_schedule',
    'key_register',
    'handover_certificate',
    
    -- Other
    'correspondence',
    'meeting_minutes',
    'specification',
    'schedule',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE access_level AS ENUM (
    'public',      -- Anyone can view
    'team',        -- Organization team members
    'restricted',  -- Specific users only
    'confidential' -- Admins only
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PROJECT FOLDERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  parent_id UUID REFERENCES project_folders(id) ON DELETE CASCADE,
  
  name VARCHAR(200) NOT NULL,
  description TEXT,
  folder_type VARCHAR(100), -- 'land_legal', 'permits', 'drawings', etc.
  icon VARCHAR(50), -- Optional icon name
  color VARCHAR(20), -- Optional color for UI
  
  -- Ordering
  sort_order INTEGER DEFAULT 0,
  
  -- Settings
  is_system BOOLEAN DEFAULT false, -- System-created folders can't be deleted
  auto_categorize BOOLEAN DEFAULT true, -- Auto-assign documents by type
  
  -- Audit
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PROJECT DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES project_folders(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL,
  
  -- File info
  name VARCHAR(500) NOT NULL,
  original_filename VARCHAR(500),
  description TEXT,
  document_type VARCHAR(100),
  
  -- Storage
  file_url TEXT NOT NULL,
  file_key VARCHAR(500), -- S3/MinIO key
  thumbnail_url TEXT,
  file_size INTEGER, -- bytes
  mime_type VARCHAR(100),
  
  -- Version control
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  previous_version_id UUID REFERENCES project_documents(id),
  version_notes TEXT,
  
  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Format: { "pages": 10, "dimensions": "A3", "author": "...", "created_date": "..." }
  
  -- Expiration (for permits, certificates, etc.)
  expiration_date DATE,
  expiration_reminder_days INTEGER DEFAULT 30,
  
  -- Access control
  access_level VARCHAR(50) DEFAULT 'team',
  shared_with UUID[], -- User IDs for restricted access
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'archived', 'deleted'
  
  -- Related entities
  related_permit_id UUID REFERENCES project_permits(id) ON DELETE SET NULL,
  related_phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  related_milestone_id UUID,
  
  -- Audit
  uploaded_by UUID,
  last_accessed_at TIMESTAMP,
  last_accessed_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- ============================================================================
-- DOCUMENT VERSIONS TABLE (for full version history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  
  version INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_key VARCHAR(500),
  file_size INTEGER,
  
  -- Changes
  change_summary TEXT,
  changed_by UUID,
  
  -- Metadata snapshot
  metadata_snapshot JSONB,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- DOCUMENT TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID, -- NULL = system template
  
  name VARCHAR(200) NOT NULL,
  description TEXT,
  template_type VARCHAR(100) NOT NULL, -- 'site_log', 'inspection_report', 'progress_report', etc.
  category VARCHAR(100), -- 'site_reports', 'contracts', 'marketing', etc.
  
  -- Template content
  template_url TEXT, -- URL to template file (docx, xlsx, etc.)
  template_content TEXT, -- For simple text templates
  format VARCHAR(20), -- 'docx', 'xlsx', 'pdf', 'html'
  
  -- Variables for template
  variables JSONB DEFAULT '[]'::jsonb,
  -- Format: [{ "name": "project_name", "type": "text", "required": true }, ...]
  
  -- Preview
  preview_url TEXT,
  thumbnail_url TEXT,
  
  -- Ghana-specific
  is_ghana_specific BOOLEAN DEFAULT false,
  applicable_regions TEXT[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- DOCUMENT SHARES TABLE (for sharing with external users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  
  -- Share link
  share_token VARCHAR(100) UNIQUE NOT NULL,
  share_url TEXT,
  
  -- Access control
  expires_at TIMESTAMP,
  password_hash VARCHAR(255), -- Optional password protection
  max_downloads INTEGER,
  download_count INTEGER DEFAULT 0,
  
  -- Recipient (optional)
  recipient_email VARCHAR(255),
  recipient_name VARCHAR(200),
  
  -- Permissions
  can_download BOOLEAN DEFAULT true,
  can_view_only BOOLEAN DEFAULT false,
  
  -- Tracking
  last_accessed_at TIMESTAMP,
  access_log JSONB DEFAULT '[]'::jsonb,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_folders_project ON project_folders(project_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON project_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_type ON project_folders(folder_type);

CREATE INDEX IF NOT EXISTS idx_documents_project ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON project_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON project_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_org ON project_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_expiration ON project_documents(expiration_date) 
  WHERE expiration_date IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_current ON project_documents(project_id, is_current) 
  WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_documents_tags ON project_documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_documents_search ON project_documents USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

CREATE INDEX IF NOT EXISTS idx_doc_versions_document ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_templates_type ON document_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_doc_shares_token ON document_shares(share_token);

-- ============================================================================
-- DEFAULT FOLDER STRUCTURE FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION create_default_project_folders(
  p_project_id UUID,
  p_organization_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_folder_id UUID;
  v_subfolder_id UUID;
BEGIN
  -- 01. Land & Legal
  INSERT INTO project_folders (project_id, organization_id, name, folder_type, sort_order, is_system, created_by)
  VALUES (p_project_id, p_organization_id, '01. Land & Legal', 'land_legal', 1, true, p_created_by)
  RETURNING id INTO v_folder_id;
  
  -- 02. Permits & Approvals
  INSERT INTO project_folders (project_id, organization_id, name, folder_type, sort_order, is_system, created_by)
  VALUES (p_project_id, p_organization_id, '02. Permits & Approvals', 'permits', 2, true, p_created_by);
  
  -- 03. Design Drawings
  INSERT INTO project_folders (project_id, organization_id, name, folder_type, sort_order, is_system, created_by)
  VALUES (p_project_id, p_organization_id, '03. Design Drawings', 'drawings', 3, true, p_created_by)
  RETURNING id INTO v_folder_id;
  
  -- Subfolders for drawings
  INSERT INTO project_folders (project_id, organization_id, parent_id, name, folder_type, sort_order, is_system, created_by)
  VALUES 
    (p_project_id, p_organization_id, v_folder_id, 'Architectural', 'architectural', 1, true, p_created_by),
    (p_project_id, p_organization_id, v_folder_id, 'Structural', 'structural', 2, true, p_created_by),
    (p_project_id, p_organization_id, v_folder_id, 'MEP', 'mep', 3, true, p_created_by),
    (p_project_id, p_organization_id, v_folder_id, 'As-Built', 'as_built', 4, true, p_created_by);
  
  -- 04. Contracts
  INSERT INTO project_folders (project_id, organization_id, name, folder_type, sort_order, is_system, created_by)
  VALUES (p_project_id, p_organization_id, '04. Contracts', 'contracts', 4, true, p_created_by);
  
  -- 05. Financial
  INSERT INTO project_folders (project_id, organization_id, name, folder_type, sort_order, is_system, created_by)
  VALUES (p_project_id, p_organization_id, '05. Financial', 'financial', 5, true, p_created_by)
  RETURNING id INTO v_folder_id;
  
  -- Subfolders for financial
  INSERT INTO project_folders (project_id, organization_id, parent_id, name, folder_type, sort_order, is_system, created_by)
  VALUES 
    (p_project_id, p_organization_id, v_folder_id, 'Budget', 'budget', 1, true, p_created_by),
    (p_project_id, p_organization_id, v_folder_id, 'Invoices', 'invoices', 2, true, p_created_by),
    (p_project_id, p_organization_id, v_folder_id, 'Receipts', 'receipts', 3, true, p_created_by);
  
  -- 06. Site Reports
  INSERT INTO project_folders (project_id, organization_id, name, folder_type, sort_order, is_system, created_by)
  VALUES (p_project_id, p_organization_id, '06. Site Reports', 'site_reports', 6, true, p_created_by);
  
  -- 07. Marketing
  INSERT INTO project_folders (project_id, organization_id, name, folder_type, sort_order, is_system, created_by)
  VALUES (p_project_id, p_organization_id, '07. Marketing', 'marketing', 7, true, p_created_by);
  
  -- 08. Handover
  INSERT INTO project_folders (project_id, organization_id, name, folder_type, sort_order, is_system, created_by)
  VALUES (p_project_id, p_organization_id, '08. Handover', 'handover', 8, true, p_created_by);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DOCUMENT TEMPLATES
-- ============================================================================
INSERT INTO document_templates (name, description, template_type, category, format, is_ghana_specific, is_system, variables)
VALUES
  (
    'Daily Site Log',
    'Standard daily site log for recording work progress, weather, and attendance',
    'daily_log',
    'site_reports',
    'docx',
    true,
    true,
    '[
      {"name": "project_name", "type": "text", "required": true},
      {"name": "date", "type": "date", "required": true},
      {"name": "weather", "type": "select", "options": ["Sunny", "Cloudy", "Rainy", "Harmattan"]},
      {"name": "workers_present", "type": "number"},
      {"name": "activities", "type": "textarea"},
      {"name": "materials_received", "type": "textarea"},
      {"name": "issues", "type": "textarea"},
      {"name": "supervisor_name", "type": "text"}
    ]'::jsonb
  ),
  (
    'Weekly Progress Report',
    'Weekly summary of construction progress with photos and metrics',
    'weekly_report',
    'site_reports',
    'docx',
    true,
    true,
    '[
      {"name": "project_name", "type": "text", "required": true},
      {"name": "week_number", "type": "number", "required": true},
      {"name": "start_date", "type": "date", "required": true},
      {"name": "end_date", "type": "date", "required": true},
      {"name": "overall_progress", "type": "number"},
      {"name": "milestones_achieved", "type": "textarea"},
      {"name": "next_week_plan", "type": "textarea"},
      {"name": "issues_risks", "type": "textarea"}
    ]'::jsonb
  ),
  (
    'Inspection Report',
    'Site inspection report template for regulatory or internal inspections',
    'inspection_report',
    'site_reports',
    'docx',
    true,
    true,
    '[
      {"name": "project_name", "type": "text", "required": true},
      {"name": "inspection_date", "type": "date", "required": true},
      {"name": "inspector_name", "type": "text", "required": true},
      {"name": "inspection_type", "type": "select", "options": ["Structural", "Electrical", "Plumbing", "Fire Safety", "General"]},
      {"name": "findings", "type": "textarea"},
      {"name": "deficiencies", "type": "textarea"},
      {"name": "recommendations", "type": "textarea"},
      {"name": "pass_fail", "type": "select", "options": ["Pass", "Fail", "Conditional Pass"]}
    ]'::jsonb
  ),
  (
    'Meeting Minutes',
    'Standard format for project meeting minutes',
    'meeting_minutes',
    'correspondence',
    'docx',
    false,
    true,
    '[
      {"name": "project_name", "type": "text", "required": true},
      {"name": "meeting_date", "type": "date", "required": true},
      {"name": "meeting_type", "type": "select", "options": ["Site Meeting", "Design Review", "Progress Review", "Stakeholder Meeting"]},
      {"name": "attendees", "type": "textarea"},
      {"name": "agenda", "type": "textarea"},
      {"name": "discussion_points", "type": "textarea"},
      {"name": "action_items", "type": "textarea"},
      {"name": "next_meeting_date", "type": "date"}
    ]'::jsonb
  ),
  (
    'Snag List',
    'Defects and snag list for project handover',
    'snag_list',
    'handover',
    'xlsx',
    false,
    true,
    '[
      {"name": "project_name", "type": "text", "required": true},
      {"name": "unit_number", "type": "text"},
      {"name": "inspection_date", "type": "date", "required": true},
      {"name": "inspector_name", "type": "text"}
    ]'::jsonb
  ),
  (
    'EPA Application Form',
    'Environmental Protection Agency permit application template',
    'permit_application',
    'permits',
    'docx',
    true,
    true,
    '[
      {"name": "project_name", "type": "text", "required": true},
      {"name": "project_location", "type": "text", "required": true},
      {"name": "project_type", "type": "text", "required": true},
      {"name": "total_area_sqm", "type": "number"},
      {"name": "estimated_cost", "type": "number"},
      {"name": "applicant_name", "type": "text", "required": true},
      {"name": "applicant_contact", "type": "text", "required": true}
    ]'::jsonb
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- TRIGGER: Create default folders on project creation
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_create_project_folders()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_default_project_folders(NEW.id, NEW.organization_id, NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'create_project_folders_trigger'
  ) THEN
    CREATE TRIGGER create_project_folders_trigger
      AFTER INSERT ON development_projects
      FOR EACH ROW EXECUTE FUNCTION trigger_create_project_folders();
  END IF;
END $$;

-- ============================================================================
-- TRIGGER: Update document timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_document_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_updated_at ON project_documents;
CREATE TRIGGER document_updated_at
  BEFORE UPDATE ON project_documents
  FOR EACH ROW EXECUTE FUNCTION update_document_timestamp();
