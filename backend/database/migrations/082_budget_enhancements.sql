-- Migration: 082_budget_enhancements.sql
-- Phase 4 Sprint 7: Enhanced Budget Module
-- Creates tables for invoices, expense logging, and budget alerts

-- ============================================================================
-- PROJECT INVOICES
-- Tracks vendor invoices with exchange rate capture at invoice time
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    cost_id UUID REFERENCES project_costs(id) ON DELETE SET NULL,
    vendor_id UUID, -- References vendors table (created in migration 083)
    organization_id UUID NOT NULL,
    
    -- Invoice details
    invoice_number VARCHAR(100),
    reference_number VARCHAR(100),
    
    -- Amounts
    amount NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'GHS',
    tax_amount NUMERIC(15, 2) DEFAULT 0,
    discount_amount NUMERIC(15, 2) DEFAULT 0,
    total_amount NUMERIC(15, 2) NOT NULL,
    
    -- Exchange rate at time of invoice for historical accuracy
    exchange_rate_at_invoice NUMERIC(10, 6),
    exchange_rate_source VARCHAR(100), -- 'ForexRate-API' | 'Yahoo Finance' | 'Static Fallback'
    exchange_rate_date DATE,
    amount_in_ghs NUMERIC(15, 2), -- Converted amount if foreign currency
    
    -- Status workflow
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'draft',
        'pending',
        'under_review',
        'approved',
        'partially_paid',
        'paid',
        'overdue',
        'disputed',
        'rejected',
        'cancelled'
    )),
    
    -- Dates
    invoice_date DATE NOT NULL,
    due_date DATE,
    received_date DATE,
    paid_date DATE,
    
    -- Payment details
    payment_method VARCHAR(50), -- 'bank_transfer', 'mobile_money', 'cheque', 'cash'
    payment_reference VARCHAR(255),
    payment_account VARCHAR(255),
    
    -- Document
    file_url TEXT,
    file_name VARCHAR(255),
    file_size INTEGER,
    
    -- Line items stored as JSONB for flexibility
    line_items JSONB DEFAULT '[]',
    -- Example: [{"description": "Cement bags", "quantity": 100, "unit_price": 55, "amount": 5500}]
    
    -- Notes
    description TEXT,
    notes TEXT,
    internal_notes TEXT, -- For internal use only
    
    -- Approval workflow
    submitted_by UUID,
    submitted_at TIMESTAMP,
    reviewed_by UUID,
    reviewed_at TIMESTAMP,
    approved_by UUID,
    approved_at TIMESTAMP,
    rejected_by UUID,
    rejected_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for invoice queries
CREATE INDEX IF NOT EXISTS idx_project_invoices_project ON project_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_project_invoices_org ON project_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_invoices_vendor ON project_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_project_invoices_status ON project_invoices(status);
CREATE INDEX IF NOT EXISTS idx_project_invoices_due_date ON project_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_project_invoices_invoice_date ON project_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_project_invoices_cost ON project_invoices(cost_id);

-- ============================================================================
-- EXPENSE LOGS
-- Mobile-first expense tracking with GPS and receipt capture
-- ============================================================================
CREATE TABLE IF NOT EXISTS expense_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    category_id UUID,  -- FK deferred: project_cost_categories may not exist
    cost_id UUID REFERENCES project_costs(id) ON DELETE SET NULL,
    
    -- Expense details
    amount NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'GHS',
    description TEXT NOT NULL,
    expense_type VARCHAR(50) DEFAULT 'general' CHECK (expense_type IN (
        'material_purchase',
        'labor_payment',
        'equipment_rental',
        'transport',
        'permit_fee',
        'utility',
        'site_expense',
        'petty_cash',
        'general'
    )),
    
    -- Exchange rate if foreign currency
    exchange_rate NUMERIC(10, 6),
    amount_in_ghs NUMERIC(15, 2),
    
    -- Receipt/Document
    receipt_url TEXT,
    receipt_file_name VARCHAR(255),
    receipt_ocr_data JSONB, -- For future OCR extraction
    
    -- Location tracking (for on-site logging)
    location_gps GEOMETRY(POINT, 4326),
    location_address TEXT,
    location_ghana_post_gps VARCHAR(50),
    
    -- Vendor/Payee
    payee_name VARCHAR(255),
    payee_phone VARCHAR(50),
    payment_method VARCHAR(50), -- 'cash', 'mobile_money', 'bank_transfer'
    payment_reference VARCHAR(255),
    
    -- Timing
    expense_date DATE NOT NULL,
    expense_time TIME,
    
    -- Weather (auto-captured for construction context)
    weather_conditions VARCHAR(50),
    
    -- Approval workflow
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',
        'approved',
        'rejected',
        'reimbursed'
    )),
    approved_by UUID,
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Sync status (for offline-first PWA)
    is_synced BOOLEAN DEFAULT true,
    offline_id VARCHAR(100), -- Client-side ID for deduplication
    synced_at TIMESTAMP,
    
    -- Audit
    logged_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for expense queries
