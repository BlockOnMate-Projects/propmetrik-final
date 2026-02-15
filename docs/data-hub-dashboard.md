# PROPMETRIK Data Hub Dashboard - Design Document

## Design Philosophy

A **professional, enterprise-grade** data management dashboard inspired by:
- **Retool** - Clean data tables, action buttons, filters
- **Airbyte** - ETL job monitoring, source/destination flows
- **Grafana** - Real-time metrics, charts, alerts
- **Linear** - Minimal UI, keyboard shortcuts, fast interactions
- **Vercel Dashboard** - Clean cards, status indicators, deployments view

### Color Palette
```
Primary:     #2563EB (Blue 600)
Success:     #10B981 (Emerald 500)
Warning:     #F59E0B (Amber 500)
Error:       #EF4444 (Red 500)
Background:  #0F172A (Slate 900) - Dark mode
Surface:     #1E293B (Slate 800)
Text:        #F8FAFC (Slate 50)
Muted:       #94A3B8 (Slate 400)
```

---

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌──────┐  PROPMETRIK Data Hub           [Search] [🔔] [👤 Admin]  │
│  │ LOGO │                                                           │
├──┴──────┴───────────────────────────────────────────────────────────┤
│  │                                                                  │
│  │  📊 Overview          ┌────────────────────────────────────────┐ │
│  │  📁 Data Sources      │                                        │ │
│  │  ⚙️  ETL Jobs          │        MAIN CONTENT AREA               │ │
│  │  📝 Contributions     │                                        │ │
│  │  📈 Economic Data     │                                        │ │
│  │  🏗️  Construction      │                                        │ │
│  │  🕷️  Spider Control    │                                        │ │
│  │  ────────────         │                                        │ │
│  │  🏛️  Tier 1: Gov       │                                        │ │
│  │  🏦 Tier 2: Finance   │                                        │ │
│  │                       │                                        │ │
│  │  ────────────         └────────────────────────────────────────┘ │
│  │  ⚙️  Settings                                                    │
└──┴──────────────────────────────────────────────────────────────────┘
```

---

## 1. Overview Dashboard

### Key Metrics Cards (4 across)
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Data Sources    │  │ ETL Jobs Today  │  │ Pending Review  │  │ Properties      │
│     18          │  │     47          │  │     23          │  │   45,234        │
│ 14 Active       │  │ 3 Running       │  │ +12 today       │  │ +234 today      │
│ ▲ 2 this week   │  │ ✓ 44 completed  │  │ ↓ 15%          │  │ ↑ 2.3%         │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Data Sources by Tier (Donut Chart)
### Recent Activity Feed
### Quick Actions: Run Spider, Add Source, Review Contributions

**API Endpoints:**
- `GET /data-hub/sources/stats/by-tier`
- `GET /data-hub/jobs/stats`
- `GET /data-hub/contributions/pending`
- `GET /data-hub/queues/stats`

---

## 2. Data Sources Management

### View: Table with Filters

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Data Sources                                           [+ Add Source]       │
├──────────────────────────────────────────────────────────────────────────────┤
│  Tier: [All ▼]  Status: [All ▼]  Search: [________________]  [Filter]        │
├──────────────────────────────────────────────────────────────────────────────┤
│  □  SOURCE          TIER       TRUST    LAST SYNC        STATUS    ACTIONS   │
├──────────────────────────────────────────────────────────────────────────────┤
│  ☑  Meqasa          Web        0.65     2 hours ago      ● Active  [▶][⏸][⚙]│
│  ☑  Lands Commission Gov       0.95     5 days ago       ● Active  [▶][⏸][⚙]│
│  □  BOG Data        Market     0.90     12 hours ago     ○ Paused  [▶][⏸][⚙]│
│  ☑  Jiji            Web        0.55     3 hours ago      ● Active  [▶][⏸][⚙]│
└──────────────────────────────────────────────────────────────────────────────┘
```

### Source Detail Slide-out Panel
- Source info & configuration
- Sync history chart
- Recent jobs
- Error log

