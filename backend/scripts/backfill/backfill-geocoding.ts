#!/usr/bin/env npx ts-node
/**
 * Geocoding Backfill Script
 * 
 * Geocodes all properties that are missing latitude/longitude coordinates.
 * 
 * Priority order:
 * 1. Ghana Post GPS codes (digital_address field) - highest accuracy for Ghana
 * 2. External geocoding APIs (MapTiler, Mapbox, Google)
 * 
 * Usage:
 *   npx ts-node scripts/backfill/backfill-geocoding.ts
 *   npx ts-node scripts/backfill/backfill-geocoding.ts --batch-size=100 --delay=200
 *   npx ts-node scripts/backfill/backfill-geocoding.ts --dry-run
 * 
 * Options:
 *   --batch-size=N    Number of properties to process per batch (default: 50)
 *   --delay=N         Delay in ms between geocoding requests (default: 150)
 *   --dry-run         Just log what would be done without making changes
 *   --limit=N         Maximum number of properties to geocode (default: all)
 */

import { config } from 'dotenv';
import * as path from 'path';

// Load environment from backend directory
config({ path: path.join(__dirname, '../../.env') });

import { query, pool } from '../../src/database';
import { GeocodingService } from '../../src/services/data-hub/geocodingService';
import { ghanaPostService } from '../../src/services/data-hub/ghanaPostGeocodingService';
import { logger } from '../../src/utils/logger';

interface PropertyToGeocode {
  id: string;
  address_street: string | null;
  address_city: string | null;
  region: string | null;
  landmark: string | null;
  title: string | null;
  digital_address: string | null;
  description: string | null;
}

interface GeocodingStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  startTime: number;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    batchSize: 50,
    delay: 150,
    dryRun: false,
    limit: 0, // 0 = no limit
  };

  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--delay=')) {
      options.delay = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    }
  }

  return options;
}

/**
 * Build the best possible address string from property fields
 */
function buildAddressString(property: PropertyToGeocode): string | null {
  const parts: string[] = [];

  // Use address_street as primary
  if (property.address_street) {
    parts.push(property.address_street);
  }

  // Add landmark if available and different from address
  if (property.landmark && property.landmark !== property.address_street) {
    parts.push(property.landmark);
  }

  // Add city
  if (property.address_city) {
    parts.push(property.address_city);
  }

  // Add region (convert from snake_case to readable)
  if (property.region) {
    const regionMap: Record<string, string> = {
      'greater_accra': 'Greater Accra',
      'ashanti': 'Ashanti',
      'kumasi_metro': 'Kumasi',
      'eastern': 'Eastern Region',
      'western': 'Western Region',
      'western_cluster': 'Western Region',
      'central': 'Central Region',
      'northern': 'Northern Region',
      'northern_cluster': 'Northern Region',
      'volta': 'Volta Region',
      'upper_east': 'Upper East Region',
      'upper_west': 'Upper West Region',
    };
    parts.push(regionMap[property.region] || property.region.replace(/_/g, ' '));
  }

  // Need at least some address info
  if (parts.length === 0) {
    // Try to extract from title
    if (property.title) {
      return property.title;
    }
    return null;
  }

  return parts.join(', ');
}

/**
 * Try to extract Ghana Post GPS code from property fields
 */
function extractGPSCode(property: PropertyToGeocode): string | null {
  // Priority 1: Existing digital_address field
  if (property.digital_address) {
    const normalized = ghanaPostService.normalizeGPSCode(property.digital_address);
    if (normalized) return normalized;
  }

  // Priority 2: Extract from title
  if (property.title) {
    const fromTitle = ghanaPostService.extractGPSCode(property.title);
    if (fromTitle) return fromTitle;
  }

  // Priority 3: Extract from address_street
  if (property.address_street) {
    const fromAddress = ghanaPostService.extractGPSCode(property.address_street);
    if (fromAddress) return fromAddress;
  }

  // Priority 4: Extract from landmark
  if (property.landmark) {
    const fromLandmark = ghanaPostService.extractGPSCode(property.landmark);
    if (fromLandmark) return fromLandmark;
  }

  // Priority 5: Extract from description
  if (property.description) {
    const fromDescription = ghanaPostService.extractGPSCode(property.description);
    if (fromDescription) return fromDescription;
  }

  return null;
}

