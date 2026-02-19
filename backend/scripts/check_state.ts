import { pool } from "../src/database";

(async () => {
  const r = await pool.query("SELECT email, permanent_id, user_id FROM esign_signer_identities ORDER BY created_at");
  console.log("Current identities:", JSON.stringify(r.rows, null, 2));
  
  const allC = await pool.query(
    "SELECT conname, contype, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'esign_signer_identities'::regclass"
  );
  console.log("\nConstraints:", JSON.stringify(allC.rows, null, 2));
  
  // Check if user_id column was added (the transaction rolled back)
  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'esign_signer_identities' AND column_name = 'user_id'"
  );
  console.log("\nuser_id column exists:", cols.rows.length > 0);
  
  process.exit(0);
})();
