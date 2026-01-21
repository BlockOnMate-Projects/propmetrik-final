# Cap Rate Implementation Strategy

## Listing-Derived Cap Rate Methodology for RICS/GhIS Compliance

**Document Version:** 1.0  
**Last Updated:** January 14, 2026  
**Status:** Implementation Guide

---

## 1. Executive Summary

In markets where transaction (sales) data is sparse or unavailable—such as Ghana's nascent property market—cap rates cannot be reliably derived from direct market extraction. This document outlines a **RICS-compliant fallback methodology** for deriving capitalization rates from **adjusted listing data** when comparable sales evidence is insufficient.

### Key Principles

1. **Transaction evidence remains preferred** - Always attempt market extraction first
2. **Listings are secondary evidence** - Category A comparable evidence, but ranked below actual sales
3. **Rigorous adjustments required** - Asking prices typically exceed market reality
4. **Material uncertainty disclosure** - Per RICS VPS 3, report limitations transparently
5. **Multiple verification methods** - Cross-validate with band-of-investment and published surveys

---

## 2. RICS Evidence Hierarchy

Per RICS Red Book guidance, comparable evidence is categorized:

| Category | Evidence Type | Reliability | Our Data Sources |
|----------|--------------|-------------|------------------|
| A | Direct transactions (completed sales) | **Highest** | Tier 1: Lands Commission, Tier 2: Bank valuations |
| A | Contemporary open market transactions | High | Tier 3: Partner contributions (verified) |
| B | Adjusted listings (asking prices) | **Moderate** | Tier 4: Verified delistings, Tier 5: Web scraped |
| C | Indices, surveys, research | Lower | Ghana Valuation Society reports, GPC surveys |

**Current State:** Propmetrik primarily operates with **Category B** evidence (listings) with limited Category A data from bank partners and the emerging Lands Commission integration.

---

## 3. Integration with Existing Infrastructure

### 3.1 Database Schema (Already Implemented)

Migration `032_cap_rate_infrastructure.sql` provides:

```sql
-- Market Cap Rate Benchmarks Table
CREATE TABLE market_cap_rate_benchmarks (
    id UUID PRIMARY KEY,
    region region_code_enum NOT NULL,
    property_type property_type_enum NOT NULL,
    transaction_type transaction_type_enum DEFAULT 'sale',
    benchmark_cap_rate DECIMAL(5,3) NOT NULL,
    cap_rate_range_low DECIMAL(5,3),
    cap_rate_range_high DECIMAL(5,3),
    sample_size INTEGER DEFAULT 0,
    confidence_score DECIMAL(3,2) DEFAULT 0.50,
    market_condition VARCHAR(20),  -- 'hot', 'balanced', 'cool', 'distressed'
    yield_trend VARCHAR(20),       -- 'compressing', 'stable', 'expanding'
    data_quality VARCHAR(20),      -- 'high', 'moderate', 'low', 'none'
    methodology VARCHAR(50),       -- 'market_extraction', 'listing_derived', 'survey', 'hybrid'
    source_description TEXT,
    effective_date DATE,
    expiry_date DATE
);

-- Property Income Table for NOI Tracking
CREATE TABLE property_income (
    id UUID PRIMARY KEY,
    property_id UUID,  -- Soft reference to partitioned properties
    income_period_start DATE,
    income_period_end DATE,
    gross_rental_income DECIMAL(15,2),
    vacancy_rate DECIMAL(5,4),
    collection_loss_rate DECIMAL(5,4),
    effective_gross_income DECIMAL(15,2),
    operating_expenses JSONB,
    total_operating_expenses DECIMAL(15,2),
    net_operating_income DECIMAL(15,2),
    noi_per_sqm DECIMAL(10,2),
    cap_rate DECIMAL(5,3) GENERATED ALWAYS AS (
        CASE WHEN property_value > 0 THEN net_operating_income / property_value ELSE NULL END
    ) STORED,
    property_value DECIMAL(15,2)  -- For cap rate calculation
);
```

### 3.2 CapRateService (Already Implemented)

Located at `backend/src/services/CapRateService.ts`:

