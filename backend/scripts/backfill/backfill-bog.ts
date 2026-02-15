#!/usr/bin/env npx ts-node
/**
 * Bank of Ghana Backfill Script
 * 
 * Scrapes available economic data from Bank of Ghana website
 * and populates the economic_indicators table.
 * 
 * Note: BOG website typically only shows recent 2-3 years of data.
 * For older historical data, use the WDI backfill script.
 * 
 * Usage:
 *   npx ts-node scripts/backfill/backfill-bog.ts
 */

import { config } from 'dotenv';
config({ path: '../../.env' });

import { pool } from '../../src/database';
import { bogScraper } from '../../src/services/data-hub/scrapers/bogScraper';
import { syncLogRepository } from '../../src/services/data-hub/scrapers/syncLogRepository';

/**
 * Run the BOG backfill
 */
async function runBackfill(): Promise<void> {
  console.log('==========================================');
  console.log('  PROPMETRIK BOG Historical Backfill');
  console.log('==========================================');
  console.log('Source: Bank of Ghana (https://bog.gov.gh)');
  console.log('');
  console.log('⚠️  Note: BOG website typically only shows');
  console.log('   recent 2-3 years of data. For older data,');
  console.log('   use the WDI backfill script.');
  console.log('');

  const startTime = Date.now();

  // Start sync log
  const syncId = await syncLogRepository.startSync(
    'Bank of Ghana',
    'manual',
    'backfill-bog.ts'
  );

  try {
    console.log('📊 Scraping Exchange Rates...');
    const exchangeRates = await bogScraper.scrapeExchangeRates();
    console.log(`   Found ${exchangeRates.length} records`);

    console.log('📊 Scraping Interest Rates...');
    const interestRates = await bogScraper.scrapeInterestRates();
    console.log(`   Found ${interestRates.length} records`);

    console.log('📊 Scraping Real Sector Data...');
    const realSector = await bogScraper.scrapeRealSector();
    console.log(`   Found ${realSector.length} records`);

    console.log('');
    console.log('💾 Running full sync to database...');

    // Use the syncAll method which handles saving
    const result = await bogScraper.syncAll();

    // Complete sync log
    await syncLogRepository.completeSync(syncId, {
      ...result,
      metadata: {
        ...result.metadata,
        type: 'backfill',
      },
    });

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
      if (result.errors.length > 5) {
        console.log(`  ... and ${result.errors.length - 5} more`);
      }
    }
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Backfill failed:', (error as Error).message);
    
    // Mark sync as failed
    await syncLogRepository.completeSync(syncId, {
      source: 'Bank of Ghana',
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
