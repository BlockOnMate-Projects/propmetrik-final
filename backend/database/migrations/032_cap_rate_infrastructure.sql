-- =====================================================
-- Migration 032: Cap Rate Infrastructure
-- Purpose: Foundation for market-based cap rate calculation (RICS/GhIS compliant)
-- =====================================================
-- This migration:
-- 1. Creates property_income table for NOI tracking
-- 2. Creates market_cap_rate_benchmarks for regional/property type benchmarks
-- 3. Creates income_evidence table linking income data to properties
-- 4. Adds cap rate fields to valuations table
-- =====================================================

-- =====================================================
-- SECTION 1: PROPERTY INCOME TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS property_income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link to property (soft reference - no FK due to partitioned table)
    property_id UUID,
    
    -- Property identification if no property record exists
    property_address TEXT,
    property_region region_code_enum,
    property_type property_type_enum,
    
    -- Gross Income Components
    gross_potential_rent DECIMAL(14, 2),              -- Maximum rent if 100% occupied
    gross_potential_rent_per_sqm DECIMAL(10, 2),      -- Per sqm for standardization
    rental_period VARCHAR(20) DEFAULT 'monthly',      -- 'monthly', 'annually', 'weekly'
    
    -- Vacancy and Collection Losses
    vacancy_rate DECIMAL(5, 4),                        -- e.g., 0.08 for 8%
    vacancy_amount DECIMAL(14, 2),                     -- Calculated vacancy loss
    collection_loss_rate DECIMAL(5, 4),               -- Bad debt/collection losses
    collection_loss_amount DECIMAL(14, 2),
    
    -- Effective Gross Income
    effective_gross_income DECIMAL(14, 2),            -- GPI - Vacancy - Collection Losses
    other_income DECIMAL(14, 2) DEFAULT 0,            -- Parking, laundry, etc.
    total_effective_income DECIMAL(14, 2),            -- EGI + Other Income
    
    -- Operating Expenses
    operating_expenses_total DECIMAL(14, 2),
    operating_expense_ratio DECIMAL(5, 4),            -- OER = OpEx / EGI
    
    -- Operating Expense Breakdown (optional detail)
    expense_breakdown JSONB DEFAULT '{}',
    -- Structure: {
    --   "property_taxes": 5000,
    --   "insurance": 2000,
    --   "utilities": 3000,
    --   "maintenance": 4000,
    --   "management_fee": 2500,
    --   "reserves": 1000,
    --   "other": 500
    -- }
    
    -- Net Operating Income (THE KEY METRIC)
    net_operating_income DECIMAL(14, 2),              -- NOI = Total Effective Income - Operating Expenses
    noi_per_sqm DECIMAL(10, 2),                       -- Standardized per sqm
    
    -- Capital Expenditure (not in NOI but important for analysis)
    annual_capex DECIMAL(14, 2),
    capex_reserve_rate DECIMAL(5, 4),                 -- Usually 1-3% of replacement cost
    
    -- Cash Flow (NOI - Debt Service)
    debt_service DECIMAL(14, 2),
    net_cash_flow DECIMAL(14, 2),
    
    -- Property Value Reference (for cap rate calculation)
    property_value DECIMAL(18, 2),                    -- Market value or transaction price
    value_source VARCHAR(50),                         -- 'transaction', 'appraisal', 'assessed', 'estimated'
    value_date DATE,
    
    -- Calculated Cap Rate (NOI / Value)
    cap_rate DECIMAL(6, 4) GENERATED ALWAYS AS (
        CASE 
            WHEN property_value > 0 AND net_operating_income IS NOT NULL 
            THEN net_operating_income / property_value 
            ELSE NULL 
        END
    ) STORED,
    
    -- Data Quality
    income_evidence_quality VARCHAR(20) DEFAULT 'estimated',  -- 'verified', 'audited', 'reported', 'estimated'
    data_source VARCHAR(50),                          -- 'owner_statement', 'tax_return', 'bank_records', 'market_estimate'
    confidence_score DECIMAL(4, 3),
    
    -- Temporal
    effective_date DATE NOT NULL,                     -- When this income data is effective
    income_period_start DATE,
    income_period_end DATE,
    
    -- Metadata
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for property_income
CREATE INDEX IF NOT EXISTS idx_property_income_property_id ON property_income(property_id);
CREATE INDEX IF NOT EXISTS idx_property_income_region_type ON property_income(property_region, property_type);
CREATE INDEX IF NOT EXISTS idx_property_income_effective_date ON property_income(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_property_income_cap_rate ON property_income(cap_rate) WHERE cap_rate IS NOT NULL;

COMMENT ON TABLE property_income IS 'Tracks income and expense data for properties to calculate NOI and cap rates for income approach valuations';

-- =====================================================
-- SECTION 2: MARKET CAP RATE BENCHMARKS
-- =====================================================

CREATE TABLE IF NOT EXISTS market_cap_rate_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Geographic scope
    region region_code_enum NOT NULL,
    sub_region VARCHAR(100),                          -- District, neighborhood
    
    -- Property classification
    property_type property_type_enum NOT NULL,
    property_subtype VARCHAR(50),                     -- e.g., 'class_a_office', 'strip_mall'
    
    -- Cap Rate Statistics (from market transactions)
    sample_size INTEGER DEFAULT 0,
    
    -- Cap Rate Range
    cap_rate_min DECIMAL(6, 4),
    cap_rate_max DECIMAL(6, 4),
    cap_rate_median DECIMAL(6, 4),
    cap_rate_mean DECIMAL(6, 4),
    cap_rate_std_dev DECIMAL(6, 4),
    
    -- Quartiles for more precise analysis
    cap_rate_q1 DECIMAL(6, 4),                        -- 25th percentile
    cap_rate_q3 DECIMAL(6, 4),                        -- 75th percentile
    
    -- Typical ranges for RICS reporting
    typical_cap_rate_low DECIMAL(6, 4),               -- Conservative (lower end of typical)
    typical_cap_rate_high DECIMAL(6, 4),              -- Aggressive (higher end)
    benchmark_cap_rate DECIMAL(6, 4),                 -- Recommended benchmark for valuations
    
    -- Market Context
    market_condition VARCHAR(30) DEFAULT 'balanced',  -- 'hot', 'balanced', 'cool', 'distressed'
    yield_trend VARCHAR(20) DEFAULT 'stable',         -- 'compressing', 'stable', 'expanding'
    trend_description TEXT,
    
    -- Risk Adjustments
    risk_premium DECIMAL(5, 4),                       -- Added to risk-free rate
    risk_free_rate DECIMAL(5, 4),                     -- Treasury bill rate reference
    market_risk_score DECIMAL(4, 3),                  -- 0-1 risk score
    
    -- Related Economic Factors
    vacancy_rate_market DECIMAL(5, 4),                -- Market-wide vacancy
    absorption_rate DECIMAL(5, 4),                    -- Annual absorption
    rent_growth_rate DECIMAL(5, 4),                   -- YoY rent growth
    
    -- Data Sources
    data_sources JSONB DEFAULT '[]',                  -- List of sources used
    -- Structure: [
    --   {"source": "lands_commission", "count": 15, "weight": 0.4},
    --   {"source": "bank_valuations", "count": 25, "weight": 0.35},
    --   {"source": "agent_reported", "count": 30, "weight": 0.25}
    -- ]
    
    -- Temporal
    effective_date DATE NOT NULL,
    valid_from DATE NOT NULL,
    valid_until DATE,                                 -- NULL means current
    
    -- Quality
    confidence_score DECIMAL(4, 3) NOT NULL DEFAULT 0.7,
    data_quality VARCHAR(20) DEFAULT 'moderate',      -- 'high', 'moderate', 'low'
    
    -- Metadata
    methodology_notes TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(region, property_type, property_subtype, valid_from)
);