```typescript
// Key methods available:
class CapRateService {
  // Get market benchmark from database
  async getMarketCapRate(region, propertyType, subtype?, asOfDate?)
  
  // Calculate property-specific cap rate with adjustments
  async calculatePropertyCapRate(propertyId, region, propertyType, subtype?, attributes?)
  
  // Calculate NOI from income evidence
  async calculateNOI(propertyId, vacancyOverride?, expenseOverride?)
  
  // Estimate NOI from rental comparables (for listings without income data)
  async estimateNOIFromMarket(region, propertyType, areaSqm, marketRentPerSqm?)
  
  // Full income approach valuation
  async performIncomeApproachValuation(inputs: IncomeApproachInputs)
  
  // Update benchmarks from transaction data (scheduled job)
  async updateMarketBenchmarks(region?, propertyType?)
}
```

### 3.3 Evidence Weight Configuration (Already Implemented)

Migration `031_transaction_evidence_enhancement.sql` provides dynamic weights:

```sql
-- Evidence weights now configurable in database
SELECT * FROM evidence_weight_config WHERE is_active = true;

-- Example weights:
-- government_record: 0.98 (Tier 1 - Lands Commission)
-- bank_valuation:    0.92 (Tier 2 - Bank partners)
-- verified_sale:     0.88 (Tier 3 - Partner transactions)
-- listing:           0.45 (Tier 5 - Current web listings)
-- listing_aged:      0.35 (Tier 5 - Stale listings)
```

---

## 4. Listing-Derived Cap Rate Methodology

### 4.1 Overview

When sales data is unavailable, derive cap rates using the formula:

```
Cap Rate = Estimated NOI / Adjusted Listing Price
```

Where:
- **Estimated NOI** = Derived from rental comparables or market rent data
- **Adjusted Listing Price** = Asking price with market reality adjustments

### 4.2 Step-by-Step Process

#### Step 1: Collect Listing Evidence

```typescript
// In comparable selection, prioritize by evidence type:
const listingComparables = await query(`
  SELECT 
    p.id,
    p.price as asking_price,
    p.property_type,
    p.region,
    p.total_area_sqm,
    p.evidence_type,
    p.days_on_market,
    p.data_quality_score,
    ewc.base_weight as evidence_weight
  FROM properties p
  LEFT JOIN evidence_weight_config ewc ON ewc.evidence_type = p.evidence_type
  WHERE p.region = $1
    AND p.property_type = $2
    AND p.transaction_type = 'sale'
    AND p.price IS NOT NULL
    AND p.is_active = true
  ORDER BY 
    CASE p.evidence_type 
      WHEN 'verified_sale' THEN 1
      WHEN 'delisted_inferred' THEN 2
      WHEN 'listing' THEN 3
    END,
    p.data_quality_score DESC
  LIMIT 20
`, [region, propertyType]);
```

#### Step 2: Apply Listing Adjustments

Create adjustment factors to convert asking prices to estimated market values:

```typescript
interface ListingAdjustment {
  factor: string;
  adjustment: number;  // Negative = reduce price
  reason: string;
  source: string;
}

function calculateListingAdjustments(listing: PropertyListing): ListingAdjustment[] {
  const adjustments: ListingAdjustment[] = [];
  
  // 1. Asking-to-Sale Discount (standard market adjustment)
  // Ghana market typically sees 5-15% negotiation
  const askingDiscount = -0.08;  // Default 8% discount
  adjustments.push({
    factor: 'asking_to_sale_discount',
    adjustment: askingDiscount,
    reason: 'Standard negotiation discount (Ghana market 5-15%)',
    source: 'market_research'
  });
  
  // 2. Days on Market Adjustment
  // Stale listings often indicate overpricing
  if (listing.days_on_market > 90) {
    const domAdjustment = Math.min(-0.10, (listing.days_on_market - 90) / 1000 * -1);
    adjustments.push({
      factor: 'days_on_market',
      adjustment: domAdjustment,
      reason: `Extended listing period: ${listing.days_on_market} days`,
      source: 'calculated'
    });
  }
  
  // 3. Listing Quality Adjustment
  if (listing.data_quality_score < 0.7) {
    adjustments.push({
      factor: 'data_quality',
      adjustment: -0.05,
      reason: `Low data quality score: ${listing.data_quality_score.toFixed(2)}`,
      source: 'data_assessment'
    });
  }
  
  // 4. Location Quality Adjustment
  // Based on neighborhood tier
  const locationAdjustments = {
    'prime': 0.0,
    'secondary': -0.03,
    'tertiary': -0.06,
    'emerging': -0.08
  };
  
  // 5. Condition Adjustment
  const conditionAdjustments = {
    'new': 0.02,
    'excellent': 0.01,
    'good': 0.0,
    'fair': -0.03,
    'poor': -0.08,
    'renovation_required': -0.15
  };
  
  return adjustments;
}

function applyAdjustments(askingPrice: number, adjustments: ListingAdjustment[]): number {
  const totalAdjustment = adjustments.reduce((sum, adj) => sum + adj.adjustment, 0);
  return askingPrice * (1 + totalAdjustment);
}
```

