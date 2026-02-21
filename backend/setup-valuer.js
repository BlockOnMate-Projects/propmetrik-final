const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.propmetrik.com:5434/propmetrik' });

(async () => {
  try {
    const valuerId = '22222222-2222-2222-2222-222222222222';
    const userId = '22222222-2222-2222-2222-222222222222';

    // 1. Create valuer record for Sarah Mensah
    const insert = await pool.query(`
      INSERT INTO valuers (id, user_id, name, title, qualifications, license_number, license_issuer, 
        license_status, company_name, contact_email, specializations, regions_covered, is_active, created_at, updated_at)
      VALUES ($1, $2, 'Sarah Mensah', 'Valuation & Estate Surveyor', 'BSc. Land Economy, MGhIS', 
        '1234567', 'Ghana Institution of Surveyors', 'active',
        'Realteum Valuations', 'admin@realteum.com', 
        ARRAY['residential', 'commercial'], ARRAY['GR', 'AR', 'WR'], true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      RETURNING id, name
    `, [valuerId, userId]);
    console.log('Valuer created:', JSON.stringify(insert.rows));

    // 2. Link the valuation to this valuer
    const update = await pool.query(`
      UPDATE valuations 
      SET valuer_id = $1, created_by = $2, valuer_license_number = '1234567'
      WHERE id = 'c1c7a44d-17bf-4da5-baff-138d7e14f649'
      RETURNING id, valuer_id, created_by
    `, [valuerId, userId]);
    console.log('Valuation updated:', JSON.stringify(update.rows));

    // 3. Verify
    const verify = await pool.query('SELECT id, name, user_id, license_number, title FROM valuers WHERE id = $1', [valuerId]);
    console.log('Valuer verified:', JSON.stringify(verify.rows, null, 2));

    const valuation = await pool.query("SELECT valuer_id, created_by, valuer_license_number FROM valuations WHERE id = 'c1c7a44d-17bf-4da5-baff-138d7e14f649'");
    console.log('Valuation verified:', JSON.stringify(valuation.rows[0], null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
