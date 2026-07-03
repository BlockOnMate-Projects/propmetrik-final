# Audit 11 — Frontend Components (Part A): projects/, crm/, valuation/, reports/, esign/, realtime/

Date: 2026-07-02 · Auditor: automated staff-engineer pass (read-only) · Repo: propmetrik · Base: `frontend/src/components/`

## Scope & Counts

| Dir | Files | LOC |
|---|---:|---:|
| projects/ | 51 | 28,753 |
| crm/ | 26 | 8,822 |
| valuation/ (incl. professional-floor-plan/) | 26 | 17,212 |
| reports/ | 7 | 4,531 |
| esign/ | 3 | 1,600 |
| realtime/ | 3 | 417 |
| **Total** | **116** | **61,335** |

Methodology: full-inventory static profiling of all 116 files (useState/useEffect/.map/fetch/memoization/hardcoded-color counts per file), resolver-based dead-import analysis (path-resolved import graph across all 668 files in `src/`, barrel-aware `export…from` handling, multiline-import and `next/dynamic` aware), `difflib` line-similarity on suspected duplicate pairs, and targeted manual reads of the largest components (CostEstimator, ReportEditor, InvoiceBuilder, AdjustmentGrid, WhatsAppChat, professional-floor-plan builder, pm-data tabs).

## Domain Scores (1 = critical, 10 = healthy)

| Domain | Score | One-line justification |
|---|:-:|---|
| Performance | **3/10** | 46 files >500 LOC; **zero virtualization anywhere** (no react-window/react-virtual in any of the 6 dirs); React.memo used in exactly 2 files (both crm); 4,092-LOC CostEstimator holds 40 `useState` at top level |
| Dead code | **2/10** | **26 confirmed-dead components, ~16,400 LOC (26.7% of audited surface)** — entire `compliance/` and `realtime/` dirs, 4 of 6 reports components, 11 valuation panels |
| Duplication | **4/10** | pm-data tabs 48–54% line-identical; 4 local `formatCurrency` re-implementations despite `lib/utils.ts:28` export; 5 parallel Konva floor-plan renderers (only 1 reachable) |
| Hardcoded values / theming | **3/10** | 1,372 hardcoded color tokens across the 6 dirs (projects/ alone: 1,032; CostEstimator.tsx alone: 561); 12 files hardcode API base URLs violating the `/api/*` proxy contract |
| Form handling | **5/10** | InvoiceBuilder: 43 controlled `onChange` handlers writing into one 1,854-LOC component's state; grids delegate via callbacks correctly; ReportEditor autosave is properly debounced (5 s) |
| Accessibility | **5/10** | Only ~40 clickable non-button elements (good), but `aria-*` appears in just 2 of 116 files; unlabeled icon buttons systemic |
| **Overall** | **3.5/10** | Functionally rich but a quarter of it is unreachable, the reachable quarter has god-components, and theming/perf debt is concentrated and quantified below |

---

## TOP FINDINGS (by priority)

### P0-1 · Dead code: 26 components / ~16,400 LOC (26.7%) are unreachable — and some still ship in the bundle via barrels
Resolver-verified (import graph + external symbol usage + internal component-to-component usage, all zero). **High confidence** for all items below; the only theoretical escape hatch is string-computed dynamic imports, of which none were found.

Entire directories dead:
- `projects/compliance/` — ComplianceDashboard (472), ComplianceReport (537), InspectionLog (647), PermitManager (659), index.ts. Barrel `projects/compliance/index.ts` itself is imported by nothing.
- `realtime/` — LiveActivityFeed (266), PresenceIndicator (144), index.ts. Whole dir orphaned.

Dead in reports/: ApprovalModal (808), PhotoUploader (667), VerificationPage (649), DocumentEditor (429) — only ReportEditor + SignaturePad are live.
Dead in valuation/: LandValuePanel (1,003), RentalMarketPanel (811), ConstructionCostPanel (546), ContributionWorkflow (569), KonvaConstrainedFloorPlanBuilder (613), ListingAdjustmentPanel (483), LayoutAlternatives (484), AssumptionReview (434), LaborCostsPanel (371), KonvaLegacyFloorPlanRenderer (348), DepreciationPanelWithOverrides (161).
Dead in projects/: budget/BudgetDashboard (796), documents/DocumentManager (1,003), documents/TemplateLibrary (647), team/VendorDirectory (1,152), team/CommunicationLog (970), dashboard/MetricCards (411).
Dead in crm/: CrmCalendarView (303).