#### Step 3: Estimate NOI from Market Data

When actual income data is unavailable, estimate NOI:

```typescript
async function estimateNOIFromListings(
  region: string,
  propertyType: string,
  areaSqm: number
): Promise<NOIEstimate> {
  // 1. Get rental comparables
  const rentalComps = await query(`
    SELECT 
      price as monthly_rent,
      total_area_sqm,
      bedrooms,
      property_type,
      evidence_type
    FROM properties
    WHERE region = $1
      AND property_type = $2
      AND transaction_type = 'rental'
      AND price IS NOT NULL
      AND is_active = true
    ORDER BY 
      CASE evidence_type 
        WHEN 'verified_sale' THEN 1  -- Verified rental transaction
        WHEN 'partner_transaction' THEN 2
        WHEN 'listing' THEN 3
      END,
      ABS(total_area_sqm - $3) ASC
    LIMIT 10
  `, [region, propertyType, areaSqm]);
  
  // 2. Calculate market rent per sqm
  const rentPerSqm = rentalComps.reduce((sum, r) => 
    sum + (r.monthly_rent / r.total_area_sqm), 0) / rentalComps.length;
  
  // 3. Estimate annual rental income
  const annualRent = rentPerSqm * areaSqm * 12;
  
  // 4. Apply standard expense ratios (Ghana market)
  const expenseRatios = {
    residential_house: 0.25,     // 25% operating expense ratio
    apartment_flat: 0.30,        // 30% for apartments (common areas)
    commercial_office: 0.35,     // 35% for commercial
    commercial_shop: 0.30,
    warehouse: 0.20,             // Lower for industrial
    mixed_use: 0.32
  };
  
  const vacancyRate = 0.05;  // 5% vacancy (adjustable by market)
  const collectionLoss = 0.02;  // 2% collection loss
  const expenseRatio = expenseRatios[propertyType] || 0.28;
  
  // 5. Calculate NOI
  const effectiveGrossIncome = annualRent * (1 - vacancyRate - collectionLoss);
  const operatingExpenses = effectiveGrossIncome * expenseRatio;
  const netOperatingIncome = effectiveGrossIncome - operatingExpenses;
  
  return {
    grossPotentialRent: annualRent,
    vacancyRate,
    collectionLoss,
    effectiveGrossIncome,
    operatingExpenses,
    expenseRatio,
    netOperatingIncome,
    methodology: 'market_derived',
    confidence: rentalComps.length >= 5 ? 'moderate' : 'low',
    sampleSize: rentalComps.length,
    warnings: rentalComps.length < 3 
      ? ['Insufficient rental comparables - NOI estimate has high uncertainty'] 
      : []
  };
}
```

#### Step 4: Derive Cap Rate from Adjusted Listings

