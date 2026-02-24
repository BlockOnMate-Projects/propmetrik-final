-- Corrective migration to fix construction cost indices schema
-- Reconciles differences between migration 008 and 009

-- 1. Fix construction_cost_indices table columns
DO $$ 
BEGIN
    -- Add index_name if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'index_name') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN index_name VARCHAR(100) DEFAULT 'Composite Construction Cost Index';
    END IF;

    -- Add index_value if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'index_value') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN index_value NUMERIC(10,2);
    END IF;

    -- Add base_value if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'base_value') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN base_value NUMERIC(10,2) DEFAULT 100.0;
    END IF;

    -- Add source if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'source') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN source VARCHAR(100);
    END IF;

    -- Add material_index if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'material_index') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN material_index NUMERIC(10,2);
    END IF;

    -- Add labor_index if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'labor_index') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN labor_index NUMERIC(10,2);
    END IF;

    -- Add overall_index if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'overall_index') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN overall_index NUMERIC(10,2);
    END IF;

    -- Add period_start if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'period_start') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN period_start DATE;
    END IF;

    -- Add period_end if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'period_end') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN period_end DATE;
    END IF;

    -- Add methodology if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'methodology') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN methodology TEXT;
    END IF;
    
    -- Add change_from_previous if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'change_from_previous') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN change_from_previous NUMERIC(10,2);
    END IF;

    -- Add change_year_on_year if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'change_year_on_year') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN change_year_on_year NUMERIC(10,2);
    END IF;
    
    -- Ensure components column is JSONB
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'components') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN components JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- Add is_official if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'is_official') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN is_official BOOLEAN DEFAULT false;
    END IF;

    -- Add notes if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'notes') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN notes TEXT;
    END IF;

    -- Add property_type if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'construction_cost_indices' AND column_name = 'property_type') THEN
        ALTER TABLE construction_cost_indices ADD COLUMN property_type VARCHAR(50);
    END IF;

END $$;

-- 2. Create cost_breakdown table if it doesn't exist
CREATE TABLE IF NOT EXISTS cost_breakdown (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50) NOT NULL UNIQUE,
    percentage DECIMAL(5, 2) NOT NULL,
    display_order INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Seed initial cost breakdown weights
INSERT INTO cost_breakdown (category, percentage, display_order, description)
VALUES 
    ('materials', 0.60, 1, 'Construction materials cost'),
    ('labor', 0.30, 2, 'Construction labor cost'),
    ('other', 0.10, 3, 'Equipment, overheads, and contingency'),
    ('cement', 0.15, 10, 'Cement and binding agents'),
    ('steel', 0.12, 11, 'Reinforcement steel and iron rods'),
    ('timber', 0.08, 12, 'Timber and formwork'),
    ('blocks', 0.10, 13, 'Blocks and masonry'),
    ('sand', 0.05, 14, 'Sand'),
    ('gravel', 0.05, 15, 'Gravel and stones'),
    ('roofing', 0.10, 16, 'Roofing and structural support'),
    ('finishing', 0.15, 17, 'Finishing, painting and tiling'),
    ('electrical', 0.10, 18, 'Electrical and networking'),
    ('plumbing', 0.10, 19, 'Plumbing and sanitary works')
ON CONFLICT (category) DO UPDATE SET percentage = EXCLUDED.percentage;

-- 4. Ensure labor_rates has daily_rate_ghs
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'labor_rates' AND column_name = 'daily_rate_ghs') THEN
        ALTER TABLE labor_rates ADD COLUMN daily_rate_ghs NUMERIC(10,2);
    END IF;
END $$;
