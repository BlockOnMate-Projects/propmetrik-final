-- 258_construction_index_cleanup.sql
-- Clean up the construction cost index history so the live base-100 index (now computed from the
-- scraped material/labor PRICE LEVELS, not an empty price_change_percent field) has a consistent
-- series for month-over-month / year-over-year deltas.
--
-- Two problems remediated:
--   1. On 2026-04-22 the index was rebased to base-100 while ~12 months of OLD ~1200-scale rows
--      remained, so any MoM/YoY spanning the rebase produced nonsense (e.g. -91.7%). Drop old-scale.
--   2. National rows use region=NULL, and UNIQUE(period_date, period_type, region) does NOT dedupe
--      NULLs in Postgres, so re-runs accumulated duplicate national rows. Keep one per period.
--
-- Idempotent: re-running simply removes whatever still matches (nothing on a clean table).

BEGIN;

-- 1. Drop the abandoned pre-rebase old-scale rows. The index now lives on a base-100 scale; a value
--    above 200 can only be the old ~1200-scale series.
DELETE FROM construction_cost_index_analytics
WHERE index_value > 200;

-- 2. Dedupe rows per (period_date, period_type, region), keeping the most recently computed one.
--    `IS NOT DISTINCT FROM` makes NULL regions compare equal; the ctid tiebreaker guarantees exactly
--    one survivor even if two rows share a created_at.
DELETE FROM construction_cost_index_analytics a
USING construction_cost_index_analytics b
WHERE a.period_date = b.period_date
  AND a.period_type = b.period_type
  AND a.region IS NOT DISTINCT FROM b.region
  AND (a.created_at < b.created_at
       OR (a.created_at = b.created_at AND a.ctid < b.ctid));

COMMIT;
