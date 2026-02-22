/**
 * Script to geocode properties with Ghana digital addresses
 * This updates latitude/longitude/geom for properties that have digital_address but missing coordinates
 */

import { Pool } from 'pg';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

interface Property {
  id: string;
  digital_address: string;
  title: string;
  address_street?: string;
  address_city?: string;
  region?: string;
}

/**
 * Geocode Ghana digital address using Mapbox
 */
async function geocodeDigitalAddress(digitalAddress: string, context: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Ghana Digital Address format: GA-123-4567 or AK-234-5678
    const searchQuery = `${digitalAddress}, Ghana ${context}`;
    
    const response = await axios.get(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json`,
      {
        params: {
          access_token: MAPBOX_TOKEN,
          country: 'GH', // Ghana
          limit: 1,
        },
      }
    );

    if (response.data.features && response.data.features.length > 0) {
      const [lng, lat] = response.data.features[0].center;
      console.log(`  ✓ Geocoded ${digitalAddress}: ${lat}, ${lng}`);
      return { lat, lng };
    }

    // If digital address doesn't work, try full address context
    if (context) {
      const fallbackResponse = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(context)}.json`,
        {
          params: {
            access_token: MAPBOX_TOKEN,
            country: 'GH',
            limit: 1,
          },
        }
      );

      if (fallbackResponse.data.features && fallbackResponse.data.features.length > 0) {
        const [lng, lat] = fallbackResponse.data.features[0].center;
        console.log(`  ✓ Geocoded via fallback (${context}): ${lat}, ${lng}`);
        return { lat, lng };
      }
    }

    return null;
  } catch (error: any) {
    console.error(`  ✗ Error geocoding ${digitalAddress}:`, error.message);
    return null;
  }
}

/**
 * Update property coordinates in database
 */
async function updatePropertyCoordinates(propertyId: string, lat: number, lng: number) {
  try {
    await pool.query(
      `
      UPDATE properties
      SET 
        latitude = $1,
        longitude = $2,
        geom = ST_SetSRID(ST_MakePoint($3, $1), 4326),
        updated_at = NOW()
      WHERE id = $4
      `,
      [lat, lng, lng, propertyId]
    );
    console.log(`  ✓ Updated database for property ${propertyId}`);
  } catch (error: any) {
    console.error(`  ✗ Error updating property ${propertyId}:`, error.message);
  }
}

async function main() {
  console.log('🚀 Starting geocoding of properties with digital addresses...\n');

  if (!MAPBOX_TOKEN) {
    console.error('❌ MAPBOX_ACCESS_TOKEN not found in environment variables');
    process.exit(1);
  }

  try {
    // Get properties with digital address but no coordinates
    const result = await pool.query<Property>(`
      SELECT 
        id, 
        digital_address, 
        title,
        address_street,
        address_city,
        region
      FROM properties
      WHERE digital_address IS NOT NULL
        AND (latitude IS NULL OR longitude IS NULL)
        AND organization_id IS NOT NULL
      ORDER BY created_at DESC
    `);

    console.log(`📍 Found ${result.rows.length} properties to geocode\n`);

    if (result.rows.length === 0) {
      console.log('✅ No properties need geocoding');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const property of result.rows) {
      console.log(`\n🏠 Processing: ${property.title} (${property.digital_address})`);
      
      // Build context for better geocoding
      const context = [
        property.address_street,
        property.address_city,
        property.region,
      ]
        .filter(Boolean)
        .join(', ');

      const coords = await geocodeDigitalAddress(property.digital_address, context);

      if (coords) {
        await updatePropertyCoordinates(property.id, coords.lat, coords.lng);
        successCount++;
      } else {
        console.log(`  ✗ Failed to geocode ${property.digital_address}`);
        failCount++;
      }

      // Rate limit: Wait 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Geocoding complete!`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed:  ${failCount}`);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
