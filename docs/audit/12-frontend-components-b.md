# Audit 12 — Frontend Components (Part B)

**Auditor scope:** `frontend/src/components/` — ui/, marketing/ (incl. motion/, mobile/, notifications/), layout/, workspace/, tenant/, data-hub/, dashboard/, marketplace/, pwa/, plus loose root files and all subdirs not covered by the Part A auditor (admin/, analytics/, calendar/, deals/, forms/, property-management/, providers/, publications/, team/).
**Skipped (covered by Part A):** projects/, crm/, valuation/, reports/, esign/, realtime/.
**Date:** 2026-07-02 · **Method:** full file read + import-graph grep (dead-code verification) + per-dir color/interval/img scans. No source modified.

## Scope & Counts

| Dir | Files | LOC | Dir | Files | LOC |
|---|---|---|---|---|---|
| ui/ | 32 | 3,139 | admin/ | 1 | 83 |
| marketing/ (incl motion/mobile/notifications) | 34 | 5,818 | analytics/ | 3 | 409 |
| layout/ | 11 | 2,079 | calendar/ | 3 | 923 |
| workspace/ | 10 | 2,635 | deals/ | 2 | 773 |
| tenant/ | 6 | 2,069 | forms/ | 1 | 1,495 |
| data-hub/ | 6 | 2,039 | property-management/ | 2 | 1,185 |
| dashboard/ | 5 | 1,595 | providers/ | 1 | 16 |
| marketplace/ | 3 | 613 | publications/ | 1 | 283 |
| pwa/ | 2 | 305 | team/ | 1 | 815 |
| root loose (providers.tsx, UpgradeGate.tsx, ApplicationForm.tsx) | 3 | 606 | | | |

**Total: 127 files, ~26,880 LOC.**

## Domain Scores (1–10)

| Dimension | Score | Rationale |
|---|---|---|
| Duplication | **5** | 2 TopNavs w/ triplicated theme toggle; Sparkline ×2; MetricCard ×2; OfflineIndicator ×2; hand-rolled dropdowns beside ui/dropdown-menu; 11 hand-rolled SVG icons beside lucide |
| Hardcoded values / theming | **4** | ~88 zinc + ~112 hex occurrences in scope while a theming migration is officially in progress; ui/select.tsx forces dark via inline hex; 6 Unsplash URLs in prod marketing |
| Dead code | **4** | 14 confirmed-dead files ≈ 2,120 LOC (~8% of domain), incl. a whole booking flow (ViewingScheduler 389) and push-notification manager (367) |
| Performance | **6** | All 17 setIntervals correctly cleaned; but 23 framer-motion marketing files with unguarded infinite loops, unmemoized ui/terminal primitives on keystroke-hot valuation pages, 9 raw `<img>`, wagmi loaded eagerly for all tenant pages |
| layout/ complexity | **5** | TopNav.tsx 753 LOC / ~7 responsibilities; Header.tsx ships fake UI; Sidebar.tsx is dead |
| PWA correctness | **8** | Provider logic sound (prod-only SW, dev cache purge, full listener cleanup); one dead export (InstallPrompt) |
| **Overall** | **5.5** | Functionally healthy, hygiene debt concentrated in theming, dead marketing visuals, and 4 god components |

---

## TOP FINDINGS (by priority)

### P1 — ui/select.tsx hard-forces dark colors via inline styles, sabotaging the theming migration
`ui/select.tsx:82` — `style={{ backgroundColor: '#27272a', color: '#ffffff' }}` on `SelectContent`; `:121` `hover:bg-zinc-700 focus:bg-zinc-700`; `:124–133` four more `style={{ color: '#ffffff' }}` wrappers inside `SelectItem`. Inline styles beat any Tailwind token, so **every Select dropdown app-wide renders dark-on-dark in light mode**. This is a shared primitive (dozens of consumers), making it the single highest-leverage theming fix in the codebase.
**Fix:** replace with `bg-popover text-popover-foreground` / `focus:bg-accent` (stock shadcn), delete all inline `style` props.

### P2 — GlobalSearch + 2 data-hub panels violate the documented API-proxy contract
`layout/GlobalSearch.tsx:40` `const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'` then `:126–130` five fetches to `${API_BASE}/v1/projects...`. Per the project's API-Proxy-v1 contract (next.config rewrites `/api/*` → backend `/api/v1/*`, client must call `/api/<resource>` and never prefix `NEXT_PUBLIC_API_URL` or `/v1`), these paths double-insert `v1` (or bypass the proxy entirely when the env var is set). Same pattern: `data-hub/FileUploadModal.tsx:40` and `data-hub/DataIngestionPanel.tsx:28`, both defaulting to `http://localhost:4000/api/v1` — guaranteed broken in a production browser if env unset. GlobalSearch is mounted globally (`app/dashboard/layout.tsx:110`), so Cmd+K search results are likely silently empty in prod (all failures swallowed by `catch { return [] }` at `:122`).
**Fix:** call `authedFetch('/api/projects?...')` etc.; delete the API_BASE constants.

