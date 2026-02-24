-- 085_construction_gaps.sql

-- 1. SITE DIARIES (Daily Logs including Informal Labor)
CREATE TABLE IF NOT EXISTS project_site_diaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  
  -- Weather & Site Conditions
  weather_condition VARCHAR(50), -- 'sunny', 'rainy', 'cloudy'
  temperature_celsius DECIMAL(4, 1),
  
  -- Informal Labor Tracking (The "Gap")
  informal_labor_count INTEGER DEFAULT 0,
  informal_labor_notes TEXT,
  
  -- Progress & Issues
  work_performed TEXT,
  indecents_or_delays TEXT,
  
  -- Metadata
  submission_source VARCHAR(50) DEFAULT 'web', -- 'web', 'whatsapp', 'mobile_app'
  submitted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, report_date)
);

-- 2. MATERIAL PRICE INTELLIGENCE (Market Tracking)
-- REMOVED: Utilizing existing 'material_prices' table in Data Hub schema (023_scraper_compatible_schema.sql)
-- for integration with LocalMaterialScraper.

-- 3. PETTY CASH LEDGER ("Chop Money")
CREATE TABLE IF NOT EXISTS project_petty_cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
  
  -- Transaction Details
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'GHS',
  recipient_name VARCHAR(255), -- 'Kojo Driver', 'Food Vendor'
  
  -- Classification
  category VARCHAR(50) NOT NULL, -- 'transport', 'food', 'tips', 'airtime', 'misc'
  description TEXT,
  
  -- Approval & Audit
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'paid'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add notification triggers tracking (if needed for WhatsApp)
CREATE TABLE IF NOT EXISTS project_notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id),
  recipient_phone VARCHAR(20),
  message_type VARCHAR(50), -- 'daily_summary', 'price_alert', 'petty_cash_approval'
  status VARCHAR(20), -- 'sent', 'failed'
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
