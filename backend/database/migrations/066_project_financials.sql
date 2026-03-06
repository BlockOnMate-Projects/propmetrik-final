-- Migration: 066_project_financials.sql
-- Description: Phase 5.8 Week 2 - Project Costs, Draw Requests, Contractors
-- Competitive Inspiration: Procore (budget tracking, draws, daily logs)
-- Created: 2026-01-21

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Cost category enum
DO $$ BEGIN
    CREATE TYPE cost_category AS ENUM (
        'land_acquisition',
        'permits_approvals',
        'design_engineering',
        'site_preparation',
        'foundation',
        'structural',
        'roofing',
        'mep',                    -- Mechanical, Electrical, Plumbing
        'exterior_finishing',
        'interior_finishing',
        'landscaping',
        'amenities',
        'contingency',
        'professional_fees',
        'insurance',
        'marketing_sales',
        'legal',
        'financing_costs',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Cost status enum
DO $$ BEGIN
    CREATE TYPE cost_status AS ENUM (
        'draft',
        'committed',       -- Contract signed but not invoiced
        'invoiced',        -- Invoice received
        'approved',        -- Invoice approved for payment
        'paid',            -- Payment made
        'disputed',        -- Payment dispute
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Draw request status enum
DO $$ BEGIN
    CREATE TYPE draw_status AS ENUM (
        'draft',
        'submitted',
        'under_review',
        'approved',
        'partially_funded',
        'funded',
        'rejected',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Contractor status enum
DO $$ BEGIN
    CREATE TYPE contractor_status AS ENUM (
        'pending',
        'approved',
        'active',
        'suspended',
        'inactive'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Daily log weather enum
DO $$ BEGIN
    CREATE TYPE weather_condition AS ENUM (
        'sunny',
        'partly_cloudy',
        'cloudy',
        'light_rain',
        'heavy_rain',
        'thunderstorm',
        'harmattan',      -- Ghana-specific
        'hot',
        'cool'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- CONTRACTORS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_contractors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    
    -- Company info
    company_name VARCHAR(200) NOT NULL,
    trade VARCHAR(100),  -- e.g., "General Contractor", "Plumbing", "Electrical"
    license_number VARCHAR(100),
    tax_id VARCHAR(50),
    
    -- Contact
    contact_name VARCHAR(200),
    phone VARCHAR(50),
    email VARCHAR(200),
    address TEXT,
    city VARCHAR(100),
    region VARCHAR(100),
    
    -- Banking (for payments)
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(50),
    bank_branch VARCHAR(100),
    momo_number VARCHAR(20),  -- Mobile Money (Ghana)
    
    -- Status and rating
    status contractor_status DEFAULT 'pending',
    rating DECIMAL(3, 2),  -- 0-5 stars
    total_projects INTEGER DEFAULT 0,
    total_contract_value DECIMAL(15, 2) DEFAULT 0,
    
    -- Insurance
    insurance_provider VARCHAR(200),
    insurance_policy_number VARCHAR(100),
    insurance_expiry_date DATE,
    
    -- Documents
    documents JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "type": "license", "url": "...", "expiry": "..." }]
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for contractors
CREATE INDEX IF NOT EXISTS idx_contractors_org ON project_contractors(organization_id);
CREATE INDEX IF NOT EXISTS idx_contractors_status ON project_contractors(status);
CREATE INDEX IF NOT EXISTS idx_contractors_trade ON project_contractors(trade);

-- ============================================================================
-- PROJECT CONTRACTOR ASSIGNMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_contractor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    contractor_id UUID NOT NULL REFERENCES project_contractors(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Assignment details
    role VARCHAR(100),  -- "Main Contractor", "Subcontractor", "Consultant"
    scope_of_work TEXT,
    
    -- Contract
    contract_number VARCHAR(50),
    contract_value DECIMAL(15, 2) DEFAULT 0,
    contract_start_date DATE,
    contract_end_date DATE,
    contract_document_url VARCHAR(500),
    
    -- Progress
    work_completed_percentage DECIMAL(5, 2) DEFAULT 0,
    amount_billed DECIMAL(15, 2) DEFAULT 0,
    amount_paid DECIMAL(15, 2) DEFAULT 0,
    retention_held DECIMAL(15, 2) DEFAULT 0,  -- Retention/holdback
    retention_percentage DECIMAL(5, 2) DEFAULT 5,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    start_date DATE,
    completion_date DATE,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_contractor_per_project UNIQUE (project_id, contractor_id)
);

-- Indexes for contractor assignments
CREATE INDEX IF NOT EXISTS idx_contractor_assignments_project ON project_contractor_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_contractor_assignments_contractor ON project_contractor_assignments(contractor_id);

-- ============================================================================
-- PROJECT COSTS TABLE (Procore-style budget tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Reference
    cost_code VARCHAR(50),  -- e.g., "01-100", "03-200"
    description VARCHAR(500) NOT NULL,
    
    -- Category and phase
    category cost_category NOT NULL,
    phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
    
    -- Contractor (if applicable)
    contractor_id UUID REFERENCES project_contractors(id) ON DELETE SET NULL,
    contractor_assignment_id UUID REFERENCES project_contractor_assignments(id) ON DELETE SET NULL,
    
    -- Amounts (Procore budget columns)
    original_budget DECIMAL(15, 2) DEFAULT 0,        -- Original estimate
    budget_modifications DECIMAL(15, 2) DEFAULT 0,   -- Approved changes
    revised_budget DECIMAL(15, 2) DEFAULT 0,         -- Original + modifications
    committed_costs DECIMAL(15, 2) DEFAULT 0,        -- Contracted/POs
    pending_costs DECIMAL(15, 2) DEFAULT 0,          -- Pending contracts
    projected_costs DECIMAL(15, 2) DEFAULT 0,        -- Final projected
    actual_costs DECIMAL(15, 2) DEFAULT 0,           -- Actually spent
    variance DECIMAL(15, 2) DEFAULT 0,               -- Budget - Projected
    
    -- Status
    status cost_status DEFAULT 'draft',
    
    -- Invoice details
    invoice_number VARCHAR(100),
    invoice_date DATE,
    invoice_due_date DATE,
    invoice_document_url VARCHAR(500),
    
    -- Payment details
    payment_date DATE,
    payment_reference VARCHAR(100),
    payment_method VARCHAR(50),  -- bank_transfer, check, momo, cash
    
    -- Approval workflow
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    paid_by UUID,
    paid_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for project costs
CREATE INDEX IF NOT EXISTS idx_project_costs_project ON project_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_category ON project_costs(category);
CREATE INDEX IF NOT EXISTS idx_project_costs_status ON project_costs(status);
CREATE INDEX IF NOT EXISTS idx_project_costs_contractor ON project_costs(contractor_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_phase ON project_costs(phase_id);

-- ============================================================================
-- DRAW REQUESTS TABLE (Construction Financing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS draw_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Draw identification
    draw_number INTEGER NOT NULL,
    title VARCHAR(200),
    description TEXT,
    
    -- Period covered
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Amounts
    previous_draws_total DECIMAL(15, 2) DEFAULT 0,
    current_draw_amount DECIMAL(15, 2) NOT NULL,
    retention_amount DECIMAL(15, 2) DEFAULT 0,
    net_amount DECIMAL(15, 2) NOT NULL,  -- current - retention
    cumulative_total DECIMAL(15, 2) DEFAULT 0,
    
    -- Progress
    percent_complete DECIMAL(5, 2) DEFAULT 0,
    
    -- Status
    status draw_status DEFAULT 'draft',
    
    -- Line items (detailed breakdown)
    line_items JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "cost_code": "01-100", "description": "...", "budget": 100000, "previous": 20000, "current": 15000, "percent": 35 }]
    
    -- Supporting documents
    documents JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "type": "invoice", "url": "...", "name": "..." }]
    
    -- Workflow timestamps
    submitted_at TIMESTAMP WITH TIME ZONE,
    submitted_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID,
    funded_at TIMESTAMP WITH TIME ZONE,
    funded_by UUID,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejected_by UUID,
    rejection_reason TEXT,
    
    -- Lender information
    lender_name VARCHAR(200),
    lender_reference VARCHAR(100),
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_draw_number_per_project UNIQUE (project_id, draw_number)
);

-- Indexes for draw requests
CREATE INDEX IF NOT EXISTS idx_draws_project ON draw_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_draws_status ON draw_requests(status);
CREATE INDEX IF NOT EXISTS idx_draws_period ON draw_requests(period_start, period_end);

-- ============================================================================
-- DAILY LOGS TABLE (Procore-inspired)
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Date
    log_date DATE NOT NULL,
    
    -- Weather
    weather_morning weather_condition,
    weather_afternoon weather_condition,
    temperature_morning INTEGER,  -- Celsius
    temperature_afternoon INTEGER,
    weather_notes TEXT,
    
    -- Manpower
    total_workers INTEGER DEFAULT 0,
    workers_by_trade JSONB DEFAULT '{}'::jsonb,
    -- Structure: { "Masons": 10, "Laborers": 20, "Electricians": 5 }
    
    -- Work performed
    work_summary TEXT,
    work_areas JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "area": "Block A Floor 3", "activity": "Plastering", "progress": "50%" }]
    
    -- Equipment
    equipment_on_site JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "type": "Crane", "hours": 8, "operator": "John" }]
    
    -- Materials
    materials_delivered JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "item": "Cement", "quantity": 100, "unit": "bags" }]
    
    -- Safety
    safety_incidents INTEGER DEFAULT 0,
    safety_notes TEXT,
    
    -- Visitors
    visitors JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "name": "Inspector", "company": "...", "purpose": "..." }]
    
    -- Photos
    photos JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "url": "...", "caption": "...", "area": "...", "taken_at": "..." }]
    
    -- Issues/Delays
    issues JSONB DEFAULT '[]'::jsonb,
    -- Structure: [{ "type": "delay", "description": "...", "impact_hours": 4 }]
    
    delay_hours DECIMAL(5, 2) DEFAULT 0,
    delay_reasons TEXT,
    
    -- Status
    is_work_day BOOLEAN DEFAULT true,
    is_submitted BOOLEAN DEFAULT false,
    submitted_at TIMESTAMP WITH TIME ZONE,
    submitted_by UUID,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_log_per_project_date UNIQUE (project_id, log_date)
);