### P3 — ~2,120 LOC of confirmed-dead components (14 files), several still costing mental/bundle overhead
Verified by exhaustive import grep across `frontend/src` (incl. barrels + `dynamic()` imports):
- `layout/Sidebar.tsx` (196) — exported from `layout/index.ts:1` but zero importers; superseded by `DataHubTopNav` (`app/dashboard/admin/data-hub/layout.tsx:2`).
- `workspace/window-manager/InsightWindow.tsx` (146) — never imported **and** functionally orphaned: `workspace/MessageList.tsx:115` calls `openWindow({type:'insight'...})` into `windowManagerStore`, but `FloatingWindowManager.tsx:90` only reads `panel`/`closePanel` — nothing ever renders `windows`. Clicking a Kobby insight silently does nothing. Either wire InsightWindow into FloatingWindowManager or remove both the component and the `openWindow` call.
- `marketing/motion/`: DataStreamVisual (109), TestimonialCarousel (170), StatsCounter (73), PropertyShowcase (89, contains an Unsplash URL), ProjectPhaseVisual (169) — orphaned after marketing-page rewrites.
- `marketing/FeatureGrid.tsx` (71), `marketing/GenericPage.tsx` (12), `marketing/notifications/PushNotificationManager.tsx` (367).
- `dashboard/projects/MilestoneTimeline.tsx` (300) — Gantt + Subphases won; Timeline orphaned.
- `calendar/ViewingScheduler.tsx` (389) + `calendar/index.ts` (7, barrel exports only unused symbols).
- `providers/session-provider.tsx` (16) — superseded by StableSessionProvider in root `components/providers.tsx`.
- PWA `InstallPrompt` (see P7).
**Fix:** delete in one sweep; all are high-confidence (zero references, verified barrel-aware).

### P4 — Marketing framer-motion: infinite animations without viewport guards (main-thread cost) + 6 Unsplash URLs + raw `<img>` in prod
23 of 34 marketing files import framer-motion (~40 KB gz baseline in the marketing bundle). Worst main-thread offenders run `repeat: Infinity` with **no `whileInView`/viewport gate**, animating while scrolled offscreen:
- `marketing/HeroSection.tsx:13–20` — 20s scale+rotate loop on the hero background; the background itself is an Unsplash URL at `:22`.
- `marketing/motion/PremiumCTASection.tsx:32–40, 109–120` — 20s background-scale + 4s blur loops, no guard; Unsplash default at `:26`, raw `<img>` at `:43`. Mounted on 4+ pages (about, resources, both service pages).
- `marketing/motion/AnalyticsVisual.tsx:28,38,55,62,74` — 4–5 concurrent infinite loops.
- `marketing/motion/ProjectLifecycleSection.tsx` (401) — 5 Unsplash URLs (`:17,62,106,151,197`) rendered via raw `<img>` (`LifecycleStageCard.tsx:94`), plus `useScroll` scroll-linked transforms (`:259–265`).
Production marketing imagery on unsplash.com = external dependency, no `next/image` optimization, licensing ambiguity. All 17 `setInterval`s in marketing/ have correct cleanup (verified) — the problem is animation loops, not leaks.
**Fix:** add `whileInView`/`useInView` gating to the infinite loops (or `useReducedMotion`); move hero/CTA/lifecycle images to `/public` + `next/image`.

### P5 — ui/terminal.tsx: 1,061-LOC god-file, 20 exports, 0 memoization, 40 importers on keystroke-hot pages
`ui/terminal.tsx` exports TerminalPanel, Metric, StatusBadge, PriorityBadge, ConfidenceBar, DataTable, Sparkline, StepIndicator, Currency, AlertBanner, KeyboardShortcut, FilterTabs, PropertyTypeBadge, MethodBadge, DataMetricCard, TierBadge, LiveDataFeed, DataQualityIndicator, AnalyticsChart (lines 37–1034). 40 importers — every valuation wizard page + all data-hub pages. None use `React.memo`; `Sparkline` recomputes SVG path math per render (`:378–395`). Valuation method pages re-render on every input keystroke, cascading through these. Internal duplicates: `Sparkline` (`:368`) duplicates `analytics/Sparkline.tsx`; `DataMetricCard` (`:757`) duplicates `layout/MetricCard.tsx`; `DataTable` (`:278`) overlaps `ui/table.tsx`.
**Fix:** split into 4–5 files under `ui/terminal/` (re-export barrel preserves the 40 import sites), `memo()` the leaf display components, consolidate Sparkline to one implementation.

