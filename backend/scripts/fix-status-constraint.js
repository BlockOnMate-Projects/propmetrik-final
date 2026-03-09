const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
});

(async () => {
  try {
    // Drop old constraint
    await pool.query('ALTER TABLE project_invoices DROP CONSTRAINT IF EXISTS project_invoices_status_check');
    console.log('OK: Dropped old constraint');

    // Add new constraint with all needed statuses
    await pool.query(`
      ALTER TABLE project_invoices ADD CONSTRAINT project_invoices_status_check
      CHECK (status IN (
        'draft', 'pending', 'sent', 'viewed',
        'under_review', 'approved',
        'partially_paid', 'paid', 'settled',
        'overdue', 'disputed', 'rejected', 'cancelled', 'void'
      ))
    `);
    console.log('OK: Added new constraint with sent/viewed/settled/void');

    // Verify
    const r = await pool.query(`
      SELECT pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'project_invoices'::regclass AND conname = 'project_invoices_status_check'
    `);
    console.log('Verified:', r.rows[0]?.def);
  } catch (e) {
    console.error('Error:', e.message);
  }
  await pool.end();
})();
