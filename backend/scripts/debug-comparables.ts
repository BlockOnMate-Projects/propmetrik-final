import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
});

async function main() {
  try {
    // 1. Total properties
    const total = await pool.query('SELECT COUNT(*) as cnt FROM properties');
    console.log('Total properties:', total.rows[0].cnt);

    // 2. Sale properties with coordinates + price
    const forSale = await pool.query(`
      SELECT COUNT(*) as cnt FROM properties 
      WHERE transaction_type = 'sale' 
        AND latitude IS NOT NULL AND longitude IS NOT NULL 
        AND (price IS NOT NULL OR inferred_sale_price IS NOT NULL)
        AND COALESCE(inferred_sale_price, price) > 0
    `);
    console.log('Sale properties with coords+price:', forSale.rows[0].cnt);

    // 3. Greater Accra sale properties
    const accra = await pool.query(`
      SELECT COUNT(*) as cnt FROM properties 
      WHERE region = 'greater_accra' 
        AND transaction_type = 'sale' 
        AND latitude IS NOT NULL AND longitude IS NOT NULL
    `);
    console.log('Greater Accra sale with coords:', accra.rows[0].cnt);

    // 4. The specific valuation
    const val = await pool.query(`
      SELECT v.id, v.property_id, p.address_street, p.address_city, p.region, 
        p.latitude, p.longitude, p.property_type, p.built_area_sqm, p.total_area_sqm,
        p.bedrooms, p.bathrooms, p.year_built, p.condition, p.digital_address,
        p.transaction_type, p.price
      FROM valuations v 
      LEFT JOIN properties p ON p.id = v.property_id 
      WHERE v.id = 'c1c7a44d-17bf-4da5-baff-138d7e14f649'
    `);
    console.log('\nValuation property:', JSON.stringify(val.rows[0], null, 2));

    const prop = val.rows[0];
    if (!prop) {
      console.log('ERROR: Valuation not found!');
      await pool.end();
      return;
    }

    // 5. Check if subject has coordinates
    if (!prop.latitude || !prop.longitude) {
      console.log('\n*** ROOT CAUSE: Subject property has NO COORDINATES ***');
      console.log('latitude:', prop.latitude, 'longitude:', prop.longitude);
      console.log('digital_address:', prop.digital_address);
      
      // Check what properties exist at all in greater_accra
      const anyAccra = await pool.query(`
        SELECT COUNT(*) as cnt, 
          COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as with_coords,
          COUNT(CASE WHEN transaction_type = 'sale' THEN 1 END) as for_sale
        FROM properties WHERE region = 'greater_accra'
      `);
      console.log('\nGreater Accra stats:', anyAccra.rows[0]);
    } else {
      // 6. Nearby properties within 5km
      const nearby = await pool.query(`
        SELECT COUNT(*) as cnt FROM properties
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          AND transaction_type = 'sale'
          AND (price IS NOT NULL OR inferred_sale_price IS NOT NULL)
          AND COALESCE(inferred_sale_price, price) > 0
          AND id != $3
          AND (6371 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )))) <= 5
      `, [prop.latitude, prop.longitude, prop.property_id]);
      console.log('\nSale properties within 5km:', nearby.rows[0].cnt);

      // 7. Same property type within 5km
      const sameType = await pool.query(`
        SELECT COUNT(*) as cnt FROM properties
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          AND transaction_type = 'sale'
          AND (price IS NOT NULL OR inferred_sale_price IS NOT NULL)
          AND COALESCE(inferred_sale_price, price) > 0
          AND property_type = $3
          AND id != $4
          AND (6371 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )))) <= 5
      `, [prop.latitude, prop.longitude, prop.property_type, prop.property_id]);
      console.log('Same type within 5km:', sameType.rows[0].cnt);

      // 8. Within 5km, same type, matching size (±30%)
      const subjectSize = prop.built_area_sqm || prop.total_area_sqm || 200;
      const sizeMatching = await pool.query(`
        SELECT COUNT(*) as cnt FROM properties
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          AND transaction_type = 'sale'
          AND (price IS NOT NULL OR inferred_sale_price IS NOT NULL)
          AND COALESCE(inferred_sale_price, price) > 0
          AND property_type = $3
          AND id != $6
          AND (6371 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )))) <= 5
          AND (
            (built_area_sqm IS NULL AND total_area_sqm IS NULL) OR
            COALESCE(built_area_sqm, total_area_sqm) BETWEEN $4 AND $5
          )
      `, [prop.latitude, prop.longitude, prop.property_type, subjectSize * 0.7, subjectSize * 1.3, prop.property_id]);
      console.log('Same type + size range within 5km:', sizeMatching.rows[0].cnt);

      // 9. Check created_at filter (24 months)
      const withAge = await pool.query(`
        SELECT COUNT(*) as cnt FROM properties
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          AND transaction_type = 'sale'
          AND (price IS NOT NULL OR inferred_sale_price IS NOT NULL)
          AND COALESCE(inferred_sale_price, price) > 0
          AND property_type = $3
          AND id != $4
          AND created_at >= NOW() - INTERVAL '24 months'
          AND (6371 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )))) <= 5
      `, [prop.latitude, prop.longitude, prop.property_type, prop.property_id]);
      console.log('Same type within 5km + 24mo recency:', withAge.rows[0].cnt);

      // 10. Nearest 10 properties of any kind
      const nearest = await pool.query(`
        SELECT id, address_street, address_city, property_type, bedrooms, built_area_sqm, 
          price, transaction_type, evidence_type, created_at::date,
          (6371 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )))) AS distance_km
        FROM properties
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          AND (price IS NOT NULL OR inferred_sale_price IS NOT NULL)
        ORDER BY distance_km
        LIMIT 10
      `, [prop.latitude, prop.longitude]);
      console.log('\nNearest 10 properties:');
      for (const r of nearest.rows) {
        console.log(`  ${Number(r.distance_km).toFixed(1)}km - ${r.address_street}, ${r.address_city} (${r.property_type}, ${r.transaction_type}, ${r.bedrooms}bd, ${r.built_area_sqm}sqm, GHS${r.price}, ${r.evidence_type}, created:${r.created_at})`);
      }
    }

    // 11. Check distinct regions
    const regions = await pool.query(`
      SELECT region, COUNT(*) as cnt FROM properties GROUP BY region ORDER BY cnt DESC
    `);
    console.log('\nProperties by region:');
    for (const r of regions.rows) {
      console.log(`  ${r.region}: ${r.cnt}`);
    }

    // 12. Check all property types
    const types = await pool.query(`
      SELECT property_type, transaction_type, COUNT(*) as cnt 
      FROM properties 
      WHERE region = 'greater_accra'
      GROUP BY property_type, transaction_type 
      ORDER BY cnt DESC
    `);
    console.log('\nGreater Accra by type/transaction:');
    for (const r of types.rows) {
      console.log(`  ${r.property_type} (${r.transaction_type}): ${r.cnt}`);
    }

    // 13. Show ALL properties with all key fields
    const allProps = await pool.query(`
      SELECT id, address_street, address_city, property_type, transaction_type, 
        price, price_currency, latitude, longitude, built_area_sqm, total_area_sqm,
        bedrooms, bathrooms, condition, evidence_type, inferred_sale_price, created_at
      FROM properties ORDER BY created_at
    `);
    console.log('\n=== ALL PROPERTIES IN DATABASE ===');
    for (const r of allProps.rows) {
      console.log(JSON.stringify(r, null, 2));
      console.log('---');
    }

    // 14. KEY DIAGNOSIS
    console.log('\n=== DIAGNOSIS ===');
    console.log('The comparable search query requires:');
    console.log('  1. latitude IS NOT NULL AND longitude IS NOT NULL');
    console.log('  2. price IS NOT NULL OR inferred_sale_price IS NOT NULL');
    console.log('  3. COALESCE(inferred_sale_price, price) > 0');
    console.log('  4. transaction_type = sale');
    console.log('  5. Within radius (Haversine)');
    console.log('  6. created_at >= NOW() - 24 months');
    console.log('  7. property_type match');
    console.log('  8. Size ±30% range');
    
    // Check which criteria eliminate candidates
    const diagnosis = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE id != $1) as total_excl_subject,
        COUNT(*) FILTER (WHERE id != $1 AND latitude IS NOT NULL AND longitude IS NOT NULL) as has_coords,
        COUNT(*) FILTER (WHERE id != $1 AND (price IS NOT NULL OR inferred_sale_price IS NOT NULL)) as has_price,
        COUNT(*) FILTER (WHERE id != $1 AND COALESCE(inferred_sale_price, price) > 0) as price_gt_zero,
        COUNT(*) FILTER (WHERE id != $1 AND transaction_type = 'sale') as is_sale,
        COUNT(*) FILTER (WHERE id != $1 AND created_at >= NOW() - INTERVAL '24 months') as recent
      FROM properties
    `, [prop?.property_id || '00000000-0000-0000-0000-000000000000']);
    console.log('\nFilter funnel (excluding subject):');
    console.log(JSON.stringify(diagnosis.rows[0], null, 2));

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

main();