```typescript
async function deriveCapRateFromListings(
  region: string,
  propertyType: string
): Promise<ListingDerivedCapRate> {
  // 1. Get sale listings
  const saleListings = await getListingComparables(region, propertyType);
  
  // 2. For each listing, calculate implied cap rate
  const impliedCapRates: ImpliedCapRate[] = [];
  
  for (const listing of saleListings) {
    // Apply adjustments to asking price
    const adjustments = calculateListingAdjustments(listing);
    const adjustedPrice = applyAdjustments(listing.asking_price, adjustments);
    
    // Estimate NOI for this property
    const noiEstimate = await estimateNOIFromListings(
      region, 
      propertyType, 
      listing.total_area_sqm
    );
    
    // Calculate implied cap rate
    const impliedCapRate = noiEstimate.netOperatingIncome / adjustedPrice;
    
    impliedCapRates.push({
      propertyId: listing.id,
      askingPrice: listing.asking_price,
      adjustedPrice,
      adjustmentTotal: adjustments.reduce((s, a) => s + a.adjustment, 0),
      adjustments,
      estimatedNoi: noiEstimate.netOperatingIncome,
      impliedCapRate,
      confidence: noiEstimate.confidence,
      evidenceType: listing.evidence_type
    });
  }
  
  // 3. Calculate weighted average cap rate
  // Weight by evidence quality and data confidence
  const validRates = impliedCapRates.filter(r => 
    r.impliedCapRate > 0.03 && r.impliedCapRate < 0.20
  );
  
  if (validRates.length === 0) {
    throw new Error('Insufficient valid cap rates derived from listings');
  }
  
  const weights = validRates.map(r => {
    let weight = 1.0;
    if (r.evidenceType === 'verified_sale') weight *= 2.0;
    if (r.evidenceType === 'delisted_inferred') weight *= 1.5;
    if (r.confidence === 'moderate') weight *= 1.2;
    return weight;
  });
  
  const weightedSum = validRates.reduce((sum, r, i) => 
    sum + (r.impliedCapRate * weights[i]), 0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const weightedAvgCapRate = weightedSum / totalWeight;
  
  // 4. Calculate range and confidence
  const sortedRates = validRates.map(r => r.impliedCapRate).sort((a, b) => a - b);
  const capRateLow = sortedRates[Math.floor(sortedRates.length * 0.25)];
  const capRateHigh = sortedRates[Math.floor(sortedRates.length * 0.75)];
  
  return {
    derivedCapRate: weightedAvgCapRate,
    capRateLow,
    capRateHigh,
    sampleSize: validRates.length,
    methodology: 'listing_derived',
    confidence: validRates.length >= 5 ? 0.65 : validRates.length >= 3 ? 0.50 : 0.35,
    dataQuality: 'moderate',
    marketCondition: 'balanced',
    yieldTrend: 'stable',
    impliedRates: impliedCapRates,
    warnings: [
      'Cap rate derived from adjusted listings - not direct market extraction',
      'Asking prices adjusted by estimated market discount',
      'NOI estimated from rental comparables - verify with actual income data when available'
    ],
    ricsDisclosure: 'Per RICS VPS 3, material valuation uncertainty exists due to reliance on listing evidence rather than transaction evidence. Asking prices have been adjusted to reflect estimated market values based on available market intelligence.'
  };
}
```

---

## 5. Integration with ValuationEngineService

### 5.1 Modify Income Approach Execution

Update `valuationEngineService.ts` to use CapRateService:

```typescript
// In executeMethod() for income_approach:

import { CapRateService } from '../CapRateService';

private async executeIncomeApproach(
  property: PropertyForValuation,
  options: ValuationOptions,
  marketConditions: MarketConditions
): Promise<MethodResult> {
  const capRateService = new CapRateService();
  
  // 1. Attempt income approach valuation
  const incomeResult = await capRateService.performIncomeApproachValuation({
    propertyId: property.id,
    region: property.region,
    propertyType: property.property_type,
    propertySubtype: property.property_sub_type,
    totalAreaSqm: property.total_area_sqm
  });
  
  // 2. Build method result with RICS compliance info
  return {
    method: 'income_approach',
    value: incomeResult.indicatedValue,
    confidence: incomeResult.confidenceScore,
    weight: this.getMethodWeight('income_approach', property.property_type),
    details: {
      noi: incomeResult.noi,
      capRate: incomeResult.capRate,
      valueRange: incomeResult.valueRange,
      methodology: incomeResult.methodology,
      ricsCompliance: incomeResult.ricsCompliance
    },
    warnings: [
      ...incomeResult.capRate.warnings,
      ...incomeResult.noi.warnings || []
    ]
  };
}
```

### 5.2 Fallback Hierarchy

Implement cascading methodology selection:

