# Audit 16 — Frontend Pages: Marketing, Auth & Portals

Scope: every `.tsx`/`.ts` under the non-dashboard route groups of `frontend/src/app/`, plus root `layout.tsx` + `globals.css` (note only). Auditor: Senior Staff Engineer. Read-only.

## Scope & Counts

| Area | Files | LOC | Notes |
|---|---|---|---|
| `(marketing)/` | 49 | ~9,800 | 46 pages + 3 layouts. Nearly all `'use client'` + framer-motion. |
| `(auth)/` | 7 | ~3,240 | login/signup/onboarding/invite/forgot/verify/sso. All client. |
| `tenant/` | 10 | ~2,100 | tenant portal (dashboard, maintenance, lease, apply, set-password). |
| `developers/` | 8 | ~1,150 | subscriber API console + shell layout + ctx. |
| `properties/` | 10 | ~1,270 | **server components** (SSR enrichment) + 6 Zone client sub-components. |
| `payment/` | 2 | 1,245 | crypto + invoice, large client pages. |
| `sign/` | 1 | 685 | public e-sign token page. |
| `vendor/` | 1 | 580 | vendor bid token page. |
| `contractor-portal/` | 1 | 676 | **MOCK-DATA placeholder**. |
| `esign/`, `application/`, `data-hub/`, `floor-plan/`, `tenant-login/` | 5 | ~820 | misc. `data-hub` = redirect stub. |
| root `layout.tsx` + `globals.css` | 2 | 236 | force-dynamic global. |
| **TOTAL (audited slice)** | **~86** | **~21,700** | 72 files carry `'use client'`. |

Marketing metadata coverage: **3 of 46 pages** export metadata (only `mobile/*`). 31 marketing pages import `framer-motion`.

## Scores (1–10, higher = better)

| Dimension | Score | Rationale |
|---|---|---|
| Performance | **3** | Root `force-dynamic` kills all static prerender; ~72 client pages; every public marketing/insights page is client-rendered with framer-motion → heavy bundle + blank-until-hydrate. |
| Maintainability | **5** | 5 god files >500 LOC; 5 near-identical service pages + 6 insights list pages copy-pasted; but clear structure, shared `TopNav`/`Footer`. |
| Duplication | **4** | Service pages (5×~460 LOC) and insights list pages (6×~110 LOC) share copy-pasted scaffolding; auth pages repeat hero/split-screen shell. |
| Hardcoded-values | **6** | API-URL contract mostly respected (relative `/api/...`); a handful of `NEXT_PUBLIC_API_URL`/`localhost:4000` fallbacks; only 15 hex colors, 0 arbitrary tailwind color classes; unsplash URLs in 11 files. |
| Security | **6** | No real secrets in client (only placeholder `pmk_your_key` docs); portal gating is client-side + backend-enforced; contractor-portal ships mock data with no client gate. |

## TOP FINDINGS (by priority)

### P0 — `force-dynamic` on root layout defeats static rendering for all 46 marketing pages
`frontend/src/app/layout.tsx:6` — `export const dynamic = 'force-dynamic'`. Comment says "All pages are dynamic (authenticated, real-time data)". This is true for the dashboard, but it is applied at the ROOT, so every public marketing/legal/pricing/insights page is force-rendered per request with no CDN/static caching. Combined with a REMOTE DB, public pages that touch any server data pay full latency on every hit.
**Fix:** Remove `force-dynamic` from the root. Scope it to the `(dashboard)` layout only. Let marketing/legal pages be static/ISR. This is the single highest-leverage perf win for the "extremely slow" complaint on public pages.

### P0 — Public marketing/insights pages are `'use client'` + framer-motion (bundle + SEO)
46 of 46 marketing pages are client components (grep: 44 `'use client'` in `(marketing)`, 31 import framer-motion). Public SEO-facing content (`insights/latest`, `insights/reports`, `research`, `about`, all 5 `services/*`) renders blank until JS hydrates, and ships framer-motion to every visitor.
Evidence: `(marketing)/layout.tsx:1` is itself `'use client'` (uses `usePathname`), forcing the whole subtree client-side. `(marketing)/insights/latest/page.tsx:33` fetches `publicationsApi.getPublished()` in `useEffect` — public content fetched client-side, no SSR, no cache, crawlers see nothing.
**Fix:** Convert marketing layout to a server component (move the pathname branch into a tiny client wrapper or per-route layouts). Render static marketing/legal/service pages as server components; isolate animations into small `'use client'` islands. Fetch insights lists server-side with `revalidate`.

