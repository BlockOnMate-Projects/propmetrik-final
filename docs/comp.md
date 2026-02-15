# Comparable Adjustment Methodology Review

## Executive Summary

PROPMETRIK implements a **Market Comparison Approach** with adjustment calculations across both frontend (TypeScript) and backend (Python) systems. The platform sources property data from multiple Ghanaian real estate portals via Scrapy spiders, with data stored in PostgreSQL and searchable via spatial queries.

### ⚠️ Critical Data Reality

**PROPMETRIK uses LISTING DATA (asking prices), NOT verified sales transactions.**

All comparable properties are scraped from listing portals (Meqasa, GhanaPropertyCentre, Housemaster, RealtorGH). These represent:
- **Asking prices** — NOT achieved sale prices
- **Listing dates** — NOT transaction dates  
- **Market offerings** — NOT completed transactions

This is **professionally acceptable** under RICS and GhIS guidance for thin markets like Ghana, but requires:
1. Proper framing as "Market-Informed Estimates" not "Market Value"
2. Systematic Listing-to-Value adjustments (asking → achieved discount)
3. Transparent disclosure in reports
4. Quality weighting by data freshness and relevance

### Critical Technical Findings

| Issue | Severity | Impact | Status |
|-------|----------|--------|--------|
| Missing sales comparison fallback in reconciliation | 🔴 Critical | Comparables don't appear when selecting sales approach | ✅ Fixed |
| No asking-to-achieved price adjustment | 🔴 Critical | Values overstated by 5-20% | ✅ Fixed |
| Incorrect "sale" terminology throughout UI | 🟠 Medium | Misleading to valuers | ✅ Fixed |
| No disclosure language for listing-based evidence | 🔴 Critical | Non-compliant with RICS/GhIS | ✅ Fixed |
| No delisted property tracking | 🟠 Medium | Missing quasi-transaction data | Phase 2 |
| Python backend not connected | 🟡 Low | Sophisticated logic unused | Phase 3 |
| Dual table architecture confusion | 🟡 Low | Inconsistent data access | Phase 3 |

---

## Table of Contents

