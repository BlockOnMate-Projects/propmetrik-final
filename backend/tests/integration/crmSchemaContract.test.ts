/**
 * CRM schema contract — INTEGRATION test (READ-ONLY, Risk R1 fence).
 *
 * The R1 defect (phantom crm_* tables + column drift) was invisible to `tsc` because
 * the offending identifiers live inside SQL string literals. The static guard
 * (scripts/check-crm-tables.mjs) catches phantom TABLE names at build time; this test
 * closes the remaining gap by asserting, against the LIVE schema, that every (table,
 * column) tuple the R1-fixed queries depend on actually exists — and that the phantom
 * tables genuinely do NOT.
 *
 * READ-ONLY: it only queries information_schema / pg_catalog. It never writes, so it is
 * safe to run against the single production database. Uses its own `pg` Pool so the
 * global `src/database` mock does not apply. Skips cleanly if DATABASE_URL is unset.
 */
import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { Pool } from 'pg';

loadEnv({ path: join(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

// (table → columns) each R1-fixed query in the 6 remediated files relies on.
const REQUIRED: Record<string, string[]> = {
  // workflowWorker.ts (overdue tasks + stale deals) + calendarService.createEventFromTask
  tasks: ['id', 'organization_id', 'task_status', 'deal_id', 'contact_id', 'assigned_to', 'title', 'due_date'],
  // workflowWorker + workflowExecutionEngine + calendarService + pipelines
  deals: ['id', 'organization_id', 'title', 'stage_id', 'assigned_agent', 'primary_contact_id', 'deal_status', 'updated_at', 'tags'],
  // emailIntegrationService + propertyMatchService + workflowExecutionEngine + calendarService
  contacts: ['id', 'organization_id', 'email', 'deleted_at', 'first_name', 'last_name', 'primary_phone', 'lead_status', 'lead_score', 'budget_min', 'budget_max', 'preferred_locations', 'preferred_property_types', 'property_interests', 'assigned_to', 'tags'],
  // emailIntegrationService (sendEmail activity log) + workflowExecutionEngine (activity load) + authorize.ts RBAC map
  deal_activities: ['id', 'deal_id', 'contact_id', 'user_id', 'activity_type', 'subject', 'description'],
  // propertyMatchService + calendarService (REAL bridge table — must have these, and must NOT have deleted_at/address)
  crm_properties: ['id', 'organization_id', 'price', 'status', 'property_type', 'transaction_type', 'reference_number', 'title', 'region', 'address_city', 'address_street', 'bedrooms', 'bathrooms', 'total_area_sqm', 'images', 'created_at'],
  // calendarService.getViewingBookings
  viewing_bookings: ['id', 'organization_id', 'property_id', 'contact_id', 'agent_id', 'deal_id', 'status', 'scheduled_at'],
  // workflowExecutionEngine assign_agent (users role/status/full_name/phone) + calendar agent join
  users: ['id', 'first_name', 'last_name', 'full_name', 'email', 'phone', 'role', 'status', 'organization_id'],
};

// Columns the fixed code deliberately does NOT reference (their absence is WHY the old
// code was broken). Guards against a future migration silently re-introducing drift.
const MUST_NOT_HAVE: Record<string, string[]> = {
  crm_properties: ['deleted_at', 'address'],
  deal_activities: ['organization_id', 'title', 'performed_by', 'created_by', 'assigned_to'],
};

const PHANTOM_TABLES = ['crm_deals', 'crm_contacts', 'crm_tasks', 'crm_pipeline_stages', 'crm_deal_pipelines', 'crm_activities'];

describeDb('CRM schema contract (R1 fence — read-only)', () => {
  let pool: Pool;
  const columnsByTable: Record<string, Set<string>> = {};

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    const tables = Object.keys(REQUIRED);
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [tables],
    );
    for (const t of tables) columnsByTable[t] = new Set();
    for (const r of rows) columnsByTable[r.table_name]?.add(r.column_name);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it.each(Object.entries(REQUIRED))('table "%s" exists with every required column', (table, cols) => {
    const present = columnsByTable[table];
    expect(present && present.size > 0).toBe(true); // table exists
    const missing = (cols as string[]).filter((c) => !present.has(c));
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(MUST_NOT_HAVE))('table "%s" does NOT have the drift-columns', (table, cols) => {
    const present = columnsByTable[table];
    const unexpected = (cols as string[]).filter((c) => present.has(c));
    expect(unexpected).toEqual([]);
  });

  it.each(PHANTOM_TABLES)('phantom table "%s" does NOT exist', async (name) => {
    const { rows } = await pool.query(`SELECT to_regclass($1) AS oid`, [`public.${name}`]);
    expect(rows[0].oid).toBeNull();
  });

  it('the real unprefixed CRM tables all exist', async () => {
    const real = ['deals', 'contacts', 'tasks', 'deal_stages', 'deal_pipelines', 'deal_activities'];
    const { rows } = await pool.query<{ name: string; oid: string | null }>(
      `SELECT unnest($1::text[]) AS name, to_regclass('public.' || unnest($1::text[])) AS oid`,
      [real],
    );
    const missing = rows.filter((r) => r.oid === null).map((r) => r.name);
    expect(missing).toEqual([]);
  });
});