**Bundle hazard:** `valuation/index.ts` (127 lines of re-exports) IS imported by live pages (e.g. `app/dashboard/valuations/[id]/market/page.tsx` pulls `MarketContextPanel`/`ComparableDetailCard` through it). Every dead panel re-exported by that barrel is candidate bundle payload for those pages unless tree-shaking of `"use client"` modules succeeds — which Next does not guarantee for modules with side-effect-bearing imports. Same pattern for `reports/index.ts` (ReportEditor is the only live symbol; ApprovalModal/PhotoUploader/VerificationPage ride along).
**Fix:** delete the 26 components (or move to an `_archive/`), prune the barrels to live symbols only. ~16.4k LOC removed, several of the “god components” below disappear for free (5 of the 20 largest files are dead).

### P0-2 · `projects/CostEstimator.tsx` — 4,092-LOC god component; whole-page re-render per keystroke
- 40 `useState` hooks and 7 `useEffect`s at a single component scope; 47 `.map()` render loops; every input keystroke (GFA, floors, region, finishes…) re-renders the entire estimator tree including QR code, market-data panels, and print views. State hydration effect at `CostEstimator.tsx:1805` (`setProjectType/setGfa/setAreaUnit/setFloors/setRegion` — 5+ sequential setters), window-event wiring at `:1832`, market-data fetch at `:1844–1850`, profile fetch at `:1737–1741` — two independent fetches (`/api/user/profile`, `/api/projects/cost-estimator/market-data`) started in separate effects rather than parallel at mount.
- 561 hardcoded color tokens in this one file — **41% of the audit surface's entire color debt** (`text-zinc-*`/`bg-zinc-*`/hex), the single biggest obstacle to the in-flight theming migration.
- `setTimeout`-based UX at `:2049`, `:2120`, `:2206`, `:2885`, `:2924`, `:2937` (print orchestration via timers).
**Fix:** split into `EstimatorInputs` / `EstimatorResults` / `EstimatorPrintView` / `MarketDataPanel` with a `useReducer` or context slice; memoize section components; move color literals to tokens. This one file is a quarter of `projects/` root LOC.

### P1-1 · API proxy-contract violations in 12 files — known prod-breakage class
Repo contract (memory: “API Proxy v1 Contract”): clients call relative `/api/<resource>`; `NEXT_PUBLIC_API_URL`/`localhost:4000` fallbacks bypass the v1 rewrite and (historically) drop auth. Violators, all `file:line` verified:
- `crm/CompTracker.tsx:31`, `crm/PropertyImageUploader.tsx:12`, `crm/RelationshipMap.tsx:23`, `crm/ContactMergeDialog.tsx:71,109`, `crm/WhatsAppChat.tsx:98` (`|| 'http://localhost:4000'` — no `/api/v1` at all, then `${API_BASE}/api/messaging/send` at `:391`)
- `projects/compliance/ComplianceReport.tsx:67`, `projects/documents/TemplateLibrary.tsx:66` (both dead — delete instead of fix), `projects/dashboard/ProjectHeader.tsx:77` (live)
- `reports/ReportEditor.tsx:879,972,1023` (`|| '/api'` — least bad), `reports/PhotoUploader.tsx:101`, `reports/DocumentEditor.tsx:79` (both dead)
Several of these pair with raw `localStorage.getItem` token access instead of `authedFetch` (`crm/CustomDealFields.tsx`, `crm/DashboardBuilder.tsx`, `crm/SavedViewsPicker.tsx`, `crm/OnboardingWizard.tsx`, `esign/SignatureModal.tsx`, `projects/CostEstimator.tsx`, `valuation/professional-floor-plan/KonvaFloorPlanBuilder.tsx`).
**Fix:** delete dead offenders; for live ones, replace `API_BASE` constants with relative paths + `authedFetch`.

### P1-2 · Zero list virtualization + near-zero memoization across 61k LOC
- No `react-window`/`react-virtualized`/`@tanstack/virtual` import anywhere in the 6 dirs (grep: 0 hits). Tables that render unbounded server data row-by-row: `projects/ProjectsTable.tsx` (725 LOC, 6 maps, 1 memo hook), `projects/budget/InvoiceManager.tsx` (977 LOC, 17 useState, 1 memo), `projects/team/TeamManager.tsx` (1,029 LOC, 17 useState, 1 memo), `valuation/AdjustmentGrid.tsx` (981 LOC, 12 maps — comps × factors matrix of controlled number inputs, one `React.memo`'d cell would cut the grid's per-keystroke work; input cell at `AdjustmentGrid.tsx:698` calls straight up to parent `onAdjustmentChange` at `:866`, re-rendering all rows).
- `React.memo` appears in exactly 2 of 116 files (both crm). `projects/` has **0** memoized components against 28.7k LOC.
**Fix:** memoize row/cell components of the 6 grids/tables above first (AdjustmentGrid, RentalAdjustmentGrid, ProjectsTable, InvoiceManager, TeamManager, PaymentSchedule); add pagination/virtualization to ProjectsTable and InvoiceManager.

