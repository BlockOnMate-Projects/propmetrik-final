#!/usr/bin/env node
/**
 * Run migration 071 for document templates
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const sql = fs.readFileSync('./database/migrations/071_document_templates_esign_integration.sql', 'utf8');
  
  try {
    await pool.query(sql);
    console.log('✓ Migration completed successfully');
  } catch (e) {
    console.error('✗ Migration error:', e.message);
  }
  
  // Check tables
  const result = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' 
    AND (
      table_name LIKE 'crm_document%' 
      OR table_name LIKE 'crm_generated%' 
      OR table_name LIKE 'crm_deal_doc%' 
      OR table_name LIKE 'crm_stage_doc%' 
      OR table_name LIKE 'crm_merge%'
    )
    ORDER BY table_name
  `);
  console.log('Tables:', result.rows.map(r => r.table_name).join(', '));
  
  await pool.end();
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
