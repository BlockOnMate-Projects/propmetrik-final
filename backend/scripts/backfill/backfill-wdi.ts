#!/usr/bin/env npx ts-node
/**
 * World Bank WDI Backfill Script
 * 
 * Fetches historical economic data from World Bank API (2000-present)
 * and populates the economic_indicators table.
 * 
 * Usage:
 *   npx ts-node scripts/backfill/backfill-wdi.ts
 *   npx ts-node scripts/backfill/backfill-wdi.ts --start-year=2010 --end-year=2024
 */

import { config } from 'dotenv';
config({ path: '../../.env' });

import { query, pool } from '../../src/database';
import { wdiClient } from '../../src/services/data-hub/scrapers/wdiClient';
import { syncLogRepository } from '../../src/services/data-hub/scrapers/syncLogRepository';
import { WDI_INDICATORS } from '../../src/services/data-hub/scrapers/types';

interface BackfillOptions {
  startYear: number;
  endYear: number;
  indicators?: string[];
}

/**
 * Parse command line arguments
 */
function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    startYear: 2000,
    endYear: new Date().getFullYear(),
  };

  for (const arg of args) {
    if (arg.startsWith('--start-year=')) {
      options.startYear = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--end-year=')) {
      options.endYear = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--indicators=')) {
      options.indicators = arg.split('=')[1].split(',');
    }
  }

  return options;
}

/**
 * Run the backfill
 */
async function runBackfill(options: BackfillOptions): Promise<void> {
  console.log('==========================================');
  console.log('  PROPMETRIK WDI Historical Backfill');
  console.log('==========================================');
  console.log(`Date range: ${options.startYear} - ${options.endYear}`);
  console.log(`Indicators: ${options.indicators?.join(', ') || 'All'}`);
  console.log('');

  const startTime = Date.now();
  let totalRecords = 0;
  let totalErrors = 0;

  // Start sync log
  const syncId = await syncLogRepository.startSync(
    'World Bank WDI',
    'manual',
    'backfill-wdi.ts'
  );

  // Filter indicators if specified
  const indicatorsToFetch = options.indicators
    ? WDI_INDICATORS.filter((i) => options.indicators!.includes(i.code))
    : WDI_INDICATORS;

  console.log(`Fetching ${indicatorsToFetch.length} indicators...\n`);

  for (const indicator of indicatorsToFetch) {
    try {
      console.log(`📊 Fetching: ${indicator.name} (${indicator.code})`);
      
      const data = await wdiClient.fetchIndicator(
        indicator.code,
        options.startYear,
        options.endYear
      );

      console.log(`   Found ${data.length} data points`);

      // Save each data point
      let saved = 0;
      for (const point of data) {
        if (point.value === null) continue;

        try {
          const effectiveDate = new Date(`${point.date}-12-31`);
          
          await query(`
            INSERT INTO economic_indicators (
              id, indicator_type, indicator_name, value, effective_date,
              period_type, source_name, source_reference, unit,
              metadata, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4,
              'annual', 'World Bank WDI', $5, $6,
              $7, NOW(), NOW()
            )
            ON CONFLICT (indicator_type, effective_date) 
            DO UPDATE SET
              value = EXCLUDED.value,
              source_name = EXCLUDED.source_name,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
          `, [
            indicator.map_to,
            indicator.name,
            point.value,
            effectiveDate,
            indicator.code,
            indicator.unit,
            JSON.stringify({
              wdi_code: indicator.code,
              country: point.country.id,
              backfill_date: new Date().toISOString(),
            }),
          ]);
          
          saved++;
          totalRecords++;
        } catch (err) {
          console.error(`   ❌ Error saving ${point.date}: ${(err as Error).message}`);
          totalErrors++;
        }
      }

      console.log(`   ✅ Saved ${saved} records\n`);

      // Small delay between indicators to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      console.error(`   ❌ Failed to fetch ${indicator.code}: ${(error as Error).message}\n`);
      totalErrors++;
    }
  }

  // Complete sync log
  await syncLogRepository.completeSync(syncId, {
    source: 'World Bank WDI',
    status: totalErrors > 0 ? 'partial' : 'success',
    started_at: new Date(startTime),
    completed_at: new Date(),
    records_fetched: totalRecords + totalErrors,
    records_saved: totalRecords,
    records_failed: totalErrors,
    errors: [],
    metadata: {
      type: 'backfill',
      start_year: options.startYear,
      end_year: options.endYear,
    },
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('==========================================');
  console.log('  Backfill Complete');
  console.log('==========================================');
  console.log(`✅ Records saved: ${totalRecords}`);
  console.log(`❌ Errors: ${totalErrors}`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log('');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const options = parseArgs();
    await runBackfill(options);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