### P1-3 · pm-data tabs: 4-way copy-paste (2,574 LOC where ~900 would do)
`RFIsTab.tsx` (649) vs `SubmittalsTab.tsx` (581): **54% line-identical**; vs `ChangeOrdersTab.tsx` (664): **48%**; vs `MilestonesTab.tsx` (679): 31%. Identical Dialog import block (`RFIsTab.tsx:37–42` = `SubmittalsTab.tsx:36–41` = `ChangeOrdersTab.tsx:36–41` = `MilestonesTab.tsx:34–39`), identical fetch-list/create-dialog/status-badge/detail-drawer scaffolding, per-tab 11–12 `useState`. **Fix:** one config-driven `PmDataTab<T>` (columns, statusMap, formFields) — the same Pattern-B config idea the backend already uses for e-sign.

### P2-1 · Hardcoded theming debt: 1,372 tokens in these dirs (of the ~31k codebase problem)
projects/ 1,032 · valuation/ 207 · reports/ 81 · crm/ 38 · esign/ 14 · realtime/ 0. Top offenders: `CostEstimator.tsx` (561), `CostEstimatorDashboard.tsx` (135), `budget/InvoiceBuilder.tsx` (134), `valuation/professional-floor-plan/constants.ts` (65 — acceptable: canvas drawing colors, but should still be theme-fed), `ConvertToProjectModal.tsx` (51), `KonvaBlenderGeometryRenderer.tsx` (41), `reports/ApprovalModal.tsx` (35, dead), `gantt/GanttChart.tsx` (31), `VerificationPage.tsx` (29, dead). Deleting dead code removes ~180 tokens; fixing the two cost-estimator files removes ~700 (51% of the remainder).

### P2-2 · `projects/budget/InvoiceBuilder.tsx` — 1,854 LOC, 43 controlled `onChange` handlers in one state scope
Line-item grid re-creates inline arrow handlers per row per render (43 `onChange={` occurrences, 20 `.map()` loops, 2 memo hooks total, 134 hardcoded colors). Every character typed into any line item re-renders all rows plus totals plus preview. **Fix:** extract `InvoiceLineRow` with `React.memo` + stable callbacks; move totals to `useMemo`.

### P2-3 · Duplicate formatters despite shared lib
`lib/utils.ts:28` exports `formatCurrency` (and `:41` `formatCurrencyCompact`), yet local re-implementations exist at `projects/budget/PaymentSchedule.tsx:109`, `crm/CompTracker.tsx:120`, `valuation/RentalMarketPanel.tsx:328` (dead), `valuation/LandValuePanel.tsx:197` (dead); plus 40+ raw `toLocaleString()` call sites (heaviest: `crm/RevenueForecaster.tsx` ×9, `valuation/DepreciationBreakdownPanel.tsx` ×7, `ComparableDetailCard.tsx` ×7) that bypass the shared GHS formatting (currency-symbol / FX-normalization consistency risk per the currency-fx memory).

### P3-1 · Accessibility
`aria-*` attributes in only 2/116 files (1 in projects/, 1 in crm/). ~40 clickable `div/span/tr` elements (multiline-aware count: projects 21, crm 7, valuation 6, reports 3, esign 2, realtime 1) — low in absolute terms, but combined with icon-only buttons lacking labels this is a systemic “no a11y pass was ever done” signal. Low priority per audit charter; batch with the theming sweep.

### P3-2 · Magic limits
47 magic-number hits (limit=/slice(0,N)/4-digit timeouts) — e.g. `ProjectsTable.tsx:224` (`GHANA_REGIONS.slice(0, 6)` — silently hides 10 of the 16 real regions from the filter UI; suspicious given the region-partitioning work), `compliance/ComplianceDashboard.tsx:98,134` (`slice(0, 5)`, dead), `team/VendorDirectory.tsx:334` (`slice(0, 3)`, dead), `ContactMergeDialog.tsx:71` (`limit=50&min_confidence=0.5` inline).

---

## GOD-COMPONENT TABLE (every component file >500 LOC — 46 files)

