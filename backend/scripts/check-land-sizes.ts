import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik'
});

async function main() {
  console.log('=== Land Property Analysis (Extended Patterns) ===\n');
  
  // Test the full extraction query (same logic as Python adapter)
  const extracted = await pool.query(`
    SELECT 
        p.id,
        p.title,
        p.region,
        p.price,
        CASE 
            -- Priority 1: Direct land_area_sqm if available
            WHEN p.land_area_sqm IS NOT NULL AND p.land_area_sqm > 0 
                THEN p.land_area_sqm
            
            -- Priority 2: NxM format (70x100, 100 x 70, etc.) - assume feet
            WHEN (COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')) ~ '\\d+\\s*[xX×]\\s*\\d+'
                THEN (
                    (SELECT m[1]::numeric * m[2]::numeric * 0.0929 
                     FROM regexp_matches(COALESCE(p.title, '') || ' ' || COALESCE(p.description, ''), 
                         '(\\d+)\\s*[xX×]\\s*(\\d+)', 'i') AS m LIMIT 1)
                )
            
            -- Priority 3: Acres format ("5 acres", "0.33 acres", "2.7-acre", ".5 acre")
            WHEN (COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')) ~* '\\d*\\.?\\d+\\s*-?\\s*acres?'
                THEN (
                    (SELECT m[1]::numeric * 4046.86 
                     FROM regexp_matches(COALESCE(p.title, '') || ' ' || COALESCE(p.description, ''), 
                         '(\\d*\\.?\\d+)\\s*-?\\s*acres?', 'i') AS m LIMIT 1)
                )
            
            -- Priority 4: Plots format ("2 plots", "1 plot", "4 Plots Of Land") - 1 plot = 650 sqm
            WHEN (COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')) ~* '\\d+\\.?\\d*\\s*plots?'
                THEN (
                    (SELECT m[1]::numeric * 650 
                     FROM regexp_matches(COALESCE(p.title, '') || ' ' || COALESCE(p.description, ''), 
                         '(\\d+\\.?\\d*)\\s*plots?', 'i') AS m LIMIT 1)
                )
            
            -- Priority 5: Fallback columns
            WHEN p.total_area_sqm IS NOT NULL AND p.total_area_sqm > 0 
                THEN p.total_area_sqm
            WHEN p.plot_size_acres IS NOT NULL AND p.plot_size_acres > 0 
                THEN p.plot_size_acres * 4046.86
            
            ELSE NULL
        END AS extracted_sqm,
        CASE 
            WHEN p.land_area_sqm IS NOT NULL AND p.land_area_sqm > 0 THEN 'land_area_sqm'
            WHEN (COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')) ~ '\\d+\\s*[xX×]\\s*\\d+' THEN 'NxM_feet'
            WHEN (COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')) ~* '\\d*\\.?\\d+\\s*-?\\s*acres?' THEN 'acres'
            WHEN (COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')) ~* '\\d+\\.?\\d*\\s*plots?' THEN 'plots'
            WHEN p.total_area_sqm IS NOT NULL AND p.total_area_sqm > 0 THEN 'total_area_sqm'
            WHEN p.plot_size_acres IS NOT NULL AND p.plot_size_acres > 0 THEN 'plot_size_acres'
            ELSE 'none'
        END AS extraction_method
    FROM properties p
    WHERE p.property_type::text = 'land'
      AND p.price IS NOT NULL AND p.price > 0
    ORDER BY extracted_sqm DESC NULLS LAST
  `);
  
  // Summary by extraction method
  const methodCounts: { [key: string]: number } = {};
  const withSize = extracted.rows.filter(r => r.extracted_sqm != null);
  const withoutSize = extracted.rows.filter(r => r.extracted_sqm == null);
  
  extracted.rows.forEach(r => {
    methodCounts[r.extraction_method] = (methodCounts[r.extraction_method] || 0) + 1;
  });
  
  console.log('=== Summary ===');
  console.log(`Total land properties: ${extracted.rows.length}`);
  console.log(`With extractable size: ${withSize.length} (${Math.round(withSize.length / extracted.rows.length * 100)}%)`);
  console.log(`Without size: ${withoutSize.length}`);
  
  console.log('\n=== Extraction Methods ===');
  Object.entries(methodCounts).sort((a, b) => b[1] - a[1]).forEach(([method, count]) => {
    console.log(`  ${method}: ${count}`);
  });
  
  console.log('\n=== Properties with Extracted Sizes ===\n');
  console.log('Region'.padEnd(18) + 'Method'.padEnd(16) + 'Size (sqm)'.padStart(12) + 'Price (GHS)'.padStart(14) + 'Price/sqm'.padStart(12) + '  Title');
  console.log('-'.repeat(120));
  
  withSize.forEach(row => {
    const sqm = Math.round(row.extracted_sqm);
    const pricePerSqm = sqm > 0 ? Math.round(row.price / sqm) : 0;
    console.log(
      `${(row.region || '').padEnd(18)}${row.extraction_method.padEnd(16)}${sqm.toLocaleString().padStart(12)}${row.price?.toLocaleString().padStart(14) || 'N/A'}${pricePerSqm.toLocaleString().padStart(12)}  ${(row.title || '').substring(0, 50)}`
    );
  });
  
  console.log('\n=== Properties WITHOUT Size (Need Manual Entry) ===\n');
  withoutSize.slice(0, 10).forEach(row => {
    console.log(`  ${row.region}: "${row.title}" - GHS ${row.price?.toLocaleString()}`);
  });
  if (withoutSize.length > 10) {
    console.log(`  ... and ${withoutSize.length - 10} more`);
  }
  
  await pool.end();
}

main().catch(console.error);
