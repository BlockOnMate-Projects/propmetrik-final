/**
 * Test Script: Construction Cost Service Integration
 * 
 * Tests that constructionCostService uses:
 * 1. Database regional multipliers (regional_cost_multipliers)
 * 2. Calculated base costs (base_costs_per_sqm with region)
 * 3. Live economic data via economicDataService
 */

import { constructionCostService } from '../services/data-hub/constructionCostService';
import { economicDataService } from '../services/data-hub/economicDataService';

async function testIntegration() {
  console.log('='.repeat(60));
  console.log('Testing Construction Cost Service Integration');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Get regional multipliers from database
    console.log('\n📊 Test 1: Regional Multipliers');
    console.log('-'.repeat(40));
    
    const regions = ['greater_accra', 'ashanti', 'northern', 'upper_west'];
    for (const region of regions) {
      const multiplier = await constructionCostService.getRegionalMultiplier(region);
      console.log(`  ${region.padEnd(15)} | multiplier: ${multiplier.value.toFixed(4)} | source: ${multiplier.source}`);
    }
    
    // Test 2: Get calculated base costs from database
    console.log('\n🏗️ Test 2: Calculated Base Costs');
    console.log('-'.repeat(40));
    
    const testCases = [
      { propertyType: 'residential', qualityLevel: 'standard', region: 'greater_accra' },
      { propertyType: 'residential', qualityLevel: 'standard', region: 'ashanti' },
      { propertyType: 'commercial', qualityLevel: 'premium', region: 'greater_accra' },
    ];
    
    for (const tc of testCases) {
      const baseCost = await constructionCostService.getCalculatedBaseCost(
        tc.propertyType, 
        tc.qualityLevel, 
        tc.region
      );
      
      if (baseCost) {
        console.log(`  ${tc.propertyType}/${tc.qualityLevel}/${tc.region}:`);
        console.log(`    Cost: GH₵ ${baseCost.cost_ghs.toLocaleString()} | Calculated: ${baseCost.is_calculated} | Source: ${baseCost.calculation_source}`);
      } else {
        console.log(`  ${tc.propertyType}/${tc.qualityLevel}/${tc.region}: NOT FOUND`);
      }
    }
    
    // Test 3: Full construction estimate with live data
    console.log('\n🧮 Test 3: Full Construction Estimate');
    console.log('-'.repeat(40));
    
    const estimate = await constructionCostService.estimateConstructionCost(
      'residential',
      'standard',
      'greater_accra' as any,
      200, // 200 sqm
      2    // 2 floors
    );
    
    console.log(`  Property: ${estimate.property_type} / ${estimate.quality_level}`);
    console.log(`  Region: ${estimate.region}`);
    console.log(`  Area: ${estimate.built_area_sqm} sqm × ${estimate.num_floors} floors`);
    console.log(`  Cost per sqm: GH₵ ${estimate.estimates.cost_per_sqm.toLocaleString()}`);
    console.log(`  Total cost: GH₵ ${estimate.estimates.total.toLocaleString()}`);
    console.log(`  Data source: ${(estimate as any).data_source}`);
    console.log(`  Base calculated: ${(estimate as any).base_cost_calculated}`);
    
    if ((estimate as any).regional_multiplier) {
      const rm = (estimate as any).regional_multiplier;
      console.log(`  Regional multiplier: ${rm.value.toFixed(4)} (${rm.source})`);
    }
    
    console.log('\n  Assumptions:');
    for (const assumption of estimate.assumptions) {
      console.log(`    - ${assumption}`);
    }
    
    // Test 4: Economic data snapshot
    console.log('\n💰 Test 4: Economic Data Snapshot');
    console.log('-'.repeat(40));
    
    const snapshot = await economicDataService.getLatestSnapshot();
    const formatRate = (val: number | null | string) => {
      if (val === null) return 'N/A';
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? 'N/A' : (num * 100).toFixed(1) + '%';
    };
    const formatValue = (val: number | null | string) => {
      if (val === null) return 'N/A';
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? 'N/A' : num.toFixed(2);
    };
    console.log(`  Inflation rate: ${formatRate(snapshot.inflation_rate)}`);
    console.log(`  Policy rate: ${formatRate(snapshot.interest_rate_policy)}`);
    console.log(`  USD/GHS: ${formatValue(snapshot.exchange_rate_usd)}`);
    console.log(`  GDP growth: ${formatRate(snapshot.gdp_growth)}`);
    
    // Test 5: Compare regions
    console.log('\n📈 Test 5: Regional Cost Comparison (200 sqm residential standard)');
    console.log('-'.repeat(40));
    
    const compareRegions = ['greater_accra', 'ashanti', 'northern', 'upper_west'];
    const results: Array<{ region: string; costPerSqm: number; total: number }> = [];
    
    for (const region of compareRegions) {
      const est = await constructionCostService.estimateConstructionCost(
        'residential',
        'standard',
        region as any,
        200,
        1
      );
      results.push({
        region,
        costPerSqm: est.estimates.cost_per_sqm,
        total: est.estimates.total,
      });
    }
    
    // Sort by cost
    results.sort((a, b) => b.costPerSqm - a.costPerSqm);
    
    const maxCost = results[0].costPerSqm;
    for (const r of results) {
      const pct = ((r.costPerSqm / maxCost) * 100).toFixed(0);
      console.log(`  ${r.region.padEnd(15)} | GH₵ ${r.costPerSqm.toLocaleString().padStart(8)} /sqm | ${pct}% of max`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Integration test completed successfully!');
    console.log('='.repeat(60));
    
  } catch (error: any) {
    console.error('\n❌ Integration test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
  
  process.exit(0);
}

testIntegration();