**API Endpoints:**
- `GET /data-hub/sources` - List with filters
- `GET /data-hub/sources/:id` - Detail
- `POST /data-hub/sources` - Create
- `PUT /data-hub/sources/:id` - Update
- `DELETE /data-hub/sources/:id` - Delete
- `POST /data-hub/sources/:id/sync` - Trigger sync

---

## 3. ETL Jobs Monitor

### View: Real-time Job List

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ETL Jobs                                        [Refresh 🔄] [+ New Job]    │
├──────────────────────────────────────────────────────────────────────────────┤
│  Type: [All ▼]  Status: [All ▼]  Source: [All ▼]        Last 24 hours       │
├──────────────────────────────────────────────────────────────────────────────┤
│  ● RUNNING                                                                   │
│  ├─ [job-123] Meqasa Scrape    ████████░░░░  67%   1,234/1,845   2m elapsed  │
│  └─ [job-124] Deduplication    ██████░░░░░░  48%   4,521/9,400   5m elapsed  │
│                                                                              │
│  ✓ COMPLETED (44)                                                            │
│  ├─ [job-122] GPC Scrape       ████████████ 100%   892 records   12m 34s     │
│  ├─ [job-121] Quality Scoring  ████████████ 100%   2,100 props   8m 12s      │
│  └─ [job-120] Geocoding Batch  ████████████ 100%   156 addrs     45s         │
│                                                                              │
│  ✗ FAILED (2)                                                                │
│  └─ [job-119] Jiji Scrape      ████░░░░░░░░  32%   Error: Rate limited       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Job Detail Modal
- Progress breakdown
- Log viewer (filterable by level)
- Retry button
- Error details

**API Endpoints:**
- `GET /data-hub/jobs` - List with filters
- `GET /data-hub/jobs/stats` - Statistics
- `GET /data-hub/jobs/:id` - Detail
- `GET /data-hub/jobs/:id/logs` - Logs
- `POST /data-hub/jobs/:id/cancel` - Cancel job

---

## 4. Contributions Review Panel

### View: Review Queue

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Contributions                              Pending: 23    [Bulk Actions ▼]  │
├──────────────────────────────────────────────────────────────────────────────┤
│  Type: [All ▼]  Region: [All ▼]  Contributor: [All ▼]    Sort: [Newest ▼]   │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ 🏠 New Property - 3BR Villa, East Legon                              │    │
│  │ Submitted by: John Mensah (Gold ⭐ 0.85)    2 hours ago              │    │
│  │ Region: Greater Accra    Trust Score: 0.78                           │    │
│  │ ┌─────────────────────────────────────────────────────────────────┐ │    │
│  │ │ Title: 3 Bedroom Villa with Pool                               │ │    │
│  │ │ Price: GHS 1,250,000 | Land: 0.5 acre | Built: 280 sqm        │ │    │
│  │ │ Location: AU Village, East Legon                               │ │    │
│  │ │ [View Photos] [View on Map]                                    │ │    │
│  │ └─────────────────────────────────────────────────────────────────┘ │    │
│  │                                    [✗ Reject]  [ℹ Need Info]  [✓ Approve] │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ 📊 Comparable Sale - Airport Residential                             │    │
│  │ Submitted by: Kwame Asante (Platinum ⭐ 0.92)    5 hours ago         │    │
│  │ ...                                                                  │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Contributor Leaderboard (Sidebar)
```
┌─────────────────────┐
│ Top Contributors    │
│ This Month          │
├─────────────────────┤
│ 1. K. Asante   142  │
│ 2. J. Mensah   98   │
│ 3. A. Owusu    76   │
└─────────────────────┘
```

**API Endpoints:**
- `GET /data-hub/contributions` - List
- `GET /data-hub/contributions/pending` - Pending review
- `GET /data-hub/contributions/:id` - Detail
- `POST /data-hub/contributions` - Create
- `POST /data-hub/contributions/:id/approve` - Approve
- `POST /data-hub/contributions/:id/reject` - Reject
- `GET /data-hub/contributors/leaderboard` - Leaderboard
- `GET /data-hub/contributors/:id` - Profile

---

## 5. Economic Data Dashboard

