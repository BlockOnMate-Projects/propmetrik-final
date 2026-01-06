#!/usr/bin/env npx ts-node
/**
 * FX Rate Backfill Script
 * 
 * Fetches current exchange rates from ForexRate-API
 * and saves them to the database.
 * 
 * Usage:
 *   npx ts-node scripts/backfill/backfill-fx.ts
 */

import { config } from 'dotenv';
config({ path: '../../.env' });

import { pool } from '../../src/database';
import { fxFeedService } from '../../src/services/data-hub/scrapers/fxFeedService';
import { syncLogRepository } from '../../src/services/data-hub/scrapers/syncLogRepository';

/**
 * Run the FX backfill
 */
async function runBackfill(): Promise<void> {
  console.log('==========================================');
  console.log('  PropMetrik FX Rate Backfill');
  console.log('==========================================');
  console.log('Source: ForexRate-API');
  console.log('');

  const startTime = Date.now();
  let totalSaved = 0;
  let totalErrors = 0;

  // Start sync log
  const syncId = await syncLogRepository.startSync(
    'ForexRate-API',
    'manual',
    'backfill-fx.ts'
  );

  try {
    console.log('📊 Fetching current exchange rates...');
    
    const rates = await fxFeedService.getAllRates();
    
    console.log(`   Found ${Object.keys(rates).length} currencies\n`);

    for (const [currency, rate] of Object.entries(rates)) {
      console.log(`   ${currency}/GHS: ${rate.rate} (${rate.source})`);
      
      try {
        await fxFeedService.saveDailyRate(currency, rate);
        totalSaved++;
      } catch (error) {
        console.error(`   ❌ Error saving ${currency}: ${(error as Error).message}`);
        totalErrors++;
      }
    }

    // Complete sync log
    await syncLogRepository.completeSync(syncId, {
      source: 'ForexRate-API',
      status: totalErrors > 0 ? 'partial' : 'success',
      started_at: new Date(startTime),
      completed_at: new Date(),
      records_fetched: Object.keys(rates).length,
      records_saved: totalSaved,
      records_failed: totalErrors,
      errors: [],
      metadata: {
        type: 'backfill',
        currencies: Object.keys(rates),
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('==========================================');
    console.log('  Backfill Complete');
    console.log('==========================================');
    console.log(`✅ Records saved: ${totalSaved}`);
    console.log(`❌ Errors: ${totalErrors}`);
    console.log(`⏱️  Duration: ${duration}s`);
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
    await runBackfill();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