```typescript
async function selectCapRateMethodology(
  region: string,
  propertyType: string
): Promise<CapRateMethodology> {
  // 1. Check for transaction-derived cap rates (preferred)
  const transactionCapRate = await getTransactionDerivedCapRate(region, propertyType);
  if (transactionCapRate && transactionCapRate.sampleSize >= 3) {
    return {
      method: 'market_extraction',
      capRate: transactionCapRate.capRate,
      confidence: 'high',
      ricsCategory: 'A',
      description: 'Cap rate derived from comparable sales transactions'
    };
  }
  
  // 2. Check for bank/partner data
  const partnerCapRate = await getPartnerDerivedCapRate(region, propertyType);
  if (partnerCapRate && partnerCapRate.sampleSize >= 2) {
    return {
      method: 'partner_data',
      capRate: partnerCapRate.capRate,
      confidence: 'moderate',
      ricsCategory: 'A',
      description: 'Cap rate derived from partner transaction data'
    };
  }
  
  // 3. Use listing-derived (fallback)
  const listingCapRate = await deriveCapRateFromListings(region, propertyType);
  if (listingCapRate.sampleSize >= 3) {
    return {
      method: 'listing_derived',
      capRate: listingCapRate.derivedCapRate,
      confidence: 'limited',
      ricsCategory: 'B',
      description: 'Cap rate derived from adjusted listings - material uncertainty applies',
      uncertaintyNote: listingCapRate.ricsDisclosure
    };
  }
  
  // 4. Survey/published data (last resort)
  const surveyCapRate = await getSurveyCapRate(region, propertyType);
  return {
    method: 'survey_data',
    capRate: surveyCapRate.capRate,
    confidence: 'limited',
    ricsCategory: 'C',
    description: 'Cap rate from published surveys - verify applicability',
    source: surveyCapRate.source
  };
}
```

---

## 6. Practical Example: Ghana Market

### 6.1 Sample Cap Rate Derivation

```
Property Type: Residential House
Region: Greater Accra (East Legon)
Sample Size: 5 listings

Listing A:
  Asking Price: GHS 2,500,000
  Area: 350 m²
  Adjustments:
    - Asking discount: -8%
    - Days on market (120 days): -3%
    - Location (prime): 0%
  Adjusted Price: GHS 2,225,000
  
  Estimated NOI:
    - Market rent: GHS 12,000/month × 12 = GHS 144,000
    - Vacancy: -5% = GHS (7,200)
    - Expenses: -25% = GHS (34,200)
    - NOI: GHS 102,600
  
  Implied Cap Rate: 102,600 / 2,225,000 = 4.6%

Listing B:
  Asking Price: GHS 1,800,000
  Area: 280 m²
  Adjustments: -10% total
  Adjusted Price: GHS 1,620,000
  NOI: GHS 82,080
  Implied Cap Rate: 5.1%

Listing C:
  Adjusted Price: GHS 1,950,000
  NOI: GHS 117,000
  Implied Cap Rate: 6.0%

Listing D:
  Adjusted Price: GHS 2,400,000
  NOI: GHS 156,000
  Implied Cap Rate: 6.5%

Listing E:
  Adjusted Price: GHS 1,750,000
  NOI: GHS 105,000
  Implied Cap Rate: 6.0%

Weighted Average Cap Rate: 5.6%
Cap Rate Range: 4.6% - 6.5%
Confidence: Moderate (5 listings, B-category evidence)
```

### 6.2 Valuation Application

```
Subject Property:
  Location: East Legon, Greater Accra
  Type: 4-bedroom residential house
  Area: 320 m²
  
NOI Estimation:
  Gross Rental Income: GHS 132,000/year (GHS 11,000/month)
  Less Vacancy (5%): (GHS 6,600)
  Effective Gross Income: GHS 125,400
  Less Operating Expenses (25%): (GHS 31,350)
  Net Operating Income: GHS 94,050

Cap Rate Application:
  Derived Cap Rate: 5.6%
  Cap Rate Range: 4.6% - 6.5%

Indicated Value:
  Central: GHS 94,050 / 0.056 = GHS 1,679,464
  Low (6.5%): GHS 94,050 / 0.065 = GHS 1,446,923
  High (4.6%): GHS 94,050 / 0.046 = GHS 2,044,565

RICS Disclosure:
  "The capitalization rate of 5.6% has been derived from analysis of 
  adjusted listing data in the East Legon market. This represents 
  Category B comparable evidence per RICS guidelines. Material valuation 
  uncertainty exists due to the absence of direct transaction evidence. 
  The range of GHS 1,450,000 to GHS 2,045,000 reflects this uncertainty."
```

