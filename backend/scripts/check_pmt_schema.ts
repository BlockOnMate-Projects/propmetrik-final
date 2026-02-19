import { pool } from "../src/database";

(async () => {
  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name LIKE '%pmt%'"
  );
  console.log("users pmt columns:", cols.rows);
  
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%signer%'"
  );
  console.log("signer tables:", tables.rows);
  
  const sigCols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'esign_signers' ORDER BY ordinal_position"
  );
  console.log("esign_signers cols:", sigCols.rows.map((r: any) => r.column_name).join(", "));
  
  const eric = await pool.query(
    "SELECT id, email, full_name FROM users WHERE id = 'ed4a50d7-a1b2-4c3d-8e5f-6a7b8c9d0e1f'"
  );
  console.log("Eric:", eric.rows[0]);
  
  process.exit(0);
})();
