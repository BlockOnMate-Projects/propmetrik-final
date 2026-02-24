-- ============================================================================
-- Migration 100: Site Operations Consolidation
-- 
-- Phase 2.2: Consolidate daily log tables and create petty cash ledger
-- 
-- This migration:
-- 1. Renames daily_logs to project_daily_logs for consistency
-- 2. Adds missing columns for SiteOperationsService
-- 3. Creates project_petty_cash_ledger for Ghana "chop money" tracking
-- 4. Creates backward-compatible view for daily_logs
-- 5. Fixes the "indecents_or_delays" typo to "incidents_or_delays"
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RENAME DAILY_LOGS TO PROJECT_DAILY_LOGS
-- ----------------------------------------------------------------------------

-- First, check if the rename is needed (table exists as daily_logs)
DO $$
BEGIN
    -- If daily_logs exists but project_daily_logs doesn't, rename it
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_logs')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_daily_logs')
    THEN
        ALTER TABLE daily_logs RENAME TO project_daily_logs;
        RAISE NOTICE 'Renamed daily_logs to project_daily_logs';
    END IF;
END $$;

-- If project_daily_logs doesn't exist, create it fresh
CREATE TABLE IF NOT EXISTS project_daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    
    -- Date
    log_date DATE NOT NULL,
    
    -- Weather
    weather VARCHAR(50) DEFAULT 'sunny',
    weather_morning VARCHAR(50),
    weather_afternoon VARCHAR(50),
    temperature_high INTEGER,
    temperature_low INTEGER,
    weather_notes TEXT,
    
    -- Manpower
    workers_on_site INTEGER DEFAULT 0,
    informal_labor_count INTEGER DEFAULT 0,
    informal_labor_notes TEXT,
    labor_details JSONB DEFAULT '[]'::jsonb,
    subcontractors_on_site JSONB DEFAULT '[]'::jsonb,
    
    -- Work performed
    activities JSONB DEFAULT '[]'::jsonb,
    work_performed TEXT,
    work_summary TEXT,
    planned_work TEXT,
    work_areas JSONB DEFAULT '[]'::jsonb,
    
    -- Issues/Delays
    delays JSONB DEFAULT '[]'::jsonb,
    issues JSONB DEFAULT '[]'::jsonb,
    incidents_or_delays TEXT,  -- FIXED typo
    delay_hours DECIMAL(5, 2) DEFAULT 0,
    delay_reasons TEXT,
    
    -- Safety
    safety_incidents INTEGER DEFAULT 0,
    safety_notes TEXT,
    safety_observations TEXT,
    
    -- Materials
    materials_delivered JSONB DEFAULT '[]'::jsonb,
    materials_used JSONB DEFAULT '[]'::jsonb,
    
    -- Equipment
    equipment_on_site JSONB DEFAULT '[]'::jsonb,
    
    -- Visitors
    visitors JSONB DEFAULT '[]'::jsonb,
    
    -- Photos
    photos JSONB DEFAULT '[]'::jsonb,
    photo_ids JSONB DEFAULT '[]'::jsonb,
    
    -- Submission
    submitted_by UUID,
    submission_source VARCHAR(20) DEFAULT 'web',
    is_submitted BOOLEAN DEFAULT false,
    submitted_at TIMESTAMP WITH TIME ZONE,
    
    -- Approval
    is_approved BOOLEAN DEFAULT false,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_work_day BOOLEAN DEFAULT true,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_project_log_per_date UNIQUE (project_id, log_date)
);

-- ----------------------------------------------------------------------------
-- 2. ADD MISSING COLUMNS IF TABLE EXISTED AND WAS RENAMED
-- ----------------------------------------------------------------------------

