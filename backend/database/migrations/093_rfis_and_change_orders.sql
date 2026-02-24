-- Migration: 093_rfis_and_change_orders.sql
-- Phase 3A Week 1: RFI Management and Change Orders
-- Enterprise-grade implementation for construction project management

-- =====================================================
-- RFI (Request for Information) Management
-- =====================================================

-- RFI Status Enum
CREATE TYPE rfi_status AS ENUM (
  'draft',
  'open',
  'pending_response',
  'answered',
  'closed',
  'void'
);

-- RFI Priority Enum
CREATE TYPE rfi_priority AS ENUM (
  'low',
  'normal',
  'high',
  'critical'
);

-- RFI Category (Ghana construction context)
CREATE TYPE rfi_category AS ENUM (
  'design_clarification',
  'specification_query',
  'drawing_discrepancy',
  'site_condition',
  'material_substitution',
  'regulatory_compliance',
  'contractor_coordination',
  'schedule_impact',
  'cost_inquiry',
  'safety_concern',
  'other'
);

-- Main RFI Table
CREATE TABLE rfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  
  -- Identification
  rfi_number VARCHAR(50) NOT NULL,
  revision_number INTEGER DEFAULT 1,
  
  -- Content
  subject VARCHAR(500) NOT NULL,
  question TEXT NOT NULL,
  category rfi_category NOT NULL DEFAULT 'design_clarification',
  
  -- Response
  response TEXT,
  response_attachments JSONB DEFAULT '[]',
  
  -- Status & Priority
  status rfi_status NOT NULL DEFAULT 'draft',
  priority rfi_priority NOT NULL DEFAULT 'normal',
  
  -- Dates
  due_date DATE,
  responded_at TIMESTAMP,
  closed_at TIMESTAMP,
  
  -- Assignment
  submitted_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  answered_by UUID REFERENCES users(id),
  
  -- References
  phase_id UUID REFERENCES project_phases(id),
  drawing_references JSONB DEFAULT '[]',  -- [{number: "A-101", title: "Floor Plan", sheet: "1"}]
  spec_references JSONB DEFAULT '[]',     -- [{section: "03300", title: "Cast-in-Place Concrete"}]
  location_reference VARCHAR(500),        -- "Block A, Level 2, Column Grid B-4"
  
  -- Impact Assessment
  cost_impact NUMERIC(15,2),
  cost_impact_currency VARCHAR(3) DEFAULT 'GHS',
  schedule_impact_days INTEGER,
  
  -- Attachments
  attachments JSONB DEFAULT '[]',  -- [{id, filename, url, type, size, uploaded_at}]
  
  -- Related Items
  related_rfis UUID[] DEFAULT '{}',
  
  -- Audit Trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  
  -- Constraints
  UNIQUE(organization_id, project_id, rfi_number, revision_number)
);

-- RFI History/Audit Log
CREATE TABLE rfi_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfi_id UUID NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
  
  action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'status_change', 'assigned', 'responded', 'closed'
  previous_status rfi_status,
  new_status rfi_status,
  
  field_changes JSONB,  -- {field: {old: value, new: value}}
  comment TEXT,
  
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RFI Comments/Discussion Thread
CREATE TABLE rfi_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfi_id UUID NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
  
  comment TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  
  is_internal BOOLEAN DEFAULT false,  -- Internal notes vs. official response
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RFI Watchers (notifications)
CREATE TABLE rfi_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfi_id UUID NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  notify_on_response BOOLEAN DEFAULT true,
  notify_on_comment BOOLEAN DEFAULT true,
  notify_on_status_change BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(rfi_id, user_id)
);

-- =====================================================
-- Change Order Management
-- =====================================================

-- Change Order Status Enum
CREATE TYPE change_order_status AS ENUM (
  'draft',
  'pending_review',
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'void'
);

-- Change Order Reason Enum
CREATE TYPE change_order_reason AS ENUM (
  'owner_request',
  'design_error',
  'design_change',
  'unforeseen_condition',
  'regulatory_requirement',
  'value_engineering',
  'scope_addition',
  'scope_reduction',
  'material_substitution',
  'contractor_request',
  'force_majeure',
  'other'
);