### P6 — Two TopNavs + triplicated theme/nav logic; layout/TopNav.tsx is a 753-LOC god component
- `layout/TopNav.tsx` (753, app shell): Clock (`:29–56`, 1s interval — correctly isolated so it doesn't re-render the nav), UserMenu w/ hand-rolled outside-click dropdown (`:63–252`), ThemeMenuItem (`:284–316`), **11 hand-rolled inline SVG icons** (`:321–371`) despite lucide-react being used one file over, RBAC nav filtering (`:433–439`), global F-key shortcuts (`:442–457`), ticker fetch every 60s (`:402–415`), mobile drawer (`:591–697`), ticker bar (`:700–750`).
- `marketing/TopNav.tsx` (278): its own theme toggle (`:141–165`, lucide icons), scroll-shrink via framer-motion (`:27–29`), embeds `MarketTicker` (`:77`) which independently fetches the **same `/api/ticker` every 60s** (`MarketTicker.tsx:56–66`).
No runtime double-polling (different route groups, one mount each) but the ticker fetch/refresh logic, 3-way theme toggle, and mobile-hamburger pattern are each written twice (theme toggle UI three times counting the marketing pill vs dashboard segmented control).
Minor perf nit: `visibleNavigation` is a fresh array each render and is a dep of the F-key effect (`:457`) → `keydown` listener re-subscribed on every TopNav render.
**Fix:** extract `useTicker()` hook (shared fetch/interval/typing), shared `<ThemeToggle variant>` component, replace inline SVGs with lucide, move UserMenu onto `ui/dropdown-menu.tsx`; target ≤250 LOC for layout/TopNav.

### P7 — PWA: provider correct; `InstallPrompt` confirmed dead export
`pwa/PWAProvider.tsx` is correct: SW registered prod-only (`:104`), dev mode unregisters workers + purges caches (`:83–102`), all window listeners cleaned (`:130–135`), push subscribe flow uses `authedFetch` properly (`:174–188`). `InstallPrompt` (`PWAProvider.tsx:264–304`) is exported via `pwa/index.ts:1` but mounted nowhere — `components/providers.tsx:8` imports only `PWAProvider, OfflineIndicator`. **Classification: dead export / removal remnant** — the component itself is functional; either remount it (its `beforeinstallprompt` plumbing still works) or delete the component + export. Also note `OfflineIndicator` is duplicated: pwa version (`PWAProvider.tsx:233`, live) vs `marketing/mobile/MobileDashboard.tsx:465` (referenced only by its own test).

### P8 — Real field-app features living under `marketing/mobile/`
`DailyLogCapture.tsx` (675), `ExpenseCapture.tsx` (613), `MobileDashboard.tsx` (490) are production features — `authedFetch` API calls, offline-sync (`saveDailyLogOffline`), MediaRecorder voice notes, GPS, camera receipt capture — mounted on public marketing routes (`app/(marketing)/mobile/page.tsx:1`, `/expense`, `/daily-log`). Authenticated project tooling under the `(marketing)` route group is a mis-homing: wrong bundle, wrong layout chrome, and it bypasses the dashboard auth layout.
**Fix:** relocate to `components/mobile/` + `app/dashboard/mobile/` routes (or a dedicated route group with auth).

### P9 — God components (non-layout)
- `forms/ComprehensivePropertyForm.tsx` (1,495): valuation dates + RICS VPS3 validation + property specs + risk matrix + client picker + 2 AI-draft flows in one component. Split into ≥5 sections (note the documented single-onChange batching gotcha when splitting).
- `property-management/PaymentSettings.tsx` (1,155): 20 useState/7 useEffect; bank + MoMo + crypto + settlement in one file. Split by tab.
- `data-hub/PullIntegrationsPanel.tsx` (994): endpoints+jobs+schedules+190-LOC auth-method switch; 3 polling queries (30s/10s) — split into tabs, extract `AuthMethodFields`.
- `team/ServiceTeamManager.tsx` (815): members/invitations/privileges tabs in one file; 18 zinc refs.
- `workspace/WorkspaceContent.tsx` (678): 26 useState / 12 useEffect; passes freshly-filtered arrays to MessageList each render (`:563–576`) defeating child memoization.

### P10 — Hardcoded color debt (quantified per dir) amid the active theming migration
zinc-class occurrences: workspace 21, team 18, marketing 12, dashboard 11, layout 8, ui 6, deals 5, pm 3, forms 2, pwa 2 (≈88).
Hex literals: marketing 38, dashboard 29 (MilestoneGantt.tsx:38–45, 262–266, 303–307), publications 24 (PublicationChart.tsx:39–58, 76–90), analytics 9 (RegionalHeatmap/MigrationFlowMatrix:145–194), ui 7, pm 3, tenant 2 (≈112). Chart/SVG components (Gantt, PublicationChart, heatmaps) are the biggest single offenders — recharts/SVG fills can read CSS vars (`hsl(var(--chart-1))`).
Magic z-indexes with no scale: `layout/TopNav.tsx:150,241` `z-[60]`; `workspace/WorkspacePanel.tsx:29` `z-[60]`; `workspace/window-manager/FloatingWindowManager.tsx:186,196` `z-[200]`/`z-[201]`.
i18n: no provider exists (`next-intl`/`i18next` absent) → hardcoded copy is N/A as a finding.

### P11 — Misc correctness/perf
- `layout/Header.tsx:57–65` ships a **fake hardcoded notification badge "3"**, a non-functional search input (`:38`, no state/handler), and a decorative "Connected" dot — rendered on 4 real data-hub admin pages. Remove or wire up.
- `tenant/Web3Provider.tsx` wraps the whole tenant layout (`app/dashboard/tenant/layout.tsx:9`) so wagmi/viem load eagerly on every tenant page, even though the only consumer (`CryptoPaymentFlow`) is already behind `dynamic(..., {ssr:false})` (`app/dashboard/tenant/payments/page.tsx:24`). Move the provider into the payments page.
- Raw `<img>` instead of `next/image` in 9 files; hottest: `marketplace/PropertyCard.tsx:42` (grid list, unmemoized), `marketing/motion/LifecycleStageCard.tsx:94` (1600px Unsplash), `PremiumCTASection.tsx:43`.
- `workspace/hooks/useWorkspaceSocket.ts`: sound — exponential backoff capped 30s (`:175`), heartbeat 25s cleaned (`:100–104,174`), replay-on-reconnect; only nit is unbounded retry count (fine for a chat widget) and a 10-dep `connect` callback (`:183`).
- Two ApplicationForms with the identical default-export name: root `components/ApplicationForm.tsx` (200, marketing enquiry, `/apply/[token]`) vs `tenant/ApplicationForm.tsx` (522, full tenancy application, `/tenant/apply/[id]`). Different workflows — not a dupe — but rename one (`PropertyEnquiryForm`) to stop grep/import confusion.
- All 17 `setInterval` usages in scope verified to have cleanup; layout/TopNav 60s ticker + NotificationDropdown 30s poll (SSE-supplemented, `NotificationDropdown.tsx:76,82`) are single-mount — no duplicate-interval bug found.

---

## FILE-BY-FILE

Legend: ✅ clean · ⚠️ issues · 🔴 significant · 💀 dead (unreferenced, verified)

### ui/ (32)
| File | LOC | Verdict / evidence |
|---|---|---|
| accordion.tsx | 58 | ✅ standard shadcn |
| alert-dialog.tsx | 141 | ✅ standard shadcn |
| alert.tsx | 65 | ⚠️ `text-zinc-100` hardcoded (:13) |
| avatar.tsx | 50 | ✅ standard shadcn |
| badge.tsx | 41 | ✅ CVA variants |
| button.tsx | 55 | ✅ CVA variants |
| card.tsx | 78 | ✅ standard shadcn |
| checkbox.tsx | 30 | ⚠️ checked state hardcoded amber-500 (:16) instead of `primary` |
| collapsible.tsx | 13 | ✅ wrapper |
| command.tsx | 149 | ✅ cmdk standard |
| date-field.tsx | 143 | ✅ custom Ghana dd/mm/yyyy field; masking+validation sound (known-good) |
| dialog.tsx | 121 | ✅ standard shadcn |
| dropdown-menu.tsx | 200 | ✅ standard shadcn — note layout/TopNav & NotificationDropdown hand-roll dropdowns instead of using it |
| form-errors.tsx | 54 | ⚠️ custom; hardcoded red-600/red-400 (:21,44,49), no `destructive` token |
| input.tsx | 24 | ✅ standard shadcn |
| label.tsx | 26 | ✅ standard shadcn |
| pagination-controls.tsx | 54 | ✅ custom, clean |
| popover.tsx | 33 | ⚠️ `text-zinc-50` (:24) |
| progress.tsx | 32 | ✅ standard shadcn |
| scroll-area.tsx | 47 | ✅ standard shadcn |
| select.tsx | 163 | 🔴 inline `#27272a`/`#ffffff` styles + `bg-zinc-700` (:82,121,124–133) force dark dropdowns in light theme — see P1 |
| separator.tsx | 31 | ✅ |
| sheet.tsx | 140 | ✅ |
| skeleton.tsx | 15 | ✅ |
| slider.tsx | 28 | ✅ |
| switch.tsx | 29 | ✅ |
| table.tsx | 116 | ✅ (overlapped by terminal.tsx DataTable — see P5) |
| tabs.tsx | 54 | ✅ |
| terminal.tsx | 1,061 | 🔴 20-export god-file, 0 memoization, 40 importers, internal dupes (Sparkline :368, DataMetricCard :757, DataTable :278), hex `#f59e0b` default (:372) — see P5 |
| textarea.tsx | 24 | ✅ |
| tooltip.tsx | 29 | ✅ |
| use-toast.ts | 35 | ⚠️ stub — console.log fallback when context missing (:25–33); no Toaster component exists in ui/ |

### marketing/ (34)
| File | LOC | Verdict / evidence |
|---|---|---|
| FeatureGrid.tsx | 71 | 💀 never imported; motion usage was correct (whileInView once :49) |
| Footer.tsx | 102 | ✅ token-driven, no motion |
| GenericPage.tsx | 12 | 💀 "coming soon" placeholder, unused |
| HeroSection.tsx | 75 | 🔴 Unsplash bg (:22); 20s infinite scale/rotate no viewport guard (:13–20) — P4 |
| MarketTicker.tsx | 90 | ✅ public /api/ticker 60s w/ cleanup (:56–66); CSS marquee not framer; respects reduced-motion (:85) |
| PublicationTypeFeedPage.tsx | 92 | ✅ |
| ServicesFooter.tsx | 111 | ✅ whileInView+once (:51,77); lazy visuals scaled 0.55× |
| StatsSection.tsx | 41 | ✅ whileInView+once (:23) |
| TopNav.tsx | 278 | ⚠️ second TopNav; own theme toggle (:141–165) duplicating layout/TopNav ThemeMenuItem; framer for scroll-shrink (:27) — P6 |
| motion/AnalyticsVisual.tsx | 85 | 🔴 4–5 concurrent `repeat:Infinity` loops, no viewport (:28,38,55,62,74) |
| motion/DashboardDemo.tsx | 112 | ⚠️ 4s tab interval cleaned (:12–14); bars whileInView+once (:84) |
| motion/DataStreamVisual.tsx | 109 | 💀 unused; 20 path + 8 dot infinite animations (:19–34,55–74) |
| motion/DealWorkflow.tsx | 53 | ⚠️ hex `#3f3f46`,`#f59e0b` (:19); infinite loop but parent-scaled |
| motion/GhanaMapVisual.tsx | 127 | ✅ 2s interval cleaned (:26–29); conditional pulse; SVG hex `#f97316`,`#facc15` (:54–55,72) minor |
| motion/LifecycleLeftColumn.tsx | 123 | ✅ whileInView+once throughout (:24,56,69,78,88) |
| motion/LifecycleProgressNav.tsx | 135 | ⚠️ hex `#f59e0b #d97706 #27272a #3f3f46` (:55–76,91,110); state-driven, no loops |
| motion/LifecycleStageCard.tsx | 192 | ⚠️ raw `<img>` (:94) serving 1600px Unsplash; inline rgba styles (:112–113,136–138) |
| motion/MaintenanceTrackerVisual.tsx | 118 | ✅ interval cleaned (:32–35); AnimatePresence exits proper (:101) |
| motion/MarketTrendsVisual.tsx | 90 | ⚠️ infinite hotspot loops (:42,57,66) — staggered, parent-scoped |
| motion/PremiumCTASection.tsx | 124 | 🔴 Unsplash (:26) + raw `<img>` (:43); 20s + 4s infinite loops no viewport (:32–40,109–120); mounted on 4+ pages — P4 |
| motion/ProcessTimeline.tsx | 100 | ✅ whileInView+once (:48–50,85–86) |
| motion/ProjectDashboardVisual.tsx | 151 | ⚠️ 2 intervals cleaned (:42–45,51–56); pulse ring Infinity no viewport (:143–147) |
| motion/ProjectLifecycleSection.tsx | 401 | 🔴 5 Unsplash URLs (:17,62,106,151,197); useScroll transforms (:259–265); 4s auto-advance cleaned (:279–282); heaviest marketing component |
| motion/ProjectPhaseVisual.tsx | 169 | 💀 unused; 3+ infinite loops (:71,157–166) |
| motion/PropertyPortfolioVisual.tsx | 128 | ✅ conditional animation (:68), interval cleaned (:26–29) |
| motion/PropertyShowcase.tsx | 89 | 💀 unused; Unsplash (:15); 2 infinite loops (:36,79) |
| motion/StatsCounter.tsx | 73 | 💀 unused; (was well-built: IntersectionObserver :38) |
| motion/TestimonialCarousel.tsx | 170 | 💀 unused; interval was cleaned (:51–54) |
| motion/ValuationScanner.tsx | 55 | ⚠️ 5+ infinite loops (:14–48) mitigated by 0.55× parent scale |
| mobile/DailyLogCapture.tsx | 675 | 🔴 real product feature under marketing/ (offline sync, MediaRecorder, GPS, authedFetch); raw `<img>` (:569) — P8 |
| mobile/ExpenseCapture.tsx | 613 | 🔴 same mis-homing; camera receipts, 4 currencies; raw `<img>` (:381) — P8 |
| mobile/MobileDashboard.tsx | 490 | 🔴 same mis-homing; also defines a second `OfflineIndicator` (:465) duplicating pwa's — P7/P8 |
| mobile/__tests__/MobileDashboard.test.tsx | 214 | ✅ 14 solid test cases |
| notifications/PushNotificationManager.tsx | 367 | 💀 unused; functional pref UI + NotificationPromptBanner never mounted |

### layout/ (11)
| File | LOC | Verdict / evidence |
|---|---|---|
| TopNav.tsx | 753 | 🔴 god component: Clock/UserMenu/theme/11 inline SVG icons/RBAC filter/F-keys/ticker/mobile drawer; ticker fetch 60s cleaned (:402–415); F-key listener re-subscribed every render (visibleNavigation dep :457); `z-[60]` (:150,241); zinc refs (:112,133,548,634) — P6 |
| Sidebar.tsx | 196 | 💀 exported from barrel (index.ts:1), zero importers; DataHubTopNav replaced it — P3 |
| Header.tsx | 75 | 🔴 fake UI in prod: hardcoded badge "3" (:57–65), dead search input (:38), fake "Connected" (:68–71); used by 4 data-hub pages — P11 |
| MetricCard.tsx | 86 | ✅ clean; duplicated in spirit by terminal.tsx DataMetricCard (:757) |
| AdminTopNav.tsx | 218 | ✅ nav config + grouped tabs; token-driven |
| PMTopNav.tsx | 75 | ✅ RBAC-filtered sub-nav, clean |
| DataHubTopNav.tsx | 59 | ✅ clean |
| EnterpriseNav.tsx | 55 | ✅ clean (5 importers) |
| GlobalSearch.tsx | 312 | 🔴 API contract violation: `NEXT_PUBLIC_API_URL`+`/v1/` paths (:40,126–130), errors swallowed (:122) — P2. Otherwise good cmd-K palette (debounce :91, allSettled) |
| NotificationDropdown.tsx | 243 | ⚠️ 30s poll (:76) + SSE (:82) both — acceptable belt-and-braces, cleanup correct; hand-rolled dropdown instead of ui/dropdown-menu; zinc (:26–27,181,194,198) |
| index.ts | 7 | ⚠️ barrel exports dead `Sidebar` |

### workspace/ (10)
| File | LOC | Verdict / evidence |
|---|---|---|
| WorkspaceContent.tsx | 678 | 🔴 god component: 26 useState/12 useEffect; fresh filtered arrays to MessageList per render (:563–576); zinc (:475,535,634,652) — P9 |
| MessageList.tsx | 343 | ⚠️ raw `<img>` for attachments (:228); no virtualization (acceptable at current volumes); MessageBubble memoized; `openWindow` insight call (:115) targets store nothing renders — P3 |
| MessageInput.tsx | 260 | ✅ 3-step presigned upload; 300ms typing throttle (:62); zinc (:225,228) |
| WorkspaceMemberList.tsx | 216 | ⚠️ zinc ×4 (:119,166–167,174); useMemo used well |
| WorkspacePanel.tsx | 110 | ✅ 60s unread cache; `z-[60]` (:29) |
| KobbyAIBubble.tsx | 230 | ✅ memoized export (:39); zinc (:70,89) |
| hooks/useWorkspaceSocket.ts | 257 | ✅ exp backoff capped 30s (:175), 25s heartbeat cleaned (:100–104,174), unmount close (:188); unbounded retries (acceptable); 10-dep connect callback (:183) |
| hooks/useKobbyAI.ts | 150 | ✅ WS-first + REST fallback (:80–118); mount fetch w/ cancellation (:50–67) |
| window-manager/FloatingWindowManager.tsx | 245 | ⚠️ portal panel manager, sound; `z-[200]/z-[201]` (:186,196); renders only `panel`, never `windows` — orphans InsightWindow |
| window-manager/InsightWindow.tsx | 146 | 💀 never imported/rendered; framer drag/resize window — P3 |

### tenant/ (6)
| File | LOC | Verdict / evidence |
|---|---|---|
| PortalShell.tsx | 553 | ⚠️ 30s dual-fetch poll cleaned (:144–145) — batch into one call; 3 separate click-away handlers (:149–163); BOTTOM_NAV duplicates NAV_ITEMS (:61) |
| CryptoPaymentFlow.tsx | 723 | ✅ (dynamic-imported, not dead); 10s NOWPayments poll cleaned (:143–146,228–247); raw `<img>` coin icons from coincap CDN (:88); QRCodeSVG safe |
| Web3Provider.tsx | 16 | ⚠️ eager wagmi/viem at tenant-layout level (`app/dashboard/tenant/layout.tsx:9`) while sole consumer is already dynamic — P11 |
| ApplicationForm.tsx | 522 | ✅ full tenancy application w/ doc upload (:72–94); raw `<img>` preview (:342); name-collides with root ApplicationForm — rename one |
| SignatureCanvas.tsx | 65 | ✅ signature_pad wrapper, resize listener cleaned (:33–34); no overlap with esign/ components |
| SignatureModal.tsx | 189 | ✅ draw/type dual tab; slate hardcodes (:124,133,142,149) — intentional forced-light |

### data-hub/ (6)
| File | LOC | Verdict / evidence |
|---|---|---|
| PullIntegrationsPanel.tsx | 994 | 🔴 god component; 3 polling queries 30s/10s (:429–444); 190-LOC auth-method switch (:206–397) — P9 |
| FileUploadModal.tsx | 393 | 🔴 `NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'` (:40) — P2; upload poll is bounded while-loop (OK) |
| DataIngestionPanel.tsx | 211 | 🔴 same localhost API_BASE (:28) — P2; 10s recent-uploads refetch reasonable |
| RealTimeDataFeed.tsx | 154 | ✅ interval cleaned (:43–57); `scrollbar-thumb-zinc-700` (:112) |
| DataAnalyticsPanel.tsx | 142 | ✅ presentational wrapper |
| DataQualityWidget.tsx | 145 | ✅ semantic colors |

### dashboard/ (5)
| File | LOC | Verdict / evidence |
|---|---|---|
| RealtimeStatus.tsx | 86 | ✅ provider-hook driven, no own polling; `text-zinc-100` (:75) |
| projects/MilestoneGantt.tsx | 498 | ⚠️ 8 hex colors (:38–45,262–266,303–307) + 3 zinc (:83,106,215) in an actively-themed app |
| projects/MilestoneSubphases.tsx | 657 | ⚠️ large but structured (useMemo/useCallback present); zinc (:84,88) |
| projects/MilestoneTimeline.tsx | 300 | 💀 never imported; Gantt+Subphases superseded it — P3 |
| projects/ProjectSubnav.tsx | 55 | ✅ |

### marketplace/ (3)
| File | LOC | Verdict / evidence |
|---|---|---|
| PropertyCard.tsx | 212 | ⚠️ raw `<img>` (:42) in grid hot path, no memo, no next/image — P11 |
| FilterPanel.tsx | 283 | ⚠️ forced-light `text-gray-900/700` headings on `bg-card` (:39,53) — breaks in dark mode if marketplace ever un-forces light; `filters: any` props (:8–9) |
| LocationSearch.tsx | 118 | ✅ debounced (ref-timer cleaned) authedFetch suggestions |

### pwa/ (2)
| File | LOC | Verdict / evidence |
|---|---|---|
| PWAProvider.tsx | 304 | ✅ provider/OfflineIndicator correct (see P7); `InstallPrompt` (:264–304) dead export; zinc (:294) |
| index.ts | 1 | ⚠️ exports dead `InstallPrompt` |

### remaining dirs + root (16)
| File | LOC | Verdict / evidence |
|---|---|---|
| admin/ConfirmModal.tsx | 83 | ✅ confirm-word destructive modal, clean |
| analytics/Sparkline.tsx | 59 | ⚠️ duplicate of terminal.tsx Sparkline (:368) — consolidate (P5) |
| analytics/RegionalHeatmap.tsx | ~200 | ⚠️ hex `#27272a #3f3f46 #f59e0b…` (:145–194) |
| analytics/MigrationFlowMatrix.tsx | ~150 | ⚠️ shares the hex-literal pattern |
| calendar/CalendarView.tsx | 527 | ✅ month/agenda view, useMemo-driven, no polling; sole calendar survivor (imported by projects/schedule) |
| calendar/ViewingScheduler.tsx | 389 | 💀 full booking flow (date→slot→contact), zero importers — P3 |
| calendar/index.ts | 7 | 💀 barrel of unused exports |
| deals/DocumentChecklist.tsx | 409 | ⚠️ zinc refs (:40,52); API-driven checklist (no hardcoded template list) |
| deals/GenerateDocumentDialog.tsx | 364 | ⚠️ zinc (:171,213); template list fetched, OK |
| forms/ComprehensivePropertyForm.tsx | 1,495 | 🔴 god component (5 major sections + 2 AI flows) — P9 |
| property-management/PaymentSettings.tsx | 1,155 | 🔴 god component (20 useState / 7 useEffect; bank+MoMo+crypto+settlement) — P9 |
| property-management/RateStamp.tsx | 30 | ✅ FX rate stamp, clean |
| providers/session-provider.tsx | 16 | 💀 redundant wrapper; root providers.tsx has StableSessionProvider — P3 |
| publications/PublicationChart.tsx | 283 | ⚠️ 24 hex literals (:39–58,76–90) in recharts config — P10 (dynamic-imported, not dead) |
| team/ServiceTeamManager.tsx | 815 | 🔴 god component; 18 zinc refs (ROLE_COLORS map) — P9/P10 |
| providers.tsx (root) | 86 | ✅ provider stack ordered sanely (Session→Query→I18n→Theme→Tooltip→Realtime→PWA) |
| UpgradeGate.tsx (root) | 320 | ✅ tier-gating context+modal, useCallback-optimized |
| ApplicationForm.tsx (root) | 200 | ⚠️ marketing enquiry form; name-collides with tenant/ApplicationForm — rename (P11) |

---

## COVERAGE LEDGER

**Reviewed (127 files):**
- ui/ (32): accordion, alert-dialog, alert, avatar, badge, button, card, checkbox, collapsible, command, date-field, dialog, dropdown-menu, form-errors, input, label, pagination-controls, popover, progress, scroll-area, select, separator, sheet, skeleton, slider, switch, table, tabs, terminal, textarea, tooltip, use-toast
- marketing/ (34): FeatureGrid, Footer, GenericPage, HeroSection, MarketTicker, PublicationTypeFeedPage, ServicesFooter, StatsSection, TopNav; motion/ (20): AnalyticsVisual, DashboardDemo, DataStreamVisual, DealWorkflow, GhanaMapVisual, LifecycleLeftColumn, LifecycleProgressNav, LifecycleStageCard, MaintenanceTrackerVisual, MarketTrendsVisual, PremiumCTASection, ProcessTimeline, ProjectDashboardVisual, ProjectLifecycleSection, ProjectPhaseVisual, PropertyPortfolioVisual, PropertyShowcase, StatsCounter, TestimonialCarousel, ValuationScanner; mobile/ (3+test): DailyLogCapture, ExpenseCapture, MobileDashboard, __tests__/MobileDashboard.test; notifications/PushNotificationManager
- layout/ (11): AdminTopNav, DataHubTopNav, EnterpriseNav, GlobalSearch, Header, MetricCard, NotificationDropdown, PMTopNav, Sidebar, TopNav, index.ts
- workspace/ (10): KobbyAIBubble, MessageInput, MessageList, WorkspaceContent, WorkspaceMemberList, WorkspacePanel, hooks/useKobbyAI, hooks/useWorkspaceSocket, window-manager/FloatingWindowManager, window-manager/InsightWindow
- tenant/ (6): ApplicationForm, CryptoPaymentFlow, PortalShell, SignatureCanvas, SignatureModal, Web3Provider
- data-hub/ (6): DataAnalyticsPanel, DataIngestionPanel, DataQualityWidget, FileUploadModal, PullIntegrationsPanel, RealTimeDataFeed
- dashboard/ (5): RealtimeStatus, projects/{MilestoneGantt, MilestoneSubphases, MilestoneTimeline, ProjectSubnav}
- marketplace/ (3): FilterPanel, LocationSearch, PropertyCard
- pwa/ (2): PWAProvider, index.ts
- admin/ (1): ConfirmModal · analytics/ (3): MigrationFlowMatrix, RegionalHeatmap, Sparkline · calendar/ (3): CalendarView, ViewingScheduler, index.ts · deals/ (2): DocumentChecklist, GenerateDocumentDialog · forms/ (1): ComprehensivePropertyForm · property-management/ (2): PaymentSettings, RateStamp · providers/ (1): session-provider · publications/ (1): PublicationChart · team/ (1): ServiceTeamManager
- root loose (3): ApplicationForm.tsx, UpgradeGate.tsx, providers.tsx

**Skipped as covered by Part A auditor:** components/projects/, components/crm/, components/valuation/, components/reports/, components/esign/, components/realtime/.