-- Indexes for market cap rate benchmarks
CREATE INDEX IF NOT EXISTS idx_cap_rate_benchmarks_lookup 
ON market_cap_rate_benchmarks(region, property_type, valid_until NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_cap_rate_benchmarks_effective 
ON market_cap_rate_benchmarks(effective_date DESC) 
WHERE valid_until IS NULL;

COMMENT ON TABLE market_cap_rate_benchmarks IS 'Market-derived cap rate benchmarks by region and property type - replaces hardcoded cap rates';

-- =====================================================
-- SECTION 3: INCOME EVIDENCE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS income_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Property linkage (soft reference - no FK due to partitioned table)
    property_id UUID,
    income_id UUID REFERENCES property_income(id) ON DELETE SET NULL,
    
    -- Evidence type
    evidence_type VARCHAR(50) NOT NULL,               -- 'rent_roll', 'lease_abstract', 'operating_statement', 'tax_return', 'bank_statement'
    
    -- Income Data Points
    monthly_rent DECIMAL(14, 2),
    annual_rent DECIMAL(14, 2),
    rent_per_sqm DECIMAL(10, 2),
    
    -- For multi-tenant properties
    unit_count INTEGER,
    occupied_units INTEGER,
    unit_breakdown JSONB,                             -- Details per unit type
    -- Structure: [
    --   {"unit_type": "2BR", "count": 4, "rent": 2500, "occupied": 3},
    --   {"unit_type": "3BR", "count": 2, "rent": 3500, "occupied": 2}
    -- ]
    
    -- Lease Information
    lease_type VARCHAR(30),                           -- 'gross', 'net', 'nnn', 'modified_gross'
    lease_term_months INTEGER,
    lease_start_date DATE,
    lease_end_date DATE,
    rent_escalation_rate DECIMAL(5, 4),
    
    -- Evidence Source
    source_type VARCHAR(30) NOT NULL,                 -- 'owner', 'tenant', 'agent', 'registry', 'estimated'
    source_name VARCHAR(100),
    source_document_url TEXT,
    
    -- Quality Indicators
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    confidence_score DECIMAL(4, 3) NOT NULL DEFAULT 0.6,
    
    -- Temporal
    effective_date DATE NOT NULL,
    observation_date DATE DEFAULT CURRENT_DATE,
    
    -- Metadata
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for income evidence
CREATE INDEX IF NOT EXISTS idx_income_evidence_property ON income_evidence(property_id);
CREATE INDEX IF NOT EXISTS idx_income_evidence_effective_date ON income_evidence(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_evidence_type ON income_evidence(evidence_type);

COMMENT ON TABLE income_evidence IS 'Tracks income evidence from various sources for properties - feeds into NOI calculation';

-- =====================================================
-- SECTION 4: CAP RATE FIELDS FOR VALUATIONS
-- =====================================================

-- Add cap rate methodology fields to valuations table
ALTER TABLE valuations 
ADD COLUMN IF NOT EXISTS applied_cap_rate DECIMAL(6, 4);

ALTER TABLE valuations 
ADD COLUMN IF NOT EXISTS cap_rate_source VARCHAR(50);

ALTER TABLE valuations 
ADD COLUMN IF NOT EXISTS cap_rate_justification TEXT;

ALTER TABLE valuations 
ADD COLUMN IF NOT EXISTS cap_rate_adjustments JSONB DEFAULT '[]';

-- Comments
COMMENT ON COLUMN valuations.applied_cap_rate IS 'The cap rate used for income approach valuation';
COMMENT ON COLUMN valuations.cap_rate_source IS 'Source of cap rate: market_benchmark, comparable_derived, client_specified, appraiser_judgment';
COMMENT ON COLUMN valuations.cap_rate_justification IS 'RICS-required justification for selected cap rate';
COMMENT ON COLUMN valuations.cap_rate_adjustments IS 'Adjustments made to benchmark cap rate: [{"factor": "age", "adjustment": 0.005, "reason": "Older building"}, ...]';

-- =====================================================
-- SECTION 5: SEED MARKET CAP RATE BENCHMARKS (GHANA)
-- =====================================================

-- Insert benchmark cap rates for Ghana market
-- These are initial estimates and should be updated with actual market data
INSERT INTO market_cap_rate_benchmarks (
    region, property_type, property_subtype,
    cap_rate_min, cap_rate_max, cap_rate_median, cap_rate_mean,
    typical_cap_rate_low, typical_cap_rate_high, benchmark_cap_rate,
    market_condition, yield_trend, risk_premium, risk_free_rate,
    sample_size, confidence_score, data_quality,
    effective_date, valid_from, methodology_notes
) VALUES
    -- Greater Accra - Residential
    ('greater_accra', 'residential_house', 'single_family',
     0.05, 0.10, 0.065, 0.068,
     0.055, 0.080, 0.065,
     'balanced', 'stable', 0.040, 0.025,
     12, 0.65, 'moderate',
     CURRENT_DATE, CURRENT_DATE,
     'Initial benchmark based on limited market data. Needs validation with actual transactions.'),
    
    ('greater_accra', 'apartment_flat', 'standard',
     0.06, 0.12, 0.078, 0.082,
     0.065, 0.095, 0.078,
     'balanced', 'stable', 0.045, 0.025,
     18, 0.70, 'moderate',
     CURRENT_DATE, CURRENT_DATE,
     'Apartment cap rates typically higher than single family due to management intensity.'),
    
    ('greater_accra', 'apartment_flat', 'luxury',
     0.045, 0.08, 0.055, 0.058,
     0.048, 0.068, 0.055,
     'hot', 'compressing', 0.030, 0.025,
     8, 0.60, 'low',
     CURRENT_DATE, CURRENT_DATE,
     'Limited luxury apartment transaction data. Premium locations command lower cap rates.'),
    
    -- Greater Accra - Commercial
    ('greater_accra', 'commercial_office', 'office_class_a',
     0.08, 0.14, 0.095, 0.100,
     0.085, 0.115, 0.095,
     'balanced', 'stable', 0.055, 0.025,
     6, 0.55, 'low',
     CURRENT_DATE, CURRENT_DATE,
     'Office market data limited. Benchmark derived from reported yields.'),
    
    ('greater_accra', 'commercial_shop', 'retail',
     0.09, 0.16, 0.110, 0.115,
     0.095, 0.130, 0.110,
     'cool', 'expanding', 0.065, 0.025,
     10, 0.60, 'moderate',
     CURRENT_DATE, CURRENT_DATE,
     'Retail yields expanding due to e-commerce pressure on traditional retail.'),
    
    ('greater_accra', 'warehouse', 'standard',
     0.10, 0.18, 0.125, 0.130,
     0.110, 0.145, 0.125,
     'hot', 'compressing', 0.070, 0.025,
     5, 0.50, 'low',
     CURRENT_DATE, CURRENT_DATE,
     'Industrial/warehouse demand increasing. Limited transaction data.'),
    
    -- Kumasi Metro - Residential
    ('kumasi_metro', 'residential_house', 'single_family',
     0.06, 0.12, 0.080, 0.085,
     0.070, 0.100, 0.080,
     'balanced', 'stable', 0.050, 0.025,
     8, 0.55, 'low',
     CURRENT_DATE, CURRENT_DATE,
     'Kumasi residential market. Higher yields than Accra due to smaller market.'),
    
    ('kumasi_metro', 'apartment_flat', 'standard',
     0.07, 0.14, 0.095, 0.100,
     0.085, 0.115, 0.095,
     'balanced', 'stable', 0.060, 0.025,
     6, 0.50, 'low',
     CURRENT_DATE, CURRENT_DATE,
     'Limited apartment data for Kumasi metro area.'),
    
    -- Western Cluster - Residential  
    ('western_cluster', 'residential_house', 'single_family',
     0.07, 0.14, 0.095, 0.100,
     0.085, 0.115, 0.095,
     'cool', 'stable', 0.060, 0.025,
     4, 0.45, 'low',
     CURRENT_DATE, CURRENT_DATE,
     'Western region benchmark. Very limited market data.'),
    
    -- Eastern - Residential
    ('eastern', 'residential_house', 'single_family',
     0.08, 0.15, 0.100, 0.105,
     0.090, 0.125, 0.100,
     'cool', 'stable', 0.065, 0.025,
     3, 0.40, 'low',
     CURRENT_DATE, CURRENT_DATE,
     'Eastern region benchmark. Minimal market data available.')

ON CONFLICT (region, property_type, property_subtype, valid_from) 
DO UPDATE SET
    cap_rate_min = EXCLUDED.cap_rate_min,
    cap_rate_max = EXCLUDED.cap_rate_max,
    cap_rate_median = EXCLUDED.cap_rate_median,
    benchmark_cap_rate = EXCLUDED.benchmark_cap_rate,
    last_updated = NOW();

-- =====================================================
-- SECTION 6: FUNCTION TO GET MARKET CAP RATE
-- =====================================================

CREATE OR REPLACE FUNCTION get_market_cap_rate(
    p_region region_code_enum,
    p_property_type property_type_enum,
    p_property_subtype VARCHAR(50) DEFAULT NULL,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    benchmark_cap_rate DECIMAL(6, 4),
    cap_rate_range_low DECIMAL(6, 4),
    cap_rate_range_high DECIMAL(6, 4),
    confidence_score DECIMAL(4, 3),
    sample_size INTEGER,
    market_condition VARCHAR(30),
    yield_trend VARCHAR(20),
    data_quality VARCHAR(20),
    effective_date DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mcr.benchmark_cap_rate,
        mcr.typical_cap_rate_low AS cap_rate_range_low,
        mcr.typical_cap_rate_high AS cap_rate_range_high,
        mcr.confidence_score,
        mcr.sample_size,
        mcr.market_condition,
        mcr.yield_trend,
        mcr.data_quality,
        mcr.effective_date
    FROM market_cap_rate_benchmarks mcr
    WHERE mcr.region = p_region
      AND mcr.property_type = p_property_type
      AND (
          mcr.property_subtype = p_property_subtype 
          OR p_property_subtype IS NULL 
          OR mcr.property_subtype IS NULL
      )
      AND mcr.valid_from <= p_as_of_date
      AND (mcr.valid_until IS NULL OR mcr.valid_until >= p_as_of_date)
    ORDER BY 
        CASE WHEN mcr.property_subtype = p_property_subtype THEN 0 ELSE 1 END,
        mcr.effective_date DESC
    LIMIT 1;
    
    -- Return default if no benchmark found
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            0.08::DECIMAL(6,4),   -- Default 8% cap rate
            0.06::DECIMAL(6,4),   -- Low
            0.12::DECIMAL(6,4),   -- High
            0.30::DECIMAL(4,3),   -- Low confidence
            0::INTEGER,           -- No samples
            'unknown'::VARCHAR(30),
            'unknown'::VARCHAR(20),
            'none'::VARCHAR(20),
            CURRENT_DATE;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- SECTION 7: FUNCTION TO CALCULATE NOI FROM INCOME EVIDENCE
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_noi_from_evidence(
    p_property_id UUID,
    p_vacancy_rate DECIMAL(5, 4) DEFAULT NULL,
    p_expense_ratio DECIMAL(5, 4) DEFAULT NULL
)
RETURNS TABLE(
    gross_rent_annual DECIMAL(14, 2),
    effective_gross_income DECIMAL(14, 2),
    operating_expenses DECIMAL(14, 2),
    net_operating_income DECIMAL(14, 2),
    applied_vacancy_rate DECIMAL(5, 4),
    applied_expense_ratio DECIMAL(5, 4),
    evidence_count INTEGER,
    confidence_score DECIMAL(4, 3)
) AS $$
DECLARE
    v_avg_monthly_rent DECIMAL(14, 2);
    v_evidence_count INTEGER;
    v_avg_confidence DECIMAL(4, 3);
    v_vacancy_rate DECIMAL(5, 4);
    v_expense_ratio DECIMAL(5, 4);
BEGIN
    -- Get average monthly rent from income evidence
    SELECT 
        AVG(ie.monthly_rent),
        COUNT(*),
        AVG(ie.confidence_score)
    INTO v_avg_monthly_rent, v_evidence_count, v_avg_confidence
    FROM income_evidence ie
    WHERE ie.property_id = p_property_id
      AND ie.monthly_rent IS NOT NULL
      AND ie.effective_date >= (CURRENT_DATE - INTERVAL '24 months');
    
    -- Use market defaults if no evidence
    IF v_avg_monthly_rent IS NULL THEN
        RETURN QUERY SELECT 
            NULL::DECIMAL(14, 2), NULL::DECIMAL(14, 2), NULL::DECIMAL(14, 2), 
            NULL::DECIMAL(14, 2), NULL::DECIMAL(5, 4), NULL::DECIMAL(5, 4), 
            0::INTEGER, 0::DECIMAL(4, 3);
        RETURN;
    END IF;
    
    -- Apply vacancy rate (use provided or market default)
    v_vacancy_rate := COALESCE(p_vacancy_rate, 0.08); -- 8% default
    v_expense_ratio := COALESCE(p_expense_ratio, 0.35); -- 35% default
    
    RETURN QUERY SELECT
        (v_avg_monthly_rent * 12)::DECIMAL(14, 2) AS gross_rent_annual,
        (v_avg_monthly_rent * 12 * (1 - v_vacancy_rate))::DECIMAL(14, 2) AS effective_gross_income,
        (v_avg_monthly_rent * 12 * (1 - v_vacancy_rate) * v_expense_ratio)::DECIMAL(14, 2) AS operating_expenses,
        (v_avg_monthly_rent * 12 * (1 - v_vacancy_rate) * (1 - v_expense_ratio))::DECIMAL(14, 2) AS net_operating_income,
        v_vacancy_rate AS applied_vacancy_rate,
        v_expense_ratio AS applied_expense_ratio,
        v_evidence_count AS evidence_count,
        v_avg_confidence AS confidence_score;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- SECTION 8: VIEW FOR CAP RATE ANALYSIS
-- =====================================================

CREATE OR REPLACE VIEW property_cap_rate_analysis AS
SELECT 
    p.id AS property_id,
    p.region,
    p.property_type,
    p.transaction_type,
    p.address_street,
    p.address_city,
    p.total_area_sqm,
    
    -- Transaction Value
    COALESCE(p.sold_price, p.transaction_value, p.inferred_sale_price) AS transaction_value,
    p.transaction_date,
    p.evidence_type,
    p.is_transaction_record,
    
    -- Latest Income Data
    pi.gross_potential_rent,
    pi.net_operating_income,
    pi.cap_rate AS derived_cap_rate,
    pi.income_evidence_quality,
    pi.effective_date AS income_effective_date,
    
    -- Market Benchmark
    mcr.benchmark_cap_rate AS market_cap_rate,
    mcr.typical_cap_rate_low,
    mcr.typical_cap_rate_high,
    mcr.market_condition,
    mcr.yield_trend,
    
    -- Cap Rate Variance from Market
    CASE 
        WHEN pi.cap_rate IS NOT NULL AND mcr.benchmark_cap_rate IS NOT NULL 
        THEN pi.cap_rate - mcr.benchmark_cap_rate 
        ELSE NULL 
    END AS cap_rate_variance_from_market
    
FROM properties p
LEFT JOIN LATERAL (
    SELECT * FROM property_income 
    WHERE property_id = p.id 
    ORDER BY effective_date DESC 
    LIMIT 1
) pi ON TRUE
LEFT JOIN LATERAL (
    SELECT * FROM market_cap_rate_benchmarks
    WHERE region = p.region
      AND property_type = p.property_type
      AND valid_until IS NULL
    ORDER BY effective_date DESC
    LIMIT 1
) mcr ON TRUE
WHERE p.transaction_type = 'sale'
  AND p.property_type IS NOT NULL;

COMMENT ON VIEW property_cap_rate_analysis IS 'Combines property transactions with income data and market cap rate benchmarks for analysis';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