-- Add new columns that might be missing from old daily_logs
DO $$
BEGIN
    -- weather (single field)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'weather') THEN
        ALTER TABLE project_daily_logs ADD COLUMN weather VARCHAR(50) DEFAULT 'sunny';
    END IF;
    
    -- workers_on_site (rename from total_workers if exists)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'workers_on_site') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'total_workers') THEN
            ALTER TABLE project_daily_logs RENAME COLUMN total_workers TO workers_on_site;
        ELSE
            ALTER TABLE project_daily_logs ADD COLUMN workers_on_site INTEGER DEFAULT 0;
        END IF;
    END IF;
    
    -- informal_labor_count
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'informal_labor_count') THEN
        ALTER TABLE project_daily_logs ADD COLUMN informal_labor_count INTEGER DEFAULT 0;
    END IF;
    
    -- informal_labor_notes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'informal_labor_notes') THEN
        ALTER TABLE project_daily_logs ADD COLUMN informal_labor_notes TEXT;
    END IF;
    
    -- labor_details
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'labor_details') THEN
        ALTER TABLE project_daily_logs ADD COLUMN labor_details JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- subcontractors_on_site
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'subcontractors_on_site') THEN
        ALTER TABLE project_daily_logs ADD COLUMN subcontractors_on_site JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- activities
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'activities') THEN
        ALTER TABLE project_daily_logs ADD COLUMN activities JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- work_performed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'work_performed') THEN
        ALTER TABLE project_daily_logs ADD COLUMN work_performed TEXT;
    END IF;
    
    -- planned_work
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'planned_work') THEN
        ALTER TABLE project_daily_logs ADD COLUMN planned_work TEXT;
    END IF;
    
    -- delays
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'delays') THEN
        ALTER TABLE project_daily_logs ADD COLUMN delays JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- incidents_or_delays (FIXED typo)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'incidents_or_delays') THEN
        ALTER TABLE project_daily_logs ADD COLUMN incidents_or_delays TEXT;
    END IF;
    
    -- safety_observations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'safety_observations') THEN
        ALTER TABLE project_daily_logs ADD COLUMN safety_observations TEXT;
    END IF;
    
    -- materials_used
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'materials_used') THEN
        ALTER TABLE project_daily_logs ADD COLUMN materials_used JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- photo_ids
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'photo_ids') THEN
        ALTER TABLE project_daily_logs ADD COLUMN photo_ids JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- submission_source
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'submission_source') THEN
        ALTER TABLE project_daily_logs ADD COLUMN submission_source VARCHAR(20) DEFAULT 'web';
    END IF;
    
    -- is_approved
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'is_approved') THEN
        ALTER TABLE project_daily_logs ADD COLUMN is_approved BOOLEAN DEFAULT false;
    END IF;
    
    -- approved_by
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'approved_by') THEN
        ALTER TABLE project_daily_logs ADD COLUMN approved_by UUID;
    END IF;
    
    -- approved_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'approved_at') THEN
        ALTER TABLE project_daily_logs ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- temperature_high (rename from temperature_morning if exists)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'temperature_high') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'temperature_morning') THEN
            ALTER TABLE project_daily_logs ADD COLUMN temperature_high INTEGER;
            UPDATE project_daily_logs SET temperature_high = temperature_morning WHERE temperature_high IS NULL;
        ELSE
            ALTER TABLE project_daily_logs ADD COLUMN temperature_high INTEGER;
        END IF;
    END IF;
    
    -- temperature_low (rename from temperature_afternoon if exists)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'temperature_low') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_daily_logs' AND column_name = 'temperature_afternoon') THEN
            ALTER TABLE project_daily_logs ADD COLUMN temperature_low INTEGER;
            UPDATE project_daily_logs SET temperature_low = temperature_afternoon WHERE temperature_low IS NULL;
        ELSE
            ALTER TABLE project_daily_logs ADD COLUMN temperature_low INTEGER;
        END IF;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. CREATE BACKWARD-COMPATIBLE VIEW FOR OLD CODE
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW daily_logs AS
SELECT 
    id,
    project_id,
    organization_id,
    log_date,
    weather AS weather_condition,
    weather_morning,
    weather_afternoon,
    COALESCE(temperature_high, temperature_low) AS temperature_celsius,
    temperature_high AS temperature_morning,
    temperature_low AS temperature_afternoon,
    weather_notes,
    workers_on_site AS total_workers,
    workers_on_site AS labor_count,
    labor_details AS workers_by_trade,
    informal_labor_count,
    informal_labor_notes,
    work_performed AS work_summary,
    work_areas,
    equipment_on_site,
    materials_delivered,
    safety_incidents,
    safety_notes,
    visitors,
    photos,
    issues,
    delay_hours,
    delay_reasons,
    incidents_or_delays,
    incidents_or_delays AS indecents_or_delays, -- Support old typo
    is_work_day,
    is_submitted,
    submitted_at,
    submitted_by,
    notes,
    created_by,
    updated_by,
    created_at,
    updated_at
