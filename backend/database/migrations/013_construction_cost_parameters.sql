-- Migration: 013_construction_cost_parameters
-- Description: Store all construction cost parameters in the database (no hardcoded values)

-- Quality/Cost multipliers (basic, standard, premium, luxury)
CREATE TABLE IF NOT EXISTS quality_multipliers (
    quality_level VARCHAR(50) PRIMARY KEY,
    multiplier DECIMAL(5, 3) NOT NULL CHECK (multiplier > 0),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial quality multipliers
INSERT INTO quality_multipliers (quality_level, multiplier, description) VALUES
    ('basic', 0.70, 'Basic finish - minimal fixtures, standard materials'),
    ('standard', 1.00, 'Standard finish - average quality fixtures and materials'),
    ('premium', 1.40, 'Premium finish - high-quality fixtures and materials'),
    ('luxury', 2.00, 'Luxury finish - top-tier fixtures and imported materials')
ON CONFLICT (quality_level) DO NOTHING;


-- Regional cost multipliers
CREATE TABLE IF NOT EXISTS region_multipliers (
    region VARCHAR(50) PRIMARY KEY,
    multiplier DECIMAL(5, 3) NOT NULL CHECK (multiplier > 0),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial region multipliers (Ghana regions)
INSERT INTO region_multipliers (region, multiplier, description) VALUES
    ('greater_accra', 1.15, 'Greater Accra - Higher costs due to demand and logistics'),
    ('kumasi_metro', 1.00, 'Kumasi Metro - Base reference for pricing'),
    ('eastern', 0.95, 'Eastern Region - Slightly lower costs'),
    ('western_cluster', 1.05, 'Western Cluster - Moderate premium'),
    ('northern_cluster', 0.90, 'Northern Cluster - Lower costs due to reduced demand')
ON CONFLICT (region) DO NOTHING;


-- Base construction costs per sqm by property type and quality
CREATE TABLE IF NOT EXISTS base_costs_per_sqm (
    id SERIAL PRIMARY KEY,
    property_type VARCHAR(50) NOT NULL,
    quality_level VARCHAR(50) NOT NULL,
    cost_ghs DECIMAL(12, 2) NOT NULL CHECK (cost_ghs > 0),
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (property_type, quality_level)
);

-- Seed initial base costs (GHS per sqm as of 2024/2025)
INSERT INTO base_costs_per_sqm (property_type, quality_level, cost_ghs, notes) VALUES
    ('residential', 'basic', 3500, 'Basic residential - simple finishes'),
    ('residential', 'standard', 5000, 'Standard residential - average quality'),
    ('residential', 'premium', 8000, 'Premium residential - high-end finishes'),
    ('residential', 'luxury', 15000, 'Luxury residential - top-tier materials'),
    ('commercial', 'basic', 4000, 'Basic commercial - shell and core'),
    ('commercial', 'standard', 6500, 'Standard commercial - fitted office'),
    ('commercial', 'premium', 10000, 'Premium commercial - Grade A office'),
    ('industrial', 'basic', 3000, 'Basic industrial - warehouse/factory'),
    ('industrial', 'standard', 4500, 'Standard industrial - with utilities')
ON CONFLICT (property_type, quality_level) DO NOTHING;


-- Cost breakdown percentages (how total cost splits across categories)
CREATE TABLE IF NOT EXISTS cost_breakdown (
    category VARCHAR(50) PRIMARY KEY,
    percentage DECIMAL(5, 4) NOT NULL CHECK (percentage >= 0 AND percentage <= 1),
    display_order INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial cost breakdown
INSERT INTO cost_breakdown (category, percentage, display_order, description) VALUES
    ('materials', 0.55, 1, 'Construction materials - 55%'),
    ('labor', 0.30, 2, 'Labor costs - 30%'),
    ('equipment', 0.05, 3, 'Equipment rental and tools - 5%'),
    ('overheads', 0.07, 4, 'Overheads and profit margin - 7%'),
    ('contingency', 0.03, 5, 'Contingency allowance - 3%')
ON CONFLICT (category) DO NOTHING;


-- Create indexes
CREATE INDEX IF NOT EXISTS idx_base_costs_property_type ON base_costs_per_sqm(property_type);
CREATE INDEX IF NOT EXISTS idx_base_costs_quality_level ON base_costs_per_sqm(quality_level);
