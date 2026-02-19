const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik' });

(async () => {
  try {
    // Update valuation status to completed
    await pool.query("UPDATE valuations SET status = 'completed' WHERE id = 'c1c7a44d-17bf-4da5-baff-138d7e14f649'");
    console.log('Valuation status set to completed');

    // Reset report to draft for testing
    await pool.query("UPDATE valuation_reports SET status = 'draft', approved_at = null, approved_by = null, digital_seal_hash = null WHERE id = '2dd37218-f5e7-4d59-babc-42ecf63bad1c'");
    console.log('Report reset to draft');

    // Verify everything
    const v = await pool.query("SELECT id, status, valuer_id, created_by FROM valuations WHERE id = 'c1c7a44d-17bf-4da5-baff-138d7e14f649'");
    console.log('Valuation:', JSON.stringify(v.rows[0]));

    const r = await pool.query("SELECT id, status FROM valuation_reports WHERE id = '2dd37218-f5e7-4d59-babc-42ecf63bad1c'");
    console.log('Report:', JSON.stringify(r.rows[0]));

    const val = await pool.query("SELECT id, name, license_number, title, user_id FROM valuers WHERE id = '22222222-2222-2222-2222-222222222222'");
    console.log('Valuer:', JSON.stringify(val.rows[0]));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
