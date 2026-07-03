# Audit 13 — Frontend Pages: Projects + Property Management

Scope: every `.tsx`/`.ts` under `frontend/src/app/dashboard/projects/` and
`frontend/src/app/dashboard/property-management/`. Auditor: Senior Staff Eng.
No source files were modified. Performance weighted highest (remote DB → every
fetch is high-latency).

## Scope & counts

| Subdir | Files | LOC |
|---|---|---|
| `projects/` | 60 | 27,557 |
| `property-management/` | 33 | 19,552 |
| **Total** | **93** | **47,109** |

Every file gets a ledger row below; all 93 accounted for in the Coverage Ledger.

## Domain scores (1 = terrible, 10 = excellent)

| Domain | Score | Rationale |
|---|---|---|
| Performance | **4/10** | Zero `next/dynamic` (recharts imported statically into 3 client pages); several fetch waterfalls on the hottest detail pages; per-keystroke server refetch on 3 project list pages (no debounce); unbounded/`limit:100`-capped list fetches with no real pagination; 14 parallel calls up-front on property detail. |
| Maintainability | **4/10** | 6 god files >700 LOC (two >1,800); ~87 of 93 files are `'use client'` with no server-component split; heavy inline JSX. |
| Duplication | **3/10** | ~3,300 LOC of near-identical copies between `[id]/{checklists,punch-lists,site-logs,procurement}` and their top-level twins; repeated `const API = process.env.NEXT_PUBLIC_API_URL` scaffolding in ~24 files; copy-pasted status-color maps and fetch boilerplate. |
| Hardcoded values | **4/10** | 24 files declare `NEXT_PUBLIC_API_URL`/`localhost:4000`/manual `/api/v1` API bases (contract violation); ~443 hardcoded color occurrences (188 projects + 255 PM) bypassing theme tokens. |
| Complexity | **4/10** | `[id]/page.tsx` (1,850) and `tenants/[id]/page.tsx` (1,819) mix fetching, 8+ dialogs, derived state, and rendering in one component; deeply nested effects. |

---

## TOP FINDINGS

### CRITICAL

**C1 — API-URL contract violations in 24 files (perf + prod risk).**
The repo contract is relative `/api/*` via the Next proxy. These files hardcode a
backend base, most defaulting to `http://localhost:4000` (dev leak) or manually
re-prefixing `/api/v1`:
- `property-management/financials/page.tsx:227` — `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'` then `authedFetch(\`${base}/pm/...\`)`.
- `property-management/tenants/[id]/page.tsx:81` and `documents/page.tsx:48` — `API_HOST = NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/,'') || 'http://localhost:4000'`.
- 21 project pages set `const API/API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'` (e.g. `projects/site-logs/page.tsx:60`, `checklists/page.tsx:66`, `punch-lists/page.tsx:51`, `[id]/procurement/page.tsx:73`, `[id]/photos/page.tsx:56`, `[id]/issues-risks/page.tsx:54`, `bids/page.tsx:26`, `transmittals/page.tsx:25`, `settings/page.tsx:35`, `drawings/page.tsx:17`, `safety/page.tsx:18`, `meetings/page.tsx:18`, `equipment/page.tsx:18`, `issues/page.tsx:19`, `timesheets/page.tsx:20`, `documents/page.tsx:31`, `reports/page.tsx:19`, `team/[memberId]/page.tsx:20`, and the `[id]/` copies of site-logs/checklists/punch-lists).
Fix: delete every `const API*` base; call the relative `/api/...` path directly through `authedFetch`. Full grep list embedded in ledger.

### HIGH

**H1 — Recharts imported statically into client pages (no code-split).**
`property-management/page.tsx:56`, `financials/page.tsx:54`, `portfolios/page.tsx:56`
import recharts at module top. There is **zero** `next/dynamic` usage anywhere in
either directory. Recharts is a large bundle shipped eagerly on first paint of
these pages. Fix: `const X = dynamic(() => import('recharts').then(m => m.X), { ssr:false })` or wrap the chart block in a `next/dynamic` lazy component.

