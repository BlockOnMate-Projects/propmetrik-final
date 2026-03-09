const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
});

(async () => {
  // Check the check constraint definition
  const r1 = await pool.query(`
    SELECT conname, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'project_invoices'::regclass
      AND contype = 'c'
  `);
  console.log('CHECK constraints on project_invoices:');
  r1.rows.forEach(r => console.log(' ', r.conname, ':', r.def));

  // Also check what statuses exist in InvoiceBuilder (frontend sends these)
  const r2 = await pool.query(`SELECT DISTINCT status FROM project_invoices`);
  console.log('\nExisting status values:', r2.rows.map(r => r.status));

  await pool.end();
})();
