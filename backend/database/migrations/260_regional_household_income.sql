-- 260_regional_household_income.sql
-- Real, monthly-refreshing regional household income — replaces the hardcoded/seeded
-- median_household_income that fed the Ghana Housing Affordability Index (GHAI).
--
-- Source chain (100% GSS/BoG, nothing seeded):
--   median_hourly_earnings  ← GSS AHIES med_earnings.px (live PxWeb API, quarterly)
--   mean_weekly_hours       ← GSS AHIES Labour Statistics (documented national mean)
--   avg_household_size      ← GSS PHC 2021 avg_hhsize_table.px
--   employment_rate         ← GSS PHC 2021 econact_table.px (Employed / Total, 15+)
--   earners_per_household   = avg_household_size × employment_rate
--   monthly income (survey) = hourly × weekly_hours × (52/12) × earners_per_household
--   CPI escalation          ← economic_indicators.cpi_index (live, monthly via BoG/GSS sync)
--   median_household_income_monthly = monthly(survey) × cpi_current / cpi_base
--
-- Populated + escalated monthly by gssIncomeService on the economicDataScheduler. Idempotent.

CREATE TABLE IF NOT EXISTS regional_household_income (
  id                                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region                             VARCHAR(50)  NOT NULL,   -- snake_case key, e.g. greater_accra
  period_month                       DATE         NOT NULL,   -- first day of the escalation month

  -- Live GSS inputs (as fetched)
  median_hourly_earnings_ghs         DECIMAL(12,4) NOT NULL,
  survey_period                      VARCHAR(12)  NOT NULL,    -- e.g. 2023Q3 (AHIES quarter used)
  mean_weekly_hours                  DECIMAL(6,2) NOT NULL,
  avg_household_size                 DECIMAL(6,2) NOT NULL,
  employment_rate                    DECIMAL(6,4) NOT NULL,    -- 0..1
  earners_per_household              DECIMAL(6,3) NOT NULL,

  -- CPI escalation
  cpi_base                           DECIMAL(12,4),            -- CPI index at survey period
  cpi_current                        DECIMAL(12,4),            -- CPI index at period_month
  escalation_factor                  DECIMAL(10,6),            -- cpi_current / cpi_base

  -- Computed outputs
  median_household_income_monthly_ghs DECIMAL(15,2) NOT NULL,
  median_household_income_annual_ghs  DECIMAL(15,2) NOT NULL,

  source_name                        VARCHAR(120) NOT NULL DEFAULT 'Ghana Statistical Service (AHIES + PHC 2021)',
  source_reference                   VARCHAR(255),
  metadata                           JSONB        DEFAULT '{}',
  created_at                         TIMESTAMPTZ  DEFAULT NOW(),
  updated_at                         TIMESTAMPTZ  DEFAULT NOW(),

  CONSTRAINT uq_regional_household_income_region_month UNIQUE (region, period_month)
);

CREATE INDEX IF NOT EXISTS idx_regional_household_income_region_month
  ON regional_household_income (region, period_month DESC);

-- Purge the legacy seeded affordability rows (migration 156 hardcoded sample + any row computed
-- off the hardcoded 60k/72k income). The scheduled GHAI recompute repopulates from real sources.
DELETE FROM housing_affordability_index;
