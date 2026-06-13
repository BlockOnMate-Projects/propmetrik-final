-- Performance: composite indexes for property_financial_records hot paths.
--
-- The financial hot queries (cash-flow analysis, NOI, property-performance report,
-- portfolio overview income) all filter on a combination of property_id / organization_id
-- + record_type + a transaction_date range. Only single-column indexes existed
-- (idx_fin_records_property / _organization / _type / _date), forcing bitmap-AND or
-- in-memory filtering. These composites let a single index satisfy each predicate set.
--
-- Idempotent: safe to re-run. Plain CREATE INDEX (not CONCURRENTLY) so it works inside
-- the migration transaction; the table is small enough that the brief build lock is fine.

CREATE INDEX IF NOT EXISTS idx_fin_records_property_type_date
  ON property_financial_records(property_id, record_type, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_fin_records_org_type_date
  ON property_financial_records(organization_id, record_type, transaction_date DESC);
