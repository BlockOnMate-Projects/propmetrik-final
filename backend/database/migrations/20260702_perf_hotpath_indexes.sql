-- Performance: missing hot-path indexes identified in the July 2026 audit
-- (docs/audit/09-database-migrations.md, "Missing-index table (prioritized)").
--
-- The single prod DB is remote, so every avoided seq/loose scan is real latency.
-- Each index targets a query that runs on a high-traffic page:
--   * valuations list + analytics rollups (org-scoped, every valuation page load)
--   * admin Platform-Revenue dashboard (status='success' + date window)
--   * CRM deal search (ILIKE — needs a trigram index to be indexable at all)
--   * payment reconciliation lookups
--   * API usage rollups
--
-- Idempotent: safe to re-run (all CREATE INDEX IF NOT EXISTS). Plain CREATE INDEX
-- (not CONCURRENTLY) so it works inside the migration transaction. For very large
-- tables you may prefer to build these CONCURRENTLY out-of-band before deploying.

-- Trigram support for ILIKE '%…%' deal search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- P1 — valuations: the primary tenant filter is valuer_organization_id, which had
-- no index. routes/valuations.ts:147,189 (list, ORDER BY created_at DESC) and the
-- analytics rollups (valuationAnalyticsService) filter by org (+ status).
CREATE INDEX IF NOT EXISTS idx_valuations_org_created
  ON valuations (valuer_organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_valuations_org_status
  ON valuations (valuer_organization_id, status);

-- P3 — payment_transactions: admin revenue dashboard filters status='success' over
-- a rolling date window (routes/admin.ts:591) then GROUPs BY payment_type.
CREATE INDEX IF NOT EXISTS idx_payment_tx_status_created
  ON payment_transactions (status, created_at DESC);

-- P5 — payment_transactions: reconciliation lookups pair domain record type + id.
CREATE INDEX IF NOT EXISTS idx_payment_tx_domain_record
  ON payment_transactions (domain_record_type, domain_record_id);

-- P4 — deals: CRM search is `title ILIKE $ OR deal_number ILIKE $` (dealService.ts:264),
-- unindexable without trigram GIN indexes.
CREATE INDEX IF NOT EXISTS idx_deals_title_trgm
  ON deals USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_deals_deal_number_trgm
  ON deals USING gin (deal_number gin_trgm_ops);

-- P6 — api_key_usage_daily: cross-key 30-day rollup filters on date only
-- (routes/commercialization.ts:49); existing index is (key_id, date DESC).
CREATE INDEX IF NOT EXISTS idx_api_key_usage_date
  ON api_key_usage_daily (date);