### View: Indicators with Charts

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Economic Indicators                             Last Updated: 2h ago [🔄]   │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│  │ Inflation Rate  │  │ Policy Rate     │  │ USD/GHS         │               │
│  │    23.2%        │  │    30.0%        │  │    15.50        │               │
│  │    ▼ -0.3%      │  │    ━ 0.0%       │  │    ▲ +0.15      │               │
│  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │               │
│  │  │  📈       │  │  │  │  ━━━━     │  │  │  │    📈     │  │               │
│  │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │               │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘               │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │              Exchange Rates - Last 12 Months                          │   │
│  │  16 ┤                                                          ╭──    │   │
│  │  15 ┤                                              ╭───────────╯      │   │
│  │  14 ┤                          ╭──────────────────╯                   │   │
│  │  13 ┤  ╭─────────────────────────╯                                    │   │
│  │  12 ┼──╯                                                              │   │
│  │     └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴───  │   │
│  │      Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec       │   │
│  │      ─── USD   ─── GBP   ─── EUR                                      │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐   │
│  │ Currency Converter              │  │ Affordability Calculator         │   │
│  │ Amount: [1000        ]          │  │ Property Price: [500000    ]     │   │
│  │ From:   [USD ▼] → GHS          │  │ Annual Income:  [60000     ]     │   │
│  │ Result: GHS 15,500.00          │  │ Index: 8.3 (Unaffordable)        │   │
│  │         [Convert]               │  │        [Calculate]               │   │
│  └─────────────────────────────────┘  └─────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints:**
- `GET /data-hub/economic/snapshot` - Current values
- `GET /data-hub/economic/indicators/:type` - Single indicator
- `GET /data-hub/economic/indicators/:type/history` - Historical data
- `GET /data-hub/economic/exchange-rate/:currency` - Exchange rate
- `POST /data-hub/economic/convert` - Currency conversion
- `POST /data-hub/economic/affordability` - Affordability index
- `POST /data-hub/economic/seed` - Seed data (admin)

---

## 6. Construction Costs Viewer

### View: Material Prices & Labor Rates

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Construction Costs                               Region: [Greater Accra ▼]  │
├──────────────────────────────────────────────────────────────────────────────┤
│  [Materials] [Labor] [Cost Estimator] [DRC Calculator]                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Materials                                          Category: [All ▼]        │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │ MATERIAL           UNIT      PRICE (GHS)   CHANGE    SUPPLIER         │   │
│  ├───────────────────────────────────────────────────────────────────────┤   │
│  │ Cement (50kg)      bag          95.00      ▲ +5%    Retail            │   │
│  │ Steel Rod 12mm     ton       3,800.00      ▲ +2%    Wholesale         │   │
│  │ Sharp Sand         trip      2,500.00      ━ 0%     Retail            │   │
│  │ Blocks (6-inch)    piece        12.00      ▲ +8%    Retail            │   │
│  │ Roofing Sheet      length      280.00      ▼ -3%    Wholesale         │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │              Cement Price Comparison by Region                        │   │
│  │                                                                       │   │
│  │  Greater Accra    ████████████████████  GHS 95.00                    │   │
│  │  Kumasi Metro     █████████████████     GHS 85.00                    │   │
│  │  Eastern          ████████████████      GHS 82.00                    │   │
│  │  Western          █████████████████     GHS 88.00                    │   │
│  │  Northern         ███████████████       GHS 78.00                    │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Cost Estimator Tab
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Construction Cost Estimator                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Property Type:    [Residential ▼]     Quality Level: [Standard ▼]          │
│  Region:           [Greater Accra ▼]   Number of Floors: [2        ]        │
│  Built Area (sqm): [250              ]                                       │
│                                                      [Calculate Estimate]    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ESTIMATE BREAKDOWN                                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Materials:              GHS   862,500.00   (60%)                      │  │
│  │ Labor:                  GHS   287,500.00   (20%)                      │  │
│  │ Equipment:              GHS    71,875.00    (5%)                      │  │
│  │ Overheads & Profit:     GHS   215,625.00   (15%)                      │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ TOTAL ESTIMATE:         GHS 1,437,500.00                              │  │
│  │ Cost per sqm:           GHS     5,750.00                              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints:**
- `GET /data-hub/construction/materials` - Material prices
- `GET /data-hub/construction/materials/:name/history` - Price history
- `GET /data-hub/construction/materials/:name/compare` - Regional comparison
- `POST /data-hub/construction/materials` - Add price (admin)
- `GET /data-hub/construction/labor` - Labor rates
- `POST /data-hub/construction/labor` - Add rate (admin)
- `POST /data-hub/construction/estimate` - Cost estimate
- `POST /data-hub/construction/drc` - Depreciated replacement cost
- `GET /data-hub/construction/index` - Cost index

