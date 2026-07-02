-- ============================================================================
-- Migration 261: GSS StatsBank Macro Data Tables (Slice 1)
--
-- Creates the six time-series tables populated by the new GSS PxWeb scrapers:
--   gssPpiService    → gss_ppi_construction_series, gss_iip_monthly
--   gssMiegService   → gss_mieg_monthly, gss_quarterly_gdp
--   gssFinancialService → gss_interest_rates_monthly, gss_financial_soundness_monthly
--
-- All tables use (series_code, period_date) as the natural unique key so that
-- re-running a sync is always idempotent (ON CONFLICT DO UPDATE).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Producer Price Index — Construction & All Industries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_ppi_construction_series (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_date     DATE        NOT NULL,                  -- first day of month (2024-01-01)
  series_code     TEXT        NOT NULL,                  -- 'Construction' | 'Manufacturing' | 'All industries'
  ppi_index       NUMERIC(10,4),                         -- PPI index value (base 100)
  change_mom_pct  NUMERIC(8,4),                          -- month-on-month change %
  change_yoy_pct  NUMERIC(8,4),                          -- year-on-year change %
  source_month    TEXT        NOT NULL,                  -- GSS Month code e.g. '2026M04'
  source_updated_at TIMESTAMPTZ,                         -- when GSS last updated this table
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (series_code, period_date)
);

CREATE INDEX IF NOT EXISTS idx_gss_ppi_series_period
  ON gss_ppi_construction_series (series_code, period_date DESC);

-- ---------------------------------------------------------------------------
-- 2. Index of Industrial Production — monthly
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_iip_monthly (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_date     DATE        NOT NULL,
  industry_sector TEXT        NOT NULL,                  -- 'All industries', 'Manufacturing', etc.
  iip_index       NUMERIC(10,4),
  change_mom_pct  NUMERIC(8,4),
  change_yoy_pct  NUMERIC(8,4),
  source_month    TEXT        NOT NULL,
  source_updated_at TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (industry_sector, period_date)
);

CREATE INDEX IF NOT EXISTS idx_gss_iip_sector_period
  ON gss_iip_monthly (industry_sector, period_date DESC);

-- ---------------------------------------------------------------------------
-- 3. Monthly Indicator of Economic Growth (MIEG)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_mieg_monthly (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_date     DATE        NOT NULL,                  -- first day of reported month
  variable        TEXT        NOT NULL,                  -- 'Total_MIEG' | 'Agriculture_MIEG' | 'Industry_MIEG' | 'Services_MIEG'
  index_value     NUMERIC(10,4),                         -- MIEG Index Value (2023=100)
  growth_yoy_pct  NUMERIC(8,4),                          -- Year-on-year growth %
  source_label    TEXT        NOT NULL,                  -- GSS label e.g. 'Mar-26'
  source_updated_at TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (variable, period_date)
);

CREATE INDEX IF NOT EXISTS idx_gss_mieg_variable_period
  ON gss_mieg_monthly (variable, period_date DESC);

-- ---------------------------------------------------------------------------
-- 4. Quarterly GDP — Production approach
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_quarterly_gdp (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_date     DATE        NOT NULL,                  -- first day of quarter (2026-01-01 for Q1 2026)
  quarter_label   TEXT        NOT NULL,                  -- '2026Q1'
  sector          TEXT        NOT NULL,                  -- 'Agriculture' | 'Industry' | 'Services' | 'Total GDP'
  gdp_value       NUMERIC(16,4),                         -- GHS millions, constant prices
  growth_yoy_pct  NUMERIC(8,4),
  approach        TEXT        NOT NULL DEFAULT 'production', -- 'production' | 'expenditure'
  source_updated_at TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sector, period_date, approach)
);

CREATE INDEX IF NOT EXISTS idx_gss_gdp_sector_period
  ON gss_quarterly_gdp (sector, period_date DESC);

-- ---------------------------------------------------------------------------
-- 5. Interest Rates — monthly (Bank of Ghana / GSS StatsBank)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_interest_rates_monthly (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_date     DATE        NOT NULL,
  rate_type       TEXT        NOT NULL,                  -- 'Average lending rate' | 'Monetary policy rate' | 'Treasury bill rate (91-day)' | 'Interbank weighted average rate' | 'Ghana reference rate' | 'Savings deposits rate'
  rate_pct        NUMERIC(8,4) NOT NULL,                 -- percent per annum
  source_month    TEXT        NOT NULL,                  -- e.g. '2024M07'
  source_updated_at TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rate_type, period_date)
);

CREATE INDEX IF NOT EXISTS idx_gss_interest_rate_type_period
  ON gss_interest_rates_monthly (rate_type, period_date DESC);

-- ---------------------------------------------------------------------------
-- 6. Financial Soundness Indicators — monthly (Banking sector health)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_financial_soundness_monthly (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_date     DATE        NOT NULL,
  indicator       TEXT        NOT NULL,                  -- 'Non performing loan ratio' | 'Capital adequacy ratio' | 'Return on assets' | 'Return on equity' | 'Operational cost/income' | 'Core liquid assets to total assets' | 'Core liquid assets to short-term liabilities' | 'Total cost to gross income ratio'
  value_pct       NUMERIC(10,4) NOT NULL,                -- percent
  source_month    TEXT        NOT NULL,
  source_updated_at TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (indicator, period_date)
);

CREATE INDEX IF NOT EXISTS idx_gss_financial_soundness_indicator_period
  ON gss_financial_soundness_monthly (indicator, period_date DESC);

-- ---------------------------------------------------------------------------
-- Comments on key columns (for documentation)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE gss_ppi_construction_series IS
  'GSS StatsBank ppi.px — Producer Price Index by industry sector. The "Construction" series is the authoritative external anchor for the PropMetrik CCI materials sub-index. Populated by gssPpiService.ts (Slice 1).';

COMMENT ON TABLE gss_mieg_monthly IS
  'GSS StatsBank mieg_px_March26.px — Monthly Indicator of Economic Growth. Services_MIEG correlates with business-travel short-stay demand; Total_MIEG feeds Market Intelligence macro overlay. Populated by gssMiegService.ts (Slice 1).';

COMMENT ON TABLE gss_interest_rates_monthly IS
  'GSS StatsBank interest.px — lending rate, policy rate, T-bill. Used as resilient fallback to BOG website scraper and as interest_rate_cycle signal in market reports. Populated by gssFinancialService.ts (Slice 1).';

COMMENT ON TABLE gss_financial_soundness_monthly IS
  'GSS StatsBank fin_sound.px — NPL ratio and banking sector health. The NPL ratio feeds the macro_risk_penalty in investmentScoringService. Populated by gssFinancialService.ts (Slice 1).';