-- Change Order Type
CREATE TYPE change_order_type AS ENUM (
  'additive',      -- Adds cost/scope
  'deductive',     -- Reduces cost/scope
  'no_cost',       -- Scope change with no cost impact
  'time_extension' -- Schedule impact only
);

-- Main Change Order Table
CREATE TABLE change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  
  -- Identification
  co_number VARCHAR(50) NOT NULL,
  revision_number INTEGER DEFAULT 1,
  
  -- Content
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  justification TEXT,
  
  -- Classification
  type change_order_type NOT NULL DEFAULT 'additive',
  reason change_order_reason NOT NULL DEFAULT 'owner_request',
  
  -- Status
  status change_order_status NOT NULL DEFAULT 'draft',
  
  -- Financial Impact
  original_contract_amount NUMERIC(15,2),
  previous_changes_amount NUMERIC(15,2) DEFAULT 0,
  this_change_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  new_contract_amount NUMERIC(15,2),
  currency VARCHAR(3) DEFAULT 'GHS',
  
  -- Schedule Impact
  original_completion_date DATE,
  previous_extensions_days INTEGER DEFAULT 0,
  this_extension_days INTEGER DEFAULT 0,
  new_completion_date DATE,
  
  -- Dates
  submitted_at TIMESTAMP,
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  executed_at TIMESTAMP,
  
  -- Assignment & Approval
  submitted_by UUID REFERENCES users(id),
  contractor_id UUID REFERENCES contractors(id),
  
  -- Approval Chain (JSONB for flexibility)
  approval_chain JSONB DEFAULT '[]', -- [{approver_id, role, status, date, comments}]
  current_approver_id UUID REFERENCES users(id),
  
  -- References
  phase_id UUID REFERENCES project_phases(id),
  related_rfis UUID[] DEFAULT '{}',
  related_cos UUID[] DEFAULT '{}',
  
  -- Attachments
  attachments JSONB DEFAULT '[]',
  
  -- Audit Trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  
  -- Constraints
  UNIQUE(organization_id, project_id, co_number, revision_number)
);

-- Change Order Line Items
CREATE TABLE change_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  
  -- Item Details
  item_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  
  -- Cost Breakdown
  quantity NUMERIC(12,4),
  unit VARCHAR(50),
  unit_cost NUMERIC(12,2),
  
  -- Labor
  labor_hours NUMERIC(10,2),
  labor_rate NUMERIC(10,2),
  labor_amount NUMERIC(12,2),
  
  -- Materials
  material_amount NUMERIC(12,2),
  
  -- Equipment
  equipment_amount NUMERIC(12,2),
  
  -- Subcontractor
  subcontractor_amount NUMERIC(12,2),
  
  -- Other Costs
  other_amount NUMERIC(12,2),
  other_description TEXT,
  
  -- Totals
  subtotal NUMERIC(12,2) NOT NULL,
  markup_percentage NUMERIC(5,2) DEFAULT 0,
  markup_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  
  -- Category Reference
  cost_code_id UUID,  -- Reference to project cost codes
  
  -- Ordering
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Change Order History
CREATE TABLE change_order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  
  action VARCHAR(50) NOT NULL,
  previous_status change_order_status,
  new_status change_order_status,
  
  field_changes JSONB,
  comment TEXT,
  
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Change Order Signatures (for formal approval)
CREATE TABLE change_order_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  
  signer_id UUID REFERENCES users(id),
  signer_name VARCHAR(200) NOT NULL,
  signer_title VARCHAR(200),
  signer_company VARCHAR(200),
  
  signature_data TEXT,  -- Base64 signature image or reference
  signed_at TIMESTAMP WITH TIME ZONE,
  
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- RFI Indexes
CREATE INDEX idx_rfis_project ON rfis(project_id);
CREATE INDEX idx_rfis_org ON rfis(organization_id);
CREATE INDEX idx_rfis_status ON rfis(status);
CREATE INDEX idx_rfis_priority ON rfis(priority);
CREATE INDEX idx_rfis_assigned_to ON rfis(assigned_to);
CREATE INDEX idx_rfis_submitted_by ON rfis(submitted_by);
CREATE INDEX idx_rfis_due_date ON rfis(due_date);
CREATE INDEX idx_rfis_created_at ON rfis(created_at DESC);
CREATE INDEX idx_rfis_number ON rfis(project_id, rfi_number);