FROM project_daily_logs;

-- ----------------------------------------------------------------------------
-- 4. CREATE PETTY CASH LEDGER (GHANA "CHOP MONEY")
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_petty_cash_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
    organization_id UUID,
    
    -- Amount
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'GHS',
    
    -- Recipient
    recipient_name VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(20),
    recipient_id_type VARCHAR(50), -- 'ghana_card', 'voter_id', 'driver_license'
    recipient_id_number VARCHAR(50),
    
    -- Category
    category VARCHAR(50) NOT NULL,
    -- 'transport', 'food', 'tips', 'airtime', 'misc', 'materials', 'labor', 'utilities'
    
    -- Description
    description TEXT,
    purpose TEXT,
    
    -- Approval workflow
    requested_by UUID,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_by UUID,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    -- 'pending', 'approved', 'rejected', 'disbursed', 'cancelled'
    
    -- Disbursement
    disbursed_by UUID,
    disbursed_at TIMESTAMP WITH TIME ZONE,
    payment_method VARCHAR(50), -- 'cash', 'mobile_money', 'bank_transfer'
    payment_reference VARCHAR(100),
    
    -- Documentation
    receipt_url TEXT,
    receipt_uploaded_at TIMESTAMP WITH TIME ZONE,
    
    -- Daily log link (if associated with a log)
    daily_log_id UUID REFERENCES project_daily_logs(id) ON DELETE SET NULL,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. CREATE INDEXES
-- ----------------------------------------------------------------------------

-- Project daily logs indexes
CREATE INDEX IF NOT EXISTS idx_project_daily_logs_project_id 
    ON project_daily_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_daily_logs_log_date 
    ON project_daily_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_project_daily_logs_project_date 
    ON project_daily_logs(project_id, log_date);
CREATE INDEX IF NOT EXISTS idx_project_daily_logs_submitted_by 
    ON project_daily_logs(submitted_by);
CREATE INDEX IF NOT EXISTS idx_project_daily_logs_organization 
    ON project_daily_logs(organization_id);

-- Petty cash indexes
CREATE INDEX IF NOT EXISTS idx_petty_cash_project_id 
    ON project_petty_cash_ledger(project_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_status 
    ON project_petty_cash_ledger(status);
CREATE INDEX IF NOT EXISTS idx_petty_cash_category 
    ON project_petty_cash_ledger(category);
CREATE INDEX IF NOT EXISTS idx_petty_cash_requested_by 
    ON project_petty_cash_ledger(requested_by);
CREATE INDEX IF NOT EXISTS idx_petty_cash_created_at 
    ON project_petty_cash_ledger(created_at);

-- ----------------------------------------------------------------------------
-- 6. COMMENTS
-- ----------------------------------------------------------------------------

COMMENT ON TABLE project_daily_logs IS 
    'Unified daily site log/diary table - consolidates dailyLogService, siteDiaryService, constructionOpsService';

COMMENT ON TABLE project_petty_cash_ledger IS 
    'Ghana "chop money" tracking - petty cash for transport, food, tips, airtime, etc.';

COMMENT ON VIEW daily_logs IS 
    'Backward-compatible view for old code that references daily_logs table';