-- Indexes for daily logs
CREATE INDEX IF NOT EXISTS idx_daily_logs_project ON daily_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(log_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_submitted ON daily_logs(is_submitted);

-- ============================================================================
-- BUYER PAYMENT PLANS (Ghana-specific)
-- ============================================================================

CREATE TABLE IF NOT EXISTS buyer_payment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES project_units(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Buyer info (denormalized for convenience)
    buyer_id UUID,
    buyer_name VARCHAR(200) NOT NULL,
    buyer_phone VARCHAR(50),
    buyer_email VARCHAR(200),
    
    -- Plan details
    plan_name VARCHAR(100),  -- e.g., "12-Month Plan", "Mortgage-Assisted"
    total_amount DECIMAL(15, 2) NOT NULL,
    down_payment DECIMAL(15, 2) DEFAULT 0,
    down_payment_percentage DECIMAL(5, 2) DEFAULT 0,
    
    -- Payment schedule
    number_of_installments INTEGER NOT NULL,
    installment_amount DECIMAL(15, 2) NOT NULL,
    payment_frequency VARCHAR(20) DEFAULT 'monthly',  -- weekly, bi-weekly, monthly
    start_date DATE NOT NULL,
    end_date DATE,
    
    -- Progress
    total_paid DECIMAL(15, 2) DEFAULT 0,
    paid_installments INTEGER DEFAULT 0,
    next_payment_date DATE,
    next_payment_amount DECIMAL(15, 2),
    
    -- Penalties
    late_fee_percentage DECIMAL(5, 2) DEFAULT 0,
    grace_period_days INTEGER DEFAULT 7,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for payment plans
CREATE INDEX IF NOT EXISTS idx_payment_plans_unit ON buyer_payment_plans(unit_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_project ON buyer_payment_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_buyer ON buyer_payment_plans(buyer_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_next ON buyer_payment_plans(next_payment_date);

-- ============================================================================
-- PAYMENT RECORDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS buyer_payment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_plan_id UUID NOT NULL REFERENCES buyer_payment_plans(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES project_units(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Payment details
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount_due DECIMAL(15, 2) NOT NULL,
    amount_paid DECIMAL(15, 2) DEFAULT 0,
    late_fee DECIMAL(15, 2) DEFAULT 0,
    
    -- Payment info
    payment_date DATE,
    payment_method VARCHAR(50),  -- bank_transfer, momo, cash, check
    payment_reference VARCHAR(100),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- pending, paid, partial, overdue
    
    -- Receipt
    receipt_number VARCHAR(50),
    receipt_url VARCHAR(500),
    
    -- Notes
    notes TEXT,
    
    -- Audit
    recorded_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for payment records
CREATE INDEX IF NOT EXISTS idx_payment_records_plan ON buyer_payment_records(payment_plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_unit ON buyer_payment_records(unit_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_due ON buyer_payment_records(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_records_status ON buyer_payment_records(status);

-- ============================================================================
-- PUNCH LIST ITEMS (Pre-handover deficiencies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS punch_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES project_units(id) ON DELETE CASCADE,  -- NULL for common areas
    organization_id UUID NOT NULL,
    
    -- Item details
    item_number INTEGER NOT NULL,
    category VARCHAR(100),  -- "Finishing", "Plumbing", "Electrical", etc.
    location VARCHAR(200),  -- "Master Bedroom", "Kitchen", "Hallway"
    description TEXT NOT NULL,
    
    -- Priority
    priority VARCHAR(20) DEFAULT 'medium',  -- low, medium, high, critical
    
    -- Assignment
    assigned_to UUID,  -- Contractor ID
    assigned_contractor_name VARCHAR(200),
    
    -- Status
    status VARCHAR(20) DEFAULT 'open',  -- open, in_progress, completed, verified, rejected
    
    -- Timeline
    identified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    identified_by UUID,
    due_date DATE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by UUID,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by UUID,
    
    -- Photos
    photos_before JSONB DEFAULT '[]'::jsonb,
    photos_after JSONB DEFAULT '[]'::jsonb,
    
    -- Notes
    notes TEXT,
    resolution_notes TEXT,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for punch list
CREATE INDEX IF NOT EXISTS idx_punch_list_project ON punch_list_items(project_id);
CREATE INDEX IF NOT EXISTS idx_punch_list_unit ON punch_list_items(unit_id);
CREATE INDEX IF NOT EXISTS idx_punch_list_status ON punch_list_items(status);
CREATE INDEX IF NOT EXISTS idx_punch_list_priority ON punch_list_items(priority);
CREATE INDEX IF NOT EXISTS idx_punch_list_assigned ON punch_list_items(assigned_to);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Project budget summary view
CREATE OR REPLACE VIEW v_project_budget_summary AS
SELECT 
    p.id AS project_id,
    p.organization_id,
    p.name AS project_name,
    p.total_budget AS overall_budget,
    
    -- By category totals
    COALESCE(SUM(c.original_budget), 0) AS total_original_budget,
    COALESCE(SUM(c.revised_budget), 0) AS total_revised_budget,
    COALESCE(SUM(c.committed_costs), 0) AS total_committed,
    COALESCE(SUM(c.actual_costs), 0) AS total_actual,
    COALESCE(SUM(c.projected_costs), 0) AS total_projected,
    
    -- Variance
    COALESCE(SUM(c.revised_budget), 0) - COALESCE(SUM(c.projected_costs), 0) AS total_variance,
    
    -- Percentage spent
    CASE 
        WHEN COALESCE(SUM(c.revised_budget), 0) > 0 
        THEN (COALESCE(SUM(c.actual_costs), 0) / COALESCE(SUM(c.revised_budget), 1)) * 100
        ELSE 0
    END AS percent_spent,
    
    -- Invoice status counts
    COUNT(*) FILTER (WHERE c.status = 'approved') AS pending_approval_count,
    COALESCE(SUM(c.actual_costs) FILTER (WHERE c.status = 'approved'), 0) AS pending_payment_amount,
    
    p.updated_at
FROM development_projects p
LEFT JOIN project_costs c ON c.project_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id;

-- Contractor performance view
CREATE OR REPLACE VIEW v_contractor_performance AS
SELECT 
    c.id AS contractor_id,
    c.organization_id,
    c.company_name,
    c.trade,
    c.status,
    c.rating,
    
    COUNT(DISTINCT a.project_id) AS active_projects,
    COALESCE(SUM(a.contract_value), 0) AS total_contract_value,
    COALESCE(SUM(a.amount_billed), 0) AS total_billed,
    COALESCE(SUM(a.amount_paid), 0) AS total_paid,
    COALESCE(AVG(a.work_completed_percentage), 0) AS avg_completion,
    
    c.created_at
FROM project_contractors c
LEFT JOIN project_contractor_assignments a ON a.contractor_id = c.id AND a.is_active = true
GROUP BY c.id;

-- Draw request summary view
CREATE OR REPLACE VIEW v_draw_summary AS
SELECT 
    d.id,
    d.project_id,
    p.name AS project_name,
    d.organization_id,
    d.draw_number,
    d.title,
    d.current_draw_amount,
    d.net_amount,
    d.status,
    d.percent_complete,
    d.period_start,
    d.period_end,
    d.submitted_at,
    d.approved_at,
    d.funded_at,
    
    -- Days in current status
    CASE 
        WHEN d.status = 'submitted' THEN CURRENT_DATE - d.submitted_at::date
        WHEN d.status = 'under_review' THEN CURRENT_DATE - d.reviewed_at::date
        WHEN d.status = 'approved' THEN CURRENT_DATE - d.approved_at::date
        ELSE 0
    END AS days_in_status,
    
    d.created_at
FROM draw_requests d
JOIN development_projects p ON p.id = d.project_id
WHERE p.deleted_at IS NULL;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update project budget totals
CREATE OR REPLACE FUNCTION update_project_budget_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE development_projects
    SET 
        total_budget = (
            SELECT COALESCE(SUM(revised_budget), 0) 
            FROM project_costs 
            WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
        ),
        total_spent = (
            SELECT COALESCE(SUM(actual_costs), 0) 
            FROM project_costs 
            WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
        ),
        total_committed = (
            SELECT COALESCE(SUM(committed_costs), 0) 
            FROM project_costs 
            WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.project_id, OLD.project_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for budget totals
DROP TRIGGER IF EXISTS trg_update_project_budget ON project_costs;
CREATE TRIGGER trg_update_project_budget
AFTER INSERT OR UPDATE OR DELETE ON project_costs
FOR EACH ROW
EXECUTE FUNCTION update_project_budget_totals();

-- Function to update payment plan progress
CREATE OR REPLACE FUNCTION update_payment_plan_progress()
RETURNS TRIGGER AS $$
DECLARE
    plan_record RECORD;
    total DECIMAL(15, 2);
    paid_count INTEGER;
    next_due RECORD;
BEGIN
    -- Get totals for this plan
    SELECT 
        COALESCE(SUM(amount_paid), 0),
        COUNT(*) FILTER (WHERE status = 'paid')
    INTO total, paid_count
    FROM buyer_payment_records
    WHERE payment_plan_id = NEW.payment_plan_id;
    
    -- Get next unpaid installment
    SELECT due_date, amount_due INTO next_due
    FROM buyer_payment_records
    WHERE payment_plan_id = NEW.payment_plan_id
    AND status != 'paid'
    ORDER BY due_date
    LIMIT 1;
    
    -- Update the plan
    UPDATE buyer_payment_plans
    SET 
        total_paid = total,
        paid_installments = paid_count,
        next_payment_date = next_due.due_date,
        next_payment_amount = next_due.amount_due,
        is_completed = (paid_count >= number_of_installments),
        completed_at = CASE WHEN paid_count >= number_of_installments THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = NEW.payment_plan_id;
    
    -- Also update the unit's total_paid
    UPDATE project_units
    SET 
        total_paid = total,
        payment_percentage = CASE 
            WHEN (SELECT total_amount FROM buyer_payment_plans WHERE id = NEW.payment_plan_id) > 0 
            THEN (total / (SELECT total_amount FROM buyer_payment_plans WHERE id = NEW.payment_plan_id)) * 100
            ELSE 0
        END,
        updated_at = NOW()
    WHERE id = NEW.unit_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment plan progress
DROP TRIGGER IF EXISTS trg_update_payment_plan ON buyer_payment_records;
CREATE TRIGGER trg_update_payment_plan
AFTER INSERT OR UPDATE ON buyer_payment_records
FOR EACH ROW
EXECUTE FUNCTION update_payment_plan_progress();

-- Function to generate draw number
CREATE OR REPLACE FUNCTION generate_draw_number(proj_id UUID)
RETURNS INTEGER AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(draw_number), 0) + 1 INTO next_num
    FROM draw_requests
    WHERE project_id = proj_id;
    
    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA: Cost categories with standard codes
-- ============================================================================

CREATE TABLE IF NOT EXISTS cost_code_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,  -- NULL for system templates
    
    code VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    category cost_category NOT NULL,
    description TEXT,
    
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert standard cost codes (CSI-inspired but simplified for Ghana)
INSERT INTO cost_code_templates (code, name, category, is_system) VALUES
    ('01-000', 'General Requirements', 'other', true),
    ('01-100', 'Project Management', 'professional_fees', true),
    ('01-200', 'Permits & Approvals', 'permits_approvals', true),
    ('01-300', 'Insurance & Bonds', 'insurance', true),
    ('02-000', 'Site Preparation', 'site_preparation', true),
    ('02-100', 'Demolition', 'site_preparation', true),
    ('02-200', 'Earthwork & Excavation', 'site_preparation', true),
    ('03-000', 'Concrete & Foundation', 'foundation', true),
    ('03-100', 'Foundation', 'foundation', true),
    ('03-200', 'Concrete Work', 'structural', true),
    ('04-000', 'Masonry', 'structural', true),
    ('05-000', 'Metals & Steel', 'structural', true),
    ('06-000', 'Carpentry', 'structural', true),
    ('07-000', 'Roofing', 'roofing', true),
    ('07-100', 'Roof Structure', 'roofing', true),
    ('07-200', 'Roof Covering', 'roofing', true),
    ('08-000', 'Doors & Windows', 'exterior_finishing', true),
    ('09-000', 'Interior Finishes', 'interior_finishing', true),
    ('09-100', 'Plastering', 'interior_finishing', true),
    ('09-200', 'Tiling', 'interior_finishing', true),
    ('09-300', 'Painting', 'interior_finishing', true),
    ('09-400', 'Flooring', 'interior_finishing', true),
    ('10-000', 'Specialties', 'interior_finishing', true),
    ('15-000', 'Plumbing', 'mep', true),
    ('16-000', 'Electrical', 'mep', true),
    ('16-100', 'Electrical Rough-In', 'mep', true),
    ('16-200', 'Electrical Fixtures', 'mep', true),
    ('17-000', 'HVAC', 'mep', true),
    ('31-000', 'Earthwork', 'landscaping', true),
    ('32-000', 'Exterior Improvements', 'landscaping', true),
    ('32-100', 'Paving & Driveways', 'landscaping', true),
    ('32-200', 'Landscaping', 'landscaping', true),
    ('32-300', 'Fencing & Gates', 'landscaping', true),
    ('33-000', 'Utilities', 'mep', true),
    ('40-000', 'Land Acquisition', 'land_acquisition', true),
    ('50-000', 'Professional Fees', 'professional_fees', true),
    ('50-100', 'Architect Fees', 'design_engineering', true),
    ('50-200', 'Engineering Fees', 'design_engineering', true),
    ('50-300', 'Legal Fees', 'legal', true),
    ('60-000', 'Financing Costs', 'financing_costs', true),
    ('70-000', 'Marketing & Sales', 'marketing_sales', true),
    ('99-000', 'Contingency', 'contingency', true)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_cost_codes_org ON cost_code_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_category ON cost_code_templates(category);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE project_contractors IS 'Contractors and subcontractors with banking/MoMo info for payments';
COMMENT ON TABLE project_contractor_assignments IS 'Contractor assignments to projects with contract details and progress';
COMMENT ON TABLE project_costs IS 'Procore-style budget tracking with committed/actual/projected costs';
COMMENT ON TABLE draw_requests IS 'Construction financing draw requests with lender workflow';
COMMENT ON TABLE daily_logs IS 'Procore-style daily construction logs with weather, manpower, photos';
COMMENT ON TABLE buyer_payment_plans IS 'Ghana-specific buyer installment plans (6-24 months typical)';
COMMENT ON TABLE buyer_payment_records IS 'Individual payment records for buyer installment plans';
COMMENT ON TABLE punch_list_items IS 'Pre-handover deficiency tracking for quality control';

COMMENT ON COLUMN project_costs.committed_costs IS 'Contracted/PO amounts not yet invoiced - Procore key metric';
COMMENT ON COLUMN project_costs.projected_costs IS 'Final estimated cost including all changes';
COMMENT ON COLUMN draw_requests.retention_amount IS 'Amount held back (typically 5-10%) until project completion';
-- momo_number column may not exist in all deployments
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buyer_payment_plans' AND column_name = 'momo_number') THEN
        COMMENT ON COLUMN buyer_payment_plans.momo_number IS 'MTN Mobile Money number for Ghana payments';
    END IF;
END $$;
