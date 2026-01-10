/**
 * Mark Approximate Locations Script
 * 
 * Identifies and marks properties with approximate geocoding (city/neighborhood centroid)
 * based on coordinate clustering. Properties sharing exact coordinates with many others
 * are likely geocoded to a centroid fallback.
 */

import { config } from 'dotenv';
import * as path from 'path';

// Load environment from backend directory
config({ path: path.join(__dirname, '../../.env') });

import { query, pool } from '../../src/database';
import { logger } from '../../src/utils/logger';

// Location accuracy scale (1-10)
// 10 = Precise building/address match
// 7-9 = Street-level accuracy
// 4-6 = Neighborhood level
// 1-3 = City/area centroid (approximate)
const APPROXIMATE_ACCURACY = 2;
const NEIGHBORHOOD_ACCURACY = 5;

interface CoordinateCluster {
  latitude: number;
  longitude: number;
  count: number;
}

async function markApproximateLocations(dryRun: boolean = false): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('      MARK APPROXIMATE LOCATIONS');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  try {
    // Step 1: Find coordinate clusters (5+ properties at same location)
    console.log('📍 Finding coordinate clusters...\n');
    
    const clusterResult = await query<CoordinateCluster>(`
      SELECT 
        latitude::float,
        longitude::float,
        COUNT(*) as count
      FROM properties
      WHERE latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND location_accuracy IS NULL
      GROUP BY latitude, longitude
      HAVING COUNT(*) >= 5
      ORDER BY COUNT(*) DESC
    `);

    const clusters = clusterResult.rows;
    console.log(`Found ${clusters.length} coordinate clusters with 5+ properties\n`);

    if (clusters.length === 0) {
      console.log('No clusters found. All locations may already be marked.');
      return;
    }

    // Show top clusters
    console.log('Top clusters:');
    clusters.slice(0, 10).forEach((c: CoordinateCluster, i: number) => {
      console.log(`  ${i + 1}. (${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}) - ${c.count} properties`);
    });
    console.log('');

    // Step 2: Mark large clusters (10+) as city centroid (accuracy = 2)
    const largeClusters = clusters.filter((c: CoordinateCluster) => c.count >= 10);
    const smallClusters = clusters.filter((c: CoordinateCluster) => c.count >= 5 && c.count < 10);

    console.log(`Large clusters (10+ properties): ${largeClusters.length}`);
    console.log(`Small clusters (5-9 properties): ${smallClusters.length}`);
    console.log('');

    let totalUpdated = 0;

    // Mark large clusters as approximate (accuracy = 2)
    for (const cluster of largeClusters) {
      if (dryRun) {
        console.log(`[DRY RUN] Would mark ${cluster.count} properties at (${cluster.latitude.toFixed(6)}, ${cluster.longitude.toFixed(6)}) with accuracy ${APPROXIMATE_ACCURACY}`);
      } else {
        const result = await query(`
          UPDATE properties 
          SET location_accuracy = $1, updated_at = NOW()
          WHERE latitude = $2::numeric(10,8) 
            AND longitude = $3::numeric(11,8)
            AND location_accuracy IS NULL
        `, [APPROXIMATE_ACCURACY, cluster.latitude, cluster.longitude]);
        
        console.log(`✓ Marked ${result.rowCount} properties at (${cluster.latitude.toFixed(6)}, ${cluster.longitude.toFixed(6)}) as approximate (accuracy ${APPROXIMATE_ACCURACY})`);
        totalUpdated += result.rowCount || 0;
      }
    }

    // Mark small clusters as neighborhood-level (accuracy = 5)
    for (const cluster of smallClusters) {
      if (dryRun) {
        console.log(`[DRY RUN] Would mark ${cluster.count} properties at (${cluster.latitude.toFixed(6)}, ${cluster.longitude.toFixed(6)}) with accuracy ${NEIGHBORHOOD_ACCURACY}`);
      } else {
        const result = await query(`
          UPDATE properties 
          SET location_accuracy = $1, updated_at = NOW()
          WHERE latitude = $2::numeric(10,8) 
            AND longitude = $3::numeric(11,8)
            AND location_accuracy IS NULL
        `, [NEIGHBORHOOD_ACCURACY, cluster.latitude, cluster.longitude]);
        
        console.log(`✓ Marked ${result.rowCount} properties at (${cluster.latitude.toFixed(6)}, ${cluster.longitude.toFixed(6)}) as neighborhood-level (accuracy ${NEIGHBORHOOD_ACCURACY})`);
        totalUpdated += result.rowCount || 0;
      }
    }

    console.log('');

    // Step 3: Mark remaining unique coordinates as precise (accuracy = 8)
    console.log('📍 Marking unique coordinates as precise...');
    
    if (dryRun) {
      const uniqueResult = await query(`
        SELECT COUNT(*) as count
        FROM properties
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND location_accuracy IS NULL
      `);
      console.log(`[DRY RUN] Would mark ${uniqueResult.rows[0].count} remaining properties as precise (accuracy 8)`);
    } else {
      const result = await query(`
        UPDATE properties 
        SET location_accuracy = 8, updated_at = NOW()
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND location_accuracy IS NULL
      `);
      console.log(`✓ Marked ${result.rowCount} remaining properties as precise (accuracy 8)`);
      totalUpdated += result.rowCount || 0;
    }

    // Final summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    
    if (!dryRun) {
      console.log(`Total properties updated: ${totalUpdated}`);
      
      // Show distribution
      const distResult = await query(`
        SELECT 
          location_accuracy,
          COUNT(*) as count,
          CASE 
            WHEN location_accuracy >= 8 THEN 'Precise (building/street)'
            WHEN location_accuracy >= 5 THEN 'Neighborhood level'
            WHEN location_accuracy >= 1 THEN 'Approximate (city centroid)'
            ELSE 'Unknown'
          END as description
        FROM properties
        WHERE location_accuracy IS NOT NULL
        GROUP BY location_accuracy
        ORDER BY location_accuracy DESC
      `);
      
      console.log('\nLocation accuracy distribution:');
      for (const row of distResult.rows) {
        console.log(`  Accuracy ${row.location_accuracy}: ${row.count} properties (${row.description})`);
      }
    } else {
      console.log('Dry run complete - no changes made');
    }

    console.log('\n✅ Done!');

  } catch (error) {
    logger.error('Error marking approximate locations', { error });
    throw error;
  } finally {
    await pool.end();
  }
}

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

markApproximateLocations(dryRun)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
