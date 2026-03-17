// Trigger prepare-esign to regenerate both DOCX and PDF, then check the PDF
const http = require('http');

const reportId = '0604b860-d4ee-4bd4-b19b-bb41c7da5857';

// First, let's check if the current PDF on disk has underline
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the PDF storage key and download it
const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik" });

async function main() {
  const r = await pool.query(
    `SELECT pdf_storage_key, docx_storage_key FROM valuation_reports WHERE id = $1`,
    [reportId]
  );
  const { pdf_storage_key, docx_storage_key } = r.rows[0];
  console.log("PDF key:", pdf_storage_key);
  console.log("DOCX key:", docx_storage_key);
  
  // Use the MinIO client to download the PDF
  const Minio = require('minio');
  const client = new Minio.Client({
    endPoint: 's3.cedynhq.com',
    port: 443,
    useSSL: true,
    accessKey: process.env.MINIO_ACCESS_KEY || 'propmetrik_user',
    secretKey: process.env.MINIO_SECRET_KEY || 'v8vN7jQ4kUmP2xR5yZ3wA9bD6eF0hL1t',
  });
  
  const bucket = 'propmetrik-documents';
  
  // Download DOCX
  const docxStream = await client.getObject(bucket, docx_storage_key);
  const docxChunks = [];
  for await (const chunk of docxStream) docxChunks.push(chunk);
  const docxBuf = Buffer.concat(docxChunks);
  fs.writeFileSync('/tmp/latest_report.docx', docxBuf);
  console.log("Downloaded DOCX:", docxBuf.length, "bytes");
  
  // Check underline in DOCX
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(docxBuf);
  const docXml = zip.readAsText('word/document.xml');
  
  // Find all <w:u> elements
  const uMatches = docXml.match(/<w:u[^>]*\/>/g);
  console.log("\nUnderline elements in DOCX:", uMatches ? uMatches.length : 0);
  if (uMatches) uMatches.forEach(m => console.log("  ", m));
  
  // Find the RE: text and its surrounding XML
  const reIdx = docXml.indexOf('RE: ');
  if (reIdx >= 0) {
    // Get the paragraph containing RE:
    const paraStart = docXml.lastIndexOf('<w:p ', reIdx);
    const paraEnd = docXml.indexOf('</w:p>', reIdx) + 6;
    const rePara = docXml.substring(paraStart, paraEnd);
    console.log("\n=== RE: PARAGRAPH XML (first 800 chars) ===");
    console.log(rePara.substring(0, 800));
    console.log("\nContains <w:u>?", rePara.includes('<w:u'));
  }
  
  // Download PDF and check with pdftotext
  const pdfStream = await client.getObject(bucket, pdf_storage_key);
  const pdfChunks = [];
  for await (const chunk of pdfStream) pdfChunks.push(chunk);
  const pdfBuf = Buffer.concat(pdfChunks);
  fs.writeFileSync('/tmp/latest_report.pdf', pdfBuf);
  console.log("\nDownloaded PDF:", pdfBuf.length, "bytes");
  
  // Check basic PDF text
  try {
    const text = execSync('pdftotext -f 2 -l 2 /tmp/latest_report.pdf - 2>/dev/null').toString();
    console.log("\n=== PDF PAGE 2 TEXT (first 500 chars) ===");
    console.log(text.substring(0, 500));
  } catch (e) {
    console.log("pdftotext not available, skipping text extraction");
  }
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
