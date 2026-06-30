-- 254_trading_property_benchmarks.sql
-- Profits (trade-related) method: move the trading benchmarks OUT of the hardcoded frontend tables
-- and Python defaults INTO a Data Hub config table — the same pattern as specialized_construction_costs
-- for DRC. Drives the single Python profits engine; the frontend renders the result only.
--
-- Per property_type x region:
--   unit_metric              : the revenue unit (rooms, beds, students, sqm, pumps).
--   revenue_per_unit         : annual Fair Maintainable Turnover per unit (benchmark estimate; the
--                              valuer may instead enter actual audited turnover).
--   occupancy_default_pct    : typical utilisation of the revenue units.
--   operating_cost_ratios    : jsonb of per-category opex ratios (fractions of EGR).
--   operator_remuneration_pct: operator's share / divisible-balance deduction from net profit
--                              (fraction) — the reward to the Reasonably Efficient Operator.
--   typical_cap_rate         : trading-specific capitalisation rate (fraction) — NOT an office proxy.
--
-- Seeds are the figures previously hardcoded in the app, flagged for valuer review
-- (source = 'seed_review'). Idempotent.

CREATE TABLE IF NOT EXISTS trading_property_benchmarks (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_type             TEXT NOT NULL,
  region                    TEXT NOT NULL DEFAULT 'greater_accra',
  unit_metric               TEXT NOT NULL,
  revenue_per_unit          NUMERIC(14, 2) NOT NULL,
  occupancy_default_pct     NUMERIC(5, 2) NOT NULL DEFAULT 70,
  operating_cost_ratios     JSONB NOT NULL,
  operator_remuneration_pct NUMERIC(5, 4) NOT NULL,
  typical_cap_rate          NUMERIC(6, 4) NOT NULL,
  source                    TEXT DEFAULT 'seed_review',
  notes                     TEXT,
  effective_date            DATE DEFAULT CURRENT_DATE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (property_type, region)
);

INSERT INTO trading_property_benchmarks
  (property_type, region, unit_metric, revenue_per_unit, occupancy_default_pct,
   operating_cost_ratios, operator_remuneration_pct, typical_cap_rate)
VALUES
  ('hotel',        'greater_accra', 'rooms',    120000, 70,
   '{"cost_of_sales":0.25,"staff":0.30,"utilities":0.08,"maintenance":0.05,"admin_marketing":0.10}', 0.1500, 0.0950),
  ('hospital',     'greater_accra', 'beds',     180000, 70,
   '{"cost_of_sales":0.30,"staff":0.40,"utilities":0.05,"maintenance":0.04,"admin":0.05}',           0.1200, 0.1000),
  ('school',       'greater_accra', 'students',  24000, 85,
   '{"staff":0.55,"utilities":0.05,"maintenance":0.05,"admin":0.08}',                                0.1000, 0.1050),
  ('restaurant',   'greater_accra', 'sqm',        6000, 70,
   '{"cost_of_sales":0.35,"staff":0.25,"utilities":0.06,"maintenance":0.03,"admin_marketing":0.05}', 0.1800, 0.1100),
  ('fuel_station', 'greater_accra', 'pumps',    480000, 70,
   '{"cost_of_sales":0.85,"staff":0.04,"utilities":0.02,"maintenance":0.02}',                        0.1500, 0.1100),
  ('healthcare',   'greater_accra', 'sqm',        4800, 70,
   '{"cost_of_sales":0.25,"staff":0.45,"utilities":0.05,"maintenance":0.04,"admin":0.05}',           0.1200, 0.1000)
ON CONFLICT (property_type, region) DO NOTHING;
