#!/usr/bin/env node
// Quick inspection of a publication's HTML structure
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const slug = process.argv[2] || 'ghana-real-estate-data-scarcity-limits-market-insights-mlv4nd8c';
  const { rows } = await pool.query(
    "SELECT title, content_html, content_json, key_findings, ai_generated, excerpt FROM publications WHERE slug = $1",
    [slug]
  );
  if (!rows.length) { console.log('Not found'); return; }
  const pub = rows[0];
  const html = pub.content_html || '';

  console.log('=== PUBLICATION INSPECTION ===');
  console.log(`Title: ${pub.title}`);
  console.log(`AI Generated: ${pub.ai_generated}`);
  console.log(`Excerpt: ${(pub.excerpt || '').substring(0, 100)}...`);
  console.log(`Content blocks: ${Array.isArray(pub.content_json) ? pub.content_json.length : 0}`);
  console.log(`HTML length: ${html.length} chars`);
  console.log();

  // Tag counts
  const tags = ['h2', 'h3', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote'];
  console.log('=== TAG COUNTS ===');
  for (const tag of tags) {
    const count = (html.match(new RegExp(`<${tag}[> ]`, 'g')) || []).length;
    if (count > 0) console.log(`  <${tag}>: ${count}`);
  }

  // Check for raw markdown
  const rawMd = (html.match(/\*\*/g) || []).length;
  const rawH = (html.match(/^##\s/gm) || []).length;
  console.log(`  Raw ** (markdown bold): ${rawMd}`);
  console.log(`  Raw ## (markdown heading): ${rawH}`);
  console.log();

  // Section structure
  console.log('=== DOCUMENT SECTIONS ===');
  const parts = html.split(/<h2>/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0 && !part.trim()) continue;
    
    const headingMatch = part.match(/^(.*?)<\/h2>/);
    const heading = headingMatch ? headingMatch[1] : '(no heading)';
    const body = headingMatch ? part.slice(headingMatch[0].length) : part;
    
    const pCount = (body.match(/<p>/g) || []).length;
    const liCount = (body.match(/<li>/g) || []).length;
    const strongCount = (body.match(/<strong>/g) || []).length;
    const text = body.replace(/<[^>]+>/g, '').trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    
    if (i > 0 || heading !== '(no heading)') {
      console.log(`\n## ${heading}`);
      console.log(`   ${pCount} paragraphs | ${liCount} list items | ${strongCount} bold phrases | ~${wordCount} words`);
      console.log(`   Preview: ${text.substring(0, 180).replace(/\n/g, ' ')}...`);
    }
  }

  // Key findings
  console.log('\n=== KEY FINDINGS ===');
  const kf = Array.isArray(pub.key_findings) ? pub.key_findings : [];
  kf.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
