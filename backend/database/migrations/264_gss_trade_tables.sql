-- ============================================================================
-- Migration 264: GSS Trade HS2 Construction Material Imports Table (Slice 2b)
--
-- Populated monthly by gssTradeService.ts from trade_detail_hs2.px.
-- Tracks import values and unit-value indices for construction-relevant HS2
-- codes (cement, steel, timber, glass, tiles, aluminium, etc.) to build the
-- Construction Material Import Pressure Index (GCMIPI).
-- ============================================================================

CREATE TABLE IF NOT EXISTS gss_construction_material_imports (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  year              INTEGER     NOT NULL,
  month             INTEGER     NOT NULL CHECK (month BETWEEN 1 AND 12),
  period_date       DATE        NOT NULL,   -- first day of month (year-month-01)

  hs2_code          TEXT        NOT NULL,   -- e.g. '25', '72', '73'
  hs2_label         TEXT        NOT NULL,   -- e.g. 'Salt sulphur earths and stone...'

  -- Values from trade_detail_hs2.px
  import_value_ghs  NUMERIC(18,2),         -- nominal GHS
  import_value_usd  NUMERIC(18,2),         -- USD
  import_weight_kg  NUMERIC(18,2),         -- net weight in KG

  -- Derived: unit value index (import_value_usd / import_weight_kg × 1000)
  -- normalised to base period 2021 = 100
  unit_value_index  NUMERIC(10,4),

  -- FX rate at period (GHS per USD from economic_indicators, used in GCMIPI)
  fx_rate_ghs_usd   NUMERIC(10,4),

  source_updated_at TIMESTAMPTZ,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (hs2_code, period_date)
);

CREATE INDEX IF NOT EXISTS idx_gss_trade_hs2_code_period
  ON gss_construction_material_imports (hs2_code, period_date DESC);

CREATE INDEX IF NOT EXISTS idx_gss_trade_period
  ON gss_construction_material_imports (period_date DESC);

COMMENT ON TABLE gss_construction_material_imports IS
  'GSS StatsBank trade_detail_hs2.px — monthly import values for construction-
   relevant HS2 codes (25, 27, 39, 44, 68-70, 72-73, 76, 94). Feeds the
   Construction Material Import Pressure Index (GCMIPI) which anchors the
   overhead component of the CCI. Populated by gssTradeService.ts (Slice 2b).';
