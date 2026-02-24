-- =====================================================
-- PHASE 5.7 WEEK 2: COMMISSION MANAGEMENT SYSTEM
-- Propertybase-inspired commission tracking with 
-- tiered structures, splits, and clawback support
-- =====================================================

-- Commission plan templates
CREATE TABLE IF NOT EXISTS commission_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Plan type
    plan_type VARCHAR(50) NOT NULL DEFAULT 'standard', -- standard, tiered, flat, graduated
    
    -- Default rates (can be overridden by tiers)
    base_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.0300, -- 3% default
    
    -- Whether this is the default plan for new agents
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Effective dates
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    UNIQUE(organization_id, name)
);

-- Commission tiers for graduated/tiered plans
CREATE TABLE IF NOT EXISTS commission_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES commission_plans(id) ON DELETE CASCADE,
    
    -- Tier thresholds (based on deal value or cumulative volume)
    tier_name VARCHAR(50) NOT NULL,
    min_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
    max_value DECIMAL(15, 2), -- NULL means unlimited
    
    -- Rate for this tier
    commission_rate DECIMAL(5, 4) NOT NULL,
    
    -- Bonus for hitting tier
    tier_bonus DECIMAL(15, 2) DEFAULT 0,
    
    -- Order for graduated calculation
    tier_order INTEGER NOT NULL DEFAULT 1,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent commission assignments
CREATE TABLE IF NOT EXISTS agent_commission_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES commission_plans(id) ON DELETE CASCADE,
    
    -- Override rates for specific agent
    custom_rate DECIMAL(5, 4),
    
    -- Assignment period
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    UNIQUE(agent_id, plan_id, effective_from)
);

-- Commission splits for deals with multiple agents
CREATE TABLE IF NOT EXISTS commission_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    
    -- Participants
    agent_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(50) NOT NULL DEFAULT 'primary', -- primary, co-agent, referral, manager
    
    -- Split percentage (all splits for a deal should sum to 100)
    split_percentage DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    
    -- Calculated commission amount
    commission_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    
    -- Override notes
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    UNIQUE(deal_id, agent_id)
);

-- Individual commission records per deal
CREATE TABLE IF NOT EXISTS commission_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id),
    
    -- Source of commission
    source_type VARCHAR(50) NOT NULL DEFAULT 'deal_close', -- deal_close, referral, bonus, adjustment, clawback
    
    -- Financial details
    deal_value DECIMAL(15, 2) NOT NULL,
    commission_rate DECIMAL(5, 4) NOT NULL,
    split_percentage DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    
    -- Calculated amounts
    gross_commission DECIMAL(15, 2) NOT NULL,
    agent_share DECIMAL(15, 2) NOT NULL,
    company_share DECIMAL(15, 2) NOT NULL DEFAULT 0,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, paid, clawback, voided
    
    -- Clawback tracking
    is_clawback BOOLEAN DEFAULT FALSE,
    original_commission_id UUID REFERENCES commission_records(id),
    clawback_reason TEXT,
    clawback_date DATE,
    
    -- Dates
    deal_close_date DATE NOT NULL,
    accrual_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Audit
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    paid_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(deal_id, agent_id, source_type)
);

-- Commission statements (monthly/periodic summaries)
CREATE TABLE IF NOT EXISTS commission_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id),
    
    -- Statement period
    statement_number VARCHAR(50) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Financial summary
    total_deals INTEGER NOT NULL DEFAULT 0,
    total_deal_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
    gross_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,
    deductions DECIMAL(15, 2) NOT NULL DEFAULT 0,
    clawbacks DECIMAL(15, 2) NOT NULL DEFAULT 0,
    bonuses DECIMAL(15, 2) NOT NULL DEFAULT 0,
    net_commission DECIMAL(15, 2) NOT NULL DEFAULT 0,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, approved, paid, disputed
    
    -- Payment info
    payment_method VARCHAR(50),
    payment_reference VARCHAR(100),
    paid_at TIMESTAMPTZ,
    
    -- PDF storage
    document_url VARCHAR(500),
    
    -- Approval workflow
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(organization_id, agent_id, period_start, period_end)
);

