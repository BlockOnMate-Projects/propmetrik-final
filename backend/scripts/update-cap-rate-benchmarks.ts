#!/usr/bin/env ts-node
/**
 * Cap Rate Benchmark Update Script
 * 
 * This script updates market cap rate benchmarks for all region/property type combinations.
 * It implements the RICS-compliant fallback hierarchy:
 *   1. First tries to update from transaction data (market extraction)
 *   2. Falls back to listing-derived methodology when transactions are insufficient
 * 
 * Usage:
 *   npx ts-node scripts/update-cap-rate-benchmarks.ts [--region=greater_accra] [--property-type=residential_house] [--dry-run]
 * 
 * Schedule:
 *   Run weekly via cron or Airflow DAG
 */

import { capRateService } from '../src/services/CapRateService';
import { query } from '../src/database';
import { logger } from '../src/utils/logger';

// ============================================================================
// CONFIGURATION
// ============================================================================

const REGIONS = [
  'greater_accra',
  'kumasi_metro',
  'eastern',
  'western_cluster',
  'northern_cluster'
] as const;

const PROPERTY_TYPES = [
  'residential_house',
  'apartment_flat',
  'commercial_office',
  'commercial_shop',
  'warehouse',
  'mixed_use',
  'land',
  'industrial'
] as const;

interface BenchmarkUpdateResult {
  region: string;
  propertyType: string;
  success: boolean;
  methodology?: string;
  capRate?: number;
  sampleSize?: number;
  error?: string;
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function updateAllBenchmarks(
  options: {
    region?: string;
    propertyType?: string;
    dryRun?: boolean;
  } = {}
): Promise<BenchmarkUpdateResult[]> {
  const results: BenchmarkUpdateResult[] = [];
  const startTime = Date.now();
  
  // Filter regions and property types if specified
  const regions = options.region 
    ? [options.region] 
    : REGIONS;
  const propertyTypes = options.propertyType 
    ? [options.propertyType] 
    : PROPERTY_TYPES;
  
  logger.info('Starting cap rate benchmark update', {
    regions: regions.length,
    propertyTypes: propertyTypes.length,
    totalCombinations: regions.length * propertyTypes.length,
    dryRun: options.dryRun || false
  });

  for (const region of regions) {
    for (const propertyType of propertyTypes) {
      const result: BenchmarkUpdateResult = {
        region,
        propertyType,
        success: false
      };

      try {
        logger.debug(`Processing ${region}/${propertyType}`);

        // 1. First try to update from transaction data (market extraction)
        const txResult = await capRateService.updateMarketBenchmarks(region, propertyType);
        
        if (txResult.updated && txResult.newBenchmark) {
          result.success = true;
          result.methodology = 'market_extraction';
          result.capRate = txResult.newBenchmark.benchmarkCapRate;
          result.sampleSize = txResult.newBenchmark.sampleSize;
          
          logger.info('Updated cap rate from transactions', {
            region,
            propertyType,
            capRate: (txResult.newBenchmark.benchmarkCapRate * 100).toFixed(2) + '%',
            sampleSize: txResult.newBenchmark.sampleSize,
            methodology: 'market_extraction'
          });
          
          results.push(result);
          continue;
        }

        // 2. Fallback to listing-derived methodology
        try {
          const listingCapRate = await capRateService.deriveCapRateFromListings(region, propertyType);
          
          if (listingCapRate.sampleSize >= 3) {
            if (!options.dryRun) {
              await capRateService.saveListingDerivedBenchmark(region, propertyType, listingCapRate);
            }
            
            result.success = true;
            result.methodology = 'listing_derived';
            result.capRate = listingCapRate.derivedCapRate;
            result.sampleSize = listingCapRate.sampleSize;
            
            logger.info('Updated cap rate from listings', {
              region,
              propertyType,
              capRate: (listingCapRate.derivedCapRate * 100).toFixed(2) + '%',
              sampleSize: listingCapRate.sampleSize,
              methodology: 'listing_derived',
              dryRun: options.dryRun || false
            });
          } else {
            result.error = `Insufficient listings: only ${listingCapRate.sampleSize} found`;
            logger.warn('Insufficient listing data', {
              region,
              propertyType,
              sampleSize: listingCapRate.sampleSize
            });
          }
        } catch (listingError: any) {
          result.error = listingError.message;
          logger.warn('Listing-derived cap rate failed', {
            region,
            propertyType,
            error: listingError.message
          });
        }

      } catch (error: any) {
        result.error = error.message;
        logger.error('Failed to update cap rate benchmark', {
          region,
          propertyType,
          error: error.message
        });
      }

      results.push(result);
    }
  }

  // Generate summary
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const byMethodology = {
    market_extraction: successful.filter(r => r.methodology === 'market_extraction').length,
    listing_derived: successful.filter(r => r.methodology === 'listing_derived').length
  };

  const duration = Date.now() - startTime;

  logger.info('Cap rate benchmark update completed', {
    totalProcessed: results.length,
    successful: successful.length,
    failed: failed.length,
    byMethodology,
    durationMs: duration
  });

  return results;
}

/**
 * Get current benchmark statistics
 */
async function getBenchmarkStats(): Promise<void> {
  const result = await query(`
    SELECT 
      methodology,
      COUNT(*) as count,
      AVG(benchmark_cap_rate) as avg_cap_rate,
      AVG(sample_size) as avg_sample_size,
      AVG(confidence_score) as avg_confidence
    FROM market_cap_rate_benchmarks
    WHERE expiry_date IS NULL OR expiry_date >= CURRENT_DATE
    GROUP BY methodology
    ORDER BY count DESC
  `);

  console.log('\n=== Current Benchmark Statistics ===\n');
  console.table(result.rows.map((row: any) => ({
    methodology: row.methodology,
    count: parseInt(row.count),
    avgCapRate: (parseFloat(row.avg_cap_rate) * 100).toFixed(2) + '%',
    avgSampleSize: Math.round(parseFloat(row.avg_sample_size)),
    avgConfidence: parseFloat(row.avg_confidence).toFixed(2)
  })));
}

/**
 * Print update results
 */
function printResults(results: BenchmarkUpdateResult[]): void {
  console.log('\n=== Cap Rate Benchmark Update Results ===\n');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (successful.length > 0) {
    console.log('✅ Successfully Updated:');
    console.table(successful.map(r => ({
      region: r.region,
      propertyType: r.propertyType,
      capRate: r.capRate ? (r.capRate * 100).toFixed(2) + '%' : 'N/A',
      sampleSize: r.sampleSize || 0,
      methodology: r.methodology
    })));
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed to Update:');
    console.table(failed.map(r => ({
      region: r.region,
      propertyType: r.propertyType,
      error: r.error
    })));
  }

  console.log(`\nTotal: ${results.length} | Success: ${successful.length} | Failed: ${failed.length}`);
}

// ============================================================================
// CLI EXECUTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  // Parse CLI arguments
  const options: {
    region?: string;
    propertyType?: string;
    dryRun?: boolean;
    stats?: boolean;
    help?: boolean;
  } = {};

