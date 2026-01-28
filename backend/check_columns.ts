import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
});

async function checkColumns() {
  const result = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'deal_pipelines' ORDER BY ordinal_position"
  );
  console.log('deal_pipelines columns:', result.rows.map(r => r.column_name));
  await pool.end();
}

checkColumns().catch(console.error);