**H2 — Fetch waterfall on the two hottest detail pages.**
- `projects/[id]/page.tsx:958-1013`: three *sequential* batches — `Promise.all` of 5, then `await Promise.all` of 4 (RFI/submittal/CO/punch stats), then a sequential `authedFetch(documents)`, plus a conditional `teamApi.getMembers` at 984. All 10+ calls are independent → 3 serial remote round-trips where 1 would do. Fix: single `Promise.all`; move `documents` and PM-stats into it.
- `projects/[id]/logs/page.tsx:825-836`: three raw `await fetch` in series (`/logs` → `/logs/summary` → `/api/projects/${id}`), fully independent. Fix: `Promise.all`.

**H3 — Per-keystroke server refetch on search inputs (no debounce).**
`projects/rfis/page.tsx:170`, `change-orders/page.tsx:160`, `submittals/page.tsx:163`
put `searchQuery` in the `useCallback`/effect dep array that calls the API
(`rfisApi.getAll({ search })` etc.), so every character triggers a full list +
stats fetch against the remote DB. `rfis` additionally does a sequential
`projectsApi.getById` after the `Promise.allSettled` (line 158). `documents/page.tsx`
already debounces (`debouncedSearch`, line 136) — copy that pattern. (Note: PM
`tenants`/`vendors`/`portfolios` filter client-side over loaded arrays — not a
refetch, only an unmemoized-filter concern — see M2.)

**H4 — No real pagination on list pages.**
`projects/page.tsx:319` `projectsApi.getAll(filters)` is unbounded (no limit).
`property-management/properties/page.tsx:84` uses `limit:100`, silently truncating
portfolios >100 (correctness + perf). Fix: server pagination with page/offset UI.

### MEDIUM

**M1 — Property detail fires 14 parallel calls on load.**
`property-management/properties/[id]/page.tsx:164-179`: parallel (good) but 14
remote calls up-front, including 6 separate financial-metric endpoints
(ROI/summary/NOI/capRate/IRR/DSCR). Lazy-load the analytics/metrics per tab, and
collapse the 6 metric calls into one endpoint.

**M2 — Unmemoized / large derived filters.** PM list pages recompute `filter()`
over full arrays on each render keyed to search state (`tenants/page.tsx:146`,
`vendors/page.tsx:162`, `portfolios/page.tsx:146`) — `useMemo` present in some but
several `.filter()`/count expressions run inline in render (`properties/page.tsx:131-132`).

**M3 — Duplication (see Duplication section)** — ~3,300 LOC of copy-paste.

**M4 — ~443 hardcoded colors** bypass theme tokens (188 projects / 255 PM). Worst:
`portfolios/brochure/page.tsx` (46 — print CSS, partly justified),
`properties/[id]/brochure/page.tsx` (37), `property-management/page.tsx` (34),
`financials/page.tsx` (30), `applications/page.tsx` (24).

### LOW

**L1 — Data-integrity bug:** `projects/[id]/team/page.tsx:15` hardcodes
`const organizationId = '' // TODO` and passes the empty string into `<TeamManager organizationId={organizationId}/>` — team scoping is broken on this route.

**L2 — Polling:** `property-management/messages/page.tsx` uses `setInterval` — verify it clears on unmount and backs off (remote DB).

**L3 — `bids` and `bidding` are both routed** (`layout.tsx:87-88`) — likely redundant/overlapping features; confirm one isn't stale.

---

## GOD-FILE TABLE (>500 LOC)

| File | LOC | Split recommendation |
|---|---|---|
| `projects/[id]/page.tsx` | 1,850 | Extract tab bodies (Overview/Phases/Costs/Team/Docs) + dialogs into `components/projects/dashboard/*`; move the 3-batch fetch into a `useProjectDashboard` hook. |
| `property-management/tenants/[id]/page.tsx` | 1,819 | Split tenancy/payments/maintenance/utility panels; extract `useTenantDetail` hook (nested effects at 248-317). |
| `property-management/properties/[id]/page.tsx` | 1,568 | Extract per-tab metric panels; lazy-load analytics tab. |
| `applications/[id]/generate-lease/page.tsx` | 1,119 | Split form sections + template preview. |
| `projects/procurement/page.tsx` | 1,073 | See Duplication — dedupe with `[id]/procurement` first. |
| `tenants/new/page.tsx` | 1,077 | Multi-step form → step components. |
| `projects/bids/page.tsx` | 1,068 | Extract bid table + create dialog. |
| `projects/create/page.tsx` | 1,063 | Wizard steps into components. |
| `projects/[id]/logs/page.tsx` | 999 | Extract log form + list; fix H2 waterfall. |
| `applications/[id]/page.tsx` | 953 | Section components. |
| `projects/[id]/draws/page.tsx` | 930 | Draw table + dialog. |
| `projects/punch-lists/page.tsx` | 891 | Dedupe with `[id]/` twin. |
| `vendors/page.tsx` (885), `projects/[id]/procurement` (843), `projects/checklists` (828), `applications/page.tsx` (818), `projects/site-logs` (825), `projects/transmittals` (819), `projects/[id]/punch-lists` (815), `property-management/page.tsx` (812), `tenants/page.tsx` (798), `financials/page.tsx` (788), `portfolios/page.tsx` (778), `projects/[id]/site-logs` (765), `bulk-operations` (755), `change-orders` (748), `leases/[id]` (743), `[id]/milestones` (722), `portfolios/brochure` (716), `reports/page.tsx` (709) | 700–890 | All exceed the 500 threshold; prioritise the dedupe pairs and hook extraction. |

