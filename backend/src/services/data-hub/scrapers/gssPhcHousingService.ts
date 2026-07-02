/**
 * GSS PHC Housing Service (Slice 2 — P2 PHC Census Backfill)
 *
 * Fetches 11 PHC 2021 housing / structures / sanitation / ICT tables from the
 * GSS StatsBank PxWeb API and persists derived metrics into five tables:
 *
 *   gss_phc_tenure_by_district         ← Tenure_arrangement.px
 *   gss_phc_housing_profile_by_district ← wall_material + roofing_material
 *                                          + flooring_material
 *   gss_phc_completion_by_district      ← Levelof_completion_res_table.px
 *   gss_phc_infrastructure_by_district  ← main_light + mainwater + service
 *                                          + toiletfacility + solidDisposal
 *   gss_phc_ict_by_district             ← ownict_table_1.px
 *
 * The service fetches region-level aggregates (16 GSS regions) — district-level
 * granularity (260+ districts) is deferred to Slice 3 (gssPhcEmploymentService).
 *
 * This is a one-time backfill run followed by an annual refresh on Jan 1st.
 * All upserts are idempotent (ON CONFLICT DO UPDATE) so re-running is safe.
 *
 * Follows the PxWeb client pattern from gssIncomeService.ts exactly:
 *   native https, pxPost, json-stat2, syncLogRepository.
 *
 * @module services/data-hub/scrapers/gssPhcHousingService
 */

import https from 'https';
import { query } from '../../../database';
import { logger } from '../../../utils/logger';
import { syncLogRepository } from './syncLogRepository';
import type { SyncResult } from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STATSBANK_HOST = process.env.GSS_STATSBANK_HOST || 'statsbank.statsghana.gov.gh';
const PHC_DB = '/api/v1/en/PHC%202021%20StatsBank';

const TENURE_PATH = `${PHC_DB}/Housing/Tenure_arrangement.px`;
const WALL_PATH = `${PHC_DB}/Housing/wall_material.px`;
const ROOF_PATH = `${PHC_DB}/Housing/roofing_material.px`;
const FLOOR_PATH = `${PHC_DB}/Housing/flooring_material.px`;
const COMPLETION_PATH = `${PHC_DB}/Structures/Levelof_completion_res_table.px`;
const LIGHT_PATH = `${PHC_DB}/Housing/main_light.px`;
const WATER_PATH = `${PHC_DB}/Water%20and%20Sanitation/mainwater_table.px`;
const SERVICE_PATH = `${PHC_DB}/Water%20and%20Sanitation/service_table.px`;
const TOILET_PATH = `${PHC_DB}/Water%20and%20Sanitation/toiletfacility_table.px`;
const WASTE_PATH = `${PHC_DB}/Water%20and%20Sanitation/solidDisposal_table.px`;
const SMARTPHONE_PATH = `${PHC_DB}/ICT/ownict_table_1.px`;

/** 16 GSS region names (verbatim PxWeb Geographic_Area values for regional totals). */
const GSS_REGIONS = [
  'Western', 'Central', 'Greater Accra', 'Volta', 'Eastern', 'Ashanti',
  'Western North', 'Ahafo', 'Bono', 'Bono East', 'Oti', 'Northern',
  'Savannah', 'North East', 'Upper East', 'Upper West',
];

/** snake_case → GSS region label mapping (inverse for storage). */
function regionKey(gssLabel: string): string {
  return gssLabel.toLowerCase().replace(/\s+/g, '_');
}

// ---------------------------------------------------------------------------
// PxWeb helpers (same pattern as gssIncomeService.ts)
// ---------------------------------------------------------------------------

interface PxStat2 {
  value: (number | null)[];
  dimension: Record<string, {
    category: { index: Record<string, number>; label: Record<string, string> };
  }>;
  updated?: string;
}

function pxPost(path: string, queryBody: unknown): Promise<PxStat2> {
  const body = JSON.stringify({ query: queryBody, response: { format: 'json-stat2' } });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST', hostname: STATSBANK_HOST, path,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'propmetrik-datahub' },
        timeout: 60000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`GSS ${res.statusCode} for ${path}: ${data.slice(0, 200)}`));
            return;
          }
          try { resolve(JSON.parse(data) as PxStat2); }
          catch (e) { reject(new Error(`Parse error for ${path}: ${(e as Error).message}`)); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`GSS timeout: ${path}`)));
    req.write(body);
    req.end();
  });
}

/** Small sleep to avoid hammering the GSS API with parallel requests. */
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Extract a single-metric value per region from a PxStat2 response.
 * Works for 3-dim responses: ClassDim × Locality × Geographic_Area.
 * Assumes only one class value selected (dimCode filtered to one item) and
 * one locality value ('All Locality Types' or 'All locality types').
 *
 * Uses stride-based flat index: dimIdx * (nLocality * nGeo) + localIdx * nGeo + geoIdx
 */