### P1 — Missing metadata on 43 of 46 marketing pages (SEO)
Only `(marketing)/mobile/{page,daily-log,expense}` export metadata. Because the pages are `'use client'`, they *cannot* export `metadata`, so every public page falls back to the generic root title `PROPMETRIK - Real Estate Analytics & Valuations`. All service, insights, pricing, about, legal pages have no unique title/description/OG tags.
**Fix:** Follows from P0 — once pages are server components, add per-page `metadata`/`generateMetadata`.

### P1 — Hardcoded API-URL contract violations
Per MEMORY `api-proxy-v1-contract`, client code must call relative `/api/<resource>` and never prefix `NEXT_PUBLIC_API_URL` or hand-write `/api/v1`. Violations:
- `contractor-portal/page.tsx:443` — `fetch('/api/v1/projects/punch-lists/${itemId}/complete')` — manual `/api/v1`.
- `tenant/page.tsx:21` — `fetch('/api/v1/pm/properties?limit=5')` — manual `/api/v1`.
- `esign/page.tsx:59` — `fetch('/api/v1/esign/envelopes?limit=10')` — manual `/api/v1`.
- `vendor/bid/[token]/page.tsx:6` — `const API = process.env.NEXT_PUBLIC_API_URL || ''`.
- `sign/[token]/page.tsx:73` — `API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1"`.
- `payment/crypto/page.tsx:77` & `payment/invoice/page.tsx:55` — same `localhost:4000/api/v1` fallback.
- `tenant-login/page.tsx:79-82` — `NEXT_PUBLIC_API_URL || 'http://localhost:4000'` + manual `/api/v1/...`.
- `properties/page.tsx:37` & `properties/[id]/page.tsx:17` — `NEXT_PUBLIC_INTERNAL_API_URL || 'http://localhost:4000'` — **acceptable** (server-side SSR fetch, documented internal pattern), listed for completeness.
**Fix:** Route the client cases through the `/api/*` proxy rewrite; drop `NEXT_PUBLIC_API_URL` prefixes and manual `/api/v1`.

### P1 — `contractor-portal/page.tsx` is a mock-data placeholder with no client gate
`contractor-portal/page.tsx:300-429` builds `mockData` and calls `setData(mockData)` — the entire dashboard is hardcoded sample data (project names, dollar amounts). Line 443 then fires a real `/api/v1` mutation. No `useSession`/redirect gate on the client. This is a demo/dead page shipped to prod.
**Fix:** Either wire it to a real endpoint + add auth gating, or remove it from routing. High confidence it is unfinished.

### P2 — Duplicated marketing scaffolding
- 5 service pages `services/{valuation,property-management,project-management,market-intelligence,deal-management}/page.tsx` are 453–491 LOC each with near-identical hero/feature/CTA scaffolding + unsplash hero (2 each).
- 6 insights list pages `insights/{latest,reports,policy-papers,special-reports,marketbeat,podcasts-video}` (95–135 LOC) share the same search + tab + card-grid pattern.
**Fix:** Extract a `ServicePageLayout` and an `InsightsListPage` component; drive from data config.

### P2 — External unsplash image URLs in production marketing + auth
11 files reference `unsplash`: `about`, all 5 `services/*` (2 each), and 5 auth pages (`login`, `login/sso`, `signup`, `forgot-password`, `accept-invite`). Production hero/background images loaded from a third-party CDN (availability, privacy, no `next/image` optimization — only 1 marketing file uses `next/image`, `blog` uses raw `<img>`).
**Fix:** Self-host hero assets under `/public`, serve via `next/image`.

### P2 — Tenant dashboard fetch waterfall
`tenant/dashboard/page.tsx:33-45` awaits `getTenantProfile()` first, then a `Promise.all([getPaymentSummary, getMaintenanceRequests])`. The second batch is correctly parallelized but is serialized behind the profile fetch (needs `activeTenancy.id`). Against a remote DB each hop is a full round-trip. Acceptable given the dependency, but a combined backend endpoint (`/tenant-portal/dashboard`) would collapse 3 round-trips to 1.

## GOD-FILE TABLE (>500 LOC)