CREATE INDEX idx_rfi_history_rfi ON rfi_history(rfi_id);
CREATE INDEX idx_rfi_history_action ON rfi_history(action);
CREATE INDEX idx_rfi_comments_rfi ON rfi_comments(rfi_id);
CREATE INDEX idx_rfi_watchers_rfi ON rfi_watchers(rfi_id);
CREATE INDEX idx_rfi_watchers_user ON rfi_watchers(user_id);

-- Change Order Indexes
CREATE INDEX idx_change_orders_project ON change_orders(project_id);
CREATE INDEX idx_change_orders_org ON change_orders(organization_id);
CREATE INDEX idx_change_orders_status ON change_orders(status);
CREATE INDEX idx_change_orders_type ON change_orders(type);
CREATE INDEX idx_change_orders_contractor ON change_orders(contractor_id);
CREATE INDEX idx_change_orders_submitted_by ON change_orders(submitted_by);
CREATE INDEX idx_change_orders_current_approver ON change_orders(current_approver_id);
CREATE INDEX idx_change_orders_created_at ON change_orders(created_at DESC);
CREATE INDEX idx_change_orders_number ON change_orders(project_id, co_number);

CREATE INDEX idx_co_items_co ON change_order_items(change_order_id);
CREATE INDEX idx_co_history_co ON change_order_history(change_order_id);
CREATE INDEX idx_co_signatures_co ON change_order_signatures(change_order_id);

-- =====================================================
-- Triggers for Auto-Update
-- =====================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_rfi_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rfis_updated_at
  BEFORE UPDATE ON rfis
  FOR EACH ROW
  EXECUTE FUNCTION update_rfi_timestamp();

CREATE OR REPLACE FUNCTION update_change_order_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_change_orders_updated_at
  BEFORE UPDATE ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_change_order_timestamp();

