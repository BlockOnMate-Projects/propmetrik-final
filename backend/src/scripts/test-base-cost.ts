/**
 * Test script for base cost calculation
 * Run with: npx ts-node --transpile-only src/scripts/test-base-cost.ts
 */

import { baseCostCalculationService } from '../services/data-hub/baseCostCalculationService';

async function main() {
  console.log('Starting base cost calculation...');
  console.log('='.repeat(50));
  
  try {
    const result = await baseCostCalculationService.recalculateAllBaseCosts();
    
    console.log('\n=== RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    
    // Get a sample of calculated costs
    const sample = await baseCostCalculationService.getBaseCostsByRegion('greater_accra' as any);
    console.log('\n=== SAMPLE (Greater Accra) ===');
    console.table(sample.map(s => ({
      type: s.property_type,
      quality: s.quality_level,
      cost_ghs: s.cost_ghs,
      material: s.material_component_ghs,
      labor: s.labor_component_ghs,
    })));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
