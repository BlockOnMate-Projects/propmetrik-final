# Two-Product Model — Implementation Report

> **Date**: February 20, 2026
> **Status**: PENDING APPROVAL
> **Scope**: Migrate the Publications system from 12 separate publication types to the Two-Product Model (Ghana Real Estate Outlook + Ghana Property Snapshot) as defined in `insights.md` v3.0.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Inventory](#2-current-state-inventory)
3. [Target State](#3-target-state)
4. [Database Migration](#4-database-migration)
5. [Backend Changes](#5-backend-changes)
6. [Frontend Changes](#6-frontend-changes)
7. [Autopilot Pipeline Changes](#7-autopilot-pipeline-changes)
8. [PDF Generation Changes](#8-pdf-generation-changes)
9. [File-by-File Change Matrix](#9-file-by-file-change-matrix)
10. [Migration Strategy](#10-migration-strategy)
11. [Risk Assessment](#11-risk-assessment)
12. [Estimated Effort](#12-estimated-effort)

---

## 1. Executive Summary

### What's Changing

The current system has **12 publication types** (`market_flash`, `data_brief`, `marketbeat`, `research_report`, `special_report`, `annual_flagship`, `policy_paper`, `podcast`, `video`, `index_update`, `webinar`, `press_release`) spread across **10 autopilot templates** and **12 cron schedules**.

The new system has **5 product types** with clear edition variants:

| Product | Editions | Autopilot? |
|---------|----------|------------|
| `outlook` | `monthly`, `quarterly`, `annual` | Yes |
| `snapshot` | `weekly`, `adhoc` | Yes |
| `policy_paper` | `adhoc` | No (manual) |
| `press_release` | `adhoc` | No (manual) |
| `podcast` | `weekly` | No (manual) |

### Impact Scope

| Area | Files Modified | Files Created | Files Deleted |
|------|---------------|---------------|---------------|
| Database | 0 modified | 1 new migration | 0 |
| Backend Services | 6 modified | 0 | 0 |
| Backend Routes | 1 modified | 0 | 0 |
| Frontend Pages | 10 modified | 3 created | 4 deleted |
| Frontend Components | 2 modified | 0 | 0 |
| Frontend Types | 1 modified | 0 | 0 |
| **Total** | **20 modified** | **4 created** | **4 deleted** |

---

## 2. Current State Inventory

### 2.1 Current Publication Types (12)

```
insights category:
  market_flash      → Quick 300-600 word web article
  data_brief        → 1-3 page data summary
  marketbeat        → 4-8 page regional quarterly
  research_report   → 10-30 page deep analysis
  special_report    → 20-50 page premium report
  annual_flagship   → 50-100+ page annual publication
  policy_paper      → 8-15 page government-focused
  podcast           → Audio + transcript
  video             → 3-10 min video
  index_update      → Automated index publication
  webinar           → Live/recorded presentation

press category:
  press_release     → Official announcement
```

### 2.2 Current Autopilot Templates (10)

| Template ID | Old Type | Name | Word Target | Charts |
|------------|----------|------|-------------|--------|
| `market_flash_v1` | `market_flash` | Market Flash | 500 | 1-2 |
| `weekly_digest_v1` | `data_brief` | Weekly Digest | 800 | 3-4 |
| `monthly_snapshot_v1` | `data_brief` | Monthly Property Snapshot | 1,200 | 4-6 |
| `cci_update_v1` | `index_update` | CCI Monthly Update | 800 | 3-4 |
| `monthly_perspective_v1` | `research_report` | Ghana Real Estate Perspective | 3,000 | 5-8 |
| `marketbeat_v1` | `marketbeat` | Regional MarketBeat | 4,000 | 6-8 |
| `psi_weekly_v1` | `index_update` | PSI Weekly Update | 600 | 1-2 |
| `quarterly_outlook_v1` | `research_report` | Ghana Quarterly Outlook | 8,000 | 8-12 |
| `ghai_quarterly_v1` | `research_report` | GHAI Quarterly Report | 4,000 | 4-6 |
| `annual_outlook_v1` | `annual_flagship` | Ghana RE Market Outlook | 20,000 | 15-20 |

### 2.3 Current Cron Schedules (12)

| Type | Region | Cron/Trigger | Template |
|------|--------|-------------|----------|
| `market_flash` | NULL | `EVENT_DRIVEN` | `market_flash_v1` |
| `data_brief` | NULL | `0 20 * * 0` (Sun 8pm) | `weekly_digest_v1` |
| `data_brief` | national | `0 8 1 * *` (1st of month) | `monthly_snapshot_v1` |
| `index_update` | national | `0 8 5 * *` (5th of month) | `cci_update_v1` |
| `research_report` | national | `0 8 15 * *` (15th) | `monthly_perspective_v1` |
| `marketbeat` | greater_accra | `0 8 10 * *` (10th) | `marketbeat_v1` |
| `marketbeat` | ashanti | `0 10 10 * *` (10th) | `marketbeat_v1` |
| `marketbeat` | western | `0 12 10 * *` (10th) | `marketbeat_v1` |
| `index_update` | NULL | `0 8 * * 1` (Mon) | `psi_weekly_v1` |
| `research_report` | NULL | `0 8 15 1,4,7,10 *` | `quarterly_outlook_v1` |
| `research_report` | NULL | `0 8 10 1,4,7,10 *` | `ghai_quarterly_v1` |
| `annual_flagship` | national | `0 8 15 1 *` | `annual_outlook_v1` |

### 2.4 Current Frontend Routes (14 public pages + 10 admin pages)

**Public:**
```
/insights                    → Hub page (7 section cards)
/insights/latest             → Market Flash + Data Brief feed
/insights/marketbeat         → MarketBeat regional feed
/insights/reports            → Research Reports feed
/insights/special-reports    → Special Reports feed
/insights/policy-papers      → Policy Papers feed
/insights/podcasts-video     → Podcasts, Videos, Webinars
/insights/indices            → Proprietary indices
/insights/[slug]             → Single publication view
/press                       → Press room hub
/press/releases              → Press releases feed
/press/commentary            → Expert commentary
/press/media-kit             → Media kit downloads
/press/journalists           → Data for journalists
```

**Admin:**
```
/dashboard/admin/publications              → List all publications
/dashboard/admin/publications/new          → Create publication
/dashboard/admin/publications/[id]         → Edit publication
/dashboard/admin/publications/autopilot    → Autopilot dashboard
/dashboard/admin/publications/indices      → Index management
/dashboard/admin/publications/analytics    → CMS analytics
/dashboard/admin/publications/newsletter   → Newsletter management
/dashboard/admin/publications/settings     → Settings
/dashboard/admin/publications/list         → Alternate listing
/dashboard/admin/publications/layout.tsx   → Tab navigation
```

---

## 3. Target State

### 3.1 New Product Types (5)

```typescript
type ProductType = 'outlook' | 'snapshot' | 'policy_paper' | 'press_release' | 'podcast';
type EditionType = 'monthly' | 'quarterly' | 'annual' | 'weekly' | 'adhoc';
```

### 3.2 Product → Edition Mapping

| Product | Valid Editions | Autopilot | PDF |
|---------|---------------|-----------|-----|
| `outlook` | `monthly`, `quarterly`, `annual` | Yes | Yes |
| `snapshot` | `weekly`, `adhoc` | Yes | No (web + email only) |
| `policy_paper` | `adhoc` | No | Yes |
| `press_release` | `adhoc` | No | No |
| `podcast` | `weekly` | No | No |

### 3.3 New Autopilot Templates (4)

| Template ID | Product | Edition | Name | Sections | Word Target | Charts |
|-------------|---------|---------|------|----------|-------------|--------|
| `outlook_monthly_v1` | `outlook` | `monthly` | Ghana Real Estate Outlook — Monthly | 10 fixed sections | 4,000 | 6-10 |
| `outlook_quarterly_v1` | `outlook` | `quarterly` | Ghana Real Estate Outlook — Quarterly | 10 fixed sections (deeper) | 10,000 | 10-15 |
| `outlook_annual_v1` | `outlook` | `annual` | Ghana Real Estate Outlook — Annual | 10 sections + 2 appendices | 25,000 | 20-30 |
| `snapshot_weekly_v1` | `snapshot` | `weekly` | Ghana Property Snapshot | 5 fixed blocks | 500 | 2 |

### 3.4 New Template Section Definitions

#### Outlook Template (All Editions — Depth Scales)

| # | Section Type | Heading | Monthly Words | Quarterly Words | Annual Words | Chart? |
|---|-------------|---------|--------------|----------------|--------------|--------|
| 01 | `executive_summary` | Executive Summary | 300 | 500 | 800 | No |
| 02 | `macro_context` | Macroeconomic Context | 250 | 600 | 1,200 | Yes |
| 03 | `residential_market` | Residential Market | 400 | 800 | 2,000 | Yes |
| 04 | `commercial_market` | Commercial Market | 250 | 700 | 1,500 | Yes |
| 05 | `construction` | Construction & Development | 400 | 600 | 1,500 | Yes |
| 06 | `investment` | Investment & Capital Markets | 250 | 600 | 1,500 | Yes |
| 07 | `regional_snapshots` | Regional Snapshots | 400 | 1,200 | 3,000 | Yes |
| 08 | `risk_resilience` | Risk & Resilience | 250 | 500 | 1,000 | Yes |
| 09 | `outlook_forecasts` | Outlook & Forecasts | 400 | 600 | 1,500 | Yes |
| 10 | `methodology` | Methodology & Disclaimer | 200 | 300 | 500 | No |
| A | `horizons_appendix` | Ghana Horizons (Annual only) | — | — | 3,000 | Yes |
| B | `wealth_luxury_appendix` | Wealth & Luxury (Annual only) | — | — | 2,500 | Yes |

#### Snapshot Template (Weekly — Fixed)

| # | Block Type | Heading | Words | Chart? |
|---|-----------|---------|-------|--------|
| 01 | `weekly_lead` | This Week's Lead | 200 | Yes |
| 02 | `index_pulse` | Index Pulse | 50 (data panel) | Sparklines |
| 03 | `chart_of_week` | Chart of the Week | 50 (caption) | Yes |
| 04 | `what_to_watch` | What to Watch | 60 (3 bullets) | No |
| 05 | `from_archive` | From the Archive | 30 (teaser) | No |

### 3.5 New Cron Schedules (5)

| Product | Edition | Cron | Template | Note |
|---------|---------|------|----------|------|
| `snapshot` | `weekly` | `0 8 * * 1` (Mon 8AM GMT) | `snapshot_weekly_v1` | Rotating lead focus by week # |
| `snapshot` | `adhoc` | `EVENT_DRIVEN` | `snapshot_weekly_v1` | Anomaly-triggered breaking edition |
| `outlook` | `monthly` | `0 8 1 * *` (1st of month, 8AM) | `outlook_monthly_v1` | Suppressed if quarterly/annual publishes same month |
| `outlook` | `quarterly` | `0 8 1 1,4,7,10 *` (Jan/Apr/Jul/Oct) | `outlook_quarterly_v1` | Supersedes monthly in those months |
| `outlook` | `annual` | `0 8 15 1 *` (Jan 15th) | `outlook_annual_v1` | Full-year definitive edition |

### 3.6 New Frontend Routes

**Public (replacing 14 pages → 11 pages):**
```
/insights                       → Research landing (all publications feed + filters)
/insights/outlook               → Outlook hub (Monthly / Quarterly / Annual tabs)  [NEW]
/insights/outlook/[slug]        → Individual Outlook edition  [REUSE /insights/[slug]]
/insights/snapshot              → Snapshot archive + subscribe CTA  [NEW]
/insights/snapshot/[slug]       → Individual Snapshot edition  [REUSE /insights/[slug]]
/insights/indices               → All indices dashboard  [KEEP]
/insights/policy-papers         → Policy Papers feed  [KEEP]
/insights/podcast               → Podcast archive  [RENAMED from podcasts-video]
/insights/[slug]                → Single publication view  [MODIFY]
/press                          → Press room hub  [KEEP]
/press/releases                 → Press releases feed  [KEEP]
/press/commentary               → Expert commentary  [KEEP]
/press/media-kit                → Media kit downloads  [KEEP]
/press/journalists              → Data for journalists  [KEEP]

DELETED pages:
/insights/latest                → Absorbed into /insights (combined feed)
/insights/marketbeat            → Absorbed into Outlook § 07 Regional Snapshots
/insights/reports               → Absorbed into /insights/outlook
/insights/special-reports       → Absorbed into /insights/outlook (annual)
```

**Admin (same structure, updated content):**
```
/dashboard/admin/publications              → List all (updated type filters)
/dashboard/admin/publications/new          → Create (updated type selector)
/dashboard/admin/publications/[id]         → Edit (updated type handling)
/dashboard/admin/publications/autopilot    → Autopilot (updated schedule display)
/dashboard/admin/publications/queue        → Human review queue  [NEW]
/dashboard/admin/publications/calendar     → Editorial calendar  [NEW - future]
... rest same
```

### 3.7 New Navigation

**Current TopNav "Insights" dropdown (7 items):**
```
Latest Research
Reports & Analysis
MarketBeat
Indices & Data
Special Reports
Policy Papers
Podcasts & Video
```

**New TopNav "Insights" dropdown (6 items):**
```
Ghana Real Estate Outlook        → /insights/outlook
Ghana Property Snapshot           → /insights/snapshot
Indices & Data                    → /insights/indices
Policy Papers                     → /insights/policy-papers
Podcast                           → /insights/podcast
All Research                      → /insights
```

---

## 4. Database Migration

A new migration file will handle the type system change. The approach is **additive then rename** — we add the new columns, migrate data, then update constraints.

### 4.1 Migration: `161_two_product_model.sql`

```sql
-- ============================================================
-- Migration 161: Two-Product Model
-- Converts 12 publication types to 5 products + editions
-- ============================================================

BEGIN;

-- STEP 1: Add new columns
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS product VARCHAR(50),
  ADD COLUMN IF NOT EXISTS edition VARCHAR(50);

-- STEP 2: Map old types to new product + edition
UPDATE publications SET product = 'snapshot', edition = 'adhoc'
  WHERE type = 'market_flash';

UPDATE publications SET product = 'snapshot', edition = 'weekly'
  WHERE type = 'data_brief' AND (title ILIKE '%weekly%' OR title ILIKE '%digest%');

UPDATE publications SET product = 'outlook', edition = 'monthly'
  WHERE type = 'data_brief' AND product IS NULL;

UPDATE publications SET product = 'outlook', edition = 'monthly'
  WHERE type = 'marketbeat';

UPDATE publications SET product = 'outlook', edition = 'monthly'
  WHERE type = 'research_report' AND title ILIKE '%monthly%perspective%';

UPDATE publications SET product = 'outlook', edition = 'monthly'
  WHERE type = 'index_update';

UPDATE publications SET product = 'outlook', edition = 'quarterly'
  WHERE type = 'research_report' AND (title ILIKE '%quarterly%' OR title ILIKE '%ghai%');

UPDATE publications SET product = 'outlook', edition = 'annual'
  WHERE type = 'special_report';

UPDATE publications SET product = 'outlook', edition = 'annual'
  WHERE type = 'annual_flagship';

UPDATE publications SET product = 'policy_paper', edition = 'adhoc'
  WHERE type = 'policy_paper';

UPDATE publications SET product = 'podcast', edition = 'weekly'
  WHERE type = 'podcast' OR type = 'video' OR type = 'webinar';

UPDATE publications SET product = 'press_release', edition = 'adhoc'
  WHERE type = 'press_release';

-- Catch-all for any unmapped
UPDATE publications SET product = 'outlook', edition = 'monthly'
  WHERE product IS NULL;

-- STEP 3: Make columns NOT NULL
ALTER TABLE publications
  ALTER COLUMN product SET NOT NULL,
  ALTER COLUMN edition SET NOT NULL;

-- STEP 4: Add CHECK constraints on new columns
ALTER TABLE publications
  ADD CONSTRAINT chk_product CHECK (product IN ('outlook', 'snapshot', 'policy_paper', 'press_release', 'podcast')),
  ADD CONSTRAINT chk_edition CHECK (edition IN ('monthly', 'quarterly', 'annual', 'weekly', 'adhoc'));

-- STEP 5: Drop old type CHECK constraint and column (after testing)
-- NOTE: Keep old `type` column as deprecated for rollback safety.
-- It can be dropped in a future migration after verification.
-- ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_type_check;
-- ALTER TABLE publications DROP COLUMN type;

-- STEP 6: Add index for new columns
CREATE INDEX IF NOT EXISTS idx_publications_product ON publications(product);
CREATE INDEX IF NOT EXISTS idx_publications_edition ON publications(edition);
CREATE INDEX IF NOT EXISTS idx_publications_product_edition ON publications(product, edition);

-- STEP 7: Update autopilot_schedules — new product/edition columns
ALTER TABLE autopilot_schedules
  ADD COLUMN IF NOT EXISTS product VARCHAR(50),
  ADD COLUMN IF NOT EXISTS edition VARCHAR(50);

-- Map old schedule types
UPDATE autopilot_schedules SET product = 'snapshot', edition = 'adhoc'
  WHERE publication_type = 'market_flash';

UPDATE autopilot_schedules SET product = 'snapshot', edition = 'weekly'
  WHERE template_id = 'weekly_digest_v1' OR template_id = 'psi_weekly_v1';

UPDATE autopilot_schedules SET product = 'outlook', edition = 'monthly'
  WHERE template_id IN ('monthly_snapshot_v1', 'cci_update_v1', 'monthly_perspective_v1', 'marketbeat_v1');

UPDATE autopilot_schedules SET product = 'outlook', edition = 'quarterly'
  WHERE template_id IN ('quarterly_outlook_v1', 'ghai_quarterly_v1');

UPDATE autopilot_schedules SET product = 'outlook', edition = 'annual'
  WHERE template_id = 'annual_outlook_v1';

UPDATE autopilot_schedules SET product = 'outlook', edition = 'monthly'
  WHERE product IS NULL;

-- STEP 8: Delete old schedules and insert new ones
DELETE FROM autopilot_schedules;

INSERT INTO autopilot_schedules (id, publication_type, product, edition, region, cron_expression, enabled, data_endpoints, chart_rules, template_id, quality_thresholds, word_count_target)
VALUES
  -- Weekly Snapshot (Mon 8AM GMT)
  (gen_random_uuid(), 'snapshot', 'snapshot', 'weekly', NULL,
   '0 8 * * 1', true,
   '["ml/market/price-index","ml/construction/index","ml/hai/current","ml/market/activity"]',
   '{"count":[2,2],"diversityMin":2}',
   'snapshot_weekly_v1',
   '{"minConfidence":0.70,"maxSimilarity":0.85,"maxDataAgeDays":7}',
   500),

  -- Breaking Snapshot (Event-driven)
  (gen_random_uuid(), 'snapshot', 'snapshot', 'adhoc', NULL,
   'EVENT_DRIVEN', true,
   '["ml/market/price-index","ml/construction/index","ml/market/activity"]',
   '{"count":[1,2],"diversityMin":1}',
   'snapshot_weekly_v1',
   '{"minConfidence":0.65,"maxSimilarity":0.80,"maxDataAgeDays":1}',
   500),

  -- Monthly Outlook (1st of month)
  (gen_random_uuid(), 'outlook', 'outlook', 'monthly', 'national',
   '0 8 1 * *', true,
   '["ml/market/price-index","ml/construction/index","ml/construction/regional","ml/construction/materials","ml/construction/labor","ml/construction/forecast","ml/hai/current","ml/hai/region/greater_accra","ml/hai/region/ashanti","ml/hai/region/western","ml/market/activity","ml/market/investment","dashboard"]',
   '{"count":[6,10],"diversityMin":3,"mustInclude":["ghpi","cci"]}',
   'outlook_monthly_v1',
   '{"minConfidence":0.75,"maxSimilarity":0.80,"maxDataAgeDays":35}',
   4000),

  -- Quarterly Outlook (Jan, Apr, Jul, Oct)
  (gen_random_uuid(), 'outlook', 'outlook', 'quarterly', 'national',
   '0 8 1 1,4,7,10 *', true,
   '["ml/market/price-index","ml/construction/index","ml/construction/regional","ml/construction/materials","ml/construction/labor","ml/construction/forecast","ml/hai/current","ml/hai/history","ml/market/activity","ml/market/investment","ml/valuations/volume","ml/performance","ml/features","ml/confidence","ml/monitoring/drift","dashboard","cohorts","velocity"]',
   '{"count":[10,15],"diversityMin":4,"mustInclude":["ghpi","cci","ghai","gcpi"]}',
   'outlook_quarterly_v1',
   '{"minConfidence":0.75,"maxSimilarity":0.75,"maxDataAgeDays":95}',
   10000),

  -- Annual Outlook (Jan 15th)
  (gen_random_uuid(), 'outlook', 'outlook', 'annual', 'national',
   '0 8 15 1 *', true,
   '["ml/market/price-index","ml/construction/index","ml/construction/regional","ml/construction/materials","ml/construction/labor","ml/construction/forecast","ml/hai/current","ml/hai/history","ml/market/activity","ml/market/investment","ml/valuations/volume","ml/performance","ml/performance/segments","ml/performance/trend","ml/features","ml/predictions","ml/confidence","ml/monitoring/drift","dashboard","cohorts","velocity","agent-performance"]',
   '{"count":[20,30],"diversityMin":5,"mustInclude":["ghpi","cci","ghai","gcpi","gprs","dii"]}',
   'outlook_annual_v1',
   '{"minConfidence":0.80,"maxSimilarity":0.70,"maxDataAgeDays":370}',
   25000);

-- STEP 9: Update autopilot_runs — add product/edition
ALTER TABLE autopilot_runs
  ADD COLUMN IF NOT EXISTS product VARCHAR(50),
  ADD COLUMN IF NOT EXISTS edition VARCHAR(50);

UPDATE autopilot_runs AS ar SET
  product = p.product,
  edition = p.edition
FROM publications p
WHERE ar.publication_id = p.id AND ar.product IS NULL;

COMMIT;
```

### 4.2 Data Safety

- The old `type` column is **kept** (not dropped) for rollback safety
- New `product` + `edition` columns are additive
- Old `autopilot_schedules` rows are replaced with 5 new rows
- Existing published articles retain their data — the `product`/`edition` columns back-fill from the old `type`

---

## 5. Backend Changes

### 5.1 `backend/src/routes/publications.ts` — TAXONOMY Update

**Current (lines 32-44):** 12 types in 2 categories
**New:** 5 products with edition metadata

```typescript
// NEW TAXONOMY
const TAXONOMY = {
  products: [
    {
      value: 'outlook',
      label: 'Ghana Real Estate Outlook',
      description: 'Comprehensive real estate report',
      editions: ['monthly', 'quarterly', 'annual'],
      autopilot: true,
      website_path: '/insights/outlook',
    },
    {
      value: 'snapshot',
      label: 'Ghana Property Snapshot',
      description: 'Weekly market brief (400-600 words)',
      editions: ['weekly', 'adhoc'],
      autopilot: true,
      website_path: '/insights/snapshot',
    },
    {
      value: 'policy_paper',
      label: 'Policy Paper',
      description: 'Government-focused analysis (8-15 pages)',
      editions: ['adhoc'],
      autopilot: false,
      website_path: '/insights/policy-papers',
    },
    {
      value: 'press_release',
      label: 'Press Release',
      description: 'Official announcement',
      editions: ['adhoc'],
      autopilot: false,
      website_path: '/press/releases',
    },
    {
      value: 'podcast',
      label: 'PropMetrik Perspectives Podcast',
      description: 'Weekly audio',
      editions: ['weekly'],
      autopilot: false,
      website_path: '/insights/podcast',
    },
  ],
  sectors: [/* unchanged */],
  topics: [/* unchanged */],
  regions: [/* unchanged */],
};
```

**Other route changes:**
- All `type` filter params → `product` + optional `edition` filter
- `POST /` create endpoint accepts `product` + `edition` instead of `type`
- `GET /public` filters by `product`/`edition`
- Existing sector/topic/region taxonomy: **NO CHANGE**

### 5.2 `backend/src/services/publications/publicationsService.ts` — Model Update

**Changes:**
- `Publication` interface: add `product: string`, `edition: string` fields
- `PublicationFilters`: replace `type?: string` with `product?: string`, `edition?: string`
- `CreatePublicationInput`: replace `type` with `product` + `edition`
- All SQL queries: add `product`/`edition` to SELECT, INSERT, UPDATE, WHERE clauses
- `listPublications`: filter by `product`/`edition` instead of `type`
- `createPublication`: validate `product` + `edition` combinations

### 5.3 `backend/src/services/publications/geminiService.ts` — Prompt Updates

**Changes:**
- Replace the 6 generic section prompts with **16 Outlook-specific + 5 Snapshot-specific** section prompts
- Outlook prompts scale by edition (different word targets for monthly/quarterly/annual)
- Snapshot prompts implement the 5-block structure (This Week's Lead, Index Pulse, Chart of Week, What to Watch, From the Archive)
- Add weekly rotation selection (Week 1: Construction, Week 2: Residential, Week 3: Investment, Week 4: Economy)
- Add `generateOutlookDraft()` and `generateSnapshotDraft()` as distinct methods

**New prompt structure:**
```
Outlook Sections (10):
  01_executive_summary    → Scales: 300w (monthly) / 500w (quarterly) / 800w (annual)
  02_macro_context        → Scales: 250w / 600w / 1,200w
  03_residential_market   → Scales: 400w / 800w / 2,000w
  04_commercial_market    → Scales: 250w / 700w / 1,500w
  05_construction         → Scales: 400w / 600w / 1,500w
  06_investment           → Scales: 250w / 600w / 1,500w
  07_regional_snapshots   → Scales: 400w / 1,200w / 3,000w
  08_risk_resilience      → Scales: 250w / 500w / 1,000w
  09_outlook_forecasts    → Scales: 400w / 600w / 1,500w
  10_methodology          → Scales: 200w / 300w / 500w

Annual-Only Appendices:
  A_horizons_appendix     → 3,000w
  B_wealth_luxury         → 2,500w

Snapshot Blocks (5):
  01_weekly_lead          → 200w + chart
  02_index_pulse          → 50w (data panel with sparklines)
  03_chart_of_week        → 50w (AI caption)
  04_what_to_watch        → 3 bullets × 20w
  05_from_archive         → 30w teaser
```

### 5.4 `backend/src/services/publications/pdfGenerationService.ts` — Template Updates

**Changes:**
- Replace old `TYPE_LABELS` map (5 entries: `marketbeat`, `research_report`, `special_report`, `annual_flagship`, `policy_paper`) with new product-edition labels
- Update cover page to show edition badge: "Monthly Edition", "Quarterly Edition", "Annual Edition"
- PDF only generated for `outlook` (all editions) and `policy_paper` — not for `snapshot`
- Update TOC to reflect 10-section structure + appendix labels for annual
- No major structural changes needed — the HTML/CSS template from the recent rewrite accommodates this

**New label map:**
```typescript
const PRODUCT_LABELS: Record<string, Record<string, string>> = {
  outlook: {
    monthly: 'Ghana Real Estate Outlook — Monthly Edition',
    quarterly: 'Ghana Real Estate Outlook — Quarterly Edition',
    annual: 'Ghana Real Estate Outlook — Annual Edition',
  },
  policy_paper: {
    adhoc: 'PROPMETRIK Policy Paper',
  },
};
```

---

## 6. Frontend Changes

### 6.1 Pages to DELETE (4)

These pages are absorbed into the two-product navigation:

| File | Route | Reason |
|------|-------|--------|
| `frontend/src/app/(marketing)/insights/latest/page.tsx` | `/insights/latest` | Feed merged into `/insights` main page |
| `frontend/src/app/(marketing)/insights/marketbeat/page.tsx` | `/insights/marketbeat` | Regional data now lives in Outlook § 07 |
| `frontend/src/app/(marketing)/insights/reports/page.tsx` | `/insights/reports` | Research reports are now Outlook editions |
| `frontend/src/app/(marketing)/insights/special-reports/page.tsx` | `/insights/special-reports` | Special reports absorbed into Outlook (annual) |

### 6.2 Pages to CREATE (3)

| File | Route | Description |
|------|-------|-------------|
| `frontend/src/app/(marketing)/insights/outlook/page.tsx` | `/insights/outlook` | **Outlook hub** — 3 tabs (Monthly / Quarterly / Annual), filterable list of all Outlook editions, featured latest edition hero |
| `frontend/src/app/(marketing)/insights/snapshot/page.tsx` | `/insights/snapshot` | **Snapshot archive** — chronological list of weekly snapshots, email subscribe CTA, "Every Monday 8AM GMT" branding |
| `frontend/src/app/(marketing)/insights/podcast/page.tsx` | `/insights/podcast` | **Podcast page** — replaces podcasts-video, removes video/webinar references |

### 6.3 Pages to MODIFY (10)

| File | Change |
|------|--------|
| `frontend/src/app/(marketing)/insights/page.tsx` | Replace 7 section cards with 2-product hero (Outlook + Snapshot) plus combined "All Research" feed below |
| `frontend/src/app/(marketing)/insights/[slug]/page.tsx` | Update `TYPE_LABELS` and `TYPE_COLORS` maps from 12 types to 5 products × editions. Update breadcrumb logic |
| `frontend/src/app/(marketing)/insights/indices/page.tsx` | Minor — update cross-links to reference Outlook sections instead of old type names |
| `frontend/src/app/(marketing)/insights/policy-papers/page.tsx` | Minor — update filter from `type=policy_paper` to `product=policy_paper` |
| `frontend/src/app/(marketing)/insights/podcasts-video/page.tsx` | **RENAME** to `podcast/page.tsx` — remove video/webinar, podcast only |
| `frontend/src/app/(marketing)/press/page.tsx` | Minor — update any cross-references to old publication types |
| `frontend/src/app/dashboard/admin/publications/page.tsx` | Replace 12-type filter with product/edition dropdowns. Update `TYPE_LABELS`, `TYPE_CATEGORY`, `TYPE_WEBSITE_PATH` maps |
| `frontend/src/app/dashboard/admin/publications/new/page.tsx` | Replace type selector with product + edition selector. Update AI draft generation to call product-specific endpoints |
| `frontend/src/app/dashboard/admin/publications/[id]/page.tsx` | Update type display → product + edition display |
| `frontend/src/app/dashboard/admin/publications/autopilot/page.tsx` | Update schedule display from 12 entries to 5. Update template names |

### 6.4 Components to MODIFY (2)

| File | Change |
|------|--------|
| `frontend/src/components/marketing/TopNav.tsx` | Replace "Insights" dropdown (7 items) with new 6-item nav (Outlook, Snapshot, Indices, Policy Papers, Podcast, All Research) |
| `frontend/src/app/dashboard/admin/publications/layout.tsx` | Update tab navigation labels if needed |

### 6.5 Types to MODIFY (1)

| File | Change |
|------|--------|
| `frontend/src/lib/publications-api.ts` | Update `Publication` type to include `product` + `edition` fields. Update filter types. Update API client methods to use new filter params |

---

## 7. Autopilot Pipeline Changes

### 7.1 `autopilot/types.ts` — Type Changes

```typescript
// OLD
export type PublicationType =
  | 'market_flash' | 'data_brief' | 'marketbeat' | 'research_report'
  | 'special_report' | 'annual_flagship' | 'policy_paper' | 'podcast'
  | 'video' | 'index_update' | 'webinar' | 'press_release';

// NEW
export type ProductType = 'outlook' | 'snapshot' | 'policy_paper' | 'press_release' | 'podcast';
export type EditionType = 'monthly' | 'quarterly' | 'annual' | 'weekly' | 'adhoc';

// Weekly rotation for Snapshot
export type WeeklyFocus = 'construction' | 'residential' | 'investment' | 'economy';
```

Update all interfaces that reference `PublicationType` → `ProductType` + `EditionType`:
- `AutopilotSchedule`
- `AutopilotRun`
- `GenerationInput`
- `PreviousEdition`
- `PublicationTemplate`

### 7.2 `autopilot/templates.ts` — Template Replacement

**Delete all 10 old templates. Replace with 4 new templates:**

1. **`outlook_monthly_v1`** — 10 sections, 4,000 words, 6-10 charts
2. **`outlook_quarterly_v1`** — 10 sections (deeper), 10,000 words, 10-15 charts
3. **`outlook_annual_v1`** — 10 sections + 2 appendices, 25,000 words, 20-30 charts
4. **`snapshot_weekly_v1`** — 5 blocks, 500 words, 2 charts

### 7.3 `autopilot/autopilotPipeline.ts` — Pipeline Logic

**Key changes:**
- Step 1 (Data Collection): Add logic to determine weekly rotation focus (week # mod 4)
- Step 2 (AI Generation): Branch on `product` — call `generateOutlookDraft()` or `generateSnapshotDraft()`
- Monthly suppression: If a quarterly or annual edition publishes in the same month, the monthly edition is skipped
- Snapshot ad-hoc: Anomaly trigger creates `snapshot`/`adhoc` instead of `market_flash`
- Section generation: Iterate over 10 fixed Outlook sections (not variable per template)

### 7.4 `autopilot/autopilotScheduler.ts` — Schedule Changes

- Read `product`/`edition` columns from `autopilot_schedules` instead of `publication_type`
- Monthly suppression logic: before triggering monthly, check if quarterly/annual already published that month

### 7.5 `autopilot/anomalyTrigger.ts` — Type Change

- Change output from `market_flash` → `snapshot`/`adhoc`
- Same thresholds and detection logic

### 7.6 `autopilot/qualityGateEngine.ts` — Validation Updates

- Word count ranges keyed on `product`/`edition` instead of template type
- Snapshot: all 5 blocks present (not 10 sections)
- Outlook: all 10 sections present; annual also checks 2 appendices
- PDF generation check: only for `outlook` and `policy_paper`

### 7.7 `autopilot/chartSelectionEngine.ts` — Selection Updates

- Chart count ranges from new templates
- Snapshot: exactly 2 charts (lead + chart of the week)
- Outlook monthly: 6-10, quarterly: 10-15, annual: 20-30

---

## 8. PDF Generation Changes

### 8.1 Cover Page

**Current:** Shows `type` label (e.g., "MarketBeat", "Research Report")
**New:** Shows product name + edition badge:

```
PROPMETRIK RESEARCH

Ghana Real Estate Outlook
━━━━━━━━━━━━━━━━━━━━━━━━
Monthly Edition — March 2026

PROPMETRIK Research
propmetrik.com
```

### 8.2 Table of Contents

**Current:** Dynamic from content blocks
**New:** Fixed 10-section structure for all Outlook editions. Annual adds appendix entries.

### 8.3 When to Generate PDF

| Product | Edition | PDF? |
|---------|---------|------|
| `outlook` | `monthly` | Yes |
| `outlook` | `quarterly` | Yes |
| `outlook` | `annual` | Yes |
| `snapshot` | `weekly` | No (web + email only) |
| `snapshot` | `adhoc` | No |
| `policy_paper` | `adhoc` | Yes |
| `press_release` | `adhoc` | No |
| `podcast` | `weekly` | No |

### 8.4 Page Estimates

| Edition | Estimated Pages |
|---------|----------------|
| Monthly Outlook | 8–14 pages |
| Quarterly Outlook | 20–30 pages |
| Annual Outlook | 50–80 pages |
| Policy Paper | 8–15 pages |

---

## 9. File-by-File Change Matrix

### Backend Files

| # | File | Action | Lines Changed (est.) | Priority |
|---|------|--------|---------------------|----------|
| 1 | `database/migrations/161_two_product_model.sql` | **CREATE** | ~120 | P0 — Must run first |
| 2 | `src/services/publications/autopilot/types.ts` | **MODIFY** | ~80 of 315 | P0 |
| 3 | `src/services/publications/autopilot/templates.ts` | **REWRITE** | ~200 of 208 | P0 |
| 4 | `src/services/publications/autopilot/autopilotPipeline.ts` | **MODIFY** | ~150 of 927 | P1 |
| 5 | `src/services/publications/autopilot/autopilotScheduler.ts` | **MODIFY** | ~30 of 168 | P1 |
| 6 | `src/services/publications/autopilot/anomalyTrigger.ts` | **MODIFY** | ~20 of 275 | P2 |
| 7 | `src/services/publications/autopilot/qualityGateEngine.ts` | **MODIFY** | ~40 of 511 | P1 |
| 8 | `src/services/publications/autopilot/chartSelectionEngine.ts` | **MODIFY** | ~30 of 681 | P2 |
| 9 | `src/services/publications/publicationsService.ts` | **MODIFY** | ~80 of 647 | P0 |
| 10 | `src/services/publications/geminiService.ts` | **REWRITE** | ~250 of 318 | P1 |
| 11 | `src/services/publications/pdfGenerationService.ts` | **MODIFY** | ~50 of 1,385 | P1 |
| 12 | `src/routes/publications.ts` | **MODIFY** | ~60 of 622 | P0 |

### Frontend Files

| # | File | Action | Lines Changed (est.) | Priority |
|---|------|--------|---------------------|----------|
| 13 | `src/lib/publications-api.ts` | **MODIFY** | ~40 of 380 | P0 |
| 14 | `src/components/marketing/TopNav.tsx` | **MODIFY** | ~30 of 195 | P0 |
| 15 | `src/app/(marketing)/insights/page.tsx` | **REWRITE** | ~95 of 95 | P0 |
| 16 | `src/app/(marketing)/insights/outlook/page.tsx` | **CREATE** | ~180 | P0 |
| 17 | `src/app/(marketing)/insights/snapshot/page.tsx` | **CREATE** | ~160 | P0 |
| 18 | `src/app/(marketing)/insights/podcast/page.tsx` | **CREATE** | ~120 | P1 |
| 19 | `src/app/(marketing)/insights/[slug]/page.tsx` | **MODIFY** | ~60 of 455 | P0 |
| 20 | `src/app/(marketing)/insights/indices/page.tsx` | **MODIFY** | ~10 of 119 | P2 |
| 21 | `src/app/(marketing)/insights/policy-papers/page.tsx` | **MODIFY** | ~10 of 95 | P2 |
| 22 | `src/app/(marketing)/insights/podcasts-video/page.tsx` | **DELETE** | — | P1 |
| 23 | `src/app/(marketing)/insights/latest/page.tsx` | **DELETE** | — | P1 |
| 24 | `src/app/(marketing)/insights/marketbeat/page.tsx` | **DELETE** | — | P1 |
| 25 | `src/app/(marketing)/insights/reports/page.tsx` | **DELETE** | — | P1 |
| 26 | `src/app/(marketing)/insights/special-reports/page.tsx` | **DELETE** | — | P1 |
| 27 | `src/app/dashboard/admin/publications/page.tsx` | **MODIFY** | ~60 of 447 | P0 |
| 28 | `src/app/dashboard/admin/publications/new/page.tsx` | **MODIFY** | ~100 of 1,038 | P1 |
| 29 | `src/app/dashboard/admin/publications/[id]/page.tsx` | **MODIFY** | ~40 of 918 | P1 |
| 30 | `src/app/dashboard/admin/publications/autopilot/page.tsx` | **MODIFY** | ~60 of 569 | P1 |
| 31 | `src/app/dashboard/admin/publications/layout.tsx` | **MODIFY** | ~10 of 70 | P2 |
| 32 | `src/components/publications/PublicationChart.tsx` | **NO CHANGE** | 0 | — |
| 33 | `src/components/marketing/PublicationTypeFeedPage.tsx` | **MODIFY** | ~10 of 82 | P2 |

---

## 10. Migration Strategy

### Phase 1: Database + Backend Types (Day 1)

1. Run migration `161_two_product_model.sql`
2. Update `autopilot/types.ts` — new type definitions
3. Update `publicationsService.ts` — read `product`/`edition`, dual-read from `type` for backward compat
4. Update `routes/publications.ts` — new TAXONOMY, accept `product`/`edition` in API

**Validation:** Backend starts, existing publications load with new product/edition fields.

### Phase 2: Backend Autopilot + AI (Day 2)

1. Rewrite `autopilot/templates.ts` — 4 new templates
2. Update `autopilot/autopilotPipeline.ts` — branching on product
3. Update `autopilot/autopilotScheduler.ts` — read new schedule columns
4. Update `autopilot/qualityGateEngine.ts` — product-aware validation
5. Update `geminiService.ts` — new prompts for Outlook sections + Snapshot blocks
6. Update `anomalyTrigger.ts` — snapshot/adhoc output
7. Update `chartSelectionEngine.ts` — new chart counts that match new templates

**Validation:** Trigger a test Snapshot and test Monthly Outlook manually. Verify quality gates pass.

### Phase 3: PDF Generation (Day 2)

1. Update `pdfGenerationService.ts` — new cover labels, product-aware template
2. Test PDF for monthly, quarterly, and annual editions

**Validation:** Generate test PDFs for each Outlook edition.

### Phase 4: Frontend (Day 3–4)

1. Update `publications-api.ts` — new types + filters
2. Update `TopNav.tsx` — new navigation
3. Create `/insights/outlook/page.tsx`
4. Create `/insights/snapshot/page.tsx`
5. Create `/insights/podcast/page.tsx`
6. Rewrite `/insights/page.tsx` — two-product hero
7. Update `/insights/[slug]/page.tsx` — new type maps
8. Update admin pages (list, new, edit, autopilot) — product/edition selectors
9. Delete obsolete pages (latest, marketbeat, reports, special-reports)
10. Rename `podcasts-video/` → redirect or delete

**Validation:** Navigate all public routes, create a test publication via admin, verify filters work.

### Phase 5: Cleanup (Day 5)

1. Verify all data migrated correctly
2. Remove backward-compat `type` reads from service layer
3. Update `.ai/insights.md`
4. Smoke test full pipeline end-to-end

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing published articles break on frontend | Medium | High | Keep old `type` column; dual-read from `product` with fallback to `type` mapping |
| Autopilot publishes during migration | Low | Medium | Disable autopilot (`kill_switch = true`) before starting |
| Quarterly suppression logic edge cases | Medium | Low | Unit test: monthly cron checks for same-month quarterly/annual before publishing |
| PDF template breaks for new section structure | Low | Medium | PDF template already flexible — test all 3 edition sizes |
| Old bookmarked URLs 404 | Medium | Medium | Add Next.js redirects: `/insights/latest` → `/insights`, `/insights/marketbeat` → `/insights/outlook`, `/insights/reports` → `/insights/outlook`, `/insights/special-reports` → `/insights/outlook` |

---

## 12. Estimated Effort

| Phase | Estimated Time | Files Touched |
|-------|---------------|---------------|
| Phase 1: Database + Backend Types | 2–3 hours | 4 files |
| Phase 2: Autopilot + AI | 4–5 hours | 7 files |
| Phase 3: PDF Generation | 1–2 hours | 1 file |
| Phase 4: Frontend | 5–6 hours | 15 files |
| Phase 5: Cleanup + Testing | 1–2 hours | — |
| **Total** | **13–18 hours** | **27 files** |

---

## Approval Checklist

Before implementation begins, please confirm:

- [ ] **Product names** are correct: "Ghana Real Estate Outlook" and "Ghana Property Snapshot"
- [ ] **5 cron schedules** (weekly snapshot, adhoc snapshot, monthly/quarterly/annual outlook) look right
- [ ] **10 Outlook sections** match the structure you want
- [ ] **5 Snapshot blocks** match the structure you want
- [ ] **Deleted pages** (latest, marketbeat, reports, special-reports) are okay to remove
- [ ] **New pages** (outlook hub, snapshot archive, podcast) are the right set
- [ ] **Navigation** (6-item Insights dropdown) is correct
- [ ] **PDF generation** for Outlook + Policy Paper only (not Snapshot) is correct
- [ ] **Migration order** (DB → Backend → PDF → Frontend → Cleanup) is acceptable
- [ ] **Old `type` column retained** for rollback safety — acceptable?

---

*Awaiting your approval to begin implementation.*
