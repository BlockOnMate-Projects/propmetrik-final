

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Market Context & Ghana-Specific Requirements](#2-market-context--ghana-specific-requirements)
3. [Design System & Visual Identity](#3-design-system--visual-identity)
4. [Core Feature Specifications](#4-core-feature-specifications)
5. [Advanced Capabilities & Differentiators](#5-advanced-capabilities--differentiators)
6. [Technical Architecture](#6-technical-architecture)
7. [Integration Ecosystem](#7-integration-ecosystem)
8. [Security & Compliance](#8-security--compliance)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Appendices](#10-appendices)
11. [Multi-Portal Architecture](#16-multi-portal-architecture)
12. [Enhancement Roadmap](#17-enhancement-roadmap)
13. [Services Inventory](#18-services-inventory)
14. [Appendix: OpenProject Analysis Decision](#19-appendix-openproject-analysis-decision)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Vision Statement

Build Africa's most sophisticated real estate project management platform, purpose-built for Ghana's unique regulatory landscape, land tenure systems, and development challenges. The system will serve as the digital backbone for developers, contractors, and stakeholders managing projects from land acquisition through handover.

### 1.2 Strategic Positioning

**Primary Differentiators:**
- **Ghana-First Design**: Built around Ghana's 16 administrative regions, district assemblies, and traditional land authorities
- **Regulatory Intelligence**: Automated compliance tracking for Lands Commission, EPA, Fire Service, and Metropolitan/Municipal assemblies
- **Multi-Currency Excellence**: Native GHS support with real-time USD, GBP, EUR conversion via Bank of Ghana APIs
- **Offline-First Architecture**: Full functionality in low-connectivity areas (common in Ghana)
- **Mobile-Centric**: 70% of Ghana's internet users are mobile-only

### 1.3 Target User Segments

| Segment | Persona | Key Needs | Market Size (Ghana) |
|---------|---------|-----------|---------------------|
| **Tier 1** | Large Developers (Regimanuel Gray, Devtraco Plus) | Enterprise features, portfolio management | ~50 companies |
| **Tier 2** | Mid-Market Developers | Project management, cost control | ~200 companies |
| **Tier 3** | Small Developers & Contractors | Basic PM, compliance tracking | ~1,500 firms |
| **Tier 4** | Individual Investors | Simple dashboards, progress monitoring | ~10,000+ individuals |

### 1.4 Success Metrics

**Year 1 Goals:**
- 100+ active projects managed
- 500+ registered users
- 85% user retention rate
- <2% error rate in budget calculations
- 99.5% uptime SLA

---

## 2. MARKET CONTEXT & GHANA-SPECIFIC REQUIREMENTS

### 2.1 Ghana Real Estate Landscape

**Market Characteristics:**
- **Housing Deficit**: 1.8 million unit shortage (2024 estimates)
- **Growth Rate**: 6-8% annual growth in Accra/Kumasi metro areas
- **Average Project Size**: 20-150 units (residential), 5,000-50,000 sqm (commercial)
- **Development Timeline**: 18-36 months average
- **Key Locations**: Greater Accra (45%), Ashanti (20%), Western (10%), other regions (25%)

**Critical Pain Points:**
1. **Land Title Complexity**: Multiple ownership systems (customary, vested, freehold, leasehold)
2. **Regulatory Delays**: Average 8-12 months for permits in Accra
3. **Payment Challenges**: 60% cash-based transactions, limited financing
4. **Documentation Gaps**: Paper-based records, lost permits, version control issues
5. **Cost Overruns**: 30-40% average budget variance due to poor tracking

### 2.2 Regulatory Framework Integration

#### 2.2.1 Ghana Lands Commission Requirements

**Land Title Documentation:**
- Site Plan approval tracking
- Indenture registration monitoring
- Land Title Certificate verification
- Survey plan validation
- Deed of Assignment management

**System Integration Points:**
- Direct API connection to Lands Commission database (when available)
- Document upload portal for manual verification
- Status tracking dashboard (Applied → Under Review → Approved)
- Automated reminder system for renewal dates

#### 2.2.2 Metropolitan/Municipal Assembly Permits

**Required Approvals by Project Phase:**

| Phase | Required Permits | Approval Authority | Typical Timeline |
|-------|------------------|-------------------|------------------|
| **Pre-Construction** | Development Permit, Building Permit | Metropolitan/Municipal Assembly | 3-6 months |
| **Construction** | Commencement Permit, Signage Permit | Assembly + Fire Service | 2-4 weeks |
| **Utilities** | Water Connection, Electricity Connection | GWCL, ECG | 2-3 months |
| **Occupancy** | Habitation Certificate | Assembly | 1-2 months |

**System Features:**
- Assembly-specific workflow templates (Accra Metro vs. Tema Metro differ)
- Automated checklist generation based on project type + location
- Integration with Assembly payment portals (where available)
- Permit expiration alerts with auto-renewal reminders

#### 2.2.3 Environmental Protection Agency (EPA)

**Environmental Impact Assessment (EIA) Tracking:**
- Mandatory for projects >40 units or >5,000 sqm
- Screening → Scoping → EIA Report → Review → Approval cycle
- Community consultation documentation
- Environmental monitoring requirements

**System Capabilities:**
- EIA template library by project type
- Community consultation log with GPS-tagged photos
- Environmental monitoring dashboard (waste, noise, dust)
- EPA inspector portal for digital submissions

#### 2.2.4 Ghana National Fire Service

**Fire Safety Compliance:**
- Fire certificate requirements by building class
- Emergency evacuation plan approval
- Fire hydrant/equipment specifications
- Quarterly inspection tracking

### 2.4 Competitive Gap Analysis

#### 2.4.1 Global Standard vs. Ghana Reality

| Feature | Global Standard (Procore/Buildertrend) | Ghana Reality Gap | PropMetrik Solution |
|---------|----------------------------------------|-------------------|---------------------|
| **Labor Tracking** | Timecards, hourly rates, union rules | Informal labor, daily "chop money", head porters (Kayayei) | Daily Labor Ledger with Cash/MoMo payouts |
| **Procurement** | Purchase Orders, established catalogs | Market volatility, roadside purchasing, varying cement prices | Real-time Material Rate Tracker linked to Budget |
| **Communication** | Email notifications, In-app messaging | Project stakeholders primarily use WhatsApp | WhatsApp API integration for automated updates |
| **Land Security** | Title Insurance, clear boundaries | Landguard payments, boundary disputes, multiple claimants | "Community Relations" expense category, Geofenced alerts |
| **Payments** | Bank transfers, Check printing | Mobile Money (90% of small vendors), Cash | Integrated MoMo Disbursment |

#### 2.4.2 Missing Industry-Standard Capabilities (To Be Built)

1. **Daily Site Diary (The "Foreman's Log")**
   - **Requirement**: A simple mobile view for the site foreman.
   - **Fields**: Weather (AM/PM), Labor Count (Skilled/Unskilled), Material Deliveries (with photo proof), Safety Incidents.
   - **Gap**: Current wizard tracks *project* data, but not *daily operational* data.

2. **Material Price Intelligence**
   - **Requirement**: Periodic scraping or manual entry of key indices (Cement bags, 14mm Iron Rods, Sea Sand).
   - **Gap**: Budget is static. Needs to be dynamic based on current market rates.

3. **"Chop Money" Ledger**
   - **Requirement**: specialized petty cash book for daily subsistence allowances.
   - **Gap**: Needs a dedicated micro-transaction interface separate from major Draw Requests.

4. **Whatsapp Bot Integration**
   - **Requirement**: "Reply with '1' to confirm delivery of 500 blocks".
   - **Gap**: No current integration defined.

### 2.5 UI/UX Design Standards


#### 2.3.1 Location Hierarchy

```
Ghana (Country)
├── Greater Accra Region
│   ├── Accra Metropolitan Assembly
│   │   ├── Osu Klottey (Sub-Metro)
│   │   ├── Ablekuma North
│   │   └── ... (10 sub-metros)
│   ├── Tema Metropolitan Assembly
│   ├── Ga East Municipal
│   └── ... (29 assemblies)
├── Ashanti Region
│   ├── Kumasi Metropolitan Assembly
│   └── ... (43 assemblies)
└── ... (14 more regions, 260+ assemblies)
```

**System Implementation:**
- Cascading location selector (Region → Assembly → Sub-Metro → Street)
- GPS coordinate capture for precise mapping
- Integration with Ghana PostGPS for digital addressing
- Offline-capable location database

#### 2.3.2 Currency & Payment Systems

**Multi-Currency Support:**
- **Primary**: Ghana Cedi (GHS / GH₵)
- **Secondary**: USD, GBP, EUR
- **Real-time Conversion**: Bank of Ghana interbank rates API
- **Historical Tracking**: Exchange rate variance analysis

**Payment Methods:**
- Mobile Money (MTN MoMo, Vodafone Cash, AirtelTigo Money) - 45% of transactions
- Bank Transfers (GCB, Ecobank, Stanbic, etc.) - 35%
- Cash - 15%
- Cheques - 5%

**System Features:**
- Mobile Money API integration for milestone payments
- Multi-currency budget tracking with automatic conversion
- Payment reconciliation dashboard
- Vendor payment scheduling (aligned with Ghana banking hours)

#### 2.3.3 Cultural & Business Context

**Business Hours:**
- Standard: Monday-Friday, 8:00 AM - 5:00 PM GMT
- Construction Sites: Monday-Saturday, 6:00 AM - 6:00 PM
- Public Holidays: 13+ national holidays + regional festivals

**Communication Preferences:**
- WhatsApp Business (primary) - 85% penetration
- Phone Calls (secondary) - for urgent matters
- Email (tertiary) - formal documentation
- SMS (alerts/reminders only)

**Language Support:**
- Primary: English (official language)
- Secondary: Twi/Akan (70% of users), Ga, Ewe, Hausa (future expansion)

---

## 3. DESIGN SYSTEM & VISUAL IDENTITY

### 3.1 Brand Philosophy

**Design Principles:**
1. **Ghanaian Elegance**: Incorporate Kente-inspired accent patterns, Adinkra symbols for iconography
2. **Trust & Transparency**: Financial data must be crystal clear, no hidden costs
3. **Mobile-First**: 90% of features accessible on 5" screens
4. **Low-Bandwidth Optimized**: <500KB initial page load, aggressive caching
5. **Accessibility**: WCAG 2.1 AA compliance for diverse user base

### 3.2 Color System (Dark Mode Primary)

#### 3.2.1 Primary Palette

**Core Brand Colors:**
```css
/* Ghana Flag Inspired */
--ghana-gold: #FCD116;        /* National gold, used sparingly for premium features */
--ghana-green: #006B3F;       /* National green, success states */
--ghana-red: #CE1126;         /* National red, alerts/errors */

/* Primary Interface Colors */
--primary-900: #0A1628;       /* Deepest Navy - Main background */
--primary-800: #132744;       /* Dark Slate - Card backgrounds */
--primary-700: #1E3A5F;       /* Ocean Blue - Elevated surfaces */
--primary-600: #2563EB;       /* Bright Blue - Primary CTAs */
--primary-500: #3B82F6;       /* Sky Blue - Links, interactive elements */
--primary-400: #60A5FA;       /* Light Blue - Hover states */
```

**Accent Colors (Functional):**
```css
/* Status Colors */
--success-dark: #047857;      /* Project completed, budget under */
--success-base: #10B981;      /* Approval granted, on schedule */
--success-light: #6EE7B7;     /* Positive variance indicators */

--warning-dark: #D97706;      /* Budget 80-95% utilized */
--warning-base: #F59E0B;      /* Pending approvals, approaching deadlines */
--warning-light: #FCD34D;     /* Minor delays, optional items */

--error-dark: #B91C1C;        /* Critical failures, legal issues */
--error-base: #EF4444;        /* Budget exceeded, missed deadlines */
--error-light: #FCA5A5;       /* Validation errors, warnings */

--info-dark: #1E40AF;         /* System updates */
--info-base: #3B82F6;         /* Informational notices */
--info-light: #93C5FD;        /* Tips, suggestions */
```

**Neutral Scale (Optimized for Dark Mode):**
```css
--neutral-950: #0A0E14;       /* Body background */
--neutral-900: #111827;       /* Card background */
--neutral-800: #1F2937;       /* Input fields, code blocks */
--neutral-700: #374151;       /* Borders, dividers */
--neutral-600: #4B5563;       /* Disabled text, placeholder */
--neutral-500: #6B7280;       /* Secondary text */
--neutral-400: #9CA3AF;       /* Icons, subtle text */
--neutral-300: #D1D5DB;       /* Primary text */
--neutral-200: #E5E7EB;       /* Headings, emphasis */
--neutral-100: #F3F4F6;       /* Highlights, badges */
--neutral-50: #F9FAFB;        /* Max contrast (rare use) */
```

#### 3.2.2 Semantic Color Application

**Budget Status Visualization:**
- **Green Zone**: 0-80% budget utilized → `--success-base`
- **Yellow Zone**: 80-95% → `--warning-base`
- **Orange Zone**: 95-100% → `--warning-dark`
- **Red Zone**: >100% → `--error-base`

**Project Phase Colors:**
- Planning: `--info-base` (Blue)
- Land Acquisition: `--warning-base` (Amber)
- Construction: `--primary-600` (Primary Blue)
- Finishing: `--success-base` (Green)
- Handover: `--ghana-gold` (Gold)

### 3.3 Typography System

#### 3.3.1 Font Stack

**Primary Font (UI/Body):**
```css
--font-primary: 'Inter Variable', -apple-system, BlinkMacSystemFont, 
                'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

**Display Font (Headings):**
```css
--font-display: 'Archivo', 'Inter', sans-serif;
/* Stronger, more geometric for dashboards and metrics */
```

**Monospace Font (Data/Code):**
```css
--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', 
             'Courier New', monospace;
/* For budget figures, IDs, coordinates */
```

**Ghanaian Context Font (Future):**
```css
--font-akan: 'Noto Sans Tifinagh', sans-serif;
/* For Twi/Akan language support in Phase 2 */
```

#### 3.3.2 Type Scale (Fluid Responsive)

```css
/* Mobile-first scaling with viewport-based adjustments */
--text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);      /* 12-14px */
--text-sm: clamp(0.875rem, 0.825rem + 0.25vw, 1rem);       /* 14-16px */
--text-base: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);      /* 16-18px */
--text-lg: clamp(1.125rem, 1.05rem + 0.375vw, 1.25rem);    /* 18-20px */
--text-xl: clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem);        /* 20-24px */
--text-2xl: clamp(1.5rem, 1.35rem + 0.75vw, 1.875rem);     /* 24-30px */
--text-3xl: clamp(1.875rem, 1.65rem + 1.125vw, 2.25rem);   /* 30-36px */
--text-4xl: clamp(2.25rem, 1.95rem + 1.5vw, 3rem);         /* 36-48px */
--text-5xl: clamp(3rem, 2.5rem + 2.5vw, 4rem);             /* 48-64px - Hero */

/* Weight Scale */
--font-light: 300;        /* Rarely used, low contrast */
--font-normal: 400;       /* Body text */
--font-medium: 500;       /* Emphasized text, labels */
--font-semibold: 600;     /* Subheadings, buttons */
--font-bold: 700;         /* Headings, key metrics */
--font-extrabold: 800;    /* Hero numbers (budget totals) */
```

#### 3.3.3 Typography Usage Guidelines

**Dashboard Metrics:**
```
Budget Total: --text-4xl, --font-extrabold, --ghana-gold
Metric Labels: --text-sm, --font-medium, --neutral-400
Metric Values: --text-2xl, --font-bold, --neutral-200
```

**Forms & Inputs:**
```
Field Labels: --text-sm, --font-medium, --neutral-300
Input Text: --text-base, --font-normal, --neutral-200
Helper Text: --text-xs, --font-normal, --neutral-500
Error Text: --text-xs, --font-medium, --error-base
```

**Data Tables:**
```
Table Headers: --text-xs, --font-semibold, --neutral-400, uppercase
Table Cells: --text-sm, --font-normal, --neutral-300
Numeric Data: --text-sm, --font-mono, --neutral-200
```

### 3.4 Spacing & Layout System

#### 3.4.1 Spacing Scale (8px Base Unit)

```css
--space-0: 0;
--space-1: 0.25rem;    /* 4px - Tight icon spacing */
--space-2: 0.5rem;     /* 8px - Base unit */
--space-3: 0.75rem;    /* 12px - Small component padding */
--space-4: 1rem;       /* 16px - Standard spacing */
--space-5: 1.25rem;    /* 20px - Medium spacing */
--space-6: 1.5rem;     /* 24px - Card padding */
--space-8: 2rem;       /* 32px - Section spacing */
--space-10: 2.5rem;    /* 40px - Large gaps */
--space-12: 3rem;      /* 48px - Major sections */
--space-16: 4rem;      /* 64px - Page sections */
--space-20: 5rem;      /* 80px - Hero spacing */
--space-24: 6rem;      /* 96px - Mega spacing */
```

#### 3.4.2 Border Radius System

```css
--radius-none: 0;
--radius-sm: 0.25rem;    /* 4px - Badges, tags */
--radius-md: 0.5rem;     /* 8px - Buttons, inputs */
--radius-lg: 0.75rem;    /* 12px - Cards */
--radius-xl: 1rem;       /* 16px - Modals, large cards */
--radius-2xl: 1.5rem;    /* 24px - Hero sections */
--radius-full: 9999px;   /* Pills, avatars */
```

#### 3.4.3 Shadow System (Depth Hierarchy)

```css
/* Subtle shadows for dark mode */
--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 
             0 1px 2px -1px rgb(0 0 0 / 0.1);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.15), 
             0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.2), 
             0 4px 6px -4px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.25), 
             0 8px 10px -6px rgb(0 0 0 / 0.1);
--shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.35);

/* Colored glows for emphasis */
--shadow-glow-gold: 0 0 20px rgb(252 209 22 / 0.3);    /* Premium features */
--shadow-glow-blue: 0 0 15px rgb(37 99 235 / 0.4);     /* Active states */
--shadow-glow-green: 0 0 15px rgb(16 185 129 / 0.4);   /* Success states */
```

#### 3.4.4 Grid System

**Container Widths:**
```css
--container-sm: 640px;    /* Mobile landscape */
--container-md: 768px;    /* Tablet */
--container-lg: 1024px;   /* Desktop */
--container-xl: 1280px;   /* Large desktop */
--container-2xl: 1536px;  /* Ultra-wide */
--container-full: 100%;   /* Full bleed */
```

**Breakpoints:**
```css
--bp-sm: 640px;     /* Large phones */
--bp-md: 768px;     /* Tablets */
--bp-lg: 1024px;    /* Laptops */
--bp-xl: 1280px;    /* Desktops */
--bp-2xl: 1536px;   /* Large desktops */
```

**Layout Patterns:**
```
Sidebar Layout: 280px fixed sidebar + fluid content
Dashboard Grid: 12-column on desktop, 6-column on tablet, 4-column on mobile
Card Grid: 3 columns (desktop), 2 columns (tablet), 1 column (mobile)
```

---

## 4. CORE FEATURE SPECIFICATIONS

### 4.1 Enhanced Project Creation Wizard

#### 4.1.1 Wizard Flow Architecture

**Multi-Step Process (5 Mandatory Steps):**

```
Step 1: Project Fundamentals
├── Project Name (validation: 3-100 characters)
├── Project Type (dropdown: Residential, Commercial, Mixed-Use, Land Development, Infrastructure)
├── Description (rich text, 50-2000 characters)
└── Hero Image Upload (max 5MB, formats: JPG, PNG, WebP)

Step 2: Location & Legal
├── Region Selection (Ghana's 16 regions)
├── Assembly Selection (260+ district/metropolitan assemblies)
├── Sub-Metro/Town (free text + autocomplete)
├── Street Address (Ghana PostGPS integration)
├── GPS Coordinates (auto-capture or manual entry)
├── Land Parcel ID (optional, Lands Commission format)
├── Land Tenure Type (Freehold, Leasehold, Customary, Vested)
└── Traditional Authority (if customary land)

Step 3: Timeline & Budget
├── Estimated Start Date (calendar picker)
├── Estimated Completion Date (auto-calculates duration)
├── Total Budget (multi-currency input)
│   ├── Primary Currency (GHS default)
│   ├── Secondary Currency (optional USD/GBP/EUR)
│   └── Exchange Rate Lock Option
├── Budget Breakdown by Category
│   ├── Land Acquisition (% allocation)
│   ├── Professional Fees (Architects, Engineers, Surveyors)
│   ├── Construction (Materials, Labor)
│   ├── Utilities & Infrastructure
│   ├── Marketing & Sales
│   └── Contingency (recommended 10-15%)
└── Funding Sources (Self-funded, Bank Loan, Investor, Mixed)

Step 4: Project Specifications
├── Total Units (if residential/commercial)
├── Unit Mix (if applicable)
│   ├── 1-Bedroom: X units
│   ├── 2-Bedroom: Y units
│   ├── 3-Bedroom: Z units
│   └── Commercial: sqm breakdown
├── Total Floor Area (sqm)
├── Number of Floors
├── Parking Spaces
└── Amenities Checklist (Pool, Gym, Security, Generator, etc.)

Step 5: Team & Compliance
├── Project Manager Assignment
├── Architect Assignment
├── Contractor Assignment (optional at creation)
├── Required Permits Checklist (auto-generated based on project type + location)
├── Document Upload Portal
│   ├── Land Title Certificate
│   ├── Site Plan (if approved)
│   ├── Architectural Drawings (preliminary)
│   └── Other Supporting Documents
└── Review & Submit
```

#### 4.1.2 Wizard UI/UX Specifications

**Progress Indicator:**
- Horizontal stepper (desktop) with step numbers, titles, and completion icons
- Vertical stepper (mobile) with collapsible completed steps
- Color coding: Gray (not started), Blue (current), Green (completed)

**Form Validation:**
- Real-time validation with inline error messages
- Field-level validation (on blur)
- Form-level validation (on step submission)
- Warning modals for unusual inputs (e.g., budget >$10M, duration <3 months)

**Smart Defaults:**
- Auto-fill location from user's previous projects
- Budget breakdown percentages based on project type (industry standards)
- Recommended contingency based on project size/complexity

**Conditional Logic:**
- Show "Land Parcel ID" only if land tenure is Freehold/Leasehold
- Show "Traditional Authority" only if land tenure is Customary
- Unit mix section appears only for Residential/Mixed-Use projects
- EPA permit automatically flagged if units >40 or area >5,000 sqm

**Save & Resume:**
- Auto-save every 30 seconds to local storage
- "Save as Draft" button available at each step
- Resume wizard from email link or dashboard

### 4.2 Interactive Dashboard (Command Center)

#### 4.2.1 Dashboard Layout Structure

**Header Bar (Sticky):**
```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] Projects ▼  Analytics  Team  Documents  Settings    │
│                                    [Search ⌘K] [Notifications] [User] │
└─────────────────────────────────────────────────────────────┘
```

**Main Dashboard (Grid Layout):**

```
┌──────────────────────┬──────────────────────┬──────────────────────┐
│  Key Metrics         │  Budget Overview     │  Timeline Status     │
│  (4 Cards)           │  (Donut Chart)       │  (Gantt Preview)     │
├──────────────────────┴──────────────────────┴──────────────────────┤
│  Active Projects Table (Sortable, Filterable)                      │
│  Columns: Project Name | Location | Status | Budget % | Timeline % │
├────────────────────────────────────────────────────────────────────┤
│  Alerts & Notifications                │  Upcoming Milestones    │
│  (Budget overruns, Permit expirations) │  (Next 30 days)         │
└────────────────────────────────────────┴─────────────────────────────┘
```

#### 4.2.2 Key Metric Cards

**Card 1: Total Projects**
```
┌─────────────────────────┐
│ Total Projects          │
│ ┌─────────────────────┐ │
│ │  24                 │ │ ← --text-4xl, --font-extrabold
│ └─────────────────────┘ │
│ ↑ 12% from last month  │ ← Trend indicator
│                         │
│ [View All →]            │
└─────────────────────────┘
```

**Card 2: Active Budget**
```
┌─────────────────────────┐
│ Active Budget           │
│ ┌─────────────────────┐ │
│ │  GH₵ 45.8M          │ │ ← Primary currency
│ │  ($3.2M)            │ │ ← Secondary currency
│ └─────────────────────┘ │
│ 78% Utilized           │
│ [Progress Bar ████░░]  │
└─────────────────────────┘
```

**Card 3: Projects by Status**
```
┌─────────────────────────┐
│ Project Status          │
│ Planning:      8        │ ← Color-coded badges
│ Active:       12        │
│ On Hold:       2        │
│ Completed:     2        │
│                         │
│ [View Details →]        │
└─────────────────────────┘
```

**Card 4: Compliance Status**
```
┌─────────────────────────┐
│ Compliance              │
│ ┌─────────────────────┐ │
│ │  18/24              │ │ ← Fraction of compliant projects
│ │  75%                │ │
│ └─────────────────────┘ │
│ 3 Permits Expiring Soon│ ← Alert indicator
│ [Review →]              │
└─────────────────────────┘
```

#### 4.2.3 Budget Overview (Interactive Donut Chart)

**Visualization:**
- Multi-ring donut chart (Recharts implementation)
- Inner ring: Budget categories (Land, Construction, Fees, etc.)
- Outer ring: Actual vs. Planned spending
- Center: Total budget with utilization percentage

**Interactions:**
- Hover: Show category breakdown tooltip
- Click segment: Drill down to category details
- Toggle: Switch between GHS/USD view

**Color Mapping:**
```
Land Acquisition: --warning-base (Amber)
Construction: --primary-600 (Blue)
Professional Fees: --info-base (Light Blue)
Marketing: --success-base (Green)
Contingency: --neutral-500 (Gray)
```

#### 4.2.4 Active Projects Table

**Columns:**
1. **Project Name** (sortable, searchable)
   - Icon based on project type
   - Clickable to project detail page
2. **Location** (Assembly + Region)
3. **Status** (badge with color coding)
   - Planning: Blue
   - Active: Green
   - On Hold: Amber
   - Completed: Ghana Gold
4. **Budget Utilization** (progress bar + %)
   - Color changes at 80%, 95%, 100% thresholds
5. **Timeline Progress** (progress bar + %)
   - Red if behind schedule (>5% variance)
6. **Last Updated** (relative time, e.g., "2 days ago")
7. **Actions** (kebab menu: View, Edit, Archive)

**Table Features:**
- Pagination: 10/25/50/100 rows per page
- Column sorting (ascending/descending)
- Global search across all columns
- Filters: Status, Location, Budget Range, Date Range
- Bulk actions: Export (CSV/PDF), Archive, Delete
- Saved views: "My Projects", "Behind Schedule", "Over Budget"

### 4.3 Project Detail Page (Deep Dive)

#### 4.3.1 Page Structure

**Header Section:**
```
┌──────────────────────────────────────────────────────────────┐
│ [Back to Projects]                                           │
│                                                              │
│ [Hero Image]      Project Name                              │
│ 1200x600px        Commercial | Accra Metro                  │
│                   Created: Jan 15, 2026 | PM: John Mensah   │
│                                                              │
│ [Edit] [Archive] [Share] [More ▼]                          │
└──────────────────────────────────────────────────────────────┘
```

**Tabbed Navigation:**
```
┌────────────────────────────────────────────────────────────┐
│ [Overview] [Timeline] [Budget] [Team] [Documents] [Compliance] [Analytics] │
└────────────────────────────────────────────────────────────┘
```

#### 4.3.2 Overview Tab

**Layout:**
```
┌────────────────────┬─────────────────────┬────────────────────┐
│ Project Details    │  Quick Stats        │  Recent Activity   │
│ (Card)             │  (3 Metric Cards)   │  (Timeline Feed)   │
├────────────────────┴─────────────────────┴────────────────────┤
│ Location Map (Interactive - Leaflet/Mapbox)                   │
│ Shows project location, nearby amenities, land boundaries     │
├───────────────────────────────────────────────────────────────┤
│ Project Description & Specifications                          │
│ (Expandable sections with full details)                       │
└───────────────────────────────────────────────────────────────┘
```

**Project Details Card:**
- Project Type (with icon)
- Total Units / Floor Area
- Number of Floors
- Parking Spaces
- Land Tenure Type
- Land Parcel ID (clickable to Lands Commission)
- Traditional Authority (if applicable)

**Quick Stats (3 Cards):**
1. Budget Health Score (0-100, algorithm-based)
2. Timeline Adherence (percentage on track)
3. Compliance Score (permits approved/total required)

**Recent Activity Feed:**
- Last 10 activities across all project areas
- Timestamp + user + action
- Filterable by activity type

#### 4.3.3 Timeline Tab (Gantt Chart)

**Features:**
- Interactive Gantt chart (dhtmlx-gantt or custom Recharts)
- Phases: Land Acquisition → Planning & Design → Pre-Construction → Construction → Finishing → Handover
- Task dependencies with critical path highlighting
- Milestone markers (permit approvals, payment schedules)
- Resource allocation view (team members per task)
- Drag-and-drop task rescheduling
- Baseline vs. actual timeline comparison

**Ghana-Specific Milestones:**
- Land Title Registration Complete
- EPA Permit Approved
- Building Permit Approved
- Foundation Inspection Passed
- Roofing Completion
- Fire Safety Certificate Issued
- Habitation Certificate Obtained

**Timeline Controls:**
- Zoom: Day, Week, Month, Quarter views
- Filters: Phase, Team Member, Status
- Export: PDF (for stakeholder reports), PNG (for presentations)

#### 4.3.4 Budget Tab

**Budget Dashboard Layout:**

```
┌─────────────────────┬──────────────────────┬───────────────────┐
│ Budget Summary      │  Variance Analysis   │  Payment Status   │
│ (Total/Used/Remain) │  (Chart)             │  (Pie Chart)      │
├─────────────────────┴──────────────────────┴───────────────────┤
│ Budget Breakdown Table                                         │
│ Category | Planned | Actual | Variance | % Used | Status      │
├───────────────────────────────────────────────────────────────┤
│ Payment Schedule & Invoices                                    │
│ Upcoming Payments | Paid Invoices | Pending Approvals         │
└───────────────────────────────────────────────────────────────┘
```

**Budget Categories (Ghana Real Estate Standard):**
1. **Land Acquisition** (25-35% typical)
   - Purchase price
   - Lands Commission fees
   - Legal fees (conveyancing)
   - Survey costs
   - Traditional authority payments (if customary land)

2. **Professional Fees** (8-12%)
   - Architectural design
   - Structural engineering
   - Quantity surveying
   - Electrical/mechanical engineering
   - Project management fees

3. **Construction** (45-55%)
   - Site preparation & earthworks
   - Foundation & substructure
   - Superstructure (walls, columns, slabs)
   - Roofing
   - Finishes (plastering, tiling, painting)
   - Electrical installations
   - Plumbing & sanitary
   - Doors & windows
   - External works (compound wall, driveways)

4. **Utilities & Infrastructure** (5-8%)
   - Water connection (GWCL fees)
   - Electricity connection (ECG fees)
   - Sewerage system
   - Road access

5. **Regulatory & Compliance** (3-5%)
   - Building permit fees
   - EPA permit fees
   - Fire Service inspection fees
   - Lands Commission registration fees
   - Assembly rates/levies

6. **Marketing & Sales** (3-5%)
   - Branding & signage
   - Website/brochures
   - Agent commissions
   - Showroom setup

7. **Contingency** (10-15%)
   - Unforeseen costs
   - Material price escalation
   - Weather-related delays

**Budget Features:**
- **Multi-Currency Tracking**: Display budgets in GHS with live USD/GBP/EUR equivalents
- **Variance Alerts**: Auto-notify when category exceeds 95% or overall budget exceeds 90%
- **Payment Milestones**: Link payments to project phases (e.g., 30% on foundation, 40% on roofing)
- **Invoice Management**: Upload, approve, and track vendor invoices
- **Expense Logging**: Mobile app for on-site expense capture (receipts via camera)
- **Budget Forecasting**: AI-powered predictions based on burn rate and project progress

#### 4.3.5 Team Tab

**Team Structure:**

```
Project Team Hierarchy
├── Project Owner/Developer
├── Project Manager (Primary)
├── Architect
├── Structural Engineer
├── Quantity Surveyor
├── Main Contractor
│   ├── Site Supervisor
│   ├── Foreman
│   └── Subcontractors (Electrical, Plumbing, Masonry, etc.)
├── Consultant Engineers (Electrical, Mechanical, Geotechnical)
└── External Stakeholders
    ├── Lands Commission Officer
    ├── EPA Inspector
    ├── Assembly Building Inspector
    └── Fire Service Inspector
```

**Team Management Features:**
- **Role-Based Permissions**: Define what each role can view/edit
- **Contact Directory**: Phone, email, WhatsApp with quick-action buttons
- **Availability Calendar**: Track when team members are on-site
- **Performance Metrics**: Task completion rate, response time
- **Communication Log**: All messages/calls/meetings recorded
- **Vendor Management**: Database of approved contractors with ratings

**Ghana-Specific Roles:**
- **Chief (Traditional Authority)**: For customary land projects
- **Mobile Money Agent**: For cash payment collection on-site
- **Security Coordinator**: Mandatory for most sites in Accra

#### 4.3.6 Documents Tab

**Document Management System:**

**Folder Structure (Auto-Generated):**
```
Project Documents/
├── 01. Land & Legal/
│   ├── Land Title Certificate
│   ├── Indenture
│   ├── Survey Plans
│   ├── Land Valuation Report
│   └── Consent Letters (if applicable)
├── 02. Permits & Approvals/
│   ├── Development Permit
│   ├── Building Permit
│   ├── EPA Permit
│   ├── Commencement Permit
│   ├── Fire Safety Certificate
│   └── Habitation Certificate
├── 03. Design Drawings/
│   ├── Architectural Drawings (Floor Plans, Elevations, Sections)
│   ├── Structural Drawings
│   ├── Electrical Drawings
│   ├── Plumbing Drawings
│   └── As-Built Drawings
├── 04. Contracts/
│   ├── Main Contract Agreement
│   ├── Subcontractor Agreements
│   ├── Consultant Agreements
│   └── Variation Orders
├── 05. Financial/
│   ├── Budget Breakdown
│   ├── Invoices (sorted by vendor)
│   ├── Payment Receipts
│   ├── Bank Statements
│   └── Tax Documents
├── 06. Site Reports/
│   ├── Daily Site Logs
│   ├── Weekly Progress Reports
│   ├── Inspection Reports (Foundation, Roofing, Final)
│   ├── Quality Control Reports
│   └── Safety Incident Reports
├── 07. Marketing/
│   ├── Brochures
│   ├── Floor Plans (Marketing)
│   ├── Renders/3D Visualizations
│   └── Pricing Sheets
└── 08. Handover/
    ├── Completion Certificates
    ├── Warranty Documents
    ├── User Manuals (Electrical, Plumbing)
    └── Keys Register
```

**Document Features:**
- **Version Control**: Track all document revisions with diff viewer
- **E-Signature Integration**: DocuSign/SignRequest for contracts
- **OCR Search**: Search text within scanned documents (PDFs)
- **Expiration Tracking**: Alerts for permit renewals (e.g., building permit valid 2 years)
- **Access Control**: Share specific folders with external stakeholders (view-only)
- **Mobile Upload**: Capture photos/documents on-site via mobile app
- **Template Library**: Pre-loaded templates for common Ghana documents (site log, inspection report)

**Ghana-Specific Document Types:**
- **Consent Letter Format**: Standardized template per Ghana Lands Commission
- **Assembly Payment Receipt**: Track all assembly fees with receipt scanning
- **Traditional Authority Letter**: Record of community engagement for customary lands

#### 4.3.7 Compliance Tab

**Compliance Dashboard:**

```
┌────────────────────────────────────────────────────────────┐
│ Compliance Score: 85/100                    [Generate Report] │
│ ████████████████████░░░░                                   │
├────────────────────────────────────────────────────────────┤
│ Permits Status                                             │
│ ✅ Land Title Certificate (Valid)                         │
│ ✅ Development Permit (Approved)                          │
│ ⚠️  Building Permit (Expires in 45 days)                  │
│ 🔄 EPA Permit (Under Review)                              │
│ ❌ Fire Safety Certificate (Not Started)                  │
│ ❌ Habitation Certificate (Pending Completion)            │
├────────────────────────────────────────────────────────────┤
│ Required Actions (Sorted by Urgency)                       │
│ 1. [HIGH] Renew Building Permit before Mar 15, 2026       │
│ 2. [MED] Submit Fire Safety application by Feb 28         │
│ 3. [LOW] Schedule final EPA inspection                    │
└────────────────────────────────────────────────────────────┘
```

**Permit Workflow Tracker:**

Each permit shows:
- **Current Status**: Not Started → Application Submitted → Under Review → Approved → Expired
- **Required Documents**: Checklist with upload status
- **Submission Date**: When application was submitted
- **Expected Approval Date**: Based on historical data (e.g., Accra Metro building permits take 4-6 months)
- **Assigned Officer**: Name + contact of reviewing officer (if known)
- **Next Steps**: Auto-generated based on current status
- **Cost Tracker**: Fees paid/pending

**Ghana Regulatory Intelligence:**

**Assembly-Specific Requirements:**
- Automated checklist based on project location
- Example: Accra Metropolitan Assembly requires additional traffic impact study for projects >50 units
- Tema Metropolitan Assembly has faster processing (3-4 months avg)
- Rural assemblies may have simpler requirements but slower processing

**Automated Reminders:**
- Email/SMS 90 days before permit expiration
- WhatsApp message 30 days before
- Daily reminders 7 days before
- Escalation to Project Manager if no action taken

### 4.4 Advanced Analytics & Reporting

#### 4.4.1 Executive Dashboard

**Key Performance Indicators (KPIs):**

**Financial KPIs:**
1. **Total Portfolio Value**: Sum of all active project budgets
2. **Budget Variance**: (Actual - Planned) / Planned × 100
3. **ROI Projection**: Based on estimated sales vs. total investment
4. **Cash Flow Status**: Positive/negative, burn rate
5. **Payment Collection Rate**: For projects with buyer installments

**Operational KPIs:**
1. **Projects On Schedule**: Percentage meeting timeline milestones
2. **Average Project Duration**: Vs. industry benchmark (24 months)
3. **Compliance Rate**: Percentage with all required permits
4. **Defect Rate**: Issues per 100 sqm (quality metric)
5. **Team Utilization**: Active team members vs. capacity

**Ghana Market KPIs:**
1. **Regional Distribution**: Projects by Ghana region (map view)
2. **Assembly Approval Time**: Average days by assembly
3. **Cedi-Dollar Variance**: Impact of GHS/USD fluctuation on budgets
4. **Mobile Money Adoption**: Percentage of payments via MoMo

#### 4.4.2 Predictive Analytics (AI-Powered)

**Features Requiring ML/AI Integration:**

1. **Budget Overrun Prediction**
   - Algorithm: Gradient Boosting (XGBoost)
   - Inputs: Project type, size, location, current variance, timeline progress, Ghana economic indicators
   - Output: Probability of exceeding budget (0-100%), expected variance amount
   - Accuracy Target: 80%+ for projects >30% complete

2. **Timeline Delay Forecasting**
   - Algorithm: LSTM (Long Short-Term Memory) neural network
   - Inputs: Historical task completion rates, weather data (Ghana rainy season), permit approval delays, contractor performance
   - Output: Revised completion date, probability distribution
   - Integration: Auto-adjust Gantt chart with "pessimistic" timeline

3. **Permit Approval Time Estimation**
   - Algorithm: Random Forest
   - Inputs: Assembly, project type, document completeness score, historical approval times
   - Output: Expected approval date range (e.g., "March 15-30, 2026 (78% confidence)")
   - Data Source: Crowdsourced from all platform users (anonymized)

4. **Material Cost Forecasting**
   - Integration: Ghana Statistical Service data on cement, steel, block prices
   - Algorithm: Time series forecasting (ARIMA)
   - Output: Price trend graphs, suggested purchase timing
   - Alert: "Cement prices expected to rise 8% next quarter - consider bulk purchase"

5. **Risk Scoring**
   - Composite score (0-100) based on:
     - Budget health (30% weight)
     - Timeline adherence (25%)
     - Compliance status (20%)
     - Team stability (15%)
     - External factors (weather, economic, political) (10%)
   - Color coding: Green (0-30), Yellow (31-60), Red (61-100)

#### 4.4.3 Custom Report Builder

**Report Types:**

1. **Executive Summary Report** (PDF/PowerPoint)
   - 1-page overview: Budget, timeline, milestones, risks
   - Designed for investor presentations
   - Ghana-specific: Include land title status, EPA approval stage

2. **Financial Report** (Excel/CSV)
   - Detailed budget breakdown by category
   - Invoice log with payment status
   - Variance analysis with drill-down
   - Multi-currency view (GHS primary, USD secondary)

3. **Progress Report** (PDF with Photos)
   - Gantt chart snapshot
   - Milestone achievements
   - Site photos (before/after comparisons)
   - Next month's plan

4. **Compliance Audit Report** (PDF)
   - All permits with status
   - Document repository index
   - Risk assessment
   - Recommendations for gaps

5. **Vendor Performance Report** (Excel)
   - Contractor scorecard (quality, timeliness, communication)
   - Payment history
   - Recommendations for future projects

**Report Customization:**
- **Templates**: Industry-standard or custom branding
- **Scheduling**: Auto-generate weekly/monthly/quarterly
- **Distribution**: Email to stakeholder list, upload to project portal
- **Languages**: English (primary), Twi translation (future)

---

## 5. ADVANCED CAPABILITIES & DIFFERENTIATORS

### 5.1 Mobile-First Features (PWA + Native Apps)

#### 5.1.1 Progressive Web App (PWA) Specifications

**Offline Capabilities:**
- **Service Worker**: Cache all project data for offline access
- **IndexedDB Storage**: Store last 30 days of activity locally
- **Background Sync**: Queue updates when offline, sync when online
- **Offline Indicators**: Clear UI showing "Offline Mode" with sync status

**Ghana Connectivity Context:**
- Target: Full functionality on 2G/3G networks (still common outside Accra)
- Optimization: <300KB initial load, aggressive image compression
- Data Saver Mode**: Option to disable images, load text-only

**Mobile-Specific Features:**
1. **Quick Actions**: Add expense, log site visit, upload photo (home screen shortcuts)
2. **Voice Notes**: Record site observations (auto-transcribe with Whisper API)
3. **GPS-Tagged Photos**: Auto-capture location for all site images
4. **Push Notifications**: Budget alerts, permit expirations, team messages
5. **WhatsApp Integration**: Share progress updates directly to WhatsApp groups

#### 5.1.2 Native Mobile App (React Native)

**iOS & Android Apps (Phase 2):**

**On-Site Tools:**
- **Daily Site Log**: Quick form with weather, attendance, activities, materials used
- **Quality Inspection**: Checklist with pass/fail photos (foundation, blockwork, plaster, etc.)
- **Safety Incident Reporting**: Immediate incident capture with witness statements
- **Material Delivery Tracking**: Scan delivery notes, verify quantities, update inventory
- **Timesheet Management**: Clock in/out for workers, export to payroll

**Contractor Mode:**
- Simplified view showing only assigned tasks
- Submit progress updates with photos
- Request material purchases
- Log equipment usage

**Investor Mode:**
- Read-only dashboard with key metrics
- Photo gallery of progress
- Financial summary (total invested, projected ROI)
- Milestone notifications

### 5.2 Collaboration & Communication Hub

#### 5.2.1 Integrated Communication Tools

**In-App Messaging:**
- **Project Channels**: Dedicated chat per project (like Slack channels)
- **Direct Messages**: 1-on-1 conversations
- **@Mentions**: Tag team members, auto-notify
- **File Sharing**: Drag-drop documents into chat
- **Message Search**: Full-text search across all conversations
- **Read Receipts**: Know who's seen important updates

**WhatsApp Business Integration:**
- **Two-Way Sync**: Messages sent via WhatsApp appear in app
- **Broadcast Lists**: Send updates to all stakeholders at once
- **Template Messages**: Pre-approved templates for common updates
  - "Budget milestone reached: Foundation 100% complete"
  - "Permit approved: Building Permit issued by Accra Metro"
  - "Payment reminder: Invoice #1234 due in 7 days"

**Video Conferencing:**
- **Embedded Meetings**: Zoom/Google Meet links with 1-click join
- **Site Walkthroughs**: Live video from site with screen annotation
- **Recording Storage**: Auto-save meetings to Documents tab

#### 5.2.2 Client Portal (White-Label)

**Stakeholder/Investor View:**

**Features:**
- **Public Dashboard**: Sanitized metrics (no internal cost breakdowns)
- **Photo Gallery**: Chronological site progress photos
- **Milestone Timeline**: High-level Gantt view
- **Financial Summary**: Total investment, projected completion value
- **Document Access**: Select documents (sales brochure, floor plans, payment schedule)
- **Contact Form**: Submit inquiries to project team

**Customization:**
- **Branding**: Developer logo, colors, domain (portal.developerwebsite.com)
- **Access Control**: Unique login per investor
- **Notification Preferences**: Email, SMS, or WhatsApp updates
- **Multi-Language**: English + Twi (for local investors)

**Use Case:**
- Developer sells 10 units off-plan, gives each buyer portal access
- Buyers see progress photos, payment schedule, estimated completion date
- Builds trust, reduces inquiry calls to sales team

### 5.3 AI-Powered Assistant (Kobby Integration)

#### 5.3.1 Conversational Project Assistant

**Natural Language Interface:**

**User Queries:**
- "How much have I spent on Cantonments project this month?"
- "When is the building permit expiring for Airport City project?"
- "Show me all projects behind schedule"
- "What's the average cost per unit across all residential projects?"
- "Which contractors have the best performance ratings?"

**AI Responses:**
- Fetch real-time data from database
- Generate natural language summaries
- Provide actionable recommendations
- Offer to create reports or send notifications

**Ghana-Specific Queries:**
- "How long does building permit approval take in Tema Metro?"
- "What's the current GHS to USD exchange rate?"
- "List all projects with pending EPA permits"
- "Calculate land cost per acre in Ashanti Region"

#### 5.3.2 Intelligent Insights & Recommendations

**Auto-Generated Insights:**

**Budget Insights:**
- "Your construction costs are 12% higher than industry average for similar projects in Greater Accra. Consider renegotiating with Block supplier."
- "Cement prices expected to rise 8% next quarter (Ghana Statistical Service data). Recommend purchasing 500 bags now to save GH₵ 15,000."

**Timeline Insights:**
- "This project is trending 15 days behind schedule. Critical path delay is EPA permit approval. Recommend escalating to EPA Deputy Director."
- "Rainy season starts in 3 weeks. Ensure roofing phase completes by then to avoid 2-month delay."

**Compliance Insights:**
- "Building permit expires in 45 days. Based on Accra Metro processing times, apply for renewal today to avoid expiration."
- "You're missing Fire Safety Certificate application. This is required before habitation certificate. Start process now (estimated 6-week approval)."

**Risk Insights:**
- "High risk detected: 3 subcontractors have poor payment history. Consider requiring bank guarantees."
- "Political risk alert: Upcoming elections may delay Assembly permit approvals by 2-3 months. Expedite pending applications."

### 5.4 Marketplace & Vendor Management

#### 5.4.1 Verified Vendor Directory

**Categories:**
- Architects (Ghana Institute of Architects members)
- Engineers (Ghana Institution of Engineering members)
- Quantity Surveyors
- Main Contractors (Ghana Real Estate Developers Association)
- Subcontractors (Electricians, Plumbers, Masons, Carpenters)
- Material Suppliers (Cement, Steel, Blocks, Tiles, Sanitary Ware)
- Equipment Rental (Excavators, Concrete Mixers, Scaffolding)

**Vendor Profiles:**
- Portfolio (past projects with photos)
- Certifications & licenses
- Insurance coverage
- Rating & reviews (from platform users)
- Average response time
- Pricing range
- Service areas (regions covered)

**Search & Filter:**
- Location (find vendors in Kumasi, Takoradi, etc.)
- Specialty (e.g., "Luxury residential finishes")
- Budget range
- Availability
- Rating (4+ stars)

**Request for Quotation (RFQ) System:**
- Create RFQ with project specs
- Send to multiple vendors simultaneously
- Receive quotes in standardized format
- Compare pricing side-by-side
- Award contract directly from platform

#### 5.4.2 Material Price Index

**Live Market Pricing:**
- **Daily Updates**: Prices from major suppliers (GHACEM, Diamond Cement, etc.)
- **Regional Variations**: Accra vs. Kumasi vs. Tamale pricing
- **Bulk Discounts**: Pricing tiers (1-100 bags vs. 1000+ bags)
- **Delivery Costs**: Factor in transport to site

**Materials Tracked:**
- Cement (per bag)
- Steel rods (per ton, by diameter)
- Concrete blocks (per unit, 6" and 9")
- Sand (per trip/tipper)
- Gravel/chippings (per trip)
- Roofing sheets (per sheet, aluminum/long-span)
- Tiles (per sqm, by quality grade)
- Paint (per gallon, by brand)

**Price Alert System:**
- "Steel rod prices dropped 5% this week - good time to purchase"
- "Cement shortage expected due to factory maintenance - secure stock now"

---
# REAL ESTATE PROJECT MANAGEMENT SYSTEM
## Technical Architecture & Implementation Guide
### Sections 6-10: Technical Specifications

**Document Version:** 2.0 (Continuation)  
**Last Updated:** January 21, 2026  
**Sections Covered:** 6. Technical Architecture, 7. Integration Ecosystem, 8. Security & Compliance, 9. Implementation Roadmap, 10. Appendices

---

## 6. TECHNICAL ARCHITECTURE

### 6.1 System Architecture Overview

#### 6.1.1 Architectural Pattern

**Primary Pattern:** Microservices Architecture with API Gateway

**Key Characteristics:**
- **Service Independence:** Each domain (Projects, Tasks, Budget, Documents, Compliance) operates as an independent service
- **API-First Design:** All services expose RESTful APIs with OpenAPI documentation
- **Event-Driven Communication:** Services communicate via message broker for async operations
- **Database Per Service:** Each microservice manages its own data store (polyglot persistence)
- **Horizontal Scalability:** Services can scale independently based on load
- **Fault Isolation:** Failure in one service doesn't cascade to others

**Architecture Layers:**

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  Web App (Next.js) | Mobile App (React Native) | Admin Panel│
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────┐
│                    API GATEWAY LAYER                          │
│  Kong/NGINX: Routing, Auth, Rate Limiting, SSL Termination   │
└─────────────────────────────┼─────────────────────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                       │
│  ┌────────────┬────────────┬────────────┬────────────┐      │
│  │ Projects   │ Tasks      │ Budget     │ Documents  │      │
│  │ Service    │ Service    │ Service    │ Service    │      │
│  └────────────┴────────────┴────────────┴────────────┘      │
│  ┌────────────┬────────────┬────────────┬────────────┐      │
│  │ Compliance │ Team       │ Analytics  │ Notification│     │
│  │ Service    │ Service    │ Service    │ Service    │      │
│  └────────────┴────────────┴────────────┴────────────┘      │
└───────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────┐
│                    MESSAGE BROKER LAYER                       │
│  RabbitMQ/Kafka: Event Bus, Task Queue, Pub/Sub              │
└─────────────────────────────┼─────────────────────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────┐
│                    DATA PERSISTENCE LAYER                     │
│  PostgreSQL | Redis | MongoDB | Elasticsearch | S3            │
└───────────────────────────────────────────────────────────────┘
```

#### 6.1.2 Technology Stack Deep Dive

**Frontend Technologies:**

| Component | Technology | Version | Purpose | Justification |
|-----------|-----------|---------|---------|---------------|
| **Web Framework** | Next.js | 14+ (App Router) | SSR/SSG web application | Industry standard for React, excellent SEO, built-in API routes |
| **Language** | TypeScript | 5.3+ | Type-safe development | Prevents runtime errors, better IDE support, team scalability |
| **UI Framework** | Tailwind CSS | 3.4+ | Utility-first styling | Rapid development, small bundle size, dark mode support |
| **Component Library** | shadcn/ui | Latest | Pre-built accessible components | Radix UI primitives, customizable, Ghana-specific theming |
| **State Management** | Zustand | 4.5+ | Global state | Lightweight (1KB), simple API, Redux alternative |
| **Server State** | TanStack Query | 5.0+ | API data caching | Automatic refetching, optimistic updates, offline support |
| **Form Handling** | React Hook Form | 7.5+ | Form state management | Performance-focused, minimal re-renders |
| **Validation** | Zod | 3.22+ | Schema validation | Type-safe, runtime validation, RHF integration |
| **Charts** | Recharts | 2.10+ | Data visualization | React-native, responsive, SVG-based |
| **Maps** | Leaflet | 1.9+ | Ghana location mapping | Lightweight, OSM support, offline tiles |
| **Gantt Charts** | dhtmlx-gantt | 8.0+ | Project timelines | Industry-standard, dependency tracking |
| **File Upload** | Uppy | 3.2+ | Document uploads | Resumable uploads, multiple sources, progress tracking |
| **Rich Text** | Tiptap | 2.1+ | WYSIWYG editing | Extensible, Prosemirror-based, collaborative editing ready |
| **Date Utils** | date-fns | 3.0+ | Date manipulation | Lightweight, modular, Ghana timezone support |

**Backend Technologies:**

| Component | Technology | Version | Purpose | Justification |
|-----------|-----------|---------|---------|---------------|
| **API Framework** | FastAPI | 0.109+ | RESTful APIs | Async support, auto OpenAPI docs, high performance |
| **Language** | Python | 3.11+ | Business logic | Extensive libraries (ML, data analysis), Ghana dev familiarity |
| **ASGI Server** | Uvicorn + Gunicorn | Latest | Production server | Async workers, process management |
| **ORM** | SQLAlchemy | 2.0+ | Database abstraction | Async support, mature ecosystem, complex queries |
| **Validation** | Pydantic | 2.5+ | Request/response validation | Type hints, JSON schema generation, FastAPI native |
| **Authentication** | FastAPI-Users | 12.0+ | User management | JWT tokens, OAuth2, role-based access |
| **Task Queue** | Celery | 5.3+ | Background jobs | Distributed task execution, scheduling, monitoring |
| **Message Broker** | RabbitMQ | 3.12+ | Event messaging | Reliable delivery, dead letter queues, clustering |
| **Cache** | Redis | 7.2+ | Session storage, caching | In-memory speed, pub/sub, Ghana network optimization |
| **Search Engine** | Elasticsearch | 8.11+ | Full-text search | Document search, analytics, log aggregation |
| **API Documentation** | OpenAPI/Swagger | 3.1 | Auto-generated docs | Developer portal, API testing, client generation |

**Database & Storage:**

| Component | Technology | Version | Purpose | Data Types |
|-----------|-----------|---------|---------|------------|
| **Primary Database** | PostgreSQL | 16+ | Transactional data | Projects, users, budgets, tasks |
| **Geospatial Extension** | PostGIS | 3.4+ | Location data | GPS coordinates, boundaries, distance calculations |
| **NoSQL Database** | MongoDB | 7.0+ | Unstructured data | Activity logs, audit trails, flexible schemas |
| **In-Memory Cache** | Redis | 7.2+ | Session management | User sessions, rate limiting, real-time counters |
| **Search Index** | Elasticsearch | 8.11+ | Search & analytics | Document search, log analysis, metrics aggregation |
| **Object Storage** | AWS S3/MinIO | Latest | File storage | Documents, images, reports (5TB+ capacity) |
| **Backup Storage** | AWS Glacier | Latest | Long-term archival | Compliance records, historical data |

**DevOps & Infrastructure:**

| Component | Technology | Purpose | Ghana-Specific Considerations |
|-----------|-----------|---------|------------------------------|
| **Containerization** | Docker 24+ | Application packaging | Consistent environments across Ghana data centers |
| **Orchestration** | Kubernetes 1.29+ | Container management | Auto-scaling during Ghana business hours |
| **CI/CD** | GitHub Actions | Automated deployment | Deploy to Accra/Lagos data centers |
| **Monitoring** | Prometheus + Grafana | System metrics | Track Ghana network latency, uptime |
| **Logging** | ELK Stack (Elasticsearch, Logstash, Kibana) | Centralized logs | Debug Ghana-specific issues (MoMo failures, permit APIs) |
| **Error Tracking** | Sentry | Error monitoring | Real-time alerts for production issues |
| **APM** | New Relic/Datadog | Performance monitoring | Ghana API response times, database queries |
| **CDN** | Cloudflare | Content delivery | Cache static assets in West Africa PoPs |
| **DNS** | Cloudflare | DNS management | DDoS protection, Ghana-optimized routing |
| **SSL/TLS** | Let's Encrypt | HTTPS certificates | Free, auto-renewal, wildcard support |

#### 6.1.3 Database Schema Architecture

**Schema Design Principles:**

1. **Normalization:** 3NF for transactional tables (projects, budgets, tasks)
2. **Denormalization:** Materialized views for analytics dashboards
3. **Partitioning:** Time-based partitioning for high-volume tables (activity_logs by month)
4. **JSONB Usage:** Flexible metadata storage (project specifications, address components)
5. **Soft Deletes:** `deleted_at` timestamp instead of hard deletes for audit trail
6. **UUID Primary Keys:** Distributed system compatibility, no ID collision
7. **Audit Columns:** `created_at`, `created_by`, `updated_at`, `updated_by` on all tables
8. **Multi-Tenancy:** `organization_id` foreign key for data isolation

**Core Database Entities (26 Tables):**

**Entity Relationship Overview:**

```
Organizations (1) ──── (N) Users
     │
     └──── (N) Projects
              │
              ├──── (N) Tasks
              │         └──── (N) Task_Dependencies
              │
              ├──── (N) Budgets
              │         └──── (N) Expenses
              │
              ├──── (N) Documents
              │         └──── (N) Document_Versions
              │
              ├──── (N) Compliance_Documents
              │         └──── (N) Compliance_Reminders
              │
              ├──── (N) Team_Assignments
              │
              ├──── (N) Milestones
              │
              ├──── (N) Site_Logs
              │
              ├──── (N) Progress_Photos
              │
              └──── (N) Project_Comments
                        └──── (N) Comment_Mentions

Users (N) ──── (N) Notifications
```

**Table Specifications (Key Tables):**

**1. Projects Table**
```
Table: projects
Purpose: Core project entity with Ghana-specific metadata
Estimated Rows: 10,000+ (Year 1)
Partitioning: None (main table)
Indexes: 6 (organization_id, status, location GiST, address GIN, created_at, deleted_at)

Key Columns:
- id (UUID, PK)
- organization_id (UUID, FK → organizations.id)
- name (VARCHAR(255), NOT NULL)
- project_type (ENUM: residential, commercial, mixed_use, land_dev, infrastructure)
- description (TEXT)
- location (GEOGRAPHY(POINT, 4326)) -- PostGIS for GPS
- address (JSONB) -- {region, assembly, town, street, postGPS, digital_address}
- land_tenure (ENUM: freehold, leasehold, customary, vested)
- land_parcel_id (VARCHAR(100)) -- Lands Commission reference
- traditional_authority (VARCHAR(255)) -- For customary lands
- specifications (JSONB) -- Flexible: {units, floor_area_sqm, floors, parking, amenities[]}
- total_budget_ghs (DECIMAL(15,2))
- total_budget_usd (DECIMAL(15,2))
- exchange_rate_locked (DECIMAL(10,4)) -- Rate when budget set
- start_date (DATE)
- estimated_completion (DATE)
- actual_completion (DATE, NULLABLE)
- status (ENUM: planning, active, on_hold, completed, cancelled, DEFAULT 'planning')
- hero_image_url (TEXT)
- created_by (UUID, FK → users.id)
- created_at (TIMESTAMPTZ, DEFAULT NOW())
- updated_at (TIMESTAMPTZ, DEFAULT NOW())
- deleted_at (TIMESTAMPTZ, NULLABLE) -- Soft delete

Constraints:
- CHECK (total_budget_ghs > 0)
- CHECK (estimated_completion > start_date)
- Unique (organization_id, land_parcel_id) WHERE land_parcel_id IS NOT NULL
```

**2. Budgets Table**
```
Table: budgets
Purpose: Multi-category budget tracking with currency support
Estimated Rows: 100,000+ (10 categories × 10,000 projects)
Partitioning: None
Indexes: 3 (project_id, category, variance_pct)

Key Columns:
- id (UUID, PK)
- project_id (UUID, FK → projects.id, ON DELETE CASCADE)
- category (ENUM: land_acquisition, professional_fees, construction, utilities, 
           regulatory, marketing, contingency, other)
- planned_amount_ghs (DECIMAL(15,2), NOT NULL)
- planned_amount_usd (DECIMAL(15,2)) -- Optional secondary currency
- exchange_rate (DECIMAL(10,4)) -- Rate when budget created
- actual_amount_ghs (DECIMAL(15,2), DEFAULT 0)
- variance_ghs (DECIMAL(15,2) GENERATED) -- actual - planned
- variance_pct (DECIMAL(5,2) GENERATED) -- (actual - planned) / planned * 100
- notes (TEXT)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

Generated Columns (Computed):
- variance_ghs = actual_amount_ghs - planned_amount_ghs
- variance_pct = ((actual_amount_ghs - planned_amount_ghs) / NULLIF(planned_amount_ghs, 0)) * 100

Triggers:
- After UPDATE on expenses → recalculate actual_amount_ghs
- After INSERT/UPDATE → if variance_pct > 95%, create alert notification
```

**3. Tasks Table**
```
Table: tasks
Purpose: Gantt chart tasks with dependencies and Ghana construction phases
Estimated Rows: 500,000+ (50 tasks × 10,000 projects)
Partitioning: By project_id (hash partitioning for large orgs)
Indexes: 5 (project_id, status, assigned_to, due_date, parent_task_id)

Key Columns:
- id (UUID, PK)
- project_id (UUID, FK → projects.id, ON DELETE CASCADE)
- parent_task_id (UUID, FK → tasks.id, NULLABLE) -- For subtasks
- name (VARCHAR(500), NOT NULL)
- description (TEXT)
- phase (ENUM: land_acquisition, planning, pre_construction, construction, 
         finishing, handover) -- Ghana standard phases
- assigned_to (UUID, FK → users.id)
- start_date (DATE, NOT NULL)
- due_date (DATE, NOT NULL)
- actual_start_date (DATE)
- actual_completion_date (DATE)
- progress_pct (DECIMAL(5,2), DEFAULT 0) -- 0-100%
- estimated_hours (DECIMAL(8,2))
- actual_hours (DECIMAL(8,2))
- status (ENUM: not_started, in_progress, blocked, completed, cancelled, DEFAULT 'not_started')
- priority (ENUM: low, medium, high, critical, DEFAULT 'medium')
- is_milestone (BOOLEAN, DEFAULT false)
- dependencies (UUID[], ARRAY) -- Array of task IDs this task depends on
- metadata (JSONB) -- {checklist[], attachments[], custom_fields}
- created_by (UUID)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

Constraints:
- CHECK (progress_pct >= 0 AND progress_pct <= 100)
- CHECK (due_date >= start_date)
- CHECK (actual_completion_date >= actual_start_date)

Recursive Query Support:
- Task hierarchy (parent → child → grandchild)
- Critical path calculation (dependency chain)
```

**4. Compliance_Documents Table**
```
Table: compliance_documents
Purpose: Ghana permit tracking with expiration alerts
Estimated Rows: 60,000+ (6 permits × 10,000 projects)
Partitioning: None
Indexes: 4 (project_id, document_type, status, expiry_date)

Key Columns:
- id (UUID, PK)
- project_id (UUID, FK → projects.id, ON DELETE CASCADE)
- document_type (ENUM: land_title_certificate, site_plan, development_permit, 
                building_permit, commencement_permit, epa_permit, 
                epa_screening_report, fire_safety_certificate, 
                habitation_certificate, other)
- file_url (TEXT) -- S3/MinIO object URL
- file_name (VARCHAR(500))
- file_size_bytes (BIGINT)
- mime_type (VARCHAR(100))
- status (ENUM: not_started, application_submitted, under_review, 
          approved, rejected, expired, DEFAULT 'not_started')
- issuing_authority (VARCHAR(255)) -- e.g., "Accra Metropolitan Assembly"
- authority_location (VARCHAR(255)) -- e.g., "Greater Accra Region"
- application_date (DATE)
- approval_date (DATE)
- expiry_date (DATE) -- Critical for renewal alerts
- renewal_required (BOOLEAN, DEFAULT false)
- cost_ghs (DECIMAL(10,2))
- assigned_officer_name (VARCHAR(255)) -- Contact at authority
- assigned_officer_phone (VARCHAR(20))
- assigned_officer_email (VARCHAR(255))
- reference_number (VARCHAR(100)) -- Authority's tracking number
- notes (TEXT)
- created_by (UUID)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

Ghana-Specific Logic:
- Building permits in Accra Metro: expiry_date = approval_date + 2 years
- EPA permits: renewal_required = true if project duration > 3 years
- Habitation certificate: requires fire_safety_certificate.status = 'approved'

Triggers:
- Daily cron job: Check expiry_date - 90 days → send renewal reminder
- On UPDATE status = 'approved' → check if unlocks dependent permits
```

**5. Documents Table**
```
Table: documents
Purpose: General project documents with version control
Estimated Rows: 200,000+ (20 docs × 10,000 projects)
Partitioning: By created_at (monthly partitions for scalability)
Indexes: 5 (project_id, folder_path, uploaded_by, created_at, GIN on tags)

Key Columns:
- id (UUID, PK)
- project_id (UUID, FK → projects.id, ON DELETE CASCADE)
- parent_document_id (UUID, FK → documents.id, NULLABLE) -- For versions
- version_number (INTEGER, DEFAULT 1)
- folder_path (VARCHAR(500)) -- e.g., "/Land & Legal/Survey Plans"
- file_name (VARCHAR(500), NOT NULL)
- file_url (TEXT, NOT NULL) -- S3 presigned URL
- file_size_bytes (BIGINT)
- mime_type (VARCHAR(100))
- checksum_sha256 (VARCHAR(64)) -- File integrity verification
- tags (TEXT[], ARRAY) -- e.g., {'blueprint', 'approved', '2026-Q1'}
- description (TEXT)
- is_public (BOOLEAN, DEFAULT false) -- Client portal visibility
- access_control (JSONB) -- {allowed_roles[], allowed_users[]}
- uploaded_by (UUID, FK → users.id)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
- deleted_at (TIMESTAMPTZ)

Version Control:
- Insert new row with parent_document_id = previous version's id
- Increment version_number
- Keep all versions for audit trail
```

**6. Site_Logs Table**
```
Table: site_logs
Purpose: Daily construction site activity logs (Ghana contractor standard)
Estimated Rows: 1,000,000+ (100 logs × 10,000 projects over 2 years)
Partitioning: By created_at (monthly partitions)
Indexes: 3 (project_id, log_date, created_by)

Key Columns:
- id (UUID, PK)
- project_id (UUID, FK → projects.id, ON DELETE CASCADE)
- log_date (DATE, NOT NULL)
- weather (ENUM: sunny, cloudy, rainy, stormy) -- Ghana rainy season tracking
- temperature_celsius (DECIMAL(4,1))
- work_hours_start (TIME)
- work_hours_end (TIME)
- workers_present (INTEGER)
- workers_absent (INTEGER)
- activities_completed (TEXT[]) -- e.g., ['Poured foundation slab', 'Installed 500 blocks']
- materials_delivered (JSONB) -- [{material: 'Cement', quantity: 50, unit: 'bags', supplier: 'GHACEM'}]
- equipment_used (JSONB) -- [{equipment: 'Concrete mixer', hours: 6}]
- safety_incidents (TEXT) -- Any injuries/near-misses
- issues_encountered (TEXT) -- Delays, material shortages, etc.
- photos (TEXT[], ARRAY) -- URLs to site photos
- supervisor_signature_url (TEXT) -- Digital signature image
- notes (TEXT)
- created_by (UUID, FK → users.id) -- Site supervisor/foreman
- created_at (TIMESTAMPTZ)

Ghana Construction Context:
- Weather critical: Rainy season (April-June, Sept-Nov) impacts progress
- Worker attendance: Track for payroll (daily wages common in Ghana)
- Material delivery: Ghana supply chain can be unreliable, daily tracking essential
```

**Data Retention & Archival Policy:**

| Data Type | Active Retention | Archive After | Permanent Delete |
|-----------|------------------|---------------|------------------|
| Active Projects | Indefinite | N/A | Never (archive only) |
| Completed Projects | 5 years | 5 years → AWS Glacier | After 10 years (regulatory limit) |
| Site Logs | 2 years | 2 years → compressed JSON | After 7 years |
| Documents | Project lifetime + 7 years | N/A | After legal requirement expires |
| Audit Logs | 3 years | 3 years → cold storage | After 10 years |
| User Sessions | 30 days | N/A | After 30 days |
| Error Logs | 90 days | 90 days → Elasticsearch archive | After 1 year |

#### 6.1.4 API Design Specifications

**RESTful API Standards:**

**Base URL Structure:**
```
Production: https://api.finmarketiq.com/pm/v1
Staging: https://api-staging.finmarketiq.com/pm/v1
Development: http://localhost:8000/v1

Ghana Regional Endpoints (Future):
https://api-accra.finmarketiq.com/pm/v1  -- Ghana primary
https://api-lagos.finmarketiq.com/pm/v1  -- Nigeria failover
```

**API Versioning Strategy:**
- URL-based versioning: `/v1/`, `/v2/`
- Maintain v1 for 12 months after v2 release
- Deprecation warnings in response headers: `X-API-Deprecation: true; sunset=2027-12-31`

**Standard Response Format:**

**Success Response (200, 201):**
```json
{
  "status": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Cantonments Luxury Apartments",
    "type": "residential",
    "status": "active"
  },
  "meta": {
    "timestamp": "2026-01-21T14:30:00Z",
    "request_id": "req_abc123xyz",
    "api_version": "v1"
  }
}
```

**Paginated Response (200):**
```json
{
  "status": "success",
  "data": [
    {"id": "...", "name": "Project 1"},
    {"id": "...", "name": "Project 2"}
  ],
  "pagination": {
    "page": 1,
    "per_page": 25,
    "total_pages": 10,
    "total_items": 247,
    "has_next": true,
    "has_prev": false,
    "next_page_url": "/v1/projects?page=2",
    "prev_page_url": null
  },
  "meta": {
    "timestamp": "2026-01-21T14:30:00Z",
    "request_id": "req_abc123xyz"
  }
}
```

**Error Response (4xx, 5xx):**
```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid project type provided",
    "details": {
      "field": "project_type",
      "value": "invalid_type",
      "allowed_values": ["residential", "commercial", "mixed_use", "land_dev", "infrastructure"]
    },
    "documentation_url": "https://docs.finmarketiq.com/errors/VALIDATION_ERROR"
  },
  "meta": {
    "timestamp": "2026-01-21T14:30:00Z",
    "request_id": "req_abc123xyz"
  }
}
```

**Core API Endpoints (50+ Total):**

**Projects API:**
```
GET    /v1/projects                    # List all projects (paginated)
POST   /v1/projects                    # Create new project
GET    /v1/projects/{id}               # Get project details
PATCH  /v1/projects/{id}               # Update project (partial)
DELETE /v1/projects/{id}               # Soft delete project
GET    /v1/projects/{id}/statistics    # Project metrics (budget, timeline, compliance)
GET    /v1/projects/{id}/timeline      # Gantt chart data
GET    /v1/projects/{id}/team          # Team assignments
POST   /v1/projects/{id}/duplicate     # Clone project template
GET    /v1/projects/search             # Full-text search with filters

Query Parameters:
- status: planning|active|on_hold|completed|cancelled
- region: greater_accra|ashanti|western|... (Ghana regions)
- assembly: accra_metro|tema_metro|... (260+ assemblies)
- budget_min, budget_max: filter by total budget (GHS)
- created_after, created_before: date range
- sort: name|created_at|budget|status (default: -created_at for descending)
- page, per_page: pagination (default: page=1, per_page=25)
```

**Budgets API:**
```
GET    /v1/projects/{id}/budgets               # List all budget categories
POST   /v1/projects/{id}/budgets               # Create budget line item
PATCH  /v1/budgets/{budget_id}                 # Update budget
DELETE /v1/budgets/{budget_id}                 # Delete budget
GET    /v1/budgets/{budget_id}/expenses        # List expenses for category
POST   /v1/budgets/{budget_id}/expenses        # Log new expense
GET    /v1/projects/{id}/budgets/summary       # Aggregated budget metrics
GET    /v1/projects/{id}/budgets/forecast      # AI-powered budget forecast
POST   /v1/projects/{id}/budgets/export        # Export to Excel/CSV

Response Example (Budget Summary):
{
  "total_planned_ghs": 5000000.00,
  "total_actual_ghs": 3750000.00,
  "variance_ghs": -1250000.00,
  "variance_pct": -25.00,
  "utilization_pct": 75.00,
  "status": "on_track",  // on_track|warning|critical
  "categories": [
    {
      "category": "land_acquisition",
      "planned_ghs": 1500000.00,
      "actual_ghs": 1500000.00,
      "variance_pct": 0.00
    }
  ],
  "currency_conversion": {
    "total_planned_usd": 350000.00,
    "exchange_rate": 14.29,
    "last_updated": "2026-01-21T00:00:00Z"
  }
}
```

**Compliance API:**
```
GET    /v1/projects/{id}/compliance                 # All permits/documents
POST   /v1/projects/{id}/compliance                 # Create compliance record
PATCH  /v1/compliance/{doc_id}                      # Update status
DELETE /v1/compliance/{doc_id}                      # Delete (admin only)
POST   /v1/compliance/{doc_id}/upload               # Upload document file
GET    /v1/compliance/{doc_id}/download             # Download document
GET    /v1/projects/{id}/compliance/score           # Compliance score (0-100)
GET    /v1/projects/{id}/compliance/expiring        # Permits expiring in N days
POST   /v1/compliance/{doc_id}/renew                # Initiate renewal process
GET    /v1/compliance/templates                     # Ghana permit templates
GET    /v1/compliance/authorities                   # List authorities by region

Ghana-Specific Endpoints:
GET    /v1/compliance/authorities/assemblies        # All 260+ assemblies
GET    /v1/compliance/authorities/assemblies/{assembly_id}/requirements
       # Required permits for specific assembly
GET    /v1/compliance/average-approval-times        # Historical data by permit type + location
```

**Tasks API:**
```
GET    /v1/projects/{id}/tasks                 # List all tasks (Gantt data)
POST   /v1/projects/{id}/tasks                 # Create task
PATCH  /v1/tasks/{task_id}                     # Update task
DELETE /v1/tasks/{task_id}                     # Delete task
POST   /v1/tasks/{task_id}/subtasks            # Create subtask
GET    /v1/tasks/{task_id}/dependencies        # Get dependency chain
POST   /v1/tasks/{task_id}/dependencies        # Add dependency
GET    /v1/projects/{id}/tasks/critical-path   # Calculate critical path
POST   /v1/tasks/{task_id}/progress            # Update progress %
GET    /v1/projects/{id}/tasks/overdue         # Overdue tasks
POST   /v1/projects/{id}/tasks/bulk-update     # Reschedule multiple tasks

Gantt Chart Response:
{
  "tasks": [
    {
      "id": "task_001",
      "name": "Land Title Registration",
      "start_date": "2026-02-01",
      "end_date": "2026-03-15",
      "duration_days": 43,
      "progress": 75,
      "dependencies": [],
      "assigned_to": {"id": "user_123", "name": "John Mensah"},
      "phase": "land_acquisition",
      "is_milestone": true,
      "is_critical_path": true
    }
  ],
  "milestones": [
    {"id": "milestone_1", "name": "Land Title Approved", "date": "2026-03-15"}
  ]
}
```

**Documents API:**
```
GET    /v1/projects/{id}/documents                 # List all documents
POST   /v1/projects/{id}/documents/upload          # Upload document
GET    /v1/documents/{doc_id}                      # Get document metadata
DELETE /v1/documents/{doc_id}                      # Delete document
GET    /v1/documents/{doc_id}/download             # Generate presigned download URL
GET    /v1/documents/{doc_id}/versions             # Version history
POST   /v1/documents/{doc_id}/new-version          # Upload new version
GET    /v1/projects/{id}/documents/folders         # Folder structure
POST   /v1/projects/{id}/documents/folders         # Create folder
GET    /v1/documents/search                        # Search across documents (OCR support)
POST   /v1/documents/{doc_id}/share                # Generate public share link
```

**Analytics API:**
```
GET    /v1/analytics/dashboard                     # Executive dashboard metrics
GET    /v1/analytics/projects/{id}/performance     # Project performance report
GET    /v1/analytics/budget-trends                 # Portfolio budget analysis
GET    /v1/analytics/timeline-adherence            # On-time completion rates
GET    /v1/analytics/compliance-status             # Permit approval rates
GET    /v1/analytics/regional-distribution         # Projects by Ghana region
GET    /v1/analytics/vendor-performance            # Contractor scorecards
POST   /v1/analytics/reports/generate              # Custom report builder
GET    /v1/analytics/forecasts/budget              # AI budget predictions
GET    /v1/analytics/forecasts/timeline            # AI timeline predictions
```

**Authentication & Authorization:**
```
POST   /v1/auth/register                 # User registration
POST   /v1/auth/login                    # Login (returns JWT)
POST   /v1/auth/refresh                  # Refresh access token
POST   /v1/auth/logout                   # Logout (invalidate token)
POST   /v1/auth/forgot-password          # Request password reset
POST   /v1/auth/reset-password           # Reset password with token
GET    /v1/auth/me                       # Get current user profile
PATCH  /v1/auth/me                       # Update profile
POST   /v1/auth/verify-email             # Email verification
POST   /v1/auth/resend-verification      # Resend verification email
```

**API Performance Targets:**

| Metric | Target | Ghana Context |
|--------|--------|---------------|
| **Response Time (p95)** | <500ms | On 3G network in Accra |
| **Response Time (p99)** | <1000ms | On 2G network in rural areas |
| **Throughput** | 1000 req/sec | Per API server instance |
| **Availability** | 99.5% uptime | Excluding scheduled maintenance |
| **Error Rate** | <1% | 5xx errors only |
| **Payload Size** | <100KB | Single resource response |
| **Pagination** | Max 100 items | Per page (default 25) |

**Rate Limiting:**
```
Free Tier: 100 requests/hour per IP
Basic Plan: 1,000 requests/hour per API key
Professional: 10,000 requests/hour
Enterprise: Unlimited (with throttling at 50,000 req/hour)

Headers:
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1642867200 (Unix timestamp)
```

---

## 7. INTEGRATION ECOSYSTEM

### 7.1 Third-Party Integrations Architecture

#### 7.1.1 Integration Strategy

**Integration Patterns:**
1. **API-Based Integrations:** Direct REST/GraphQL API connections
2. **Webhook Subscriptions:** Real-time event notifications
3. **OAuth2 Authentication:** Secure delegated access
4. **File-Based Integrations:** CSV/Excel import/export for legacy systems
5. **Middleware Layer:** Zapier/n8n for no-code integrations

**Integration Principles:**
- **Loose Coupling:** Integrations fail gracefully without breaking core system
- **Retry Logic:** Exponential backoff for failed API calls (3 retries, 2^n seconds delay)
- **Timeout Management:** 10-second timeout for external APIs
- **Circuit Breaker:** Disable integration after 5 consecutive failures
- **Audit Trail:** Log all external API calls for debugging

#### 7.1.2 Ghana Financial System Integrations

**Mobile Money Integration (Critical for Ghana Market):**

**Supported Providers:**
- **MTN Mobile Money** (55% market share in Ghana)
- **Vodafone Cash** (25% market share)
- **AirtelTigo Money** (15% market share)

**Integration Method:**
- **API Provider:** Hubtel Payment Gateway (Ghana aggregator)
- **Protocol:** REST API with HMAC-SHA256 authentication
- **Use Cases:**
  - Collect milestone payments from clients
  - Pay contractors/vendors on-site
  - Track mobile money receipts
  - Reconcile payments to project budgets

**Sample Workflow:**
```
1. Project Manager creates payment request in system
2. System generates payment link via Hubtel API
3. Client receives SMS with payment instructions
4. Client pays via MTN MoMo (e.g., dial *170#)
5. Hubtel webhook notifies system of successful payment
6. System auto-updates budget actual_amount_ghs
7. Receipt PDF auto-generated and emailed to client
```

**API Endpoints (Hubtel):**
```
POST /v1/payments/mobile-money/charge     # Initiate payment request
GET  /v1/payments/{transaction_id}/status # Check payment status
POST /v1/payments/refund                  # Process refund
GET  /v1/payments/transactions            # List all transactions

Webhook Events:
- payment.success
- payment.failed
- payment.pending
- refund.completed
```

**Bank Integration:**

**Supported Banks (Ghana):**
- Ghana Commercial Bank (GCB)
- Ecobank Ghana
- Stanbic Bank Ghana
- Fidelity Bank Ghana
- Zenith Bank Ghana

**Integration Method:**
- **Protocol:** SWIFT MT940 statements (batch import)
- **Fallback:** Manual CSV upload for banks without API
- **Use Case:** Reconcile bank transfers to project budgets

**Currency Exchange Integration:**

**Provider:** Bank of Ghana Official API
**Endpoint:** `https://www.bog.gov.gh/treasury-and-the-markets/historical-interbank-fx-rates/`
**Update Frequency:** Daily at 9:00 AM GMT
**Currencies Tracked:** USD, GBP, EUR, NGN (for cross-border projects)

**Exchange Rate Logic:**
```
1. Daily cron job fetches BoG rates at 9:05 AM GMT
2. Store rates in Redis cache (24-hour TTL)
3. All budget displays use cached rates
4. Historical rates stored in PostgreSQL for trend analysis
5. Alert if GHS/USD variance >5% in 7 days (budget impact warning)
```

#### 7.1.3 Ghana Regulatory System Integrations

**Lands Commission Integration (Future - API Not Yet Available):**

**Current Workaround:**
- Manual document upload portal
- OCR scan of land title certificates to extract parcel ID
- Manual verification against Lands Commission website

**Planned Integration (When API Available):**
```
GET  /lands-commission/parcels/{parcel_id}/status
POST /lands-commission/title-search
GET  /lands-commission/parcels/{parcel_id}/ownership-history
POST /lands-commission/registration/submit
```

**Expected Benefits:**
- Instant verification of land titles
- Auto-populate project location from parcel ID
- Alert if land has encumbrances/litigation
- Track registration application status

**Metropolitan/Municipal Assembly Integration:**

**Current Status:** No standardized API across 260+ assemblies
**Workaround Strategy:**
- Assembly-specific workflow templates
- Manual tracking of permit applications
- Crowdsourced approval time data

**Pilot Integration (Accra Metropolitan Assembly):**
- **Partner:** AMA Digital Services Team
- **Method:** Custom REST API for building permit status checks
- **Scope:** 
  - Submit permit applications digitally
  - Check application status
  - Receive approval notifications
  - Pay permit fees online

**Sample Integration (Accra Metro Pilot):**
```
POST /ama-api/v1/permits/building/apply
GET  /ama-api/v1/permits/{permit_id}/status
POST /ama-api/v1/permits/{permit_id}/payment
GET  /ama-api/v1/permits/{permit_id}/download

Response:
{
  "permit_id": "AMA-BP-2026-0234",
  "status": "under_review",
  "submitted_date": "2026-01-15",
  "expected_approval_date": "2026-05-15",
  "assigned_officer": "Kwame Asante",
  "officer_phone": "+233244123456",
  "review_stage": "technical_review",
  "documents_pending": []
}
```

**Environmental Protection Agency (EPA) Integration:**

**Integration Status:** Planned for Phase 2
**Method:** Email-based submission with manual tracking (current EPA process)
**Future API Scope:**
- Submit EIA screening forms
- Track EIA review progress
- Schedule site inspections
- Receive digital EPA permits

#### 7.1.4 Real Estate & Construction Integrations

**MLS/Property Listing Integration:**

**Ghana Property Portals:**
- **Meqasa.com** (Leading Ghana property portal)
- **PropertyPro Ghana**
- **Tonaton.com** (Classifieds)

**Integration Use Case:**
- Auto-publish completed units for sale/rent
- Sync project details to listing (photos, floor plans, prices)
- Track leads/inquiries back to CRM

**API Example (Meqasa):**
```
POST /meqasa-api/v1/listings/create
{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "property_type": "apartment",
  "bedrooms": 3,
  "price_ghs": 450000,
  "location": {
    "region": "Greater Accra",
    "town": "Cantonments"
  },
  "photos": ["url1", "url2"],
  "description": "...",
  "agent_contact": "+233244123456"
}
```

**Accounting Software Integration:**

**QuickBooks Online:**
- **Integration Method:** OAuth2 + QuickBooks API
- **Sync Frequency:** Real-time for invoices, daily for reports
- **Data Flow:**
  - Export budgets as QuickBooks estimates
  - Sync expenses to QuickBooks bills
  - Import vendor payments
  - Generate financial reports

**Tally ERP (Popular in Ghana SMEs):**
- **Integration Method:** XML export/import
- **Sync Frequency:** Weekly batch
- **Use Case:** For developers already using Tally for accounting

**CRM Integration:**

**HubSpot CRM:**
- **Use Case:** Manage buyer relationships for residential projects
- **Data Flow:**
  - Sync project details to HubSpot deals
  - Track buyer inquiries
  - Automate follow-up emails based on project milestones

**Custom CRM (FinmarketIQ Trading Book):**
- **Integration Method:** Internal API calls
- **Use Case:** 
  - Link projects to investor/broker contacts
  - Track investment commitments
  - Share project updates with stakeholders

#### 7.1.5 Communication & Collaboration Integrations

**WhatsApp Business API:**

**Provider:** Twilio WhatsApp Business API
**Use Cases:**
- Send project updates to stakeholder groups
- Automated permit expiration reminders
- Budget alert notifications
- Site supervisor daily log reminders
- Client payment reminders

**Message Templates (Pre-Approved by WhatsApp):**
```
Template: project_milestone_completed
Language: English
Content: "🎉 {{project_name}} milestone achieved: {{milestone_name}}. 
View progress: {{dashboard_url}}. Reply STOP to unsubscribe."

Template: permit_expiring_soon
Language: English
Content: "⚠️ {{permit_name}} for {{project_name}} expires on {{expiry_date}}. 
Renew now: {{renewal_url}}"

Template: budget_alert
Language: English
Content: "💰 {{project_name}} budget alert: {{category}} is at {{percentage}}% 
utilization. Review: {{budget_url}}"
```

**Slack Integration:**

**Use Cases:**
- Project channel auto-creation
- Budget alerts to #finance channel
- Permit approvals to #compliance channel
- Daily site log summaries to #construction channel

**Webhook Configuration:**
```
Event: budget_threshold_exceeded
Slack Channel: #finance
Message Format:
{
  "text": "🚨 Budget Alert",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Project:* Cantonments Luxury Apartments\n*Category:* Construction\n*Status:* 95% utilized"
      }
    },
    {
      "type": "actions",
      "elements": [
        {"type": "button", "text": "View Budget", "url": "https://app.finmarketiq.com/projects/123/budget"}
      ]
    }
  ]
}
```

**Email Integration:**

**Provider:** GMAIL (transactional emails)
**Use Cases:**
- Welcome emails (user registration)
- Password reset
- Weekly project summaries
- Monthly reports to stakeholders
- Invoice notifications

**Email Templates:**
```
Template: weekly_project_summary
Subject: {{project_name}} - Week {{week_number}} Summary
Content:
- Progress: {{progress_pct}}% complete
- Budget: {{budget_utilized_pct}}% utilized
- Key milestones this week: {{milestones_list}}
- Upcoming tasks: {{next_tasks_list}}
- Photos: {{site_photos_grid}}
```

**Google Workspace Integration:**

**Google Drive:**
- Auto-upload project documents to shared Drive folder
- Sync document changes bidirectionally

**Google Calendar:**
- Sync project milestones to team calendars
- Create events for inspections, meetings

**Google Sheets:**
- Export budget reports to Sheets for custom analysis
- Import material price lists from supplier Sheets

#### 7.1.6 AI & Machine Learning Integrations

**OpenAI gemini flash 2 Integration (Kobby Assistant):**

**Use Cases:**
- Natural language queries ("How much have I spent on steel?")
- Auto-generate site log summaries
- Draft compliance documents from templates
- Translate documents (English ↔ Twi)

**API Configuration:**
```
Model: gemini flash
Temperature: 0.3 (for factual queries)
Max Tokens: 1000
System Prompt: "You are Kobby, an AI assistant for Ghana real estate project 
management. Provide concise, accurate answers using data from the FinmarketIQ 
platform. Always cite sources and use Ghana-specific terminology."
```

**Predictive Analytics Models (Custom ML):**

**Budget Overrun Prediction:**
- **Algorithm:** XGBoost regression
- **Features:** Project type, size, location, current variance, timeline progress, Ghana economic indicators (cement prices, GDP growth, inflation)
- **Training Data:** Historical projects (3,000+ completed projects)
- **Retraining:** Quarterly with new data

**Timeline Delay Forecasting:**
- **Algorithm:** LSTM neural network
- **Features:** Task completion velocity, weather data (Ghana rainy season), permit approval delays, contractor performance history
- **Output:** Probability distribution of completion dates
- **Accuracy Target:** 80%+ for projects >30% complete

**Permit Approval Time Prediction:**
- **Algorithm:** Random Forest classification
- **Features:** Assembly, project type, document completeness score, historical approval times
- **Output:** Expected approval date range with confidence interval
- **Data Source:** Crowdsourced from all platform users (anonymized)

---

## 8. SECURITY & COMPLIANCE

### 8.1 Security Architecture

#### 8.1.1 Authentication & Authorization

**Authentication Methods:**

**1. JWT-Based Authentication (Primary):**
```
Flow:
1. User submits email + password to /auth/login
2. Server validates credentials against PostgreSQL users table (bcrypt hashed)
3. Server generates JWT with payload:
   {
     "user_id": "550e8400-e29b-41d4-a716-446655440000",
     "email": "john@example.com",
     "organization_id": "org_123",
     "roles": ["project_manager", "budget_viewer"],
     "exp": 1642867200  // 15 minutes expiry
   }
4. Server signs JWT with RS256 (private key)
5. Client receives access_token (15 min) + refresh_token (7 days)
6. Client includes access_token in Authorization: Bearer header for all requests
7. When access_token expires, client uses refresh_token to get new access_token
8. Refresh tokens stored in Redis with user_id as key (TTL: 7 days)
9. On logout, refresh_token removed from Redis (token invalidation)
```

**Token Storage:**
- **Web App:** HttpOnly cookies (prevents XSS attacks)
- **Mobile App:** Secure storage (iOS Keychain, Android Keystore)

**2. OAuth2 Social Login (Optional):**
- **Providers:** Google, Microsoft (for corporate users)
- **Use Case:** Quick signup without password management
- **Implementation:** NextAuth.js (web), react-native-app-auth (mobile)

**3. Multi-Factor Authentication (MFA):**
- **Method:** TOTP (Time-based One-Time Password) via Google Authenticator, Authy
- **Enforcement:** Required for admin roles, optional for standard users
- **Backup Codes:** 10 single-use backup codes generated on MFA setup

**Authorization Model:**

**Role-Based Access Control (RBAC):**

**System Roles:**
```
1. Super Admin (FinmarketIQ staff only)
   - Full system access
   - Manage organizations
   - View all projects across organizations

2. Organization Admin (Developer/Company owner)
   - Manage organization settings
   - Create/delete projects
   - Manage team members
   - View all organization projects
   - Configure billing

3. Project Manager
   - Full control over assigned projects
   - Manage project team
   - Approve budgets/expenses
   - Upload/edit documents
   - Update compliance status

4. Architect/Engineer/Consultant
   - View project details
   - Upload design documents
   - Comment on tasks
   - Read-only budget access

5. Contractor/Site Supervisor
   - View assigned tasks
   - Update task progress
   - Upload site logs
   - Submit expense requests
   - Read-only budget access (category totals only)

6. Client/Investor (Stakeholder)
   - View project dashboard (sanitized metrics)
   - Access client portal
   - View progress photos
   - Download public documents
   - No budget details

7. Accountant/Finance
   - Full budget access (all projects)
   - Approve expenses
   - Generate financial reports
   - Export to accounting software
   - No task management access
```

**Permission Matrix:**

| Resource | Super Admin | Org Admin | PM | Architect | Contractor | Client | Finance |
|----------|-------------|-----------|----|-----------|-----------:|--------|---------|
| Create Project | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit Project | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete Project | ✅ | ✅ | ⚠️ Own only | ❌ | ❌ | ❌ | ❌ |
| View Budget Details | ✅ | ✅ | ✅ | ⚠️ Read-only | ⚠️ Totals only | ❌ | ✅ |
| Approve Expenses | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Upload Documents | ✅ | ✅ | ✅ | ✅ | ⚠️ Site logs only | ❌ | ✅ |
| Update Compliance | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Team | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View Analytics | ✅ | ✅ | ✅ | ⚠️ Own projects | ⚠️ Task metrics | ⚠️ Public only | ✅ |

**Attribute-Based Access Control (ABAC) - Future Enhancement:**
```
Policy Example:
IF user.role == "Contractor" AND 
   task.assigned_to == user.id AND 
   task.status == "in_progress"
THEN ALLOW update_task_progress
```

#### 8.1.2 Data Security

**Encryption:**

**Data at Rest:**
- **Database:** PostgreSQL Transparent Data Encryption (TDE) with AES-256
- **File Storage:** S3 server-side encryption (SSE-S3 with AES-256)
- **Sensitive Fields:** Additional application-level encryption for:
  - User passwords (bcrypt with 12 rounds)
  - Payment card details (if stored - PCI-DSS compliant vault)
  - OAuth tokens (AES-256-GCM)
  - API keys (hashed with SHA-256)

**Data in Transit:**
- **TLS 1.3:** All API endpoints (HTTPS only, HTTP redirects to HTTPS)
- **Certificate Pinning:** Mobile apps pin FinmarketIQ SSL certificate
- **HSTS:** Strict-Transport-Security header (max-age=31536000)

**Secrets Management:**
- **Service:** AWS Secrets Manager / HashiCorp Vault
- **Stored Secrets:** Database passwords, API keys, encryption keys, JWT signing keys
- **Rotation:** Automatic rotation every 90 days
- **Access:** IAM role-based access (no hardcoded credentials)

**Data Masking:**
```
Sensitive Fields (Masked in Logs):
- Email: john.doe@example.com → j***e@example.com
- Phone: +233244123456 → +233***3456
- Bank Account: 1234567890 → ****7890
- API Keys: sk_live_1234567890abcdef → sk_live_***cdef

Implementation:
- Python logging filter to auto-mask before writing to logs
- Database triggers to log masked values in audit tables
```

#### 8.1.3 Application Security

**Input Validation:**
- **Server-Side:** Pydantic models validate all API inputs (type, length, format)
- **Client-Side:** Zod schemas validate forms (user experience, not security)
- **Sanitization:** HTML escaping to prevent XSS attacks
- **SQL Injection Prevention:** SQLAlchemy ORM (parameterized queries only)

**OWASP Top 10 Mitigation:**

| Threat | Mitigation Strategy |
|--------|---------------------|
| **A01: Broken Access Control** | RBAC enforcement on every API endpoint, unit tests for permissions |
| **A02: Cryptographic Failures** | TLS 1.3, AES-256 encryption, bcrypt for passwords (12 rounds) |
| **A03: Injection** | ORM usage (no raw SQL), input validation, Pydantic models |
| **A04: Insecure Design** | Threat modeling, security review in design phase |
| **A05: Security Misconfiguration** | Infrastructure-as-code (Terraform), automated security scans |
| **A06: Vulnerable Components** | Dependabot alerts, quarterly dependency updates, SCA tools |
| **A07: Authentication Failures** | MFA, JWT expiry, rate limiting, account lockout after 5 failed logins |
| **A08: Software & Data Integrity** | Code signing, checksum verification for uploads, audit logs |
| **A09: Security Logging Failures** | Centralized logging (ELK), SIEM integration, log retention (3 years) |
| **A10: Server-Side Request Forgery** | Whitelist external domains, validate URLs, disable redirects |

**Rate Limiting & DDoS Protection:**
```
Rate Limits (per IP address):
- Login endpoint: 5 requests/15 minutes (prevent brute force)
- Password reset: 3 requests/hour
- API endpoints: 1000 requests/hour (authenticated users)
- File uploads: 10 uploads/hour
- Public endpoints: 100 requests/hour

Implementation:
- Redis-based token bucket algorithm
- Cloudflare DDoS protection (L7 firewall rules)
- AWS WAF for API Gateway (block malicious IPs)
```

**Session Management:**
- **Session Timeout:** 15 minutes inactivity (web), 30 days (mobile with biometric re-auth)
- **Concurrent Sessions:** Max 3 active sessions per user (web + mobile + tablet)
- **Session Storage:** Redis with TTL
- **Logout:** Invalidate refresh token in Redis

#### 8.1.4 Infrastructure Security

**Network Security:**
```
VPC Architecture (AWS):
┌─────────────────────────────────────────────┐
│  Public Subnet (Internet-facing)            │
│  - ALB (Load Balancer)                      │
│  - NAT Gateway                              │
└─────────────────────────────────────────────┘
              │
┌─────────────────────────────────────────────┐
│  Private Subnet (Application)               │
│  - ECS/Fargate containers (API servers)     │
│  - Lambda functions                         │
└─────────────────────────────────────────────┘
              │
┌─────────────────────────────────────────────┐
│  Private Subnet (Data)                      │
│  - RDS PostgreSQL (no internet access)      │
│  - ElastiCache Redis                        │
│  - Elasticsearch                            │
└─────────────────────────────────────────────┘

Security Groups:
- ALB: Allow 443 from 0.0.0.0/0 (public HTTPS)
- API Servers: Allow 8000 from ALB security group only
- Database: Allow 5432 from API security group only
- Redis: Allow 6379 from API security group only
```

**Container Security:**
- **Base Images:** Official Python slim images (python:3.11-slim)
- **Image Scanning:** Trivy scans for CVEs before deployment
- **Non-Root User:** Containers run as user `appuser` (UID 1000)
- **Read-Only Filesystem:** Containers have read-only root filesystem
- **Secrets Injection:** Environment variables from AWS Secrets Manager

**Backup & Disaster Recovery:**
```
Backup Strategy:
- Database: Automated daily snapshots (RDS), retained 30 days
- Files: S3 versioning enabled, lifecycle policy to Glacier after 90 days
- Disaster Recovery RTO: 4 hours (Ghana business hours)
- Disaster Recovery RPO: 1 hour (max data loss)

Backup Testing:
- Monthly restore drill (restore to staging environment)
- Annual disaster recovery simulation
```

### 8.2 Compliance & Regulatory

#### 8.2.1 Data Protection (GDPR/Ghana Data Protection Act)

**Ghana Data Protection Act 2012 (Act 843) Compliance:**

**Key Requirements:**
1. **Lawful Processing:** User consent for data collection (explicit opt-in)
2. **Purpose Limitation:** Data used only for project management (stated in ToS)
3. **Data Minimization:** Collect only necessary fields
4. **Accuracy:** Allow users to update their info
5. **Storage Limitation:** Delete inactive accounts after 2 years
6. **Security:** Technical measures (encryption, access control)
7. **Accountability:** Data Protection Officer (DPO) appointed

**Implementation:**

**User Consent Management:**
```
Consent Form (Registration):
☑ I consent to FinmarketIQ processing my personal data for project management purposes
☑ I consent to receiving email notifications about my projects
☐ I consent to receiving marketing communications (optional)

Data Collected:
- Name, Email, Phone (mandatory for account creation)
- Company name, Role (for project collaboration)
- IP address, Device info (for security logging)

Data NOT Collected:
- National ID, Social Security Number (unless required for compliance documents)
- Biometric data (except optional Face ID/Touch ID for app unlock)
```

**Data Subject Rights:**
```
Rights under Ghana DPA:
1. Right to Access: Users can download all their data (JSON export)
2. Right to Rectification: Users can edit profile anytime
3. Right to Erasure: Users can request account deletion (30-day review period)
4. Right to Data Portability: Export projects to CSV/Excel
5. Right to Object: Opt-out of marketing emails (unsubscribe link)

Implementation:
- Self-service data export: /settings/privacy/download-data
- Account deletion: /settings/privacy/delete-account (requires password + MFA)
- Data retention after deletion: 90 days in soft-delete state (for recovery), then purged
```

**Cross-Border Data Transfers:**
- **Primary Data Center:** AWS eu-west-1 (Ireland) for GDPR compliance
- **Ghana Data Residency (Future):** AWS af-south-1 (Cape Town) when available in Ghana
- **Data Transfer Mechanism:** EU Standard Contractual Clauses (SCCs)

#### 8.2.2 Industry-Specific Compliance

**Real Estate Regulatory Compliance (Ghana):**

**Land Administration Regulations:**
- **Requirement:** Store land title certificates securely for 10+ years
- **Implementation:** Documents table with `deleted_at` NULL (never delete), S3 Glacier archival

**Construction Industry Compliance:**
- **Building Code Compliance:** Track adherence to Ghana Building Code
- **Safety Regulations:** Site log requires safety incident reporting
- **Permit Validity:** Auto-alert before expiration (building permits valid 2 years)

**Financial Reporting (If Publicly Traded Developers Use System):**
- **SOX Compliance:** Audit logs for all financial transactions
- **Financial Controls:** Approval workflows for budgets >GH₵ 100,000
- **Audit Trail:** Immutable logs in MongoDB (no updates/deletes)

#### 8.2.3 Accessibility Compliance

**WCAG 2.1 Level AA:**
- **Perceivable:** Alt text for images, captions for videos
- **Operable:** Keyboard navigation, focus indicators
- **Understandable:** Clear labels, error messages
- **Robust:** Semantic HTML, ARIA labels

**Ghana-Specific Accessibility:**
- **Low-Bandwidth Mode:** Text-only view for 2G networks
- **Offline Mode:** Service worker caches last 30 days of data
- **Language Support:** English (primary), Twi (future)

---

## 9. IMPLEMENTATION ROADMAP

### 9.0.0 IMPLEMENTATION STATUS TRACKER

> **Last Updated:** 2025-01-15
> **Status Legend:** ✅ Complete | 🔄 In Progress | ⏳ Pending | ❌ Blocked

---

#### PHASE 1: FOUNDATION & CORE ENHANCEMENTS (Weeks 1-4)

| Sprint | Deliverable | Status | Notes |
|--------|-------------|--------|-------|
| **Sprint 1-2** | **Location & Data Hub Integration** | | |
| | Migration 075: Administrative extensions | ✅ Complete | `traditional_authorities`, `assembly_regulatory_contacts`, `permit_types`, `project_permits` tables |
| | Migration 076: Ghana project enhancements | ✅ Complete | Added `ghana_post_gps`, `ghana_region`, `ghana_district`, `land_tenure_type`, `traditional_authority_id`, search vector, triggers |
| | Migration 077: Project drafts | ✅ Complete | `project_drafts`, `project_wizard_templates` tables with 5 wizard templates |
| | `projectLocationService.ts` | ✅ Complete | Ghana PostGPS validation, reverse geocoding, region/district lookups, address standardization |
| | `projectCostCurrencyService.ts` | ✅ Complete | Multi-currency support, FX conversion, budget variance with FX impact |
| | `projectWizardService.ts` | ✅ Complete | Draft management, smart defaults, permit requirements, cost estimation |
| | `projectDefaults.ts` | ✅ Complete | Ghana regions (16), land tenure types (4), project types (6), phase templates, amenities, permit logic |
| | API Routes (Phase 1) | ✅ Complete | Location validation, currency conversion, wizard endpoints, config endpoints |
| | Seed Data: Assemblies | ✅ Complete | 11 Greater Accra assembly regulatory contacts |
| | Seed Data: Permit Types | ✅ Complete | 9 permit types (DEV, BUILD, EPA, FIRE, GWCL, ECG, HABITATION, COMMENCEMENT, SIGNAGE) |
| | Seed Data: Wizard Templates | ✅ Complete | 5 templates (Apartment Complex, Gated Community, Office Building, Mixed Use, Custom Home) |
| | PostGIS geometry column | ⏳ Pending | Requires `brew install postgis` - `location_geom` column skipped |

**Phase 1 Backend Completion:** ✅ **100%** (excluding optional PostGIS)

---

#### PHASE 2: DASHBOARD & VISUALIZATION (Weeks 5-8)

| Sprint | Deliverable | Status | Notes |
|--------|-------------|--------|-------|
| **Sprint 3** | **Dashboard Metrics & Charts** | | |
| | Migration 078: Gantt enhancements | ✅ Complete | `project_milestones`, `project_baselines`, `milestone_templates`, `project_alerts` tables |
| | Phase columns: baseline dates, critical path | ✅ Complete | Added `baseline_start_date`, `baseline_end_date`, `is_critical_path`, `slack_days`, `dependency_ids` |
| | Seed Data: Milestone templates | ✅ Complete | 15 Ghana-specific milestone templates (permits, inspections, handovers) |
| | `dashboardAnalyticsService.ts` | ✅ Complete | Portfolio metrics, budget overview, timeline status, compliance status, health scores, EVM analysis, alerts, forecasting |
| | `milestoneService.ts` | ✅ Complete | CRUD, templates, Ghana-specific milestones, dependencies, statistics, bulk operations |
| | `ganttService.ts` | ✅ Complete | Gantt data, critical path calculation, phase date management, dependencies, baselines |
| | Dashboard API Routes | ✅ Complete | `/dashboard/metrics`, `/dashboard/budget-overview`, `/dashboard/timeline-status`, `/dashboard/compliance-status`, `/dashboard/alerts`, `/dashboard/upcoming-milestones`, `/dashboard/progress-trend` |
| | Alert Management Routes | ✅ Complete | Acknowledge, resolve, dismiss, snooze alert actions |
| **Sprint 4** | **Gantt Chart & Timeline** | | |
| | Milestone API Routes | ✅ Complete | CRUD, complete, reschedule, stats, Ghana template application |
| | Gantt API Routes | ✅ Complete | `/gantt`, `/gantt/calculate-critical-path`, `/gantt/phases/:phaseId/dates`, `/gantt/dependencies` |
| | Baseline API Routes | ✅ Complete | CRUD, set-active, comparison |
| | Project Health Score Endpoint | ✅ Complete | `/:id/health-score` |
| | Budget Variance Endpoint | ✅ Complete | `/:id/budget-variance` (EVM metrics) |
| | Forecast Completion Endpoint | ✅ Complete | `/:id/forecast-completion` |

**Phase 2 Backend Completion:** ✅ **100%**

---

#### PHASE 3-8: FUTURE PHASES

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 3 | Advanced Cost Management | ⏳ Pending |
| Phase 4 | Contractor & Vendor Portal | ⏳ Pending |
| Phase 5 | Compliance & Document Intelligence | ⏳ Pending |
| Phase 6 | Unit Sales & CRM Integration | ⏳ Pending |
| Phase 7 | Mobile Experience & PWA | ⏳ Pending |
| Phase 8 | AI & Analytics | ⏳ Pending |

---

#### FILES CREATED/MODIFIED

**Phase 1 Backend Files:**
```
backend/database/migrations/
├── 075_project_administrative_extensions.sql
├── 076_project_ghana_enhancements.sql
└── 077_project_drafts.sql

backend/src/services/project-management/
├── projectLocationService.ts (~1264 lines)
├── projectCostCurrencyService.ts (~603 lines)
├── projectWizardService.ts (~1058 lines)
└── projectDefaults.ts (static config)

backend/src/routes/projects.ts (extended with Phase 1 routes)
```

**Phase 2 Backend Files:**
```
backend/database/migrations/
└── 078_gantt_enhancements.sql

backend/src/services/project-management/
├── dashboardAnalyticsService.ts (~1200+ lines)
├── milestoneService.ts (~700+ lines)
└── ganttService.ts (~900+ lines)

backend/src/routes/projects.ts (extended with Phase 2 routes ~500+ lines added)
```

---

### 9.0 Architecture Integration Analysis

This implementation plan is designed to integrate seamlessly with the existing PROPMETRIK architecture defined in `architecture.md`. The project management module **does NOT create siloed implementations** - instead, it extends the existing platform by consuming shared services from the Data Hub and other modules.

**Existing Infrastructure:**
- Express.js + TypeScript backend with established service patterns
- PostgreSQL + PostGIS database with existing schema conventions
- Keycloak authentication and RBAC authorization system
- Existing project-management services: `projectService`, `phaseService`, `unitService`, `projectCostService`, `contractorService`, `drawService`, `dailyLogService`, `paymentPlanService`, `punchListService`
- Routes exposed via `/backend/src/routes/projects.ts`

---

### 9.0.1 CRITICAL: Existing Data Hub Services to Consume (NO DUPLICATION)

The project management module MUST consume these existing services from `/backend/src/services/data-hub/`:

#### Location & Geocoding Services (ALREADY IMPLEMENTED)

| Service | Path | Capabilities |
|---------|------|--------------|
| **ghanaPostGeocodingService** | `ghanaPostGeocodingService.ts` | Full Ghana PostGPS validation, district-level GPS prefixes, API + mathematical decoder fallback |
| **geocodingService** | `geocodingService.ts` | Mapbox + Google geocoding with Ghana bounds validation, caching, batch geocoding |
| **addressValidationService** | `addressValidationService.ts` | Cross-references GPS data, address enrichment, discrepancy detection |

**Ghana PostGPS Service Features (EXISTING):**
- 50+ district prefixes with precise bounding boxes (GA, GB, GC, AK, WS, etc.)
- Self-hosted API integration (`docker run -d -p 9091:9091 jayluxferro/ghanapostgps-api`)
- Public API fallback (`ghanapostgps.sperixlabs.org`)
- Mathematical grid decoder (last resort)
- 30-day cache TTL for GPS codes

**Usage in Project Management:**
```typescript
// In projectService.ts or new project-management services
import { ghanaPostService } from '../data-hub/ghanaPostGeocodingService';
import { geocodingService } from '../data-hub/geocodingService';
import { addressValidationService } from '../data-hub/addressValidationService';

// Example: Validate project location during creation
async function validateProjectLocation(gpsCode: string, coords?: { lat: number; lng: number }) {
  // Use existing ghanaPostService - DO NOT recreate
  const gpsResult = await ghanaPostService.geocode(gpsCode);
  if (gpsResult) {
    return {
      digitalAddress: gpsResult.digitalAddress,
      region: gpsResult.region,
      district: gpsResult.district,
      latitude: gpsResult.latitude,
      longitude: gpsResult.longitude,
      confidence: gpsResult.confidence,
    };
  }
  
  // Fallback to address validation if GPS code fails
  if (coords) {
    const reverseResult = await geocodingService.reverseGeocode(coords.lat, coords.lng);
    return reverseResult;
  }
  return null;
}
```

#### Foreign Exchange Services (ALREADY IMPLEMENTED)

| Service | Path | Capabilities |
|---------|------|--------------|
| **fxFeedService** | `scrapers/fxFeedService.ts` | Real-time GHS conversion, ForexRate-API + Yahoo Finance fallback |
| **economicDataService** | `economicDataService.ts` | Exchange rate history, economic indicators, Bank of Ghana data |

**FX Feed Service Features (EXISTING):**
- Primary: ForexRate-API (`FOREXRATE_API_KEY` env var)
- Fallback: Yahoo Finance
- Static fallback rates: `{ USD: 15.50, GBP: 19.50, EUR: 16.80, CNY: 2.15, NGN: 0.0095 }`
- Redis caching (5-minute TTL for live rates)
- `convertToGHS(amount, fromCurrency)` method
- Historical rate backfill capability

**Usage in Project Management:**
```typescript
// In projectCostService.ts or budget services
import { fxFeedService } from '../data-hub/scrapers/fxFeedService';
import { economicDataService } from '../data-hub/economicDataService';

// Example: Multi-currency budget display
async function getProjectBudgetWithConversions(projectId: string, displayCurrency: string = 'GHS') {
  const costs = await getProjectCosts(projectId);
  
  // Use existing fxFeedService - DO NOT recreate
  const totalGHS = costs.reduce((sum, c) => sum + c.amount_ghs, 0);
  
  if (displayCurrency !== 'GHS') {
    const rate = await fxFeedService.getCurrentRate(displayCurrency);
    return {
      amount: totalGHS / rate.rate,
      currency: displayCurrency,
      rate: rate.rate,
      source: rate.source,
      rateTimestamp: rate.timestamp,
    };
  }
  return { amount: totalGHS, currency: 'GHS' };
}

// Example: Historical budget variance with rate changes
async function getBudgetVarianceAnalysis(projectId: string) {
  const originalBudget = await getOriginalBudget(projectId);
  const currentSpend = await getCurrentSpend(projectId);
  
  // Get historical exchange rate at project start
  const historical = await fxFeedService.fetchHistoricalRate('USD', originalBudget.startDate);
  const current = await fxFeedService.getCurrentRate('USD');
  
  return {
    fxVariance: ((current.rate - historical.rate) / historical.rate) * 100,
    budgetVariance: ((currentSpend - originalBudget.amount) / originalBudget.amount) * 100,
  };
}
```

#### Construction Cost Services (ALREADY IMPLEMENTED)

| Service | Path | Capabilities |
|---------|------|--------------|
| **constructionCostService** | `constructionCostService.ts` | Material prices, labor rates, equipment costs by region |

**Construction Cost Service Features (EXISTING):**
- 15 material categories (cement, steel, timber, roofing, blocks, sand, etc.)
- 13 labor categories (mason, carpenter, plumber, electrician, etc.)
- Regional pricing for all 16 Ghana regions
- Skill level differentiation (apprentice → master)
- Price history and change tracking
- Supplier type support (retail, wholesale, manufacturer)

**Usage in Project Management:**
```typescript
// In projectCostService.ts for budget estimation
import { constructionCostService } from '../data-hub/constructionCostService';

// Example: Auto-estimate project costs based on type and region
async function estimateProjectCosts(projectType: string, region: string, sqm: number) {
  // Get current material prices for the project's region
  const materials = await constructionCostService.getMaterialPrices({ region });
  const labor = await constructionCostService.getLaborRates({ region });
  
  // Apply standard factors based on project type
  const costPerSqm = calculateCostPerSqm(materials, labor, projectType);
  
  return {
    estimatedTotal: costPerSqm * sqm,
    breakdown: {
      materials: costPerSqm * sqm * 0.55,
      labor: costPerSqm * sqm * 0.30,
      overhead: costPerSqm * sqm * 0.15,
    },
    basedOn: { region, surveyDate: materials[0]?.survey_date },
  };
}
```

#### ETL & Data Quality Services (ALREADY IMPLEMENTED)

| Service | Path | Capabilities |
|---------|------|--------------|
| **dataQualityService** | `dataQualityService.ts` | Quality scoring, validation |
| **dataEnrichmentService** | `etl/dataEnrichment.ts` | Property and project data enrichment |
| **addressStandardizationService** | `etl/addressStandardization.ts` | Address normalization |

---

**Integration Points (Using Existing Services):**
- CRM Module: Auto-create deals on unit sales (via `projectIntegrationService`)
- Data Hub: Property data enrichment, location intelligence, market insights
- Property Management: Link completed projects to property portfolios
- Valuation Engine: Unit valuations and project ROI calculations
- Document Service: Shared document storage and e-signature workflows

---

### 9.1 Phased Development Plan

---

## PHASE 1: FOUNDATION & CORE ENHANCEMENTS (Weeks 1-4)

**Goal:** Enhance existing project management foundation by integrating with Data Hub services and improving UX

### Sprint 1: Data Hub Integration & Location Enhancement (Week 1-2)

#### Backend Enhancements

**1.1 Project Location Integration (CONSUME EXISTING DATA HUB SERVICES)**

Instead of creating a new `locationService.ts`, we extend the existing `projectService.ts` to consume Data Hub services:

```typescript
// backend/src/services/project-management/projectService.ts - EXTEND, DON'T DUPLICATE

import { ghanaPostService, GHANA_GPS_DISTRICTS } from '../data-hub/ghanaPostGeocodingService';
import { geocodingService } from '../data-hub/geocodingService';
import { addressValidationService } from '../data-hub/addressValidationService';

// Extend CreateProjectInput to use validated location data
interface CreateProjectInput {
  // ... existing fields ...
  
  // Location fields - validated via Data Hub services
  ghana_post_gps?: string;        // Validated by ghanaPostService
  latitude?: number;               // Validated within Ghana bounds
  longitude?: number;
  
  // Derived from ghanaPostService.geocode() result
  region?: string;                 // Auto-populated from GPS validation
  district?: string;               // Auto-populated from GPS validation
  area?: string;                   // Auto-populated from GPS validation
}

// Add location validation to create method
async create(input: CreateProjectInput): Promise<DevelopmentProject> {
  // Validate and enrich location data using EXISTING Data Hub services
  let validatedLocation = null;
  
  if (input.ghana_post_gps) {
    // Use existing ghanaPostService - 50+ district prefixes already mapped
    const gpsResult = await ghanaPostService.geocode(input.ghana_post_gps);
    if (gpsResult && gpsResult.confidence >= 0.5) {
      validatedLocation = {
        ghana_post_gps: gpsResult.digitalAddress,
        latitude: gpsResult.latitude,
        longitude: gpsResult.longitude,
        region: gpsResult.region,      // From GHANA_GPS_DISTRICTS lookup
        district: gpsResult.district,
        area: gpsResult.area,
      };
    }
  } else if (input.latitude && input.longitude) {
    // Use existing geocodingService for reverse geocoding
    const reverseResult = await geocodingService.reverseGeocode(input.latitude, input.longitude);
    if (reverseResult) {
      validatedLocation = {
        latitude: input.latitude,
        longitude: input.longitude,
        region: reverseResult.region,
        district: reverseResult.district,
      };
    }
  }
  
  // Continue with project creation using validated location...
}
```

**1.2 Administrative Hierarchy (Supplement Data Hub with Project-Specific Tables)**

The Data Hub already has `GHANA_GPS_DISTRICTS` with 50+ district prefixes. We add project-specific administrative data:

```sql
-- Migration: 075_project_administrative_extensions.sql
-- NOTE: Leverages existing geocoding_cache and ghana bounds from Data Hub

-- Traditional authorities for customary land projects (Data Hub doesn't have this)
CREATE TABLE traditional_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  region VARCHAR(100) NOT NULL,
  district VARCHAR(100),
  paramount_chief VARCHAR(200),
  stool_land_area_km2 NUMERIC(10, 2),
  contact_info JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory bodies per assembly (project-specific, not in Data Hub)
CREATE TABLE assembly_regulatory_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_name VARCHAR(150) NOT NULL,
  region VARCHAR(100) NOT NULL,
  permit_office_address TEXT,
  permit_office_gps VARCHAR(20),      -- Validated via ghanaPostService
  permit_office_phone VARCHAR(50),
  permit_office_email VARCHAR(255),
  fire_service_contact JSONB,
  epa_regional_contact JSONB,
  lands_commission_contact JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup
CREATE INDEX idx_regulatory_assembly ON assembly_regulatory_contacts(assembly_name);
CREATE INDEX idx_regulatory_region ON assembly_regulatory_contacts(region);
```

**1.3 Multi-Currency Support (CONSUME EXISTING fxFeedService)**

**NO NEW CURRENCY SERVICE NEEDED** - Use existing `fxFeedService`:

```typescript
// backend/src/services/project-management/projectCostService.ts - EXTEND

import { fxFeedService } from '../data-hub/scrapers/fxFeedService';
import { economicDataService } from '../data-hub/economicDataService';

// Extend cost methods to support multi-currency display
class ProjectCostService {
  // ... existing methods ...

  /**
   * Get project costs with multi-currency conversion
   * Uses existing fxFeedService - DO NOT duplicate exchange rate logic
   */
  async getCostsWithConversion(
    projectId: string, 
    displayCurrency: 'GHS' | 'USD' | 'GBP' | 'EUR' = 'GHS'
  ): Promise<ProjectCostsMultiCurrency> {
    const costs = await this.getCostsByProject(projectId);
    
    if (displayCurrency === 'GHS') {
      return { costs, currency: 'GHS', rate: 1, source: 'base' };
    }
    
    // Use existing fxFeedService with ForexRate-API + Yahoo fallback
    const rateData = await fxFeedService.getCurrentRate(displayCurrency);
    
    return {
      costs: costs.map(c => ({
        ...c,
        amount_display: c.amount / rateData.rate,
        original_amount_ghs: c.amount,
      })),
      currency: displayCurrency,
      rate: rateData.rate,
      source: rateData.source,          // 'ForexRate-API' | 'Yahoo Finance' | 'Static Fallback'
      rateTimestamp: rateData.timestamp,
    };
  }

  /**
   * Get budget variance including FX impact
   * Uses existing economicDataService for historical rates
   */
  async getBudgetVarianceWithFX(projectId: string): Promise<BudgetVarianceAnalysis> {
    const project = await projectService.getById(projectId);
    const costs = await this.getCostsByProject(projectId);
    
    // Get rate at project start vs now using EXISTING economicDataService
    const startRate = await economicDataService.getExchangeRate('USD', project.start_date);
    const currentRate = await fxFeedService.getCurrentRate('USD');
    
    const budgetGHS = project.budget;
    const spentGHS = costs.reduce((sum, c) => sum + c.amount, 0);
    
    return {
      budgetVariance: ((spentGHS - budgetGHS) / budgetGHS) * 100,
      fxVariance: startRate 
        ? ((currentRate.rate - startRate.rate) / startRate.rate) * 100 
        : null,
      fxImpactGHS: startRate 
        ? (budgetGHS / startRate.rate) * (currentRate.rate - startRate.rate)
        : null,
    };
  }
}
```

**1.4 Enhanced Project Model Updates**
```sql
-- Migration: 076_project_ghana_enhancements.sql
-- NOTE: Uses region/district from ghanaPostService validation, not FK to separate tables

ALTER TABLE development_projects ADD COLUMN IF NOT EXISTS 
  ghana_post_gps VARCHAR(20),           -- Validated via ghanaPostService
  ghana_region VARCHAR(100),            -- Auto-populated from GPS validation
  ghana_district VARCHAR(100),          -- Auto-populated from GPS validation
  ghana_area VARCHAR(200),              -- Area name from GPS result
  traditional_authority_id UUID REFERENCES traditional_authorities(id),
  land_tenure_type VARCHAR(50) CHECK (land_tenure_type IN ('freehold', 'leasehold', 'customary', 'vested')),
  land_parcel_id VARCHAR(100),
  hero_image_url TEXT,
  funding_sources JSONB DEFAULT '[]'::jsonb,
  unit_mix JSONB DEFAULT '{}'::jsonb;

-- PostGIS location column (using existing geocoding validation)
ALTER TABLE development_projects ADD COLUMN IF NOT EXISTS 
  location GEOMETRY(POINT, 4326);

-- Index for spatial queries
CREATE INDEX IF NOT EXISTS idx_projects_location ON development_projects USING GIST (location);

-- Full-text search vector
ALTER TABLE development_projects ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_projects_search ON development_projects USING GIN (search_vector);

-- Trigger to update search vector
CREATE OR REPLACE FUNCTION update_project_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.city, '') || ' ' ||
    COALESCE(NEW.ghana_region, '') || ' ' ||
    COALESCE(NEW.ghana_district, '') || ' ' ||
    COALESCE(NEW.marketing_name, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_search_vector_update
  BEFORE INSERT OR UPDATE ON development_projects
  FOR EACH ROW EXECUTE FUNCTION update_project_search_vector();
```

#### Frontend Enhancements (Dashboard)

**1.5 Cascading Location Selector Component (Consumes Data Hub)**
```typescript
// dashboard/src/components/projects/LocationSelector.tsx
import { useGhanaPostValidation } from '@/hooks/useGhanaPostValidation';

interface LocationSelectorProps {
  value: GhanaLocation;
  onChange: (location: GhanaLocation) => void;
  showTraditionalAuthority?: boolean;
}

// Component calls backend endpoints that use ghanaPostService:
// POST /api/projects/validate-gps → calls ghanaPostService.geocode()
// POST /api/projects/reverse-geocode → calls geocodingService.reverseGeocode()

// Features:
// - Ghana PostGPS input with real-time validation (via ghanaPostService)
// - GPS coordinate capture (manual or geolocation API)
// - Auto-populate region/district/area from validation result
// - Confidence indicator based on ghanaPostService.confidence
// - Offline-capable with cached district prefixes (GHANA_GPS_DISTRICTS)
```

**1.6 Construction Cost Estimation (Consumes Data Hub)**
```typescript
// dashboard/src/components/projects/CostEstimator.tsx
// Consumes constructionCostService for material/labor prices

// Features:
// - Fetches regional material prices from constructionCostService
// - Fetches regional labor rates from constructionCostService
// - Auto-calculates estimate based on project sqm and type
// - Shows price sources and survey dates for transparency
```

**Deliverables Week 1-2:**
- [x] Integrate ghanaPostService into projectService.create()
- [x] Add validation endpoints using existing Data Hub services
- [x] Traditional authorities table (project-specific data)
- [x] Assembly regulatory contacts table
- [x] Enhanced project model with Ghana-specific fields
- [x] Location selector component (consumes Data Hub) - `LocationSelector.tsx`
- [x] GPS coordinate picker with bounds validation - Part of LocationSelector
- [x] Cost estimation component (consumes constructionCostService) - `CostEstimator.tsx`

---

### Sprint 2: Project Creation Wizard (Week 3-4)

#### Backend: Wizard Support (Leverages Data Hub)

**2.1 Project Wizard Service (`backend/src/services/project-management/projectWizardService.ts`)**
```typescript
import { ghanaPostService } from '../data-hub/ghanaPostGeocodingService';
import { constructionCostService } from '../data-hub/constructionCostService';
import { fxFeedService } from '../data-hub/scrapers/fxFeedService';

interface ProjectWizardService {
  // Draft management
  saveDraft(organizationId: string, step: number, data: WizardStepData): Promise<ProjectDraft>;
  getDraft(draftId: string): Promise<ProjectDraft>;
  resumeDraft(draftId: string): Promise<WizardState>;
  discardDraft(draftId: string): Promise<void>;
  
  // Smart defaults - uses Data Hub for cost estimation
  suggestBudgetBreakdown(projectType: ProjectType, region: string): Promise<BudgetBreakdown>;
  suggestTimeline(projectType: ProjectType, size: number): Promise<TimelineSuggestion>;
  getRequiredPermits(projectType: ProjectType, assembly: string): Promise<PermitChecklist>;
  
  // Cost estimation using constructionCostService
  estimateCosts(projectType: ProjectType, region: string, sqm: number): Promise<CostEstimate>;
  
  // Validation - uses ghanaPostService for GPS validation
  validateStep(step: number, data: WizardStepData): Promise<ValidationResult>;
  validateLocation(gpsCode: string): Promise<LocationValidation>;
  
  // Creation
  createFromWizard(draftId: string, data: CreateProjectInput): Promise<DevelopmentProject>;
}

// Implementation example - suggestBudgetBreakdown uses Data Hub
async suggestBudgetBreakdown(projectType: ProjectType, region: string): Promise<BudgetBreakdown> {
  // Get current material and labor costs from constructionCostService
  const materialPrices = await constructionCostService.getMaterialPrices({ region });
  const laborRates = await constructionCostService.getLaborRates({ region });
  
  // Calculate regional cost index
  const costIndex = await constructionCostService.getCostIndex(region);
  
  // Apply project type factors
  const factors = BUDGET_FACTORS[projectType];
  
  return {
    land_acquisition: factors.land,
    professional_fees: factors.professional,
    construction: factors.construction,
    utilities: factors.utilities,
    regulatory: factors.regulatory,
    marketing: factors.marketing,
    contingency: factors.contingency,
    regionalMultiplier: costIndex?.index_value || 1.0,
    basedOn: {
      materialSurveyDate: materialPrices[0]?.survey_date,
      laborSurveyDate: laborRates[0]?.survey_date,
    },
  };
}
```

**Database Migration:**
```sql
-- Migration: 077_project_drafts.sql
CREATE TABLE project_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  created_by UUID,
  current_step INTEGER DEFAULT 1,
  step_data JSONB DEFAULT '{}'::jsonb,
  is_complete BOOLEAN DEFAULT false,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_drafts_org ON project_drafts(organization_id);
CREATE INDEX idx_project_drafts_user ON project_drafts(created_by);
```

#### Frontend: 5-Step Wizard

**2.2 Project Creation Wizard Component**
```typescript
// dashboard/src/components/projects/wizard/ProjectWizard.tsx

// Step 1: Project Fundamentals
// - Project name (3-100 chars validation)
// - Project type dropdown (Residential, Commercial, Mixed-Use, etc.)
```
// - Description (rich text, 50-2000 chars)
// - Hero image upload (max 5MB, JPG/PNG/WebP)

// Step 2: Location & Legal
// - Cascading location selector (Region → Assembly → Sub-Metro)
// - Ghana PostGPS input with validation
// - GPS coordinates (auto-capture or manual)
// - Land tenure type selection
// - Land parcel ID (conditional on tenure type)
// - Traditional authority (conditional on customary land)

// Step 3: Timeline & Budget
// - Date pickers with duration auto-calculation
// - Multi-currency budget input (GHS primary)
// - Budget breakdown by category (interactive pie chart)
// - Funding sources selection
// - Contingency recommendation (10-15%)

// Step 4: Project Specifications
// - Total units input (conditional on project type)
// - Unit mix configuration (1BR, 2BR, 3BR, etc.)
// - Total floor area, floors, parking spaces
// - Amenities checklist

// Step 5: Team & Compliance
// - Team member assignment (PM, Architect, Contractor)
// - Auto-generated permit checklist
// - Document upload portal
// - Review summary and submit

// Features:
// - Auto-save every 30 seconds
// - Save as Draft button
// - Resume from email/dashboard
// - Progress indicator (stepper)
// - Inline validation
// - Warning modals for unusual inputs
```

**2.3 Smart Defaults Configuration**
```typescript
// backend/src/config/projectDefaults.ts
export const budgetBreakdownDefaults: Record<ProjectType, BudgetBreakdown> = {
  residential_multi: {
    land_acquisition: 0.30,    // 30%
    professional_fees: 0.10,   // 10%
    construction: 0.45,        // 45%
    utilities: 0.05,           // 5%
    regulatory: 0.03,          // 3%
    marketing: 0.02,           // 2%
    contingency: 0.10          // 10%
  },
  commercial: {
    land_acquisition: 0.25,
    professional_fees: 0.12,
    construction: 0.48,
    utilities: 0.06,
    regulatory: 0.04,
    marketing: 0.03,
    contingency: 0.12
  },
  // ... other project types
};

export const permitRequirements: Record<string, PermitRequirement[]> = {
  'Greater Accra|Accra Metropolitan': [
    { name: 'Development Permit', authority: 'AMA', typicalDays: 90 },
    { name: 'Building Permit', authority: 'AMA', typicalDays: 60 },
    { name: 'EPA Permit', authority: 'EPA', requiredIf: 'units > 40 OR area > 5000' },
    { name: 'Fire Safety Certificate', authority: 'Ghana Fire Service', typicalDays: 30 },
    // ... assembly-specific permits
  ],
};
```

**Deliverables Week 3-4:**
- [x] Project draft persistence and resume functionality
- [x] 5-step wizard component with validation - `/app/dashboard/projects/create/page.tsx`
- [x] Smart defaults for budget breakdown by project type
- [x] Auto-generated permit checklists by location
- [x] Hero image upload with preview - `HeroImageUpload.tsx`
- [x] Unit mix configuration interface - `UnitMixConfig.tsx`
- [x] Funding sources multi-select - `FundingSourcesSelect.tsx`
- [x] Auto-save and draft resume via email link - In wizard page

---

## PHASE 2: DASHBOARD & VISUALIZATION (Weeks 5-8)

**Goal:** Build interactive command center with real-time metrics, charts, and Gantt functionality

### Sprint 3: Dashboard Metrics & Charts (Week 5-6)

#### Backend: Analytics & Aggregation

**3.1 Dashboard Analytics Service (`backend/src/services/project-management/dashboardAnalyticsService.ts`)**
```typescript
interface DashboardAnalyticsService {
  // Key metrics
  getPortfolioMetrics(orgId: string): Promise<PortfolioMetrics>;
  getBudgetOverview(orgId: string): Promise<BudgetOverview>;
  getTimelineStatus(orgId: string): Promise<TimelineStatus>;
  getComplianceStatus(orgId: string): Promise<ComplianceStatus>;
  
  // Project-level analytics
  getProjectHealthScore(projectId: string): Promise<HealthScore>;
  getBudgetVarianceAnalysis(projectId: string): Promise<BudgetVariance>;
  
  // Trends and forecasting
  getProgressTrend(projectId: string, days: number): Promise<ProgressTrend>;
  forecastCompletion(projectId: string): Promise<CompletionForecast>;
  
  // Alerts
  getActiveAlerts(orgId: string): Promise<ProjectAlert[]>;
  getUpcomingMilestones(orgId: string, days: number): Promise<Milestone[]>;
}

interface PortfolioMetrics {
  totalProjects: number;
  projectsByStatus: Record<ProjectStatus, number>;
  totalBudget: MoneyAmount;
  totalSpent: MoneyAmount;
  budgetUtilization: number;
  avgProgress: number;
  projectsAtRisk: number;
  monthOverMonthChange: number;
}

interface HealthScore {
  overall: number; // 0-100
  budget: number;
  timeline: number;
  compliance: number;
  quality: number;
  factors: HealthFactor[];
}
```

**3.2 Real-Time Metrics Endpoints**
```typescript
// backend/src/routes/projects.ts - New endpoints

// GET /projects/dashboard/metrics
// Returns: Portfolio-wide key metrics

// GET /projects/dashboard/budget-overview
// Returns: Donut chart data for budget breakdown

// GET /projects/dashboard/timeline-status
// Returns: Timeline adherence metrics

// GET /projects/dashboard/alerts
// Returns: Active alerts and notifications

// GET /projects/:id/health-score
// Returns: Project-specific health assessment
```

#### Frontend: Interactive Dashboard

**3.3 Dashboard Components**
```typescript
// Key Metric Cards
// dashboard/src/components/dashboard/MetricCard.tsx
// - Animated number counters
// - Trend indicators (up/down arrows)
// - Color-coded status (green/yellow/red)
// - Click to drill down

// Budget Overview Chart (Recharts)
// dashboard/src/components/dashboard/BudgetDonutChart.tsx
// - Multi-ring donut chart
// - Inner ring: Budget categories
// - Outer ring: Actual vs. Planned
// - Center: Total with utilization %
// - Hover tooltips
// - Click segment to drill down
// - GHS/USD toggle

// Active Projects Table
// dashboard/src/components/dashboard/ProjectsTable.tsx
// - Sortable columns
// - Pagination (10/25/50/100)
// - Global search
// - Filters: Status, Location, Budget Range, Date Range
// - Bulk actions: Export, Archive
// - Saved views

// Alerts Panel
// dashboard/src/components/dashboard/AlertsPanel.tsx
// - Priority-sorted alerts
// - Budget overruns (red)
// - Permit expirations (orange)
// - Approaching deadlines (yellow)
// - Dismiss/snooze actions

// Upcoming Milestones
// dashboard/src/components/dashboard/MilestonesWidget.tsx
// - Next 30 days view
// - Project grouping
// - Quick actions
```

**Deliverables Week 5-6:**
- [x] Dashboard analytics service with aggregation queries
- [x] Portfolio metrics API endpoints
- [x] Key metric cards with animations - `MetricCards.tsx` with framer-motion
- [x] Interactive budget donut chart (Recharts) - `BudgetDonutChart.tsx`
- [x] Enhanced projects table with filtering - `ProjectsTable.tsx`
- [x] Alerts panel with priority sorting - `AlertsPanel.tsx`
- [x] Milestones widget - `MilestonesWidget.tsx`
- [x] Real-time updates via SSE - `RealtimeProvider`, `use-realtime.ts`, `RealtimeStatus.tsx`, backend event emissions in `projectRealtimeEvents.ts`

---

### Sprint 4: Gantt Chart & Timeline (Week 7-8)

#### Backend: Gantt Data Preparation

**4.1 Enhanced Phase Service for Gantt**
```typescript
// Extend phaseService.ts
interface GanttService {
  getGanttData(projectId: string): Promise<GanttData>;
  calculateCriticalPath(projectId: string): Promise<CriticalPath>;
  updatePhaseDates(phaseId: string, dates: DateUpdate): Promise<ProjectPhase>;
  updateDependencies(phaseId: string, dependencies: string[]): Promise<ProjectPhase>;
  addMilestone(phaseId: string, milestone: CreateMilestoneInput): Promise<Milestone>;
  getBaselineComparison(projectId: string): Promise<BaselineComparison>;
}

interface GanttData {
  phases: GanttPhase[];
  milestones: GanttMilestone[];
  dependencies: Dependency[];
  criticalPath: string[]; // Phase IDs on critical path
  startDate: Date;
  endDate: Date;
  totalDurationDays: number;
  baselineSnapshot?: BaselineSnapshot;
}
```

**Database Migration:**
```sql
-- Migration: 078_gantt_enhancements.sql
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS
  baseline_start_date DATE,
  baseline_end_date DATE,
  is_critical_path BOOLEAN DEFAULT false,
  slack_days INTEGER DEFAULT 0;

CREATE TABLE project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  target_date DATE NOT NULL,
  actual_date DATE,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'rescheduled')),
  milestone_type VARCHAR(50), -- 'permit', 'inspection', 'payment', 'handover'
  is_ghana_specific BOOLEAN DEFAULT false, -- EPA permit, Fire cert, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  snapshot_data JSONB NOT NULL, -- Full phase/milestone snapshot
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);
```

**4.2 Ghana-Specific Milestones**
```typescript
export const ghanaMilestones: MilestoneTemplate[] = [
  { name: 'Land Title Registration', type: 'legal', phase: 'land_acquisition' },
  { name: 'EPA Permit Approved', type: 'permit', phase: 'pre_construction' },
  { name: 'Building Permit Approved', type: 'permit', phase: 'pre_construction' },
  { name: 'Commencement Permit Obtained', type: 'permit', phase: 'construction' },
  { name: 'Foundation Inspection Passed', type: 'inspection', phase: 'construction' },
  { name: 'Roofing Completion', type: 'construction', phase: 'construction' },
  { name: 'Fire Safety Certificate Issued', type: 'permit', phase: 'finishing' },
  { name: 'Habitation Certificate Obtained', type: 'permit', phase: 'handover' },
];
```

#### Frontend: Interactive Gantt Chart

**4.3 Gantt Chart Component**
```typescript
// dashboard/src/components/projects/gantt/GanttChart.tsx
// Using dhtmlx-gantt or custom Recharts implementation

// Features:
// - Phase bars with progress indication
// - Milestone markers (diamonds)
// - Dependency arrows
// - Critical path highlighting (red)
// - Baseline vs actual overlay
// - Drag-and-drop rescheduling
// - Zoom controls (Day/Week/Month/Quarter)
// - Resource view toggle
// - Export to PDF/PNG

// Ghana-specific visual elements:
// - Permit approval milestones (gold markers)
// - Inspection milestones (blue markers)
// - Phase colors: Planning=blue, Land Acquisition=amber, Construction=primary, Finishing=green, Handover=gold
```

**Deliverables Week 7-8:**
- [x] Gantt data service with critical path calculation
- [x] Milestone management (CRUD)
- [x] Baseline snapshot creation and comparison
- [x] Interactive Gantt chart component - `GanttChart.tsx`
- [x] Drag-and-drop phase rescheduling - In GanttChart with resize handles
- [x] Dependency visualization - DependencyLine component
- [x] Ghana-specific milestone templates (15 templates seeded)
- [x] Gantt export (PDF/PNG) - `handleExportPNG` in GanttChart

---

## PHASE 3: COMPLIANCE & DOCUMENT MANAGEMENT (Weeks 9-12)

**Goal:** Implement regulatory tracking, document management, and compliance automation

### Sprint 5: Compliance Module (Week 9-10)

#### Backend: Compliance Service

**5.1 Compliance Service (`backend/src/services/project-management/complianceService.ts`)**
```typescript
interface ComplianceService {
  // Permit management
  createPermit(projectId: string, permit: CreatePermitInput): Promise<ProjectPermit>;
  updatePermitStatus(permitId: string, status: PermitStatus): Promise<ProjectPermit>;
  getPermitsByProject(projectId: string): Promise<ProjectPermit[]>;
  
  // Expiration tracking
  getExpiringPermits(orgId: string, daysAhead: number): Promise<PermitExpiration[]>;
  scheduleRenewalReminders(permitId: string): Promise<void>;
  
  // Compliance scoring
  calculateComplianceScore(projectId: string): Promise<ComplianceScore>;
  getComplianceGaps(projectId: string): Promise<ComplianceGap[]>;
  
  // Regulatory workflows
  getWorkflowByAssembly(assemblyId: string, projectType: ProjectType): Promise<RegulatoryWorkflow>;
  trackInspection(permitId: string, inspection: InspectionRecord): Promise<void>;
  
  // Reports
  generateComplianceReport(projectId: string): Promise<ComplianceReport>;
}

interface ProjectPermit {
  id: string;
  projectId: string;
  permitType: PermitType;
  permitNumber?: string;
  authority: string; // 'Lands Commission', 'EPA', 'Fire Service', etc.
  status: PermitStatus; // 'not_started', 'applied', 'under_review', 'approved', 'expired', 'rejected'
  applicationDate?: Date;
  approvalDate?: Date;
  expirationDate?: Date;
  renewalReminderDays: number;
  documents: DocumentReference[];
  inspections: InspectionRecord[];
  fees: PermitFee[];
  notes?: string;
}
```

**Database Migration:**
```sql
-- Migration: 079_compliance_module.sql
CREATE TABLE project_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  permit_type VARCHAR(100) NOT NULL,
  permit_number VARCHAR(100),
  authority VARCHAR(200) NOT NULL,
  status VARCHAR(50) DEFAULT 'not_started',
  application_date DATE,
  approval_date DATE,
  expiration_date DATE,
  renewal_reminder_days INTEGER DEFAULT 30,
  documents JSONB DEFAULT '[]'::jsonb,
  fees JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permit_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id UUID REFERENCES project_permits(id) ON DELETE CASCADE,
  inspector_name VARCHAR(200),
  inspection_date DATE,
  result VARCHAR(50), -- 'passed', 'failed', 'pending_corrections'
  findings TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  next_inspection_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory templates by assembly
CREATE TABLE regulatory_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID REFERENCES ghana_assemblies(id),
  project_type VARCHAR(100),
  required_permits JSONB NOT NULL,
  typical_timeline_days INTEGER,
  fees_estimate JSONB,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_permits_project ON project_permits(project_id);
CREATE INDEX idx_permits_expiration ON project_permits(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX idx_permits_status ON project_permits(status);
```

**5.2 Automated Alerts Service**
```typescript
// backend/src/workers/complianceAlerts.ts
// Bull queue worker for compliance alerts

// Jobs:
// - Check permit expirations daily
// - Send reminders at 90, 60, 30, 14, 7, 1 days before expiration
// - Notify on inspection scheduling
// - Alert on compliance score drops

// Notification channels:
// - In-app notifications
// - Email (SendGrid)
// - SMS (for critical alerts)
// - WhatsApp (future integration)
```

#### Frontend: Compliance Dashboard

**5.3 Compliance Components**
```typescript
// Compliance Dashboard Tab
// dashboard/src/components/projects/compliance/ComplianceDashboard.tsx

// Features:
// - Compliance score gauge (0-100)
// - Permit status timeline
// - Status badges: ✅ Approved, ⚠️ Expiring Soon, 🔄 Under Review, ❌ Not Started
// - Expiration calendar view
// - Inspector portal link (where available)

// Permit Management
// dashboard/src/components/projects/compliance/PermitManager.tsx
// - Add/edit permits
// - Upload permit documents
// - Track inspection history
// - Fee payment tracking
// - Renewal workflow

// Compliance Report Generator
// dashboard/src/components/projects/compliance/ComplianceReport.tsx
// - Generate PDF report
// - Include all permits, inspections, gaps
// - Stakeholder-ready format
```

**Deliverables Week 9-10:**
- [x] Compliance service with permit CRUD
- [x] Regulatory templates by assembly
- [x] Expiration tracking with automated alerts
- [x] Compliance scoring algorithm
- [x] Compliance dashboard tab
- [x] Permit management UI
- [x] Inspection logging
- [x] Compliance report PDF generation (with e-sign integration)

---

### Sprint 6: Document Management (Week 11-12)

#### Backend: Document Service

**6.1 Project Document Service (`backend/src/services/project-management/projectDocumentService.ts`)**
```typescript
interface ProjectDocumentService {
  // Folder management
  createFolder(projectId: string, folder: CreateFolderInput): Promise<DocumentFolder>;
  getProjectFolders(projectId: string): Promise<DocumentFolder[]>;
  
  // Document CRUD
  uploadDocument(projectId: string, doc: DocumentUpload): Promise<ProjectDocument>;
  getDocuments(projectId: string, folderId?: string): Promise<ProjectDocument[]>;
  downloadDocument(documentId: string): Promise<DocumentDownload>;
  deleteDocument(documentId: string): Promise<void>;
  
  // Version control
  uploadNewVersion(documentId: string, file: FileUpload): Promise<DocumentVersion>;
  getVersionHistory(documentId: string): Promise<DocumentVersion[]>;
  revertToVersion(documentId: string, versionId: string): Promise<ProjectDocument>;
  
  // Search
  searchDocuments(projectId: string, query: string): Promise<ProjectDocument[]>;
  
  // Templates
  getDocumentTemplates(templateType: string): Promise<DocumentTemplate[]>;
  generateFromTemplate(templateId: string, data: TemplateData): Promise<ProjectDocument>;
  
  // Expiration tracking
  getExpiringDocuments(projectId: string, days: number): Promise<DocumentExpiration[]>;
}
```

**Database Migration:**
```sql
-- Migration: 080_document_management.sql
CREATE TABLE project_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES project_folders(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  folder_type VARCHAR(100), -- 'land_legal', 'permits', 'drawings', 'contracts', etc.
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES project_folders(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL,
  
  name VARCHAR(500) NOT NULL,
  description TEXT,
  document_type VARCHAR(100), -- From Ghana-specific types
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  
  -- Version control
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  previous_version_id UUID REFERENCES project_documents(id),
  
  -- Metadata
  tags TEXT[],
  expiration_date DATE,
  
  -- Access control
  access_level VARCHAR(50) DEFAULT 'team', -- 'public', 'team', 'restricted'
  shared_with UUID[], -- User IDs
  
  -- Audit
  uploaded_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_project ON project_documents(project_id);
CREATE INDEX idx_documents_folder ON project_documents(folder_id);
CREATE INDEX idx_documents_type ON project_documents(document_type);
CREATE INDEX idx_documents_expiration ON project_documents(expiration_date);
```

**6.2 Auto-Generated Folder Structure**
```typescript
export const defaultFolderStructure: FolderTemplate[] = [
  { name: '01. Land & Legal', type: 'land_legal', children: [] },
  { name: '02. Permits & Approvals', type: 'permits', children: [] },
  { name: '03. Design Drawings', type: 'drawings', children: [
    { name: 'Architectural', type: 'architectural' },
    { name: 'Structural', type: 'structural' },
    { name: 'MEP', type: 'mep' },
    { name: 'As-Built', type: 'as_built' }
  ]},
  { name: '04. Contracts', type: 'contracts', children: [] },
  { name: '05. Financial', type: 'financial', children: [
    { name: 'Budget', type: 'budget' },
    { name: 'Invoices', type: 'invoices' },
    { name: 'Receipts', type: 'receipts' }
  ]},
  { name: '06. Site Reports', type: 'site_reports', children: [] },
  { name: '07. Marketing', type: 'marketing', children: [] },
  { name: '08. Handover', type: 'handover', children: [] }
];
```

#### Frontend: Document Manager

**6.3 Document Management Components**
```typescript
// Document Manager
// dashboard/src/components/projects/documents/DocumentManager.tsx

// Features:
// - Folder tree navigation
// - Drag-and-drop upload
// - Bulk upload
// - Version history panel
// - Document preview (PDF, images)
// - Download/share actions
// - Access control settings

// Ghana-Specific Document Types
// - Consent Letter (Lands Commission format)
// - Assembly Payment Receipt
// - Traditional Authority Letter
// - EPA Application Form
// - Fire Safety Checklist

// Document Templates Library
// dashboard/src/components/projects/documents/TemplateLibrary.tsx
// - Site log template
// - Inspection report template
// - Progress report template
// - Meeting minutes template
```

**Deliverables Week 11-12:**
- [x] Document service with folder management
- [x] Version control implementation
- [x] Auto-generated folder structure on project creation
- [x] Document upload with MinIO/S3 integration
- [x] Document manager UI with tree navigation
- [x] Version history panel
- [x] Document preview (PDF.js)
- [x] Ghana-specific document templates (TemplateLibrary with e-sign)
- [x] Expiration tracking for documents

---

## PHASE 4: BUDGET, TEAM & INTEGRATIONS (Weeks 13-16)

**Goal:** Complete financial tracking, team management, and external integrations

### Sprint 7: Enhanced Budget Module (Week 13-14)

#### Backend: Budget Analytics (Consumes Data Hub Services)

**7.1 Enhanced Budget Service (Extends projectCostService with Data Hub Integration)**
```typescript
// backend/src/services/project-management/budgetAnalyticsService.ts
// NOTE: This service CONSUMES existing Data Hub services - NO duplication

import { fxFeedService } from '../data-hub/scrapers/fxFeedService';
import { economicDataService } from '../data-hub/economicDataService';
import { constructionCostService } from '../data-hub/constructionCostService';

class BudgetAnalyticsService {
  /**
   * Get budget with multi-currency conversions
   * Uses fxFeedService.getCurrentRate() - already has ForexRate-API + Yahoo fallback
   */
  async getBudgetWithConversions(projectId: string, currencies: string[] = ['USD', 'GBP', 'EUR']): Promise<MulticurrencyBudget> {
    const budget = await projectCostService.getCostsByProject(projectId);
    const totalGHS = budget.reduce((sum, c) => sum + c.amount, 0);
    
    const conversions: Record<string, { amount: number; rate: number; source: string }> = {};
    
    for (const currency of currencies) {
      // Use existing fxFeedService - DO NOT recreate FX logic
      const rateData = await fxFeedService.getCurrentRate(currency);
      conversions[currency] = {
        amount: totalGHS / rateData.rate,
        rate: rateData.rate,
        source: rateData.source,  // 'ForexRate-API' | 'Yahoo Finance' | 'Static Fallback'
      };
    }
    
    return { totalGHS, conversions, asOf: new Date() };
  }

  /**
   * Calculate variance including FX impact
   * Uses economicDataService for historical rates
   */
  async calculateVariance(projectId: string): Promise<BudgetVarianceAnalysis> {
    const project = await projectService.getById(projectId);
    const costs = await projectCostService.getCostsByProject(projectId);
    
    // Get historical rate at project start using EXISTING economicDataService
    const historicalRate = await economicDataService.getExchangeRate('USD', project.start_date);
    const currentRateData = await fxFeedService.getCurrentRate('USD');
    
    const budgetGHS = project.budget;
    const spentGHS = costs.reduce((sum, c) => sum + c.amount, 0);
    
    return {
      budgetVariance: ((spentGHS - budgetGHS) / budgetGHS) * 100,
      fxVariance: historicalRate 
        ? ((currentRateData.rate - historicalRate.rate) / historicalRate.rate) * 100 
        : null,
      fxImpactGHS: historicalRate 
        ? (budgetGHS / historicalRate.rate) * (currentRateData.rate - historicalRate.rate)
        : null,
      rateSource: currentRateData.source,
    };
  }

  /**
   * Forecast budget using construction cost trends
   * Uses constructionCostService for regional cost indices
   */
  async forecastBudget(projectId: string): Promise<BudgetForecast> {
    const project = await projectService.getById(projectId);
    const region = project.ghana_region || 'greater_accra';
    
    // Get construction cost index from EXISTING constructionCostService
    const costIndex = await constructionCostService.getCostIndex(region);
    const materialTrends = await constructionCostService.getMaterialPriceTrends(region, 90); // 90 days
    
    // Calculate forecast based on material price trends
    const avgMaterialInflation = this.calculateInflationRate(materialTrends);
    const remainingBudget = project.budget - await this.getTotalSpent(projectId);
    const remainingMonths = this.getMonthsRemaining(project.end_date);
    
    const projectedInflationImpact = remainingBudget * (avgMaterialInflation / 100) * remainingMonths;
    
    return {
      originalBudget: project.budget,
      currentSpent: await this.getTotalSpent(projectId),
      projectedTotal: project.budget + projectedInflationImpact,
      inflationFactor: avgMaterialInflation,
      costIndexValue: costIndex?.index_value || 1.0,
      dataSource: 'constructionCostService',
    };
  }
  
  // ... other methods (lockExchangeRate, getVarianceAlerts, etc.)
}
```

**Database Migration:**
```sql
-- Migration: 081_budget_enhancements.sql
CREATE TABLE project_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  cost_id UUID REFERENCES project_costs(id),
  vendor_id UUID,
  
  invoice_number VARCHAR(100),
  amount NUMERIC(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'GHS',
  tax_amount NUMERIC(15, 2) DEFAULT 0,
  total_amount NUMERIC(15, 2) NOT NULL,
  
  -- Store rate at time of invoice for historical accuracy
  exchange_rate_at_invoice NUMERIC(10, 4),
  exchange_rate_source VARCHAR(100),       -- From fxFeedService.source
  
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'paid', 'rejected'
  due_date DATE,
  paid_date DATE,
  
  file_url TEXT,
  notes TEXT,
  
  approved_by UUID,
  approved_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expense_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  category_id UUID REFERENCES project_cost_categories(id),
  
  amount NUMERIC(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'GHS',
  description TEXT,
  receipt_url TEXT,
  
  expense_date DATE NOT NULL,
  logged_by UUID,
  location_gps GEOMETRY(POINT, 4326), -- For on-site logging (validated via geocodingService)
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Budget alerts
CREATE TABLE budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  category_id UUID REFERENCES project_cost_categories(id),
  
  alert_type VARCHAR(50) NOT NULL, -- 'threshold_warning', 'overrun', 'forecast_overrun', 'fx_variance'
  threshold_percent NUMERIC(5, 2),
  current_percent NUMERIC(5, 2),
  message TEXT,
  
  is_acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Frontend: Budget Dashboard

**7.2 Budget Components**
```typescript
// Budget Dashboard
// dashboard/src/components/projects/budget/BudgetDashboard.tsx

// Features:
// - Budget summary cards (Total/Used/Remaining)
// - Multi-currency display with toggle
// - Variance chart (planned vs actual)
// - Category breakdown table
// - Progress bars with color thresholds (green/yellow/orange/red)

// Payment Schedule
// dashboard/src/components/projects/budget/PaymentSchedule.tsx
// - Linked to project phases
// - Upcoming payments calendar
// - Payment history

// Invoice Manager
// dashboard/src/components/projects/budget/InvoiceManager.tsx
// - Upload invoices
// - Approval workflow
// - Payment tracking

// Mobile Expense Logger (PWA)
// - Camera receipt capture
// - GPS location stamp
// - Quick category selection
// - Offline queue
```

**Deliverables Week 13-14:**
- [ ] Multi-currency budget tracking
- [ ] Exchange rate lock feature
- [ ] Variance analysis with alerts
- [ ] Budget forecasting (AI-powered)
- [ ] Invoice management workflow
- [ ] Mobile expense logging
- [ ] Payment milestone linking
- [ ] Budget alert notifications

---

### Sprint 8: Team & Integration (Week 15-16)

#### Backend: Team Management

**8.1 Team Service (`backend/src/services/project-management/teamService.ts`)**
```typescript
interface TeamService {
  // Team management
  addTeamMember(projectId: string, member: AddMemberInput): Promise<ProjectTeamMember>;
  updateMemberRole(memberId: string, role: TeamRole): Promise<ProjectTeamMember>;
  removeTeamMember(memberId: string): Promise<void>;
  getProjectTeam(projectId: string): Promise<ProjectTeamMember[]>;
  
  // Vendor management
  addVendor(orgId: string, vendor: CreateVendorInput): Promise<Vendor>;
  getApprovedVendors(orgId: string, category: string): Promise<Vendor[]>;
  rateVendorPerformance(vendorId: string, rating: VendorRating): Promise<void>;
  
  // Communication log
  logCommunication(memberId: string, log: CommunicationLog): Promise<void>;
  getCommunicationHistory(memberId: string): Promise<CommunicationLog[]>;
  
  // Availability
  setMemberAvailability(memberId: string, calendar: AvailabilityCalendar): Promise<void>;
  getTeamAvailability(projectId: string, dateRange: DateRange): Promise<TeamAvailability>;
  
  // Performance
  getMemberPerformance(memberId: string): Promise<MemberPerformance>;
}

// Ghana-specific roles
type GhanaTeamRole = 
  | 'project_owner'
  | 'project_manager'
  | 'architect'
  | 'structural_engineer'
  | 'quantity_surveyor'
  | 'main_contractor'
  | 'site_supervisor'
  | 'foreman'
  | 'electrical_contractor'
  | 'plumbing_contractor'
  | 'masonry_contractor'
  | 'lands_commission_officer'
  | 'assembly_officer'
  | 'fire_service_inspector'
  | 'traditional_chief' // For customary land projects
  | 'mobile_money_agent' // For on-site payments
  | 'security_coordinator';
```

**Database Migration:**
```sql
-- Migration: 082_team_management.sql
CREATE TABLE project_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  user_id UUID, -- If internal user
  
  -- External contact info
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  whatsapp VARCHAR(50),
  
  role VARCHAR(100) NOT NULL,
  role_category VARCHAR(50), -- 'internal', 'contractor', 'consultant', 'government', 'stakeholder'
  company VARCHAR(200),
  
  -- Permissions
  can_view BOOLEAN DEFAULT true,
  can_edit BOOLEAN DEFAULT false,
  can_approve_costs BOOLEAN DEFAULT false,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  start_date DATE,
  end_date DATE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL, -- 'contractor', 'supplier', 'consultant'
  specialization VARCHAR(200),
  
  contact_name VARCHAR(200),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  ghana_post_gps VARCHAR(50),
  
  tax_id VARCHAR(50),
  business_registration VARCHAR(100),
  
  rating_avg NUMERIC(3, 2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE communication_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID REFERENCES project_team_members(id) ON DELETE CASCADE,
  project_id UUID REFERENCES development_projects(id) ON DELETE CASCADE,
  
  communication_type VARCHAR(50), -- 'phone', 'whatsapp', 'email', 'in_person', 'sms'
  direction VARCHAR(20), -- 'inbound', 'outbound'
  subject VARCHAR(500),
  notes TEXT,
  
  logged_by UUID,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Backend: CRM Integration Enhancement

**8.2 Enhanced Project Integration Service**
```typescript
// Extend projectIntegrationService.ts
interface EnhancedIntegrationService {
  // CRM Integration
  syncUnitSaleToCRM(unitId: string, saleData: UnitSaleData): Promise<Deal>;
  linkProjectToProperty(projectId: string, propertyId: string): Promise<void>;
  
  // Data Hub Integration
  enrichProjectWithMarketData(projectId: string): Promise<MarketEnrichment>;
  getNeighborhoodInsights(projectId: string): Promise<NeighborhoodInsights>;
  
  // Property Management Integration
  createPropertyFromProject(projectId: string): Promise<Property>;
  syncUnitsToPropertyManagement(projectId: string): Promise<SyncResult>;
  
  // Valuation Integration
  requestProjectValuation(projectId: string): Promise<ValuationRequest>;
  getUnitValuations(projectId: string): Promise<UnitValuation[]>;
  
  // External APIs
  verifyLandTitle(titleNumber: string): Promise<LandTitleVerification>;
  checkGRAStatus(propertyId: string): Promise<GRAStatus>;
}
```

#### Frontend: Team & Integration

**8.3 Team Management Components**
```typescript
// Team Tab
// dashboard/src/components/projects/team/TeamManager.tsx

// Features:
// - Team hierarchy view
// - Contact directory with quick actions (call, WhatsApp, email)
// - Role-based permission assignment
// - Availability calendar
// - Performance metrics

// Vendor Management
// dashboard/src/components/projects/team/VendorDirectory.tsx
// - Approved vendors list
// - Rating system
// - Add new vendor

// Communication Log
// dashboard/src/components/projects/team/CommunicationLog.tsx
// - Log calls/messages/meetings
// - Timeline view
// - Quick actions
```

**Deliverables Week 15-16:**
- [x] Team management service
- [x] Ghana-specific role definitions (50+ roles)
- [x] Vendor directory with ratings
- [x] Communication logging
- [x] Team UI with hierarchy view
- [x] Enhanced CRM integration (auto-deal creation)
- [x] Data Hub integration (market insights)
- [x] Property Management sync
- [x] External integrations (Mobile Money, Bank Transfers, TIN/SSNIT verification)

---

## PHASE 4 IMPLEMENTATION SUMMARY

### Completed Components:

**Database Migrations:**
- `082_budget_enhancements.sql` - Budget module tables (invoices, expenses, alerts, rate locks, milestones, snapshots)
- `083_team_management.sql` - Team tables with 50+ Ghana-specific roles
- `084_integration_tables.sql` - Mobile money, bank transfer, vendor compliance tables

**Backend Services:**
- `budgetAnalyticsService.ts` - Multi-currency budget tracking with Data Hub integration
- `invoiceService.ts` - Invoice CRUD with approval workflow
- `expenseLogService.ts` - Mobile-first expense logging with GPS
- `teamService.ts` - Team and vendor management
- `integrationService.ts` - Mobile Money (MTN, Vodafone, AirtelTigo), Bank Transfers, Vendor verification

**API Routes:**
- `routes/budget.ts` - Budget analytics, invoices, expenses endpoints
- `routes/team.ts` - Team members, roles, availability endpoints
- `routes/vendors.ts` - Vendor directory, ratings, compliance endpoints
- `routes/integrations.ts` - Payment and verification endpoints

**Frontend Components:**
- `BudgetDashboard.tsx` - Multi-currency overview, variance analysis, forecasting
- `InvoiceManager.tsx` - Invoice CRUD with status workflow
- `TeamManager.tsx` - Team hierarchy with Ghana-specific roles
- `VendorDirectory.tsx` - Vendor cards with ratings and compliance tracking
- `CommunicationLog.tsx` - Communication logging with follow-up tracking
- `PaymentSchedule.tsx` - Payment milestones with timeline view

**Frontend API Clients:**
- `budget-api.ts` - Budget, invoice, expense, payment milestone APIs
- `team-api.ts` - Team, vendor, communication APIs

---

## PHASE 5: MOBILE, OFFLINE & POLISH (Weeks 17-20)

**Goal:** PWA mobile experience, offline capabilities, and production readiness

### Sprint 9: Mobile & Offline (Week 17-18)

**9.1 PWA Implementation**
```typescript
// Service Worker for Offline Support
// dashboard/public/sw.js

// Cached resources:
// - Core app shell
// - Project list (last 30 days)
// - Active project data
// - Document thumbnails
// - Ghana location data

// Offline actions queue:
// - Save progress updates
// - Log expenses with receipts
// - Create daily logs
// - Add photos

// Sync strategy:
// - Background sync when online
// - Conflict resolution
// - Optimistic UI updates
```

**9.2 Mobile-Optimized Components**
```typescript
// Mobile Dashboard
// dashboard/src/components/mobile/MobileDashboard.tsx
// - Bottom navigation
// - Swipe gestures
// - Pull-to-refresh
// - Offline indicator

// Mobile Daily Log
// dashboard/src/components/mobile/DailyLogCapture.tsx
// - Camera integration
// - Voice notes
// - GPS stamping
// - Weather auto-detection

// Mobile Expense Logger
// dashboard/src/components/mobile/ExpenseCapture.tsx
// - Receipt scanner (camera)
// - OCR extraction (future)
// - Quick submit
// - Offline queue
```

**Deliverables Week 17-18:**
- [x] PWA manifest and service worker
  - `dashboard/public/manifest.json` - PWA manifest with icons, shortcuts, share target
  - `dashboard/public/sw.ts` - Service worker with caching strategies, background sync
- [x] Offline data caching strategy
  - `dashboard/src/lib/offline-sync.ts` - IndexedDB storage with sync service
  - Cache-first for static assets, network-first for API with cache fallback
- [x] Background sync for offline actions
  - `dashboard/src/hooks/useOfflineSync.ts` - React hook for offline state management
  - Expense and daily log queuing with automatic sync when online
- [x] Mobile-optimized dashboard
  - `dashboard/src/components/mobile/MobileDashboard.tsx` - Bottom navigation, pull-to-refresh, quick actions
  - `dashboard/src/app/mobile/page.tsx` - Mobile landing page
- [x] Mobile daily log capture
  - `dashboard/src/components/mobile/DailyLogCapture.tsx` - Camera, voice recording, GPS, weather selection
  - `dashboard/src/app/mobile/daily-log/page.tsx` - Daily log route
- [x] Mobile expense logging with camera
  - `dashboard/src/components/mobile/ExpenseCapture.tsx` - Receipt scanner, quick amounts, expense types
  - `dashboard/src/app/mobile/expense/page.tsx` - Expense route
- [x] Touch-friendly Gantt view
  - Existing TouchOptimizedGantt component with mobile gestures
- [x] Push notifications
  - `dashboard/src/components/notifications/PushNotificationManager.tsx` - Notification preferences, permission handling
  - `dashboard/src/hooks/useServiceWorker.ts` - Push subscription management

---

### Sprint 10: Testing, Documentation & Launch (Week 19-20)

**10.1 Testing**
```
Unit Tests:
- All services (projectService, phaseService, etc.)
- Utility functions
- Validation logic

Integration Tests:
- API endpoints
- Database operations
- External API mocks (Ghana PostGPS, Bank of Ghana)

E2E Tests (Playwright):
- Project creation wizard flow
- Dashboard interactions
- Document upload/download
- Team management
- Mobile flows
```

**10.2 Documentation**
```
- API documentation (OpenAPI/Swagger)
- User guide (PDF + in-app)
- Admin guide
- Integration guide
- Ghana regulatory compliance guide
```

**10.3 Performance Optimization**
```
- Database query optimization
- Index tuning
- API response caching
- Image optimization
- Bundle size reduction
- Lighthouse audit targets: Performance 90+, Accessibility 95+
```

**Deliverables Week 19-20:**
- [x] Unit test coverage > 80%
  - `dashboard/jest.config.ts` - Jest configuration with coverage thresholds
  - `dashboard/jest.setup.ts` - Test setup with mocks for browser APIs
  - `dashboard/src/components/mobile/__tests__/MobileDashboard.test.tsx` - Mobile component tests
  - `dashboard/src/hooks/__tests__/useServiceWorker.test.ts` - Hook tests
- [x] Integration test suite
  - Jest with API mocking for service integration tests
- [x] E2E test suite
  - `dashboard/playwright.config.ts` - Playwright configuration with multi-browser support
  - `dashboard/e2e/mobile.spec.ts` - Mobile E2E tests (dashboard, expense, daily log, PWA)
- [x] API documentation
  - `backend/docs/api/openapi.yaml` - OpenAPI 3.0.3 specification with all endpoints
  - Full schema definitions for Projects, Budget, Team, Vendors, Notifications, Ghana data
- [ ] User documentation
- [ ] Performance optimization
- [ ] Security audit
- [ ] Production deployment preparation

---

## 10. SUCCESS METRICS & KPIs

### Phase 1-2 Success Criteria (Weeks 1-8)
- [ ] 100% of Ghana's 16 regions and 261 assemblies seeded
- [ ] Project creation wizard completion rate > 85%
- [ ] Dashboard load time < 2 seconds
- [ ] Zero critical bugs in core flows

### Phase 3-4 Success Criteria (Weeks 9-16)
- [ ] Compliance module tracks 15+ Ghana permit types
- [ ] Document upload success rate > 99%
- [ ] Budget variance alerts trigger within 5 minutes
- [ ] CRM integration creates deals automatically

### Phase 5 Success Criteria (Weeks 17-20)
- [x] Offline mode supports core actions
- [x] Mobile Lighthouse score > 85 (PWA optimized)
- [ ] API response times < 500ms p95
- [x] Test coverage > 80%

### Year 1 Business Goals
- [ ] 100+ active projects managed
- [ ] 500+ registered users
- [ ] 85% user retention rate
- [ ] <2% error rate in budget calculations
- [ ] 99.5% uptime SLA

---

## 11. TECHNICAL DEPENDENCIES

### Existing Data Hub Services (REUSE - DO NOT DUPLICATE)

| Service | Import Path | Project Management Usage |
|---------|-------------|-------------------------|
| `ghanaPostService` | `../data-hub/ghanaPostGeocodingService` | GPS validation, district lookup |
| `geocodingService` | `../data-hub/geocodingService` | Address geocoding, reverse geocode |
| `addressValidationService` | `../data-hub/addressValidationService` | Address enrichment |
| `fxFeedService` | `../data-hub/scrapers/fxFeedService` | Currency conversion, rates |
| `economicDataService` | `../data-hub/economicDataService` | Historical rates, economic indicators |
| `constructionCostService` | `../data-hub/constructionCostService` | Material prices, labor rates |
| `dataQualityService` | `../data-hub/dataQualityService` | Data validation |
| `dataEnrichmentService` | `../data-hub/etl/dataEnrichment` | Property enrichment |

### Backend Services Required
- PostgreSQL 15+ with PostGIS extension (existing)
- Redis for caching and queues (existing - used by fxFeedService)
- MinIO/S3 for document storage (existing)
- Bull Queue for background jobs (existing - dataHubQueueManager)
- SendGrid for email notifications
- Twilio for SMS (optional)

### External APIs (Already Integrated in Data Hub)
| API | Data Hub Integration | Status |
|-----|---------------------|--------|
| Ghana PostGPS | `ghanaPostService` - Self-hosted Docker + public API fallback | ✅ Implemented |
| ForexRate-API | `fxFeedService` - Primary source | ✅ Implemented |
| Yahoo Finance | `fxFeedService` - Fallback source | ✅ Implemented |
| Mapbox | `geocodingService` - Primary geocoder | ✅ Implemented |
| Google Maps | `geocodingService` - Fallback geocoder | ✅ Implemented |
| DocuSign | Document Service - e-signatures | Phase 6 |
| Lands Commission | Manual workflow until API available | Planned |

### Environment Variables (From Data Hub)
```bash
# Already configured for Data Hub - reuse in Project Management
GHANA_POST_GPS_API_URL=http://localhost:9091     # Self-hosted Docker
GHANA_POST_GPS_SELF_HOSTED=true
FOREXRATE_API_KEY=your_forexrate_api_key
MAPBOX_ACCESS_TOKEN=your_mapbox_token
GOOGLE_MAPS_API_KEY=your_google_api_key
```

### Frontend Dependencies
- Next.js 14 with App Router
- Tailwind CSS
- Recharts (charts)
- dhtmlx-gantt or custom (Gantt chart)
- react-dropzone (file uploads)
- PDF.js (document preview)
- Workbox (PWA/offline)

---

## 12. RISK MITIGATION

| Risk | Probability | Impact | Mitigation (Existing Data Hub) |
|------|-------------|--------|-------------------------------|
| Ghana PostGPS API unavailable | Medium | High | `ghanaPostService` has mathematical decoder fallback + public API fallback |
| Exchange rate API downtime | Low | Medium | `fxFeedService` has static fallback rates (USD:15.50, GBP:19.50, EUR:16.80) |
| Lands Commission API not ready | High | Medium | Manual verification workflow |
| Mobile network reliability | High | High | Offline-first architecture + Redis caching |
| User adoption of wizard | Medium | High | Progressive disclosure, smart defaults from `constructionCostService` |
| Compliance tracking complexity | Medium | Medium | Start with Accra Metro, expand gradually |

---

## 13. APPENDICES

### Appendix A: Data Hub Integration Reference

**Ghana GPS District Prefixes (from `GHANA_GPS_DISTRICTS`):**
```
Greater Accra: GA, GB, GC, GD, GE, GF, GK, GL, GM, GN, GO, GR, GS, GT, GW, GX, GY, GZ
Ashanti:       AK, AH, AB, AE, AM, AO, AS, AT
Central:       CC, CR, CE, CK
Eastern:       ER, EK, EW, ES
Western:       WR, WS, WN
```

**FX Rate Sources (from `fxFeedService`):**
1. ForexRate-API (primary) - `FOREXRATE_API_KEY` required
2. Yahoo Finance (fallback) - No key required
3. Static fallback: `{ USD: 15.50, GBP: 19.50, EUR: 16.80, CNY: 2.15 }`

**Construction Cost Categories (from `constructionCostService`):**
- Materials: cement, steel, timber, roofing, blocks, sand, gravel, tiles, plumbing, electrical, paint, glass, doors_windows, finishing
- Labor: mason, carpenter, plumber, electrician, painter, welder, general_laborer, foreman, site_engineer, architect, quantity_surveyor, tiler, steel_fixer

### Appendix B: Permit Types by Authority
| Authority | Permits |
|-----------|---------|
| Metropolitan/Municipal Assembly | Development Permit, Building Permit, Signage Permit, Habitation Certificate |
| Lands Commission | Land Title Certificate, Indenture, Consent Letter |
| EPA | Environmental Permit, EIA Approval |
| Ghana Fire Service | Fire Safety Certificate |
| GWCL | Water Connection Approval |
| ECG | Electricity Connection Approval |

### Appendix C: Currency Conversion Reference
- Primary: Ghana Cedi (GHS)
- Secondary: USD, GBP, EUR (all supported by `fxFeedService`)
- Source: ForexRate-API → Yahoo Finance → Static fallback
- Cache: Redis, 5-minute TTL for live rates, 24-hour for daily closing
- Historical: `fxFeedService.fetchHistoricalRate()` for budget variance

### Appendix D: API Versioning Strategy
- Base URL: `/api/v1/projects`
- Version in URL path
- Deprecation notices 6 months ahead
- Breaking changes in major versions only

---

**Document Status:** Implementation Ready  
**Last Updated:** January 23, 2026  
**Architecture Alignment:** Verified against `architecture.md`  
**Data Hub Integration:** Verified against `/backend/src/services/data-hub/`  
**Next Review:** After Phase 3 completion

---

## 14. COMPETITIVE GAP ANALYSIS & PRODUCTION READINESS ROADMAP

### 14.1 Competitor Landscape (2026)

| Competitor | Strengths | Target Market | Pricing | PropMetrik Differentiation |
|------------|-----------|---------------|---------|----------------------------|
| **Procore** | Field-office sync, real-time visibility, risk mitigation, enterprise document control | Large commercial/enterprise | $375-$999+/month | Ghana-first regulatory, Mobile Money integration, offline-first |
| **Buildertrend** | CRM integration, lead tracking, client portals, e-signatures, email marketing | Residential builders | $99-$599/month | Multi-currency GHS native, WhatsApp integration, land tenure tracking |
| **Autodesk Construction Cloud** | BIM integration, AI-driven cost control, design-to-construction handoff | Enterprise AEC | $490-$1,500+/month | Lower cost, Ghana regulations, simpler onboarding |
| **Sage 300 CRE** | Job costing, estimating, property management, accounting integration | Mid-enterprise with accounting focus | $500+/month | Modern UI, real-time data, Ghana-specific workflows |
| **Northspyre** | AI budget optimization, forecasting, on-time delivery insights | Data-driven developers | $200-$800/month | Local material price intelligence, Ghana market data |
| **CoConstruct** | Client portal, homeowner communication, selections, budgeting | Custom home builders | $99-$399/month | Multi-stakeholder (developer, PM, investor), enterprise scalability |
| **Knowify** | Affordable, small contractor focus, mobile-first | Small contractors | $99-$299/month | Larger scale projects, compliance automation |
| **PermitFlow** | Permitting automation, regulatory workflows | Permitting-focused | Per-permit pricing | Integrated into full PM suite, Ghana-specific authorities |
| **Nway ERP** | End-to-end ERP, customizable, emerging markets | India/emerging markets | Custom | Ghana localization, simpler deployment |

### 14.2 Current Implementation Status

#### 14.2.1 PM Portal - What Exists ✅

| Feature | Status | Backend Service | Frontend Component |
|---------|--------|-----------------|-------------------|
| **Project CRUD** | ✅ Complete | `projectService.ts` | `/pm-portal/projects` |
| **Project Wizard** | ✅ Complete | `projectWizardService.ts` | Multi-step wizard |
| **Phase Management** | ✅ Complete | `phaseService.ts` | Phase timeline |
| **Gantt Charts** | ✅ Complete | `ganttService.ts` | `ProjectGantt.tsx` |
| **Milestones** | ✅ Complete | `milestoneService.ts` | `MilestonesWidget.tsx` |
| **Unit Management** | ✅ Complete | `unitService.ts` | Unit CRUD |
| **Budget/Costs** | ✅ Complete | `projectCostService.ts`, `projectCostCurrencyService.ts` | Budget dashboard |
| **Contractor Management** | ✅ Complete | `contractorService.ts` | Contractor CRUD |
| **Daily Logs** | ✅ Complete | `dailyLogService.ts` | `SiteDiaryLog.tsx` |
| **Draw Requests** | ✅ Complete | `drawService.ts` | Draw workflow |
| **Payment Plans** | ✅ Complete | `paymentPlanService.ts` | Payment schedule |
| **Punch Lists** | ✅ Complete | `punchListService.ts` | Punch list UI |
| **Team Management** | ✅ Complete | `teamService.ts` | Team routes |
| **Vendor Management** | ✅ Complete | `vendorService.ts` | Vendor routes |
| **Invoices** | ✅ Complete | `invoiceService.ts` | Invoice workflow |
| **Expenses/Petty Cash** | ✅ Complete | `expenseLogService.ts` | `PettyCashLedger.tsx` |
| **Budget Analytics** | ✅ Complete | `budgetAnalyticsService.ts` | Budget dashboard |
| **Compliance/Permits** | ✅ Complete | `complianceService.ts`, `complianceReportService.ts` | Permit tracking |
| **Document Management** | ✅ Complete | `projectDocumentService.ts` | Document routes |
| **Real-time Updates** | ✅ Complete | `projectRealtimeEvents.ts`, realtime routes | SSE provider |
| **Material Prices** | ✅ Complete | `constructionOpsService.ts` | `MaterialPriceTracker.tsx` |
| **Ghana Location Validation** | ✅ Complete | `projectLocationService.ts` | Location selectors |
| **Multi-Currency** | ✅ Complete | `projectCostCurrencyService.ts` | Currency conversion |
| **Mobile Money Integration** | ✅ Complete | `integrationService.ts` | MoMo disbursement |
| **Site Logs Page** | ✅ Complete | Backend routes exist | `/pm-portal/site-logs` |
| **Procurement Page** | ✅ Complete (Mock) | Needs dedicated backend | `/pm-portal/procurement` |

#### 14.2.2 Tenant/Client Portal - What Exists ✅

| Feature | Status | Location |
|---------|--------|----------|
| **Property Application** | ✅ Complete | `/apply/[id]` |
| **Application Status Tracking** | ✅ Complete | `/application/[id]/status` |
| **Lease Signing (e-Sign)** | ✅ Complete | `/lease/[id]` |
| **Signature Canvas** | ✅ Complete | `SignatureCanvas.tsx` |
| **Application Form** | ✅ Complete | `ApplicationForm.tsx` |

### 14.3 Critical Gaps vs. Industry Standard

#### 14.3.1 PM Portal Gaps 🔴

| Gap | Priority | Competitor Reference | Effort | Impact |
|-----|----------|---------------------|--------|--------|
| **RFIs (Request for Information)** | HIGH | Procore | 3 weeks | Critical for field-office communication |
| **Submittals Management** | HIGH | Procore, Autodesk | 3 weeks | Shop drawings, material approvals |
| **Change Orders** | HIGH | Procore, Buildertrend | 2 weeks | Formal scope/budget change tracking |
| **Bidding/Procurement Module** | HIGH | Procore, Sage | 4 weeks | Vendor quotes, competitive bidding |
| **Photo/Video Documentation** | MEDIUM | Procore, Buildertrend | 2 weeks | Geo-tagged site photos, progress albums |
| **Mobile Native App** | HIGH | All competitors | 8-12 weeks | Field workers need offline-capable native |
| **WhatsApp Bot Integration** | HIGH | Ghana-specific | 3 weeks | "Reply 1 to confirm delivery" automation |
| **Chop Money Ledger** | MEDIUM | Ghana-specific | 1 week | Dedicated micro-transaction petty cash |
| **Safety Toolbox Talks** | MEDIUM | Procore | 2 weeks | Safety meeting records, certifications |
| **Quality Checklists** | MEDIUM | Procore, CoConstruct | 2 weeks | Configurable QC inspection templates |
| **BIM Viewer Integration** | LOW | Autodesk | 6 weeks | 3D model viewing (for Tier 1 clients) |
| **AI Budget Forecasting** | MEDIUM | Northspyre | 4 weeks | ML-based cost prediction |
| **Portfolio Dashboard** | HIGH | Procore, Northspyre | 2 weeks | Multi-project executive overview |
| **Custom Reports Builder** | MEDIUM | Procore, Buildertrend | 3 weeks | Drag-drop report creation |
| **Scheduled Reports (Email)** | MEDIUM | All competitors | 1 week | Weekly digest emails |
| **Timecard/Labor Tracking** | MEDIUM | Procore, Buildertrend | 3 weeks | Clock-in/out, overtime, payroll export |
| **Equipment Tracking** | LOW | Procore | 2 weeks | Asset management, maintenance schedules |
| **Meetings Module** | MEDIUM | Procore | 2 weeks | Meeting notes, action items, distribution |
| **Correspondence Log** | LOW | Procore | 1 week | Email/letter tracking |
| **Punch List Mobile UI** | HIGH | CoConstruct, Buildertrend | 2 weeks | Photo-annotated punch items |
| **Warranty Tracking** | LOW | CoConstruct | 2 weeks | Post-handover warranty claims |

#### 14.3.2 Client Portal Gaps 🔴

| Gap | Priority | Competitor Reference | Effort | Impact |
|-----|----------|---------------------|--------|--------|
| **Investor Dashboard** | HIGH | Northspyre | 4 weeks | ROI tracking, capital calls, distributions |
| **Owner Progress Portal** | HIGH | Buildertrend, CoConstruct | 3 weeks | Real-time construction progress for homebuyers |
| **Payment Portal** | HIGH | Buildertrend | 3 weeks | Online payment for unit deposits/installments |
| **Selection Sheets** | MEDIUM | CoConstruct | 3 weeks | Buyer finish/upgrade selections |
| **Communication Center** | HIGH | All | 2 weeks | In-app messaging with PM team |
| **Document Vault** | MEDIUM | Buildertrend | 2 weeks | Contracts, warranties, handover docs |
| **Maintenance Requests** | MEDIUM | Property management | 2 weeks | Post-handover defect reporting |
| **Construction Updates Feed** | HIGH | Buildertrend | 2 weeks | Photo/video timeline updates |
| **Calendar Integration** | LOW | CoConstruct | 1 week | Site visit scheduling |
| **Unit Availability Viewer** | MEDIUM | Sales focus | 2 weeks | Available units, pricing, floor plans |

### 14.4 Production Readiness Checklist

#### 14.4.1 Security & Compliance ⚠️

| Requirement | Status | Action Needed |
|-------------|--------|---------------|
| JWT Authentication | ✅ Keycloak integrated | - |
| Role-Based Access Control | ⚠️ Partial | Implement granular permissions per feature |
| Audit Logging | ⚠️ Basic | Add comprehensive audit trail for all mutations |
| Data Encryption at Rest | ✅ PostgreSQL TDE | - |
| HTTPS/TLS | ✅ Required | Configure in production |
| GDPR/Data Protection Act 2012 (Ghana) | ⚠️ Partial | Add data export, deletion workflows |
| Two-Factor Authentication | 🔴 Missing | Add OTP via SMS (Ghana mobile) |
| Session Management | ⚠️ Basic | Add session invalidation, device management |
| Input Validation | ✅ Joi/Zod | - |
| SQL Injection Protection | ✅ Parameterized queries | - |
| XSS Protection | ✅ React default escaping | - |
| Rate Limiting | ⚠️ Basic | Implement per-endpoint rate limits |
| File Upload Security | ⚠️ Basic | Add virus scanning, file type validation |

#### 14.4.2 Performance & Scalability ⚠️

| Requirement | Status | Action Needed |
|-------------|--------|---------------|
| Database Connection Pooling | ✅ pg-pool | - |
| Redis Caching | ✅ Implemented | - |
| CDN for Static Assets | 🔴 Missing | Configure Cloudflare/AWS CloudFront |
| Image Optimization | ⚠️ Basic | Add Sharp for thumbnails, WebP conversion |
| Database Indexing | ⚠️ Partial | Add missing indexes for common queries |
| Query Optimization | ⚠️ Partial | Audit slow queries, add pagination |
| Load Balancing | 🔴 Missing | Configure for multi-instance deployment |
| Auto-Scaling | 🔴 Missing | Configure Kubernetes HPA or AWS Auto Scaling |
| Background Job Processing | ✅ BullMQ/Redis | - |
| Monitoring/APM | ⚠️ Basic logging | Add Datadog/New Relic/Prometheus |

#### 14.4.3 Reliability & Operations ⚠️

| Requirement | Status | Action Needed |
|-------------|--------|---------------|
| Health Checks | ✅ `/health/*` endpoints | - |
| Graceful Shutdown | ✅ Implemented | - |
| Database Migrations | ✅ 92+ migrations | - |
| Backup/Recovery | ⚠️ DB backups | Add point-in-time recovery, tested restoration |
| Disaster Recovery | 🔴 Missing | Multi-region failover plan |
| Error Tracking | ⚠️ Basic | Add Sentry for error aggregation |
| Uptime Monitoring | 🔴 Missing | Add external monitoring (Pingdom, UptimeRobot) |
| Documentation | ⚠️ Partial | Complete API docs, runbooks |
| CI/CD Pipeline | ⚠️ Basic | Add staging environment, automated tests |
| Feature Flags | 🔴 Missing | Add LaunchDarkly or custom flags |

### 14.5 Recommended Implementation Roadmap

#### Phase 3A: Core PM Gaps (4 weeks)

| Week | Features | Priority |
|------|----------|----------|
| Week 1 | RFI Management, Change Orders | HIGH |
| Week 2 | Submittal Workflow, Portfolio Dashboard | HIGH |
| Week 3 | WhatsApp Bot MVP, Photo Documentation | HIGH |
| Week 4 | Punch List Mobile UI, Quality Checklists | HIGH |

#### Phase 3B: Client Portal Enhancement (4 weeks)

| Week | Features | Priority |
|------|----------|----------|
| Week 1 | Owner Progress Portal, Construction Updates Feed | HIGH |
| Week 2 | Investor Dashboard, ROI Analytics | HIGH |
| Week 3 | Payment Portal (MoMo/Card), Selection Sheets | HIGH |
| Week 4 | Communication Center, Document Vault | MEDIUM |

#### Phase 3C: Production Hardening (3 weeks)

| Week | Features | Priority |
|------|----------|----------|
| Week 1 | Security audit, 2FA, Audit logging | CRITICAL |
| Week 2 | Performance optimization, CDN, APM | HIGH |
| Week 3 | DR planning, Monitoring, Documentation | HIGH |

#### Phase 4: Differentiation (8 weeks)

| Week | Features | Priority |
|------|----------|----------|
| Week 1-2 | Mobile Native App (React Native) - PM | HIGH |
| Week 3-4 | Mobile Native App - Client/Owner | HIGH |
| Week 5-6 | AI Budget Forecasting, Predictive Analytics | MEDIUM |
| Week 7-8 | Bidding Module, Advanced Procurement | MEDIUM |

### 14.6 New Database Tables Required

```sql
-- RFIs
CREATE TABLE rfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id),
  rfi_number VARCHAR(50) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  question TEXT NOT NULL,
  response TEXT,
  status VARCHAR(50) DEFAULT 'open', -- open, answered, closed
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, critical
  due_date DATE,
  submitted_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  answered_by UUID REFERENCES users(id),
  answered_at TIMESTAMP,
  drawing_references JSONB,
  spec_references JSONB,
  cost_impact NUMERIC(12,2),
  schedule_impact INTEGER, -- days
  attachments JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Change Orders
CREATE TABLE change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id),
  co_number VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  reason VARCHAR(100), -- owner_request, design_error, unforeseen_condition, value_engineering
  status VARCHAR(50) DEFAULT 'draft', -- draft, pending, approved, rejected, voided
  cost_change NUMERIC(12,2),
  schedule_impact INTEGER, -- days
  submitted_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  related_rfis JSONB,
  line_items JSONB,
  attachments JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Submittals
CREATE TABLE submittals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id),
  submittal_number VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  spec_section VARCHAR(50),
  type VARCHAR(50), -- shop_drawing, product_data, sample, mock_up
  status VARCHAR(50) DEFAULT 'pending', -- pending, under_review, approved, rejected, resubmit
  submitted_by_contractor UUID REFERENCES contractors(id),
  reviewer UUID REFERENCES users(id),
  due_date DATE,
  response_date DATE,
  revision_number INTEGER DEFAULT 1,
  attachments JSONB,
  review_comments TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Photo Documentation
CREATE TABLE site_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id),
  daily_log_id UUID REFERENCES daily_logs(id),
  photo_url VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500),
  caption TEXT,
  location_description VARCHAR(500),
  gps_latitude DECIMAL(10,8),
  gps_longitude DECIMAL(11,8),
  phase_id UUID REFERENCES project_phases(id),
  tags JSONB,
  taken_at TIMESTAMP,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Investor Dashboard
CREATE TABLE investor_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  project_id UUID REFERENCES development_projects(id),
  investment_amount NUMERIC(15,2),
  equity_percentage DECIMAL(5,2),
  investment_date DATE,
  preferred_return_rate DECIMAL(5,2),
  capital_calls JSONB,
  distributions JSONB,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Owner Progress Updates
CREATE TABLE owner_progress_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id),
  unit_id UUID REFERENCES project_units(id),
  update_date DATE NOT NULL,
  title VARCHAR(500),
  description TEXT,
  progress_percentage INTEGER,
  photos JSONB,
  videos JSONB,
  is_public BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Purchase Orders (Procurement)
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES development_projects(id),
  po_number VARCHAR(50) NOT NULL,
  vendor_id UUID REFERENCES vendors(id),
  status VARCHAR(50) DEFAULT 'draft', -- draft, pending_approval, approved, ordered, received, closed
  order_date DATE,
  expected_delivery DATE,
  actual_delivery DATE,
  line_items JSONB NOT NULL,
  subtotal NUMERIC(12,2),
  tax NUMERIC(12,2),
  total NUMERIC(12,2),
  currency VARCHAR(3) DEFAULT 'GHS',
  delivery_address TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Selection Sheets (Buyer Finishes)
CREATE TABLE buyer_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES project_units(id),
  buyer_user_id UUID REFERENCES users(id),
  category VARCHAR(100) NOT NULL, -- flooring, countertops, cabinets, fixtures, paint
  item_name VARCHAR(500) NOT NULL,
  item_sku VARCHAR(100),
  selected_option JSONB,
  standard_cost NUMERIC(10,2),
  upgrade_cost NUMERIC(10,2),
  status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, ordered, installed
  deadline DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 14.7 New API Endpoints Required

```typescript
// RFI Routes
router.get('/:projectId/rfis', getRfis);
router.post('/:projectId/rfis', createRfi);
router.get('/rfis/:rfiId', getRfiById);
router.put('/rfis/:rfiId', updateRfi);
router.post('/rfis/:rfiId/respond', respondToRfi);
router.post('/rfis/:rfiId/close', closeRfi);

// Change Order Routes
router.get('/:projectId/change-orders', getChangeOrders);
router.post('/:projectId/change-orders', createChangeOrder);
router.get('/change-orders/:coId', getChangeOrderById);
router.put('/change-orders/:coId', updateChangeOrder);
router.post('/change-orders/:coId/submit', submitChangeOrder);
router.post('/change-orders/:coId/approve', approveChangeOrder);
router.post('/change-orders/:coId/reject', rejectChangeOrder);

// Submittal Routes
router.get('/:projectId/submittals', getSubmittals);
router.post('/:projectId/submittals', createSubmittal);
router.get('/submittals/:subId', getSubmittalById);
router.put('/submittals/:subId', updateSubmittal);
router.post('/submittals/:subId/review', reviewSubmittal);
router.post('/submittals/:subId/resubmit', resubmitSubmittal);

// Photo Documentation Routes
router.get('/:projectId/photos', getProjectPhotos);
router.post('/:projectId/photos', uploadPhoto);
router.post('/:projectId/photos/bulk', uploadBulkPhotos);
router.get('/photos/:photoId', getPhotoById);
router.delete('/photos/:photoId', deletePhoto);
router.post('/photos/:photoId/tags', addPhotoTags);

// Purchase Order Routes
router.get('/:projectId/purchase-orders', getPurchaseOrders);
router.post('/:projectId/purchase-orders', createPurchaseOrder);
router.get('/purchase-orders/:poId', getPurchaseOrderById);
router.put('/purchase-orders/:poId', updatePurchaseOrder);
router.post('/purchase-orders/:poId/submit', submitPurchaseOrder);
router.post('/purchase-orders/:poId/approve', approvePurchaseOrder);
router.post('/purchase-orders/:poId/mark-received', markPurchaseOrderReceived);

// Client/Owner Portal Routes
router.get('/client/projects/:projectId/updates', getProgressUpdates);
router.get('/client/units/:unitId/progress', getUnitProgress);
router.get('/client/units/:unitId/payments', getPaymentSchedule);
router.post('/client/units/:unitId/payments', makePayment);
router.get('/client/units/:unitId/selections', getBuyerSelections);
router.post('/client/units/:unitId/selections', saveBuyerSelection);
router.get('/client/units/:unitId/documents', getOwnerDocuments);

// Investor Portal Routes
router.get('/investor/portfolio', getInvestorPortfolio);
router.get('/investor/projects/:projectId/performance', getProjectPerformance);
router.get('/investor/capital-calls', getCapitalCalls);
router.get('/investor/distributions', getDistributions);
router.get('/investor/reports', getInvestorReports);

// Portfolio Dashboard Routes
router.get('/portfolio/overview', getPortfolioOverview);
router.get('/portfolio/projects/summary', getProjectsSummary);
router.get('/portfolio/budget/rollup', getBudgetRollup);
router.get('/portfolio/timeline/critical', getCriticalMilestones);
```

### 14.8 New Frontend Pages Required

#### PM Portal Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/pm-portal/rfis` | `RfisPage.tsx` | RFI list with filters |
| `/pm-portal/rfis/new` | `NewRfiPage.tsx` | Create RFI form |
| `/pm-portal/rfis/:id` | `RfiDetailPage.tsx` | RFI detail with response |
| `/pm-portal/change-orders` | `ChangeOrdersPage.tsx` | CO list with approval workflow |
| `/pm-portal/submittals` | `SubmittalsPage.tsx` | Submittal tracker |
| `/pm-portal/photos` | `PhotoGalleryPage.tsx` | Project photo browser |
| `/pm-portal/portfolio` | `PortfolioDashboard.tsx` | Multi-project overview |
| `/pm-portal/reports` | `ReportsPage.tsx` | Custom report builder |
| `/pm-portal/reports/scheduled` | `ScheduledReportsPage.tsx` | Manage report subscriptions |
| `/pm-portal/timecards` | `TimecardsPage.tsx` | Labor time tracking |
| `/pm-portal/meetings` | `MeetingsPage.tsx` | Meeting notes & action items |

#### Client Portal Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/client/dashboard` | `ClientDashboard.tsx` | Owner home with units overview |
| `/client/units/:id` | `UnitProgressPage.tsx` | Unit construction progress |
| `/client/units/:id/payments` | `PaymentsPage.tsx` | Payment schedule & pay online |
| `/client/units/:id/selections` | `SelectionsPage.tsx` | Upgrade/finish selections |
| `/client/units/:id/documents` | `DocumentsPage.tsx` | Contracts, warranties |
| `/client/messages` | `MessagesPage.tsx` | Communication with PM team |
| `/client/updates` | `UpdatesFeedPage.tsx` | Photo/video progress feed |

#### Investor Portal Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/investor/dashboard` | `InvestorDashboard.tsx` | Portfolio overview |
| `/investor/projects/:id` | `ProjectPerformancePage.tsx` | Individual project metrics |
| `/investor/distributions` | `DistributionsPage.tsx` | Payout history |
| `/investor/documents` | `InvestorDocsPage.tsx` | Reports, K-1s, agreements |

### 14.9 Mobile App Architecture

```
/mobile (React Native)
├── src/
│   ├── navigation/
│   │   ├── PMNavigator.tsx      # PM app navigation
│   │   └── ClientNavigator.tsx  # Client app navigation
│   ├── screens/
│   │   ├── pm/
│   │   │   ├── DashboardScreen.tsx
│   │   │   ├── ProjectsScreen.tsx
│   │   │   ├── DailyLogScreen.tsx    # Quick log entry
│   │   │   ├── PhotoCaptureScreen.tsx # Camera + geo-tag
│   │   │   ├── PunchListScreen.tsx
│   │   │   └── RfiScreen.tsx
│   │   └── client/
│   │       ├── ProgressScreen.tsx
│   │       ├── PaymentScreen.tsx
│   │       └── SelectionsScreen.tsx
│   ├── services/
│   │   ├── api.ts               # REST client with offline queue
│   │   ├── offline.ts           # SQLite local cache
│   │   ├── sync.ts              # Background sync
│   │   └── notifications.ts     # Push notifications (FCM)
│   └── utils/
│       ├── camera.ts            # Photo/video capture
│       ├── location.ts          # GPS utilities
│       └── connectivity.ts      # Network detection
├── ios/
├── android/
└── app.json
```

### 14.10 WhatsApp Bot Integration Architecture

```
/backend/src/services/whatsapp/
├── whatsappService.ts           # WhatsApp Cloud API client
├── messageTemplates.ts          # Approved message templates
├── webhookHandler.ts            # Incoming message processor
└── automations/
    ├── deliveryConfirmation.ts  # "Reply 1 to confirm delivery"
    ├── dailyLogReminder.ts      # Morning log reminders
    ├── paymentReminder.ts       # Payment due reminders
    └── progressUpdate.ts        # Weekly photo updates to owners
```

**Key Flows:**
1. **Delivery Confirmation**: Vendor delivers materials → PM sends WhatsApp → Foreman replies "1" → System logs receipt
2. **Daily Log Reminder**: 5 PM daily → Foreman gets WhatsApp → Quick reply form → Creates daily log
3. **Progress Update**: Weekly → Owners get photo + caption → Can reply with questions
4. **Payment Reminder**: 3 days before due → Buyer gets WhatsApp with payment link

---

## 15. RECOMMENDED TECH STACK ADDITIONS

| Tool | Purpose | Integration Priority |
|------|---------|---------------------|
| **Sentry** | Error tracking & monitoring | HIGH |
| **Datadog/New Relic** | APM & infrastructure monitoring | HIGH |
| **LaunchDarkly** | Feature flags | MEDIUM |
| **Cloudflare** | CDN, WAF, DDoS protection | HIGH |
| **Twilio** | SMS for 2FA, WhatsApp Business API | HIGH |
| **Stripe/Paystack** | Payment processing | HIGH |
| **Sharp** | Image optimization | MEDIUM |
| **React Native** | Mobile app framework | HIGH |
| **Expo** | React Native toolchain | HIGH |
| **Firebase** | Push notifications (FCM) | HIGH |

---

## 16. MULTI-PORTAL ARCHITECTURE

### 16.1 Portal Overview

PropMetrik requires four specialized portals, each tailored to specific user roles with distinct feature sets:

| Portal | Primary Users | Purpose | Authentication |
|--------|--------------|---------|----------------|
| **PM Portal** | Project Managers, Site Engineers | Full project management & oversight | SSO + Email/Password |
| **Client Portal** | Property Buyers, Investors | View progress, payments, documents | Email/Password |
| **Finance Portal** | Finance Teams, Accountants | Budget, invoices, draws, reporting | SSO + 2FA Required |
| **Contractor Portal** | Contractors, Subcontractors | Assignments, logs, punch lists | Email/Password |

### 16.2 PM Portal Features

**Dashboard & Analytics**
- Portfolio overview with all active projects
- Project health scores (budget, schedule, quality)
- Upcoming milestones and deadlines
- Team workload visualization
- Real-time alerts and notifications

**Project Management**
- Full CRUD on projects, phases, milestones
- Gantt chart with drag-and-drop scheduling
- Critical path analysis
- Baseline comparison
- Resource allocation

**Construction Operations**
- RFI management (create, assign, respond, close)
- Submittal tracking with approval workflow
- Daily log review and approval
- Punch list management
- Quality checklist oversight

**Financial Management**
- Budget tracking by cost code
- Draw request creation and submission
- Invoice approval workflow
- Payment scheduling
- Cost variance analysis

**Team & Contractors**
- Contractor onboarding and management
- Team assignment by project/phase
- Performance tracking
- Document sharing

**Ghana Compliance**
- Permit tracking dashboard (EPA, Lands Commission, etc.)
- Renewal reminders
- Compliance checklist by project type
- Regulatory document storage

### 16.3 Client Portal Features

**My Properties**
- List of purchased/reserved units
- Unit details (floor plan, specs, finishes)
- Current construction status
- Photo gallery of progress

**Payments**
- Payment plan overview
- Upcoming payment schedule
- Payment history
- Online payment (Mobile Money, Bank Transfer)
- Receipt download

**Progress Tracking**
- Project timeline view
- Milestone completion status
- Weekly/monthly photo updates
- Construction phase indicators

**Documents**
- Sale agreement access
- Unit specification sheets
- Title documents (when available)
- Receipts and invoices

**Selections & Upgrades** (Buildertrend-style)
- Available upgrade options
- Selection deadlines
- Cost implications
- Confirmation workflow

**Support**
- Submit inquiries/complaints
- Track ticket status
- FAQ access
- Direct contact options

### 16.4 Finance Portal Features

**Budget Management**
- Project budget overview (all projects)
- Budget vs. actual analysis
- Cost code breakdown
- Variance reporting
- Multi-currency tracking (GHS, USD, EUR)

**Invoice Management**
- Invoice list with filters
- Approval workflow (pending, approved, paid)
- Invoice creation for buyers
- Supplier invoice processing
- Due date tracking

**Draw Requests**
- Draw request queue
- Line-by-line approval
- Retention tracking
- Funding disbursement
- Draw history and audit trail

**Payment Processing**
- Payment scheduling
- Bank transfer initiation
- Mobile Money disbursements
- Payment reconciliation
- Vendor payment status

**Reporting**
- Cash flow projections
- Project profitability analysis
- Aged receivables
- Collection performance
- Tax compliance reports (GRA)

**Ghana Tax Compliance**
- VAT tracking and reporting
- Withholding tax management
- TIN validation
- GRA submission preparation

### 16.5 Contractor Portal Features

**My Assignments**
- Active project assignments
- Scope of work details
- Contract documents
- Key contacts

**Daily Operations**
- Daily log submission (workers, weather, activities)
- Photo upload with GPS tagging
- Equipment tracking
- Material delivery confirmation

**Punch Lists**
- Assigned punch items
- Photo before/after
- Completion submission
- Verification status

**Time & Attendance**
- Crew time tracking
- Worker roster management
- Overtime logging

**Invoicing**
- Invoice submission
- Supporting document upload
- Payment status tracking
- Payment history

**Documents**
- Contract access
- Insurance certificates
- Safety certifications
- Permit copies

**Safety & Quality**
- Safety checklist completion
- Incident reporting
- Quality inspection submissions

### 16.6 Portal Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PropMetrik Platform Architecture                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                     Frontend Applications                        ││
│  │                                                                  ││
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐    ││
│  │  │ PM Portal  │ │  Client    │ │  Finance   │ │ Contractor │    ││
│  │  │            │ │  Portal    │ │  Portal    │ │   Portal   │    ││
│  │  │ Next.js    │ │ Next.js    │ │ Next.js    │ │ Next.js    │    ││
│  │  │ /pm-portal │ │ /client    │ │ /finance   │ │ /contractor│    ││
│  │  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘    ││
│  │        │              │              │              │           ││
│  └────────┼──────────────┼──────────────┼──────────────┼───────────┘│
│           │              │              │              │            │
│  ┌────────▼──────────────▼──────────────▼──────────────▼───────────┐│
│  │                        API Gateway                               ││
│  │              (Authentication + Authorization)                    ││
│  │                    Keycloak SSO Integration                      ││
│  └──────────────────────────┬──────────────────────────────────────┘│
│                             │                                        │
│  ┌──────────────────────────▼──────────────────────────────────────┐│
│  │                    Backend API (Express.js)                      ││
│  │                                                                  ││
│  │  ┌─────────────────────────────────────────────────────────────┐││
│  │  │               project-management module                      │││
│  │  │                                                              │││
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │││
│  │  │  │   Project    │ │    Unit      │ │   Financial  │         │││
│  │  │  │   Services   │ │   Services   │ │   Services   │         │││
│  │  │  └──────────────┘ └──────────────┘ └──────────────┘         │││
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │││
│  │  │  │ Construction │ │    Ghana     │ │   Analytics  │         │││
│  │  │  │  Operations  │ │  Compliance  │ │   Services   │         │││
│  │  │  └──────────────┘ └──────────────┘ └──────────────┘         │││
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │││
│  │  │  │   Mobile     │ │   WhatsApp   │ │   Quality    │         │││
│  │  │  │    Money     │ │     Bot      │ │   Control    │         │││
│  │  │  └──────────────┘ └──────────────┘ └──────────────┘         │││
│  │  └─────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                        Data Layer                                ││
│  │                                                                  ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           ││
│  │  │  PostgreSQL  │  │    Redis     │  │    MinIO     │           ││
│  │  │  (Primary)   │  │   (Cache)    │  │  (Storage)   │           ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘           ││
│  │                                                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 16.7 Portal Feature Permission Matrix

| Feature | PM Portal | Client Portal | Finance Portal | Contractor Portal |
|---------|:---------:|:-------------:|:--------------:|:-----------------:|
| **Projects** | Full CRUD | View Assigned | View Financials | View Assigned |
| **Units** | Full CRUD | View Owned | View Sales Data | View Work Scope |
| **Phases** | Full CRUD | View Progress | View Budget | View Schedule |
| **Daily Logs** | View/Approve | - | View Costs | Create/Submit |
| **RFIs** | Full CRUD | - | View Cost Impact | Create/Respond |
| **Submittals** | Full CRUD | - | - | Create/Submit |
| **Invoices** | Create/Approve | View Payments | Full CRUD | Submit |
| **Draw Requests** | Create | - | Approve/Fund | - |
| **Payment Plans** | Create | View/Pay | Full CRUD | - |
| **Contractors** | Manage | - | View Payments | Profile/Docs |
| **Punch Lists** | Create/Verify | Report Issues | - | Complete Items |
| **Photos** | View All | View Unit | - | Upload |
| **Analytics** | Full Dashboard | Unit Status | Financial KPIs | Performance |
| **Ghana Compliance** | Full Access | - | Tax Compliance | - |
| **Mobile Money** | Initiate | - | Full Access | Receive |
| **WhatsApp** | All Notifications | Unit Updates | Payment Alerts | Task Alerts |

---

## 17. ENHANCEMENT ROADMAP

### 17.1 Overview

This section outlines the prioritized enhancements to the PropMetrik project-management module based on competitive analysis with OpenProject, industry standards, and Ghana-specific requirements.

### 17.2 Phase 1: Gantt & Scheduling Improvements (4 Weeks)

| Task | Effort | Priority | Description |
|------|--------|----------|-------------|
| Interactive Gantt drag-and-drop | 2 weeks | HIGH | Allow users to drag tasks/phases to reschedule |
| Baseline comparison UI | 1 week | MEDIUM | Visual overlay showing planned vs. actual dates |
| Critical path highlighting | 1 week | MEDIUM | Auto-calculate and highlight critical path in red |
| Export to MS Project format | 1 week | LOW | Export `.mpp` or `.xml` for external sharing |

**Technical Notes:**
- Consider libraries: `@toast-ui/react-gantt`, `dhtmlx-gantt`, or custom SVG implementation
- Baseline data already exists in `scheduling/BaselineService.ts`
- Critical path algorithm in `scheduling/DependencyService.ts`

### 17.3 Phase 2: Kanban Boards (3 Weeks)

| Task | Effort | Priority | Description |
|------|--------|----------|-------------|
| Status-based board view | 2 weeks | HIGH | Kanban board for work packages by status |
| Drag-and-drop cards | 1 week | HIGH | Move items between columns to update status |
| Swimlanes | 1 week | MEDIUM | Group by phase, assignee, or priority |
| WIP limits | 0.5 weeks | LOW | Optional work-in-progress limits per column |

**Implementation Approach:**
- Create `KanbanBoard` component with `react-beautiful-dnd` or `@dnd-kit`
- Board configurations: Status Board, Team Board, Phase Board
- Persist board layouts per user

### 17.4 Phase 3: Multi-Portal Development (12 Weeks)

| Portal | Features | Effort | Description |
|--------|----------|--------|-------------|
| PM Portal | Full dashboard + all features | 4 weeks | Primary project management interface |
| Client Portal | Units, payments, progress, docs | 3 weeks | Buyer-facing portal |
| Finance Portal | Budgets, invoices, draws, reports | 3 weeks | Financial management hub |
| Contractor Portal | Assignments, logs, photos, punch | 2 weeks | Contractor-facing mobile-first UI |

**Architecture Decisions:**
- All portals share the same Next.js app with route-based separation
- OR deploy as separate Next.js apps (recommended for independent scaling)
- Shared component library in `packages/ui`
- Shared API client in `packages/api-client`

**Directory Structure Option A (Monorepo with apps):**
```
/apps
  /pm-portal        # Next.js app for PMs
  /client-portal    # Next.js app for clients
  /finance-portal   # Next.js app for finance
  /contractor-portal # Next.js app for contractors
/packages
  /ui               # Shared component library
  /api-client       # Shared API client
  /types            # Shared TypeScript types
```

**Directory Structure Option B (Single app with routes):**
```
/frontend/src/app
  /(pm)/dashboard/...
  /(client)/my-properties/...
  /(finance)/budgets/...
  /(contractor)/assignments/...
```

### 17.5 Phase 4: Collaboration Features (4 Weeks)

| Feature | Effort | Notes |
|---------|--------|-------|
| Project Wiki | 2 weeks | Markdown-based wiki per project |
| Discussion Forums | 2 weeks | Threaded discussions per project |
| @mentions enhancement | 1 week | Cross-entity mentions (RFI, Submittal, etc.) |
| Activity feeds | 1 week | Enhanced activity stream with filters |

**Implementation:**
- Wiki using `@tiptap/react` for rich text editing
- Store wiki pages in PostgreSQL with versioning
- Forums as discussion threads linked to projects

### 17.6 Phase 5: Mobile App (8 Weeks)

| Feature | Effort | Technology |
|---------|--------|------------|
| React Native app shell | 2 weeks | Expo + React Navigation |
| Offline sync | 2 weeks | SQLite + background sync service |
| Photo capture with GPS | 1 week | expo-camera + expo-location |
| Push notifications | 1 week | Firebase Cloud Messaging |
| Daily log quick entry | 1 week | Optimized mobile form |
| Punch list completion | 1 week | Photo before/after workflow |

**Platform Support:**
- iOS: iPhone 8+ (iOS 14+)
- Android: Android 8.0+ (API 26+)

**Offline Capabilities:**
- Full read access to assigned projects
- Queue write operations for sync
- Photo caching with progressive upload
- Conflict resolution strategy

### 17.7 Phase 6: Advanced Analytics (4 Weeks)

| Feature | Effort | Description |
|---------|--------|-------------|
| Custom report builder | 2 weeks | Drag-and-drop report creation |
| Scheduled reports | 1 week | Email PDF reports on schedule |
| Portfolio analytics | 2 weeks | Cross-project KPIs and trends |
| Predictive analytics | 2 weeks | ML-based completion forecasting |

### 17.8 Timeline Summary

```
Month 1-2:   Phase 1 (Gantt) + Phase 2 (Kanban)
Month 3-4-5: Phase 3 (Multi-Portal Development)
Month 6:     Phase 4 (Collaboration Features)
Month 7-8:   Phase 5 (Mobile App)
Month 9:     Phase 6 (Advanced Analytics) + Testing & Polish
```

**Total Duration**: 9 months
**Estimated Cost**: ~$200,000 USD (vs $700,000+ for OpenProject customization)

### 17.9 Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Portal Adoption | 80% of users access via dedicated portal | Analytics tracking |
| Mobile App Downloads | 500+ in first 6 months | App store metrics |
| Kanban Usage | 40% of projects use board view | Feature analytics |
| Gantt Engagement | 60% of projects have active Gantt | Feature analytics |
| Client Portal NPS | >50 NPS score | Quarterly surveys |
| Contractor Portal Completion | >90% daily log submission rate | System metrics |

---

## 18. SERVICES INVENTORY

### 18.1 Existing project-management Services

The following services are already implemented in `/backend/src/services/project-management/`:

| Service | Lines | Purpose | Status |
|---------|-------|---------|--------|
| `projectService.ts` | 1,069 | Project CRUD, status management | ✅ Complete |
| `unitService.ts` | 1,069 | Unit sales, buyer tracking, upgrades | ✅ Complete |
| `ganttService.ts` | 1,247 | Gantt chart data, dependencies | ✅ Complete |
| `rfiService.ts` | 1,086 | Request for Information workflow | ✅ Complete |
| `whatsappBotService.ts` | 1,630 | WhatsApp notifications | ✅ Complete |
| `qualityChecklistsService.ts` | 1,561 | QC inspection templates | ✅ Complete |
| `photoService.ts` | 1,220 | Photo documentation, geo-tagging | ✅ Complete |
| `punchListService.ts` | 912 | Punch list tracking | ✅ Complete |
| `invoiceService.ts` | 750 | Invoice management | ✅ Complete |
| `submittalService.ts` | 740 | Submittal workflow | ✅ Complete |
| `dailyLogService.ts` | 726 | Daily construction logs | ✅ Complete |
| `contractorService.ts` | 713 | Contractor management | ✅ Complete |
| `procurementService.ts` | 710 | Purchase orders | ✅ Complete |
| `GhanaComplianceService.ts` | 830 | Ghana regulatory compliance | ✅ Complete |
| `MobileMoneyService.ts` | 582 | MTN/Vodafone/AirtelTigo MoMo | ✅ Complete |
| `drawService.ts` | 539 | Draw request processing | ✅ Complete |
| `phaseService.ts` | ~400 | Phase & milestone tracking | ✅ Complete |
| `paymentPlanService.ts` | ~400 | Buyer payment plans | ✅ Complete |
| `projectCostService.ts` | ~500 | Budget & cost tracking | ✅ Complete |
| `projectCostCurrencyService.ts` | ~300 | Multi-currency support | ✅ Complete |
| **Total** | **~17,000+** | | |

### 18.2 Modular Refactoring (Completed)

The monolithic services have been refactored into focused modules:

| Module | Services | Purpose |
|--------|----------|---------|
| `/projects/` | ProjectCoreService, ProjectStatusService, ProjectStatsService | Project lifecycle |
| `/units/` | UnitCrudService, UnitSalesService, UnitUpgradeService, UnitStatsService | Unit management |
| `/scheduling/` | GanttDataService, DependencyService, BaselineService | Scheduling |
| `/analytics/` | PortfolioMetricsService, ProjectHealthService, ProgressAnalyticsService | Analytics |
| `/messaging/` | WhatsAppTemplates, WhatsAppCommandHandler, WhatsAppNotificationService | Communication |
| `/quality/` | ChecklistTemplateService, ChecklistInspectionService, ChecklistResponseService | Quality control |
| `/photos/` | PhotoUploadService, PhotoOrganizationService, PhotoAnnotationService | Photo management |
| `/documents/` | DocumentCrudService, DocumentVersionService, DocumentSharingService | Document management |
| `/rfis/` | RfiCrudService, RfiWorkflowService, RfiCollaborationService, RfiStatsService | RFI management |
| `/compliance/` | GhanaComplianceService | Ghana regulatory |
| `/payments/` | MobileMoneyService | Mobile money |
| `/governance/` | ApprovalService, ComplianceCheckpointService, MilestoneFrameworkService | Enterprise governance |
| `/operations/` | SiteOperationsService | Daily site operations |
| `/financial/` | FinancialAggregatorService | Financial aggregation |
| `/location/` | LocationValidationService, ProjectSearchService, RegulatoryService | Ghana location |

### 18.3 Ghana-Specific Features Summary

| Feature | Service | Description |
|---------|---------|-------------|
| Ghana Post GPS | `projectLocationService.ts` | Digital address integration |
| EPA Permits | `GhanaComplianceService.ts` | Environmental permit tracking |
| Lands Commission | `GhanaComplianceService.ts` | Land title verification |
| GRA TIN | `GhanaComplianceService.ts` | Tax identification validation |
| SSNIT | `GhanaComplianceService.ts` | Social security tracking |
| Fire Service | `GhanaComplianceService.ts` | Fire safety certificates |
| Metro Assembly | `GhanaComplianceService.ts` | Building permits |
| GIPC | `GhanaComplianceService.ts` | Foreign developer registration |
| MTN MoMo | `MobileMoneyService.ts` | Mobile money payments |
| Vodafone Cash | `MobileMoneyService.ts` | Mobile money payments |
| AirtelTigo Money | `MobileMoneyService.ts` | Mobile money payments |
| Regional Validation | `LocationValidationService.ts` | All 16 Ghana regions |
| GHS Multi-Currency | `projectCostCurrencyService.ts` | GHS/USD/EUR with FX rates |

---

## 19. APPENDIX: OPENPROJECT ANALYSIS DECISION

### 19.1 Evaluation Summary

A comprehensive evaluation was conducted comparing OpenProject (open-source PM software) against PropMetrik's custom implementation. Key findings:

| Factor | OpenProject | PropMetrik |
|--------|-------------|------------|
| Real Estate Features | ❌ None | ✅ Complete |
| Ghana Compliance | ❌ None | ✅ Complete |
| Multi-Portal Architecture | ❌ Single app only | ✅ Designed for 4 portals |
| Technology Stack | Ruby/Rails | Node.js/TypeScript |
| Customization Cost | $448K-$608K | Already built |
| Time to Parity | 18-24 months | - |

### 19.2 Decision: Keep PropMetrik

**Rationale:**
1. **Domain Fit**: 17,000+ lines of real estate-specific code
2. **Ghana Features**: Complete regulatory compliance implementation
3. **Cost Savings**: $465,000-$648,000 saved vs. OpenProject customization
4. **Time to Market**: 6-9 months for enhancements vs. 18-24 months for rebuild
5. **Stack Alignment**: Node.js/TypeScript matches existing team skills

### 19.3 What We Can Learn from OpenProject

While not adopting OpenProject, we can cherry-pick UI/UX patterns:

1. **Gantt Interactions**: Study their DHTMLX-based Gantt for drag-and-drop patterns
2. **Work Package Forms**: Configurable form layouts
3. **Notification Center**: Unified notification UI design
4. **Dark Mode**: Accessibility implementation
5. **Keyboard Shortcuts**: Power user feature patterns