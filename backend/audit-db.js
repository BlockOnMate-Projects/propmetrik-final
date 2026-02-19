const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik' });

(async () => {
  try {
    // Get all tables
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
    console.log('ALL TABLES:', tables.rows.map(r => r.table_name));

    // Get all columns with user/org references
    const cols = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND (column_name LIKE '%user%' OR column_name LIKE '%created_by%' OR column_name LIKE '%updated_by%' 
           OR column_name LIKE '%valuer%' OR column_name LIKE '%organization%' OR column_name LIKE '%org_%'
           OR column_name LIKE '%manager%' OR column_name LIKE '%assigned%' OR column_name LIKE '%owner%'
           OR column_name LIKE '%approved_by%' OR column_name LIKE '%reviewed_by%' OR column_name LIKE '%signer%')
      ORDER BY table_name, column_name
    `);
    console.log('\nUSER/ORG COLUMNS:');
    cols.rows.forEach(r => console.log(`  ${r.table_name}.${r.column_name} (${r.data_type})`));

    // Get all existing organization records
    const orgs = await pool.query("SELECT * FROM organizations LIMIT 10");
    console.log('\nORGANIZATIONS:', JSON.stringify(orgs.rows, null, 2));

    // Get all existing user records
    const users = await pool.query("SELECT id, email, full_name, role, organization_id FROM users");
    console.log('\nUSERS:', JSON.stringify(users.rows, null, 2));

    // Get existing valuers
    const valuers = await pool.query("SELECT * FROM valuers");
    console.log('\nVALUERS:', JSON.stringify(valuers.rows, null, 2));

    // Get distinct user/org IDs used in valuations
    const valIds = await pool.query("SELECT DISTINCT valuer_id, created_by, valuer_organization_id FROM valuations WHERE valuer_id IS NOT NULL OR created_by IS NOT NULL");
    console.log('\nVALUATION USER/ORG IDs:', JSON.stringify(valIds.rows, null, 2));

    // Check for organization_id column types
    const orgColTypes = await pool.query(`
      SELECT table_name, column_name, data_type, udt_name
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND column_name = 'organization_id'
      ORDER BY table_name
    `);
    console.log('\nORGANIZATION_ID column types:');
    orgColTypes.rows.forEach(r => console.log(`  ${r.table_name}.${r.column_name}: ${r.data_type} (${r.udt_name})`));

    // Check for FK constraints on user/org columns
    const fks = await pool.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND (ccu.table_name = 'users' OR ccu.table_name = 'organizations' OR ccu.table_name = 'valuers')
      ORDER BY tc.table_name
    `);
    console.log('\nFOREIGN KEYS to users/organizations/valuers:');
    fks.rows.forEach(r => console.log(`  ${r.table_name}.${r.column_name} -> ${r.foreign_table_name}.${r.foreign_column_name}`));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
