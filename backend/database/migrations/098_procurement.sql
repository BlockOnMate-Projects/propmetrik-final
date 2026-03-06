-- 098_procurement.sql
-- Procurement & Purchase Orders Module
-- Phase 3A - Core Construction Ops

-- ============================================================================
-- ENUMS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE purchase_order_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'ordered',
    'partially_delivered',
    'delivered',
    'cancelled',
    'on_hold'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM (
    'pending',
    'in_transit',
    'delivered',
    'partial',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PURCHASE ORDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES development_projects(id) ON DELETE SET NULL,
  
  -- PO Details
  po_number VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  description TEXT,
  
  -- Vendor
  vendor_id UUID REFERENCES vendors(id),
  vendor_name VARCHAR(255) NOT NULL,
  vendor_contact_name VARCHAR(255),
  vendor_contact_phone VARCHAR(50),
  vendor_contact_email VARCHAR(255),
  
  -- Amounts
  subtotal DECIMAL(15, 2) DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  shipping_amount DECIMAL(15, 2) DEFAULT 0,
  discount_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'GHS',
  
  -- Status & Workflow
  status purchase_order_status DEFAULT 'draft',
  priority VARCHAR(20) DEFAULT 'normal', -- 'urgent', 'high', 'normal', 'low'
  
  -- Dates
  order_date DATE,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  due_date DATE, -- Payment due date
  
  -- Delivery Info
  delivery_address TEXT,
  delivery_instructions TEXT,
  
  -- Approval Workflow
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Terms
  payment_terms VARCHAR(100), -- 'Net 30', 'COD', etc.
  
  -- Attachments
  attachment_urls JSONB DEFAULT '[]',
  
  -- Audit
  notes TEXT,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PURCHASE ORDER ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  
  -- Item Details
  item_number INTEGER,
  description VARCHAR(500) NOT NULL,
  specification TEXT,
  
  -- Quantity & Pricing
  quantity DECIMAL(15, 3) NOT NULL,
  unit VARCHAR(50) DEFAULT 'EA', -- EA, KG, M, L, BAG, etc.
  unit_price DECIMAL(15, 2) NOT NULL,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  tax_percent DECIMAL(5, 2) DEFAULT 0,
  line_total DECIMAL(15, 2) GENERATED ALWAYS AS (
    quantity * unit_price * (1 - COALESCE(discount_percent, 0) / 100)
  ) STORED,
  
  -- Delivery Tracking
  quantity_delivered DECIMAL(15, 3) DEFAULT 0,
  quantity_remaining DECIMAL(15, 3) GENERATED ALWAYS AS (
    quantity - COALESCE(quantity_delivered, 0)
  ) STORED,
  
  -- Cost Allocation
  cost_code VARCHAR(50),
  budget_line_id UUID,
  
  -- Material Reference
  material_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- DELIVERIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  
  -- Delivery Details
  delivery_number VARCHAR(50),
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID REFERENCES users(id),
  received_by_name VARCHAR(255),
  
  -- Status
  status delivery_status DEFAULT 'delivered',
  
  -- Documentation
  delivery_note_number VARCHAR(100),
  invoice_number VARCHAR(100),
  
  -- Notes & Issues
  notes TEXT,
  issues TEXT,
  
  -- Photo Evidence
  photo_urls JSONB DEFAULT '[]',
  
  -- Signature
  signature_data TEXT, -- Base64 signature
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- DELIVERY ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  po_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
  
  -- Quantities
  quantity_expected DECIMAL(15, 3),
  quantity_received DECIMAL(15, 3) NOT NULL,
  quantity_rejected DECIMAL(15, 3) DEFAULT 0,
  
  -- Quality Check
  quality_status VARCHAR(20) DEFAULT 'accepted', -- 'accepted', 'rejected', 'partial'
  rejection_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PURCHASE ORDER APPROVALS (Audit Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_order_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  
  action VARCHAR(50) NOT NULL, -- 'submitted', 'approved', 'rejected', 'cancelled', 'on_hold'
  from_status purchase_order_status,
  to_status purchase_order_status,
  
  performed_by UUID REFERENCES users(id),
  performed_by_name VARCHAR(255),
  reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org ON purchase_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_project ON purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_dates ON purchase_orders(order_date, expected_delivery_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created ON purchase_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_po ON deliveries(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id);
CREATE INDEX IF NOT EXISTS idx_po_approvals_po ON purchase_order_approvals(purchase_order_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update PO totals when items change
CREATE OR REPLACE FUNCTION update_po_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE purchase_orders
  SET 
    subtotal = (
      SELECT COALESCE(SUM(line_total), 0) 
      FROM purchase_order_items 
      WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
    ),
    total_amount = (
      SELECT COALESCE(SUM(line_total), 0) 
      FROM purchase_order_items 
      WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
    ) + COALESCE(tax_amount, 0) + COALESCE(shipping_amount, 0) - COALESCE(discount_amount, 0),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_po_totals ON purchase_order_items;
CREATE TRIGGER trg_update_po_totals
AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
FOR EACH ROW EXECUTE FUNCTION update_po_totals();

-- Update PO item quantities when deliveries recorded
CREATE OR REPLACE FUNCTION update_po_item_quantities()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE purchase_order_items
  SET 
    quantity_delivered = (
      SELECT COALESCE(SUM(quantity_received - COALESCE(quantity_rejected, 0)), 0)
      FROM delivery_items
      WHERE po_item_id = NEW.po_item_id
    ),
    updated_at = NOW()
  WHERE id = NEW.po_item_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_po_item_quantities ON delivery_items;
CREATE TRIGGER trg_update_po_item_quantities
AFTER INSERT OR UPDATE ON delivery_items
FOR EACH ROW EXECUTE FUNCTION update_po_item_quantities();

-- Auto-generate PO number
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER AS $$
DECLARE
  year_part VARCHAR(4);
  seq_num INTEGER;
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
      CASE 
        WHEN po_number ~ ('^PO-' || year_part || '-[0-9]+$')
        THEN CAST(SUBSTRING(po_number FROM 'PO-' || year_part || '-([0-9]+)$') AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO seq_num
    FROM purchase_orders
    WHERE organization_id = NEW.organization_id;
    
    NEW.po_number := 'PO-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_po_number ON purchase_orders;
CREATE TRIGGER trg_generate_po_number
BEFORE INSERT ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION generate_po_number();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Purchase Order Summary
CREATE OR REPLACE VIEW purchase_order_summary AS
SELECT 
  po.id,
  po.organization_id,
  po.project_id,
  dp.name AS project_name,
  po.po_number,
  po.title,
  po.vendor_id,
  po.vendor_name,
  po.total_amount,
  po.currency,
  po.status,
  po.priority,
  po.order_date,
  po.expected_delivery_date,
  po.actual_delivery_date,
  po.created_by,
  COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS created_by_name,
  po.approved_by,
  COALESCE(au.display_name, au.first_name || ' ' || au.last_name) AS approved_by_name,
  po.created_at,
  (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) AS item_count,
  (SELECT COUNT(*) FROM deliveries WHERE purchase_order_id = po.id) AS delivery_count,
  CASE 
    WHEN po.expected_delivery_date < CURRENT_DATE AND po.status NOT IN ('delivered', 'cancelled') 
    THEN TRUE ELSE FALSE 
  END AS is_overdue
FROM purchase_orders po
LEFT JOIN development_projects dp ON po.project_id = dp.id
LEFT JOIN users u ON po.created_by = u.id
LEFT JOIN users au ON po.approved_by = au.id;

-- Project Procurement Summary
CREATE OR REPLACE VIEW project_procurement_summary AS
SELECT 
  project_id,
  COUNT(*) AS total_orders,
  SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_orders,
  SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) AS pending_orders,
  SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_orders,
  SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END) AS ordered_orders,
  SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
  SUM(total_amount) AS total_value,
  currency,
  COUNT(DISTINCT vendor_id) AS unique_vendors
FROM purchase_orders
WHERE project_id IS NOT NULL
GROUP BY project_id, currency;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE purchase_orders IS 'Procurement purchase orders for construction materials and services';
COMMENT ON TABLE purchase_order_items IS 'Line items within purchase orders';
COMMENT ON TABLE deliveries IS 'Delivery records against purchase orders';
COMMENT ON TABLE delivery_items IS 'Individual items received in a delivery';
COMMENT ON TABLE purchase_order_approvals IS 'Audit trail for purchase order status changes';
