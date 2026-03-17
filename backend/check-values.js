const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik" });

async function main() {
  // Get the valuation data to check value types
  const r = await pool.query(
    `SELECT valuation_id FROM valuation_reports WHERE id = '0604b860-d4ee-4bd4-b19b-bb41c7da5857'`
  );
  const valId = r.rows[0].valuation_id;
  
  const r2 = await pool.query(
    `SELECT final_value_ghs, estimated_value, force_sale_value, fsv_discount_percent
     FROM valuations WHERE id = $1`,
    [valId]
  );
  
  const v = r2.rows[0];
  console.log("=== VALUATION DATA ===");
  console.log("final_value_ghs:", v.final_value_ghs, "type:", typeof v.final_value_ghs);
  console.log("estimated_value:", v.estimated_value, "type:", typeof v.estimated_value);
  console.log("force_sale_value:", v.force_sale_value, "type:", typeof v.force_sale_value);
  
  // Test formatting
  const val = v.final_value_ghs || v.estimated_value || 0;
  console.log("\nFormatting test:");
  console.log("  Value:", val, "typeof:", typeof val);
  console.log("  toLocaleString:", Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  
  // Check if the issue is string vs number
  if (typeof val === 'string') {
    console.log("  ** VALUE IS A STRING, not a number!");
    console.log("  parseFloat:", parseFloat(val));
    console.log("  parseFloat formatted:", parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
