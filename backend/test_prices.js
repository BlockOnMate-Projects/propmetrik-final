const { Pool } = require('pg');
const pool = new Pool({ host: 'pg.cedynhq.com', port: 5434, database: 'propmetrik', user: 'propmetrik_app', password: '3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn' });
(async () => {
  const r1 = await pool.query("SELECT DISTINCT region::text FROM material_prices LIMIT 10");
  console.log('Regions:', r1.rows.map(r => r.region));
  const r2 = await pool.query("SELECT DISTINCT category::text FROM material_prices LIMIT 10");
  console.log('Categories:', r2.rows.map(r => r.category));
  try {
    const r3 = await pool.query(`SELECT DISTINCT ON (mp.material_name, mp.region)
      mp.id, mp.category, mp.material_name, mp.specification,
      mp.price_ghs as "unitPrice", 'GHS' as currency, mp.unit as uom,
      mp.region, mp.supplier_name as "vendorName",
      mp.effective_date as "effectiveDate", mp.source_name as "source"
    FROM material_prices mp
    WHERE (mp.region::text = $1 OR mp.region_id = $1)
    ORDER BY mp.material_name, mp.region, mp.effective_date DESC`, ['Greater Accra']);
    console.log('Query rows:', r3.rows.length);
    if (r3.rows.length > 0) console.log('Sample:', JSON.stringify(r3.rows[0]));
  } catch(e) { console.log('Query error:', e.message); }
  pool.end();
})();