---

## 7. Database Updates for Listing-Derived Cap Rates

### 7.1 Store Derived Cap Rate with Methodology Flag

```sql
-- Insert listing-derived benchmark
INSERT INTO market_cap_rate_benchmarks (
  id,
  region,
  property_type,
  transaction_type,
  benchmark_cap_rate,
  cap_rate_range_low,
  cap_rate_range_high,
  sample_size,
  confidence_score,
  market_condition,
  yield_trend,
  data_quality,
  methodology,          -- Key: 'listing_derived' vs 'market_extraction'
  source_description,
  effective_date,
  expiry_date
) VALUES (
  gen_random_uuid(),
  'greater_accra',
  'residential_house',
  'sale',
  0.056,           -- 5.6%
  0.046,           -- 4.6%
  0.065,           -- 6.5%
  5,               -- Sample size
  0.55,            -- Moderate confidence
  'balanced',
  'stable',
  'moderate',      -- Data quality
  'listing_derived',  -- Methodology flag
  'Derived from 5 adjusted East Legon listings. Asking prices discounted 8-11%. NOI estimated from rental comparables.',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days'  -- Shorter validity for listing-derived
);
```

### 7.2 Update CapRateService to Prefer Transaction Data

```typescript
// In getMarketCapRate(), add methodology preference:

async getMarketCapRate(region, propertyType, subtype?, asOfDate?) {
  const result = await query(`
    SELECT * FROM market_cap_rate_benchmarks
    WHERE region = $1
      AND property_type = $2
      AND effective_date <= $3
      AND (expiry_date IS NULL OR expiry_date >= $3)
    ORDER BY 
      CASE methodology
        WHEN 'market_extraction' THEN 1    -- Prefer transaction-derived
        WHEN 'partner_data' THEN 2
        WHEN 'listing_derived' THEN 3      -- Fallback
        WHEN 'survey' THEN 4
        ELSE 5
      END,
      confidence_score DESC,
      effective_date DESC
    LIMIT 1
  `, [region, propertyType, asOfDate || new Date()]);
  
  // ... rest of method
}
```

---

## 8. Scheduled Benchmark Updates

### 8.1 Cron Job for Cap Rate Refresh

```typescript
// scripts/update-cap-rate-benchmarks.ts

import { CapRateService } from '../src/services/CapRateService';
import { logger } from '../src/utils/logger';

const REGIONS = [
  'greater_accra', 'kumasi_metro', 'eastern', 
  'western_cluster', 'northern_cluster'
];

const PROPERTY_TYPES = [
  'residential_house', 'apartment_flat', 'commercial_office',
  'commercial_shop', 'warehouse', 'mixed_use', 'land'
];

async function updateAllBenchmarks() {
  const capRateService = new CapRateService();
  
  for (const region of REGIONS) {
    for (const propertyType of PROPERTY_TYPES) {
      try {
        // 1. First try transaction-derived (if we have sales data)
        const txCapRate = await capRateService.updateMarketBenchmarks(region, propertyType);
        
        if (txCapRate.sampleSize >= 3) {
          logger.info('Updated cap rate from transactions', {
            region, propertyType, 
            capRate: txCapRate.benchmarkCapRate,
            methodology: 'market_extraction'
          });
          continue;
        }
        
        // 2. Fallback to listing-derived
        const listingCapRate = await deriveCapRateFromListings(region, propertyType);
        
        if (listingCapRate.sampleSize >= 3) {
          await saveListingDerivedBenchmark(region, propertyType, listingCapRate);
          logger.info('Updated cap rate from listings', {
            region, propertyType,
            capRate: listingCapRate.derivedCapRate,
            methodology: 'listing_derived'
          });
        }
        
      } catch (error) {
        logger.warn('Failed to update cap rate benchmark', {
          region, propertyType, error: error.message
        });
      }
    }
  }
}

// Run weekly
// Add to backend/scripts or as Airflow DAG
```

