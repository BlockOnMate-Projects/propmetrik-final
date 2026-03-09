const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
});

const statements = [
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
  "CREATE INDEX IF NOT EXISTS idx_project_invoices_paystack_ref ON project_invoices(paystack_reference) WHERE paystack_reference IS NOT NULL",
];

(async () => {
  for (const sql of statements) {
    try {
      await pool.query(sql);
      console.log('OK:', sql.substring(0, 80));
    } catch (e) {
      console.error('FAIL:', sql.substring(0, 80), '-', e.message);
    }
  }

  // Verify
  const res = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'project_invoices' AND column_name IN ('paystack_reference','paystack_access_code','payment_link','sent_at','platform_fee') ORDER BY column_name"
  );
  console.log('\nVerification - columns found:', res.rows.map(r => r.column_name));
  
  await pool.end();
})();
