#!/usr/bin/env npx ts-node
/**
 * Full Economic Data Backfill Script
 * 
 * Runs all backfill scripts in order:
 * 1. World Bank WDI (historical data 2000-present)
 * 2. Bank of Ghana (recent official data)
 * 3. FX Rates (current exchange rates)
 * 
 * Usage:
 *   npx ts-node scripts/backfill/backfill-all.ts
 */

import { config } from 'dotenv';
config({ path: '../../.env' });

import { spawn } from 'child_process';
import * as path from 'path';

interface BackfillResult {
  script: string;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Run a backfill script
 */
async function runScript(scriptName: string): Promise<BackfillResult> {
  const scriptPath = path.join(__dirname, scriptName);
  const startTime = Date.now();

  return new Promise((resolve) => {
    const child = spawn('npx', ['ts-node', scriptPath], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..'),
      env: process.env,
    });

    child.on('close', (code) => {
      const duration = (Date.now() - startTime) / 1000;
      resolve({
        script: scriptName,
        success: code === 0,
        duration,
        error: code !== 0 ? `Exit code: ${code}` : undefined,
      });
    });

    child.on('error', (error) => {
      const duration = (Date.now() - startTime) / 1000;
      resolve({
        script: scriptName,
        success: false,
        duration,
        error: error.message,
      });
    });
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║         PROPMETRIK Full Economic Data Backfill               ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('This will run all backfill scripts in order:');
  console.log('  1. WDI (World Bank) - Historical data 2000-present');
  console.log('  2. BOG (Bank of Ghana) - Recent official data');
  console.log('  3. FX (ForexRate-API) - Current exchange rates');
  console.log('');
  console.log('Estimated time: 5-10 minutes');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  const totalStartTime = Date.now();
  const results: BackfillResult[] = [];

  // Run scripts in order
  const scripts = [
    'backfill-wdi.ts',
    'backfill-bog.ts',
    'backfill-fx.ts',
  ];

  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    console.log(`\n[${i + 1}/${scripts.length}] Running ${script}...\n`);
    console.log('───────────────────────────────────────────────────────────────────\n');
    
    const result = await runScript(script);
    results.push(result);
    
    console.log('\n───────────────────────────────────────────────────────────────────');
    
    if (!result.success) {
      console.log(`\n⚠️  ${script} failed, but continuing with next script...`);
    }
  }

  // Print summary
  const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(1);
  const successCount = results.filter((r) => r.success).length;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                     BACKFILL SUMMARY                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Results:');
  console.log('');

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    const duration = result.duration.toFixed(1);
    console.log(`  ${status} ${result.script.padEnd(20)} ${duration}s`);
    if (result.error) {
      console.log(`     └─ Error: ${result.error}`);
    }
  }

  console.log('');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log(`  Total: ${successCount}/${results.length} successful`);
  console.log(`  Duration: ${totalDuration}s`);
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  // Verify data in database
  console.log('Verification: Run this query to check backfilled data:');
  console.log('');
  console.log('  psql $DATABASE_URL -c "');
  console.log('    SELECT source_name, indicator_type, COUNT(*),');
  console.log('           MIN(effective_date) as earliest,');
  console.log('           MAX(effective_date) as latest');
  console.log('    FROM economic_indicators');
  console.log('    GROUP BY source_name, indicator_type');
  console.log('    ORDER BY source_name, indicator_type;"');
  console.log('');

  process.exit(successCount === results.length ? 0 : 1);
}

main();
