#!/usr/bin/env node
/**
 * Phantom-table guard (Risk R1 regression fence).
 *
 * The CRM's real core tables are UN-prefixed (`deals`, `contacts`, `tasks`,
 * `deal_stages`, `deal_pipelines`, `deal_activities`). Only auxiliary tables carry
 * the `crm_` prefix. Historically, code queried non-existent `crm_deals` / `crm_contacts`
 * / `crm_tasks` / `crm_activities` etc. — a bug `tsc` cannot see because the names live
 * inside SQL string literals. This script fails the build if any `crm_*` identifier
 * appears in a table position (after FROM/JOIN/INTO/UPDATE/TABLE, or as a quoted
 * table-name literal) that is NOT a real `crm_*` table.
 *
 * DB-free by design (safe for CI): the allow-list below is the authoritative set of
 * real `crm_*` tables. Regenerate with:
 *   psql "$DATABASE_URL" -tAc \
 *     "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'crm\\_%' ORDER BY 1"
 * then add any new table here. `crm_emails` is created at runtime (ensureTable) so it is
 * allow-listed explicitly.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src', 'shared-services'].map((d) => join(BACKEND_ROOT, d));

// Authoritative real crm_* tables (public schema) + runtime-created crm_emails.
const REAL_CRM_TABLES = new Set([
  'crm_agent_territories', // mig 274 — PostGIS agent territories
  'crm_campaign_segments', // mig 275 — audience segments
  'crm_deal_document_checklist',
  'crm_document_templates',
  'crm_drip_campaign_steps',
  'crm_drip_campaigns',
  'crm_drip_enrollments',
  'crm_drip_step_sends', // mig 271 — idempotent drip execution send ledger
  'crm_drip_step_variants', // mig 276 — A/B step variants
  'crm_drip_tracking_events', // mig 275 — open/click event log
  'crm_emails', // runtime-created via ensureTable()
  'crm_esign_audit',
  'crm_generated_documents',
  'crm_merge_field_registry',
  'crm_notification_preferences',
  'crm_notifications',
  'crm_properties',
  'crm_property_sync_log',
  'crm_property_viewings',
  'crm_saved_views',
  'crm_scheduled_reports',
  'crm_signer_role_config',
  'crm_stage_document_requirements',
  'crm_sync_stats', // VIEW (not in pg_tables) — org sync aggregate
  'crm_transaction_records',
  // Runtime-created (ensureTable-style) — intentional, not migrated:
  'crm_building_floors',
  'crm_building_units',
  // CTE alias used in a UNION (marketplaceService), not a physical table:
  'crm_props',
]);

// crm_* in a SQL table position: after FROM/JOIN/INTO/UPDATE/TABLE (allow whitespace/newlines/quotes).
const SQL_CTX = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+["'`]?(crm_[a-z0-9_]+)/gi;
// crm_* as a resource→table map literal, e.g. `table: 'crm_activities'` (the exact shape of the
// authorize.ts RESOURCE_TABLE_MAP bug). Deliberately narrow to avoid flagging RBAC resource KEYS
// ('crm_deal') and audit-action strings ('crm_payments'), which are not tables.
const TABLE_LITERAL = /\btable:\s*["'`](crm_[a-z0-9_]+)["'`]/gi;

function walk(dir) {
  let files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '_archive_legacy') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) files = files.concat(walk(full));
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

const violations = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const rx of [SQL_CTX, TABLE_LITERAL]) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(text)) !== null) {
        const token = m[1];
        if (!REAL_CRM_TABLES.has(token)) {
          violations.push({
            file: file.replace(BACKEND_ROOT + '/', ''),
            line: lineOf(text, m.index),
            token,
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  // De-dup identical (file,line,token) hits from the two patterns.
  const seen = new Set();
  const unique = violations.filter((v) => {
    const k = `${v.file}:${v.line}:${v.token}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.error('\n✖ Phantom CRM table reference(s) detected (Risk R1):\n');
  for (const v of unique.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.error(`  ${v.file}:${v.line}  →  ${v.token}`);
  }
  console.error(
    '\nThe real CRM tables are UN-prefixed: deals, contacts, tasks, deal_stages, deal_pipelines, deal_activities.',
  );
  console.error(
    'If a new REAL crm_* table was added, allow-list it in backend/scripts/check-crm-tables.mjs.\n',
  );
  process.exit(1);
}

console.log('✓ No phantom crm_* table references found.');
