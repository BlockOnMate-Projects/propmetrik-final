#!/usr/bin/env npx ts-node
/**
 * Test ETL Pipeline - End to End
 * 
 * This script tests the full ETL pipeline:
 * 1. API server queues jobs (initialize mode)
 * 2. propertyStorageService saves to database
 */

import { config } from '../src/config';
import { pool } from '../src/database';
import { propertyStorageService } from '../src/services/data-hub/etl/propertyStorage';

// Sample scraped property data (mimics what scrapy sends)
const testProperty = {
  source_slug: 'test_etl_pipeline',
  source_id: `test-${Date.now()}`,
  source_url: 'https://example.com/property/123',
  title: 'ETL Pipeline Test Property',
  description: 'This property was created to test the ETL pipeline',
  region: 'Greater Accra',
  city: 'Accra',
  neighborhood: 'East Legon',
  address: 'Test Street 123',
  digital_address: 'GA-123-4567',
  latitude: 5.639285,
  longitude: -0.162459,
  coordinates_source: 'test',
  geocoding_confidence: 0.9,
  property_type: 'house',
  listing_type: 'sale',
  bedrooms: 4,
  bathrooms: 3,
  floors: 2,
  building_size_sqm: '350.5', // String to test parseNumeric
  price: '450000', // String to test parseNumeric
  currency: 'USD',
  price_negotiable: true,
  agent_name: 'Test Agent',
  agent_phone: '+233201234567',
  images: [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
  ],
  amenities: ['Swimming Pool', 'Garden'],
  features: ['Air Conditioning', 'Security'],
  date_scraped: new Date().toISOString(),
};

async function runTest() {
  console.log('='.repeat(60));
  console.log('ETL Pipeline Test');
  console.log('='.repeat(60));
  
  try {
    // Get initial count
    const beforeResult = await pool.query('SELECT COUNT(*) as count FROM properties');
    const beforeCount = parseInt(beforeResult.rows[0].count, 10);
    console.log(`\n📊 Properties before: ${beforeCount}`);
    
    // Test storage service directly
    console.log('\n🔄 Testing propertyStorageService.storeProperty()...');
    console.log(`   Source: ${testProperty.source_slug}:${testProperty.source_id}`);
    
    const result = await propertyStorageService.storeProperty(testProperty);
    
    if (result.success) {
      console.log(`\n✅ SUCCESS: Property ${result.action}`);
      console.log(`   Property ID: ${result.propertyId}`);
      
      // Verify in database
      const verifyResult = await pool.query(`
        SELECT id, reference_number, title, price, bedrooms, building_size_sqm, region
        FROM properties 
        WHERE id = $1
      `, [result.propertyId]);
      
      if (verifyResult.rows.length > 0) {
        const prop = verifyResult.rows[0];
        console.log('\n📋 Verified in database:');
        console.log(`   Reference: ${prop.reference_number}`);
        console.log(`   Title: ${prop.title}`);
        console.log(`   Price: ${prop.price}`);
        console.log(`   Bedrooms: ${prop.bedrooms}`);
        console.log(`   Building Size: ${prop.building_size_sqm} sqm`);
        console.log(`   Region: ${prop.region}`);
      }
      
      // Get final count
      const afterResult = await pool.query('SELECT COUNT(*) as count FROM properties');
      const afterCount = parseInt(afterResult.rows[0].count, 10);
      console.log(`\n📊 Properties after: ${afterCount} (added ${afterCount - beforeCount})`);
      
      // Clean up test property
      console.log('\n🧹 Cleaning up test property...');
      await pool.query('DELETE FROM properties WHERE id = $1', [result.propertyId]);
      console.log('   Test property deleted.');
      
    } else {
      console.log(`\n❌ FAILED: ${result.error}`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
  } finally {
    await pool.end();
    console.log('\n' + '='.repeat(60));
    console.log('Test complete');
    console.log('='.repeat(60));
  }
}

runTest();
