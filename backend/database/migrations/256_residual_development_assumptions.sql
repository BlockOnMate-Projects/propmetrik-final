-- 256_residual_development_assumptions.sql
-- Residual (development land) method: moves the development ASSUMPTIONS out of the hardcoded frontend
-- (EFFICIENCY_RATES, TIMELINES, S-curve factor + the fee/profit %s) into a Data Hub config table, so
-- the full methodology can live in the single Python engine and the frontend renders only.
-- Sale price/sqm (comparables) + construction cost/sqm (base_construction_costs) + finance rate
-- (economic_indicators) are already evidence-sourced and stay there; this table holds the assumptions.
--
-- Per development_type (x region):
--   efficiency_pct              : net saleable area / gross building area.
--   construction_months/sales_months : programme for the S-curve finance model.
--   plot_coverage_default       : footprint / plot (overridden by the property when known).
--   professional_fees_pct, contingency_pct : on construction cost.
--   marketing_pct, sales_commission_pct, legal_fees_pct : on GDV.
--   finance_ltv_pct, finance_avg_balance_factor : S-curve drawdown finance model.
--   developer_profit_pct (target), min_profit_pct : profit on cost; min for viability band.
-- Seeds = the current app constants, flagged for valuer review. Idempotent.

CREATE TABLE IF NOT EXISTS residual_development_assumptions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  development_type            TEXT NOT NULL,
  region                      TEXT NOT NULL DEFAULT 'greater_accra',
  efficiency_pct              NUMERIC(5, 4) NOT NULL,
  construction_months         INTEGER NOT NULL,
  sales_months                INTEGER NOT NULL,
  plot_coverage_default       NUMERIC(5, 4) NOT NULL,
  professional_fees_pct       NUMERIC(5, 4) NOT NULL,
  contingency_pct             NUMERIC(5, 4) NOT NULL,
  marketing_pct               NUMERIC(5, 4) NOT NULL,
  sales_commission_pct        NUMERIC(5, 4) NOT NULL,
  legal_fees_pct              NUMERIC(5, 4) NOT NULL,
  finance_ltv_pct             NUMERIC(5, 4) NOT NULL,
  finance_avg_balance_factor  NUMERIC(5, 4) NOT NULL,
  developer_profit_pct        NUMERIC(5, 4) NOT NULL,
  min_profit_pct              NUMERIC(5, 4) NOT NULL,
  source                      TEXT DEFAULT 'seed_review',
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (development_type, region)
);

INSERT INTO residual_development_assumptions
  (development_type, region, efficiency_pct, construction_months, sales_months, plot_coverage_default,
   professional_fees_pct, contingency_pct, marketing_pct, sales_commission_pct, legal_fees_pct,
   finance_ltv_pct, finance_avg_balance_factor, developer_profit_pct, min_profit_pct)
VALUES
  ('house',       'greater_accra', 0.92, 18,  6, 0.45, 0.145, 0.05, 0.03, 0.03, 0.015, 0.65, 0.55, 0.20, 0.15),
  ('apartment',   'greater_accra', 0.78, 24, 12, 0.45, 0.145, 0.05, 0.03, 0.03, 0.015, 0.65, 0.55, 0.20, 0.15),
  ('townhouse',   'greater_accra', 0.88, 20,  8, 0.45, 0.145, 0.05, 0.03, 0.03, 0.015, 0.65, 0.55, 0.20, 0.15),
  ('commercial',  'greater_accra', 0.75, 18, 12, 0.45, 0.145, 0.05, 0.03, 0.03, 0.015, 0.65, 0.55, 0.20, 0.15),
  ('office',      'greater_accra', 0.72, 24, 18, 0.45, 0.145, 0.05, 0.03, 0.03, 0.015, 0.65, 0.55, 0.20, 0.15),
  ('industrial',  'greater_accra', 0.90, 12,  6, 0.45, 0.145, 0.05, 0.03, 0.03, 0.015, 0.65, 0.55, 0.20, 0.15),
  ('warehouse',   'greater_accra', 0.95, 10,  4, 0.45, 0.145, 0.05, 0.03, 0.03, 0.015, 0.65, 0.55, 0.20, 0.15)
ON CONFLICT (development_type, region) DO NOTHING;
