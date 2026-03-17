const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik" });

async function main() {
  // Check report record
  const r = await pool.query(
    `SELECT id, docx_storage_key, pdf_storage_key, digital_seal_hash, 
            content, updated_at, status, valuation_id
     FROM valuation_reports 
     WHERE id = '0604b860-d4ee-4bd4-b19b-bb41c7da5857'`
  );
  
  const report = r.rows[0];
  if (!report) { console.log("Report not found"); return; }
  
  console.log("=== REPORT RECORD ===");
  console.log("status:", report.status);
  console.log("docx_storage_key:", report.docx_storage_key);
  console.log("pdf_storage_key:", report.pdf_storage_key);
  console.log("updated_at:", report.updated_at);
  console.log("content keys:", report.content ? Object.keys(report.content) : "null");
  
  const content = report.content || {};
  console.log("sections count:", Array.isArray(content.sections) ? content.sections.length : "no sections key");
  console.log("generated_at:", content.generated_at);
  console.log("docx_url:", content.docx_url ? content.docx_url.substring(0, 80) + "..." : "none");
  
  // Check what the frontend's ReportEditor is loading - report sections
  const r2 = await pool.query(
    `SELECT content FROM valuation_reports WHERE id = '0604b860-d4ee-4bd4-b19b-bb41c7da5857'`
  );
  const fullContent = r2.rows[0]?.content;
  console.log("\n=== FULL CONTENT ===");
  console.log(JSON.stringify(fullContent, null, 2).substring(0, 500));
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