### 8.2 Airflow DAG Integration

```python
# data-pipelines/airflow/dags/cap_rate_refresh_dag.py

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta

default_args = {
    'owner': 'propmetrik',
    'depends_on_past': False,
    'email_on_failure': True,
    'email': ['valuation-ops@propmetrik.com'],
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

dag = DAG(
    'cap_rate_benchmark_refresh',
    default_args=default_args,
    description='Weekly cap rate benchmark update from market data',
    schedule_interval='0 6 * * 1',  # Every Monday at 6 AM
    start_date=datetime(2026, 1, 1),
    catchup=False,
)

def update_benchmarks(**kwargs):
    import subprocess
    result = subprocess.run(
        ['npx', 'ts-node', 'scripts/update-cap-rate-benchmarks.ts'],
        cwd='/app/backend',
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        raise Exception(f"Benchmark update failed: {result.stderr}")
    return result.stdout

update_task = PythonOperator(
    task_id='update_cap_rate_benchmarks',
    python_callable=update_benchmarks,
    dag=dag,
)
```

---

## 9. API Integration

### 9.1 Expose Cap Rate Derivation Endpoint

Add to `backend/src/routes/valuations.ts`:

```typescript
/**
 * GET /api/valuations/cap-rate/:region/:propertyType
 * Get current market cap rate for region/property type
 */
router.get('/cap-rate/:region/:propertyType', async (req, res) => {
  try {
    const { region, propertyType } = req.params;
    const capRateService = new CapRateService();
    
    const benchmark = await capRateService.getMarketCapRate(
      region,
      propertyType
    );
    
    res.json({
      success: true,
      data: {
        region,
        propertyType,
        capRate: benchmark.benchmarkCapRate,
        range: {
          low: benchmark.capRateRangeLow,
          high: benchmark.capRateRangeHigh
        },
        confidence: benchmark.confidenceScore,
        methodology: benchmark.dataQuality === 'high' ? 'market_extraction' : 'listing_derived',
        dataQuality: benchmark.dataQuality,
        marketCondition: benchmark.marketCondition,
        effectiveDate: benchmark.effectiveDate,
        warnings: benchmark.dataQuality !== 'high' 
          ? ['Cap rate derived from adjusted listings - material uncertainty applies']
          : []
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/valuations/cap-rate/derive
 * Manually trigger cap rate derivation for a region/property type
 */
router.post('/cap-rate/derive', authenticateToken, requireRole(['admin', 'valuer']), async (req, res) => {
  const { region, propertyType, methodology } = req.body;
  
  // Implementation...
});
```

---

## 10. RICS Compliance Checklist

### 10.1 Valuation Report Requirements

When using listing-derived cap rates, reports must include:

- [ ] **VPS 3 Disclosure**: Material uncertainty statement if relying on listing evidence
- [ ] **Methodology Description**: Explain listing adjustment process
- [ ] **Evidence Category**: Clearly state "Category B - Adjusted Listings"
- [ ] **Sample Size**: Number of listings analyzed
- [ ] **Adjustment Summary**: Show major adjustments applied (asking discount, DOM, etc.)
- [ ] **Value Range**: Provide range reflecting cap rate uncertainty
- [ ] **Verification Note**: State whether listing prices were verified with agents
- [ ] **Alternative Methods**: Note if other methods (cost, comparison) support the value

### 10.2 Report Template Addition

```typescript
// In valuation report generation:

interface IncomeApproachSection {
  // ... existing fields
  
  capRateDetails: {
    selectedRate: number;
    derivationMethod: 'market_extraction' | 'listing_derived' | 'survey' | 'build_up';
    evidenceCategory: 'A' | 'B' | 'C';
    sampleSize: number;
    adjustmentsSummary: string;
    confidenceLevel: 'high' | 'moderate' | 'limited';
    uncertaintyDisclosure?: string;
  };
}

// RICS disclosure template:
const LISTING_DERIVED_DISCLOSURE = `
The capitalization rate of {{capRate}}% has been derived from analysis of 
{{sampleSize}} comparable listings in the {{location}} market. Asking prices 
have been adjusted to reflect estimated market values based on: (1) standard 
negotiation discounts of {{avgDiscount}}%, (2) days-on-market adjustments, and 
(3) property-specific factors.

