-- ============================================================================
-- Migration 263: GSS PHC 2021 Housing Census Tables (Slice 2)
--
-- Five tables populated by gssPhcHousingService.ts (one-time backfill, then
-- annual Jan 1st refresh). All store region-level aggregates from the
-- 2021 Population & Housing Census.
--
-- Key → (district, region, locality) uniquely identifies each row.
-- For region-level rows: district = region (e.g., district='Greater Accra',
--   region='Greater Accra'), which is how the PHC API returns regional totals.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tenure / Holding Arrangement by district
--    Source: Tenure_arrangement.px
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_phc_tenure_by_district (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  district                TEXT        NOT NULL,
  region                  TEXT        NOT NULL,
  locality                TEXT        NOT NULL DEFAULT 'All Locality Types',

  -- PHC 2021 tenure percentages (each row = 100% across all tenure types)
  total_dwellings         NUMERIC(12,2),   -- absolute count
  owner_occupied_pct      NUMERIC(6,3),    -- % of total
  renting_pct             NUMERIC(6,3),
  rent_free_pct           NUMERIC(6,3),
  perching_pct            NUMERIC(6,3),
  squatting_pct           NUMERIC(6,3),
  caretaker_pct           NUMERIC(6,3),
  other_tenure_pct        NUMERIC(6,3),

  synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (district, region, locality)
);

CREATE INDEX IF NOT EXISTS idx_gss_phc_tenure_region_locality
  ON gss_phc_tenure_by_district (region, locality);

-- ---------------------------------------------------------------------------
-- 2. Housing Profile (rooms, materials) by district
--    Sources: num_rooms.px, sleep_rooms.px, wall_material.px,
--             roofing_material.px, flooring_material.px
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_phc_housing_profile_by_district (
  id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  district                  TEXT        NOT NULL,
  region                    TEXT        NOT NULL,
  locality                  TEXT        NOT NULL DEFAULT 'All Locality Types',

  -- Room counts (derived from distribution)
  one_room_pct              NUMERIC(6,3),    -- % with only 1 room
  two_rooms_pct             NUMERIC(6,3),
  three_plus_rooms_pct      NUMERIC(6,3),

  -- Wall materials
  cement_block_wall_pct     NUMERIC(6,3),    -- 'Cement blocks/concrete'
  mud_earth_wall_pct        NUMERIC(6,3),    -- 'Mud bricks/earth'

  -- Roofing materials
  metal_sheet_roof_pct      NUMERIC(6,3),    -- 'Metal sheet'
  concrete_roof_pct         NUMERIC(6,3),    -- 'Cement/Concrete'
  thatch_roof_pct           NUMERIC(6,3),    -- 'Thatch/Palm leaves or Raffia'

  -- Flooring materials
  cement_concrete_floor_pct NUMERIC(6,3),    -- 'Cement/Concrete'
  tile_floor_pct            NUMERIC(6,3),    -- 'Ceramic/Porcelain/Granite/Marble tiles' + 'Vinyl tiles' + 'Terrazzo'
  earth_floor_pct           NUMERIC(6,3),    -- 'Earth/Mud'

  -- Composite quality score (0-100, computed: cement wall + metal/concrete roof + tile/cement floor)
  material_quality_score    NUMERIC(5,2),

  synced_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (district, region, locality)
);

CREATE INDEX IF NOT EXISTS idx_gss_phc_housing_profile_region
  ON gss_phc_housing_profile_by_district (region, locality);

-- ---------------------------------------------------------------------------
-- 3. Residential Structure Completion by district
--    Source: Levelof_completion_res_table.px
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_phc_completion_by_district (
  id                             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  district                       TEXT        NOT NULL,
  region                         TEXT        NOT NULL,
  locality                       TEXT        NOT NULL DEFAULT 'All locality types',

  fully_completed_pct            NUMERIC(6,3),   -- 'Fully Completed'
  roofed_uncompleted_pct         NUMERIC(6,3),   -- 'Completely roofed but uncompleted'
  partially_roofed_pct           NUMERIC(6,3),   -- 'Partially roofed'
  roofing_level_pct              NUMERIC(6,3),   -- 'Roofing level (with improvised roof)'
  lintel_level_pct               NUMERIC(6,3),   -- 'Lintel Level (with improvised roof)'

  -- Derived: sum of all incomplete stages
  incomplete_residential_pct     NUMERIC(6,3),

  synced_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (district, region, locality)
);