| File | LOC | Status | Split recommendation |
|---|---:|---|---|
| projects/CostEstimator.tsx | 4,092 | live | P0. Inputs / Results / PrintView / MarketData + useReducer (see P0-2) |
| valuation/professional-floor-plan/KonvaFloorPlanBuilder.tsx | 1,959 | live (dynamic) | Toolbar / Stage / Inspector / persistence hook; 30 useState + 8 effects; keeps 38 memo hooks — best-memoized big file, still one render scope |
| projects/budget/InvoiceBuilder.tsx | 1,854 | live | LineItemsGrid (memo rows) / TotalsPanel / PreviewPane (see P2-2) |
| reports/ReportEditor.tsx | 1,685 | live | Tiptap editor shell vs SectionNav vs SaveManager; autosave OK (5 s debounce `:917–921`) |
| valuation/EditableConstructionCostPanel.tsx | 1,247 | live | Extract element-row editor + summary; 18 useState/5 effects; near-dup of dead ConstructionCostPanel (23% — fork, not copy) |
| projects/team/VendorDirectory.tsx | 1,152 | **DEAD** | Delete |
| valuation/professional-floor-plan/geometry.ts | 1,089 | live | Pure lib — fine at this size; add unit tests instead of splitting |
| projects/team/TeamManager.tsx | 1,029 | live | Roster table / invite dialog / role editor; 17 useState |
| projects/budget/PaymentSchedule.tsx | 1,014 | live | ScheduleTable / MilestoneForm; local formatCurrency `:109` → lib |
| valuation/LandValuePanel.tsx | 1,003 | **DEAD** | Delete |
| projects/documents/DocumentManager.tsx | 1,003 | **DEAD** | Delete |
| valuation/AdjustmentGrid.tsx | 981 | live | Memoized `AdjustmentCell`; extract factor-row config (see P1-2) |
| projects/budget/InvoiceManager.tsx | 977 | live | List/table vs detail drawer; 17 useState, 22 colors |
| projects/team/CommunicationLog.tsx | 970 | **DEAD** | Delete |
| esign/FieldPlacement.tsx | 946 | live | Palette / PageCanvas / FieldChip(memo — drags re-render all 15 maps now) |
| valuation/RentalAdjustmentGrid.tsx | 940 | live | Same memo-cell treatment; only 22% similar to AdjustmentGrid — parallel evolution, unify via generic grid |
| valuation/DepreciationBreakdownPanel.tsx | 921 | live | Table vs chart split; 7 raw toLocaleString |
| valuation/RentalMarketPanel.tsx | 811 | **DEAD** | Delete |
| reports/ApprovalModal.tsx | 808 | **DEAD** | Delete |
| projects/budget/BudgetDashboard.tsx | 796 | **DEAD** | Delete |
| valuation/KonvaFloorPlanBuilder.tsx | 788 | live (legacy?) | Superseded by professional-floor-plan (8% similar = rewrite); confirm and retire |
| valuation/ComparableDetailCard.tsx | 746 | live | Presentational — split into section subcards; 7 toLocaleString |
| projects/ProjectsTable.tsx | 725 | live | Memo rows + pagination; region filter `slice(0,6)` bug `:224` |
| valuation/MarketContextPanel.tsx | 708 | live | Stats cards / trend chart split |
| projects/pm-data/MilestonesTab.tsx | 679 | live | Fold into generic PmDataTab (P1-3) |
| crm/WhatsAppChat.tsx | 670 | live | MessageList / Composer / TemplatePicker; API_BASE violation `:98`; fetches messages+templates in parallel-ish single effect `:374–377` (OK) |
| projects/CostEstimatorDashboard.tsx | 669 | live | Cards vs table; 135 colors — token sweep with CostEstimator |
| valuation/DepreciationOverrideDialog.tsx | 667 | live | Form sections; fine after memoizing |
| reports/PhotoUploader.tsx | 667 | **DEAD** | Delete |
| projects/pm-data/ChangeOrdersTab.tsx | 664 | live | Fold into PmDataTab |
| projects/compliance/PermitManager.tsx | 659 | **DEAD** | Delete (whole dir) |
| projects/pm-data/RFIsTab.tsx | 649 | live | Fold into PmDataTab |
| reports/VerificationPage.tsx | 649 | **DEAD** | Delete |
| projects/documents/TemplateLibrary.tsx | 647 | **DEAD** | Delete |
| projects/compliance/InspectionLog.tsx | 647 | **DEAD** | Delete |
| projects/PhaseHierarchy.tsx | 635 | live | Tree node component + memo; 10 useState |
| crm/ImportWizard.tsx | 617 | live | Step components exist implicitly — extract per-step files; 8 memo hooks already |
| valuation/KonvaConstrainedFloorPlanBuilder.tsx | 613 | **DEAD** | Delete |
| projects/documents/FolderTree.tsx | 585 | live | Recursive node memo |
| projects/pm-data/SubmittalsTab.tsx | 581 | live | Fold into PmDataTab |
| valuation/ContributionWorkflow.tsx | 569 | **DEAD** | Delete |
| projects/gantt/ProjectGantt.tsx | 548 | live | Container/chart split already exists (GanttChart) — move data mapping to hook |
| valuation/ConstructionCostPanel.tsx | 546 | **DEAD** | Delete (Editable variant is the live fork) |
| crm/AnalyticsCharts.tsx | 539 | live | Pure-props recharts (0 state — good); 26 hex colors → chart token palette |
| projects/compliance/ComplianceReport.tsx | 537 | **DEAD** | Delete |
| projects/LocationSelector.tsx | 508 | live | Map + Ghana-Post-GPS input split; 11 colors |

