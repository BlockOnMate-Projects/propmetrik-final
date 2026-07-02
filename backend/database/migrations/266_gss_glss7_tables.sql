-- ============================================================================
-- Migration 266: GSS GLSS7 Migration + Tourism + Housing Tables (Slice 4)
--
-- Populated annually (Jan 3rd, day after the PHC census chain) by one scraper
-- from the GSS StatsBank PxWeb API (GLSS7 database, 2016/17 survey):
--   gssGlss7Service.ts → gss_glss7_migration_flows   (Migration/Table_6.4.px)
--                        gss_glss7_tourism_by_region  (Migration/Table_6.15.px)
--                        gss_glss7_housing_snapshot   (Housing/Table_7.2.px + 7.3.px)
--
-- These complete the Regional Housing Demand Score (RHDS) migration component
-- (housingDemandScoreService already reads gss_glss7_migration_flows and flips
-- migration_active true once rows exist), classify short-stay markets by tourism
-- demand type, and activate the migration absorption factor in investment scoring.
--
-- IMPORTANT — region taxonomy: GLSS7 predates the 2019 region split, so it uses
-- the OLD 10-region classification (includes "Brong Ahafo"; lacks Western North,
-- Savannah, North East, Oti, Bono, Bono East, Ahafo). Rows are stored under
-- GLSS7's own snake_case region keys. Consumers join on region and naturally
-- pick up the 9 regions whose names are unchanged; the successor regions of
-- Brong Ahafo degrade to null (no fabricated population split), consistent with
-- the RHDS graceful-degradation design.
--
-- All upserts are idempotent (ON CONFLICT DO UPDATE) so re-running is safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Inter-regional migration flows (Table_6.4.px, percent)
--    Column-normalised: for each destination (region of current residence) the
--    flow_pct across all origins (region of previous residence) sums to 100. The
--    diagonal (origin = dest) is the within-region non-migrant share; RHDS sums
--    the off-diagonal inflows per destination as the in-migration intensity.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_glss7_migration_flows (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  origin_region  TEXT        NOT NULL,   -- snake_case GLSS7 region of PREVIOUS residence
  dest_region    TEXT        NOT NULL,   -- snake_case GLSS7 region of CURRENT residence
  flow_pct       NUMERIC(6,2),           -- % of dest's current residents previously in origin

  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gss_glss7_migration_uniq UNIQUE (origin_region, dest_region)
);

CREATE INDEX IF NOT EXISTS idx_gss_glss7_migration_dest
  ON gss_glss7_migration_flows (dest_region);

-- ---------------------------------------------------------------------------
-- 2. Domestic overnight tourism (Table_6.15.px, counts)
--    Absolute visitor counts by region + urban/rural split. visitor_share_pct
--    (region ÷ national) and urban_share_pct (urban ÷ all-localities) are derived
--    at ingest. urban_share is a real business-vs-leisure discriminator: business
--    travel concentrates in urban hubs, leisure spreads rural/mixed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_glss7_tourism_by_region (
  id                          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  region                      TEXT        NOT NULL,

  domestic_overnight_visitors NUMERIC(14,0),   -- All localities, both sexes
  urban_visitors              NUMERIC(14,0),   -- Urban, both sexes
  rural_visitors              NUMERIC(14,0),   -- Rural, both sexes
  visitor_share_pct           NUMERIC(6,2),    -- region ÷ national total, %
  urban_share_pct             NUMERIC(6,2),    -- urban ÷ all-localities, %

  synced_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gss_glss7_tourism_uniq UNIQUE (region)
);

CREATE INDEX IF NOT EXISTS idx_gss_glss7_tourism_region
  ON gss_glss7_tourism_by_region (region);

-- ---------------------------------------------------------------------------
-- 3. Housing occupancy + rent payee snapshot (Table_7.2.px + Table_7.3.px)
--    Tenure shares (owning/renting/rent-free/perching/squatting sum to 100) and
--    the rent-payee breakdown (JSONB). The GLSS7 2016/17 analogue of the PHC 2021
--    tenure table — supplementary market-depth context.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_glss7_housing_snapshot (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  region         TEXT        NOT NULL,

  owner_pct      NUMERIC(6,2),   -- Owning
  renting_pct    NUMERIC(6,2),   -- Renting
  rent_free_pct  NUMERIC(6,2),   -- Rent-free
  perching_pct   NUMERIC(6,2),   -- Perching
  squatting_pct  NUMERIC(6,2),   -- Squatting
  rent_payee     JSONB,          -- { "Relative": pct, "Private individual": pct, ... }

  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gss_glss7_housing_uniq UNIQUE (region)
);

CREATE INDEX IF NOT EXISTS idx_gss_glss7_housing_region
  ON gss_glss7_housing_snapshot (region);

-- ---------------------------------------------------------------------------
-- Column comments (documentation)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE gss_glss7_migration_flows   IS 'GSS GLSS7 (2016/17) inter-regional migration flow matrix (Table_6.4.px, percent, column-normalised). Old 10-region taxonomy. Feeds RHDS migration component. Slice 4.';
COMMENT ON TABLE gss_glss7_tourism_by_region IS 'GSS GLSS7 (2016/17) domestic overnight tourism by region (Table_6.15.px, counts + urban/rural split). Feeds short-stay tourism_demand_type. Slice 4.';
COMMENT ON TABLE gss_glss7_housing_snapshot  IS 'GSS GLSS7 (2016/17) housing occupancy + rent payee by region (Table_7.2.px + 7.3.px). Supplementary tenure context. Slice 4.';