-- Link statement to individual commission records
CREATE TABLE IF NOT EXISTS statement_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES commission_statements(id) ON DELETE CASCADE,
    commission_record_id UUID NOT NULL REFERENCES commission_records(id),
    
    -- Denormalized for statement display
    deal_reference VARCHAR(100),
    property_address TEXT,
    deal_close_date DATE,
    deal_value DECIMAL(15, 2),
    commission_amount DECIMAL(15, 2),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(statement_id, commission_record_id)
);

-- Commission adjustments (bonuses, deductions, corrections)
CREATE TABLE IF NOT EXISTS commission_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id),
    statement_id UUID REFERENCES commission_statements(id),
    
    -- Adjustment type
    adjustment_type VARCHAR(50) NOT NULL, -- bonus, deduction, correction, advance, repayment
    
    -- Amount (positive for credits, negative for debits)
    amount DECIMAL(15, 2) NOT NULL,
    
    -- Details
    description TEXT NOT NULL,
    reference_number VARCHAR(100),
    
    -- Dates
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Approval
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_commission_plans_org ON commission_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_commission_plans_active ON commission_plans(organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_commission_tiers_plan ON commission_tiers(plan_id, tier_order);

CREATE INDEX IF NOT EXISTS idx_agent_assignments_agent ON agent_commission_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_plan ON agent_commission_assignments(plan_id);

CREATE INDEX IF NOT EXISTS idx_commission_splits_deal ON commission_splits(deal_id);
CREATE INDEX IF NOT EXISTS idx_commission_splits_agent ON commission_splits(agent_id);

CREATE INDEX IF NOT EXISTS idx_commission_records_org ON commission_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_commission_records_deal ON commission_records(deal_id);
CREATE INDEX IF NOT EXISTS idx_commission_records_agent ON commission_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_commission_records_status ON commission_records(status);
CREATE INDEX IF NOT EXISTS idx_commission_records_period ON commission_records(organization_id, deal_close_date);

CREATE INDEX IF NOT EXISTS idx_commission_statements_org ON commission_statements(organization_id);
CREATE INDEX IF NOT EXISTS idx_commission_statements_agent ON commission_statements(agent_id);
CREATE INDEX IF NOT EXISTS idx_commission_statements_period ON commission_statements(organization_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_commission_statements_status ON commission_statements(status);

CREATE INDEX IF NOT EXISTS idx_commission_adjustments_agent ON commission_adjustments(agent_id);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_statement ON commission_adjustments(statement_id);

-- =====================================================
-- VIEWS
-- =====================================================

-- Agent commission summary view
CREATE OR REPLACE VIEW v_agent_commission_summary AS
SELECT 
    cr.agent_id,
    u.display_name AS agent_name,
    cr.organization_id,
    
    -- Period aggregates
    DATE_TRUNC('month', cr.deal_close_date) AS month,
    
    -- Deal counts
    COUNT(DISTINCT cr.deal_id) AS total_deals,
    
    -- Financials
    SUM(cr.deal_value) AS total_deal_value,
    SUM(cr.gross_commission) AS gross_commission,
    SUM(cr.agent_share) AS agent_commission,
    SUM(cr.company_share) AS company_commission,
    
    -- Average metrics
    AVG(cr.commission_rate) AS avg_commission_rate,
    AVG(cr.deal_value) AS avg_deal_value,
    
    -- Clawbacks
    SUM(CASE WHEN cr.is_clawback THEN cr.agent_share ELSE 0 END) AS clawback_amount,
    
    -- Status breakdown
    COUNT(CASE WHEN cr.status = 'pending' THEN 1 END) AS pending_count,
    COUNT(CASE WHEN cr.status = 'approved' THEN 1 END) AS approved_count,
    COUNT(CASE WHEN cr.status = 'paid' THEN 1 END) AS paid_count

FROM commission_records cr
JOIN users u ON cr.agent_id = u.id
WHERE cr.status != 'voided'
GROUP BY cr.agent_id, u.display_name, cr.organization_id, DATE_TRUNC('month', cr.deal_close_date);

-- Pending commissions view for approval workflow
CREATE OR REPLACE VIEW v_pending_commissions AS
SELECT 
    cr.id,
    cr.organization_id,
    cr.deal_id,
    cr.agent_id,
    u.display_name AS agent_name,
    d.title AS deal_name,
    p.address_street AS property_address,
    cr.deal_value,
    cr.gross_commission,
    cr.agent_share,
    cr.deal_close_date,
    cr.accrual_date,
    cr.created_at
FROM commission_records cr
JOIN users u ON cr.agent_id = u.id
JOIN deals d ON cr.deal_id = d.id
LEFT JOIN properties p ON p.id = ANY(d.property_ids)
WHERE cr.status = 'pending'
ORDER BY cr.created_at DESC;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Calculate commission for a deal
CREATE OR REPLACE FUNCTION calculate_deal_commission(
    p_deal_id UUID,
    p_agent_id UUID,
    p_deal_value DECIMAL,
    p_organization_id UUID
) RETURNS TABLE (
    commission_rate DECIMAL,
    gross_commission DECIMAL,
    agent_share DECIMAL,
    company_share DECIMAL
) AS $$
DECLARE
    v_plan_id UUID;
    v_base_rate DECIMAL;
    v_custom_rate DECIMAL;
    v_final_rate DECIMAL;
    v_split_pct DECIMAL;
    v_gross DECIMAL;
    v_agent DECIMAL;
    v_company DECIMAL;
BEGIN
    -- Get agent's active commission plan
    SELECT aca.plan_id, aca.custom_rate, cp.base_rate
    INTO v_plan_id, v_custom_rate, v_base_rate
    FROM agent_commission_assignments aca
    JOIN commission_plans cp ON aca.plan_id = cp.id
    WHERE aca.agent_id = p_agent_id
      AND aca.effective_from <= CURRENT_DATE
      AND (aca.effective_to IS NULL OR aca.effective_to >= CURRENT_DATE)
      AND cp.is_active = TRUE
    ORDER BY aca.effective_from DESC
    LIMIT 1;
    
    -- Fallback to org default plan
    IF v_plan_id IS NULL THEN
        SELECT id, base_rate 
        INTO v_plan_id, v_base_rate
        FROM commission_plans
        WHERE organization_id = p_organization_id 
          AND is_default = TRUE 
          AND is_active = TRUE
        LIMIT 1;
    END IF;
    
    -- Use custom rate if set, otherwise base rate
    v_final_rate := COALESCE(v_custom_rate, v_base_rate, 0.03);
    
    -- Check for tiered rates
    SELECT ct.commission_rate
    INTO v_final_rate
    FROM commission_tiers ct
    WHERE ct.plan_id = v_plan_id
      AND p_deal_value >= ct.min_value
      AND (ct.max_value IS NULL OR p_deal_value < ct.max_value)
    ORDER BY ct.tier_order DESC
    LIMIT 1;
    
    -- Default if still null
    v_final_rate := COALESCE(v_final_rate, 0.03);
    
    -- Get split percentage for this agent on this deal
    SELECT COALESCE(cs.split_percentage, 100)
    INTO v_split_pct
    FROM commission_splits cs
    WHERE cs.deal_id = p_deal_id AND cs.agent_id = p_agent_id;
    
    v_split_pct := COALESCE(v_split_pct, 100);
    
    -- Calculate commissions
    v_gross := p_deal_value * v_final_rate;
    v_agent := v_gross * (v_split_pct / 100);
    v_company := v_gross - v_agent;
    
    RETURN QUERY SELECT v_final_rate, v_gross, v_agent, v_company;
END;
$$ LANGUAGE plpgsql;

-- Generate commission record when deal closes
CREATE OR REPLACE FUNCTION create_commission_on_deal_close()
RETURNS TRIGGER AS $$
DECLARE
    v_calc RECORD;
    v_agent_id UUID;
    v_deal_value DECIMAL;
BEGIN
    -- Only trigger when deal moves to closed_won
    IF NEW.stage = 'closed_won' AND (OLD.stage IS NULL OR OLD.stage != 'closed_won') THEN
        
        -- Get deal value
        v_deal_value := COALESCE(NEW.value, 0);
        IF v_deal_value = 0 THEN
            RETURN NEW;
        END IF;
        
        -- Get primary agent
        v_agent_id := NEW.owner_id;
        
        IF v_agent_id IS NOT NULL THEN
            -- Calculate commission
            SELECT * INTO v_calc
            FROM calculate_deal_commission(NEW.id, v_agent_id, v_deal_value, NEW.organization_id);
            
            -- Insert commission record
            INSERT INTO commission_records (
                organization_id,
                deal_id,
                agent_id,
                source_type,
                deal_value,
                commission_rate,
                split_percentage,
                gross_commission,
                agent_share,
                company_share,
                deal_close_date,
                accrual_date
            ) VALUES (
                NEW.organization_id,
                NEW.id,
                v_agent_id,
                'deal_close',
                v_deal_value,
                v_calc.commission_rate,
                100,
                v_calc.gross_commission,
                v_calc.agent_share,
                v_calc.company_share,
                COALESCE(NEW.actual_close_date, CURRENT_DATE),
                CURRENT_DATE
            )
            ON CONFLICT (deal_id, agent_id, source_type) DO UPDATE SET
                deal_value = EXCLUDED.deal_value,
                commission_rate = EXCLUDED.commission_rate,
                gross_commission = EXCLUDED.gross_commission,
                agent_share = EXCLUDED.agent_share,
                company_share = EXCLUDED.company_share,
                updated_at = NOW();
        END IF;
        
        -- Handle co-agent splits
        INSERT INTO commission_records (
            organization_id,
            deal_id,
            agent_id,
            source_type,
            deal_value,
            commission_rate,
            split_percentage,
            gross_commission,
            agent_share,
            company_share,
            deal_close_date,
            accrual_date
        )
        SELECT 
            NEW.organization_id,
            NEW.id,
            cs.agent_id,
            CASE cs.role 
                WHEN 'referral' THEN 'referral'
                ELSE 'deal_close'
            END,
            v_deal_value,
            0.03, -- Could enhance to lookup actual rate
            cs.split_percentage,
            v_deal_value * 0.03,
            (v_deal_value * 0.03) * (cs.split_percentage / 100),
            0,
            COALESCE(NEW.actual_close_date, CURRENT_DATE),
            CURRENT_DATE
        FROM commission_splits cs
        WHERE cs.deal_id = NEW.id
          AND cs.agent_id != v_agent_id
        ON CONFLICT (deal_id, agent_id, source_type) DO NOTHING;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for commission generation
DROP TRIGGER IF EXISTS trigger_deal_commission ON deals;
CREATE TRIGGER trigger_deal_commission
    AFTER UPDATE ON deals
    FOR EACH ROW
    EXECUTE FUNCTION create_commission_on_deal_close();

-- Generate monthly statement
CREATE OR REPLACE FUNCTION generate_commission_statement(
    p_organization_id UUID,
    p_agent_id UUID,
    p_period_start DATE,
    p_period_end DATE
) RETURNS UUID AS $$
DECLARE
    v_statement_id UUID;
    v_statement_number VARCHAR(50);
    v_summary RECORD;
BEGIN
    -- Generate statement number
    v_statement_number := 'STMT-' || TO_CHAR(p_period_start, 'YYYYMM') || '-' || 
                          SUBSTRING(p_agent_id::TEXT, 1, 8);
    
    -- Calculate summary
    SELECT 
        COUNT(DISTINCT cr.deal_id) AS total_deals,
        COALESCE(SUM(cr.deal_value), 0) AS total_deal_value,
        COALESCE(SUM(cr.gross_commission), 0) AS gross_commission,
        COALESCE(SUM(CASE WHEN cr.is_clawback THEN cr.agent_share ELSE 0 END), 0) AS clawbacks,
        COALESCE(SUM(CASE WHEN cr.source_type = 'bonus' THEN cr.agent_share ELSE 0 END), 0) AS bonuses
    INTO v_summary
    FROM commission_records cr
    WHERE cr.organization_id = p_organization_id
      AND cr.agent_id = p_agent_id
      AND cr.deal_close_date BETWEEN p_period_start AND p_period_end
      AND cr.status IN ('pending', 'approved');
    
    -- Create or update statement
    INSERT INTO commission_statements (
        organization_id,
        agent_id,
        statement_number,
        period_start,
        period_end,
        total_deals,
        total_deal_value,
        gross_commission,
        clawbacks,
        bonuses,
        net_commission
    ) VALUES (
        p_organization_id,
        p_agent_id,
        v_statement_number,
        p_period_start,
        p_period_end,
        v_summary.total_deals,
        v_summary.total_deal_value,
        v_summary.gross_commission,
        v_summary.clawbacks,
        v_summary.bonuses,
        v_summary.gross_commission - v_summary.clawbacks + v_summary.bonuses
    )
    ON CONFLICT (organization_id, agent_id, period_start, period_end) 
    DO UPDATE SET
        total_deals = EXCLUDED.total_deals,
        total_deal_value = EXCLUDED.total_deal_value,
        gross_commission = EXCLUDED.gross_commission,
        clawbacks = EXCLUDED.clawbacks,
        bonuses = EXCLUDED.bonuses,
        net_commission = EXCLUDED.net_commission,
        updated_at = NOW()
    RETURNING id INTO v_statement_id;
    
    -- Link commission records to statement
    INSERT INTO statement_line_items (statement_id, commission_record_id, deal_reference, property_address, deal_close_date, deal_value, commission_amount)
    SELECT 
        v_statement_id,
        cr.id,
        d.reference_number,
        p.address_street,
        cr.deal_close_date,
        cr.deal_value,
        cr.agent_share
    FROM commission_records cr
    JOIN deals d ON cr.deal_id = d.id
    LEFT JOIN properties p ON p.id = ANY(d.property_ids)
    WHERE cr.organization_id = p_organization_id
      AND cr.agent_id = p_agent_id
      AND cr.deal_close_date BETWEEN p_period_start AND p_period_end
    ON CONFLICT (statement_id, commission_record_id) DO NOTHING;
    
    RETURN v_statement_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SEED DEFAULT COMMISSION PLAN
-- =====================================================

-- Insert default plan for existing organizations
INSERT INTO commission_plans (organization_id, name, description, plan_type, base_rate, is_default, is_active)
SELECT 
    id,
    'Standard Commission Plan',
    'Default 3% commission on all deals',
    'standard',
    0.0300,
    TRUE,
    TRUE
FROM organizations
WHERE id NOT IN (SELECT DISTINCT organization_id FROM commission_plans WHERE is_default = TRUE)
ON CONFLICT DO NOTHING;

-- Add tiered example for demonstration
-- (commented out - uncomment to create tiered example)
/*
INSERT INTO commission_tiers (plan_id, tier_name, min_value, max_value, commission_rate, tier_order)
SELECT 
    cp.id,
    tier.name,
    tier.min_val,
    tier.max_val,
    tier.rate,
    tier.ord
FROM commission_plans cp
CROSS JOIN (
    VALUES 
        ('Bronze', 0, 500000, 0.025, 1),
        ('Silver', 500000, 1000000, 0.030, 2),
        ('Gold', 1000000, 2500000, 0.035, 3),
        ('Platinum', 2500000, NULL, 0.040, 4)
) AS tier(name, min_val, max_val, rate, ord)
WHERE cp.is_default = TRUE
LIMIT 4;
*/

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_commission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_commission_plans_updated ON commission_plans;
CREATE TRIGGER trigger_commission_plans_updated
    BEFORE UPDATE ON commission_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_timestamp();

DROP TRIGGER IF EXISTS trigger_commission_records_updated ON commission_records;
CREATE TRIGGER trigger_commission_records_updated
    BEFORE UPDATE ON commission_records
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_timestamp();

DROP TRIGGER IF EXISTS trigger_commission_statements_updated ON commission_statements;
CREATE TRIGGER trigger_commission_statements_updated
    BEFORE UPDATE ON commission_statements
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_timestamp();
