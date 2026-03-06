-- Migration: 123_pm_production_enhancements
-- Production ready enhancements for Property Management
-- - Vendor SLA tracking tables
-- - Regional pricing data tables
-- - Tenant scoring tables
-- - Performance optimization indexes

-- ============================================================================
-- VENDOR SLA TABLES
-- ============================================================================

-- Vendor SLA definitions
CREATE TABLE IF NOT EXISTS pm_vendor_slas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('emergency', 'urgent', 'normal', 'low')),
    response_time_hours DECIMAL(6,2) NOT NULL DEFAULT 24,
    resolution_time_hours DECIMAL(6,2) NOT NULL DEFAULT 72,
    penalty_percentage DECIMAL(5,2) NOT NULL DEFAULT 2.0,
    bonus_percentage DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(vendor_id, category, priority, effective_from)
);

-- SLA breach records
CREATE TABLE IF NOT EXISTS pm_sla_breaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id UUID NOT NULL REFERENCES maintenance_work_orders(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    sla_id UUID REFERENCES pm_vendor_slas(id),
    breach_type VARCHAR(20) NOT NULL CHECK (breach_type IN ('response', 'resolution')),
    expected_time TIMESTAMPTZ NOT NULL,
    actual_time TIMESTAMPTZ,
    delay_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
    penalty_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'acknowledged', 'waived', 'applied')),
    notes TEXT,
    acknowledged_by UUID,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vendor ratings (for performance tracking)
CREATE TABLE IF NOT EXISTS pm_vendor_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    work_order_id UUID REFERENCES maintenance_work_orders(id),
    rated_by UUID NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5),
    timeliness_rating INTEGER CHECK (timeliness_rating BETWEEN 1 AND 5),
    communication_rating INTEGER CHECK (communication_rating BETWEEN 1 AND 5),
    value_rating INTEGER CHECK (value_rating BETWEEN 1 AND 5),
    comment TEXT,
    is_tenant_review BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add reopen_count to work orders if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'maintenance_work_orders' AND column_name = 'reopen_count'
    ) THEN
        ALTER TABLE maintenance_work_orders ADD COLUMN reopen_count INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- ============================================================================
-- REGIONAL PRICING TABLES
-- ============================================================================

-- Regional market data
CREATE TABLE IF NOT EXISTS pm_regional_market_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region VARCHAR(50) NOT NULL,
    property_type VARCHAR(30) NOT NULL,
    unit_type VARCHAR(30) NOT NULL,
    min_rent DECIMAL(12,2) NOT NULL,
    max_rent DECIMAL(12,2) NOT NULL,
    average_rent DECIMAL(12,2) NOT NULL,
    median_rent DECIMAL(12,2) NOT NULL,
    price_per_sqm DECIMAL(10,2),
    sample_size INTEGER NOT NULL DEFAULT 0,
    yoy_change DECIMAL(5,2) DEFAULT 0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(region, property_type, unit_type)
);

-- Location quality factors
CREATE TABLE IF NOT EXISTS pm_location_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    region VARCHAR(50) NOT NULL,
    district VARCHAR(100),
    neighborhood VARCHAR(100),
    quality_score DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    amenity_score DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    security_score DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    accessibility_score DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    notes TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(region, district, neighborhood)
);

-- Rent adjustments history
CREATE TABLE IF NOT EXISTS pm_rent_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    old_rent DECIMAL(12,2) NOT NULL,
    new_rent DECIMAL(12,2) NOT NULL,
    adjustment_type VARCHAR(30) NOT NULL,
    effective_date DATE NOT NULL,
    reason TEXT,
    bulk_increase_id UUID,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bulk rent increases
CREATE TABLE IF NOT EXISTS pm_bulk_rent_increases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    property_ids UUID[] NOT NULL,
    increase_type VARCHAR(30) NOT NULL CHECK (increase_type IN ('percentage', 'fixed', 'market_adjustment')),
    increase_value DECIMAL(8,2) NOT NULL,
    effective_date DATE NOT NULL,
    affected_units INTEGER NOT NULL DEFAULT 0,
    total_current_rent DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_new_rent DECIMAL(14,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'applied', 'cancelled')),
    created_by UUID,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TENANT SCORING TABLES
