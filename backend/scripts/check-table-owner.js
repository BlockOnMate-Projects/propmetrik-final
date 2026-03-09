const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
});

(async () => {
  try {
    // Check owner of project_invoices
    const r1 = await pool.query("SELECT tableowner FROM pg_tables WHERE tablename = 'project_invoices'");
    console.log('project_invoices owner:', r1.rows[0]?.tableowner);

    // Check owner of several tables for comparison
    const r2 = await pool.query("SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT 30");
    console.log('\nSample table owners:');
    r2.rows.forEach(r => console.log(' ', r.tablename, '->', r.tableowner));

    // Check current user
    const r3 = await pool.query('SELECT current_user, session_user');
    console.log('\ncurrent_user:', r3.rows[0].current_user, '| session_user:', r3.rows[0].session_user);

    // Check roles
    const r4 = await pool.query("SELECT rolname, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'propmetrik_app'");
    console.log('\npropmetrik_app privileges:', r4.rows[0]);
  } catch (e) {
    console.error('Error:', e.message);
  }
  await pool.end();
})();
