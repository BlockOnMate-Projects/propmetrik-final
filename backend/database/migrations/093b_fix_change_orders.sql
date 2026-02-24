-- Migration 093b: Fix Change Orders Tables
-- Fix for missing contractors table and project_name column

-- Drop failed objects if they exist
DROP TABLE IF EXISTS change_order_signatures CASCADE;
DROP TABLE IF EXISTS change_order_history CASCADE;
DROP TABLE IF EXISTS change_order_items CASCADE;
DROP TABLE IF EXISTS change_orders CASCADE;

-- Drop and recreate triggers that might have been created
DROP TRIGGER IF EXISTS trigger_co_auto_number ON change_orders;
DROP TRIGGER IF EXISTS trigger_update_co_timestamp ON change_orders;
DROP TRIGGER IF EXISTS trigger_co_item_change ON change_order_items;

DROP FUNCTION IF EXISTS generate_co_number();
DROP FUNCTION IF EXISTS update_co_timestamp();
DROP FUNCTION IF EXISTS update_co_totals();
DROP FUNCTION IF EXISTS recalculate_co_totals();

-- Drop views if exist
DROP VIEW IF EXISTS v_rfi_summary CASCADE;
DROP VIEW IF EXISTS v_change_order_summary CASCADE;
DROP VIEW IF EXISTS v_project_rfi_co_stats CASCADE;

-- =====================================================
-- CHANGE ORDERS TABLE
-- =====================================================

-- Main Change Orders Table
CREATE TABLE change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  
  -- Identification
  co_number VARCHAR(50) NOT NULL,
  revision_number INTEGER DEFAULT 1,
  
  -- Details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reason change_order_reason NOT NULL,
  reason_details TEXT,
  co_type change_order_type NOT NULL DEFAULT 'additive',
  
  -- Status and Workflow
  status change_order_status NOT NULL DEFAULT 'draft',
  
  -- Financial
  original_contract_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  previous_changes_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  this_change_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  new_contract_amount NUMERIC(15,2) GENERATED ALWAYS AS (original_contract_amount + previous_changes_amount + this_change_amount) STORED,
  currency VARCHAR(3) DEFAULT 'GHS',
  
  -- Schedule Impact
  original_completion_date DATE,
  schedule_impact_days INTEGER DEFAULT 0,
  new_completion_date DATE,
  
  -- Workflow Tracking
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID REFERENCES users(id),
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  executed_by UUID REFERENCES users(id),
  executed_at TIMESTAMP WITH TIME ZONE,
  
  -- Approval Chain (JSONB for flexibility)
  approval_chain JSONB DEFAULT '[]',
  current_approver_id UUID REFERENCES users(id),
  
  -- References
  phase_id UUID REFERENCES project_phases(id),
  related_rfi_id UUID REFERENCES rfis(id),
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
  description TEXT NOT NULL,
  item_type VARCHAR(50) NOT NULL DEFAULT 'material',
  
  -- Cost Breakdown
  quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit VARCHAR(50) DEFAULT 'each',
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  markup_percentage NUMERIC(5,2) DEFAULT 0,
  total_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Cost Code Reference
  cost_code VARCHAR(50),
  notes TEXT,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_item_type CHECK (item_type IN ('labor', 'material', 'equipment', 'subcontractor', 'overhead', 'fee', 'other'))
);

-- Change Order History/Audit Trail
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

-- Change Order Signatures
CREATE TABLE change_order_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  signatory_role VARCHAR(100) NOT NULL,
  signatory_name VARCHAR(255),
  signatory_user_id UUID REFERENCES users(id),
  is_required BOOLEAN DEFAULT true,
  signed BOOLEAN DEFAULT false,
  signed_at TIMESTAMP WITH TIME ZONE,
  signature_data TEXT,
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_change_orders_org ON change_orders(organization_id);
CREATE INDEX idx_change_orders_project ON change_orders(project_id);
CREATE INDEX idx_change_orders_status ON change_orders(status);
CREATE INDEX idx_change_orders_co_type ON change_orders(co_type);
CREATE INDEX idx_change_orders_created ON change_orders(created_at);
CREATE INDEX idx_change_orders_submitted ON change_orders(submitted_by, submitted_at);
CREATE INDEX idx_change_orders_approved ON change_orders(approved_by, approved_at);
CREATE INDEX idx_change_orders_number ON change_orders(co_number);
CREATE INDEX idx_change_orders_phase ON change_orders(phase_id);

CREATE INDEX idx_co_items_change_order ON change_order_items(change_order_id);
CREATE INDEX idx_co_history_change_order ON change_order_history(change_order_id);
CREATE INDEX idx_co_signatures_change_order ON change_order_signatures(change_order_id);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-generate CO Number
CREATE OR REPLACE FUNCTION generate_co_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.co_number IS NULL OR NEW.co_number = '' THEN
    SELECT COALESCE(MAX(
      CASE 
        WHEN co_number ~ '^CO-\d{4}-\d{4}$' 
        THEN CAST(SUBSTRING(co_number FROM 9 FOR 4) AS INTEGER)
        ELSE 0 
      END
    ), 0) + 1 INTO next_num
    FROM change_orders 
    WHERE project_id = NEW.project_id;
    
    NEW.co_number := 'CO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_co_auto_number
  BEFORE INSERT ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_co_number();

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_co_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_co_timestamp
  BEFORE UPDATE ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_co_timestamp();