15 of 46 god-components are dead — deletion clears a third of the god-component problem without refactoring.

---

## FILE-BY-FILE

Metric key: **S**=useState, **E**=useEffect, **M**=`.map()` render loops, **F**=fetch/authedFetch calls, **Mo**=memo hooks (useMemo/useCallback/React.memo), **C**=hardcoded color tokens. Status: live / DEAD (resolver-verified, high confidence). Files >500 LOC also appear in the god-component table with split advice.

### projects/ (root, 12 files)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| ConvertToProjectModal.tsx | 484 | 9/0/1/0/0/51 | live | 51 colors in one modal; 9 useState form without memo |
| CostEstimator.tsx | 4,092 | 40/7/47/3/23/561 | live | **P0-2** — see top findings |
| CostEstimatorDashboard.tsx | 669 | 8/1/4/2/1/135 | live | 135 colors; pairs with CostEstimator token sweep |
| EsignSettingsManager.tsx | 126 | 3/1/3/0/0/0 | live | Clean, small |
| FundingSourcesSelect.tsx | 340 | 3/2/3/0/3/3 | live | OK |
| HeroImageUpload.tsx | 276 | 4/0/2/0/6/0 | live | Upload widget — candidate to unify with crm/PropertyImageUploader + reports/PhotoUploader patterns |
| LocationSelector.tsx | 508 | 5/1/2/0/3/11 | live | GhanaPost GPS format logic inline `:96–97` |
| PhaseHierarchy.tsx | 635 | 10/2/3/0/1/6 | live | Recursive tree, 1 memo hook; memoize nodes |
| PmKanbanBoard.tsx | 176 | 1/0/3/0/1/1 | live | Thin — fine |
| ProjectsTable.tsx | 725 | 5/0/6/0/1/8 | live | No row memo/pagination; `GHANA_REGIONS.slice(0,6)` filter bug `:224` |
| UnitMixConfig.tsx | 431 | 1/0/7/0/6/1 | live | Decently memoized |
| WorkBreakdownStructure.tsx | 124 | 1/0/1/0/0/2 | live | Fine |
| index.ts | 15 | – | live | Barrel |

### projects/budget/ (4)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| BudgetDashboard.tsx | 796 | 7/1/10/0/1/0 | **DEAD** | Superseded by `app/dashboard/projects/[id]/budget-cost` page |
| InvoiceBuilder.tsx | 1,854 | 14/4/20/0/2/134 | live | **P2-2**: 43 onChange in one scope; 134 colors; local status-color map (only `getStatusColor` def in all 6 dirs) |
| InvoiceManager.tsx | 977 | 17/1/2/0/1/22 | live | 17 useState list+filters+dialogs in one scope |
| PaymentSchedule.tsx | 1,014 | 13/1/6/0/1/17 | live | Local `formatCurrency:109` duplicating lib/utils.ts:28 |

### projects/compliance/ (5) — **entire directory DEAD**
| File | LOC | Status | Notes |
|---|---:|---|---|
| ComplianceDashboard.tsx | 472 | DEAD | `slice(0,5)` truncations `:98,134` |
| ComplianceReport.tsx | 537 | DEAD | API contract violation `:67` |
| InspectionLog.tsx | 647 | DEAD | |
| PermitManager.tsx | 659 | DEAD | |
| index.ts | 9 | DEAD | Barrel imported by nothing |

### projects/construction/ (3)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| MaterialPriceTracker.tsx | 183 | 4/1/1/0/0/1 | live | Fine |
| PettyCashLedger.tsx | 162 | 2/0/0/0/0/0 | live | Fine |
| SiteDiaryLog.tsx | 179 | 2/0/0/0/0/0 | live | Fine |

### projects/dashboard/ (7)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| AlertsPanel.tsx | 336 | 2/0/2/0/0/1 | live (portfolio page) | maxVisible slice pattern `:241` — fine |
| BudgetDonutChart.tsx | 399 | 1/0/3/0/1/12 | live (portfolio page) | 12 chart hex colors |
| MetricCards.tsx | 411 | 1/1/0/0/0/2 | **DEAD** | Uses Intl.NumberFormat locally |
| MilestonesWidget.tsx | 379 | 0/0/1/0/1/2 | live (portfolio page) | Fine |
| ProjectHeader.tsx | 303 | 2/0/0/1/0/4 | live | **API contract violation `:77`** (NEXT_PUBLIC_API_URL + /api/v1 in authedFetch) |
| ProjectMetrics.tsx | 350 | 0/0/2/0/2/10 | live | Presentational |
| index.ts | 4 | – | ~dead | Barrel not imported (pages import files directly) |