(28 files >500 LOC total.)

## DUPLICATION NOTES

1. **`[id]/X` vs top-level `X` twins (~3,300 LOC).** `diff` shows only ~param-handling
   differences: checklists (1,105 diff lines across the 636+828 pair), punch-lists
   (815 vs 891), site-logs (765 vs 825), procurement (843 vs 1,073). Both variants
   are live (subnav → `[id]/`, layout → top-level). Fix: one shared component taking
   `projectId?` prop; the route files become thin wrappers (as `[id]/rfis|submittals|change-orders` already do via `export { default } from ...`).
2. **API-base scaffolding** repeated verbatim in ~24 files (C1). Centralise via `authedFetch` + relative paths.
3. **Status/priority color maps** re-declared per file (e.g. `projects/[id]/page.tsx:96-115`); hoist to a shared constant.
4. **List/detail fetch boilerplate** (`setLoading`→`Promise.all`→per-key setState) copy-pasted; extract typed hooks.

## FILE-BY-FILE LEDGER

### projects/ (60)
| File | Purpose | Issues | Priority |
|---|---|---|---|
| `[id]/page.tsx` | Project dashboard | 1,850 LOC god file; 3-batch fetch waterfall (H2); 15 hardcoded colors | Critical |
| `[id]/logs/page.tsx` | Site logs (nested) | 999 LOC; 3 sequential fetches (H2) | High |
| `[id]/draws/page.tsx` | Draws (nested) | 930 LOC god file | Medium |
| `[id]/procurement/page.tsx` | Procurement (nested) | 843 LOC; `localhost:4000` base:73; dup of top-level | Critical |
| `[id]/punch-lists/page.tsx` | Punch (nested) | 815 LOC; `localhost:4000`:64; dup | Critical |
| `[id]/site-logs/page.tsx` | Site logs (nested) | 765 LOC; `localhost:4000`:58; dup | Critical |
| `[id]/milestones/page.tsx` | Milestones | 722 LOC god file | Medium |
| `[id]/photos/page.tsx` | Photos | 648 LOC; `localhost:4000`:56 | High |
| `[id]/checklists/page.tsx` | Checklists (nested) | 636 LOC; `localhost:4000`:65; dup | Critical |
| `[id]/edit/page.tsx` | Edit project | 623 LOC form | Medium |
| `[id]/budget-cost/page.tsx` | Budget/cost | 423 LOC; searchQuery in dep (no debounce):151 | High |
| `[id]/issues-risks/page.tsx` | Issues/risks | 412 LOC; `localhost:4000`:54; searchQuery dep | Critical |
| `[id]/draws-pay-apps/page.tsx` | Draws/pay apps | 351 LOC; searchQuery dep | Medium |
| `[id]/budget-cost` see above | | | |
| `[id]/team/page.tsx` | Project team | **organizationId=''** bug:15 (L1) | Low |
| `[id]/schedule/page.tsx` | Gantt wrapper | Thin; clean | clean |
| `[id]/error.tsx` | Error boundary | Boilerplate; clean | clean |
| `[id]/submittals/page.tsx` | Re-export | `export { default } from submittals` | clean |
| `[id]/rfis/page.tsx` | Re-export | re-export | clean |
| `[id]/change-orders/page.tsx` | Re-export | re-export | clean |
| `page.tsx` | Projects list | 541 LOC; **unbounded getAll** (H4); Promise.all ok | High |
| `create/page.tsx` | Create wizard | 1,063 LOC; 9 awaits/3 effects; 11 colors | Medium |
| `procurement/page.tsx` | Procurement list | 1,073 LOC; dup of `[id]/` twin | High |
| `bids/page.tsx` | Bid mgmt | 1,068 LOC; `NEXT_PUBLIC_API_URL`:26 | Critical |
| `punch-lists/page.tsx` | Punch list | 891 LOC; `localhost:4000`:51; dup | Critical |
| `checklists/page.tsx` | Checklists | 828 LOC; `localhost:4000`:66; dup; 7 colors | Critical |
| `site-logs/page.tsx` | Site logs | 825 LOC; `localhost:4000`:60; dup | Critical |
| `transmittals/page.tsx` | Transmittals | 819 LOC; `NEXT_PUBLIC_API_URL`:25; 11 colors | Critical |
| `change-orders/page.tsx` | Change orders | 748 LOC; searchQuery dep (H3):160; 9 colors | High |
| `rfis/page.tsx` | RFIs | 635 LOC; searchQuery dep + seq getById (H3):158,170; 12 colors | High |
| `settings/page.tsx` | Settings | 532 LOC; `NEXT_PUBLIC_API_URL`:35; Promise.all ok | Critical |
| `financials/page.tsx` | Financials | 482 LOC; 10 colors | Medium |
| `submittals/page.tsx` | Submittals | 477 LOC; searchQuery dep (H3):163 | High |
| `drawings/page.tsx` | Drawings | 476 LOC; `NEXT_PUBLIC_API_URL`:17 | Critical |
| `reports/page.tsx` | Reports | 472 LOC; `NEXT_PUBLIC_API_URL`:19 (defaults `/api` — softer) | High |
| `photos/page.tsx` | Photos list | 456 LOC; searchQuery dep:128 | High |
| `contractors/page.tsx` | Contractors | 438 LOC; Promise.all ok | Medium |
| `meetings/page.tsx` | Meetings | 416 LOC; `NEXT_PUBLIC_API_URL`:18 | Critical |
| `issues/page.tsx` | Issues | 407 LOC; `NEXT_PUBLIC_API_URL`:19; Promise.all ok | Critical |
| `documents/page.tsx` | Documents | 379 LOC; `NEXT_PUBLIC_API_URL||'/api'`:31; **has debounce** (good) | High |
| `timesheets/page.tsx` | Timesheets | 339 LOC; `NEXT_PUBLIC_API_URL`:20 | Critical |
| `costs/page.tsx` | Costs | 325 LOC; Promise.all ok | Medium |
| `safety/page.tsx` | Safety | 323 LOC; `NEXT_PUBLIC_API_URL`:18 | Critical |
| `equipment/page.tsx` | Equipment | 306 LOC; `NEXT_PUBLIC_API_URL`:18 | Critical |
| `integrations-marketplace/page.tsx` | Integrations | 289 LOC | Low |
| `analytics/page.tsx` | Analytics | 288 LOC; Promise.all ok | Medium |
| `schedule/page.tsx` | Schedule | 281 LOC | Low |
| `layout.tsx` | Nav layout | 278 LOC; large nav config; useMemo present | Low |
| `units/page.tsx` | Units | 265 LOC | Low |
| `bidding/page.tsx` | Bidding | 215 LOC; overlaps `bids` (L3) | Medium |
| `closeout/page.tsx` | Closeout | 205 LOC | Low |
| `cost-estimator/page.tsx` | Estimator wrapper | 138 LOC; wraps CostEstimator | clean |
| `audit-log/page.tsx` | Audit log | 135 LOC | Low |
| `invoices/page.tsx` | Invoices | 108 LOC | Low |
| `payment-schedule/page.tsx` | Pay schedule | 106 LOC | Low |
| `gantt/page.tsx` | Gantt | 82 LOC | clean |
| `error.tsx` | Error boundary | 54 LOC; clean | clean |
| `payment-settings/page.tsx` | Pay settings | 25 LOC wrapper | clean |
| `invoice-builder/page.tsx` | Invoice wrapper | 7 LOC; wraps component | clean |
| `team/page.tsx` | Team wrapper | 5 LOC; ServiceTeamManager | clean |
| `team/[memberId]/page.tsx` | Member detail | 608 LOC; `NEXT_PUBLIC_API_URL||'/api'`:20; 7 colors | High |