/**
 * Get properties that need geocoding
 */
async function getPropertiesToGeocode(limit: number): Promise<PropertyToGeocode[]> {
  let sql = `
    SELECT id, address_street, address_city, region, landmark, title, digital_address, description
    FROM properties 
    WHERE latitude IS NULL OR longitude IS NULL
    ORDER BY created_at DESC
  `;
  
  if (limit > 0) {
    sql += ` LIMIT ${limit}`;
  }

  const result = await query<PropertyToGeocode>(sql);
  return result.rows;
}

/**
 * Update property coordinates in database
 */
async function updatePropertyCoordinates(
  propertyId: string, 
  lat: number, 
  lng: number,
  confidence: number,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    logger.info(`[DRY RUN] Would update property ${propertyId} with coordinates: ${lat}, ${lng} (confidence: ${confidence})`);
    return;
  }

  // Convert confidence (0-1) to accuracy (1-10 scale where 10 is best)
  // If confidence < 0.5, it's likely a city/neighborhood centroid
  const accuracy = Math.round(confidence * 10);

  // Note: The location geometry is auto-populated by a trigger 
  // (trg_populate_property_location) when latitude/longitude are updated
  await query(`
    UPDATE properties 
    SET 
      latitude = $1::numeric(10,8), 
      longitude = $2::numeric(11,8),
      location_accuracy = $4,
      updated_at = NOW()
    WHERE id = $3::uuid
  `, [lat, lng, propertyId, accuracy]);
}

/**
 * Print progress statistics
 */
function printProgress(stats: GeocodingStats, current: number, total: number) {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = stats.success / elapsed;
  const remaining = total - current;
  const eta = remaining / rate;
  
  const progress = ((current / total) * 100).toFixed(1);
  const etaMin = Math.floor(eta / 60);
  const etaSec = Math.floor(eta % 60);

  console.log(`\n📊 Progress: ${current}/${total} (${progress}%)`);
  console.log(`   ✅ Success: ${stats.success} | ❌ Failed: ${stats.failed} | ⏭️  Skipped: ${stats.skipped}`);
  console.log(`   ⏱️  Elapsed: ${elapsed.toFixed(0)}s | Rate: ${rate.toFixed(2)}/s | ETA: ${etaMin}m ${etaSec}s`);
}

/**
 * Main backfill function
 */
