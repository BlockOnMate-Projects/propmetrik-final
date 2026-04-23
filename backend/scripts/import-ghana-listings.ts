/**
 * Ghana Property Listings Import Script
 *
 * Imports comparable property listings from public Ghana property portals
 * into the `properties` table so the ML training pipeline picks them up.
 *
 * Sources supported:
 *   1. Meqasa  — https://meqasa.com (HTML scrape, polite delays)
 *   2. Tonaton — https://tonaton.com/en/property (HTML scrape)
 *   3. JSON/CSV bulk-file import  (--file flag)
 *
 * Usage:
 *   npx ts-node scripts/import-ghana-listings.ts              # scrape all sources
 *   npx ts-node scripts/import-ghana-listings.ts --source meqasa --limit 300
 *   npx ts-node scripts/import-ghana-listings.ts --file ./data/listings.json
 *   npx ts-node scripts/import-ghana-listings.ts --dry-run    # preview only
 *
 * Each imported listing is written with:
 *   data_source  = 'tier5_web'
 *   status       = 'active'
 *   verification_status = 'unverified'
 *
 * The training pipeline queries:
 *   WHERE price IS NOT NULL AND price > 0 AND latitude IS NOT NULL
 * so imported records need at least price + lat/lng to be useful.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const hasFlag = (flag: string) => args.includes(flag);

const SOURCE = getArg('--source') || 'all';
const LIMIT = parseInt(getArg('--limit') || '500', 10);
const FILE = getArg('--file');
const DRY_RUN = hasFlag('--dry-run');

// ─── DB ──────────────────────────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || 'pg.cedynhq.com',
  port: parseInt(process.env.DB_PORT || '5434', 10),
  database: process.env.DB_NAME || 'propmetrik',
  user: process.env.DB_USER || 'propmetrik_app',
  password: process.env.DB_PASSWORD || '3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn',
  max: 5,
});

// ─── Types ───────────────────────────────────────────────────────────────────
interface ListingRaw {
  source_url: string;
  external_id: string;   // unique per-source ID so we don't re-import
  title: string;
  property_type: string;
  transaction_type: 'sale' | 'rental' | 'lease';
  region: string;
  address_city: string;
  address_district?: string;
  address_street?: string;
  price_ghs: number;
  bedrooms?: number;
  bathrooms?: number;
  built_area_sqm?: number;
  land_area_sqm?: number;
  latitude?: number;
  longitude?: number;
  description?: string;
}

// ─── Region / type normalizers ───────────────────────────────────────────────
const REGION_MAP: Record<string, string> = {
  'greater accra': 'greater_accra',
  'accra': 'greater_accra',
  'east legon': 'greater_accra',
  'airport': 'greater_accra',
  'cantonments': 'greater_accra',
  'labone': 'greater_accra',
  'tema': 'greater_accra',
  'adenta': 'greater_accra',
  'spintex': 'greater_accra',
  'ashale botwe': 'greater_accra',
  'sakumono': 'greater_accra',
  'kumasi': 'kumasi_metro',
  'ashanti': 'kumasi_metro',
  'eastern': 'eastern',
  'koforidua': 'eastern',
  'western': 'western_cluster',
  'takoradi': 'western_cluster',
  'sekondi': 'western_cluster',
  'northern': 'northern_cluster',
  'tamale': 'northern_cluster',
};

const TYPE_MAP: Record<string, string> = {
  'house': 'residential_house',
  'townhouse': 'residential_house',
  'villa': 'residential_house',
  'bungalow': 'residential_house',
  'detached': 'residential_house',
  'semi-detached': 'residential_house',
  'apartment': 'apartment_flat',
  'flat': 'apartment_flat',
  'studio': 'apartment_flat',
  'penthouse': 'apartment_flat',
  'condo': 'apartment_flat',
  'shop': 'commercial_shop',
  'office': 'commercial_office',
  'warehouse': 'warehouse',
  'land': 'land',
  'plot': 'land',
  'mixed': 'mixed_use',
};

function normalizeRegion(raw: string): string {
  const lower = raw.toLowerCase().trim();
  for (const [k, v] of Object.entries(REGION_MAP)) {
    if (lower.includes(k)) return v;
  }
  return 'greater_accra';
}

function normalizePropertyType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  for (const [k, v] of Object.entries(TYPE_MAP)) {
    if (lower.includes(k)) return v;
  }
  return 'residential_house';
}

/** Delay helper — be a polite scraper */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Meqasa scraper ──────────────────────────────────────────────────────────
async function scrapeMeqasa(limit: number): Promise<ListingRaw[]> {
  const results: ListingRaw[] = [];
  const BASE = 'https://meqasa.com';

  const listingUrls = [
    '/properties-for-sale-in-greater-accra',
    '/apartments-for-sale-in-greater-accra',
    '/houses-for-sale-in-kumasi',
    '/properties-for-rent-in-greater-accra',
    '/land-for-sale-in-greater-accra',
  ];

  for (const path of listingUrls) {
    if (results.length >= limit) break;
    let page = 1;

    while (results.length < limit) {
      const url = `${BASE}${path}?page=${page}`;
      try {
        const resp = await axios.get(url, {
          headers: { 'User-Agent': 'PropMetrik-DataBot/1.0 (research; contact@propmetrik.com)' },
          timeout: 15000,
        });
        const $ = cheerio.load(resp.data);

        const cards = $('[class*="property-card"], [class*="listing-card"], .propcard, .unit');
        if (cards.length === 0) break;

        cards.each((_i, el) => {
          if (results.length >= limit) return false;
          try {
            const $el = $(el);
            const link = $el.find('a[href*="/details/"]').first().attr('href') || '';
            const extId = link.match(/\/details\/(\d+)/)?.[1] || '';
            if (!extId) return;

            const titleText = $el.find('[class*="title"], h2, h3').first().text().trim();
            const priceText = $el.find('[class*="price"]').first().text().replace(/[^0-9,.]/g, '').replace(/,/g, '');
            const price = parseFloat(priceText);
            if (!price || isNaN(price) || price < 1000) return;

            const locationText = $el.find('[class*="location"], [class*="address"]').first().text().trim();
            const bedsText = $el.find('[class*="bed"], [title*="bedroom"]').first().text().trim();
            const bathsText = $el.find('[class*="bath"]').first().text().trim();

            const isRental = path.includes('for-rent');
            const txType: 'sale' | 'rental' = isRental ? 'rental' : 'sale';
            const typeHint = path.includes('land') ? 'land'
              : path.includes('apartment') ? 'apartment'
              : path.includes('house') ? 'house'
              : titleText.toLowerCase().includes('land') ? 'land'
              : titleText.toLowerCase().includes('apartment') ? 'apartment'
              : 'house';

            results.push({
              source_url: `${BASE}${link}`,
              external_id: `meqasa_${extId}`,
              title: titleText || `${typeHint} for ${txType}`,
              property_type: normalizePropertyType(typeHint),
              transaction_type: txType,
              region: normalizeRegion(locationText || path),
              address_city: locationText.split(',')[0]?.trim() || 'Accra',
              address_district: locationText.split(',')[1]?.trim(),
              price_ghs: price,
              bedrooms: parseInt(bedsText) || undefined,
              bathrooms: parseInt(bathsText) || undefined,
            });
          } catch { /* skip bad card */ }
        });

        page++;
        await sleep(1500); // polite delay
      } catch (err: any) {
        console.warn(`  Meqasa page failed: ${url} — ${err.message}`);
        break;
      }
    }
  }

  return results;
}