### property-management/ (33)
| File | Purpose | Issues | Priority |
|---|---|---|---|
| `tenants/[id]/page.tsx` | Tenant detail | 1,819 LOC god file; fetch waterfall 248-317; `API_HOST localhost:4000`:81; manual `/api/v1`:87 | Critical |
| `properties/[id]/page.tsx` | Property detail | 1,568 LOC; 14 parallel calls (M1):164; 6 metric endpoints | High |
| `applications/[id]/generate-lease/page.tsx` | Lease gen | 1,119 LOC; Promise.all ok; 9 colors | Medium |
| `tenants/new/page.tsx` | New tenant | 1,077 LOC; 3 effects; multi-step form | Medium |
| `applications/[id]/page.tsx` | Application detail | 953 LOC | Medium |
| `vendors/page.tsx` | Vendors list | 885 LOC; client-filter unmemoized (M2):162 | Medium |
| `applications/page.tsx` | Applications list | 818 LOC; `limit` present; 24 colors; Promise.all ok | Medium |
| `page.tsx` | PM dashboard | 812 LOC; **recharts static**:56 (H1); 34 colors; Promise.all ok | High |
| `tenants/page.tsx` | Tenants list | 798 LOC; client-filter (M2):146 | Medium |
| `financials/page.tsx` | Financials | 788 LOC; **recharts static**:54; `localhost:4000/api/v1` base:227 (C1); Promise.all ok | Critical |
| `portfolios/page.tsx` | Portfolios | 778 LOC; **recharts static**:56; client-filter:146; 18 colors | High |
| `bulk-operations/page.tsx` | Bulk ops | 755 LOC; 5 awaits/no Promise.all | Medium |
| `leases/[id]/page.tsx` | Lease detail | 743 LOC | Medium |
| `portfolios/brochure/page.tsx` | Brochure/print | 716 LOC; 46 colors (print CSS) | Medium |
| `reports/page.tsx` | Reports | 709 LOC | Medium |
| `properties/new/page.tsx` | New property | 673 LOC; multi-unit form | Medium |
| `maintenance/[id]/page.tsx` | Work order detail | 536 LOC; 11 colors | Medium |
| `properties/[id]/edit/page.tsx` | Edit property | 500 LOC | Medium |
| `messages/page.tsx` | Messages | 499 LOC; **setInterval polling** (L2); Promise.all ok | Medium |
| `audit/page.tsx` | Audit log | 484 LOC; client-filter search | Low |
| `documents/page.tsx` | Documents | 412 LOC; `API_HOST localhost:4000`:48; manual `/api/v1`:54 | Critical |
| `properties/page.tsx` | Properties list | 389 LOC; **limit:100 truncation** (H4):84; useMemo filter ok; inline counts:131 | High |
| `properties/[id]/brochure/page.tsx` | Brochure/print | 349 LOC; 37 colors (print) | Medium |
| `leases/new/page.tsx` | New lease | 339 LOC; Promise.all ok | Low |
| `maintenance/page.tsx` | Maintenance list | 320 LOC | Low |
| `properties/[id]/logbook/page.tsx` | Logbook | 239 LOC; Promise.all ok | Low |
| `enquiries/page.tsx` | Enquiries | 194 LOC | Low |
| `maintenance/new/page.tsx` | New work order | 172 LOC | Low |
| `error.tsx` | Error boundary | 54 LOC; clean | clean |
| `leases/page.tsx` | Redirect → tenants | 20 LOC; clean | clean |
| `layout.tsx` | Nav layout | 17 LOC; clean | clean |
| `calendar/page.tsx` | Redirect → calendar | 12 LOC; clean | clean |
| `team/page.tsx` | Team wrapper | 5 LOC; clean | clean |

## COVERAGE LEDGER

- projects/: 60 files listed above (18 under `[id]/` incl. 3 re-exports + error; 42 top-level incl. `team/[memberId]`). ✅
- property-management/: 33 files listed above. ✅
- **Total 93 / 93 accounted for.** ✅

Contract-violation files (24): financials, tenants/[id], documents (PM) + 21 project
pages enumerated in C1. Duplicated pairs (4): checklists, punch-lists, site-logs,
procurement. God files >500 LOC: 28. Recharts-static: 3. No `next/dynamic`: 0 uses.
