#!/usr/bin/env npx ts-node
/**
 * FX Historical Rate Backfill Script
 * 
 * Fetches historical exchange rates from ForexRate-API
 * and saves them to the database.
 * 
 * Usage:
 *   npx ts-node scripts/backfill/backfill-fx-historical.ts
 *   npx ts-node scripts/backfill/backfill-fx-historical.ts --days=365
 *   npx ts-node scripts/backfill/backfill-fx-historical.ts --start=2024-01-01 --end=2024-12-31
 */

import { config } from 'dotenv';
config({ path: '../../.env' });

import { pool } from '../../src/database';
import { fxFeedService } from '../../src/services/data-hub/scrapers/fxFeedService';
import { syncLogRepository } from '../../src/services/data-hub/scrapers/syncLogRepository';

interface BackfillOptions {
  startDate: Date;
  endDate: Date;
  currencies: string[];
}

/**
 * Parse command line arguments
 */
function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const now = new Date();
  let startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 30); // Default: last 30 days
  let endDate = new Date(now);
  const currencies = ['USD', 'GBP', 'EUR'];

  for (const arg of args) {
    if (arg.startsWith('--days=')) {
      const days = parseInt(arg.split('=')[1], 10);
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
    } else if (arg.startsWith('--start=')) {
      startDate = new Date(arg.split('=')[1]);
    } else if (arg.startsWith('--end=')) {
      endDate = new Date(arg.split('=')[1]);
    }
  }

  return { startDate, endDate, currencies };
}

/**
 * Run the FX historical backfill
 */
async function runBackfill(options: BackfillOptions): Promise<void> {
  console.log('==========================================');
  console.log('  PropMetrik FX Historical Backfill');
  console.log('==========================================');
  console.log('Source: ForexRate-API');
  console.log(`Date range: ${options.startDate.toISOString().split('T')[0]} to ${options.endDate.toISOString().split('T')[0]}`);
  console.log(`Currencies: ${options.currencies.join(', ')}`);
  
  // Calculate number of days
  const daysDiff = Math.ceil((options.endDate.getTime() - options.startDate.getTime()) / (1000 * 60 * 60 * 24));
  console.log(`Days to fetch: ${daysDiff}`);
  console.log(`Expected records: ~${daysDiff * options.currencies.length}`);
  console.log('');

  const startTime = Date.now();

  // Start sync log
  const syncId = await syncLogRepository.startSync(
    'ForexRate-API',
    'manual',
    'backfill-fx-historical.ts'
  );

  try {
    console.log('📊 Fetching historical exchange rates...\n');
    
    const result = await fxFeedService.backfillHistorical(
      options.startDate,
      options.endDate,
      options.currencies
    );

    // Complete sync log
    await syncLogRepository.completeSync(syncId, result);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('==========================================');
    console.log('  Backfill Complete');
    console.log('==========================================');
    console.log(`✅ Records fetched: ${result.records_fetched}`);
    console.log(`✅ Records saved: ${result.records_saved}`);
    console.log(`❌ Errors: ${result.records_failed}`);
    console.log(`⏱️  Duration: ${duration}s`);
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.slice(0, 5).forEach((err) => {
        console.log(`  - ${err.indicator || 'Unknown'}: ${err.message}`);
      });
    }
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Backfill failed:', (error as Error).message);
    
    // Mark sync as failed
    await syncLogRepository.completeSync(syncId, {
      source: 'ForexRate-API',
      status: 'failed',
      started_at: new Date(startTime),
      completed_at: new Date(),
      records_fetched: 0,
      records_saved: 0,
      records_failed: 0,
      errors: [{
        code: 'BACKFILL_FAILED',
        message: (error as Error).message,
        timestamp: new Date(),
      }],
      metadata: { type: 'backfill' },
    });

    throw error;
  }
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