### projects/documents/ (6)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| DocumentManager.tsx | 1,003 | 16/0/5/0/2/0 | **DEAD** | 16-useState god, delete |
| DocumentPreview.tsx | 467 | 6/2/0/0/0/0 | live | OK |
| FolderTree.tsx | 585 | 8/1/4/0/0/0 | live | Recursive tree, zero memo — memoize nodes |
| TemplateLibrary.tsx | 647 | 6/0/7/3/0/0 | **DEAD** | API violation `:66`; delete |
| VersionHistory.tsx | 493 | 3/0/2/0/0/0 | live | OK |
| index.ts | 10 | – | ~dead | Barrel unused |

### projects/gantt/ (3)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| GanttChart.tsx | 496 | 1/0/0/0/7/31 | live | SVG gantt, decently memoized; 31 colors for bars → tokenize |
| ProjectGantt.tsx | 548 | 4/0/5/0/4/0 | live | Container; 4% similar to GanttChart (proper layering, not dup) |
| index.ts | 2 | – | live | |

### projects/governance/ (2)
| File | LOC | Status | Notes |
|---|---:|---|---|
| FrameworkSelector.tsx | 480 | live (create page) | 7 useState wizardish form, OK |
| index.ts | 10 | live | |

### projects/pm-data/ (5)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| ChangeOrdersTab.tsx | 664 | 11/1/5/0/1/2 | live | **P1-3** 48% identical to RFIsTab |
| MilestonesTab.tsx | 679 | 12/1/5/0/2/3 | live | 31% identical to RFIsTab |
| RFIsTab.tsx | 649 | 12/1/6/0/1/4 | live | Reference copy of the pattern |
| SubmittalsTab.tsx | 581 | 11/1/5/0/1/3 | live | **54% identical to RFIsTab** |
| index.ts | 16 | – | live | Barrel used by `projects/[id]/page.tsx:78` |

### projects/team/ (3)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| CommunicationLog.tsx | 970 | 14/1/8/0/1/0 | **DEAD** | Delete |
| TeamManager.tsx | 1,029 | 17/1/9/0/1/0 | live | 17 useState single scope; memoize member rows |
| VendorDirectory.tsx | 1,152 | 18/2/11/0/1/0 | **DEAD** | Largest dead file; delete |

### crm/ (26)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| AnalyticsCharts.tsx | 539 | 0/0/11/0/0/26 | live | Pure-props recharts — no keystroke risk itself, but 0 memo means parent re-renders redraw all charts; 26 hex chart colors |
| BulkActions.tsx | 386 | 4/0/5/0/7/0 | live | Well memoized |
| CommandPalette.tsx | 284 | 5/3/5/0/1/0 | live | Search without explicit debounce (in-memory filter — acceptable) |
| CompTracker.tsx | 253 | 5/1/3/1/0/0 | live | **API violation `:31`**; local formatCurrency `:120` |
| ContactMergeDialog.tsx | 295 | 6/1/1/2/1/0 | live | **API violation `:71,109`**; magic `limit=50&min_confidence=0.5` |
| CrmAIAssistant.tsx | 452 | 10/4/7/0/2/3 | live | 4 effects, 10 useState chat state; OK |
| CrmCalendarView.tsx | 303 | 5/1/6/0/4/0 | **DEAD** | Delete |
| CrmSidebar.tsx | 228 | 2/1/2/0/0/0 | live | Fine |
| CustomDealFields.tsx | 357 | 7/2/4/0/5/0 | live | localStorage token access (bypass authedFetch) |
| DashboardBuilder.tsx | 354 | 5/1/7/0/1/0 | live | localStorage token access |
| DealSlideIn.tsx | 365 | 0/0/3/0/0/0 | live | Presentational, fine |
| EmptyState.tsx | 60 | – | live | Fine |
| FilterBuilder.tsx | 368 | 1/0/6/0/4/0 | live | Fine |
| ImportWizard.tsx | 617 | 8/0/13/0/8/0 | live | Wizard steps inline; 13 maps; extract steps |
| InlineEdit.tsx | 135 | 3/1/0/0/3/0 | live | Good small primitive |
| KanbanBoard.tsx | 301 | 1/0/3/0/4/1 | live | Has one of the only 2 `React.memo`s; good |
| KeyboardShortcuts.tsx | 236 | 0/1/3/0/0/0 | live | Fine |
| OnboardingWizard.tsx | 368 | 6/2/5/0/3/0 | live | localStorage token; 2% similar to ImportWizard (not dup) |
| PipelineDesigner.tsx | 259 | 7/2/5/0/0/8 | live | 0 memo, 7 useState — minor |
| PropertyImageUploader.tsx | 374 | 4/0/6/3/4/0 | live | **API violation `:12`**; third upload widget implementation |
| RelationshipMap.tsx | 259 | 5/1/3/4/1/0 | live | **API violation `:23`**; 4 fetches — check waterfall on open |
| RevenueForecaster.tsx | 340 | 4/1/7/0/8/0 | live | Well memoized; 9 raw toLocaleString |
| SavedViewsPicker.tsx | 344 | 5/1/5/0/8/0 | live | localStorage token |
| StackingPlanView.tsx | 339 | 4/1/3/0/2/0 | live | Fine |
| UnifiedTimeline.tsx | 336 | 1/0/3/0/3/0 | live | Fine |
| WhatsAppChat.tsx | 670 | 10/3/6/4/2/0 | live | **API violation `:98`** (`|| 'http://localhost:4000'`, then `${API_BASE}/api/...` — double-prefix risk in prod); messages+templates fetched together `:374–377` (no waterfall) |