---

## 7. Spider Control Panel

### View: Spider Management

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Spider Control                                           [+ Add Spider]     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 🕷️ Meqasa Spider                                      [▶ Run] [⏸ Pause]│  │
│  │ Status: ● Idle    Last Run: 2 hours ago    Next: in 4 hours           │  │
│  │ Records: 12,456 total | 234 today | 0.65 trust score                  │  │
│  │ Schedule: Every 6 hours    Rate Limit: 10 req/min                     │  │
│  │ ┌────────────────────────────────────────────────────────────────────┐│  │
│  │ │ Recent Runs                                                        ││  │
│  │ │ ✓ 2h ago   892 records   12m 34s   [View Logs]                    ││  │
│  │ │ ✓ 8h ago   1,023 records 14m 12s   [View Logs]                    ││  │
│  │ │ ✗ 14h ago  Failed: Rate limited    [View Logs]                    ││  │
│  │ └────────────────────────────────────────────────────────────────────┘│  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 🕷️ HouseMaster Spider                                  [▶ Run] [⏸ Pause]│ │
│  │ Status: ● Running (45%)    Started: 10 min ago                        │  │
│  │ Progress: ████████░░░░░░░░  156 / 350 records                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 🕷️ Realtor International Spider                       [▶ Run] [⏸ Pause]│  │
│  │ Status: ○ Paused    Reason: API key expired                           │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints:**
- `GET /data-hub/sources?tier=tier5_public_web` - Web spiders
- `POST /data-hub/sources/:id/sync` - Trigger spider run
- `PUT /data-hub/sources/:id` - Update config/pause
- `GET /data-hub/jobs?source_id=xxx&job_type=scrape` - Spider jobs

---

## 8. Tier 1 & 2 Data Ingestion Panel