async function backfillGeocoding() {
  const options = parseArgs();
  
  console.log('\n🌍 Geocoding Backfill Script');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`   Batch Size: ${options.batchSize}`);
  console.log(`   Delay: ${options.delay}ms`);
  console.log(`   Dry Run: ${options.dryRun}`);
  console.log(`   Limit: ${options.limit || 'No limit'}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Check API keys
  const hasMapbox = !!process.env.MAPBOX_ACCESS_TOKEN;
  const hasGoogle = !!process.env.GOOGLE_MAPS_API_KEY;
  const hasMaptiler = !!process.env.MAPTILER_API_KEY;
  
  console.log(`🔑 Geocoding Providers:`);
  console.log(`   🇬🇭 Ghana Post GPS: ✅ Built-in (grid decoder)`);
  console.log(`   MapTiler: ${hasMaptiler ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Mapbox: ${hasMapbox ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Google Maps: ${hasGoogle ? '✅ Configured' : '❌ Missing'}\n`);

  // Get properties that need geocoding
  console.log('📋 Fetching properties without coordinates...');
  const properties = await getPropertiesToGeocode(options.limit);
  console.log(`   Found ${properties.length} properties to geocode\n`);

  if (properties.length === 0) {
    console.log('✅ All properties already have coordinates!');
    await pool.end();
    return;
  }

  const geocodingService = new GeocodingService();
  
  const stats: GeocodingStats & { gpsSuccess: number } = {
    total: properties.length,
    success: 0,
    failed: 0,
    skipped: 0,
    gpsSuccess: 0,  // Track Ghana Post GPS successes
    startTime: Date.now(),
  };

  // Process properties
  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    
    // First, try to extract and geocode using Ghana Post GPS
    const gpsCode = extractGPSCode(property);
    
    if (gpsCode) {
      console.log(`\n[${i + 1}/${properties.length}] 🇬🇭 Trying Ghana Post GPS: ${gpsCode}`);
      
      try {
        const gpsResult = await ghanaPostService.geocodeDigitalAddress(gpsCode);
        
        if (gpsResult && gpsResult.latitude && gpsResult.longitude) {
          // GPS code geocoding succeeded - use higher accuracy
          const accuracy = gpsResult.source === 'gps_decode' ? 8 : 
                          gpsResult.source === 'neighborhood_lookup' ? 6 : 4;
          
          await updatePropertyCoordinates(
            property.id,
            gpsResult.latitude,
            gpsResult.longitude,
            gpsResult.confidence,
            options.dryRun
          );
          
          // Also update the digital_address if we extracted it from other fields
          if (!property.digital_address && !options.dryRun) {
            await query(`UPDATE properties SET digital_address = $1 WHERE id = $2`, [gpsCode, property.id]);
          }
          
          console.log(`   ✅ GPS Success: ${gpsResult.latitude.toFixed(6)}, ${gpsResult.longitude.toFixed(6)} (${gpsResult.source}, confidence: ${(gpsResult.confidence * 100).toFixed(0)}%)`);
          stats.success++;
          stats.gpsSuccess++;
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, options.delay));
          
          // Print progress every batch
          if ((i + 1) % options.batchSize === 0) {
            printProgress(stats, i + 1, properties.length);
          }
          continue;  // Skip to next property
        }
      } catch (error) {
        console.log(`   ⚠️  GPS decode failed, falling back to external geocoding`);
      }
    }
    
    // Fall back to address-based geocoding
    const address = buildAddressString(property);
    
    if (!address) {
      logger.warn(`Skipping property ${property.id} - no address information`);
      stats.skipped++;
      continue;
    }

    try {
      console.log(`\n[${i + 1}/${properties.length}] Geocoding: "${address.substring(0, 60)}..."`);
      
      // Geocode the address
      const result = await geocodingService.geocode(address);
      
      if (result && result.latitude && result.longitude) {
        await updatePropertyCoordinates(
          property.id, 
          result.latitude, 
          result.longitude,
          result.confidence || 0,
          options.dryRun
        );
        
        console.log(`   ✅ Success: ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)} (${result.provider}, confidence: ${(result.confidence * 100).toFixed(0)}%)`);
        stats.success++;
      } else {
        console.log(`   ❌ Failed: No results found`);
        stats.failed++;
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error('Geocoding error', { propertyId: property.id, error });
      stats.failed++;
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, options.delay));

    // Print progress every batch
    if ((i + 1) % options.batchSize === 0) {
      printProgress(stats, i + 1, properties.length);
    }
  }

  // Final summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 FINAL SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`   Total Processed: ${stats.total}`);
  console.log(`   ✅ Success: ${stats.success} (${((stats.success / stats.total) * 100).toFixed(1)}%)`);
  console.log(`      🇬🇭 Ghana Post GPS: ${stats.gpsSuccess} (${((stats.gpsSuccess / stats.total) * 100).toFixed(1)}%)`);
  console.log(`      🌍 External APIs: ${stats.success - stats.gpsSuccess} (${(((stats.success - stats.gpsSuccess) / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Failed: ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   ⏭️  Skipped: ${stats.skipped} (${((stats.skipped / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   ⏱️  Total Time: ${((Date.now() - stats.startTime) / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════════════════\n');

  await pool.end();
}

// Run the script
backfillGeocoding().catch((error) => {
  console.error('❌ Backfill script failed:', error);
  process.exit(1);
});
