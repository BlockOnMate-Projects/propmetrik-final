#!/usr/bin/env node
/**
 * Fix autopilot publication content:
 * 1. Convert raw markdown to proper HTML
 * 2. Remove ai_generated flag
 */
require('dotenv').config();
const { Pool } = require('pg');
const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows } = await pool.query(
    "SELECT id, title, content_html, content_json FROM publications WHERE automation_mode = 'autopilot'"
  );
  console.log(`Found ${rows.length} autopilot publications to fix`);

  for (const row of rows) {
    let blocks = row.content_json;
    if (typeof blocks === 'string') blocks = JSON.parse(blocks);
    if (!Array.isArray(blocks)) {
      console.log(`Skip ${row.id} - no blocks`);
      continue;
    }

    // Convert markdown in each block to HTML
    const newHtml = blocks.map(b => {
      const raw = b.content || '';
      const m = raw.match(/^##\s+(.+?)\n\n?([\s\S]*)/);
      if (m) {
        return `<h2>${m[1]}</h2>\n${md.render(m[2])}`;
      }
      return md.render(raw);
    }).join('\n');

    const newBlocks = blocks.map(b => {
      const raw = b.content || '';
      const m = raw.match(/^##\s+(.+?)\n\n?([\s\S]*)/);
      if (m) {
        return { ...b, content: `<h2>${m[1]}</h2>\n${md.render(m[2])}`, aiGenerated: false };
      }
      return { ...b, content: md.render(raw), aiGenerated: false };
    });

    await pool.query(
      'UPDATE publications SET content_html = $1, content_json = $2, ai_generated = false WHERE id = $3',
      [newHtml, JSON.stringify(newBlocks), row.id]
    );
    console.log(`Fixed: ${row.title}`);
  }

  await pool.end();
  console.log('Done');
}

main().catch(e => { console.error(e); process.exit(1); });
