const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    const q = async (sql, label) => { const r = await p.query(sql); console.log(label, r.rows); };
    await q("SELECT COUNT(*) as cnt FROM properties WHERE is_transaction_record = true", 'txn_records:');
    await q("SELECT COUNT(*) as cnt FROM properties WHERE sold_price > 0", 'sold_price:');
    await q("SELECT COUNT(*) as cnt FROM properties WHERE transaction_value > 0", 'txn_value:');
    await q("SELECT status::text, COUNT(*) as cnt FROM properties GROUP BY status ORDER BY cnt DESC", 'status:');
    await q("SELECT MIN(created_at) as min_d, MAX(created_at) as max_d FROM properties", 'dates:');
    await q("SELECT transaction_type::text, COUNT(*) as cnt FROM properties GROUP BY transaction_type ORDER BY cnt DESC", 'txn_type:');
    await q("SELECT MIN(price) as min_p, MAX(price) as max_p, AVG(price)::int as avg_p FROM properties WHERE price > 0", 'price:');
  } catch(e) { console.error(e.message); }
  await p.end();
})();