function valuesByRegionSingleClass(
  px: PxStat2,
  classDimCode: string,
  localityDimCode: string,
  geoDimCode: string,
): Record<string, number | null> {
  const classDim = px.dimension[classDimCode];
  const localityDim = px.dimension[localityDimCode];
  const geoDim = px.dimension[geoDimCode];
  if (!classDim || !localityDim || !geoDim) return {};

  const nLocality = Object.keys(localityDim.category.index).length;
  const nGeo = Object.keys(geoDim.category.index).length;

  // Assume only one class value was selected (index 0)
  const classIdx = 0;
  // Assume first locality is 'All Locality Types' (index 0)
  const localityIdx = 0;

  const out: Record<string, number | null> = {};
  for (const [geoCode, geoIdx] of Object.entries(geoDim.category.index)) {
    const geoLabel = geoDim.category.label[geoCode] ?? geoCode;
    const flatIdx = classIdx * (nLocality * nGeo) + localityIdx * nGeo + (geoIdx as number);
    out[geoLabel] = px.value[flatIdx] ?? null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tenure fetch + upsert
// ---------------------------------------------------------------------------

interface TenureRow {
  region: string;
  tenure_type: string;
  value: number | null;
}

async function fetchTenure(): Promise<TenureRow[]> {
  const TENURE_TYPES = [
    'Total', 'Owner occupied', 'Renting', 'Rent-free',
    'Perching', 'Squatting', 'Caretaker', 'Other',
  ];

  const px = await pxPost(TENURE_PATH, [
    { code: 'Tenure_Arrangement', selection: { filter: 'item', values: TENURE_TYPES } },
    { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
  ]);

  const tenureDim = px.dimension.Tenure_Arrangement;
  const geoDim = px.dimension.Geographic_Area;
  const localityDim = px.dimension.Locality;

  if (!tenureDim || !geoDim || !localityDim) return [];

  const nLocality = Object.keys(localityDim.category.index).length;
  const nGeo = Object.keys(geoDim.category.index).length;

  const rows: TenureRow[] = [];
  for (const [tCode, tIdx] of Object.entries(tenureDim.category.index)) {
    const tLabel = tenureDim.category.label[tCode] ?? tCode;
    for (const [gCode, gIdx] of Object.entries(geoDim.category.index)) {
      const gLabel = geoDim.category.label[gCode] ?? gCode;
      // Locality index 0 = 'All Locality Types'
      const flatIdx = (tIdx as number) * (nLocality * nGeo) + 0 * nGeo + (gIdx as number);
      rows.push({ region: gLabel, tenure_type: tLabel, value: px.value[flatIdx] ?? null });
    }
  }
  return rows;
}

async function upsertTenure(rows: TenureRow[]): Promise<number> {
  // Group by region to build pivot
  const byRegion: Record<string, Record<string, number | null>> = {};
  for (const row of rows) {
    if (!byRegion[row.region]) byRegion[row.region] = {};
    byRegion[row.region][row.tenure_type] = row.value;
  }

  let saved = 0;
  for (const [region, data] of Object.entries(byRegion)) {
    const total = data['Total'] ?? null;
    if (!total) continue;

    const pct = (count: number | null | undefined): number | null =>
      count !== null && count !== undefined && total > 0
        ? Math.round((count / total) * 10000) / 100 : null;

    await query(
      `INSERT INTO gss_phc_tenure_by_district
         (district, region, locality, total_dwellings,
          owner_occupied_pct, renting_pct, rent_free_pct, perching_pct,
          squatting_pct, caretaker_pct, other_tenure_pct, synced_at)
       VALUES ($1,$2,'All Locality Types',$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (district, region, locality) DO UPDATE SET
         total_dwellings    = EXCLUDED.total_dwellings,
         owner_occupied_pct = EXCLUDED.owner_occupied_pct,
         renting_pct        = EXCLUDED.renting_pct,
         rent_free_pct      = EXCLUDED.rent_free_pct,
         perching_pct       = EXCLUDED.perching_pct,
         squatting_pct      = EXCLUDED.squatting_pct,
         caretaker_pct      = EXCLUDED.caretaker_pct,
         other_tenure_pct   = EXCLUDED.other_tenure_pct,
         synced_at          = NOW()`,
      [
        region, region, total,
        pct(data['Owner occupied']),
        pct(data['Renting']),
        pct(data['Rent-free']),
        pct(data['Perching']),
        pct(data['Squatting']),
        pct(data['Caretaker']),
        pct(data['Other']),
      ],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Housing profile (wall, roof, floor materials)
// ---------------------------------------------------------------------------

async function fetchMaterialPcts(): Promise<{
  wall: Record<string, number | null>;
  roof: Record<string, number | null>;
  floor: Record<string, number | null>;
}> {
  // Fetch totals + key material categories in parallel
  const [wallTotal, wallCement, wallMud,
         roofTotal, roofMetal, roofConcrete, roofThatch,
         floorTotal, floorCement, floorTile, floorEarth] = await Promise.all([
    pxPost(WALL_PATH, [{ code: 'Wall_Material', selection: { filter: 'item', values: ['Total'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),
    pxPost(WALL_PATH, [{ code: 'Wall_Material', selection: { filter: 'item', values: ['Cement blocks/concrete'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),
    pxPost(WALL_PATH, [{ code: 'Wall_Material', selection: { filter: 'item', values: ['Mud bricks/earth'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),

    pxPost(ROOF_PATH, [{ code: 'Roof_Material', selection: { filter: 'item', values: ['Total'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),
    pxPost(ROOF_PATH, [{ code: 'Roof_Material', selection: { filter: 'item', values: ['Metal sheet'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),
    pxPost(ROOF_PATH, [{ code: 'Roof_Material', selection: { filter: 'item', values: ['Cement/Concrete'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),
    pxPost(ROOF_PATH, [{ code: 'Roof_Material', selection: { filter: 'item', values: ['Thatch/Palm leaves or Raffia'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),

    pxPost(FLOOR_PATH, [{ code: 'Floor_Material', selection: { filter: 'item', values: ['Total'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),
    pxPost(FLOOR_PATH, [{ code: 'Floor_Material', selection: { filter: 'item', values: ['Cement/Concrete'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),
    pxPost(FLOOR_PATH, [{ code: 'Floor_Material', selection: { filter: 'item', values: ['Ceramic/Porcelain/Granite/Marble tiles'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),
    pxPost(FLOOR_PATH, [{ code: 'Floor_Material', selection: { filter: 'item', values: ['Earth/Mud'] } }, { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } }, { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } }]),
  ]);

  const ex = (px: PxStat2, classDim: string) =>
    valuesByRegionSingleClass(px, classDim, 'Locality', 'Geographic_Area');

  const wallTotMap = ex(wallTotal, 'Wall_Material');
  const wallCemMap = ex(wallCement, 'Wall_Material');
  const wallMudMap = ex(wallMud, 'Wall_Material');
  const roofTotMap = ex(roofTotal, 'Roof_Material');
  const roofMetMap = ex(roofMetal, 'Roof_Material');
  const roofConMap = ex(roofConcrete, 'Roof_Material');
  const roofThaMap = ex(roofThatch, 'Roof_Material');
  const floorTotMap = ex(floorTotal, 'Floor_Material');
  const floorCemMap = ex(floorCement, 'Floor_Material');
  const floorTilMap = ex(floorTile, 'Floor_Material');
  const floorEarMap = ex(floorEarth, 'Floor_Material');

  const pct = (v: number | null, t: number | null) =>
    v !== null && t !== null && t > 0 ? Math.round((v / t) * 10000) / 100 : null;

  const wall: Record<string, number | null> = {};
  const roof: Record<string, number | null> = {};
  const floor: Record<string, number | null> = {};

  for (const r of GSS_REGIONS) {
    wall[`${r}__cement_block`] = pct(wallCemMap[r] ?? null, wallTotMap[r] ?? null);
    wall[`${r}__mud_earth`] = pct(wallMudMap[r] ?? null, wallTotMap[r] ?? null);
    roof[`${r}__metal`] = pct(roofMetMap[r] ?? null, roofTotMap[r] ?? null);
    roof[`${r}__concrete`] = pct(roofConMap[r] ?? null, roofTotMap[r] ?? null);
    roof[`${r}__thatch`] = pct(roofThaMap[r] ?? null, roofTotMap[r] ?? null);
    floor[`${r}__cement`] = pct(floorCemMap[r] ?? null, floorTotMap[r] ?? null);
    floor[`${r}__tile`] = pct(floorTilMap[r] ?? null, floorTotMap[r] ?? null);
    floor[`${r}__earth`] = pct(floorEarMap[r] ?? null, floorTotMap[r] ?? null);
  }
  return { wall, roof, floor };
}

async function upsertHousingProfile(wall: Record<string, number | null>, roof: Record<string, number | null>, floor: Record<string, number | null>): Promise<number> {
  let saved = 0;
  for (const region of GSS_REGIONS) {
    const cementBlock = wall[`${region}__cement_block`] ?? null;
    const mudEarth = wall[`${region}__mud_earth`] ?? null;
    const metalRoof = roof[`${region}__metal`] ?? null;
    const concreteRoof = roof[`${region}__concrete`] ?? null;
    const thatchRoof = roof[`${region}__thatch`] ?? null;
    const cementFloor = floor[`${region}__cement`] ?? null;
    const tileFloor = floor[`${region}__tile`] ?? null;
    const earthFloor = floor[`${region}__earth`] ?? null;

    // Material quality score: 0.40×cement_block_wall + 0.35×(metal+concrete_roof) + 0.25×(cement+tile_floor)
    const qualityScore = (cementBlock !== null && metalRoof !== null && cementFloor !== null)
      ? Math.round((
          0.40 * (cementBlock ?? 0) +
          0.35 * ((metalRoof ?? 0) + (concreteRoof ?? 0)) +
          0.25 * ((cementFloor ?? 0) + (tileFloor ?? 0))
        ) * 100) / 100
      : null;

    await query(
      `INSERT INTO gss_phc_housing_profile_by_district
         (district, region, locality,
          cement_block_wall_pct, mud_earth_wall_pct,
          metal_sheet_roof_pct, concrete_roof_pct, thatch_roof_pct,
          cement_concrete_floor_pct, tile_floor_pct, earth_floor_pct,
          material_quality_score, synced_at)
       VALUES ($1,$2,'All Locality Types',$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (district, region, locality) DO UPDATE SET
         cement_block_wall_pct   = EXCLUDED.cement_block_wall_pct,
         mud_earth_wall_pct      = EXCLUDED.mud_earth_wall_pct,
         metal_sheet_roof_pct    = EXCLUDED.metal_sheet_roof_pct,
         concrete_roof_pct       = EXCLUDED.concrete_roof_pct,
         thatch_roof_pct         = EXCLUDED.thatch_roof_pct,
         cement_concrete_floor_pct = EXCLUDED.cement_concrete_floor_pct,
         tile_floor_pct          = EXCLUDED.tile_floor_pct,
         earth_floor_pct         = EXCLUDED.earth_floor_pct,
         material_quality_score  = EXCLUDED.material_quality_score,
         synced_at               = NOW()`,
      [region, region, cementBlock, mudEarth, metalRoof, concreteRoof, thatchRoof,
       cementFloor, tileFloor, earthFloor, qualityScore],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Completion fetch + upsert
// ---------------------------------------------------------------------------

async function fetchCompletion(): Promise<Record<string, Record<string, number | null>>> {
  const STAGES = [
    'Total', 'Fully Completed', 'Completely roofed but uncompleted',
    'Partially roofed', 'Roofing level (with improvised roof)', 'Lintel Level (with improvised roof)',
  ];
  const px = await pxPost(COMPLETION_PATH, [
    { code: 'Levelof_completion_residential', selection: { filter: 'item', values: STAGES } },
    { code: 'Locality', selection: { filter: 'item', values: ['All locality types'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
  ]);

  const cDim = px.dimension.Levelof_completion_residential;
  const geoDim = px.dimension.Geographic_Area;
  const locDim = px.dimension.Locality;
  if (!cDim || !geoDim || !locDim) return {};

  const nLoc = Object.keys(locDim.category.index).length;
  const nGeo = Object.keys(geoDim.category.index).length;

  const out: Record<string, Record<string, number | null>> = {};
  for (const [cCode, cIdx] of Object.entries(cDim.category.index)) {
    const cLabel = cDim.category.label[cCode] ?? cCode;
    for (const [gCode, gIdx] of Object.entries(geoDim.category.index)) {
      const gLabel = geoDim.category.label[gCode] ?? gCode;
      if (!out[gLabel]) out[gLabel] = {};
      const flatIdx = (cIdx as number) * (nLoc * nGeo) + 0 * nGeo + (gIdx as number);
      out[gLabel][cLabel] = px.value[flatIdx] ?? null;
    }
  }
  return out;
}

async function upsertCompletion(data: Record<string, Record<string, number | null>>): Promise<number> {
  let saved = 0;
  for (const [region, stages] of Object.entries(data)) {
    if (!GSS_REGIONS.includes(region)) continue;
    const total = stages['Total'] ?? null;
    const pct = (v: number | null) =>
      v !== null && total !== null && total > 0 ? Math.round((v / total) * 10000) / 100 : null;

    const fullyCompleted = pct(stages['Fully Completed'] ?? null);
    const roofedUncomp = pct(stages['Completely roofed but uncompleted'] ?? null);
    const partRoofed = pct(stages['Partially roofed'] ?? null);
    const roofingLevel = pct(stages['Roofing level (with improvised roof)'] ?? null);
    const lintelLevel = pct(stages['Lintel Level (with improvised roof)'] ?? null);

    const incompletePct = (fullyCompleted !== null)
      ? Math.round((100 - fullyCompleted) * 100) / 100 : null;

    await query(
      `INSERT INTO gss_phc_completion_by_district
         (district, region, locality,
          fully_completed_pct, roofed_uncompleted_pct, partially_roofed_pct,
          roofing_level_pct, lintel_level_pct, incomplete_residential_pct, synced_at)
       VALUES ($1,$2,'All locality types',$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (district, region, locality) DO UPDATE SET
         fully_completed_pct       = EXCLUDED.fully_completed_pct,
         roofed_uncompleted_pct    = EXCLUDED.roofed_uncompleted_pct,
         partially_roofed_pct      = EXCLUDED.partially_roofed_pct,
         roofing_level_pct         = EXCLUDED.roofing_level_pct,
         lintel_level_pct          = EXCLUDED.lintel_level_pct,
         incomplete_residential_pct = EXCLUDED.incomplete_residential_pct,
         synced_at                 = NOW()`,
      [region, region, fullyCompleted, roofedUncomp, partRoofed, roofingLevel, lintelLevel, incompletePct],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Infrastructure (light + water + toilet + waste) fetch + upsert
// ---------------------------------------------------------------------------

async function fetchInfrastructure(): Promise<{
  electric: Record<string, number | null>;
  pipedWater: Record<string, number | null>;
  improvedWater: Record<string, number | null>;
  safeWater: Record<string, number | null>;
  flushToilet: Record<string, number | null>;
  noToilet: Record<string, number | null>;
  formalWaste: Record<string, number | null>;
}> {
  await sleep(200);

  // Electricity: 'electric' aggregate includes all electric types
  // Water: 'Improved water sources' is the aggregate
  // Service: 'Improved Drinking Water Source' aggregate
  // Electricity: Toilet: Toilet: sum of flush/KVIP types
  // Waste: 'Collected' aggregate
  // NOTE: PHC API returns raw household COUNTS, not percentages.
  // We must fetch both the category count AND the Total and divide.
  const GEO = { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } };
  const LOC_ALL = (code: string) => ({ code: code, selection: { filter: 'item', values: ['All Locality Types'] } });

  const [
    lightTotalPx, electricPx,
    waterTotalPx, waterPipedPx, waterImprPx,
    serviceTotalPx, serviceImprPx,
    toiletTotalPx, toiletSepticPx, toiletKvipPx, toiletSewerPx,
    wasteTotalPx, wasteCollPx,
  ] = await Promise.all([
    pxPost(LIGHT_PATH, [{ code: 'Light', selection: { filter: 'item', values: ['Total'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(LIGHT_PATH, [{ code: 'Light', selection: { filter: 'item', values: ['electric'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(WATER_PATH, [{ code: 'Mainwater', selection: { filter: 'item', values: ['Total'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(WATER_PATH, [{ code: 'Mainwater', selection: { filter: 'item', values: ['Public tap/Stand pipe'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(WATER_PATH, [{ code: 'Mainwater', selection: { filter: 'item', values: ['Improved water sources'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(SERVICE_PATH, [{ code: 'Waterservice', selection: { filter: 'item', values: ['Total'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(SERVICE_PATH, [{ code: 'Waterservice', selection: { filter: 'item', values: ['Improved Drinking Water Source'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(TOILET_PATH, [{ code: 'Toiletfacility', selection: { filter: 'item', values: ['Total'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(TOILET_PATH, [{ code: 'Toiletfacility', selection: { filter: 'item', values: ['Septic tank'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(TOILET_PATH, [{ code: 'Toiletfacility', selection: { filter: 'item', values: ['KVIP/VIP'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(TOILET_PATH, [{ code: 'Toiletfacility', selection: { filter: 'item', values: ['Sewer'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(WASTE_PATH, [{ code: 'Solidwaste', selection: { filter: 'item', values: ['Total'] } }, LOC_ALL('Locality'), GEO]),
    pxPost(WASTE_PATH, [{ code: 'Solidwaste', selection: { filter: 'item', values: ['Collected'] } }, LOC_ALL('Locality'), GEO]),
  ]);

  const ex = (px: PxStat2, cls: string) => valuesByRegionSingleClass(px, cls, 'Locality', 'Geographic_Area');

  const lightTotMap = ex(lightTotalPx, 'Light');
  const electricMap = ex(electricPx, 'Light');
  const waterTotMap = ex(waterTotalPx, 'Mainwater');
  const waterPipMap = ex(waterPipedPx, 'Mainwater');
  const waterImrMap = ex(waterImprPx, 'Mainwater');
  const serviceTotMap = ex(serviceTotalPx, 'Waterservice');
  const serviceImrMap = ex(serviceImprPx, 'Waterservice');
  const toiletTotMap = ex(toiletTotalPx, 'Toiletfacility');
  const toiletSepMap = ex(toiletSepticPx, 'Toiletfacility');
  const toiletKvpMap = ex(toiletKvipPx, 'Toiletfacility');
  const toiletSwrMap = ex(toiletSewerPx, 'Toiletfacility');
  const wasteTotMap = ex(wasteTotalPx, 'Solidwaste');
  const wasteColMap = ex(wasteCollPx, 'Solidwaste');

  // Always divide by total — PHC returns raw household counts, not percentages
  const pct = (v: number | null, t: number | null) =>
    v !== null && t !== null && t > 0 ? Math.round((v / t) * 10000) / 100 : null;

  const electric: Record<string, number | null> = {};
  const pipedWater: Record<string, number | null> = {};
  const improvedWater: Record<string, number | null> = {};
  const safeWater: Record<string, number | null> = {};
  const flushToilet: Record<string, number | null> = {};
  const noToilet: Record<string, number | null> = {};
  const formalWaste: Record<string, number | null> = {};

  for (const r of GSS_REGIONS) {
    // Divide each category count by its Total count to get percentage 0-100
    electric[r] = pct(electricMap[r] ?? null, lightTotMap[r] ?? null);
    pipedWater[r] = pct(waterPipMap[r] ?? null, waterTotMap[r] ?? null);
    improvedWater[r] = pct(waterImrMap[r] ?? null, waterTotMap[r] ?? null);
    safeWater[r] = pct(serviceImrMap[r] ?? null, serviceTotMap[r] ?? null);
    const flushSum = (toiletSepMap[r] ?? 0) + (toiletKvpMap[r] ?? 0) + (toiletSwrMap[r] ?? 0);
    flushToilet[r] = pct(flushSum || null, toiletTotMap[r] ?? null);
    noToilet[r] = null;
    formalWaste[r] = pct(wasteColMap[r] ?? null, wasteTotMap[r] ?? null);
  }

  return { electric, pipedWater, improvedWater, safeWater, flushToilet, noToilet, formalWaste };
}

async function upsertInfrastructure(
  electric: Record<string, number | null>,
  pipedWater: Record<string, number | null>,
  improvedWater: Record<string, number | null>,
  safeWater: Record<string, number | null>,
  flushToilet: Record<string, number | null>,
  formalWaste: Record<string, number | null>,
  smartphone: Record<string, number | null>,
): Promise<number> {
  let saved = 0;
  for (const region of GSS_REGIONS) {
    const elec = electric[region] ?? null;
    const pip = pipedWater[region] ?? null;
    const impr = improvedWater[region] ?? null;
    const safe = safeWater[region] ?? null;
    const flush = flushToilet[region] ?? null;
    const waste = formalWaste[region] ?? null;
    const smart = smartphone[region] ?? null;

    // NIQS = 0.25×electricity + 0.20×piped + 0.15×improved + 0.15×flush + 0.15×waste + 0.10×smartphone
    const niqs = (elec !== null && pip !== null && flush !== null)
      ? Math.round((
          0.25 * (elec ?? 0) +
          0.20 * (pip ?? 0) +
          0.15 * (impr ?? 0) +
          0.15 * (flush ?? 0) +
          0.15 * (waste ?? 0) +
          0.10 * (smart ?? 0)
        ) * 100) / 100
      : null;

    await query(
      `INSERT INTO gss_phc_infrastructure_by_district
         (district, region, locality,
          electricity_grid_pct, piped_water_pct, improved_water_pct,
          safe_water_service_pct, flush_kvip_toilet_pct,
          formal_collection_pct, niqs_score, synced_at)
       VALUES ($1,$2,'All Locality Types',$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (district, region, locality) DO UPDATE SET
         electricity_grid_pct    = EXCLUDED.electricity_grid_pct,
         piped_water_pct         = EXCLUDED.piped_water_pct,
         improved_water_pct      = EXCLUDED.improved_water_pct,
         safe_water_service_pct  = EXCLUDED.safe_water_service_pct,
         flush_kvip_toilet_pct   = EXCLUDED.flush_kvip_toilet_pct,
         formal_collection_pct   = EXCLUDED.formal_collection_pct,
         niqs_score              = EXCLUDED.niqs_score,
         synced_at               = NOW()`,
      [region, region, elec, pip, impr, safe, flush, waste, niqs],
    );
    saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// ICT (smartphone) fetch + upsert
// ---------------------------------------------------------------------------

async function fetchSmartphone(): Promise<Record<string, number | null>> {
  await sleep(200);
  // Fetch both 'Yes' (smartphone owners) and 'Total' then compute percentage
  const makeQuery = (value: string) => [
    { code: 'Own_smartphone', selection: { filter: 'item', values: [value] } },
    { code: 'Education', selection: { filter: 'item', values: ['Total'] } },
    { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
    { code: 'Sex', selection: { filter: 'item', values: ['Both sexes'] } },
    { code: 'Age', selection: { filter: 'item', values: ['All ages'] } },
  ];

  const [yesPx, totalPx] = await Promise.all([
    pxPost(SMARTPHONE_PATH, makeQuery('Yes')),
    pxPost(SMARTPHONE_PATH, makeQuery('Total')),
  ]);

  const getRegionValue = (px: PxStat2): Record<string, number | null> => {
    const dimNames = Object.keys(px.dimension);
    const sizes = dimNames.map(n => Object.keys(px.dimension[n].category.index).length);
    const strides: number[] = new Array(dimNames.length).fill(1);
    for (let i = dimNames.length - 2; i >= 0; i--) strides[i] = strides[i + 1] * sizes[i + 1];
    const geoDimPos = dimNames.indexOf('Geographic_Area');
    const geoDim = px.dimension.Geographic_Area;
    if (!geoDim) return {};
    const out: Record<string, number | null> = {};
    for (const [gCode, gIdx] of Object.entries(geoDim.category.index)) {
      const gLabel = geoDim.category.label[gCode] ?? gCode;
      const flatIdx = (gIdx as number) * strides[geoDimPos];
      out[gLabel] = px.value[flatIdx] ?? null;
    }
    return out;
  };

  const yesMap = getRegionValue(yesPx);
  const totMap = getRegionValue(totalPx);

  const out: Record<string, number | null> = {};
  for (const region of GSS_REGIONS) {
    const yes = yesMap[region];
    const tot = totMap[region];
    out[region] = (yes !== null && tot !== null && tot > 0)
      ? Math.round((yes / tot) * 10000) / 100  // percentage 0-100
      : null;
  }
  return out;
}

async function upsertIct(smartphoneMap: Record<string, number | null>): Promise<number> {
  let saved = 0;
  for (const region of GSS_REGIONS) {
    const smart = smartphoneMap[region] ?? null;
    await query(
      `INSERT INTO gss_phc_ict_by_district
         (district, region, locality, smartphone_ownership_pct, synced_at)
       VALUES ($1,$2,'All Locality Types',$3,NOW())
       ON CONFLICT (district, region, locality) DO UPDATE SET
         smartphone_ownership_pct = EXCLUDED.smartphone_ownership_pct,
         synced_at                = NOW()`,
      [region, region, smart],
    );
    if (smart !== null) saved++;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class GSS_PHCHousingService {
  async sync(triggeredBy: string = 'scheduled'): Promise<SyncResult> {
    const source = 'GSS StatsBank PHC Housing';
    const startedAt = new Date();
    let syncId: string | undefined;
    let totalSaved = 0;
    const errors: SyncResult['errors'] = [];

    try {
      syncId = await syncLogRepository.startSync(source, 'scheduled', triggeredBy);
      logger.info('[GSS-PHC-Housing] Starting PHC housing census sync', { triggeredBy, syncId });

      // --- Tenure ---
      try {
        logger.info('[GSS-PHC-Housing] Fetching tenure data...');
        const tenureRows = await fetchTenure();
        const tenureSaved = await upsertTenure(tenureRows);
        totalSaved += tenureSaved;
        logger.info('[GSS-PHC-Housing] Tenure upserted', { saved: tenureSaved });
      } catch (err: any) {
        logger.error('[GSS-PHC-Housing] Tenure failed', { error: err.message });
        errors.push({ code: 'TENURE_ERROR', message: err.message, timestamp: new Date() });
      }

      await sleep(300);

      // --- Housing profile (wall + roof + floor) ---
      try {
        logger.info('[GSS-PHC-Housing] Fetching housing profile (materials)...');
        const { wall, roof, floor } = await fetchMaterialPcts();
        const profileSaved = await upsertHousingProfile(wall, roof, floor);
        totalSaved += profileSaved;
        logger.info('[GSS-PHC-Housing] Housing profile upserted', { saved: profileSaved });
      } catch (err: any) {
        logger.error('[GSS-PHC-Housing] Housing profile failed', { error: err.message });
        errors.push({ code: 'PROFILE_ERROR', message: err.message, timestamp: new Date() });
      }

      await sleep(300);

      // --- Completion ---
      try {
        logger.info('[GSS-PHC-Housing] Fetching completion data...');
        const completionData = await fetchCompletion();
        const completionSaved = await upsertCompletion(completionData);
        totalSaved += completionSaved;
        logger.info('[GSS-PHC-Housing] Completion upserted', { saved: completionSaved });
      } catch (err: any) {
        logger.error('[GSS-PHC-Housing] Completion failed', { error: err.message });
        errors.push({ code: 'COMPLETION_ERROR', message: err.message, timestamp: new Date() });
      }

      await sleep(300);

      // --- Infrastructure ---
      let smartphoneMap: Record<string, number | null> = {};
      try {
        logger.info('[GSS-PHC-Housing] Fetching ICT (smartphone) data...');
        smartphoneMap = await fetchSmartphone();
        const ictSaved = await upsertIct(smartphoneMap);
        totalSaved += ictSaved;
        logger.info('[GSS-PHC-Housing] ICT upserted', { saved: ictSaved });
      } catch (err: any) {
        logger.warn('[GSS-PHC-Housing] ICT failed (non-fatal)', { error: err.message });
        errors.push({ code: 'ICT_ERROR', message: err.message, timestamp: new Date() });
      }

      await sleep(300);

      try {
        logger.info('[GSS-PHC-Housing] Fetching infrastructure data...');
        const infra = await fetchInfrastructure();
        const infraSaved = await upsertInfrastructure(
          infra.electric, infra.pipedWater, infra.improvedWater,
          infra.safeWater, infra.flushToilet, infra.formalWaste,
          smartphoneMap,
        );
        totalSaved += infraSaved;
        logger.info('[GSS-PHC-Housing] Infrastructure upserted', { saved: infraSaved });
      } catch (err: any) {
        logger.error('[GSS-PHC-Housing] Infrastructure failed', { error: err.message });
        errors.push({ code: 'INFRA_ERROR', message: err.message, timestamp: new Date() });
      }

      const result: SyncResult = {
        source,
        status: errors.filter(e => ['TENURE_ERROR', 'COMPLETION_ERROR', 'INFRA_ERROR'].includes(e.code)).length > 0
          ? (totalSaved > 0 ? 'partial' : 'failed')
          : 'success',
        started_at: startedAt,
        completed_at: new Date(),
        records_fetched: totalSaved,
        records_saved: totalSaved,
        records_failed: 0,
        errors,
        metadata: {
          tables: ['gss_phc_tenure_by_district', 'gss_phc_housing_profile_by_district',
                   'gss_phc_completion_by_district', 'gss_phc_infrastructure_by_district',
                   'gss_phc_ict_by_district'],
        },
      };
      await syncLogRepository.completeSync(syncId, result);
      logger.info('[GSS-PHC-Housing] Sync complete', { saved: totalSaved, errors: errors.length });
      return result;
    } catch (err: any) {
      const result: SyncResult = {
        source, status: 'failed', started_at: startedAt, completed_at: new Date(),
        records_fetched: 0, records_saved: totalSaved, records_failed: 0,
        errors: [{ code: 'SYNC_ERROR', message: err.message, timestamp: new Date() }],
        metadata: {},
      };
      if (syncId) await syncLogRepository.completeSync(syncId, result);
      logger.error('[GSS-PHC-Housing] Sync failed', { error: err.message });
      return result;
    }
  }

  /** Get region-level tenure percentages — used by ghaiService for weight calibration. */
  async getTenureByRegion(): Promise<Record<string, {
    renting_pct: number | null;
    owner_occupied_pct: number | null;
    perching_pct: number | null;
  }>> {
    try {
      const r = await query<{
        region: string;
        renting_pct: string;
        owner_occupied_pct: string;
        perching_pct: string;
      }>(
        `SELECT DISTINCT ON (region) region, renting_pct, owner_occupied_pct, perching_pct
         FROM gss_phc_tenure_by_district
         WHERE locality = 'All Locality Types'
         ORDER BY region, synced_at DESC`,
      );
      const out: Record<string, { renting_pct: number | null; owner_occupied_pct: number | null; perching_pct: number | null }> = {};
      for (const row of r.rows) {
        out[regionKey(row.region)] = {
          renting_pct: row.renting_pct ? parseFloat(row.renting_pct) : null,
          owner_occupied_pct: row.owner_occupied_pct ? parseFloat(row.owner_occupied_pct) : null,
          perching_pct: row.perching_pct ? parseFloat(row.perching_pct) : null,
        };
      }
      return out;
    } catch {
      return {};
    }
  }

  /** Get completion risk % per region — used by CCRI in investmentScoringService. */
  async getCompletionByRegion(): Promise<Record<string, number | null>> {
    try {
      const r = await query<{ region: string; incomplete_residential_pct: string }>(
        `SELECT DISTINCT ON (region) region, incomplete_residential_pct
         FROM gss_phc_completion_by_district
         WHERE locality = 'All locality types'
         ORDER BY region, synced_at DESC`,
      );
      const out: Record<string, number | null> = {};
      for (const row of r.rows) {
        out[regionKey(row.region)] = row.incomplete_residential_pct
          ? parseFloat(row.incomplete_residential_pct) : null;
      }
      return out;
    } catch {
      return {};
    }
  }

  /** Get NIQS score per region. */
  async getNiqsByRegion(): Promise<Record<string, number | null>> {
    try {
      const r = await query<{ region: string; niqs_score: string }>(
        `SELECT DISTINCT ON (region) region, niqs_score
         FROM gss_phc_infrastructure_by_district
         WHERE locality = 'All Locality Types'
         ORDER BY region, synced_at DESC`,
      );
      const out: Record<string, number | null> = {};
      for (const row of r.rows) {
        out[regionKey(row.region)] = row.niqs_score ? parseFloat(row.niqs_score) : null;
      }
      return out;
    } catch {
      return {};
    }
  }

  /** Get material quality score per region — used by floorPlanAnalyticsService. */
  async getMaterialQualityByRegion(): Promise<Record<string, number | null>> {
    try {
      const r = await query<{ region: string; material_quality_score: string }>(
        `SELECT DISTINCT ON (region) region, material_quality_score
         FROM gss_phc_housing_profile_by_district
         WHERE locality = 'All Locality Types'
         ORDER BY region, synced_at DESC`,
      );
      const out: Record<string, number | null> = {};
      for (const row of r.rows) {
        out[regionKey(row.region)] = row.material_quality_score
          ? parseFloat(row.material_quality_score) : null;
      }
      return out;
    } catch {
      return {};
    }
  }
}

export const gssPhcHousingService = new GSS_PHCHousingService();