This represents Category B comparable evidence per RICS guidelines. Material 
valuation uncertainty exists due to the absence of direct transaction evidence 
in the subject market. The value range of {{valueLow}} to {{valueHigh}} 
reflects this uncertainty.

The valuer recommends reassessment when transaction evidence becomes available.
`;
```

---

## 11. Testing & Validation

### 11.1 Unit Tests

```typescript
// tests/unit/CapRateService.test.ts

describe('CapRateService - Listing Derived Cap Rate', () => {
  it('should derive cap rate from adjusted listings', async () => {
    const result = await deriveCapRateFromListings('greater_accra', 'residential_house');
    
    expect(result.derivedCapRate).toBeGreaterThan(0.03);
    expect(result.derivedCapRate).toBeLessThan(0.15);
    expect(result.methodology).toBe('listing_derived');
    expect(result.warnings).toContain(expect.stringContaining('adjusted listings'));
  });
  
  it('should apply standard asking-to-sale discount', async () => {
    const listing = { asking_price: 1000000, days_on_market: 30 };
    const adjustments = calculateListingAdjustments(listing);
    
    const askingDiscount = adjustments.find(a => a.factor === 'asking_to_sale_discount');
    expect(askingDiscount?.adjustment).toBe(-0.08);
  });
  
  it('should apply additional discount for stale listings', async () => {
    const listing = { asking_price: 1000000, days_on_market: 180 };
    const adjustments = calculateListingAdjustments(listing);
    
    const domAdjustment = adjustments.find(a => a.factor === 'days_on_market');
    expect(domAdjustment?.adjustment).toBeLessThan(0);
  });
});
```

### 11.2 Integration Tests

```typescript
// tests/integration/income-approach.test.ts

describe('Income Approach with Listing-Derived Cap Rate', () => {
  it('should fall back to listing-derived cap rate when no transactions', async () => {
    const result = await capRateService.performIncomeApproachValuation({
      propertyId: 'test-property-no-tx',
      region: 'greater_accra',
      propertyType: 'residential_house',
      totalAreaSqm: 300
    });
    
    expect(result.capRate.methodology).toBe('listing_derived');
    expect(result.ricsCompliance.overallQuality).toBe('limited');
    expect(result.ricsCompliance.notes).toContain(
      expect.stringContaining('material uncertainty')
    );
  });
});
```

---

## 12. Roadmap: Transition to Transaction Data

### Phase 1: Current (Listing-Derived)
- ✅ Implement listing adjustment methodology
- ✅ Store benchmarks with methodology flag
- ✅ Add RICS uncertainty disclosures
- ⬜ Deploy scheduled benchmark refresh

### Phase 2: Enhanced (Hybrid)
- ⬜ Integrate Lands Commission transaction feed (Tier 1)
- ⬜ Expand bank partner data (Tier 2)
- ⬜ Blend transaction + listing data with weighted average
- ⬜ Increase confidence scores as transaction data grows

### Phase 3: Mature (Market Extraction Primary)
- ⬜ Transaction data sufficient for market extraction
- ⬜ Listings used only for validation
- ⬜ Automated quality threshold switching
- ⬜ Regional confidence tiers (A: tx-based, B: hybrid, C: listing-only)

---

## 13. Summary

The listing-derived cap rate methodology provides a **RICS-compliant fallback** for Ghana's data-constrained market. Key implementation points:

1. **Use existing infrastructure** - CapRateService, market_cap_rate_benchmarks table, evidence weights
2. **Apply rigorous adjustments** - 8-15% asking-to-sale discount, DOM adjustments, quality factors
3. **Estimate NOI from rental comparables** - When actual income data unavailable
4. **Store methodology flag** - Track `listing_derived` vs `market_extraction` sources
5. **Disclose uncertainty** - Per RICS VPS 3, report material uncertainty transparently
6. **Refresh regularly** - Weekly benchmark updates with latest market data
7. **Transition path** - Systematically improve as transaction data increases

This approach allows Propmetrik to provide compliant income approach valuations today while building toward market-extracted cap rates as Ghana's property market matures.
