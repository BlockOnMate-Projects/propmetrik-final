const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
});

(async () => {
  try {
    // First check existing columns
    const cols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'project_invoices' ORDER BY ordinal_position"
    );
    console.log('Existing columns:', cols.rows.map(r => r.column_name).join(', '));

    // Try a simple ALTER TABLE
    console.log('\nAttempting ALTER TABLE...');
    await pool.query("ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS test_col_xyz TEXT");
    console.log('SUCCESS: ALTER TABLE works!');

    // Clean up test column
    await pool.query("ALTER TABLE project_invoices DROP COLUMN IF EXISTS test_col_xyz");
    console.log('Cleaned up test column');

    // Now apply real columns
    const stmts = [
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS paystack_reference VARCHAR(255)",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS paystack_access_code VARCHAR(255)",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS payment_link TEXT",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS client_name VARCHAR(255)",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS client_email VARCHAR(255)",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS client_company VARCHAR(255)",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255)",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255)",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS vendor_company VARCHAR(255)",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(15,2) DEFAULT 0",
      "ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS total_due NUMERIC(15,2)",
    ];

    for (const sql of stmts) {
      try {
        await pool.query(sql);
        console.log('OK:', sql.substring(0, 90));
      } catch (e) {
        console.error('FAIL:', sql.substring(0, 90), '\n  Error:', e.message);
      }
    }

    // Create index
    try {
      await pool.query("CREATE INDEX IF NOT EXISTS idx_project_invoices_paystack_ref ON project_invoices(paystack_reference) WHERE paystack_reference IS NOT NULL");
      console.log('OK: Index created');
    } catch (e) {
      console.error('FAIL index:', e.message);
    }

    // Verify
    const verify = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'project_invoices' AND column_name IN ('paystack_reference','paystack_access_code','payment_link','sent_at','platform_fee','total_due','client_name','vendor_name') ORDER BY column_name"
    );
    console.log('\nVerification - new columns found:', verify.rows.map(r => r.column_name));
  } catch (e) {
    console.error('Fatal error:', e.message);
    console.error('Full error:', e);
  }
  await pool.end();
})();