### Tier 1: Government Data

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Tier 1: Government Data                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 🏛️ Ghana Lands Commission                                              │  │
│  │ Integration: API (SFTP Fallback)    Trust: 0.95    Status: ● Connected │  │
│  │ Last Sync: 5 days ago    Records: 45,234                               │  │
│  │ ┌────────────────────────────────────────────────────────────────────┐│  │
│  │ │ Data Types:                                                        ││  │
│  │ │ ☑ Land Title Records     ☑ Survey Data     ☐ Ownership Changes    ││  │
│  │ │ ☑ Encumbrances          ☑ Property Maps   ☐ Valuation Records     ││  │
│  │ └────────────────────────────────────────────────────────────────────┘│  │
│  │                        [Configure] [Test Connection] [Sync Now]       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 📋 Ghana Revenue Authority                                             │  │
│  │ Integration: File Import (CSV)    Trust: 0.90    Status: ○ Pending    │  │
│  │ ┌────────────────────────────────────────────────────────────────────┐│  │
│  │ │ Upload Property Tax Assessment Data                                ││  │
│  │ │ ┌──────────────────────────────────────────────────────────────┐  ││  │
│  │ │ │                                                              │  ││  │
│  │ │ │    📁 Drop CSV/Excel file here or click to browse           │  ││  │
│  │ │ │                                                              │  ││  │
│  │ │ │    Supported: .csv, .xlsx, .xls (max 50MB)                  │  ││  │
│  │ │ │                                                              │  ││  │
│  │ │ └──────────────────────────────────────────────────────────────┘  ││  │
│  │ └────────────────────────────────────────────────────────────────────┘│  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 🏢 Accra Metropolitan Assembly                                         │  │
│  │ Integration: Manual Entry    Trust: 0.85    Status: ● Active          │  │
│  │ Building Permits: 2,345    Zoning Data: 156 zones                     │  │
│  │                                    [Add Building Permit] [Add Zone]   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Tier 2: Financial Institutions

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Tier 2: Financial Institutions                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 🏦 Bank Mortgage Data                                                  │  │
│  │ Partners: Ecobank, GCB, Stanbic, Absa                                  │  │
│  │ ┌────────────────────────────────────────────────────────────────────┐│  │
│  │ │ Connected Banks:                                                   ││  │
│  │ │ ● Ecobank Ghana - API Connected - 12,456 records                  ││  │
│  │ │ ● GCB Bank - SFTP Connected - 8,234 records                       ││  │
│  │ │ ○ Stanbic Bank - Pending Integration                              ││  │
│  │ │ ○ Absa Ghana - Pending Integration                                ││  │
│  │ └────────────────────────────────────────────────────────────────────┘│  │
│  │                        [Add Bank Partner] [View Data Summary]         │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Data Quality Overview                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Source            Records   Complete   Verified   Last Updated         │  │
│  │ Lands Commission  45,234    89%        72%        5 days ago           │  │
│  │ Ecobank           12,456    95%        88%        12 hours ago         │  │
│  │ GCB Bank          8,234     92%        85%        2 days ago           │  │
│  │ GRA Tax Data      23,456    78%        65%        30 days ago          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoints:**
- `GET /data-hub/sources?tier=tier1_government` - Tier 1 sources
- `GET /data-hub/sources?tier=tier2_financial` - Tier 2 sources
- `POST /data-hub/sources` - Add new source
- `POST /data-hub/sources/:id/sync` - Trigger sync
- `POST /data-hub/queues/trigger` - Trigger file import job

---

## Component Architecture

```
frontend/
├── src/
│   ├── app/                      # Next.js 14 App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Redirect to /data-hub
│   │   └── data-hub/
│   │       ├── layout.tsx        # Dashboard shell
│   │       ├── page.tsx          # Overview dashboard
│   │       ├── sources/
│   │       │   ├── page.tsx      # Data sources list
│   │       │   └── [id]/page.tsx # Source detail
│   │       ├── jobs/
│   │       │   ├── page.tsx      # ETL jobs list
│   │       │   └── [id]/page.tsx # Job detail with logs
│   │       ├── contributions/
│   │       │   ├── page.tsx      # Review queue
│   │       │   └── [id]/page.tsx # Contribution detail
│   │       ├── economic/
│   │       │   └── page.tsx      # Economic dashboard
│   │       ├── construction/
│   │       │   └── page.tsx      # Construction costs
│   │       ├── spiders/
│   │       │   └── page.tsx      # Spider control
│   │       └── ingestion/
│   │           ├── tier1/page.tsx # Government data
│   │           └── tier2/page.tsx # Financial data
│   │
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── data-hub/
│   │   │   ├── DataSourceCard.tsx
│   │   │   ├── DataSourceTable.tsx
│   │   │   ├── EtlJobCard.tsx
│   │   │   ├── EtlJobProgress.tsx
│   │   │   ├── ContributionCard.tsx
│   │   │   ├── ContributorBadge.tsx
│   │   │   ├── EconomicIndicator.tsx
│   │   │   ├── ExchangeRateChart.tsx
│   │   │   ├── MaterialPriceTable.tsx
│   │   │   ├── CostEstimator.tsx
│   │   │   ├── SpiderCard.tsx
│   │   │   └── FileUploader.tsx
│   │   ├── charts/
│   │   │   ├── LineChart.tsx     # Recharts wrapper
│   │   │   ├── DonutChart.tsx
│   │   │   └── BarChart.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       ├── Header.tsx
│   │       └── MetricCard.tsx
│   │
│   ├── hooks/
│   │   ├── useDataSources.ts
│   │   ├── useEtlJobs.ts
│   │   ├── useContributions.ts
│   │   ├── useEconomicData.ts
│   │   └── useConstructionCosts.ts
│   │
│   ├── lib/
│   │   ├── api.ts                # API client
│   │   ├── utils.ts
│   │   └── constants.ts
│   │
│   └── types/
│       └── data-hub.ts           # TypeScript types
│
├── package.json
├── tailwind.config.ts
├── next.config.js
└── tsconfig.json
```

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 14** | React framework with App Router |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Styling |
| **shadcn/ui** | Component library |
| **Recharts** | Charts and visualizations |
| **TanStack Query** | Data fetching and caching |
| **Zustand** | State management |
| **date-fns** | Date formatting |
| **Lucide Icons** | Icon set |

