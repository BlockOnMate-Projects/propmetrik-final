# Audit 09 — Database Layer: Migrations, Schema, Indexes

**Date:** 2026-07-02 · **Auditor:** DB layer audit (read-only)
**Scope:** `backend/database/migrations/` (247 `.sql` files), `backend/src/database/migrate.ts` (runner), `backend/database/sample_data/api_pull_sample_data.sql` (755 lines), cross-referenced against live query patterns in `backend/src/`.
**Context that raises stakes:** there is ONE production database (`pg.cedynhq.com:5434/propmetrik`) that local dev also points at; migrations are run manually via `npm run migrate`.

## Scores

| Dimension | Score | One-line rationale |
|---|---|---|
| Schema quality | **7/10** | Money is DECIMAL everywhere, PKs near-universal, FKs real (not by convention) — but 3 notification tables, 2 uuid functions, `org_id` vs `organization_id`, trigger coverage decays after file ~200, and one contradictory constraint (044). |
| Index coverage | **6/10** | Hot tables are mostly well covered; the standout gap is `valuations` having NO index on its org column (the main list filter). A handful of composite/partial gaps on `payment_transactions` and CRM runtime tables. |
| Migration hygiene | **3/10** | Three numbering schemes interleave lexicographically; fresh-install order is provably broken (054 before the table it updates); checksum validation disabled; ~12 files with bare `CREATE TABLE`; drop-and-recreate used as the fix pattern; no down migrations. |
| Data safety | **4/10** | `DROP TABLE ... CASCADE` mass-drops in shipped migrations (127 drops ~30 e-sign tables; 139 drops BTC settlement tables — financial records); fabricated business data seeded into prod (fake clients, fake house-price index values); SET NULL cascades on financial link columns. |

## Counts

- 247 migration files, all accounted for in the per-file ledger below.
- Classification (dominant purpose): ~145 schema, ~58 mixed schema+data/seed, ~15 seed-only, ~15 data-backfill, ~14 fix/rebuild.
- Numbering schemes coexisting: `NNN_` (001–270), letter-suffixed (`033b`, `053b`, `093b/c`, `094b`, `095b`), 13-digit epoch (`1737413000000_…` ×3), date-stamped (`20260130_…` ×13).
- Duplicate numeric prefixes: 21 (008, 009×3, 010, 011, 012, 013, 014, 015, 016×3, 017, 027×3, 028, 053, 071, 120, 121, 126, 219, 241, 243, 244).
- `DROP TABLE` statements in migrations: 60+ (mostly `IF EXISTS ... CASCADE`); `TRUNCATE`: 0.
- Money-as-FLOAT: **none found** (all currency columns are `DECIMAL/NUMERIC`; the only `FLOAT` columns are e-sign x/y/width/height coordinates in 126/127 — acceptable).

---

## TOP FINDINGS (by priority)

### P0-1 · Missing index: `valuations` has no index on its organization column (hottest list query on a remote DB)

`valuations` (created `014_valuation_engine.sql:177-183`) is indexed on `property_id`, `valuer_id`, `status`, `valuation_type`, `effective_date`, `created_at`, `current_step` (019), `client_id` (149) — but **not** on `valuer_organization_id`, which is the primary tenant filter of the valuation module:

- `backend/src/routes/valuations.ts:147` — `WHERE v.valuer_organization_id = $1` (+ optional `status`/`purpose` at :152/:157), paginated `ORDER BY v.created_at DESC LIMIT $ OFFSET $` at :189. This is the valuation list page — every load.
- `backend/src/services/analytics/valuationAnalyticsService.ts:180+` — org-scoped aggregates with `FILTER (WHERE v.status = 'completed')`.

The standalone `idx_valuations_created_at` lets the planner walk created_at and filter, or seq-scan; either way it reads far more rows than needed, over a remote link (see memory: "Perf: Remote DB Tax").
**Fix:** `CREATE INDEX ... ON valuations(valuer_organization_id, created_at DESC);` plus `(valuer_organization_id, status)` for the analytics rollups (or one 3-col index `(valuer_organization_id, status, created_at DESC)`).

### Missing-index table (prioritized)