### valuation/ (26, incl. professional-floor-plan/)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| AdjustmentGrid.tsx | 981 | 1/0/12/0/1/1 | live | **P1-2**: comps×factors controlled-input matrix, no cell memo (`:698`, `:866`) |
| AssumptionReview.tsx | 434 | 3/0/4/0/4/0 | **DEAD** | Delete |
| ComparableDetailCard.tsx | 746 | 1/0/0/0/0/1 | live (market page) | Presentational; 7 toLocaleString |
| ConstructionCostPanel.tsx | 546 | 4/1/3/0/0/2 | **DEAD** | Read-only ancestor of Editable panel (23% similar); delete |
| ContributionWorkflow.tsx | 569 | 3/1/4/0/0/0 | **DEAD** | Delete (Data-Hub contributions flow lives elsewhere) |
| DepreciationBreakdownPanel.tsx | 921 | 2/0/8/0/0/0 | live | 0 memo on 8 table maps; 7 toLocaleString |
| DepreciationOverrideDialog.tsx | 667 | 6/2/2/0/1/1 | live | OK |
| DepreciationPanelWithOverrides.tsx | 161 | 2/0/0/0/2/0 | **DEAD** | Wrapper superseded; delete |
| EditableConstructionCostPanel.tsx | 1,247 | 18/5/14/0/6/9 | live | 18 useState + 5 effects; the live cost-panel fork |
| KonvaBlenderGeometryRenderer.tsx | 433 | 1/0/11/0/7/41 | live | 41 canvas hex colors; memoized OK |
| KonvaConstrainedFloorPlanBuilder.tsx | 613 | 11/1/10/0/7/34 | **DEAD** | 3rd builder variant; delete |
| KonvaFloorPlanBuilder.tsx | 788 | 15/2/11/0/12/16 | live | Legacy builder (8% similar to professional) — confirm retirement path |
| KonvaLegacyFloorPlanRenderer.tsx | 348 | 1/0/3/0/2/1 | **DEAD** | Name says it; delete |
| LaborCostsPanel.tsx | 371 | 6/1/2/0/1/3 | **DEAD** | Delete |
| LandValuePanel.tsx | 1,003 | 11/2/3/0/1/5 | **DEAD** | Local formatCurrency `:197`; delete |
| LayoutAlternatives.tsx | 484 | 1/0/3/0/3/0 | **DEAD** | Delete |
| ListingAdjustmentPanel.tsx | 483 | 3/0/1/0/5/0 | **DEAD** | Delete |
| MarketContextPanel.tsx | 708 | 4/1/4/0/0/6 | live (market page) | 0 memo hooks |
| RentalAdjustmentGrid.tsx | 940 | 2/0/10/0/5/0 | live | Same grid family as AdjustmentGrid (22% — unify via generic grid) |
| RentalMarketPanel.tsx | 811 | 15/1/3/0/5/0 | **DEAD** | Local formatCurrency `:328`; delete |
| index.ts | 127 | – | live | 127-line barrel re-exporting dead components into live pages — prune (P0-1 bundle hazard) |
| professional-floor-plan/KonvaFloorPlanBuilder.tsx | 1,959 | 30/8/48/0/38/21 | live (dynamic) | Canonical builder; 30 useState one scope; rAF transformer `:929–947`; stage mousemove `:1546`; localStorage token access |
| professional-floor-plan/constants.ts | 412 | –/–/–/–/–/65 | live | 65 canvas colors (drawing palette — tokenize for dark/light) |
| professional-floor-plan/geometry.ts | 1,089 | – | live | Pure geometry lib, good separation |
| professional-floor-plan/index.ts | 8 | – | live | Barrel (dynamic-imported by floor-plan page) |
| professional-floor-plan/types.ts | 363 | – | live | Types only |