---

## API Client Configuration

```typescript
// lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export const dataHubApi = {
  // Data Sources
  getSources: (params?: DataSourceFilters) => 
    fetch(`${API_BASE}/data-hub/sources?${new URLSearchParams(params)}`),
  getSource: (id: string) => 
    fetch(`${API_BASE}/data-hub/sources/${id}`),
  createSource: (data: CreateDataSourceInput) => 
    fetch(`${API_BASE}/data-hub/sources`, { method: 'POST', body: JSON.stringify(data) }),
  triggerSync: (id: string) => 
    fetch(`${API_BASE}/data-hub/sources/${id}/sync`, { method: 'POST' }),
  
  // ETL Jobs
  getJobs: (params?: EtlJobFilters) => 
    fetch(`${API_BASE}/data-hub/jobs?${new URLSearchParams(params)}`),
  getJobStats: () => 
    fetch(`${API_BASE}/data-hub/jobs/stats`),
  getJobLogs: (id: string) => 
    fetch(`${API_BASE}/data-hub/jobs/${id}/logs`),
  
  // Contributions
  getPendingContributions: (limit = 50) => 
    fetch(`${API_BASE}/data-hub/contributions/pending?limit=${limit}`),
  approveContribution: (id: string, credits?: number) => 
    fetch(`${API_BASE}/data-hub/contributions/${id}/approve`, { 
      method: 'POST', 
      body: JSON.stringify({ credits_awarded: credits }) 
    }),
  rejectContribution: (id: string, reason: string) => 
    fetch(`${API_BASE}/data-hub/contributions/${id}/reject`, { 
      method: 'POST', 
      body: JSON.stringify({ reason }) 
    }),
  
  // Economic Data
  getEconomicSnapshot: () => 
    fetch(`${API_BASE}/data-hub/economic/snapshot`),
  getIndicatorHistory: (type: string, params?: { from?: string; to?: string }) => 
    fetch(`${API_BASE}/data-hub/economic/indicators/${type}/history?${new URLSearchParams(params)}`),
  convertCurrency: (amount: number, from: string) => 
    fetch(`${API_BASE}/data-hub/economic/convert`, { 
      method: 'POST', 
      body: JSON.stringify({ amount, from_currency: from }) 
    }),
  
  // Construction
  getMaterials: (params?: { category?: string; region?: string }) => 
    fetch(`${API_BASE}/data-hub/construction/materials?${new URLSearchParams(params)}`),
  getLaborRates: (params?: { category?: string; region?: string }) => 
    fetch(`${API_BASE}/data-hub/construction/labor?${new URLSearchParams(params)}`),
  estimateCost: (data: CostEstimateInput) => 
    fetch(`${API_BASE}/data-hub/construction/estimate`, { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
};
```

---

## Implementation Priority

| Phase | Components | Estimated Time |
|-------|------------|----------------|
| **1** | Project setup, Layout, Overview dashboard | 2 hours |
| **2** | Data Sources management | 2 hours |
| **3** | ETL Jobs monitor | 2 hours |
| **4** | Economic Data dashboard | 2 hours |
| **5** | Construction Costs viewer | 2 hours |
| **6** | Contributions review panel | 2 hours |
| **7** | Spider control panel | 1 hour |
| **8** | Tier 1/2 ingestion panels | 2 hours |

**Total Estimated: ~15 hours**

---

## Ready to Implement

This design document provides:
- ✅ Complete UI wireframes
- ✅ All API endpoint mappings
- ✅ Component architecture
- ✅ Tech stack decisions
- ✅ Implementation priority

**Proceed with implementation?**