CREATE INDEX IF NOT EXISTS idx_expense_logs_project ON expense_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_expense_logs_org ON expense_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_expense_logs_category ON expense_logs(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_logs_date ON expense_logs(expense_date);
CREATE INDEX IF NOT EXISTS idx_expense_logs_logged_by ON expense_logs(logged_by);
CREATE INDEX IF NOT EXISTS idx_expense_logs_status ON expense_logs(status);
CREATE INDEX IF NOT EXISTS idx_expense_logs_offline_id ON expense_logs(offline_id);
CREATE INDEX IF NOT EXISTS idx_expense_logs_location ON expense_logs USING GIST(location_gps);

-- ============================================================================
-- BUDGET ALERTS
-- Threshold-based notifications for budget monitoring
-- ============================================================================
CREATE TABLE IF NOT EXISTS budget_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    category_id UUID,  -- FK deferred: project_cost_categories may not exist
    phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
    
    -- Alert type
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'threshold_warning',    -- Approaching budget threshold
        'threshold_exceeded',   -- Exceeded threshold
        'overrun',              -- Budget overrun
        'forecast_overrun',     -- Projected to overrun
        'fx_variance',          -- Exchange rate impact
        'payment_due',          -- Invoice payment due
        'payment_overdue',      -- Invoice past due
        'unusual_expense',      -- Anomaly detection
        'low_contingency',      -- Contingency running low
        'cost_trend'            -- Trending upward
    )),
    
    -- Severity
    severity VARCHAR(20) DEFAULT 'warning' CHECK (severity IN (
        'info',
        'warning',
        'critical'
    )),
    
    -- Threshold details
    threshold_type VARCHAR(50), -- 'percentage', 'absolute', 'trend'
    threshold_value NUMERIC(15, 2),
    current_value NUMERIC(15, 2),
    threshold_percent NUMERIC(5, 2),
    current_percent NUMERIC(5, 2),
    
    -- Impact
    variance_amount NUMERIC(15, 2),
    projected_impact NUMERIC(15, 2),
    
    -- Message
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    details JSONB, -- Additional context
    
    -- Related entities
    related_cost_id UUID REFERENCES project_costs(id) ON DELETE SET NULL,
    related_invoice_id UUID REFERENCES project_invoices(id) ON DELETE SET NULL,
    
    -- Actions
    recommended_actions JSONB, -- Array of suggested actions
    action_taken TEXT,
    resolution_notes TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID,
    acknowledged_at TIMESTAMP,
    is_resolved BOOLEAN DEFAULT false,
    resolved_by UUID,
    resolved_at TIMESTAMP,
    
    -- Notification tracking
    notifications_sent JSONB DEFAULT '[]',
    -- Example: [{"channel": "email", "sent_at": "...", "recipient": "..."}]
    last_notification_at TIMESTAMP,
    notification_count INTEGER DEFAULT 0,
    
    -- Expiration
    expires_at TIMESTAMP,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for alert queries
