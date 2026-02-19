import { pool } from "../src/database";

(async () => {
  // Check esign_signer_identities columns
  const idCols = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'esign_signer_identities' ORDER BY ordinal_position"
  );
  console.log("esign_signer_identities:", idCols.rows);

  // Check signers table columns
  const sigCols = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'signers' ORDER BY ordinal_position"
  );
  console.log("signers:", sigCols.rows);

  // Check if there are any records
  const idRows = await pool.query("SELECT * FROM esign_signer_identities LIMIT 5");
  console.log("esign_signer_identities rows:", idRows.rows);
  
  const sigRows = await pool.query("SELECT * FROM signers LIMIT 5");
  console.log("signers rows:", sigRows.rows);

  process.exit(0);
})();