-- ============================================================================

-- Tenant screening data
CREATE TABLE IF NOT EXISTS pm_tenant_screening (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Identity
    id_type VARCHAR(30),
    id_number VARCHAR(50),
    id_verified BOOLEAN NOT NULL DEFAULT false,
    id_verified_at TIMESTAMPTZ,
    id_verified_by UUID,
    
    -- Employment
    employment_status VARCHAR(30),
    employer_name VARCHAR(200),
    job_title VARCHAR(100),
    monthly_income DECIMAL(12,2),
    employment_duration_months INTEGER,
    income_verified BOOLEAN NOT NULL DEFAULT false,
    income_verified_at TIMESTAMPTZ,
    
    -- Financial
    bank_statement_provided BOOLEAN NOT NULL DEFAULT false,
    average_bank_balance DECIMAL(14,2),
    mobile_money_usage BOOLEAN,
    
    -- Rental history
    previous_addresses JSONB DEFAULT '[]'::jsonb,
    
    -- References
    personal_references JSONB DEFAULT '[]'::jsonb,
    employer_reference JSONB,
    previous_landlord_reference JSONB,
    
    -- Metadata
    screening_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    screening_completed BOOLEAN NOT NULL DEFAULT false,
    screening_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(tenant_id)
);

-- Tenant scores
CREATE TABLE IF NOT EXISTS pm_tenant_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'very_high')),
    recommendation VARCHAR(30) NOT NULL 
        CHECK (recommendation IN ('approve', 'approve_with_conditions', 'decline', 'manual_review')),
    score_breakdown JSONB NOT NULL,
    risk_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
    conditions JSONB DEFAULT '[]'::jsonb,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    
    UNIQUE(tenant_id)
);

-- Tenant score history (for trend analysis)
CREATE TABLE IF NOT EXISTS pm_tenant_score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    overall_score INTEGER NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    score_breakdown JSONB NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- ============================================================================