  for (const arg of args) {
    if (arg.startsWith('--region=')) {
      options.region = arg.split('=')[1];
    } else if (arg.startsWith('--property-type=')) {
      options.propertyType = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--stats') {
      options.stats = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  if (options.help) {
    console.log(`
Cap Rate Benchmark Update Script

Usage:
  npx ts-node scripts/update-cap-rate-benchmarks.ts [options]

Options:
  --region=<region>           Only update benchmarks for specified region
                              Values: greater_accra, kumasi_metro, eastern, western_cluster, northern_cluster
  
  --property-type=<type>      Only update benchmarks for specified property type
                              Values: residential_house, apartment_flat, commercial_office, 
                                      commercial_shop, warehouse, mixed_use, land, industrial
  
  --dry-run                   Preview updates without saving to database
  
  --stats                     Show current benchmark statistics only
  
  --help, -h                  Show this help message

Examples:
  # Update all benchmarks
  npx ts-node scripts/update-cap-rate-benchmarks.ts

  # Update only Greater Accra residential
  npx ts-node scripts/update-cap-rate-benchmarks.ts --region=greater_accra --property-type=residential_house

  # Preview updates without saving
  npx ts-node scripts/update-cap-rate-benchmarks.ts --dry-run

  # Show current statistics
  npx ts-node scripts/update-cap-rate-benchmarks.ts --stats
`);
    process.exit(0);
  }

  try {
    if (options.stats) {
      await getBenchmarkStats();
    } else {
      console.log('\n🚀 Starting Cap Rate Benchmark Update...\n');
      if (options.dryRun) {
        console.log('⚠️  DRY RUN MODE - No changes will be saved\n');
      }
      
      const results = await updateAllBenchmarks(options);
      printResults(results);
      
      if (!options.dryRun) {
        await getBenchmarkStats();
      }
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Script failed:', error.message);
    logger.error('Cap rate benchmark update script failed', { error: error.message });
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { updateAllBenchmarks, getBenchmarkStats };