### reports/ (7)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| ApprovalModal.tsx | 808 | 9/1/2/2/0/35 | **DEAD** | Delete |
| DocumentEditor.tsx | 429 | 5/3/0/3/2/0 | **DEAD** | API violation `:79`; delete |
| PhotoUploader.tsx | 667 | 4/0/11/1/6/0 | **DEAD** | API violation `:101`; delete (live photo flow uses valuation documents step) |
| ReportEditor.tsx | 1,685 | 20/8/9/3/22/3 | live | 20 useState/8 effects; autosave debounced 5 s (`:917–921` — correct); `onUpdate` sets only a boolean flag `:839–844` (good — content stays in Tiptap, not React state); API_BASE `|| '/api'` `:879,972,1023` |
| SignaturePad.tsx | 277 | 2/0/0/0/4/14 | live | Canvas pad; 4% similar to esign/SignatureModal (independent impls — still 2 signature pads in one app) |
| VerificationPage.tsx | 649 | 4/1/0/2/0/29 | **DEAD** | Delete |
| index.ts | 16 | – | live | Prune to ReportEditor + SignaturePad |

### esign/ (3)
| File | LOC | S/E/M/F/Mo/C | Status | Notes |
|---|---:|---|---|---|
| FieldPlacement.tsx | 946 | 14/3/15/1/2/5 | live | %-based placement (per memory); drag updates parent state → all fields re-render (2 memo hooks vs 15 maps); memoize FieldChip |
| PDFViewer.tsx | 268 | 3/2/2/0/2/4 | live | Fine |
| SignatureModal.tsx | 386 | 8/3/2/0/0/1 | live | localStorage token access; 2nd signature-pad impl |

### realtime/ (3) — **entire directory DEAD**
| File | LOC | Status |
|---|---:|---|
| LiveActivityFeed.tsx | 266 | DEAD |
| PresenceIndicator.tsx | 144 | DEAD |
| index.ts | 7 | DEAD |

---

## COVERAGE LEDGER

| Check | Coverage | Method |
|---|---|---|
| File inventory + LOC | 116/116 | `find`+`wc` |
| Static metric profile (state/effects/maps/fetch/memo/colors) | 116/116 | Python per-file regex profile (table above uses these exact numbers) |
| Dead-code (import-graph) | 116/116 | Path-resolved import graph over all 668 src files; barrel-aware (`export…from`), multiline-import-aware, `next/dynamic` aware; cross-checked external symbol usage + internal component usage. 26 dead confirmed at high confidence; residual risk only from string-computed imports (none found) |
| Hardcoded colors | 116/116 | grep `text-zinc-*|text-white|bg-zinc-*|bg-black|#hex` → 1,372 hits (projects 1,032 / valuation 207 / reports 81 / crm 38 / esign 14 / realtime 0) |
| API-contract violations | 116/116 | grep `NEXT_PUBLIC_API_URL|/api/v1/|localhost:4000` → 12 files, all cited with lines |
| Duplicate-pair similarity | 12 pairs | difflib line-ratio (pm-data 31–54%; cost panels 23%; adjustment grids 22%; konva builders ≤10%; signature pads 4%) |
| Formatter duplication | 116/116 | grep formatCurrency/Intl.NumberFormat/toLocaleString vs `lib/utils.ts:28` |
| A11y quick pass | 116/116 | Multiline-aware clickable-div count (40) + aria-* presence (2 files) — pattern-level only, no manual screen-reader pass |
| Deep manual read | Top ~12 files | CostEstimator, ReportEditor, InvoiceBuilder, AdjustmentGrid, WhatsAppChat, professional-floor-plan builder, all 4 pm-data tabs, FieldPlacement, ProjectsTable — targeted line reads for the evidence cited |
| Not covered | — | Runtime profiling (no dev server run); per-file deep read of every sub-500-LOC file (metrics + greps only); bundle-size measurement of the barrel hazard (recommended follow-up: `next build` + analyzer before/after pruning `valuation/index.ts`) |

### Recommended remediation order
1. Delete the 26 dead components + prune 3 barrels (16.4k LOC, −15 god-components, −~180 color tokens, −4 API violations) — zero behavioral risk, resolver-verified.
2. Fix the 8 live API-contract violators (ProjectHeader, WhatsAppChat, CompTracker, PropertyImageUploader, RelationshipMap, ContactMergeDialog, ReportEditor ×3 sites) → relative `/api/*` + authedFetch.
3. Split CostEstimator.tsx and tokenize its 561 colors (single highest-leverage perf+theming fix).
4. Generic `PmDataTab` for the 4 pm-data tabs; memoized cells for AdjustmentGrid/RentalAdjustmentGrid/InvoiceBuilder rows.
5. Adopt `lib/utils.ts` formatCurrency everywhere; kill local copies.