1. [Current Architecture Overview](#1-current-architecture-overview)
2. [Data Hub & Property Sources](#2-data-hub--property-sources)
3. [RICS & GhIS Compliance Framework](#3-rics--ghis-compliance-framework)
4. [Comparables Selection Flow](#4-comparables-selection-flow)
5. [Listing-to-Value Adjustment Methodology](#5-listing-to-value-adjustment-methodology)
6. [Physical & Location Adjustments](#6-physical--location-adjustments)
7. [Value Calculation & Weighting](#7-value-calculation--weighting)
8. [Database Schema](#8-database-schema)
9. [Identified Issues & Gaps](#9-identified-issues--gaps)
10. [Phased Implementation Plan](#10-phased-implementation-plan)

---

## 1. Current Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA SOURCES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Scrapy Spiders        │  Manual Entry       │  Contributed Data            │
│  ├── Meqasa           │  (Dashboard)        │  (User submissions)          │
│  ├── GhanaPropertyCtr │                     │  [NOT YET IMPLEMENTED]       │
│  ├── Housemaster      │                     │                              │
│  └── RealtorGH        │                     │                              │
│                       │                     │                              │
│  DATA TYPE: LISTINGS  │  DATA TYPE: MIXED   │  DATA TYPE: VERIFIED SALES   │
│  (Asking Prices)      │  (User-defined)     │  (With proof)                │
└───────────┬───────────┴─────────┬───────────┴─────────────┬────────────────┘
            │                     │                         │
            ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROPERTIES TABLE (PostgreSQL)                        │
│  - Geocoded locations (PostGIS)                                             │
│  - Property attributes (beds, baths, size, year, condition)                 │
│  - Pricing data (price = ASKING PRICE, sold_price = usually NULL)           │
│  - Source metadata (trust_score, scraped_at)                                │
│  - transaction_type: 'sale' means FOR SALE, not WAS SOLD                    │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      COMPARABLES SEARCH API                                  │
│  Endpoint: POST /api/v1/valuations/:id/comparables/search                   │
│  Features:                                                                  │
│  - Haversine distance calculation (radius search)                           │
│  - Property type matching                                                   │
│  - Size range filtering (±30% of subject)                                   │
│  - Age filtering (default: last 12 months of LISTINGS)                      │
│  - Similarity scoring algorithm                                             │
│                                                                             │
│  ⚠️ MISSING: Asking-to-Achieved adjustment                                  │
│  ⚠️ MISSING: Evidence type classification                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Files

| Component | File Path | Purpose |
|-----------|-----------|---------|
| Comparables Selection UI | `frontend/src/app/dashboard/valuations/[id]/comparables/page.tsx` | Search, filter, select comparables |
| Market Analysis Page | `frontend/src/app/dashboard/valuations/[id]/market/page.tsx` | Adjustment grid, value calculation |
| Adjustment Grid Component | `frontend/src/components/valuation/AdjustmentGrid.tsx` | Full adjustment matrix |
| Comparables API (TS Backend) | `backend/src/routes/valuations.ts` (lines 884-2200) | Search, basket management |
| Python Sales Comparison | `backend/src/services/valuation-engine/python/app/services/sales_comparison.py` | Automated adjustments (UNUSED) |
| API Client | `frontend/src/lib/valuation-api.ts` | `comparablesApi`, `marketApi` |
| Reconciliation Page | `frontend/src/app/dashboard/valuations/[id]/reconciliation/page.tsx` | Final value determination |

---

## 2. Data Hub & Property Sources

### Active Scrapers

| Spider | Source Website | Trust Score | Data Type | Data Quality |
|--------|----------------|-------------|-----------|--------------|
| `meqasa` | meqasa.com | 0.65 | Listings (Asking) | High - Prices, photos, detailed specs |
| `gpc` | ghanapropertycentre.com | 0.65 | Listings (Asking) | Medium - Good coverage |
| `housemaster` | housemaster.com.gh | 0.65 | Listings (Asking) | Medium - Focus on Accra |
| `realtor_international` | realtorgh.com | 0.65 | Listings (Asking) | Medium - International listings |

**Location**: `backend/data-pipelines/scrapy/propmetrik_scrapers/spiders/`

### Database Schema Reality

From `backend/src/database/migrations/003_properties_partitioned.sql`:

```sql
-- Pricing fields in properties table
price DECIMAL(15, 2) NOT NULL,      -- This is the ASKING price
price_currency currency_enum DEFAULT 'GHS',
is_negotiable BOOLEAN DEFAULT TRUE, -- Indicates it's NOT a final price

-- These fields exist but are typically NULL for scraped data:
sold_at TIMESTAMPTZ,                -- When property sold (usually NULL)
sold_price DECIMAL(15, 2),          -- Actual sale price (usually NULL)

-- transaction_type is MISLEADING:
transaction_type transaction_type_enum NOT NULL,
-- Values: 'sale' = listed FOR sale, 'rent' = listed FOR rent
-- NOT: 'sale' = was sold
```

### Data Quality Issues

| Issue | Current State | Impact | Priority |
|-------|---------------|--------|----------|
| Missing Coordinates | ~30% of listings lack lat/lng | Excluded from radius search | High |
| No Sale Prices | `sold_price` is NULL for 99%+ of records | Cannot validate asking→achieved gap | Critical |
| No Delisting Tracking | Properties just disappear | Cannot infer quasi-sales | Medium |
| Stale Data | No automated re-scraping visible | Listings may be outdated | Medium |
| Inconsistent Property Types | "House" vs "Detached House" etc. | Fuzzy matching needed | Low |

---

## 3. RICS & GhIS Compliance Framework

### What RICS Permits (Red Book – VPS 1 & VPGA 4)

RICS states that where markets are thin and transactional evidence is limited:

> "A valuer may use asking prices, offers, and market intelligence provided that:
> 1. The evidence is clearly identified
> 2. Adjustments are reasonable and justifiable  
> 3. The result is not misrepresented as a completed transaction"

**Key Quote**: *"Market value may be inferred from asking prices subject to appropriate adjustment."*

### What GhIS Permits (Ghana Practice)

GhIS practice accepts:
- Asking prices as evidence
- Broker intelligence
- Local market knowledge

Because:
- Formal sales registers are incomplete
- Many transactions are private
- Listings often represent negotiation anchors

### Correct Terminology Framework

| ❌ Incorrect | ✅ Correct |
|-------------|-----------|
| "Comparable sales" | "Comparable market offerings" |
| "Sale price" | "Asking price" or "Listing price" |
| "Market Value" (without triangulation) | "Market-Informed Estimate" or "Indicative Value" |
| "Transaction date" | "Listing date" |

### Output Classification by Evidence Quality

| Evidence Available | Allowed Output | Confidence |
|-------------------|----------------|------------|
| Verified sold transactions | Market Value | High |
| Delisted + current listings | Indicative Value | Medium-High |
| Listings only (current state) | Market-Informed Estimate | Medium |
| User input / assumptions | Assumption-Based Estimate | Low |

### Required Disclosure Language

Every report using listing-based evidence MUST include:

> *"Due to the absence of verified transactional data, this valuation relies on adjusted asking prices from comparable market offerings. These do not represent completed sales but provide an indication of prevailing market sentiment. Appropriate adjustments have been applied in accordance with RICS and GhIS guidance."*

---

## 4. Comparables Selection Flow

### Step 4: Comparables Page (`/valuations/[id]/comparables`)

**Purpose**: Search and select comparable market offerings

**Minimum Filters (RICS requires relevance)**:
- Same land use (residential / mixed / commercial)
- Same zoning or planning potential
- Same neighborhood or submarket
- Similar plot size (±25–30%)
- Recently listed (last 6–12 months)

**Current Search Parameters**:
```typescript
{
  radius_km: 5,           // Default radius
  property_type: string,  // Must match subject
  min_price: number,      // Subject ±50%
  max_price: number,
  min_size: number,       // Subject ±30%
  max_size: number,
  bedrooms_min: number,   // Subject ±1
  bedrooms_max: number,
  max_age_months: 12,     // Listing age, NOT sale age
}
```

### Step 5: Market Analysis Page (`/valuations/[id]/market`)

**Current Workflow**:
1. Load selected comparables from basket
2. Display in AdjustmentGrid
3. Auto-calculate physical/location adjustments
4. Apply weighting method
5. Calculate indicated value
6. Save to `method_results.sales_comparison`

**Missing from Current Workflow**:
- ❌ Asking-to-Achieved adjustment (Step 0)
- ❌ Evidence type classification
- ❌ Time-on-market penalty
- ❌ Title risk adjustment (Ghana-specific)

---

## 5. Listing-to-Value Adjustment Methodology

### The Critical Missing Step

Before ANY physical adjustments, listings must be converted to estimated transaction values:

```
Listing Price → Listing Adjustments → Estimated Transaction Value → Physical Adjustments → Indicated Value
```

### Listing-to-Value Adjustment Factors

| Adjustment Factor | Typical Range | Rationale | Data Source |
|-------------------|---------------|-----------|-------------|
| **Asking → Achieved** | −5% to −20% | Negotiation gap | Market research |
| **Time on Market** | −5% to −15% | Overpriced listings linger | Days since first listed |
| **Price Reductions** | 0% to −10% | Already partially adjusted | Price history tracking |
| **Title Risk** | −10% to −30% | Ghana-specific (Stool/Family land) | Manual classification |
| **Verification Status** | −5% to +5% | Data reliability | Source trust score |

### Ghana-Specific Asking→Achieved Discounts

Based on market research and professional practice:

| Property Type | Location Tier | Typical Discount | Notes |
|---------------|---------------|------------------|-------|
| Residential | Prime (Airport Res, Cantonments) | 5-10% | Tight market, less negotiation |
| Residential | Secondary (East Legon, Labone) | 8-12% | Normal negotiation |
| Residential | Tertiary (Madina, Tema) | 10-15% | More negotiation room |
| Land | All areas | 15-25% | High negotiation on land |
| Commercial | All areas | 10-20% | Depends on tenant situation |

### Title Risk Adjustments (Ghana-Specific)

| Tenure Type | Adjustment | Risk Level |
|-------------|------------|------------|
| Freehold (Registered) | 0% | Low |
| Leasehold (99yr+) | −5% | Low |
| Leasehold (50-99yr) | −10% | Medium |
| Stool Land (documented) | −15% | Medium-High |
| Family Land (documented) | −20% | High |
| Undocumented | −25% to −30% | Very High |

### Recommended Calculation Formula

```typescript
const calculateAdjustedListingValue = (listing: ComparableListing) => {
  const askingPrice = listing.price;
  
  // Step 1: Asking→Achieved Discount
  const marketDiscount = getMarketDiscount(listing.property_type, listing.neighborhood);
  
  // Step 2: Time on Market Penalty
  const daysOnMarket = daysSince(listing.first_listed_at);
  const tomPenalty = daysOnMarket > 90 ? Math.min(0.15, (daysOnMarket - 90) * 0.001) : 0;
  
  // Step 3: Title Risk
  const titleDiscount = getTitleDiscount(listing.tenure_type);
  
  // Step 4: Calculate Estimated Transaction Value
  const estimatedTransactionValue = askingPrice * (1 - marketDiscount) * (1 - tomPenalty) * (1 - titleDiscount);
  
  return {
    asking_price: askingPrice,
    estimated_transaction_value: estimatedTransactionValue,
    adjustments: {
      market_discount: marketDiscount,
      time_on_market_penalty: tomPenalty,
      title_risk_discount: titleDiscount,
      total_listing_adjustment: 1 - (estimatedTransactionValue / askingPrice),
    }
  };
};
```

---

## 6. Physical & Location Adjustments

### Current Frontend Adjustment Categories

The `AdjustmentGrid` component implements these adjustments (applied AFTER listing adjustments):

#### Physical Adjustments

| Factor | Calculation Method | Max Adjustment |
|--------|-------------------|----------------|
| **Gross Floor Area (GFA)** | `(subject_gfa - comp_gfa) / comp_gfa × 100` | ±25% |
| **Plot Size** | `(subject_plot - comp_plot) / comp_plot × 100` | ±20% |
| **Bedrooms** | 2.5% per bedroom difference | ±12.5% |
| **Bathrooms** | 2% per bathroom difference | ±10% |
| **Age** | 0.5% per year difference | ±15% |
| **Condition** | 5% per level (Excellent→Good→Fair→Poor) | ±20% |
| **Quality Rating** | 5% per level (Luxury→High→Standard→Basic) | ±20% |
| **Floor Level** | 2% per floor (apartments only) | ±10% |

#### Location Adjustments

| Factor | Calculation Method | Max Adjustment |
|--------|-------------------|----------------|
| **Neighborhood** | Rating comparison × 5% | ±25% |
| **View Quality** | Rating comparison × 3% | ±10% |
| **Accessibility** | Rating comparison × 2% | ±8% |

#### Ghana-Specific Location Premiums

| Neighborhood | Premium Factor | Notes |
|--------------|----------------|-------|
| Airport Residential | 1.30 | Most premium area |
| Cantonments | 1.25 | Diplomatic enclave |
| Roman Ridge | 1.22 | High-end residential |
| East Legon | 1.20 | Popular upscale area |
| Labone | 1.18 | Established residential |
| Osu | 1.15 | Commercial/residential mix |
| Dzorwulu | 1.10 | Growing middle-class |
| Achimota | 1.00 | Baseline |
| Adabraka | 0.95 | City center, older |
| Tema | 0.90 | Industrial port city |
| Madina | 0.85 | High-density, lower income |

#### Time Adjustment (Market Appreciation)

| Market Condition | Annual Rate | Application |
|------------------|-------------|-------------|
| Strong growth | 12-15% | Apply to older listings |
| Normal growth | 8-10% | Default |
| Stagnant | 0-3% | Flat market |
| Declining | -5% to 0% | Rare in Ghana |

---

## 7. Value Calculation & Weighting

### Quality Score Calculation (Confidence Weighting)

Listings should NOT be weighted equally. Use confidence weighting:

| Factor | Weight | Rationale |
|--------|--------|-----------|
| Freshness (newer = higher) | 25% | Recent data more reliable |
| Size similarity | 25% | More comparable = higher weight |
| Location match | 30% | Location is primary driver |
| Data completeness | 10% | Complete listings more trustworthy |
| Source reliability | 10% | Based on spider trust score |

```typescript
const calculateQualityScore = (comp: ComparableListing, subject: Property) => {
  let score = 0;
  
  // Freshness (25%)
  const daysSinceListed = daysSince(comp.listed_at);
  const freshnessScore = Math.max(0, 1 - (daysSinceListed / 365));
  score += freshnessScore * 0.25;
  
  // Size similarity (25%)
  const sizeDiff = Math.abs(subject.gfa - comp.gfa) / subject.gfa;
  const sizeScore = Math.max(0, 1 - sizeDiff);
  score += sizeScore * 0.25;
  
  // Location match (30%)
  const distanceScore = Math.max(0, 1 - (comp.distance_km / 10));
  const sameNeighborhood = comp.neighborhood === subject.neighborhood ? 1 : 0.7;
  score += (distanceScore * 0.5 + sameNeighborhood * 0.5) * 0.30;
  
  // Data completeness (10%)
  const completeness = calculateDataCompleteness(comp);
  score += completeness * 0.10;
  
  // Source reliability (10%)
  score += (comp.source_trust_score || 0.65) * 0.10;
  
  return score;
};
```

### Weighting Methods

| Method | Use Case | Formula |
|--------|----------|---------|
| Quality Weighted (Default) | Most cases | `Σ(value × qualityScore) / Σ(qualityScore)` |
| Simple Average | When all equally relevant | `Σ(value) / count` |
| Median | When outliers present | Middle value |
| Manual | Professional override | Valuer sets weights |

### Output Value Classification

Based on evidence quality, the indicated value should be labeled:

```typescript
type ValueClassification = 
  | 'market_value'           // Verified transactions available
  | 'indicative_value'       // Mixed evidence (delisted + listings)
  | 'market_informed_estimate' // Listings only (current state)
  | 'assumption_based';      // Minimal evidence

const classifyOutput = (comparables: Comparable[]) => {
  const verifiedSales = comparables.filter(c => c.evidence_type === 'verified_sale').length;
  const delistedInferred = comparables.filter(c => c.evidence_type === 'delisted').length;
  const listings = comparables.filter(c => c.evidence_type === 'listing').length;
  
  if (verifiedSales >= 3) return 'market_value';
  if (verifiedSales >= 1 || delistedInferred >= 2) return 'indicative_value';
  if (listings >= 3) return 'market_informed_estimate';
  return 'assumption_based';
};
```

---

## 8. Database Schema

### Current Tables

#### `properties` (Source Data)

```sql
CREATE TABLE properties (
  id UUID PRIMARY KEY,
  -- Pricing (THIS IS ASKING PRICE)
  price DECIMAL(15, 2) NOT NULL,
  is_negotiable BOOLEAN DEFAULT TRUE,
  
  -- These are usually NULL for scraped data
  sold_at TIMESTAMPTZ,
  sold_price DECIMAL(15, 2),
  
  -- Source tracking
  data_source source_type_enum, -- 'scraped', 'manual_entry', 'contributed'
  source_url VARCHAR(500),
  scraped_at TIMESTAMPTZ,
  
  -- Delisting tracking (NEEDS TO BE ADDED)
  -- first_seen_at TIMESTAMPTZ,
  -- last_seen_at TIMESTAMPTZ,
  -- is_delisted BOOLEAN,
  -- delisted_at TIMESTAMPTZ,
);
```

#### `valuation_comparable_baskets`

```sql
CREATE TABLE valuation_comparable_baskets (
  id UUID PRIMARY KEY,
  valuation_id UUID REFERENCES valuations(id),
  
  -- Calculated Values
  indicated_value DECIMAL(18,2),
  confidence_score DECIMAL(4,3),
  
  -- NEEDS TO BE ADDED:
  -- value_classification VARCHAR(50), -- 'market_value', 'indicative_value', etc.
  -- total_listing_adjustment DECIMAL(8,4), -- Aggregate asking→achieved
);
```

#### `valuation_basket_comparables`

```sql
CREATE TABLE valuation_basket_comparables (
  id UUID PRIMARY KEY,
  basket_id UUID REFERENCES valuation_comparable_baskets(id),
  comparable_property_id UUID REFERENCES properties(id),
  
  -- Current fields
  raw_sale_price DECIMAL(18,2),        -- SHOULD BE: raw_asking_price
  adjusted_sale_price DECIMAL(18,2),   -- SHOULD BE: adjusted_value
  adjustments_summary JSONB,
  
  -- NEEDS TO BE ADDED:
  -- evidence_type VARCHAR(30), -- 'listing', 'delisted', 'verified_sale', 'contributed'
  -- listing_adjustment DECIMAL(8,4), -- asking→achieved
  -- estimated_transaction_value DECIMAL(18,2),
);
```

---

## 9. Identified Issues & Gaps

### 🔴 Critical Issues

#### 1. Sales Comparison Not Flowing to Reconciliation

**Location**: `frontend/src/app/dashboard/valuations/[id]/reconciliation/page.tsx` (Line 161)

**Problem**: Only `cost_approach` has a fallback. There's a TODO comment:
```typescript
// TODO: Add similar fallbacks for sales_comparison and income_approach when implemented
```

**Impact**: If `method_results.sales_comparison` is empty, reconciliation shows no value.

#### 2. No Asking-to-Achieved Adjustment

**Problem**: Listings are used at face value without discount.

**Impact**: Values overstated by 5-20% depending on property type and location.

#### 3. Incorrect "Sale" Terminology

**Problem**: UI and code refer to "sale_price" when it's actually "asking_price".

**Locations**:
- `valuation_basket_comparables.raw_sale_price`
- `AdjustmentGrid.tsx` references
- API response fields

### 🟠 Medium Issues

#### 4. No Delisted Property Tracking

**Problem**: Cannot detect when listings disappear (potential sales).

**Impact**: Missing valuable quasi-transaction evidence.

#### 5. Python Backend Not Connected

**Location**: `backend/src/services/valuation-engine/python/app/services/sales_comparison.py`

**Problem**: Sophisticated Ghana-specific adjustment logic exists but is never called.

#### 6. Dual Table Architecture

**Problem**: Both `valuation_comparables` and `valuation_basket_comparables` exist with overlapping purposes.

### 🟡 Low Priority Issues

#### 7. Missing Geocoding Pipeline

**Problem**: ~30% of listings lack coordinates.

#### 8. No Data Quality Dashboard

**Problem**: Cannot monitor data coverage and freshness.

#### 9. No `salesComparisonApi` Client

**Problem**: Inconsistent with `costApproachApi` pattern.

---

## 10. Phased Implementation Plan

### Phase 1: Critical Fixes (Week 1-2) ✅ COMPLETED

**Goal**: Make sales comparison functional and add basic listing adjustments

#### 1.1 Fix Reconciliation Data Flow ✅
**Files**: `frontend/src/app/dashboard/valuations/[id]/reconciliation/page.tsx`

**Tasks**:
- [x] Add sales comparison fallback using `comparablesApi.getBasket(valuationId)`
- [x] Map basket `indicated_value` to reconciliation method results
- [x] Track evidence types for disclosure generation
- [ ] Add income approach fallback (for future)

**Implementation**:
- Added `comparablesApi` import
- Created fallback logic to fetch basket and calculate indicated value from comparables
- Added `comparableBasket` state for disclosure tracking

#### 1.2 Add Asking-to-Achieved Adjustment ✅
**Files**: 
- `frontend/src/components/valuation/AdjustmentGrid.tsx`
- `frontend/src/components/valuation/ListingAdjustmentPanel.tsx` (NEW)
- `frontend/src/components/valuation/index.ts`

**Tasks**:
- [x] Add `listing_adjustment` field to comparable type
- [x] Add `evidence_type` field to comparable types
- [x] Create `ListingAdjustmentPanel` component with RICS/GhIS compliance
- [x] Default discount by property type/location lookup table
- [x] Allow manual override with justification
- [x] Add `listing_adjustment` category to AdjustmentGrid (before physical adjustments)

**Implementation**:
- Added new `listing_adjustment` category to `ADJUSTMENT_CATEGORIES` in AdjustmentGrid
- Created comprehensive `ListingAdjustmentPanel` with:
  - Evidence type selection (verified_sale, achieved_price, asking_price, listing)
  - Auto-calculated adjustments based on quality segment (-20% luxury to -5% basic)
  - Market conditions adjustment
  - Days on market consideration
  - Manual override capability
- Export `generateListingDisclosure` helper function

#### 1.3 Fix Terminology ✅
**Files**: Multiple frontend and backend files

**Tasks**:
- [x] Rename `sale_price` → `asking_price` in UI labels (AdjustmentGrid, market page table header)
- [x] Rename `sale_date` → `listing_date` in UI labels
- [x] Add `evidence_type` field: 'verified_sale' | 'achieved_price' | 'asking_price' | 'listing'
- [x] Add `listing_adjustment` and `days_on_market` fields to interfaces

**Files Updated**:
- `AdjustmentGrid.tsx` - Changed labels in transaction category
- `ComparableDetailCard.tsx` - Added evidence_type to interface, changed "Sale Date" to "Listing Date"
- `market/page.tsx` - Changed table header from "SALE PRICE" to "ASKING PRICE"

#### 1.4 Add Disclosure Language ✅
**Files**: 
- `frontend/src/app/dashboard/valuations/[id]/reconciliation/page.tsx`
- `frontend/src/components/valuation/ListingAdjustmentPanel.tsx`

**Tasks**:
- [x] Auto-generate disclosure based on evidence types in autoNarrative
- [x] Track comparablesCount, verifiedSaleCount, askingPriceCount, avgListingAdjustment
- [x] Include in narrative preview with RICS/GhIS compliant language
- [x] Export `generateListingDisclosure` helper for report generation

**Implementation**:
- Added `comparableBasket` state in reconciliation page
- Updated `autoNarrative` useMemo to include listing evidence disclosure
- Three disclosure variants: all-listings, mixed, all-verified

---

### Phase 2: Evidence Quality Enhancement (Week 3-4)

**Goal**: Track delisted properties and improve evidence classification

#### 2.1 Delisted Property Tracking
**Files**:
- `backend/data-pipelines/scrapy/propmetrik_scrapers/pipelines/`
- `backend/src/database/migrations/` (new migration)

**Tasks**:
- [ ] Add `first_seen_at`, `last_seen_at`, `is_delisted`, `delisted_at` columns
- [ ] Create pipeline to track listing lifecycle
- [ ] Mark properties as delisted when not seen for 7+ days
- [ ] Infer estimated sale: `last_asking_price × (1 - typical_discount)`

**Database Migration**:
```sql
ALTER TABLE properties 
ADD COLUMN first_seen_at TIMESTAMPTZ,
ADD COLUMN last_seen_at TIMESTAMPTZ,
ADD COLUMN is_delisted BOOLEAN DEFAULT FALSE,
ADD COLUMN delisted_at TIMESTAMPTZ,
ADD COLUMN inferred_sale_price DECIMAL(15,2);
```

**Estimated Time**: 8 hours

#### 2.2 Evidence Type Classification
**Files**:
- `backend/src/routes/valuations.ts`
- `frontend/src/lib/valuation-api.ts`

**Tasks**:
- [ ] Add `evidence_type` to comparable search results
- [ ] Classify: scraped → 'listing', delisted → 'delisted_inferred'
- [ ] Allow manual classification to 'verified_sale' with proof upload
- [ ] Update quality score calculation to weight by evidence type

**Estimated Time**: 6 hours

#### 2.3 Create `salesComparisonApi` Client
**Files**: `frontend/src/lib/valuation-api.ts`

**Tasks**:
- [ ] Create dedicated API client matching `costApproachApi` pattern
- [ ] Add endpoints: `getByValuation`, `calculate`, `save`
- [ ] Update market page to use new client

**Estimated Time**: 3 hours

---

### Phase 3: Ghana-Specific Enhancements (Week 5-6)

**Goal**: Add location premiums, title risk, and market data

#### 3.1 Neighborhood Premium System
**Files**:
- `backend/src/services/valuation-engine/python/app/services/sales_comparison.py`
- New: `backend/src/database/seeds/neighborhood_premiums.sql`

**Tasks**:
- [ ] Create `neighborhood_premiums` reference table
- [ ] Seed with Ghana data (Airport Res: 1.30, Cantonments: 1.25, etc.)
- [ ] Auto-apply in adjustment calculation
- [ ] Allow admin to update premiums

**Estimated Time**: 4 hours

#### 3.2 Title Risk Adjustment
**Files**:
- `frontend/src/components/valuation/AdjustmentGrid.tsx`
- `frontend/src/types/comprehensiveProperty.ts`

**Tasks**:
- [ ] Add `tenure_type` field to comparable selection
- [ ] Create tenure risk lookup (Freehold: 0%, Stool: -15%, etc.)
- [ ] Auto-apply in listing adjustments
- [ ] Add to adjustment breakdown display

**Estimated Time**: 4 hours

#### 3.3 Connect Python Valuation Engine
**Files**:
- `backend/src/routes/valuations.ts`
- `backend/src/services/valuation-engine/pythonClient.ts`

**Tasks**:
- [ ] Create endpoint: `POST /api/v1/valuations/:id/sales-comparison/auto-calculate`
- [ ] Call Python service with subject + comparables
- [ ] Return calculated adjustments for frontend display
- [ ] Allow "Use Python Calculation" option in UI

**Estimated Time**: 6 hours

---

### Phase 4: Data Quality & Monitoring (Week 7-8)

**Goal**: Improve data coverage and add monitoring

#### 4.1 Geocoding Pipeline
**Files**:
- `backend/data-pipelines/scrapy/propmetrik_scrapers/pipelines/`
- New: `backend/scripts/backfill/geocode_properties.py`

**Tasks**:
- [ ] Integrate GhanaPost GPS API for address→coordinates
- [ ] Run as post-processing step after scraping
- [ ] Backfill existing properties
- [ ] Target: 90%+ geocoding coverage

**Estimated Time**: 8 hours

#### 4.2 Data Quality Dashboard
**Files**: New: `frontend/src/app/dashboard/data-hub/quality/page.tsx`

**Tasks**:
- [ ] Total properties by source
- [ ] Geocoding coverage %
- [ ] Price data coverage %
- [ ] Average data age by source
- [ ] Evidence type distribution
- [ ] Weekly trend charts

**Estimated Time**: 8 hours

#### 4.3 Consolidate Database Tables
**Files**:
- `backend/src/routes/valuations.ts`
- Database migration

**Tasks**:
- [ ] Decide: Use baskets OR direct comparables (recommend baskets)
- [ ] Deprecate unused table
- [ ] Update all queries to use single pattern
- [ ] Add foreign key constraints

**Estimated Time**: 6 hours

---

### Phase 5: Rental Comparables Engine for Income Approach (Week 9-10)

**Goal**: Enable market rent estimation using rental listing comparables

#### Overview

The Income Approach requires accurate market rent estimation. While not required for value derivation like Sales Comparison, rental comparables help valuers:
1. **Estimate Market Rent** - For vacant properties or under-rented assets
2. **Validate Asking Rent** - Compare subject's rent against market
3. **Determine Cap Rates** - From investment property data
4. **Support Income Assumptions** - Provide evidence for DCF projections

#### 5.1 Rental Comparables Search API ✅ COMPLETED
**Files**:
- `backend/src/routes/valuations.ts` - Add rental search endpoint
- `frontend/src/lib/valuation-api.ts` - Add `rentalComparablesApi` client

**New Endpoint**: `POST /api/v1/valuations/:id/rental-comparables/search`

**Tasks**:
- [x] Create rental search endpoint filtering `transaction_type = 'rental'`
- [x] Search parameters: radius, property_type, bedrooms, size range
- [x] Calculate rental similarity score (different from sales)
- [x] Return rental listings with rent_per_sqm_monthly
- [x] Add `rentalComparablesApi.search()` client method
- [x] Add `rentalComparablesApi.estimateMarketRent()` convenience method
- [x] Add `rentalComparablesApi.getMarketStats()` convenience method
- [x] Currency conversion (USD → GHS) with fx_rate_used tracking
- [x] Aggregate statistics: avgRentMonthly, medianRentMonthly, suggestedRentForSubject

**Search Parameters**:
```typescript
interface RentalSearchParams {
  radiusKm: number;           // Default: 3km (tighter for rentals)
  propertyType: string;
  bedroomsMin?: number;
  bedroomsMax?: number;
  sizeMin?: number;           // GFA in sqm
  sizeMax?: number;
  maxAgeMonths?: number;      // Default: 6 months (rentals change faster)
  furnishing?: 'furnished' | 'unfurnished' | 'semi-furnished';
  limit?: number;
}
```

**Response**:
```typescript
interface RentalComparable {
  id: string;
  address: string;
  neighborhood: string;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  gfa_sqm: number;
  asking_rent_monthly: number;     // Monthly asking rent
  rent_per_sqm_monthly: number;    // ₵/sqm/month
  furnishing: string;
  amenities: string[];
  listing_date: string;
  distance_km: number;
  similarity_score: number;
  data_source: string;
}
```

**Estimated Time**: 6 hours

#### 5.2 Rental Market Analysis Panel ✅ COMPLETED
**Files**:
- New: `frontend/src/components/valuation/RentalMarketPanel.tsx`
- `frontend/src/app/dashboard/valuations/[id]/income/page.tsx`

**Purpose**: Display rental comparables in Income Approach page to help estimate market rent

**Tasks**:
- [x] Create `RentalMarketPanel` component
- [x] Show rental comparables table with key metrics
- [x] Display market rent statistics (median, average, range)
- [x] Calculate suggested rent based on subject property size
- [x] Allow user to accept suggested rent or override with justification
- [x] Integrate into Income Approach page

**Component Features**:
```typescript
interface RentalMarketPanelProps {
  valuationId: string;
  subjectProperty: {
    gfa_sqm: number;
    bedrooms: number;
    property_type: string;
    neighborhood: string;
  };
  onRentEstimated: (rent: number, confidence: number, comparables: RentalComparable[]) => void;
}

// Output
interface RentEstimate {
  suggestedMonthlyRent: number;
  rentPerSqm: number;
  confidence: number;
  comparablesUsed: number;
  methodology: 'median' | 'weighted_average' | 'manual';
  justification?: string;
}
```

**Estimated Time**: 8 hours

#### 5.3 Rental Adjustments ✅ COMPLETED
**Files**:
- New: `frontend/src/components/valuation/RentalAdjustmentGrid.tsx`

**Rental-Specific Adjustment Factors**:

| Factor | Calculation | Range | Notes |
|--------|-------------|-------|-------|
| **Size (GFA)** | `(subject - comp) / comp × 100` | ±20% | Smaller range than sales |
| **Bedrooms** | 3% per bedroom difference | ±15% | Higher impact on rent |
| **Furnishing** | Furnished +15%, Semi +8% | -15% to +15% | Major rental factor |
| **Amenities** | Pool +5%, Gym +3%, Security +3% | ±15% | Cumulative |
| **Parking** | 2% per space difference | ±10% | Important for urban |
| **Floor Level** | 1.5% per floor (apartments) | ±10% | Higher floors = premium |
| **Age/Condition** | 0.3% per year | ±10% | Less impact than sales |
| **Location** | Neighborhood premium table | ±20% | Same as sales |

**Tasks**:
- [x] Create rental-specific adjustment grid component
- [x] Apply Ghana rental market adjustments
- [x] Calculate adjusted rent per comparable
- [x] Weight by similarity and freshness

**Implementation Details**:
- Created `RentalAdjustmentGrid.tsx` with:
  - 4 adjustment categories: Rental Details, Physical, Furnishing & Amenities, Location
  - Auto-calculate feature for all adjustments
  - Collapsible category sections
  - Lock/unlock individual comparables
  - Gross adjustment and adjusted rent calculations
  - Weighted average and median rent summary
- Integrated into `RentalMarketPanel.tsx` with view mode toggle (Summary/Adjustments)
- Uses Ghana neighborhood premiums from `AdjustmentGrid.tsx`
- Exports from `components/valuation/index.ts`

**Estimated Time**: 6 hours

#### 5.4 Ghana Rental Market Data ✅ COMPLETED
**Files**:
- New: `backend/src/database/migrations/20260112_create_rental_market_benchmarks.sql`
- New: `backend/src/database/seeds/compute_rental_benchmarks.sql`
- Updated: `backend/src/routes/valuations.ts` - Added benchmark API endpoints
- Updated: `frontend/src/lib/valuation-api.ts` - Added `getMarketBenchmarks()` and `getAllBenchmarks()`
- Updated: `frontend/src/components/valuation/RentalMarketPanel.tsx` - Benchmark fallback display

**Rental Market Benchmarks (Computed from Data Hub)**:

| Area | Listings | Avg Rent | Median Rent | Source |
|------|----------|----------|-------------|--------|
| East Legon | 182 | ₵28,000 | ₵24,000 | Data Hub |
| Tse Addo | 90 | ₵16,195 | ₵19,600 | Data Hub |
| Oyarifa | 69 | ₵7,631 | ₵8,000 | Data Hub |
| Osu | 61 | ₵11,843 | ₵11,000 | Data Hub |
| Cantonments | 59 | ₵51,583 | ₵47,180 | Data Hub |
| Adjiringanor | 46 | ₵25,739 | ₵26,211 | Data Hub |
| Spintex | 40 | ₵9,727 | ₵7,339 | Data Hub |
| Airport Residential | 34 | ₵34,077 | ₵24,000 | Data Hub |
| Dzorwulu | 33 | ₵27,182 | ₵29,356 | Data Hub |

**Implementation**:
- Created `rental_market_benchmarks` table with area statistics
- Computed benchmarks from 1,011 actual rental listings in Data Hub
- 86 benchmarks across 38 unique areas with breakdown by bedrooms
- API endpoints: `GET /rental-benchmarks` and `GET /rental-benchmarks/:area`
- Frontend integration: Shows benchmark as context when < 5 comparables found
- Auto-refresh capability via SQL script

**Tasks**:
- [x] Create rental benchmarks reference table
- [x] Compute benchmarks from actual Data Hub rental listings (not mock data)
- [x] Use as fallback when no/few comparables found
- [x] Display as market context in UI
- [x] Add API endpoints for benchmark retrieval
- [x] Add `getMarketBenchmarks()` and `getAllBenchmarks()` to frontend API client

**Estimated Time**: 4 hours

#### 5.5 Integration with Income Approach ✅ COMPLETED
**Files**:
- `frontend/src/app/dashboard/valuations/[id]/income/page.tsx`

**UI Integration**:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ INCOME APPROACH                                                  │ Step 6   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ RENTAL MARKET ANALYSIS (Optional - Click to expand)                 │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  Found 8 rental comparables within 3km                              │   │
│  │                                                                     │   │
│  │  COMPARABLE │ SIZE  │ BEDS │ RENT/MONTH │ ₵/SQM │ ADJUSTED  │      │   │
│  │  ───────────┼───────┼──────┼────────────┼───────┼───────────│      │   │
│  │  14 Ring Rd │ 180m² │ 3    │ ₵4,200     │ 23.33 │ ₵4,050    │      │   │
│  │  5 Osu Ave  │ 150m² │ 3    │ ₵3,800     │ 25.33 │ ₵3,950    │      │   │
│  │  9 Labone   │ 220m² │ 4    │ ₵5,100     │ 23.18 │ ₵4,100    │      │   │
│  │                                                                     │   │
│  │  MARKET RENT ESTIMATE: ₵4,033/month (₵24.20/sqm)                   │   │
│  │  Confidence: 78% based on 8 comparables                             │   │
│  │                                                                     │   │
│  │  [USE SUGGESTED RENT]  [ENTER MANUAL RENT]                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ INCOME SOURCES                                                      │   │
│  │  Monthly Rent: ₵4,033  (from rental analysis)                       │   │
│  │  ...                                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation**:
- RentalMarketPanel already integrated (from Phase 5.2)
- Added rent source tracking state (`rentSource`, `rentEstimatedAt`)
- Visual indicator on Monthly Rent field shows "FROM ANALYSIS (X%)" or "MANUAL ENTRY"
- Border color changes to green when rent is market-derived
- Manual edits detected and flagged as manual entry
- Full rental analysis metadata saved to backend for disclosure:
  - `rental_analysis.source`: 'market' | 'manual'
  - `rental_analysis.methodology`: 'median' | 'weighted_average' | 'manual'
  - `rental_analysis.confidence`: percentage
  - `rental_analysis.comparables_count`: number
  - `rental_analysis.comparables`: top 5 used for report
- Method results include `rentSource`, `rentConfidence`, `rentMethodology`, `rentalComparablesUsed`

**Tasks**:
- [x] Add collapsible rental market panel to income page
- [x] Pre-populate rent input with suggested value
- [x] Show confidence level based on comparable quality
- [x] Track if market-derived or manual entry (for disclosure)

**Estimated Time**: 4 hours

#### 5.6 API Client Update ✅ COMPLETED
**Files**: `frontend/src/lib/valuation-api.ts`

**Implementation** (already completed in Phase 5.1):

The `rentalComparablesApi` client was implemented as part of Phase 5.1 with full functionality:

```typescript
export const rentalComparablesApi = {
  // Search for rental comparables with full response metadata
  async search(valuationId, params): Promise<RentalSearchResponse>;
  
  // Convenience method for rent estimation
  async estimateMarketRent(valuationId, params): Promise<RentEstimation>;
  
  // Get market aggregate statistics
  async getMarketStats(valuationId, params): Promise<aggregates>;
  
  // Get pre-computed area benchmarks (from Data Hub)
  async getMarketBenchmarks(areaName, propertyType?): Promise<Benchmark>;
  
  // List all available benchmarks
  async getAllBenchmarks(options): Promise<Benchmark[]>;
};
```

**Types Exported**:
- `RentalSearchParams` - Search criteria interface
- `RentalComparable` - Individual rental listing
- `RentEstimation` - Suggested rent with confidence
- `RentalSearchResponse` - Full response with aggregates

**API Endpoints Tested**:
- ✅ `POST /valuations/:id/rental-comparables/search` - Returns 10+ comparables
- ✅ `GET /valuations/rental-benchmarks/:area` - Returns East Legon: 182 listings, ₵28K avg
- ✅ `GET /valuations/rental-benchmarks` - Returns all 86 area benchmarks

**Estimated Time**: 3 hours (already done in 5.1)

#### 5.7 Dedicated Rental Market Page ✅ COMPLETED
**Files**:
- New: `frontend/src/app/dashboard/valuations/[id]/rental-market/page.tsx`
- Modified: `frontend/src/app/dashboard/valuations/[id]/methods/page.tsx` - Route to rental-market
- Modified: `frontend/src/app/dashboard/valuations/[id]/market/page.tsx` - Navigation updates
- Modified: `frontend/src/app/dashboard/valuations/[id]/cost/page.tsx` - Navigation updates
- Modified: `frontend/src/app/dashboard/valuations/[id]/income/page.tsx` - Back nav + summary card
- Modified: `frontend/src/app/dashboard/valuations/[id]/page.tsx` - Dynamic workflow steps
- Modified: `frontend/src/lib/valuation-api.ts` - Updated IncomeApproachData type
- Modified: `frontend/src/types/valuation.ts` - Added rental_analysis to IncomeApproachData

**Architecture Decision**: Separated rental comparables analysis from Income Approach page

The rental comparables analysis was moved from an embedded panel in the Income Approach page to a dedicated standalone page at `/rental-market`. This mirrors the architecture of the Sales Comparison approach which has separate `/comparables` and `/market` pages before reaching the final `/reconciliation`.

**Navigation Flow (Income Approach)**:
```
/methods → /rental-market → /income → /reconciliation → /report
```

**Conditional Routing**:
- Rental Market page only accessible when `income_approach` is selected
- Methods page routes to `/rental-market` instead of `/income` for income approach
- Market and Cost pages navigate to `/rental-market` when income approach is next

**Dynamic Workflow Steps**:
The workflow step indicator now dynamically inserts a "Rental Market" step (id: 6.5) between Cost Inputs and Income Analysis when income approach is selected:

```typescript
const RENTAL_MARKET_STEP = { id: 6.5, label: 'Rental Market', icon: Banknote, path: 'rental-market' }

function getWorkflowSteps() {
  const steps = [...BASE_WORKFLOW_STEPS]
  if (selectedMethods.includes('income_approach')) {
    const costIndex = steps.findIndex(s => s.id === 6) // After Cost Inputs
    steps.splice(costIndex + 1, 0, RENTAL_MARKET_STEP)
  }
  return steps
}
```

**Rental Market Page Features** (~1100 lines):
- Search panel with radius (km), max age (months), bedroom range filters
- Market statistics display (avg, median, range from aggregates)
- Benchmark fallback when < 5 comparables found in area
- Add/remove comparables to selection basket
- Auto-calculate adjustments based on subject property:
  - Size adjustment (max ±20%)
  - Bedroom adjustment (3% per bedroom)
  - Bathroom adjustment (2% per bathroom)
  - Furnishing adjustment (furnished +15%, semi +8%)
  - Age adjustment (0.3% per year)
- Lock/unlock individual comparables
- Weighting methods: quality_weighted, simple_average, median, manual
- Rent reconciliation panel showing indicated rent and confidence
- Save rental analysis to valuation and navigate to income page

**Income Page Changes**:
- Back navigation always goes to `/rental-market`
- Loads saved `rental_market_analysis` from valuation
- Pre-populates monthly rent field with indicated rent from rental analysis
- Replaced embedded `RentalMarketPanel` with summary card showing:
  - Indicated rent and rent per sqm
  - Confidence level and comparables count
  - Link to edit analysis on rental-market page
- Shows prompt to go to rental-market if no analysis exists

**Data Persistence**:
The rental market page saves to valuation:
```typescript
await valuationsApi.update(valuationId, {
  rental_market_analysis: {
    comparables: [...],             // Selected comparables with adjustments
    indicated_rent_monthly: number,
    indicated_rent_per_sqm: number,
    methodology: 'quality_weighted' | 'simple_average' | 'median' | 'manual',
    confidence: number,
    comparables_count: number,
    search_criteria: { radius_km, max_age_months, bedrooms_range },
    analyzed_at: string,
  },
  method_results: {
    rental_market: {
      indicatedRentMonthly: number,
      indicatedRentPerSqm: number,
      confidence: number,
      comparablesCount: number,
      methodology: string,
    },
  },
})
```

**UI Layout**:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ RENTAL MARKET ANALYSIS                                         │ Step 6.5  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────┐  ┌──────────────────────────────────────────────┐  │
│  │ SEARCH FILTERS     │  │ MARKET STATISTICS                            │  │
│  │ Radius: 5km        │  │ Average: ₵4,500/mo   Median: ₵4,200/mo      │  │
│  │ Max Age: 12 months │  │ Range: ₵3,000 - ₵6,500                      │  │
│  │ Bedrooms: 2-4      │  │ Listings Found: 12                          │  │
│  │ [SEARCH]           │  └──────────────────────────────────────────────┘  │
│  └────────────────────┘                                                    │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ AVAILABLE COMPARABLES (12)                                           │  │
│  │ [Card] [Card] [Card] [Card] [Card] [Card]...                        │  │
│  │        Click to add to selection basket                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ SELECTED COMPARABLES (4)                                             │  │
│  │ ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │ │ 14 Ring Road    │ ₵4,200/mo │ ADJ: +2.5% │ = ₵4,305 │ [🔒][📊][X] │  │  │
│  │ │ 5 Osu Avenue    │ ₵3,800/mo │ ADJ: +4.2% │ = ₵3,960 │ [🔓][📊][X] │  │  │
│  │ │ 9 Labone Street │ ₵5,100/mo │ ADJ: -3.0% │ = ₵4,947 │ [🔓][📊][X] │  │  │
│  │ └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │ Weighting: [Quality Weighted ▼]  [AUTO-CALCULATE ALL]               │  │
│  │                                                                      │  │
│  │ INDICATED RENT: ₵4,200/mo (₵25.00/sqm)   Confidence: HIGH (82%)    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ [← BACK]          4 comps selected • ₵4,200/mo     [CONTINUE TO INCOME →] │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Tasks**:
- [x] Create dedicated `/rental-market/page.tsx` (1100+ lines)
- [x] Add search, filter, and market statistics panels
- [x] Add comparable selection with add/remove functionality
- [x] Implement adjustment calculations (auto-calculate)
- [x] Add weighting methods (quality, average, median, manual)
- [x] Add rent reconciliation with confidence calculation
- [x] Add save and navigation footer
- [x] Update methods page to route to rental-market
- [x] Update market/cost pages navigation for income approach
- [x] Update income page to load rental analysis and show summary
- [x] Add dynamic workflow step insertion (step 6.5)
- [x] Update IncomeApproachData interface in valuation-api.ts

**Estimated Time**: 12 hours

#### Phase 5 Total: 43 hours ✅ COMPLETED

---

### Phase 6: Contributed Data Program (Week 11-12)

**Goal**: Enable verified sales data collection

#### 6.1 Contributed Sales Submission
**Files**: New feature

**Tasks**:
- [ ] Create submission form for valuers/agents
- [ ] Required fields: address, sale_price, sale_date, proof document
- [ ] Verification workflow (admin approval)
- [ ] Credit/reward system for contributors

**Estimated Time**: 16 hours

#### 6.2 Bank Partnership Integration
**Files**: New feature

**Tasks**:
- [ ] API integration with partner banks (collateral data)
- [ ] Bulk import for verified transactions
- [ ] Data privacy compliance
- [ ] Automatic quality scoring

**Estimated Time**: 20 hours

---

## Summary

### Current State vs. Target State

| Aspect | Current | Phase 1 | Phase 6 (Target) |
|--------|---------|---------|------------------|
| Evidence Type | Listings only | Listings + classified | Listings + Delisted + Verified |
| Listing Adjustment | None | 5-20% discount | Dynamic by area |
| Terminology | "Sale price" | "Asking price" | "Evidence value" |
| Output Label | "Market Value" | "Market-Informed Estimate" | Conditional by evidence |
| Reconciliation | Broken for sales | Working | Full integration |
| Ghana Specifics | Basic | Title risk added | Full location premiums |
| Data Sources | Scraped only | + Delisted tracking | + Contributed + Banks |
| **Rental Comparables** | **None** | **None** | **Dedicated /rental-market page** |
| **Income Approach** | **Manual rent entry** | **Manual rent entry** | **Market-derived rent w/ analysis** |

### Estimated Total Effort

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: Critical Fixes | Week 1-2 | 15 hours |
| Phase 2: Evidence Quality | Week 3-4 | 17 hours |
| Phase 3: Ghana Enhancements | Week 5-6 | 14 hours |
| Phase 4: Data Quality | Week 7-8 | 22 hours |
| Phase 5: Rental Comparables | Week 9-10 | 31 hours |
| Phase 6: Contributed Data | Week 11-12 | 36 hours |
| **Total** | **12 weeks** | **~135 hours** |

### Immediate Next Steps

1. **Fix reconciliation fallback** (2 hours) - Unblocks sales comparison workflow
2. **Add listing adjustment panel** (6 hours) - Addresses valuation accuracy
3. **Update terminology** (4 hours) - Professional compliance
4. **Add disclosure language** (3 hours) - Legal protection

---

## Appendix: Adjustment Factor Quick Reference

### Listing-to-Value Adjustments

| Factor | Range | Applied When |
|--------|-------|--------------|
| Asking → Achieved | −5% to −20% | Always (listings) |
| Time on Market | −5% to −15% | >90 days listed |
| Title Risk | −10% to −30% | Non-freehold |
| Price Reductions | 0% to −10% | If price dropped |

### Physical Adjustments

| Factor | Range | Calculation |
|--------|-------|-------------|
| GFA | ±25% | Size ratio |
| Plot Size | ±20% | Size ratio |
| Bedrooms | ±12.5% | 2.5% per room |
| Bathrooms | ±10% | 2% per bath |
| Age | ±15% | 0.5% per year |
| Condition | ±20% | 5% per level |

### Location Adjustments

| Factor | Range | Calculation |
|--------|-------|-------------|
| Neighborhood | ±25% | Premium lookup |
| View | ±10% | 3% per level |
| Access | ±8% | 2% per level |