| Pri | Table | Missing index | Evidencing query | Expected impact |
|---|---|---|---|---|
| 1 | `valuations` | `(valuer_organization_id, created_at DESC)` | `routes/valuations.ts:147,189` | Valuation list page: seq/loose scan → tight index scan; biggest single win |
| 2 | `valuations` | `(valuer_organization_id, status)` (or fold into #1 as 3-col) | `services/analytics/valuationAnalyticsService.ts:180` | Org dashboards/KPIs |
| 3 | `payment_transactions` | partial `(created_at DESC) WHERE status='success'` or `(status, created_at DESC)` | `routes/admin.ts:591` `WHERE status='success' AND created_at >= NOW() - INTERVAL ...` (+ :626 GROUP BY payment_type) | Admin Platform-Revenue dashboard; only `(created_at DESC)` exists (`133:215`) so every row in window is fetched then filtered |
| 4 | `deals` | GIN `pg_trgm` on `title` / `deal_number` | `services/crm-deal-management/dealService.ts:264` `(d.title ILIKE $1 OR d.deal_number ILIKE $2)` | CRM deal search currently unindexable ILIKE `%…%` |
| 5 | `payment_transactions` | `(domain_record_type, domain_record_id)` | reconcile/lookup paths pairing `reference` with `domain_record_id` (`routes/index.ts`, `paymentProcessor.ts:517-541`) | Cheap insurance; `reference` idx carries most lookups today |
| 6 | `api_key_usage_daily` | `(date)` | `routes/commercialization.ts:49-50` `WHERE date >= CURRENT_DATE - INTERVAL '30 days'` (cross-key rollup; existing idx is `(key_id, date DESC)` `153:147`) | Low now (small table), grows with API usage |
| 7 | `crm_drip_enrollments` (and siblings in `219_crm_runtime_tables.sql`) | FK/status indexes — file creates 7 tables with only 2 indexes (`219_crm_runtime_tables.sql:59,75`) | drip processing scans | Low-medium |
| 8 | `crm_notifications` | `(organization_id, user_id, is_read)` | `routes/crm/notifications.ts:38-40` — existing `idx_crm_notif_user (user_id, is_read, created_at DESC)` (`219:75`) is user_id-first, adequate; org-first only if user_id selectivity degrades | Low |

**Already covered (verified, no action):** `user_service_subscriptions` middleware lookup — `idx_uss_lookup (user_id, status) WHERE status='active'` (`212:83`) matches `middleware/serviceAccess.ts:45` and `middleware/authorize.ts:242`. `org_api_keys` auth — partial `(key_prefix) WHERE is_active` (`153:130`) is selective enough for `WHERE key_prefix=$1 AND key_hash=$2` (`orgSettingsService.ts:498`). `notifications` (005:283-286), `user_notifications` (125:60-65), `project_costs` (066:266-270), `deals` core filters (org/stage/status/agent, `1737413000000:436-446`), `regional_household_income` `(region, period_month)` (`260:45-48`). `gss_*` reads are full scans by design (`ticker.ts:116-131`, `regionalCompositesService.ts:68-123`) but the tables are tiny reference series — fine.
**Precedent to copy:** `20260611_fin_records_perf_indexes.sql` — composite hot-path indexes with a written rationale; exactly the right pattern.

**Advisory (query shape, not index):** `properties` is `PARTITION BY LIST(region)` with 16 partitions (003, 241). Org-scoped queries that don't mention `region` — e.g. `routes/user-profile.ts:466` `WHERE organization_id = $1` — fan out to 16 partition index scans. Indexes exist (`idx_properties_organization`, `003:205`); adding `region` to hot org-scoped predicates (or accepting the fan-out) is a query-design decision worth making explicitly.

### P0-2 · Migration ordering is broken for any fresh environment; checksum guard is disabled

- The runner sorts by filename (`migrate.ts:70-72`). Lexicographically, `1737413000000_create_crm_tables.sql` sorts **between `169_` and `200_`**, and all 13 `2026xxxx_*` files sort **between `201_` and `202_`** (verified: positions 158-160 and 163-175 of the sorted list). Numbering is fiction; execution order is not what the numbers imply.
- Provable breakage: `054_deal_probability_calculation.sql:7` runs `UPDATE deal_stages SET probability = ...` but `deal_stages` and `deals` are only created in `1737413000000_create_crm_tables.sql:294,360`, which sorts ~100 files later. A fresh `npm run migrate` on an empty DB fails at 054 (or earlier at 001-007's bare DDL, see P1-4).
- `200_baseline.sql` openly concedes this: "The production database already has all 484+ tables… Future migrations should contain incremental DDL only." Files 001–169 + epoch files are effectively dead weight that cannot replay.
- Checksum validation is commented out — `migrate.ts:89-98` ("CHECKSUM VALIDATION DISABLED FOR DEVELOPMENT") — so an already-applied migration can be edited silently and prod/other envs diverge undetected. Several files show signs of exactly this history (093 vs 093b vs 093c).
- `rollbackLastMigration` (`migrate.ts:132-151`) deletes the tracking row without reversing SQL — a footgun labeled as rollback.

**Fix:** re-enable checksum validation (behind `NODE_ENV`); freeze everything ≤ baseline into a single schema snapshot (the 200_baseline comment already prescribes `pg_dump --schema-only`); adopt one zero-padded numbering scheme going forward; add a CI job that runs the full chain against a scratch Postgres so ordering regressions fail fast.

### P0-3 · Destructive `DROP TABLE ... CASCADE` migrations against the single prod DB

- `127_esign_schema_tables.sql:14-43` — drops **~30 tables** (`esign_*`, `signing_requests`, `signature_evidences`, all `p12_*`) with CASCADE before recreating. E-signature evidence is legal-grade data; a re-run or an env where these held data destroys signing history. `126_phase12_esign_migration.sql:19-36` does a first pass of the same (duplicate-purpose pair).
- `139_btc_native_cleanup.sql:9-10` — `DROP TABLE IF EXISTS btc_settlements CASCADE; DROP TABLE IF EXISTS btc_reverse_settlements CASCADE;` — **financial settlement records** dropped with no archival step (contrast with `_archive_legacy` pattern used elsewhere).
- `093b/093c` (change_orders ×2) and `094b` (submittals) fix schema mistakes by drop-and-recreate — any rows written between the original and the fix were destroyed.
- `249_workspace_org_scoping.sql:33-35` — `DELETE FROM workspaces WHERE entity_type='platform' AND entity_id <> organization_id` — destructive but *documented, justified and idempotent*; this is what a dangerous migration should look like.
**Fix:** policy — destructive DDL requires a `CREATE TABLE archived_x AS SELECT ...` (or dump) step in the same migration, plus a header comment stating why loss is acceptable.

### P1-4 · Non-idempotent early migrations (bare DDL) — ~12 files can never re-run

Bare `CREATE TYPE` / `CREATE TABLE` / `CREATE INDEX` without guards: `001` (11 bare `CREATE TYPE`), `002` (5 CT / 15 CI), `003` (7/19), `004` (5/27), `005` (7/25), `007` (12/56), `084` (7/23), `093` (8/26), `1737413000000` (10/54); index-only offenders: `008_tier4` (21 CI), `016_valuation_gaps` (20), `099` (16), `155_ml_analytics` (29), `167`, `168`. Post-~2025 files are consistently guarded (`IF NOT EXISTS`, `DO $$` blocks) — the discipline exists, the backlog doesn't.

### P1-5 · Contradictory constraint: `NOT NULL` + `ON DELETE SET NULL`

`044_tenant_applications.sql:168` — `created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL`. Deleting a user who created an application-link row raises `23502 not_null_violation` at the FK trigger — i.e. user deletion (which Admin hard-delete supports, see migration 246-era admin endpoints) can fail mid-cascade with a confusing error. **Fix:** either drop NOT NULL or change to `ON DELETE RESTRICT`.

### P1-6 · `ON DELETE SET NULL` on financial link columns (silent orphaning)

- `082_budget_enhancements.sql:12,108,235-236,389,422` — `cost_id`, `related_cost_id`, `related_invoice_id`, `invoice_id` all SET NULL: deleting a `project_cost` silently unlinks budget lines, invoice items and ledger rows instead of blocking.
- `066_project_financials.sql:219-223` — `project_costs.phase_id/contractor_id/contractor_assignment_id` SET NULL (defensible for phase, questionable for contractor on a paid cost).
- `147_valuation_invoices.sql:105` — invoice's `valuation_id` SET NULL: a paid invoice loses what it was for.
- `154_subscription_billing.sql:83-84,162-164` — billing rows' `organization_id`/`user_id` SET NULL: revenue rows detach from payer identity on org/user delete (and org delete IS supported — memory: "Admin Destructive Actions").
**Fix:** financial links should be `RESTRICT` (block delete) or keep a denormalized copy (name/number) before allowing SET NULL.

### P1-7 · Fabricated business data seeded by migrations into the production DB

| Migration | What it fabricates | Verdict |
|---|---|---|
| `150_seed_valuation_clients.sql:5-25` | 5 clients with **real company names** (Ecobank Ghana, Goldkey Properties, GNHA) + invented emails/phones, attached to `(SELECT id FROM organizations LIMIT 1)` — an arbitrary org | Fake business data, in prod, misattributed |
| `159_publications_schema.sql:175-180` | `index_values` row: "Ghana House Price Index rose 1.2% in December 2025… Year-on-year growth of 8.4%…" with AI commentary — a publishable market statistic that was never computed | Fake published statistic |
| `156_analytics_foundation_schema.sql:476-565` | `regional_cost_data`, `housing_affordability_index`, CCI seeds with invented multipliers/values (the GHAI 29.64 seed later replaced by real GSS data in 260) | Fake analytics inputs (partially remediated) |
| `008_tier4_economic_construction.sql:362-529` | `economic_indicators`, `material_prices`, `labor_rates` hardcoded values | Fake market data (superseded by scrapers) |
| `022_fuel_prices.sql:33-38` | Diesel 15.50 / petrol 15.20 "npa.gov.gh (initial seed)" | Fake but labeled as seed |
| `1737413001000`, `053b`, `129/130/131`, `20260312`, `210/221/228/229`, `226`, `251-256`, `268` | Pipelines, lease/sales templates, RBAC policies, subscription plans, source-health rows, valuation assumptions, alert rules | **Legitimate config seeds** (mostly `ON CONFLICT DO NOTHING`; 251-256 assumptions are flagged in-code for professional review — acceptable) |

`backend/database/sample_data/api_pull_sample_data.sql` (755 lines) inserts partner API endpoints with hardcoded UUIDs and plausible `api.landscommission.gov.gh` URLs. It is NOT in the migrations dir so the runner won't execute it, but nothing marks it dev-only and it references prod-shaped `data_sources` rows — one careless `psql -f` away from polluting prod. **Fix:** move under a `dev/` path with a guard (`DO $$ ... IF current_database() = 'propmetrik' THEN RAISE ...`), and write a cleanup migration for the 150/159 fabricated rows.

### P2-8 · Schema consistency debt

- **Two id generators:** `uuid_generate_v4()` (001-011, 035, 037, 044, 084, 096-097, 120, 128, 132, 154, 164-165, then **again** in 260-269 gss tables) vs `gen_random_uuid()` (012 onward, majority). Harmless functionally, but 001's `uuid-ossp` extension stays a hard dependency forever.
- **Naming:** `org_id` (`org_api_keys`, 153) vs `organization_id` (everywhere else); `date` as a column name (`api_key_usage_daily`, 153:141).
- **Three notification tables:** `notifications` (005), `user_notifications` (125), `crm_notifications` (219) with different shapes/routing.
- **updated_at triggers:** early files consistently attach `update_updated_at` triggers; the 200-series stops — `203_tier4_enterprise_features.sql` creates 22 tables with 19 `updated_at` columns and **0 triggers**; all gss tables (261-269) likewise (their upsert services set it manually — fragile convention).
- **Missing PK is a non-issue:** the only CT>PK files are partition children (040, 241 — inherit the parent's `(id, region)` PK from `003:158`) and false positives (249 comment). Real tables have PKs.

### P2-9 · Duplicate numbers & duplicate-purpose migrations

21 duplicated numeric prefixes (list in Counts). Because the runner keys on full filename, nothing crashes, but `009` ×3 and `016`/`027` ×3 make "what does migration N do" unanswerable, and dup pairs like `126_phase12_esign_migration` / `127_esign_schema_tables` (48 identical index statements, overlapping drops) or `093 → 093b → 093c` are the same change shipped three times. The four `20260220_workspace*` files are one change split across four migrations (create → fix → nullable → notnull) — evidence of debugging against prod.

---

## PER-FILE LEDGER (all 247)

Classification: **S**=schema · **SD**=mixed schema+data/seed · **seed** · **data**=backfill/update · **fix**=repair/rebuild. "NI" = non-idempotent statements (bare CREATE). "dup" = shares numeric prefix with another file.

| Migration | Class | Issues (or clean) |
|---|---|---|
| 001_initial_schema | S | NI: 11 bare CREATE TYPE |
| 002_core_tables | S | NI: 5 CT / 15 CI; uuid_generate_v4 |
| 003_properties_partitioned | S | NI: 7 CT / 19 CI; properties PK `(id,region)` OK; 5× SET NULL (owner/org acceptable) |
| 004_transactions_and_sources | S | NI; 11× ON DELETE SET NULL |
| 005_audit_and_analytics | SD | NI; seeds; creates `notifications` + `api_keys` (well indexed) |
| 006_add_postgis_geometry | SD | geometry backfill UPDATEs mixed with DDL |
| 007_data_hub_phase2 | SD | NI: 12 CT / 56 CI; seeds mixed in |
| 008_file_uploads | S | NI: 6 bare CI; dup |
| 008_tier4_economic_construction | SD | NI: 21 bare CI; fabricated economic/material/labor seeds (P1-7); dup |
| 009_economic_data_sync_log | SD | bare CI; dup ×3 |
| 009_fix_construction_schema | fix | dup ×3 |
| 009_tier_ingestion_phase1 | S | dup ×3 |
| 010_add_fx_currency_types | S | enum extension; dup |
| 010_ingestion_submissions | S | dup |
| 011_add_wdi_indicator_types | S | enum extension; dup |
| 011_api_pull_integration | SD | dup |
| 012_api_pull_integration | S | first gen_random_uuid; 3 DROPs; dup + near-duplicate purpose of 011 |
| 012_material_category_weights | SD | dup; table later dropped by 017 |
| 013_construction_cost_parameters | SD | seeds; dup |
| 013_geocoding_quality_indicators | S | dup |
| 014_cleanup_nonworking_spiders | data | DELETE of spider rows; dup |
| 014_valuation_engine | SD | creates `valuations` — **no org index (P0-1)**; dup |
| 015_contribution_workflow | SD | dup |
| 015_delisted_property_tracking | SD | dup |
| 016_neighborhood_premiums | S | 2 DROPs; dup ×3 |
| 016_valuation_gaps | SD | NI: 20 bare CI; dup ×3 |
| 016_valuation_gaps_fix | fix | dup ×3; fixes sibling same-number file |
| 017_consolidate_comparable_tables | fix | 23 ALTERs; 2 DROPs; dup |
| 017_valuation_weights_config | SD | DROPs `material_category_weights` CASCADE (kills 012's table+data); dup |
| 018_property_owner_information | S | clean |
| 019_valuation_workflow_columns | S | clean |
| 020_valuation_method_inputs | S | clean |
| 021_calculated_multipliers | S | clean |
| 022_fuel_prices | SD | fabricated price seed (labeled) |
| 023_scraper_compatible_schema | fix | schema+data mixed |
| 024_regional_base_costs | SD | 10 ALTERs + config seed mixed |
| 025_land_comparables | S | clean |
| 026_update_property_titles | data | clean |
| 027_add_building_area_to_reconciliation | S | dup ×3 |
| 027_floor_plan_migration_support | SD | dup ×3 |
| 027_rental_market_analysis | S | dup ×3 |
| 028_add_options_expires_to_reports | S | dup |
| 028_floor_plan_geometry_versioning | S | dup |
| 029_floor_plan_audit_log | S | clean |
| 030_floor_plan_design_intents | S | clean |
| 031_transaction_evidence_enhancement | SD | schema+data mixed |
| 032_cap_rate_infrastructure | SD | clean-ish |
| 033_valuation_reports_phase1 | S | 7 DROPs (drop-recreate pattern) |
| 033b_property_detail_tables | S | letter-suffix numbering |
| 034_floor_plan_images | S | clean |
| 035_property_management_module | S | 7 DROPs before create; uuid_generate_v4 regression |
| 036_make_contributor_id_nullable | fix | clean |
| 037_esign_schema | SD | e-sign v1 (later mass-dropped by 126/127) |
| 038_property_hierarchy | S | clean |
| 039_fix_hierarchy_fk | fix | clean |
| 040_expand_ghana_regions | S | partition children (no PK needed — inherit) |
| 041_etl_deduplication_enhancement | S | 15 ALTERs |
| 042_create_rental_market_benchmarks | S | clean |
| 043_pm_enterprise_features | S | clean |
| 044_tenant_applications | SD | **NOT NULL + ON DELETE SET NULL contradiction at :168 (P1-5)**; 12× SET NULL |
| 050_esign_envelopes | S | clean |
| 051_esign_phase2_enhancements | S | clean |
| 052_crm_properties_standalone | SD | clean |
| 053_crm_agents | SD | conditional index on `deals` created ~100 files later (order coupling); dup |
| 053_crm_properties_pipeline | SD | dup |
| 053b_seed_crm_pipelines | seed | legit config |
| 054_deal_probability_calculation | data | **UPDATEs `deal_stages`/`deals` created in 1737413000000 → fresh-install breaker (P0-2)** |
| 055_authorization_layer | SD | clean |
| 061_user_integrations | S | 3 bare CI |
| 062_crm_property_sync | SD | clean |
| 063_sales_targets | SD | clean |
| 064_commissions | SD | 4 DROPs; seeds mixed |
| 065_development_projects | SD | clean |
| 066_project_financials | SD | `project_costs` SET NULL contractor/phase (P1-6); indexes OK |
| 067_realtime_presence | SD | DELETEs mixed in |
| 070_workflow_automation | SD | clean |
| 071_document_templates_esign_integration | SD | 8 seeds mixed; dup |
| 071_fix_construction_indices_schema | fix | 17 ALTERs; dup |
| 075_project_administrative_extensions | SD | 4 DROPs |
| 076_project_ghana_enhancements | SD | 19 ALTERs + data |
| 077_project_drafts | SD | clean |
| 078_gantt_enhancements | SD | clean |
| 079_compliance_module | SD | clean |
| 080_document_management | SD | 11 seeds mixed |
| 081_compliance_reports | SD | clean |
| 082_budget_enhancements | SD | **SET NULL on cost_id/invoice_id financial links (P1-6)** |
| 083_team_management | S | 7 DROPs (drop-recreate) |
| 084_integration_tables | SD | NI: 7 bare CT / 23 bare CI |
| 085_construction_gaps | S | no indexes created for 3 tables |
| 093_rfis_and_change_orders | S | NI: 8 bare CT / 26 bare CI |
| 093b_fix_change_orders | fix | DROP CASCADE + recreate (data loss window); dup-purpose |
| 093c_final_change_orders | fix | same fix, third attempt (P2-9) |
| 094_submittals | S | clean |
| 094b_submittals_fixed | fix | NI + DROP CASCADE recreate |
| 095_photo_documentation | S | 14× SET NULL |
| 095b_photo_documentation_fixed | fix | DROP CASCADE recreate |
| 096_punch_lists | SD | uuid_generate_v4 regression; DELETEs mixed |
| 097_quality_checklists | SD | uuid_generate_v4 |
| 098_procurement | S | clean |
| 099_enterprise_governance | S | NI: 16 bare CI |
| 100_site_operations_consolidation | fix | 24 ALTERs |
| 101_ghana_compliance | SD | clean |
| 102_mobile_money | SD | clean |
| 103_dashboard_alerts | SD | clean |
| 120_password_auth | S | dup |
| 120_rent_schedules | S | uuid_generate_v4; dup |
| 121_lease_templates | SD | dup |
| 121_milestone_subphases | S | dup |
| 122_whatsapp_tenant_notifications | S | clean |
| 123_pm_production_enhancements | SD | clean |
| 124_esign_capture_metadata | S | clean |
| 125_in_mail_notifications | SD | creates 3rd notifications table (`user_notifications`) — P2-8 |
| 126_phase12_esign_migration | S | **25 DROP CASCADE of e-sign v1 tables (P0-3)**; dup |
| 126_tenant_keycloak_onboarding | S | dup |
| 127_esign_schema_tables | S | **41 DROP CASCADE incl. all p12_* signing evidence (P0-3)**; duplicate-purpose of 126 |
| 128_critical_data_gaps_schema | S | 1 bare CT |
| 129_seed_lease_templates_all_orgs | seed | legit config |
| 130_global_lease_templates | SD | DELETE mixed |
| 131_update_ghana_lease_template | data | legit template update |
| 132_utility_charges | S | uuid_generate_v4 |
| 133_payment_system_v2 | SD | `payment_transactions` — missing `(status, created_at)` composite (idx table #3); money = DECIMAL ✓ |
| 134_crypto_payment_rail | S | clean |
| 135_crypto_preferred_token | S | clean |
| 136_btc_settlement_tracking | S | clean |
| 137_btc_settlement_reverse | S | clean |
| 138_nowpayments_hybrid_settlement | SD | clean |
| 139_btc_native_cleanup | data | **DROPs btc_settlements/btc_reverse_settlements CASCADE — financial records, no archive (P0-3)** |
| 140_attestation_tracking | S | clean |
| 141_platform_settlement_config | SD | clean |
| 142_nowpayments_config | SD | clean |
| 143_add_crypto_payment_method | S | clean (enum/check) |
| 144_add_weighting_rationale | SD | clean |
| 145_add_fsv_columns | SD | clean |
| 146_valuation_org_members | SD | clean |
| 147_valuation_invoices | S | invoice `valuation_id` SET NULL (P1-6) |
| 148_valuation_clients | S | clean |
| 149_add_client_id_to_valuations | S | clean |
| 150_seed_valuation_clients | seed | **fabricated clients w/ real company names into arbitrary first org (P1-7)** |
| 151_invoice_platform_fee | SD | clean |
| 152_enterprise_rbac | SD | 17 ALTERs |
| 153_b2b_enterprise_features | SD | creates org_api_keys (`org_id` naming — P2-8) + api_key_usage_daily; indexes adequate |
| 154_subscription_billing | SD | uuid_generate_v4; billing rows org/user SET NULL (P1-6) |
| 155_ml_analytics_schema | S | NI: 29 bare CI |
| 156_analytics_foundation_schema | SD | **fabricated GHAI/regional-cost seeds (P1-7; superseded by 260)** |
| 157_valuation_analytics_phase2 | S | 11 ALTERs |
| 158_market_intelligence_phase3 | S | clean |
| 159_publications_schema | SD | **fabricated Ghana HPI index_values + AI commentary (P1-7)** |
| 160_autopilot_pipeline | SD | clean |
| 161_two_product_model | SD | 20 UPDATEs mixed with DDL |
| 162_indices_autopilot_schedule | seed | legit config |
| 163_enable_postgis | S | clean |
| 164_add_marketplace_to_properties | SD | data backfill mixed |
| 165_add_marketplace_to_crm_properties | SD | near-duplicate of 164 for crm table |
| 166_support_permanent_application_links | SD | clean |
| 167_marketplace_analytics | S | NI: 5 bare CI |
| 168_saved_searches | S | NI: 4 bare CI |
| 169_add_location_accuracy | S | clean |
| 1737413000000_create_crm_tables | S | **epoch numbering — sorts between 169 and 200 (P0-2)**; NI: 10 bare CT / 54 bare CI; deal_number trigger does MAX-substring scan per insert |
| 1737413001000_seed_default_crm_pipelines | seed | legit config (56 INSERT / 47 UPDATE) |
| 1737413002000_whatsapp_messages | S | epoch numbering |
| 200_baseline | meta | documents that fresh-install path is dead (484+ tables pre-exist) |
| 201_add_notification_indexes | S | clean — good pattern |
| 20260130_add_esign_to_crm | SD | date numbering — sorts between 201 and 202 (P0-2) |
| 20260130_add_esign_to_project_management | SD | date numbering |
| 20260130_add_esign_to_tenancies | SD | date numbering |
| 20260130_add_esign_to_valuation_reports | SD | date numbering |
| 20260220_workspace | S | 1 of 4 files for one change (P2-9) |
| 20260220_workspace_fix | fix | debugging-against-prod trail |
| 20260220_workspace_nullable | fix | " |
| 20260220_workspace_org_notnull | fix | " |
| 20260221_workspace_conversations | SD | clean |
| 20260312_seed_sales_agreement_offer_letter_templates | seed | legit template config |
| 20260611_fin_records_perf_indexes | S | **exemplary**: composite indexes + written rationale |
| 20260613_subscription_recurring_billing | S | clean |
| 20260629_report_versioning | S | clean |
| 202_issues_risks_drawings_meetings | S | clean |
| 203_tier4_enterprise_features | S | 22 tables, 19 updated_at columns, 0 triggers (P2-8) |
| 204_transmittals | S | clean |
| 205_invoice_send_columns | S | clean |
| 206_cost_estimates | S | clean |
| 207_estimate_project_link | S | clean |
| 208_payment_accounts_service_type | S | clean |
| 209_rbac_roles_and_user_type | S | 1 bare CI |
| 210_rbac_seed_authorization_policies | seed | legit config |
| 211_unified_invitations | S | clean |
| 212_platform_services_and_subscriptions | SD | user_service_subscriptions well-indexed (partial idx :83) ✓ |
| 213_bid_management | S | clean |
| 214_xero_integration | S | clean |
| 216_esign_envelopes_fix_schema | fix | clean |
| 217_fix_esign_signers_fields_schema | fix | clean |
| 218_fix_deal_commission_trigger | fix | clean |
| 219_crm_properties_assigned_agent | S | dup |
| 219_crm_runtime_tables | S | 7 tables / 2 indexes (idx table #7); dup |
| 220_fix_pipeline_stage_transitions | data | clean |
| 221_customer_service_roles | SD | legit role seed |
| 222_google_oauth_columns | SD | clean |
| 223_fix_audit_log_action_check | fix | clean |
| 224_specialized_construction_costs | S | clean |
| 225_development_sale_prices | data | drop-only migration (table removal, no archive) |
| 226_add_construction_source_health | seed | legit config |
| 227_add_valuation_services_plan_category | SD | clean |
| 228_add_admin_authorization_policies | seed | legit config |
| 229_seed_all_subscription_plans | seed | legit config (pricing — DB-sourced by design) |
| 230_add_tenant_soft_delete | S | clean |
| 231_formalize_tenant_messaging | S | clean |
| 232_property_unit_layout | S | clean |
| 233_lease_template_scenario_signatures | data | clean |
| 234_application_id_type | S | clean |
| 235_lease_template_dynamic_currency | data | clean |
| 236_esign_envelope_signed_columns | S | clean |
| 237_lease_template_professional_redesign | data | clean |
| 238_audit_logs_immutable | S | good (append-only enforcement) |
| 239_soft_delete_core_tables | S | clean |
| 240_fx_settled_payments | S | clean |
| 241_fx_settled_invoices | S | dup |
| 241_region_based_partitions | SD | 16 partition children (no PK needed); 9 UPDATEs; requires superuser-ish role (run as propmetrik_admin per ops memory); dup |
| 242_remap_cluster_reference_data | data | 12 UPDATEs — clean |
| 243_backfill_legacy_pmt_ids | data | dup |
| 243_esign_permanent_signer_id_unique | S | dup |
| 244_backfill_legacy_sgn_ids | data | dup |
| 244_esign_signers_user_id | S | dup |
| 245_esign_one_identity_per_account | SD | clean |
| 246_platform_org_and_user_type | SD | clean |
| 247_activate_logged_in_users | data | clean |
| 248_pm_sale_lease_bridge | SD | clean |
| 249_workspace_org_scoping | SD | destructive DELETE but documented/justified/idempotent — model migration header |
| 250_valuation_documents | S | clean |
| 251_seed_rental_adjustment_factors | seed | config (flagged for valuer review — acceptable) |
| 252_drc_useful_life_and_mea | SD | config |
| 253_drc_mea_feature_range | SD | config |
| 254_trading_property_benchmarks | SD | config seed |
| 255_trading_benchmarks_institutional | SD | config |
| 256_residual_development_assumptions | SD | config seed |
| 257_valuation_sensitivity_analysis | S | clean |
| 258_construction_index_cleanup | data | DELETEs (cleanup, deliberate) |
| 259_drop_legacy_base_construction_costs | S | drops legacy table (deliberate; no archive) |
| 260_regional_household_income | SD | uuid_generate_v4 regression; DELETE of fake seeds (remediation of 156) ✓ |
| 261_gss_macro_tables | S | uuid_generate_v4; no updated_at triggers |
| 262_regional_household_income_formal_employment | S | clean |
| 263_gss_phc_housing_tables | S | uuid_generate_v4 |
| 264_gss_trade_tables | S | uuid_generate_v4 |
| 265_gss_phc_population_employment_poverty | S | uuid_generate_v4 |
| 266_gss_glss7_tables | S | uuid_generate_v4 |
| 267_slice5_derived_analytics | S | uuid_generate_v4 |
| 268_gss_alert_rule_seeds | seed | legit config |
| 269_regional_composites | S | uuid_generate_v4 |
| 270_analytics_api_ws_usage | S | clean |

**Runner:** `backend/src/database/migrate.ts` — transaction-per-migration ✓; filename-sort ordering (P0-2); checksum check disabled (:89-98); rollback is record-delete-only (:145-150).
**Sample data:** `backend/database/sample_data/api_pull_sample_data.sql` — not auto-run, but unguarded prod-shaped INSERTs (P1-7).

---

## Cross-cutting patterns

1. **Two eras, one directory.** Pre-baseline files (001–169 + epoch) are a fossil record — bare DDL, drop-and-recreate fixes, fabricated seeds. Post-200 files are markedly better (guarded DDL, documented intent, real config seeds). The fossil record still sits in the executable path and breaks any fresh environment.
2. **Fix-by-drop-recreate** (`093b/c`, `094b`, `095b`, `126/127`) instead of ALTER — each one is a data-loss window; combined with disabled checksums it shows migrations were iterated against the live DB.
3. **Schema+seed mixing is the norm** (~58 files). Config seeds are fine; the anti-pattern is *fabricated market/business data* in the same channel that carries DDL (008, 022, 150, 156, 159).
4. **Index discipline improved late**: 201 and 20260611 are the right template; `valuations` (P0-1) is the pre-baseline table nobody revisited.
5. **Transaction-wrapped runner is a real strength** — failed migrations don't half-apply — but it also means `CREATE INDEX CONCURRENTLY` is impossible; large-table index builds will take write locks on prod (acceptable today at current sizes; plan an out-of-band path before properties/payment tables grow).
6. **SET NULL as default FK reflex** — appropriate for audit "who did this" columns, dangerous on financial links (P1-6); no evidence a deliberate choice was made per-column.