// ─── Tonaton scraper ─────────────────────────────────────────────────────────
async function scrapeTonaton(limit: number): Promise<ListingRaw[]> {
  const results: ListingRaw[] = [];
  const BASE = 'https://tonaton.com';

  const paths = [
    '/en/property/houses-for-sale',
    '/en/property/apartments-for-sale',
    '/en/property/land-for-sale',
    '/en/property/houses-for-rent',
  ];

  for (const p of paths) {
    if (results.length >= limit) break;
    let page = 1;

    while (results.length < limit) {
      const url = `${BASE}${p}?page=${page}`;
      try {
        const resp = await axios.get(url, {
          headers: { 'User-Agent': 'PropMetrik-DataBot/1.0 (research; contact@propmetrik.com)' },
          timeout: 15000,
        });
        const $ = cheerio.load(resp.data);

        const cards = $('.listing-card, .product, [data-listing-id]');
        if (cards.length === 0) break;

        cards.each((_i, el) => {
          if (results.length >= limit) return false;
          try {
            const $el = $(el);
            const extId = $el.attr('data-listing-id') || $el.find('[data-listing-id]').attr('data-listing-id') || '';
            if (!extId) return;

            const titleText = $el.find('h2, h3, .title').first().text().trim();
            const priceText = $el.find('.price, [class*="price"]').first().text().replace(/[^0-9.]/g, '');
            const price = parseFloat(priceText);
            if (!price || isNaN(price) || price < 1000) return;

            const locationText = $el.find('.location, [class*="location"]').first().text().trim();
            const isRental = p.includes('for-rent');
            const typeHint = p.includes('land') ? 'land' : p.includes('apartment') ? 'apartment' : 'house';

            results.push({
              source_url: `${BASE}${p}/${extId}`,
              external_id: `tonaton_${extId}`,
              title: titleText || `Property ${extId}`,
              property_type: normalizePropertyType(typeHint),
              transaction_type: isRental ? 'rental' : 'sale',
              region: normalizeRegion(locationText),
              address_city: locationText.split(',')[0]?.trim() || 'Accra',
              address_district: locationText.split(',')[1]?.trim(),
              price_ghs: price,
            });
          } catch { /* skip */ }
        });

        page++;
        await sleep(2000);
      } catch (err: any) {
        console.warn(`  Tonaton page failed: ${url} — ${err.message}`);
        break;
      }
    }
  }

  return results;
}

