-- =====================================================
-- CRM Agents Migration
-- Creates the agents table for real estate agent management
-- =====================================================

-- Create agent status enum
DO $$ BEGIN
    CREATE TYPE agent_status_enum AS ENUM (
        'active',
        'inactive', 
        'suspended',
        'pending_approval'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create agent specialization enum
DO $$ BEGIN
    CREATE TYPE agent_specialization_enum AS ENUM (
        'residential_sales',
        'commercial_sales',
        'residential_rentals',
        'commercial_rentals',
        'land_sales',
        'property_management',
        'investment_advisory',
        'valuation',
        'general'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create agents table
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Personal Information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200),
    email VARCHAR(255) NOT NULL,
    phone_primary VARCHAR(50) NOT NULL,
    phone_secondary VARCHAR(50),
    whatsapp_number VARCHAR(50),
    avatar_url TEXT,
    
    -- Professional Information
    license_number VARCHAR(100),
    license_expiry DATE,
    ghana_real_estate_board_id VARCHAR(100),
    specializations agent_specialization_enum[] DEFAULT ARRAY['general']::agent_specialization_enum[],
    regions_covered VARCHAR(100)[],
    languages VARCHAR(50)[] DEFAULT ARRAY['english'],
    years_experience INTEGER DEFAULT 0,
    bio TEXT,
    
    -- Commission & Compensation
    default_commission_rate DECIMAL(5,2) DEFAULT 3.00,
    commission_split_rate DECIMAL(5,2) DEFAULT 50.00, -- Agent's share of commission
    base_salary DECIMAL(12,2),
    
    -- Performance Metrics (cached, updated periodically)
    total_deals_closed INTEGER DEFAULT 0,
    total_sales_volume DECIMAL(15,2) DEFAULT 0,
    total_commission_earned DECIMAL(12,2) DEFAULT 0,
    average_deal_value DECIMAL(12,2) DEFAULT 0,
    average_days_to_close INTEGER DEFAULT 0,
    current_active_deals INTEGER DEFAULT 0,
    current_active_listings INTEGER DEFAULT 0,
    customer_rating DECIMAL(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    
    -- Status & Management
    status agent_status_enum DEFAULT 'active',
    hire_date DATE DEFAULT CURRENT_DATE,
    termination_date DATE,
    team_id UUID,
    supervisor_id UUID REFERENCES agents(id),
    
    -- System Fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    
    -- Constraints
    CONSTRAINT unique_agent_email_org UNIQUE(organization_id, email)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agents_organization ON agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_email ON agents(email);
CREATE INDEX IF NOT EXISTS idx_agents_deleted ON agents(deleted_at);

-- Create agent teams table
CREATE TABLE IF NOT EXISTS agent_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_name VARCHAR(200) NOT NULL,
    description TEXT,
    team_lead_id UUID REFERENCES agents(id),
    specialization agent_specialization_enum,
    regions_covered VARCHAR(100)[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_team_name_org UNIQUE(organization_id, team_name)
);

-- Create agent performance log for tracking history
CREATE TABLE IF NOT EXISTS agent_performance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    deals_closed INTEGER DEFAULT 0,
    sales_volume DECIMAL(15,2) DEFAULT 0,
    commission_earned DECIMAL(12,2) DEFAULT 0,
    leads_assigned INTEGER DEFAULT 0,
    leads_converted INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    average_response_time_hours DECIMAL(8,2),
    customer_satisfaction_score DECIMAL(3,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_performance_agent ON agent_performance_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_performance_period ON agent_performance_log(period_start, period_end);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agents_updated_at ON agents;
CREATE TRIGGER trigger_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_agents_updated_at();

-- Add agent_id to existing tables if not exists
DO $$
BEGIN
    -- Update deals table to reference agents
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'deals' AND column_name = 'agent_id') THEN
        ALTER TABLE deals ADD COLUMN agent_id UUID REFERENCES agents(id);
    END IF;
    
    -- Create index if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deals_agent') THEN
        CREATE INDEX idx_deals_agent ON deals(agent_id);
    END IF;
    
    -- Update contacts table to have assigned agent
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contacts' AND column_name = 'agent_id') THEN
        ALTER TABLE contacts ADD COLUMN agent_id UUID REFERENCES agents(id);
    END IF;
    
    -- Create index if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_contacts_agent') THEN
        CREATE INDEX idx_contacts_agent ON contacts(agent_id);
    END IF;
END $$;

-- Insert sample agents for testing
INSERT INTO agents (
    organization_id,
    first_name,
    last_name,
    display_name,
    email,
    phone_primary,
    whatsapp_number,
    license_number,
    specializations,
    regions_covered,
    years_experience,
    bio,
    default_commission_rate,
    status
)
SELECT 
    o.id,
    agent.first_name,
    agent.last_name,
    agent.first_name || ' ' || agent.last_name,
    agent.email,
    agent.phone,
    agent.phone,
    agent.license,
    agent.specs::agent_specialization_enum[],
    agent.regions,
    agent.years,
    agent.bio,
    agent.commission,
    'active'::agent_status_enum
FROM organizations o,
(VALUES 
    ('Kwame', 'Mensah', 'kwame.mensah@ghanaprime.com', '+233244123456', 'GRE-2020-001', ARRAY['residential_sales', 'land_sales'], ARRAY['Greater Accra', 'Ashanti'], 8, 'Experienced residential sales agent specializing in luxury properties in Accra', 3.5),
    ('Ama', 'Asante', 'ama.asante@ghanaprime.com', '+233244234567', 'GRE-2021-015', ARRAY['commercial_sales', 'investment_advisory'], ARRAY['Greater Accra'], 5, 'Commercial real estate specialist with focus on office and retail spaces', 4.0),
    ('Kofi', 'Owusu', 'kofi.owusu@ghanaprime.com', '+233244345678', 'GRE-2019-008', ARRAY['residential_rentals', 'property_management'], ARRAY['Greater Accra', 'Central'], 10, 'Property management expert with extensive rental portfolio', 3.0),
    ('Abena', 'Darkwa', 'abena.darkwa@ghanaprime.com', '+233244456789', 'GRE-2022-023', ARRAY['residential_sales'], ARRAY['Greater Accra', 'Eastern'], 3, 'Rising star in residential sales, known for excellent client relationships', 3.0),
    ('Yaw', 'Boateng', 'yaw.boateng@ghanaprime.com', '+233244567890', 'GRE-2018-005', ARRAY['land_sales', 'valuation'], ARRAY['Ashanti', 'Brong-Ahafo'], 12, 'Land specialist with deep knowledge of title verification and due diligence', 4.5)
) AS agent(first_name, last_name, email, phone, license, specs, regions, years, bio, commission)
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE email = agent.email)
LIMIT 5;

-- Grant appropriate permissions
COMMENT ON TABLE agents IS 'Real estate agents working for the organization';
COMMENT ON TABLE agent_teams IS 'Teams of agents for organizational purposes';
COMMENT ON TABLE agent_performance_log IS 'Historical performance tracking for agents';
