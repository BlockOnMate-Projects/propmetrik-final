/**
 * backfill-ml-data.ts
 *
 * One-shot backfill that wires existing property data into the ML monitoring tables:
 *
 *  1. valuation_comparables — each priced, geolocated property becomes a comparable
 *     (source_type='database', evidence_type='listing').  Skips any property that
 *     already has a row in the table (idempotent via ON CONFLICT DO NOTHING on
 *     comparable_property_id when valuation_id IS NULL).
 *
 *  2. ml_predictions — runs all qualifying properties through the ML serving API
 *     (/predict) in batches of 50 and writes results to ml_predictions.  Skips
 *     properties whose property_id is already present in the table.
 *
 * Usage:
 *   npx ts-node scripts/backfill-ml-data.ts
 *   npx ts-node scripts/backfill-ml-data.ts --comparables-only
 *   npx ts-node scripts/backfill-ml-data.ts --predictions-only
 *   npx ts-node scripts/backfill-ml-data.ts --dry-run
 */

import { Pool } from 'pg';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const DB_CONFIG = {
  host: process.env.DB_HOST || 'pg.cedynhq.com',
  port: parseInt(process.env.DB_PORT || '5434'),
  database: process.env.DB_NAME || 'propmetrik',
  user: process.env.DB_USER || 'propmetrik_app',
  password: process.env.DB_PASSWORD || '3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn',
};

const ML_URL = process.env.ML_SERVING_URL || 'http://localhost:8000';
const PREDICT_BATCH = 50;
const DRY_RUN = process.argv.includes('--dry-run');
const COMPARABLES_ONLY = process.argv.includes('--comparables-only');
const PREDICTIONS_ONLY = process.argv.includes('--predictions-only');

