#!/usr/bin/env ts-node
/**
 * Test script for property storage
 */

import { propertyStorageService } from '../src/services/data-hub/etl/propertyStorage';

async function main() {
  console.log('Testing property storage service...');
  
  try {
    const result = await propertyStorageService.storeProperty({
      source_slug: 'test_spider',
      source_id: 'test-' + Date.now(),
      title: 'Test Property ' + new Date().toISOString(),
      city: 'Accra',
      price: 100000,
      currency: 'GHS',
      bedrooms: 3,
      bathrooms: 2,
      latitude: 5.6037,
      longitude: -0.1870,
      property_type: 'apartment',
      listing_type: 'sale',
    });
    
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log(`✓ Property ${result.action}: ${result.propertyId}`);
    } else {
      console.log(`✗ Failed: ${result.error}`);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
  
  process.exit(0);
}

main();