-- Vendor SLA indexes
CREATE INDEX IF NOT EXISTS idx_pm_vendor_slas_vendor_active 
    ON pm_vendor_slas(vendor_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pm_vendor_slas_category_priority 
    ON pm_vendor_slas(category, priority);

-- SLA breach indexes
CREATE INDEX IF NOT EXISTS idx_pm_sla_breaches_vendor_status 
    ON pm_sla_breaches(vendor_id, status);

CREATE INDEX IF NOT EXISTS idx_pm_sla_breaches_work_order 
    ON pm_sla_breaches(work_order_id);

CREATE INDEX IF NOT EXISTS idx_pm_sla_breaches_created 
    ON pm_sla_breaches(created_at DESC);

-- Vendor rating indexes
CREATE INDEX IF NOT EXISTS idx_pm_vendor_ratings_vendor 
    ON pm_vendor_ratings(vendor_id);

CREATE INDEX IF NOT EXISTS idx_pm_vendor_ratings_work_order 
    ON pm_vendor_ratings(work_order_id);

-- Regional market data indexes
CREATE INDEX IF NOT EXISTS idx_pm_regional_market_region_type 
    ON pm_regional_market_data(region, property_type, unit_type);

-- Location factors indexes
CREATE INDEX IF NOT EXISTS idx_pm_location_factors_region 
    ON pm_location_factors(region, district);

-- Rent adjustment indexes
CREATE INDEX IF NOT EXISTS idx_pm_rent_adjustments_tenancy 
    ON pm_rent_adjustments(tenancy_id);

CREATE INDEX IF NOT EXISTS idx_pm_rent_adjustments_effective 
    ON pm_rent_adjustments(effective_date);

-- Bulk increase indexes
CREATE INDEX IF NOT EXISTS idx_pm_bulk_increases_org_status 
    ON pm_bulk_rent_increases(organization_id, status);

-- Tenant screening indexes
CREATE INDEX IF NOT EXISTS idx_pm_tenant_screening_tenant 
    ON pm_tenant_screening(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pm_tenant_screening_verified 
    ON pm_tenant_screening(id_verified, income_verified);

-- Tenant score indexes
CREATE INDEX IF NOT EXISTS idx_pm_tenant_scores_tenant 
    ON pm_tenant_scores(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pm_tenant_scores_risk 
    ON pm_tenant_scores(risk_level, overall_score);

CREATE INDEX IF NOT EXISTS idx_pm_tenant_scores_valid 
    ON pm_tenant_scores(valid_until);

CREATE INDEX IF NOT EXISTS idx_pm_tenant_score_history_tenant 
    ON pm_tenant_score_history(tenant_id, calculated_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update vendor average rating on new rating
CREATE OR REPLACE FUNCTION update_vendor_average_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vendors
    SET 
        average_rating = (
            SELECT AVG(rating)::DECIMAL(3,2)
            FROM pm_vendor_ratings
            WHERE vendor_id = NEW.vendor_id
        ),
        total_jobs_completed = (
            SELECT COUNT(DISTINCT work_order_id)
            FROM pm_vendor_ratings
            WHERE vendor_id = NEW.vendor_id
        ),
        updated_at = NOW()
    WHERE id = NEW.vendor_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_vendor_rating ON pm_vendor_ratings;
CREATE TRIGGER trg_update_vendor_rating
    AFTER INSERT OR UPDATE ON pm_vendor_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_vendor_average_rating();

-- Archive tenant score on update
CREATE OR REPLACE FUNCTION archive_tenant_score()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.overall_score IS NOT NULL THEN
        INSERT INTO pm_tenant_score_history (
            tenant_id, overall_score, risk_level, score_breakdown, calculated_at
        ) VALUES (
            OLD.tenant_id, OLD.overall_score, OLD.risk_level, 
            OLD.score_breakdown, OLD.calculated_at
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_archive_tenant_score ON pm_tenant_scores;
CREATE TRIGGER trg_archive_tenant_score
    BEFORE UPDATE ON pm_tenant_scores
    FOR EACH ROW
    EXECUTE FUNCTION archive_tenant_score();

-- ============================================================================
-- SEED DATA: Ghana location factors for major areas
-- ============================================================================

INSERT INTO pm_location_factors (name, region, district, neighborhood, quality_score, amenity_score, security_score, accessibility_score)
VALUES
    -- Greater Accra - Premium
    ('Airport Residential Area', 'greater_accra', 'Accra Metropolitan', 'Airport Residential', 1.50, 1.45, 1.50, 1.40),
    ('Cantonments', 'greater_accra', 'Accra Metropolitan', 'Cantonments', 1.45, 1.40, 1.45, 1.35),
    ('Ridge', 'greater_accra', 'Accra Metropolitan', 'Ridge', 1.40, 1.35, 1.40, 1.30),
    ('East Legon', 'greater_accra', 'Accra Metropolitan', 'East Legon', 1.35, 1.30, 1.35, 1.25),
    ('Labone', 'greater_accra', 'Accra Metropolitan', 'Labone', 1.30, 1.25, 1.30, 1.25),
    
    -- Greater Accra - Upper Middle
    ('Osu', 'greater_accra', 'Accra Metropolitan', 'Osu', 1.25, 1.30, 1.20, 1.30),
    ('Dzorwulu', 'greater_accra', 'Accra Metropolitan', 'Dzorwulu', 1.20, 1.20, 1.25, 1.20),
    ('Roman Ridge', 'greater_accra', 'Accra Metropolitan', 'Roman Ridge', 1.20, 1.15, 1.25, 1.15),
    ('Spintex', 'greater_accra', 'La-Nkwantanang Madina', 'Spintex', 1.15, 1.20, 1.15, 1.25),
    ('Tema Community 25', 'greater_accra', 'Tema Metropolitan', 'Community 25', 1.10, 1.10, 1.15, 1.10),
    
    -- Greater Accra - Middle
    ('Dansoman', 'greater_accra', 'Ablekuma West', 'Dansoman', 1.00, 1.00, 1.00, 1.05),
    ('Achimota', 'greater_accra', 'Accra Metropolitan', 'Achimota', 1.00, 0.95, 1.00, 1.10),
    ('Tesano', 'greater_accra', 'Accra Metropolitan', 'Tesano', 1.00, 0.95, 1.00, 1.00),
    ('Adenta', 'greater_accra', 'Adenta Municipal', 'Adenta', 0.95, 0.90, 0.95, 1.00),
    ('Madina', 'greater_accra', 'La-Nkwantanang Madina', 'Madina', 0.95, 0.90, 0.90, 1.00),
    
    -- Greater Accra - Value
    ('Kasoa', 'greater_accra', 'Awutu Senya East', 'Kasoa', 0.80, 0.75, 0.80, 0.85),
    ('Ashaiman', 'greater_accra', 'Ashaiman Municipal', 'Ashaiman', 0.75, 0.70, 0.75, 0.80),
    ('Tema New Town', 'greater_accra', 'Tema Metropolitan', 'Tema New Town', 0.70, 0.65, 0.75, 0.80),
    
    -- Ashanti Region
    ('Kumasi Ahodwo', 'ashanti', 'Kumasi Metropolitan', 'Ahodwo', 1.25, 1.20, 1.20, 1.15),
    ('Kumasi Airport Area', 'ashanti', 'Kumasi Metropolitan', 'Airport Area', 1.20, 1.15, 1.20, 1.10),
    ('Kumasi Nhyiaeso', 'ashanti', 'Nhyiaeso', 'Nhyiaeso', 1.10, 1.05, 1.10, 1.05),
    ('Kumasi Adum', 'ashanti', 'Kumasi Metropolitan', 'Adum', 1.05, 1.10, 1.00, 1.15),
    ('Kumasi Asokwa', 'ashanti', 'Asokwa', 'Asokwa', 0.95, 0.90, 0.95, 1.00),
    
    -- Western Region
    ('Takoradi Beach Road', 'western', 'Sekondi-Takoradi', 'Beach Road', 1.20, 1.15, 1.15, 1.10),
    ('Takoradi Airport Ridge', 'western', 'Sekondi-Takoradi', 'Airport Ridge', 1.15, 1.10, 1.15, 1.05),
    ('Sekondi', 'western', 'Sekondi-Takoradi', 'Sekondi', 0.90, 0.85, 0.90, 0.95)
ON CONFLICT (region, district, neighborhood) DO UPDATE SET
    quality_score = EXCLUDED.quality_score,
    amenity_score = EXCLUDED.amenity_score,
    security_score = EXCLUDED.security_score,
    accessibility_score = EXCLUDED.accessibility_score,
    last_updated = NOW();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE pm_vendor_slas IS 'Vendor Service Level Agreement definitions with response and resolution time requirements';
COMMENT ON TABLE pm_sla_breaches IS 'Records of SLA violations with penalty tracking';
COMMENT ON TABLE pm_vendor_ratings IS 'Multi-dimensional vendor ratings for performance scoring';
COMMENT ON TABLE pm_regional_market_data IS 'Market rent data by region, property type, and unit type for pricing recommendations';
COMMENT ON TABLE pm_location_factors IS 'Location quality multipliers for rent pricing';
COMMENT ON TABLE pm_rent_adjustments IS 'History of rent changes for each tenancy';
COMMENT ON TABLE pm_bulk_rent_increases IS 'Bulk rent increase operations for portfolio-wide adjustments';
COMMENT ON TABLE pm_tenant_screening IS 'Comprehensive tenant screening data for scoring';
COMMENT ON TABLE pm_tenant_scores IS 'Current tenant risk scores and recommendations';
COMMENT ON TABLE pm_tenant_score_history IS 'Historical tenant scores for trend analysis';