-- Auto-calculate new_completion_date
CREATE OR REPLACE FUNCTION calculate_co_completion_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.original_completion_date IS NOT NULL AND NEW.schedule_impact_days IS NOT NULL THEN
    NEW.new_completion_date := NEW.original_completion_date + (NEW.schedule_impact_days || ' days')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_co_completion_date
  BEFORE INSERT OR UPDATE ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION calculate_co_completion_date();

-- Recalculate CO total when items change
CREATE OR REPLACE FUNCTION recalculate_co_totals()
RETURNS TRIGGER AS $$
DECLARE
  new_total NUMERIC(15,2);
BEGIN
  SELECT COALESCE(SUM(total_cost), 0) INTO new_total
  FROM change_order_items
  WHERE change_order_id = COALESCE(NEW.change_order_id, OLD.change_order_id);
  
  UPDATE change_orders 
  SET this_change_amount = new_total,
      updated_at = NOW()
  WHERE id = COALESCE(NEW.change_order_id, OLD.change_order_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_co_item_change
  AFTER INSERT OR UPDATE OR DELETE ON change_order_items
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_co_totals();

-- =====================================================
-- VIEWS
-- =====================================================

-- RFI Summary View
CREATE OR REPLACE VIEW v_rfi_summary AS
SELECT 
  r.*,
  p.name AS project_name,
  p.project_number,
  COALESCE(submitter.display_name, submitter.first_name || ' ' || submitter.last_name) AS submitted_by_name,
  COALESCE(assignee.display_name, assignee.first_name || ' ' || assignee.last_name) AS assigned_to_name,
  COALESCE(responder.display_name, responder.first_name || ' ' || responder.last_name) AS answered_by_name,
  ph.name AS phase_name,
  CASE 
    WHEN r.status IN ('open', 'pending_response') AND r.due_date < CURRENT_DATE THEN true
    ELSE false
  END AS is_overdue,
  GREATEST(CURRENT_DATE - r.due_date, 0) AS days_overdue,
  (SELECT COUNT(*) FROM rfi_comments WHERE rfi_id = r.id) AS comment_count
FROM rfis r
LEFT JOIN development_projects p ON r.project_id = p.id
LEFT JOIN users submitter ON r.submitted_by = submitter.id
LEFT JOIN users assignee ON r.assigned_to = assignee.id
LEFT JOIN users responder ON r.answered_by = responder.id
LEFT JOIN project_phases ph ON r.phase_id = ph.id;

-- Change Order Summary View
CREATE OR REPLACE VIEW v_change_order_summary AS
SELECT 
  co.*,
  p.name AS project_name,
  p.project_number,
  COALESCE(submitter.display_name, submitter.first_name || ' ' || submitter.last_name) AS submitted_by_name,
  COALESCE(approver.display_name, approver.first_name || ' ' || approver.last_name) AS approved_by_name,
  COALESCE(executor.display_name, executor.first_name || ' ' || executor.last_name) AS executed_by_name,
  ph.name AS phase_name,
  (
    SELECT COUNT(*) 
    FROM change_order_signatures 
    WHERE change_order_id = co.id AND is_required = true AND signed = false
  ) AS pending_signatures,
  (
    SELECT COUNT(*) 
    FROM change_order_items 
    WHERE change_order_id = co.id
  ) AS item_count
FROM change_orders co
LEFT JOIN development_projects p ON co.project_id = p.id
LEFT JOIN users submitter ON co.submitted_by = submitter.id
LEFT JOIN users approver ON co.approved_by = approver.id
LEFT JOIN users executor ON co.executed_by = executor.id
LEFT JOIN project_phases ph ON co.phase_id = ph.id;

-- Project RFI/CO Stats View
CREATE OR REPLACE VIEW v_project_rfi_co_stats AS
SELECT 
  p.id AS project_id,
  p.name AS project_name,
  p.project_number,
  -- RFI Stats
  COUNT(DISTINCT r.id) AS total_rfis,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('open', 'pending_response')) AS open_rfis,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('open', 'pending_response') AND r.due_date < CURRENT_DATE) AS overdue_rfis,
  -- CO Stats
  COUNT(DISTINCT co.id) AS total_cos,
  COUNT(DISTINCT co.id) FILTER (WHERE co.status IN ('pending_review', 'pending_approval')) AS pending_cos,
  COALESCE(SUM(co.this_change_amount) FILTER (WHERE co.status = 'executed'), 0) AS total_executed_change
FROM development_projects p
LEFT JOIN rfis r ON r.project_id = p.id
LEFT JOIN change_orders co ON co.project_id = p.id
GROUP BY p.id, p.name, p.project_number;

-- Add comments
COMMENT ON TABLE change_orders IS 'Contract change orders with multi-level approval and financial tracking';
COMMENT ON TABLE change_order_items IS 'Line items for change order cost breakdown';
COMMENT ON TABLE change_order_history IS 'Audit trail for change order actions';
COMMENT ON TABLE change_order_signatures IS 'Signature tracking for change order approvals';