// ─── JSON/CSV file loader ─────────────────────────────────────────────────────
function loadFromFile(filePath: string): ListingRaw[] {
  const abs = path.resolve(filePath);
  const content = fs.readFileSync(abs, 'utf-8').trim();

  if (abs.endsWith('.json') || content.startsWith('[') || content.startsWith('{')) {
    const data = JSON.parse(content);
    const rows = Array.isArray(data) ? data : data.listings || data.data || [];
    return rows.map((r: any, i: number) => ({
      source_url: r.source_url || r.url || '',
      external_id: r.external_id || r.id || `file_${i}`,
      title: r.title || r.name || 'Imported listing',
      property_type: normalizePropertyType(r.property_type || r.type || 'house'),
      transaction_type: r.transaction_type || r.listing_type || 'sale',
      region: normalizeRegion(r.region || r.location || 'accra'),
      address_city: r.address_city || r.city || r.location || 'Accra',
      address_district: r.address_district || r.district,
      address_street: r.address_street || r.street,
      price_ghs: parseFloat(r.price_ghs || r.price || 0),
      bedrooms: r.bedrooms ? parseInt(r.bedrooms) : undefined,
      bathrooms: r.bathrooms ? parseInt(r.bathrooms) : undefined,
      built_area_sqm: r.built_area_sqm || r.area_sqm || r.floor_area_sqm,
      land_area_sqm: r.land_area_sqm || r.plot_area_sqm,
      latitude: r.latitude ? parseFloat(r.latitude) : undefined,
      longitude: r.longitude ? parseFloat(r.longitude) : undefined,
      description: r.description,
    }));
  }

  // CSV — minimal parsing
  const lines = content.split('\n').filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map((line, i) => {
    const cols = line.split(',');
    const get = (name: string) => cols[headers.indexOf(name)]?.trim() || '';
    return {
      source_url: get('source_url') || get('url') || '',
      external_id: get('external_id') || get('id') || `csv_${i}`,
      title: get('title') || `Listing ${i + 1}`,
      property_type: normalizePropertyType(get('property_type') || get('type') || 'house'),
      transaction_type: (get('transaction_type') || 'sale') as 'sale' | 'rental' | 'lease',
      region: normalizeRegion(get('region') || get('location') || 'accra'),
      address_city: get('city') || get('address_city') || 'Accra',
      address_district: get('district') || undefined,
      price_ghs: parseFloat(get('price_ghs') || get('price') || '0'),
      bedrooms: parseInt(get('bedrooms') || '0') || undefined,
      bathrooms: parseInt(get('bathrooms') || '0') || undefined,
      built_area_sqm: parseFloat(get('built_area_sqm') || get('area_sqm') || '0') || undefined,
      latitude: parseFloat(get('latitude') || '0') || undefined,
      longitude: parseFloat(get('longitude') || '0') || undefined,
    };
  }).filter(r => r.price_ghs > 0);
}