| File | LOC | Assessment |
|---|---|---|
| `(auth)/signup/page.tsx` | 939 | Multi-step signup wizard + framer-motion + plan selection. Split steps into components. |
| `(marketing)/apply/[token]/page.tsx` | 686 | Public application form + property display. Extract `ApplicationForm`. |
| `sign/[token]/page.tsx` | 685 | Public e-sign flow (canvas, field placement). Large but cohesive; extract signing canvas. |
| `contractor-portal/page.tsx` | 676 | **Mock placeholder** — see P1. |
| `(marketing)/api/page.tsx` | 648 | API docs page w/ code samples. Content-heavy; could be MDX. |
| `payment/crypto/page.tsx` | 637 | Crypto payment (coin search, polling). Cohesive but large. |
| `payment/invoice/page.tsx` | 608 | Invoice payment. Shares patterns w/ crypto page — extract shared payment shell. |
| `(auth)/onboarding/page.tsx` | 588 | Onboarding wizard. |
| `vendor/bid/[token]/page.tsx` | 580 | Vendor bid submission. |
| `(auth)/login/page.tsx` | 579 | Login + SSO + Google + split hero. |
| `(auth)/accept-invite/page.tsx` | 568 | Invite acceptance. |
| `(marketing)/pricing/page.tsx` | 512 | Client-side, fetches `/api/subscriptions/plans` in useEffect — could be server-rendered. |

## FILE-BY-FILE / COVERAGE LEDGER (all files)

Legend: C=client, S=server, FM=framer-motion, MD=metadata, ⚠=finding.

### (marketing)
| File | LOC | C/S | Notes |
|---|---|---|---|
| layout.tsx | 27 | C | ⚠ P0 client layout forces subtree client. usePathname branch. |
| page.tsx (home) | ~ | C | FM hero. |
| about/page.tsx | 218 | C | FM, 1 unsplash. |
| pricing/page.tsx | 512 | C | ⚠ fetches plans in useEffect; god-file. |
| services/valuation | 483 | C | FM, 2 unsplash. ⚠ dup scaffolding. |
| services/property-management | 455 | C | FM, 2 unsplash. dup. |
| services/project-management | 491 | C | FM, 2 unsplash. dup. |
| services/market-intelligence | 453 | C | FM, 2 unsplash. dup. |
| services/deal-management | 453 | C | FM, 2 unsplash. dup. |
| services/page.tsx | ~ | C | FM. |
| insights/page.tsx | ~ | C | FM list. |
| insights/latest | 128 | C | ⚠ client fetch publicationsApi. dup. |
| insights/reports | 133 | C | dup list pattern. |
| insights/policy-papers | 95 | C | dup. |
| insights/special-reports | 95 | C | dup. |
| insights/marketbeat | 125 | C | dup. |
| insights/podcasts-video | 135 | C | dup. |
| insights/indices | ~ | C | client fetch. |
| insights/snapshot | ~ | C | list. |
| insights/outlook | ~ | C | list. |
| insights/[slug] | 486 | C | client fetch article by slug (SEO risk). |
| resources/page.tsx | 186 | C | FM. |
| resources/[slug] | 347 | C | FM. |
| research/page.tsx | 167 | C | ⚠ client fetch. |
| marketplace/page.tsx | 402 | C | client fetch `/api/marketplace/search` + analytics track (relative — OK). Own TopNav. |
| marketplace/layout.tsx | ~ | S | forced-light shell. |
| apply/[token]/page.tsx | 686 | C | god-file, public form. |
| apply/[token]/success | ~ | C | — |
| apply/layout.tsx | ~ | ? | own nav shell (2nd portal shell vs TopNav). |
| api/page.tsx | 648 | C | god-file API docs; placeholder `pmk_your_key` only. |
| blog/page.tsx | 222 | C | FM, raw `<img>`. |
| careers/page.tsx | ~ | C | FM. |
| contact/page.tsx | ~ | C | FM. |
| faq/page.tsx | 275 | C | FM. |
| investors/page.tsx | 209 | C | FM. |
| press/page.tsx | 343 | C | FM. |
| press/{releases,media,media-kit,journalists,commentary} | ~ | C | FM list pages, dup. |
| mobile/page.tsx | ~ | S | ✓ MD. |
| mobile/daily-log | ~ | S | ✓ MD. |
| mobile/expense | ~ | S | ✓ MD. |
| terms | 231 | C | FM legal. |
| privacy | 236 | C | FM legal. |
| dpa | 257 | C | FM legal. |
| cookies | 216 | C | FM legal. |
| acceptable-use | 167 | C | FM legal. |

