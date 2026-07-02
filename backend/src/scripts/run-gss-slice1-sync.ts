/**
 * Run all Slice 1 GSS syncs and report results.
 * Usage: npx ts-node src/scripts/run-gss-slice1-sync.ts
 */
import '../database'; // warm up pool
import { gssPpiService } from '../services/data-hub/scrapers/gssPpiService';
import { gssMiegService } from '../services/data-hub/scrapers/gssMiegService';
import { gssFinancialService } from '../services/data-hub/scrapers/gssFinancialService';
import { gssIncomeService } from '../services/data-hub/gssIncomeService';

async function main() {
  console.log('\n========================================');
  console.log('  GSS Slice 1 — Full Sync (manual run)');
  console.log('========================================\n');

  // 1. PPI / IIP
  console.log('[1/4] GSS PPI + IIP...');
  const ppi = await gssPpiService.sync('manual').catch((e: Error) => ({ status: 'failed', error: e.message, records_saved: 0, records_fetched: 0, errors: [] as any[] }));
  console.log(`  status=${ppi.status}  fetched=${(ppi as any).records_fetched}  saved=${ppi.records_saved}`);
  if ((ppi as any).errors?.length) console.log('  errors:', (ppi as any).errors.map((e: any) => e.message));

  // 2. MIEG / GDP
  console.log('[2/4] GSS MIEG + Quarterly GDP...');
  const mieg = await gssMiegService.sync('manual').catch((e: Error) => ({ status: 'failed', error: e.message, records_saved: 0, records_fetched: 0, errors: [] as any[] }));
  console.log(`  status=${mieg.status}  fetched=${(mieg as any).records_fetched}  saved=${mieg.records_saved}`);
  if ((mieg as any).errors?.length) console.log('  errors:', (mieg as any).errors.map((e: any) => e.message));

  // 3. Interest Rates + FSI
  console.log('[3/4] GSS Interest Rates + Financial Soundness...');
  const fin = await gssFinancialService.sync('manual').catch((e: Error) => ({ status: 'failed', error: e.message, records_saved: 0, records_fetched: 0, errors: [] as any[] }));
  console.log(`  status=${fin.status}  fetched=${(fin as any).records_fetched}  saved=${fin.records_saved}`);
  if ((fin as any).errors?.length) console.log('  errors:', (fin as any).errors.map((e: any) => e.message));

  // 4. Income (extends existing, now also fetches formal_employment_pct)
  console.log('[4/4] GSS Regional Household Income (AHIES + PHC + formal_employment_pct)...');
  const income = await gssIncomeService.syncRegionalHouseholdIncome('manual').catch((e: Error) => ({ status: 'failed', error: e.message, records_saved: 0, records_fetched: 0, errors: [] as any[] }));
  console.log(`  status=${income.status}  fetched=${(income as any).records_fetched}  saved=${income.records_saved}`);
  if ((income as any).errors?.length) console.log('  errors:', (income as any).errors.map((e: any) => e.message));

  console.log('\n========================================');
  console.log('  All Slice 1 syncs complete');
  console.log('========================================\n');
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