// ─── DB upsert ────────────────────────────────────────────────────────────────
async function upsertListings(listings: ListingRaw[]): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0, skipped = 0, errors = 0;

  for (const l of listings) {
    try {
      // Skip if already imported (match on dedicated external_id column)
      const exists = await pool.query(
        `SELECT id FROM properties WHERE external_id = $1 LIMIT 1`,
        [l.external_id]
      );
      if (exists.rows.length > 0) { skipped++; continue; }

      const refNum = `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      await pool.query(
        `INSERT INTO properties (
           reference_number, region, address_city, address_district, address_street,
           property_type, transaction_type, title, description,
           bedrooms, bathrooms, built_area_sqm, land_area_sqm,
           latitude, longitude, price, price_currency,
           status, data_source, verification_status,
           external_id, external_source, metadata,
           created_at, updated_at
         ) VALUES (
           $1, $2::region_code_enum, $3, $4, $5,
           $6::property_type_enum, $7::transaction_type_enum, $8, $9,
           $10, $11, $12, $13,
           $14, $15, $16, 'GHS',
           'active', 'tier5_web'::source_type_enum, 'unverified',
           $17, $18, $19::jsonb,
           NOW(), NOW()
         )`,
        [
          refNum,
          l.region,
          l.address_city,
          l.address_district || null,
          l.address_street || null,
          l.property_type,
          l.transaction_type,
          l.title.slice(0, 499),
          l.description || null,
          l.bedrooms || null,
          l.bathrooms || null,
          l.built_area_sqm || null,
          l.land_area_sqm || null,
          l.latitude || null,
          l.longitude || null,
          Math.min(l.price_ghs, 9_999_999_999_999.99),
          l.external_id,
          l.source_url ? new URL(l.source_url).hostname : 'file_import',
          JSON.stringify({
            source_url: l.source_url,
            import_date: new Date().toISOString(),
          }),
        ]
      );
      inserted++;
    } catch (err: any) {
      console.error(`  Error inserting ${l.external_id}: ${err.message}`);
      errors++;
    }
  }

  return { inserted, skipped, errors };
}

// ─── Geocode approximation ────────────────────────────────────────────────────
// Attach approximate lat/lng for listings that have none, using known city centres.
// This gives the ML model a location signal even without precise coords.
const CITY_COORDS: Record<string, [number, number]> = {
  'accra': [5.5600, -0.2057],
  'east legon': [5.6364, -0.1527],
  'cantonments': [5.5710, -0.1720],
  'labone': [5.5680, -0.1750],
  'airport': [5.5850, -0.1840],
  'spintex': [5.6200, -0.1050],
  'tema': [5.6698, -0.0166],
  'adenta': [5.7000, -0.1636],
  'kumasi': [6.6885, -1.6244],
  'koforidua': [6.0915, -0.2624],
  'takoradi': [4.8845, -1.7554],
  'tamale': [9.4008, -0.8393],
};

function approximateCoords(city: string): [number | null, number | null] {
  const lower = city.toLowerCase().trim();
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (lower.includes(name)) {
      // Add small jitter (±0.01°) so identical-city rows aren't stacked
      const jitter = () => (Math.random() - 0.5) * 0.02;
      return [coords[0] + jitter(), coords[1] + jitter()];
    }
  }
  return [null, null];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Ghana Property Listings Import');
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(` Source: ${FILE ? 'file: ' + FILE : SOURCE}  |  Limit: ${LIMIT}  |  Dry-run: ${DRY_RUN}\n`);

  let listings: ListingRaw[] = [];

  if (FILE) {
    console.log(`Loading from file: ${FILE}`);
    listings = loadFromFile(FILE);
    console.log(`  Loaded ${listings.length} records from file`);
  } else {
    if (SOURCE === 'all' || SOURCE === 'meqasa') {
      console.log('Scraping Meqasa...');
      try {
        const m = await scrapeMeqasa(Math.ceil(LIMIT / 2));
        console.log(`  Meqasa: ${m.length} listings`);
        listings.push(...m);
      } catch (e: any) {
        console.warn(`  Meqasa scrape failed: ${e.message}`);
      }
    }

    if (SOURCE === 'all' || SOURCE === 'tonaton') {
      console.log('Scraping Tonaton...');
      try {
        const t = await scrapeTonaton(Math.ceil(LIMIT / 2));
        console.log(`  Tonaton: ${t.length} listings`);
        listings.push(...t);
      } catch (e: any) {
        console.warn(`  Tonaton scrape failed: ${e.message}`);
      }
    }
  }

  // Fill in approximate coords for listings missing lat/lng
  let coordsFilled = 0;
  for (const l of listings) {
    if (!l.latitude || !l.longitude) {
      const [lat, lng] = approximateCoords(l.address_city || l.region);
      if (lat && lng) {
        l.latitude = lat;
        l.longitude = lng;
        coordsFilled++;
      }
    }
  }

  // Filter out zero-price rows
  const valid = listings.filter(l => l.price_ghs > 0);
  const dropped = listings.length - valid.length;

  console.log(`\n Summary before import:`);
  console.log(`  Total scraped: ${listings.length}`);
  console.log(`  Valid (price > 0): ${valid.length}`);
  console.log(`  Dropped (no price): ${dropped}`);
  console.log(`  Coords approximated: ${coordsFilled}`);
  console.log(`  With exact coords: ${valid.filter(l => l.latitude).length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 5 records:');
    valid.slice(0, 5).forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.title} | GHS ${l.price_ghs.toLocaleString()} | ${l.region} | ${l.external_id}`);
    });
    console.log('\n[DRY RUN] No rows written. Re-run without --dry-run to import.');
    await pool.end();
    return;
  }

  console.log('\nInserting to database...');
  const { inserted, skipped, errors } = await upsertListings(valid.slice(0, LIMIT));

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(` Import complete`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (inserted > 0) {
    const total = await pool.query(
      `SELECT COUNT(*) FROM properties WHERE price IS NOT NULL AND price > 0 AND latitude IS NOT NULL`
    );
    console.log(`ML-eligible properties now in DB: ${total.rows[0].count}`);
    console.log('The auto-retrain scheduler will pick these up on the next check cycle.\n');
  }

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