### (auth)
| File | LOC | C/S | Notes |
|---|---|---|---|
| login/page.tsx | 579 | C | FM, unsplash, god-file. useEffect = error-code mapping only (not redundant session). |
| login/sso/page.tsx | 369 | C | FM, unsplash. |
| signup/page.tsx | 939 | C | ⚠ god-file wizard; `Bearer ${token}` (own reset token — OK). |
| onboarding/page.tsx | 588 | C | FM wizard, god-file. |
| accept-invite/page.tsx | 568 | C | FM, unsplash; `/api/valuation-org/invitations/...` relative — OK. |
| forgot-password/page.tsx | 158 | C | FM, unsplash. |
| verify-email/page.tsx | ~ | C | relative `/api/auth/verify-email` — OK. |

### tenant / tenant-login
| File | LOC | C/S | Notes |
|---|---|---|---|
| tenant/page.tsx | 108 | C | ⚠ `/api/v1/pm/properties` manual v1. |
| tenant/dashboard/page.tsx | 304 | C | ⚠ fetch waterfall; getSessionToken gate. |
| tenant/maintenance/page.tsx | 264 | C | list. |
| tenant/maintenance/new/page.tsx | 385 | C | form, unsplash. |
| tenant/maintenance/[id]/page.tsx | 384 | C | detail. |
| tenant/lease/[id]/page.tsx | 220 | C | — |
| tenant/apply/[id]/page.tsx | ~ | C | public apply. |
| tenant/apply/[id]/success | ~ | C | — |
| tenant/application/[id]/status | 149 | C | tracker. |
| tenant/set-password/page.tsx | 243 | C | unsplash. |
| tenant-login/page.tsx | 178 | C | ⚠ `NEXT_PUBLIC_API_URL||localhost:4000` + manual `/api/v1`. useSession. |

### developers
| File | LOC | C/S | Notes |
|---|---|---|---|
| layout.tsx | 200 | C | console shell; client-side entitlement gate (backend-enforced). |
| ctx.tsx | ~ | C | context. |
| _components.tsx | ~ | C | shared UI. |
| page.tsx | ~ | C | overview; `ANALYTICS_API_BASE_URL` in curl sample (docs). |
| keys/page.tsx | 235 | C | API-key mgmt; one-time secret reveal (correct handling). |
| usage/page.tsx | 170 | C | 3 hex colors (chart). |
| plan/page.tsx | ~ | C | plan. |
| stream/page.tsx | 175 | C | WS console; `apiKey` is user-entered input (not a leaked secret). |

### properties (SSR — good pattern)
| File | LOC | C/S | Notes |
|---|---|---|---|
| page.tsx (list) | 240 | S | ✓ server fetch; `NEXT_PUBLIC_INTERNAL_API_URL||localhost:4000` (server-side OK). |
| [id]/page.tsx | 126 | S | ✓ server SSR enrichment; force-dynamic + no-store. |
| [id]/_components/Zone{Hero,Facts,Map,Nearby,Comparables,Valuation}.tsx | 130–272 | C | client islands. Good server/client split. |
| [id]/loading.tsx, error.tsx | ~ | S/C | proper loading + error boundaries ✓. |

### payment / sign / vendor / esign / application / data-hub / floor-plan
| File | LOC | C/S | Notes |
|---|---|---|---|
| payment/crypto/page.tsx | 637 | C | ⚠ god-file; `localhost:4000/api/v1` fallback. |
| payment/invoice/page.tsx | 608 | C | ⚠ god-file; `localhost:4000/api/v1` fallback; dup payment shell. |
| sign/[token]/page.tsx | 685 | C | ⚠ god-file; `localhost:4000/api/v1` fallback. Public token page. |
| vendor/bid/[token]/page.tsx | 580 | C | ⚠ god-file; `NEXT_PUBLIC_API_URL||''`. |
| esign/page.tsx | 239 | C | ⚠ `/api/v1/esign/envelopes` manual v1. |
| application/[id]/status/page.tsx | 238 | C | public status tracker. |
| contractor-portal/page.tsx | 676 | C | ⚠ MOCK DATA placeholder + `/api/v1` mutation; no client gate. |
| data-hub/page.tsx | 5 | S | redirect stub → /dashboard/admin/data-hub. Fine. |
| floor-plan/page.tsx | 147 | C | Konva builder; standalone. |

### root
| File | LOC | Notes |
|---|---|---|
| layout.tsx | 60 | ⚠ P0 `dynamic='force-dynamic'` at root. Good metadata/viewport otherwise. |
| globals.css | 176 | Note only — token/theme base; no findings in scope. |

## Coverage confirmation
All ~86 files in scope have a ledger row above. High-read: root layout, marketing layout, properties SSR, contractor-portal, tenant dashboard, developers shell, login, insights/latest. Skim+grep: legal/press/service marketing pages, payment/sign/vendor bodies.
