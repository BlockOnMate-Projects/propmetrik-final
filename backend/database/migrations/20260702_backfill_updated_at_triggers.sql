-- Migration: 20260702_backfill_updated_at_triggers
-- Description: Attach a BEFORE UPDATE trigger that maintains `updated_at = CURRENT_TIMESTAMP`
--   to every public base table that HAS an `updated_at` column but currently has NO update
--   trigger. ~145 tables (the 200-series + gss tables) relied on application code setting
--   updated_at manually — a fragile convention the audit flagged; any code path that forgets
--   leaves a stale updated_at. This makes it correct at the DB level, uniformly.
-- Safe: adds triggers only (no data change), idempotent (DROP IF EXISTS the named trigger,
--   and only targets tables that lack any UPDATE trigger). Reuses the canonical
--   update_updated_at_column() function.
-- Created: 2026-07-02

DO $$
DECLARE
  t record;
  attached int := 0;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema
     AND tb.table_name = c.table_name
     AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND c.table_name NOT IN (
        SELECT DISTINCT event_object_table
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
          AND event_manipulation = 'UPDATE'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t.table_name);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      t.table_name
    );
    attached := attached + 1;
  END LOOP;
  RAISE NOTICE 'backfill_updated_at_triggers: attached % triggers', attached;
END $$;