CREATE INDEX IF NOT EXISTS idx_gss_phc_completion_region
  ON gss_phc_completion_by_district (region, locality);

-- ---------------------------------------------------------------------------
-- 4. Infrastructure Quality by district
--    Sources: main_light.px, mainwater_table.px, service_table.px,
--             toiletfacility_table.px, solidDisposal_table.px
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_phc_infrastructure_by_district (
  id                          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  district                    TEXT        NOT NULL,
  region                      TEXT        NOT NULL,
  locality                    TEXT        NOT NULL DEFAULT 'All Locality Types',

  -- Electricity
  electricity_grid_pct        NUMERIC(6,3),   -- mains + community grid + solar/invertor + generator

  -- Water
  piped_water_pct             NUMERIC(6,3),   -- 'Public tap/Stand pipe' + 'Pipe-borne inside dwelling' etc
  improved_water_pct          NUMERIC(6,3),   -- 'Improved water sources' aggregate
  safe_water_service_pct      NUMERIC(6,3),   -- 'Improved Drinking Water Source' (from service table)

  -- Sanitation
  flush_kvip_toilet_pct       NUMERIC(6,3),   -- 'Septic tank' + 'KVIP/VIP' + 'Sewer' + 'Bio-digester'
  no_toilet_pct               NUMERIC(6,3),   -- 'No toilet facility'

  -- Solid waste
  formal_collection_pct       NUMERIC(6,3),   -- 'Collected' aggregate

  -- Composite NIQS score (0-100)
  -- Formula: 0.25×electricity + 0.20×piped_water + 0.15×improved_water + 0.15×flush_toilet + 0.15×formal_waste + 0.10×smartphone
  -- smartphone added from ICT table (populated later via gss_phc_ict_by_district JOIN)
  niqs_score                  NUMERIC(5,2),

  synced_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (district, region, locality)
);

CREATE INDEX IF NOT EXISTS idx_gss_phc_infrastructure_region
  ON gss_phc_infrastructure_by_district (region, locality);

-- ---------------------------------------------------------------------------
-- 5. ICT Ownership by district
--    Sources: ownict_table_1.px, use_internet_on_device_1.px
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gss_phc_ict_by_district (
  id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  district                  TEXT        NOT NULL,
  region                    TEXT        NOT NULL,
  locality                  TEXT        NOT NULL DEFAULT 'All Locality Types',

  smartphone_ownership_pct  NUMERIC(6,3),   -- % owning functional smartphone (6+ years)
  mobile_internet_use_pct   NUMERIC(6,3),   -- % using internet on mobile phone (last 3 months)

  synced_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (district, region, locality)
);

CREATE INDEX IF NOT EXISTS idx_gss_phc_ict_region
  ON gss_phc_ict_by_district (region, locality);

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
COMMENT ON TABLE gss_phc_tenure_by_district IS
  'GSS PHC 2021 Tenure_arrangement.px — tenure/holding arrangement by district/region.
   renting_pct feeds rental market depth signal; owner_occupied_pct + renting_pct
   feed GHAI regional weight auto-calibration. Populated by gssPhcHousingService.ts.';

COMMENT ON TABLE gss_phc_completion_by_district IS
  'GSS PHC 2021 Levelof_completion_res_table.px — incomplete_residential_pct
   feeds the Construction Completion Risk Index (CCRI) in investmentScoringService.
   Populated by gssPhcHousingService.ts.';

COMMENT ON TABLE gss_phc_infrastructure_by_district IS
  'GSS PHC 2021 infrastructure tables (light, water, sanitation, waste).
   niqs_score feeds the Neighbourhood Infrastructure Quality Score (NIQS)
   used as an AVM location adjustment factor. Populated by gssPhcHousingService.ts.';
