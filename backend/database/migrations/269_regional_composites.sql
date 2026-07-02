-- ============================================================================
-- Migration 269: Regional composite indices (§6.4 DPMDI, §6.8 PTMPI,
--                §6.10 ESSI, §7.2 RICI)
--
-- Four DERIVED regional composites computed by regionalCompositesService.ts from
-- already-ingested GSS tables (no new scrapers). Region granularity, 0–100 (RICI
-- 0–100; ESSI 0–100 risk). Idempotent upserts; recomputed with the other derived
-- analytics on the annual Jan-5th recompute.
-- ============================================================================

-- §6.4 District Property Market Depth Index — how large/liquid/formalised a market is.
CREATE TABLE IF NOT EXISTS district_market_depth_scores (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  region                TEXT        NOT NULL,
  dpmdi_score           NUMERIC(6,2),
  tenure_participation_pct  NUMERIC(6,2),   -- renting + owner-occupied
  employment_rate_pct   NUMERIC(6,2),
  earnings_percentile   NUMERIC(6,2),       -- national rank of median income
  components_used       INTEGER,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT district_market_depth_uniq UNIQUE (region)
);
CREATE INDEX IF NOT EXISTS idx_district_market_depth ON district_market_depth_scores (dpmdi_score DESC);

-- §6.8 PropTech Market Penetration Index — digital readiness of a market.
CREATE TABLE IF NOT EXISTS district_proptech_scores (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  region                TEXT        NOT NULL,
  ptmpi_score           NUMERIC(6,2),
  smartphone_pct        NUMERIC(6,2),
  mobile_internet_pct   NUMERIC(6,2),
  electricity_pct       NUMERIC(6,2),
  formal_employment_pct NUMERIC(6,2),
  components_used       INTEGER,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT district_proptech_uniq UNIQUE (region)
);
CREATE INDEX IF NOT EXISTS idx_district_proptech ON district_proptech_scores (ptmpi_score DESC);

-- §6.10 Economic Shock Sensitivity Index — vulnerability to a macro shock (higher = more exposed).
CREATE TABLE IF NOT EXISTS regional_economic_shock_sensitivity (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  region                TEXT        NOT NULL,
  essi_score            NUMERIC(6,2),       -- 0–100, higher = more shock-sensitive
  formal_employment_pct NUMERIC(6,2),
  mpi_intensity         NUMERIC(7,3),
  capital_adequacy_ratio NUMERIC(6,2),      -- national banking buffer (context)
  components_used       INTEGER,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT regional_essi_uniq UNIQUE (region)
);
CREATE INDEX IF NOT EXISTS idx_regional_essi ON regional_economic_shock_sensitivity (essi_score DESC);

-- §7.2 Regional Investment Climate Index — companion to the price index.
CREATE TABLE IF NOT EXISTS regional_investment_climate_index (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  region                TEXT        NOT NULL,
  rici_score            NUMERIC(6,2),       -- 0–100
  mieg_component        NUMERIC(6,2),
  ppi_component         NUMERIC(6,2),
  lending_component     NUMERIC(6,2),
  npl_component         NUMERIC(6,2),
  rhds_component        NUMERIC(6,2),
  niqs_component        NUMERIC(6,2),
  components_used       INTEGER,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT regional_rici_uniq UNIQUE (region)
);
CREATE INDEX IF NOT EXISTS idx_regional_rici ON regional_investment_climate_index (rici_score DESC);

COMMENT ON TABLE district_market_depth_scores          IS 'DPMDI §6.4 — property-market depth/liquidity/formalisation per region.';
COMMENT ON TABLE district_proptech_scores              IS 'PTMPI §6.8 — proptech/digital penetration per region.';
COMMENT ON TABLE regional_economic_shock_sensitivity   IS 'ESSI §6.10 — macro-shock sensitivity per region (higher = more exposed).';
COMMENT ON TABLE regional_investment_climate_index      IS 'RICI §7.2 — regional investment climate composite (MIEG/PPI/lending/NPL/RHDS/NIQS).';