const pool = new Pool(DB_CONFIG);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function priceBand(value: number): string {
  if (value < 100_000)   return 'under_100k';
  if (value < 300_000)   return '100k_300k';
  if (value < 600_000)   return '300k_600k';
  if (value < 1_000_000) return '600k_1m';
  if (value < 3_000_000) return '1m_3m';
  return 'over_3m';
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Backfill valuation_comparables
// ─────────────────────────────────────────────────────────────────────────────

async function backfillComparables(): Promise<void> {
  log('=== Backfilling valuation_comparables ===');

  const { rows: existing } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM valuation_comparables WHERE valuation_id IS NULL`
  );
  log(`Existing standalone comparables: ${existing[0].cnt}`);

  const { rows: already } = await pool.query<{ property_ids: string[] }>(
    `SELECT ARRAY_AGG(comparable_property_id::text) AS property_ids
     FROM valuation_comparables WHERE valuation_id IS NULL`
  );
  const alreadySet = new Set<string>(already[0]?.property_ids ?? []);

  const { rows: properties } = await pool.query(`
    SELECT
      id, property_type, bedrooms, bathrooms,
      built_area_sqm, land_area_sqm AS land_size_sqm,
      year_built, condition, latitude, longitude,
      price, price_currency, sold_price, sold_at,
      region,
      CONCAT_WS(', ', address_street, address_city, address_district) AS address_formatted,
      neighborhood_id
    FROM properties
    WHERE price IS NOT NULL AND price > 0
      AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY created_at DESC
  `);

  log(`Qualifying properties for comparables: ${properties.length}`);

  const toInsert = properties.filter(p => !alreadySet.has(p.id));
  log(`New comparables to insert: ${toInsert.length}`);

  if (DRY_RUN || toInsert.length === 0) {
    log(DRY_RUN ? 'DRY RUN — skipping insert' : 'Nothing new to insert');
    return;
  }

  let inserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const values: any[] = [];
    const placeholders: string[] = [];
    let p = 1;

    for (const row of chunk) {
      const saleDate = row.sold_at ? new Date(row.sold_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const salePrice = row.sold_price && parseFloat(row.sold_price) > 0 ? parseFloat(row.sold_price) : parseFloat(row.price);
      const currency = row.price_currency || 'GHS';

      placeholders.push(
        `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`
      );
      values.push(
        row.id,                          // comparable_property_id
        'database',                      // source_type
        row.property_type,
        row.bedrooms ?? null,
        row.bathrooms ?? null,
        row.built_area_sqm ? parseFloat(row.built_area_sqm) : null,
        row.land_size_sqm ? parseFloat(row.land_size_sqm) : null,
        row.year_built ?? null,
        row.condition ?? null,
        row.latitude ? parseFloat(row.latitude) : null,
        row.longitude ? parseFloat(row.longitude) : null,
        salePrice,
        currency,
        saleDate,
        'listing',                       // evidence_type
        parseFloat(row.price),           // asking_price
        row.address_formatted ?? null,
        row.region ?? null,
      );
    }

    await pool.query(`
      INSERT INTO valuation_comparables (
        comparable_property_id, source_type, property_type,
        bedrooms, bathrooms, building_size_sqm, land_size_sqm,
        year_built, condition, latitude, longitude,
        sale_price, sale_currency, sale_date,
        evidence_type, asking_price, address_formatted, neighborhood
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT DO NOTHING
    `, values);

    inserted += chunk.length;
    log(`  Inserted comparables chunk ${i}–${i + chunk.length} (${inserted} total)`);
  }

  log(`valuation_comparables backfill done — ${inserted} rows inserted`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Backfill ml_predictions
// ─────────────────────────────────────────────────────────────────────────────

async function backfillPredictions(): Promise<void> {
  log('=== Backfilling ml_predictions ===');

  // Skip properties already predicted
  const { rows: alreadyRows } = await pool.query<{ property_id: string }>(
    `SELECT DISTINCT property_id::text FROM ml_predictions WHERE property_id IS NOT NULL`
  );
  const alreadySet = new Set(alreadyRows.map(r => r.property_id));
  log(`Already have predictions for ${alreadySet.size} properties`);

  const { rows: properties } = await pool.query(`
    SELECT
      id, property_type, region,
      bedrooms, bathrooms, floors,
      built_area_sqm, total_area_sqm, land_area_sqm,
      latitude, longitude, year_built,
      features, amenities
    FROM properties
    WHERE price IS NOT NULL AND price > 0
      AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY created_at DESC
  `);

  const todo = properties.filter(p => !alreadySet.has(p.id));
  log(`Properties to predict: ${todo.length}`);

  if (DRY_RUN || todo.length === 0) {
    log(DRY_RUN ? 'DRY RUN — skipping prediction' : 'Nothing new to predict');
    return;
  }

  // Get active model version
  let modelVersion = 'latest';
  try {
    const health = await axios.get(`${ML_URL}/health`, { timeout: 5000 });
    modelVersion = health.data?.active_model ?? 'latest';
  } catch {
    log('Warning: could not reach ML service — will use "latest"');
  }
  log(`Using model version: ${modelVersion}`);

  let predicted = 0;
  let errors = 0;

  for (let i = 0; i < todo.length; i += PREDICT_BATCH) {
    const batch = todo.slice(i, i + PREDICT_BATCH);

    const payload = {
      properties: batch.map(p => ({
        property_type: p.property_type ?? 'residential_house',
        region: p.region ?? 'greater_accra',
        bedrooms: p.bedrooms ? parseInt(p.bedrooms) : 0,
        bathrooms: p.bathrooms ? parseInt(p.bathrooms) : 0,
        floors: p.floors ? parseInt(p.floors) : 1,
        built_area_sqm: p.built_area_sqm ? parseFloat(p.built_area_sqm) : (p.total_area_sqm ? parseFloat(p.total_area_sqm) : 100),
        total_area_sqm: p.total_area_sqm ? parseFloat(p.total_area_sqm) : null,
        land_area_sqm: p.land_area_sqm ? parseFloat(p.land_area_sqm) : null,
        latitude: parseFloat(p.latitude),
        longitude: parseFloat(p.longitude),
        year_built: p.year_built ? parseInt(p.year_built) : null,
        has_pool: p.features?.pool ?? false,
        has_ac: p.features?.air_conditioning ?? false,
        has_garden: p.features?.garden ?? false,
        has_fitted_kitchen: p.features?.fitted_kitchen ?? false,
      })),
      include_confidence: true,
    };

    try {
      const res = await axios.post(`${ML_URL}/predict`, payload, { timeout: 30000 });
      const preds: any[] = res.data?.predictions ?? [];

      // Write to ml_predictions directly via DB (bypass the async background task in ml-serving)
      const values: any[] = [];
      const placeholders: string[] = [];
      let p = 1;

      for (let j = 0; j < preds.length; j++) {
        const prop = batch[j];
        const pred = preds[j];
        if (!pred || !pred.predicted_value_ghs) continue;

        // Cap at 10B GHS to prevent NUMERIC(15,2) overflow; clamp confidence to NUMERIC(4,3)
        const rawVal = parseFloat(pred.predicted_value_ghs);
        const val = isFinite(rawVal) ? Math.min(rawVal, 9_999_999_999.99) : 0;
        placeholders.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
        values.push(
          prop.id,                    // property_id
          res.data.model_version ?? modelVersion,
          prop.property_type ?? 'residential_house',
          prop.region ?? 'greater_accra',
          priceBand(val),
          val,
          pred.confidence_score != null ? Math.max(0.001, Math.min(0.999, parseFloat(pred.confidence_score))) : null,
          JSON.stringify({
            bedrooms: prop.bedrooms,
            bathrooms: prop.bathrooms,
            built_area_sqm: prop.built_area_sqm,
            total_area_sqm: prop.total_area_sqm,
            latitude: prop.latitude,
            longitude: prop.longitude,
          }),
          // backfill: set actual_value = asking price so drift detection has ground truth
          null,                       // actual_value (unknown for backfill — left null)
        );
      }

      if (placeholders.length > 0) {
        await pool.query(`
          INSERT INTO ml_predictions
            (property_id, model_version, property_type, region, price_band,
             predicted_value, confidence, features, actual_value)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT DO NOTHING
        `, values);
      }

      predicted += preds.length;
      if ((i / PREDICT_BATCH) % 10 === 0) {
        log(`  Progress: ${predicted}/${todo.length} predicted`);
      }
    } catch (err: any) {
      errors++;
      log(`  Error on batch ${i}: ${err.message}`);
      if (errors > 20) { log('Too many errors — aborting predictions'); break; }
    }
  }

  log(`ml_predictions backfill done — ${predicted} predictions written, ${errors} errors`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  log(`Starting ML data backfill ${DRY_RUN ? '(DRY RUN)' : ''}`);
  try {
    if (!PREDICTIONS_ONLY) await backfillComparables();
    if (!COMPARABLES_ONLY) await backfillPredictions();
    log('=== Backfill complete ===');
  } catch (err: any) {
    console.error('Backfill failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