CREATE INDEX IF NOT EXISTS idx_budget_alerts_project ON budget_alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_org ON budget_alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_type ON budget_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_severity ON budget_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_active ON budget_alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_acknowledged ON budget_alerts(is_acknowledged);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_category ON budget_alerts(category_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_phase ON budget_alerts(phase_id);

-- ============================================================================
-- BUDGET ALERT RULES
-- Configurable alert thresholds per organization/project
-- ============================================================================
CREATE TABLE IF NOT EXISTS budget_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
    category_id UUID,  -- FK deferred: project_cost_categories may not exist
    
    -- Rule name
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Conditions
    alert_type VARCHAR(50) NOT NULL,
    threshold_type VARCHAR(50) NOT NULL CHECK (threshold_type IN (
        'percentage_of_budget',
        'percentage_change',
        'absolute_amount',
        'days_before_due',
        'trend_detection'
    )),
    threshold_value NUMERIC(15, 2) NOT NULL,
    comparison_operator VARCHAR(10) DEFAULT '>=' CHECK (comparison_operator IN (
        '=', '!=', '>', '>=', '<', '<='
    )),
    
    -- Actions
    severity VARCHAR(20) DEFAULT 'warning',
    notification_channels JSONB DEFAULT '["in_app"]',
    -- Example: ["in_app", "email", "sms", "whatsapp"]
    notify_roles JSONB DEFAULT '["project_manager"]',
    -- Example: ["project_manager", "owner", "accountant"]
    
    -- Behavior
    is_active BOOLEAN DEFAULT true,
    cooldown_hours INTEGER DEFAULT 24, -- Min hours between repeated alerts
    max_notifications INTEGER DEFAULT 3, -- Max notifications per alert instance
    
    -- Priority
    priority INTEGER DEFAULT 1, -- For rule ordering
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for rule lookups
CREATE INDEX IF NOT EXISTS idx_budget_alert_rules_org ON budget_alert_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_budget_alert_rules_project ON budget_alert_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_alert_rules_active ON budget_alert_rules(is_active);

-- ============================================================================
-- EXCHANGE RATE LOCKS
-- Lock exchange rates for budget planning
-- ============================================================================
CREATE TABLE IF NOT EXISTS exchange_rate_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Currency pair
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
    
    -- Locked rate
    locked_rate NUMERIC(10, 6) NOT NULL,
    rate_at_lock NUMERIC(10, 6) NOT NULL, -- Market rate when locked
    rate_source VARCHAR(100),
    
    -- Lock details
    locked_by UUID NOT NULL,
    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lock_reason TEXT,
    
    -- Validity period
    valid_from DATE NOT NULL,
    valid_until DATE,
    
    -- Budget amount protected
    budget_amount_locked NUMERIC(15, 2),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Variance tracking
    current_market_rate NUMERIC(10, 6),
    variance_percent NUMERIC(5, 2),
    variance_impact_ghs NUMERIC(15, 2),
    last_variance_check TIMESTAMP,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for rate lock lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rate_locks_project ON exchange_rate_locks(project_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_locks_active ON exchange_rate_locks(is_active);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_locks_currencies ON exchange_rate_locks(from_currency, to_currency);

-- ============================================================================
-- PAYMENT MILESTONES
-- Link payments to project phases/milestones
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
    cost_id UUID REFERENCES project_costs(id) ON DELETE SET NULL,
    vendor_id UUID,
    
    -- Milestone details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Payment terms
    payment_percentage NUMERIC(5, 2), -- % of contract value
    payment_amount NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'GHS',
    
    -- Schedule
    scheduled_date DATE NOT NULL,
    trigger_condition TEXT, -- e.g., "On completion of foundation"
    
    -- Status
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN (
        'scheduled',
        'pending_approval',
        'approved',
        'invoiced',
        'paid',
        'delayed',
        'cancelled'
    )),
    
    -- Completion tracking
    completion_percentage NUMERIC(5, 2) DEFAULT 0,
    completion_verified_by UUID,
    completion_verified_at TIMESTAMP,
    
    -- Invoice link
    invoice_id UUID REFERENCES project_invoices(id) ON DELETE SET NULL,
    
    -- Actual payment
    actual_payment_date DATE,
    actual_amount NUMERIC(15, 2),
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for payment milestone queries
CREATE INDEX IF NOT EXISTS idx_payment_milestones_project ON payment_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_phase ON payment_milestones(phase_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_vendor ON payment_milestones(vendor_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_scheduled ON payment_milestones(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_status ON payment_milestones(status);

-- ============================================================================
-- BUDGET SNAPSHOTS
-- Historical budget snapshots for trending and reporting
-- ============================================================================
CREATE TABLE IF NOT EXISTS budget_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Snapshot date
    snapshot_date DATE NOT NULL,
    snapshot_type VARCHAR(50) DEFAULT 'weekly' CHECK (snapshot_type IN (
        'daily', 'weekly', 'monthly', 'quarterly', 'manual'
    )),
    
    -- Budget totals
    total_budget NUMERIC(15, 2) NOT NULL,
    total_committed NUMERIC(15, 2) NOT NULL,
    total_actual NUMERIC(15, 2) NOT NULL,
    total_pending NUMERIC(15, 2) DEFAULT 0,
    total_variance NUMERIC(15, 2) NOT NULL,
    
    -- Projections
    projected_final_cost NUMERIC(15, 2),
    contingency_remaining NUMERIC(15, 2),
    
    -- Exchange rate snapshot
    exchange_rates JSONB, -- {USD: 15.50, GBP: 19.50, ...}
    
    -- Category breakdown
    category_breakdown JSONB,
    -- Example: {"foundation": {"budget": 50000, "actual": 45000}, ...}
    
    -- Phase breakdown
    phase_breakdown JSONB,
    
    -- Metrics
    burn_rate_daily NUMERIC(15, 2),
    burn_rate_weekly NUMERIC(15, 2),
    cost_performance_index NUMERIC(5, 3), -- CPI = EV/AC
    schedule_performance_index NUMERIC(5, 3), -- SPI = EV/PV
    
    -- Audit
    created_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for snapshot queries
CREATE INDEX IF NOT EXISTS idx_budget_snapshots_project ON budget_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_snapshots_date ON budget_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_budget_snapshots_type ON budget_snapshots(snapshot_type);

-- Unique constraint for daily snapshots
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_snapshots_unique 
ON budget_snapshots(project_id, snapshot_date, snapshot_type);

-- ============================================================================
-- SEED DEFAULT ALERT RULES
-- ============================================================================
INSERT INTO budget_alert_rules (
    organization_id,
    name,
    description,
    alert_type,
    threshold_type,
    threshold_value,
    comparison_operator,
    severity,
    notification_channels,
    notify_roles,
    is_active,
    priority
) VALUES 
    -- 75% Warning
    ('00000000-0000-0000-0000-000000000000', 
     'Budget 75% Warning',
     'Alert when 75% of budget is consumed',
     'threshold_warning',
     'percentage_of_budget',
     75,
     '>=',
     'info',
     '["in_app"]',
     '["project_manager"]',
     true,
     1
    ),
    -- 90% Warning
    ('00000000-0000-0000-0000-000000000000', 
     'Budget 90% Warning',
     'Alert when 90% of budget is consumed',
     'threshold_warning',
     'percentage_of_budget',
     90,
     '>=',
     'warning',
     '["in_app", "email"]',
     '["project_manager", "owner"]',
     true,
     2
    ),
    -- Overrun Alert
    ('00000000-0000-0000-0000-000000000000', 
     'Budget Overrun',
     'Alert when budget is exceeded',
     'overrun',
     'percentage_of_budget',
     100,
     '>',
     'critical',
     '["in_app", "email", "sms"]',
     '["project_manager", "owner", "finance"]',
     true,
     3
    ),
    -- Payment Due
    ('00000000-0000-0000-0000-000000000000', 
     'Payment Due Soon',
     'Alert 7 days before invoice due date',
     'payment_due',
     'days_before_due',
     7,
     '<=',
     'info',
     '["in_app", "email"]',
     '["project_manager", "finance"]',
     true,
     4
    ),
    -- FX Variance
    ('00000000-0000-0000-0000-000000000000', 
     'FX Rate Variance',
     'Alert when exchange rate moves 5% from locked rate',
     'fx_variance',
     'percentage_change',
     5,
     '>=',
     'warning',
     '["in_app", "email"]',
     '["project_manager", "finance"]',
     true,
     5
    )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_budget_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS trg_project_invoices_updated ON project_invoices;
CREATE TRIGGER trg_project_invoices_updated
    BEFORE UPDATE ON project_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_budget_tables_updated_at();

DROP TRIGGER IF EXISTS trg_expense_logs_updated ON expense_logs;
CREATE TRIGGER trg_expense_logs_updated
    BEFORE UPDATE ON expense_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_budget_tables_updated_at();

DROP TRIGGER IF EXISTS trg_budget_alerts_updated ON budget_alerts;
CREATE TRIGGER trg_budget_alerts_updated
    BEFORE UPDATE ON budget_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_budget_tables_updated_at();

DROP TRIGGER IF EXISTS trg_budget_alert_rules_updated ON budget_alert_rules;
CREATE TRIGGER trg_budget_alert_rules_updated
    BEFORE UPDATE ON budget_alert_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_budget_tables_updated_at();

DROP TRIGGER IF EXISTS trg_exchange_rate_locks_updated ON exchange_rate_locks;
CREATE TRIGGER trg_exchange_rate_locks_updated
    BEFORE UPDATE ON exchange_rate_locks
    FOR EACH ROW
    EXECUTE FUNCTION update_budget_tables_updated_at();

DROP TRIGGER IF EXISTS trg_payment_milestones_updated ON payment_milestones;
CREATE TRIGGER trg_payment_milestones_updated
    BEFORE UPDATE ON payment_milestones
    FOR EACH ROW
    EXECUTE FUNCTION update_budget_tables_updated_at();

COMMENT ON TABLE project_invoices IS 'Vendor invoices with exchange rate capture';
COMMENT ON TABLE expense_logs IS 'Mobile-first expense tracking with GPS';
COMMENT ON TABLE budget_alerts IS 'Budget monitoring alerts and notifications';
COMMENT ON TABLE budget_alert_rules IS 'Configurable alert thresholds';
COMMENT ON TABLE exchange_rate_locks IS 'Locked exchange rates for budget planning';
COMMENT ON TABLE payment_milestones IS 'Payment schedule linked to phases';
COMMENT ON TABLE budget_snapshots IS 'Historical budget snapshots for trending';
