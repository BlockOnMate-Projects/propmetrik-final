/**
 * Seed script: Populate comparable properties for testing
 * 
 * Creates realistic comparable properties around Dowenhya, Greater Accra 
 * (near coordinates 5.5224, -0.2956) for the valuation c1c7a44d-17bf-4da5-baff-138d7e14f649.
 * 
 * Usage: cd backend && npx ts-node scripts/seed-comparable-properties.ts
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.propmetrik.com:5434/propmetrik',
});

// Subject property location: 311 Lehigh Dr, Dowenhya, Greater Accra
// lat: 5.5224, lng: -0.2956
const SUBJECT_LAT = 5.5224;
const SUBJECT_LNG = -0.2956;

// Generate random offset within a radius (in km)
function randomOffset(maxKm: number): { lat: number; lng: number } {
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * maxKm;
  // 1 degree of latitude ≈ 111 km at equator
  const latOffset = (distance * Math.cos(angle)) / 111;
  // 1 degree of longitude ≈ 111 * cos(latitude) km
  const lngOffset = (distance * Math.sin(angle)) / (111 * Math.cos(SUBJECT_LAT * Math.PI / 180));
  return {
    lat: SUBJECT_LAT + latOffset,
    lng: SUBJECT_LNG + lngOffset,
  };
}

// Comparable property data: realistic houses near Dowenhya, Greater Accra
const comparableProperties = [
  // === Verified Sales (highest evidence quality) ===
  {
    address_street: '15 Nii Adjetey Street',
    address_city: 'Dowenhya',
    neighborhood: 'Oyarifa',
    property_type: 'residential_house',
    transaction_type: 'sale',
    bedrooms: 4,
    bathrooms: 3,
    built_area_sqm: 220,
    total_area_sqm: 450,
    year_built: 2019,
    condition: 'good',
    price: 850000,
    price_currency: 'GHS',
    evidence_type: 'verified_sale',
    sold_price: 820000,
    data_source: 'manual_entry',
    floors: 2,
    maxDistanceKm: 1.5,
    ageMonths: 8,
  },
  {
    address_street: '7 Aburi Road Extension',
    address_city: 'Adenta',
    neighborhood: 'Adenta',
    property_type: 'residential_house',
    transaction_type: 'sale',
    bedrooms: 4,
    bathrooms: 2,
    built_area_sqm: 195,
    total_area_sqm: 400,
    year_built: 2020,
    condition: 'good',
    price: 780000,
    price_currency: 'GHS',
    evidence_type: 'verified_sale',
    sold_price: 750000,
    data_source: 'manual_entry',
    floors: 2,
    maxDistanceKm: 3.0,
    ageMonths: 6,
  },
  {
    address_street: '22 Otinibi Lane',
    address_city: 'Oyarifa',
    neighborhood: 'Oyarifa',
    property_type: 'residential_house',
    transaction_type: 'sale',
    bedrooms: 5,
    bathrooms: 3,
    built_area_sqm: 260,
    total_area_sqm: 500,
    year_built: 2018,
    condition: 'good',
    price: 950000,
    price_currency: 'GHS',
    evidence_type: 'verified_sale',
    sold_price: 920000,
    data_source: 'manual_entry',
    floors: 2,
    maxDistanceKm: 2.0,
    ageMonths: 10,
  },

  // === Delisted/Inferred Sales ===
  {
    address_street: '33 Abokobi Road',
    address_city: 'Abokobi',
    neighborhood: 'Abokobi',
    property_type: 'residential_house',
    transaction_type: 'sale',
    bedrooms: 4,
    bathrooms: 2,
    built_area_sqm: 185,
    total_area_sqm: 380,
    year_built: 2021,
    condition: 'excellent',
    price: 720000,
    price_currency: 'GHS',
    inferred_sale_price: 680000,
    evidence_type: 'delisted_inferred',
    is_delisted: true,
    data_source: 'meqasa',
    floors: 1,
    maxDistanceKm: 2.5,
    ageMonths: 4,
  },
  {
    address_street: '9 Pantang Road',
    address_city: 'Pantang',
    neighborhood: 'Pantang',
    property_type: 'residential_house',
    transaction_type: 'sale',
    bedrooms: 3,
    bathrooms: 2,
    built_area_sqm: 165,
    total_area_sqm: 350,
    year_built: 2017,
    condition: 'good',
    price: 620000,
    price_currency: 'GHS',
    inferred_sale_price: 590000,
    evidence_type: 'delisted_inferred',
    is_delisted: true,
    data_source: 'tonaton',
    floors: 1,
    maxDistanceKm: 3.5,
    ageMonths: 12,
  },

  // === Active Listings ===
  {
    address_street: '41 Dodowa Road',
    address_city: 'Adenta',
    neighborhood: 'Adenta Municipal',
    property_type: 'residential_house',
    transaction_type: 'sale',
    bedrooms: 4,
    bathrooms: 3,
    built_area_sqm: 210,
    total_area_sqm: 420,
    year_built: 2022,
    condition: 'excellent',
    price: 900000,
    price_currency: 'GHS',
    evidence_type: 'listing',
    data_source: 'meqasa',
    floors: 2,
    maxDistanceKm: 4.0,
    ageMonths: 2,
  },
  {
    address_street: '5 Ashongman Road',
    address_city: 'Ashongman',
    neighborhood: 'Ga East',
    property_type: 'residential_house',
    transaction_type: 'sale',
    bedrooms: 4,
    bathrooms: 2,
    built_area_sqm: 200,
    total_area_sqm: 400,
    year_built: 2019,
    condition: 'good',
    price: 750000,
    price_currency: 'GHS',
    evidence_type: 'listing',
    data_source: 'jiji',
    floors: 2,
    maxDistanceKm: 3.0,
    ageMonths: 1,
  },
  {
    address_street: '18 Madina-Adenta Highway',
    address_city: 'Madina',
    neighborhood: 'La Nkwantanang',
    property_type: 'residential_house',
    transaction_type: 'sale',
    bedrooms: 3,
    bathrooms: 2,
    built_area_sqm: 180,
    total_area_sqm: 350,
    year_built: 2020,
    condition: 'good',
    price: 680000,
    price_currency: 'GHS',
    evidence_type: 'listing',
    data_source: 'meqasa',
    floors: 1,
    maxDistanceKm: 4.5,
    ageMonths: 3,
  },

  // === USD-priced listing (tests currency conversion) ===
  {
    address_street: '12 East Legon Hills',
    address_city: 'East Legon Hills',
    neighborhood: 'Katamanso',
    property_type: 'residential_house',
    transaction_type: 'sale',
    bedrooms: 5,
    bathrooms: 3,
    built_area_sqm: 240,
    total_area_sqm: 500,
    year_built: 2021,
    condition: 'excellent',
    price: 65000,
    price_currency: 'USD',
    evidence_type: 'listing',
    data_source: 'meqasa',
    floors: 2,
    maxDistanceKm: 4.0,
    ageMonths: 5,
  },

  // === Contributed property ===
  {
    address_street: '28 Teiman Road',
    address_city: 'Teiman',
    neighborhood: 'Oyarifa',
    property_type: 'residential_house',
    transaction_type: 'sale',
    bedrooms: 4,
    bathrooms: 2,
    built_area_sqm: 190,
    total_area_sqm: 380,
    year_built: 2018,
    condition: 'fair',
    price: 650000,
    price_currency: 'GHS',
    evidence_type: 'contributed',
    data_source: 'manual_entry',
    floors: 1,
    maxDistanceKm: 1.0,
    ageMonths: 14,
  },
];

async function seedComparables() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    let inserted = 0;
    
    for (const prop of comparableProperties) {
      const { lat, lng } = randomOffset(prop.maxDistanceKm);
      const createdAt = new Date();
      createdAt.setMonth(createdAt.getMonth() - prop.ageMonths);
      
      const id = uuidv4();
      const refNumber = `PM-GA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      await client.query(`
        INSERT INTO properties (
          id, reference_number, region, address_street, address_city, address_district,
          property_type, transaction_type, title, 
          bedrooms, bathrooms, built_area_sqm, total_area_sqm, year_built, condition, floors,
          price, price_currency, 
          latitude, longitude,
          evidence_type, data_source,
          inferred_sale_price, sold_price, is_delisted,
          status, verification_status,
          created_at, updated_at
        ) VALUES (
          $1, $2, 'greater_accra', $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15,
          $16, $17,
          $18, $19,
          $20, $21,
          $22, $23, $24,
          'active', 'unverified',
          $25, $25
        )
      `, [
        id,
        refNumber,
        prop.address_street,
        prop.address_city,
        prop.neighborhood || null,
        prop.property_type,
        prop.transaction_type,
        `${prop.bedrooms} Bedroom ${prop.condition || ''} House in ${prop.address_city}`.trim(),
        prop.bedrooms,
        prop.bathrooms,
        prop.built_area_sqm,
        prop.total_area_sqm,
        prop.year_built,
        prop.condition || null,
        prop.floors || 1,
        prop.price,
        prop.price_currency,
        lat,
        lng,
        prop.evidence_type || 'listing',
        prop.data_source || 'manual_entry',
        (prop as any).inferred_sale_price || null,
        (prop as any).sold_price || null,
        (prop as any).is_delisted || false,
        createdAt.toISOString(),
      ]);
      
      inserted++;
      console.log(`  [${inserted}/${comparableProperties.length}] Inserted: ${prop.address_street}, ${prop.address_city} (${prop.evidence_type}, ${prop.price_currency} ${prop.price}, ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`);
    }

    await client.query('COMMIT');
    console.log(`\n✅ Successfully seeded ${inserted} comparable properties near Dowenhya, Greater Accra`);
    console.log(`   Subject property: 311 Lehigh Dr, Dowenhya (lat: ${SUBJECT_LAT}, lng: ${SUBJECT_LNG})`);
    console.log(`   Valuation ID: c1c7a44d-17bf-4da5-baff-138d7e14f649`);
    
    // Verify the search would work now
    const verify = await pool.query(`
      SELECT COUNT(*) as cnt FROM properties
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND transaction_type = 'sale'
        AND (price IS NOT NULL OR inferred_sale_price IS NOT NULL)
        AND COALESCE(inferred_sale_price, price) > 0
        AND property_type = 'residential_house'
        AND (6371 * acos(LEAST(1.0, GREATEST(-1.0,
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )))) <= 5
    `, [SUBJECT_LAT, SUBJECT_LNG]);
    console.log(`\n🔍 Comparable search would now find: ${verify.rows[0].cnt} properties within 5km`);
    
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedComparables();