-- Trigger to auto-generate RFI number
CREATE OR REPLACE FUNCTION generate_rfi_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  year_suffix VARCHAR(4);
BEGIN
  IF NEW.rfi_number IS NULL OR NEW.rfi_number = '' THEN
    year_suffix := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(
      CAST(SUBSTRING(rfi_number FROM 'RFI-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_num
    FROM rfis
    WHERE project_id = NEW.project_id
      AND rfi_number LIKE 'RFI-' || year_suffix || '-%';
    
    NEW.rfi_number := 'RFI-' || year_suffix || '-' || LPAD(next_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_rfi_number
  BEFORE INSERT ON rfis
  FOR EACH ROW
  EXECUTE FUNCTION generate_rfi_number();

-- Trigger to auto-generate CO number
CREATE OR REPLACE FUNCTION generate_co_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  year_suffix VARCHAR(4);
BEGIN
  IF NEW.co_number IS NULL OR NEW.co_number = '' THEN
    year_suffix := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(
      CAST(SUBSTRING(co_number FROM 'CO-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_num
    FROM change_orders
    WHERE project_id = NEW.project_id
      AND co_number LIKE 'CO-' || year_suffix || '-%';
    
    NEW.co_number := 'CO-' || year_suffix || '-' || LPAD(next_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_co_number
  BEFORE INSERT ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_co_number();

-- Trigger to calculate CO new amounts
CREATE OR REPLACE FUNCTION calculate_co_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate new contract amount
  NEW.new_contract_amount := COALESCE(NEW.original_contract_amount, 0) 
    + COALESCE(NEW.previous_changes_amount, 0) 
    + COALESCE(NEW.this_change_amount, 0);
  
  -- Calculate new completion date
  IF NEW.original_completion_date IS NOT NULL THEN
    NEW.new_completion_date := NEW.original_completion_date 
      + COALESCE(NEW.previous_extensions_days, 0) 
      + COALESCE(NEW.this_extension_days, 0);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_co_totals
  BEFORE INSERT OR UPDATE ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION calculate_co_totals();

-- =====================================================
-- Views for Reporting
-- =====================================================

-- RFI Summary View
CREATE OR REPLACE VIEW v_rfi_summary AS
SELECT 
  r.id,
  r.project_id,
  r.rfi_number,
  r.subject,
  r.category,
  r.status,
  r.priority,
  r.due_date,
  r.created_at,
  r.responded_at,
  r.closed_at,
  r.cost_impact,
  r.schedule_impact_days,
  p.project_name,
  p.project_number,
  submitter.full_name AS submitted_by_name,
  assignee.full_name AS assigned_to_name,
  responder.full_name AS answered_by_name,
  CASE 
    WHEN r.status = 'open' AND r.due_date < CURRENT_DATE THEN true
    ELSE false
  END AS is_overdue,
  CURRENT_DATE - r.due_date AS days_overdue,
  EXTRACT(DAY FROM (r.responded_at - r.created_at)) AS response_time_days
FROM rfis r
LEFT JOIN development_projects p ON r.project_id = p.id
LEFT JOIN users submitter ON r.submitted_by = submitter.id
LEFT JOIN users assignee ON r.assigned_to = assignee.id
LEFT JOIN users responder ON r.answered_by = responder.id;

-- Change Order Summary View
CREATE OR REPLACE VIEW v_change_order_summary AS
SELECT 
  co.id,
  co.project_id,
  co.co_number,
  co.title,
  co.type,
  co.reason,
  co.status,
  co.this_change_amount,
  co.new_contract_amount,
  co.this_extension_days,
  co.new_completion_date,
  co.created_at,
  co.submitted_at,
  co.approved_at,
  p.project_name,
  p.project_number,
  submitter.full_name AS submitted_by_name,
  approver.full_name AS current_approver_name,
  c.company_name AS contractor_name,
  (SELECT SUM(total) FROM change_order_items WHERE change_order_id = co.id) AS calculated_total
FROM change_orders co
LEFT JOIN development_projects p ON co.project_id = p.id
LEFT JOIN users submitter ON co.submitted_by = submitter.id
LEFT JOIN users approver ON co.current_approver_id = approver.id
LEFT JOIN contractors c ON co.contractor_id = c.id;

-- Project RFI/CO Statistics View
CREATE OR REPLACE VIEW v_project_rfi_co_stats AS
SELECT 
  p.id AS project_id,
  p.project_name,
  -- RFI Stats
  COUNT(DISTINCT r.id) AS total_rfis,
  COUNT(DISTINCT CASE WHEN r.status = 'open' THEN r.id END) AS open_rfis,
  COUNT(DISTINCT CASE WHEN r.status = 'open' AND r.due_date < CURRENT_DATE THEN r.id END) AS overdue_rfis,
  AVG(EXTRACT(DAY FROM (r.responded_at - r.created_at))) AS avg_rfi_response_days,
  -- CO Stats
  COUNT(DISTINCT co.id) AS total_cos,
  COUNT(DISTINCT CASE WHEN co.status IN ('pending_review', 'pending_approval') THEN co.id END) AS pending_cos,
  SUM(CASE WHEN co.status IN ('approved', 'executed') THEN co.this_change_amount ELSE 0 END) AS approved_co_value,
  SUM(CASE WHEN co.status IN ('approved', 'executed') THEN co.this_extension_days ELSE 0 END) AS total_schedule_impact_days
FROM development_projects p
LEFT JOIN rfis r ON r.project_id = p.id
LEFT JOIN change_orders co ON co.project_id = p.id
GROUP BY p.id, p.project_name;

COMMENT ON TABLE rfis IS 'Request for Information tracking - field-office communication for construction projects';
COMMENT ON TABLE change_orders IS 'Formal scope and budget change management for construction contracts';
COMMENT ON TABLE change_order_items IS 'Line item cost breakdown for change orders';
