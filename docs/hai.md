# Ghana Housing Affordability Index (GHAI)

## PropMetrik Proprietary Affordability Framework

**Version:** 1.0  
**Last Updated:** January 2026  
**Author:** PropMetrik Analytics  
**Status:** Implementation Ready

---

## Executive Summary

The Ghana Housing Affordability Index (GHAI) is a proprietary, multi-dimensional metric designed to measure whether typical Ghanaian households can afford typical homes under local market conditions. Unlike US/UK indices that assume universal mortgage access, GHAI accounts for Ghana's unique market realities:

- **Multiple Purchase Paths**: Mortgage, cash, and rent-to-own
- **Informal Income**: Large informal sector requires proxy methodologies
- **High Interest Rates**: 30%+ mortgage rates fundamentally change calculations
- **Cash Dominance**: 60-70% of transactions are cash-funded
- **Regional Variation**: Accra vs. secondary cities have 2-3x price differentials

**Core Value Proposition:**

> "The GHAI measures whether real Ghanaian households can afford real homes using real financing conditions—not imported assumptions."

---

## 1. Industry Standard Foundations

### 1.1 NAR Housing Affordability Index (US Standard)

The National Association of REALTORS® (NAR) HAI is the global benchmark:

| Component | Definition |
|-----------|------------|
| **Interpretation** | 100 = family has exactly enough income to qualify |
| **Above 100** | Family has more than enough income (affordable) |
| **Below 100** | Family has less than enough income (unaffordable) |
| **Down Payment** | 20% of home price |
| **Qualifying Ratio** | 25% (monthly P&I cannot exceed 25% of income) |

#### NAR Formula

```
PMT = MEDPRICE × 0.80 × (IR/12) / (1 - (1/(1 + IR/12)^360))

Where:
  - MEDPRICE = Median home price
  - IR = Annual interest rate (effective mortgage rate)
  - 0.80 = Loan amount (after 20% down payment)
  - 360 = 30-year term in months

QINC = PMT × 4 × 12   (Qualifying Income at 25% ratio)

HAI = (MEDINC / QINC) × 100

Where:
  - MEDINC = Median Family Income
  - QINC = Income required to qualify
```

### 1.2 International Benchmarks

| Index | Organization | Key Metric |
|-------|--------------|------------|
| **Price-to-Income Ratio** | World Bank / UN-Habitat | Median Price ÷ Annual Income |
| **Housing Cost Burden** | HUD (US) | >30% of income = burdened |
| **Rent-to-Income** | OECD | Rent ÷ Disposable Income |
| **Residual Income** | Academic | Income after housing vs. basic needs |

#### UN-Habitat Affordability Thresholds

| Price-to-Income Ratio | Interpretation |
|-----------------------|----------------|
| < 3.0 | Affordable |
| 3.0 – 4.0 | Moderately Unaffordable |
| 4.1 – 5.0 | Seriously Unaffordable |
| > 5.0 | Severely Unaffordable |

---

## 2. Ghana Market Realities

### 2.1 Why US/UK Indices Fail for Ghana

| Factor | US/UK Assumption | Ghana Reality |
|--------|------------------|---------------|
| **Mortgage Access** | 65-80% of buyers | ~10-15% of buyers |
| **Interest Rates** | 6-8% | 28-35% |
| **Loan Tenor** | 30 years | 10-20 years |
| **Down Payment** | 20% | 20-40% (often higher) |
| **Income Documentation** | Universal | Formal sector only (~30%) |
| **Cash Purchases** | 10-20% | 60-70% |
| **Informal Income** | Minimal | 40-50% of workforce |

### 2.2 Ghana Housing Market Characteristics

**From PropMetrik Data (January 2026):**

| Indicator | Greater Accra | Kumasi | National |
|-----------|---------------|--------|----------|
| Median Home Price | GHS 850,000 | GHS 420,000 | GHS 580,000 |
| Average Mortgage Rate | 32.0% | 32.0% | 32.0% |
| Policy Rate (BOG) | 30.0% | 30.0% | 30.0% |
| Inflation Rate | 23.2% | 23.2% | 23.2% |
| Est. Median Household Income | GHS 48,000/yr | GHS 36,000/yr | GHS 42,000/yr |

### 2.3 Purchase Path Distribution (Estimated)

| Purchase Method | Greater Accra | Kumasi | Rural |
|-----------------|---------------|--------|-------|
| Cash | 55% | 70% | 85% |
| Bank Mortgage | 15% | 8% | 2% |
| Developer Financing | 20% | 15% | 5% |
| Cooperative/SACCO | 5% | 5% | 5% |
| Diaspora Remittance | 5% | 2% | 3% |

---

## 3. GHAI Framework Architecture

### 3.1 Multi-Path Index Structure

The GHAI computes **three sub-indices** reflecting Ghana's purchase reality:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GHANA HOUSING AFFORDABILITY INDEX                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│   │   MORTGAGE HAI  │  │    CASH HAI     │  │   RENTAL HAI    │   │
│   │    (MHAI)       │  │    (CHAI)       │  │    (RHAI)       │   │
│   │                 │  │                 │  │                 │   │
│   │  For formal     │  │  For cash       │  │  For renters    │   │
│   │  sector buyers  │  │  buyers         │  │  (40%+ of HH)   │   │
│   │  with bank      │  │  (majority of   │  │                 │   │
│   │  financing      │  │  transactions)  │  │                 │   │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │
│            │                    │                    │             │
│            ▼                    ▼                    ▼             │
│   ┌─────────────────────────────────────────────────────────────┐ │
│   │          COMPOSITE GHAI = w₁(MHAI) + w₂(CHAI) + w₃(RHAI)    │ │
│   │                                                              │ │
│   │  Weights vary by region based on actual transaction mix     │ │
│   └─────────────────────────────────────────────────────────────┘ │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐ │
│   │          SUPPLEMENTARY INDICES                               │ │
│   │  • Construction Affordability Index (CAI)                   │ │
│   │  • Land Affordability Index (LAI)                           │ │
│   │  • Mortgage Accessibility Score (MAS)                       │ │
│   └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Regional Weight Matrix

| Region | Mortgage Weight (w₁) | Cash Weight (w₂) | Rental Weight (w₃) |
|--------|---------------------|------------------|-------------------|
| Greater Accra | 0.25 | 0.45 | 0.30 |
| Kumasi Metro | 0.15 | 0.55 | 0.30 |
| Eastern Region | 0.10 | 0.60 | 0.30 |
| Western Cluster | 0.12 | 0.58 | 0.30 |
| Northern Cluster | 0.05 | 0.65 | 0.30 |

---

## 4. Core Formulas

### 4.1 Mortgage-Based HAI (MHAI)

**For households with formal income seeking bank financing.**

```typescript
// Ghana-adapted mortgage parameters
const GHANA_DEFAULTS = {
  downPaymentPct: 0.25,        // 25% down (higher than US 20%)
  loanTenorMonths: 180,        // 15 years (not 30)
  qualifyingRatio: 0.30,       // 30% DTI (stricter than US 25%)
  propertyTaxRate: 0.001,      // Minimal in Ghana
  insuranceRate: 0.003,        // Homeowner's insurance
};

// Monthly Mortgage Payment (P&I only)
function calculateMonthlyPayment(
  propertyPrice: number,
  annualRate: number,
  tenorMonths: number,
  downPaymentPct: number
): number {
  const loanAmount = propertyPrice * (1 - downPaymentPct);
  const monthlyRate = annualRate / 12;
  
  // Standard amortization formula
  return loanAmount * 
    (monthlyRate * Math.pow(1 + monthlyRate, tenorMonths)) /
    (Math.pow(1 + monthlyRate, tenorMonths) - 1);
}

// Total Monthly Housing Cost (PITI equivalent)
function calculateMonthlyHousingCost(
  propertyPrice: number,
  annualRate: number,
  tenorMonths: number,
  downPaymentPct: number
): number {
  const pi = calculateMonthlyPayment(propertyPrice, annualRate, tenorMonths, downPaymentPct);
  const taxes = (propertyPrice * GHANA_DEFAULTS.propertyTaxRate) / 12;
  const insurance = (propertyPrice * GHANA_DEFAULTS.insuranceRate) / 12;
  
  return pi + taxes + insurance;
}

// Qualifying Income (income needed to afford the home)
function calculateQualifyingIncome(monthlyHousingCost: number): number {
  return (monthlyHousingCost / GHANA_DEFAULTS.qualifyingRatio) * 12;
}

// Mortgage Housing Affordability Index
function calculateMHAI(
  medianPropertyPrice: number,
  medianHouseholdIncome: number,
  mortgageRate: number
): number {
  const monthlyHousing = calculateMonthlyHousingCost(
    medianPropertyPrice,
    mortgageRate,
    GHANA_DEFAULTS.loanTenorMonths,
    GHANA_DEFAULTS.downPaymentPct
  );
  
  const qualifyingIncome = calculateQualifyingIncome(monthlyHousing);
  
  // HAI Formula: (Actual Income / Required Income) × 100
  return (medianHouseholdIncome / qualifyingIncome) * 100;
}
```

**Interpretation:**

| MHAI Value | Interpretation |
|------------|----------------|
| ≥ 100 | Median household can qualify for median home mortgage |
| 80 – 99 | Marginally unaffordable (needs 80-99% of qualifying income) |
| 50 – 79 | Significantly unaffordable |
| < 50 | Severely unaffordable (needs 2x their income to qualify) |

### 4.2 Cash-Based HAI (CHAI)

**For households purchasing with cash/savings (majority of Ghana transactions).**

```typescript
// Cash Affordability uses Price-to-Income ratio approach
function calculateCHAI(
  medianPropertyPrice: number,
  medianHouseholdIncome: number,
  savingsHorizonYears: number = 10  // Typical saving period
): { chai: number; yearsToSave: number; pir: number } {
  
  // Price-to-Income Ratio
  const priceToIncomeRatio = medianPropertyPrice / medianHouseholdIncome;
  
  // Assumed savings rate for housing (Ghana context)
  const savingsRate = 0.15;  // 15% of income saved for housing
  const annualSavings = medianHouseholdIncome * savingsRate;
  
  // Years to save for full purchase
  const yearsToSave = medianPropertyPrice / annualSavings;
  
  // CHAI: Inverse of normalized price-to-income
  // 100 = Can save for median home in savingsHorizonYears
  // Higher = More affordable (can save faster)
  // Lower = Less affordable (takes longer to save)
  const chai = (savingsHorizonYears / yearsToSave) * 100;
  
  return {
    chai: Math.min(chai, 200),  // Cap at 200
    yearsToSave,
    pir: priceToIncomeRatio,
  };
}
```

**Interpretation:**

| CHAI Value | Years to Save | Interpretation |
|------------|---------------|----------------|
| ≥ 100 | ≤ 10 years | Achievable within reasonable horizon |
| 70 – 99 | 10-14 years | Stretched but possible |
| 50 – 69 | 14-20 years | Difficult without external help |
| < 50 | > 20 years | Practically unattainable for most |

### 4.3 Rental Affordability Index (RHAI)

**For households renting (40%+ of urban households).**

```typescript
// Standard rent-to-income methodology (30% threshold)
function calculateRHAI(
  medianMonthlyRent: number,
  medianMonthlyIncome: number,
  advanceMonths: number = 12  // Ghana typically requires 1-2 years advance
): { rhai: number; rentToIncomeRatio: number; monthsToCoverAdvance: number } {
  
  // Rent-to-Income Ratio
  const rentToIncomeRatio = medianMonthlyRent / medianMonthlyIncome;
  
  // Qualifying monthly income at 30% threshold
  const qualifyingMonthlyIncome = medianMonthlyRent / 0.30;
  
  // RHAI: Similar to mortgage HAI
  const rhai = (medianMonthlyIncome / qualifyingMonthlyIncome) * 100;
  
  // Ghana-specific: Months to save for advance payment
  const savingsRate = 0.20;  // 20% of income saved
  const monthlySavings = medianMonthlyIncome * savingsRate;
  const totalAdvance = medianMonthlyRent * advanceMonths;
  const monthsToCoverAdvance = totalAdvance / monthlySavings;
  
  return {
    rhai,
    rentToIncomeRatio,
    monthsToCoverAdvance,
  };
}
```

**Interpretation:**

| RHAI Value | Rent Burden | Interpretation |
|------------|-------------|----------------|
| ≥ 100 | < 30% | Affordable |
| 80 – 99 | 30-37% | Moderately Burdened |
| 60 – 79 | 38-50% | Severely Burdened |
| < 60 | > 50% | Critically Burdened |

### 4.4 Composite GHAI Formula

```typescript
interface GHAIResult {
  composite: number;
  mhai: number;
  chai: number;
  rhai: number;
  weights: { mortgage: number; cash: number; rental: number };
  interpretation: string;
  trend: 'improving' | 'stable' | 'worsening';
}

function calculateCompositeGHAI(
  region: RegionCode,
  mhai: number,
  chai: number,
  rhai: number,
  previousGhai?: number
): GHAIResult {
  
  const weights = REGIONAL_WEIGHTS[region];
  
  const composite = 
    (weights.mortgage * mhai) +
    (weights.cash * chai) +
    (weights.rental * rhai);
  
  // Determine interpretation
  let interpretation: string;
  if (composite >= 100) {
    interpretation = 'Affordable';
  } else if (composite >= 80) {
    interpretation = 'Moderately Affordable';
  } else if (composite >= 60) {
    interpretation = 'Stretched';
  } else if (composite >= 40) {
    interpretation = 'Unaffordable';
  } else {
    interpretation = 'Severely Unaffordable';
  }
  
  // Determine trend
  let trend: 'improving' | 'stable' | 'worsening' = 'stable';
  if (previousGhai) {
    const change = composite - previousGhai;
    if (change > 2) trend = 'improving';
    else if (change < -2) trend = 'worsening';
  }
  
  return {
    composite: Math.round(composite * 10) / 10,
    mhai: Math.round(mhai * 10) / 10,
    chai: Math.round(chai * 10) / 10,
    rhai: Math.round(rhai * 10) / 10,
    weights,
    interpretation,
    trend,
  };
}
```

---

## 5. Supplementary Indices

### 5.1 Construction Affordability Index (CAI)

**Measures ability to build rather than buy.**

```typescript
function calculateCAI(
  medianHouseholdIncome: number,
  constructionCostPerSqm: number,
  typicalHomeSqm: number = 120,  // 3-bedroom standard
  landCostPerSqm: number
): { cai: number; totalBuildCost: number; yearsToSave: number } {
  
  const constructionCost = constructionCostPerSqm * typicalHomeSqm;
  const landCost = landCostPerSqm * 400;  // Typical plot 400 sqm
  const totalCost = constructionCost + landCost;
  
  // Use same methodology as CHAI
  const savingsRate = 0.15;
  const annualSavings = medianHouseholdIncome * savingsRate;
  const yearsToSave = totalCost / annualSavings;
  
  // CAI: 100 = Can build in 10 years of saving
  const cai = (10 / yearsToSave) * 100;
  
  return {
    cai: Math.min(cai, 200),
    totalBuildCost: totalCost,
    yearsToSave,
  };
}
```

### 5.2 Mortgage Accessibility Score (MAS)

**Measures what percentage of households can even qualify for a mortgage.**

```typescript
function calculateMAS(
  region: RegionCode,
  formalEmploymentRate: number,     // % in formal sector
  creditHistoryAvailability: number, // % with credit history
  incomeDocumentationRate: number,   // % who can document income
  debtToIncomeThreshold: number = 0.40
): number {
  
  // MAS is the intersection of all requirements
  // Only those who meet ALL criteria can access mortgages
  
  const baseEligibility = 
    formalEmploymentRate *
    creditHistoryAvailability *
    incomeDocumentationRate;
  
  // Adjust for DTI failure rate (estimated 30% of formal workers exceed DTI)
  const dtiAdjustment = 0.70;
  
  // Final MAS: percentage of households who could qualify
  const mas = baseEligibility * dtiAdjustment * 100;
  
  return Math.round(mas * 10) / 10;
}
```

**Example Calculation (Greater Accra):**

```
Formal Employment Rate: 45%
Credit History Availability: 25%
Income Documentation Rate: 60%
DTI Pass Rate: 70%

MAS = 0.45 × 0.25 × 0.60 × 0.70 × 100 = 4.73%

→ Only ~5% of Greater Accra households can realistically access bank mortgages
```

---

## 6. Data Sources & Integration

### 6.1 Required Data Points

| Data Category | Source | Current Status | Frequency |
|---------------|--------|----------------|-----------|
| **Median Home Prices** | PropMetrik Transactions | ✅ Available | Monthly |
| **Mortgage Rates** | Bank of Ghana / Economic Service | ✅ Available | Monthly |
| **Inflation/Policy Rate** | Bank of Ghana | ✅ Available | Monthly |
| **Construction Costs** | PropMetrik Material Survey | ✅ Available | Weekly |
| **Rental Prices** | PropMetrik Listings | ✅ Available | Daily |
| **Household Income** | GSS GLSS | ⚠️ Need Integration | Annual |
| **Employment Rates** | GSS | ⚠️ Need Integration | Quarterly |
| **Transaction Volume** | PropMetrik + Lands Commission | ⚠️ Partial | Monthly |

### 6.2 Existing PropMetrik Data Assets

**From economicIndicatorService.ts:**
```typescript
// Already collecting:
- inflation_rate
- mortgage_rate
- policy_rate
- prime_rate
- exchange_rate_usd
- gdp_growth
- unemployment_rate
- consumer_price_index
- property_price_index
```

**From constructionCostService.ts:**
```typescript
// Already collecting by region:
- cement_index, steel_index, timber_index
- residential_basic_per_sqm
- residential_standard_per_sqm
- residential_premium_per_sqm
- residential_luxury_per_sqm
```

### 6.3 Household Income Data Strategy

Since GSS GLSS data is annual and delayed, we need a multi-source approach:

```
┌─────────────────────────────────────────────────────────────────────┐
│                   HOUSEHOLD INCOME ESTIMATION                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Primary Sources (High Confidence):                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • GSS Ghana Living Standards Survey (GLSS7)                 │   │
│  │ • GSS Annual Household Income & Expenditure Survey          │   │
│  │ • Bank of Ghana Financial Stability Reports                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Secondary Sources (Proxy Estimation):                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • Rental-to-Income Ratio Inversion                          │   │
│  │   If rent = GHS 3,000 and target ratio = 30%                │   │
│  │   Then implied income = GHS 10,000/month                    │   │
│  │                                                              │   │
│  │ • Neighborhood Price Stratification                         │   │
│  │   Map neighborhood income_level to income ranges            │   │
│  │   High = P75+, Upper-middle = P50-P75, etc.                 │   │
│  │                                                              │   │
│  │ • Wage Index Extrapolation                                  │   │
│  │   Base GLSS7 data × (1 + wage_growth)^years                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Confidence Weighting:                                              │
│  • GSS Data: 90% confidence                                        │
│  • Bank Surveys: 80% confidence                                    │
│  • Proxy Methods: 60% confidence                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Database Schema

### 7.1 Household Income Table (NEW)

```sql
-- Migration: 006_household_income.sql

CREATE TYPE income_source_enum AS ENUM (
  'gss_glss',
  'gss_ahies', 
  'bog_survey',
  'propmetrik_proxy',
  'partner_data'
);

CREATE TYPE household_type_enum AS ENUM (
  'single',
  'couple_no_children',
  'couple_with_children',
  'single_parent',
  'extended_family',
  'all'
);

CREATE TYPE employment_sector_enum AS ENUM (
  'formal_public',
  'formal_private',
  'informal',
  'self_employed',
  'mixed',
  'all'
);

CREATE TABLE household_income_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Location
  region region_code_enum NOT NULL,
  district VARCHAR(100),
  locality_type VARCHAR(20) DEFAULT 'urban',  -- 'urban', 'peri-urban', 'rural'
  
  -- Time period
  period_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL,  -- 'monthly', 'quarterly', 'annual'
  
  -- Income distribution (GHS per month)
  median_income_ghs DECIMAL(12, 2) NOT NULL,
  mean_income_ghs DECIMAL(12, 2),
  income_p10 DECIMAL(12, 2),   -- 10th percentile
  income_p25 DECIMAL(12, 2),   -- 25th percentile (Q1)
  income_p75 DECIMAL(12, 2),   -- 75th percentile (Q3)
  income_p90 DECIMAL(12, 2),   -- 90th percentile
  
  -- Segmentation
  household_type household_type_enum DEFAULT 'all',
  employment_sector employment_sector_enum DEFAULT 'all',
  
  -- Disposable income adjustments
  effective_tax_rate DECIMAL(5, 4),
  estimated_disposable_pct DECIMAL(5, 4) DEFAULT 0.75,  -- After tax, utilities, transport
  
  -- Metadata
  source income_source_enum NOT NULL,
  source_reference VARCHAR(255),
  confidence_level DECIMAL(3, 2),  -- 0.00 to 1.00
  sample_size INTEGER,
  methodology_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(region, period_date, period_type, household_type, employment_sector)
);

CREATE INDEX idx_income_region_date ON household_income_data(region, period_date);
CREATE INDEX idx_income_period ON household_income_data(period_date, period_type);
```

### 7.2 Housing Affordability Index Table (NEW)

```sql
-- Migration: 007_housing_affordability_index.sql

CREATE TYPE affordability_category_enum AS ENUM (
  'affordable',
  'moderately_affordable',
  'stretched',
  'unaffordable',
  'severely_unaffordable'
);

CREATE TYPE trend_direction_enum AS ENUM (
  'improving',
  'stable',
  'worsening'
);

CREATE TABLE housing_affordability_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Temporal
  calculation_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  
  -- Location
  region region_code_enum NOT NULL,
  district VARCHAR(100),
  
  -- Property filter
  property_type VARCHAR(50) DEFAULT 'all',  -- 'all', 'apartment', 'house', 'villa'
  
  -- Core Input Metrics
  median_property_price_ghs DECIMAL(15, 2) NOT NULL,
  median_household_income_ghs DECIMAL(12, 2) NOT NULL,
  mortgage_rate DECIMAL(6, 4) NOT NULL,  -- Annual rate (e.g., 0.32 = 32%)
  median_rental_ghs DECIMAL(12, 2),
  
  -- Mortgage-Based HAI
  mhai_index DECIMAL(6, 2),
  monthly_mortgage_payment DECIMAL(12, 2),
  qualifying_income_mortgage DECIMAL(12, 2),
  payment_to_income_ratio DECIMAL(5, 4),
  
  -- Cash-Based HAI
  chai_index DECIMAL(6, 2),
  price_to_income_ratio DECIMAL(8, 2),
  years_to_save DECIMAL(5, 2),
  
  -- Rental HAI
  rhai_index DECIMAL(6, 2),
  rent_to_income_ratio DECIMAL(5, 4),
  months_to_cover_advance DECIMAL(5, 2),
  
  -- Composite GHAI
  ghai_composite DECIMAL(6, 2) NOT NULL,
  ghai_category affordability_category_enum NOT NULL,
  ghai_trend trend_direction_enum DEFAULT 'stable',
  
  -- Weight configuration used
  weight_mortgage DECIMAL(4, 3),
  weight_cash DECIMAL(4, 3),
  weight_rental DECIMAL(4, 3),
  
  -- Supplementary metrics
  mortgage_accessibility_score DECIMAL(5, 2),
  construction_affordability_index DECIMAL(6, 2),
  land_affordability_index DECIMAL(6, 2),
  
  -- Change tracking
  ghai_change_mom DECIMAL(6, 2),  -- Month-over-month
  ghai_change_qoq DECIMAL(6, 2),  -- Quarter-over-quarter
  ghai_change_yoy DECIMAL(6, 2),  -- Year-over-year
  
  -- Metadata
  methodology_version VARCHAR(20) DEFAULT '1.0',
  sample_size_prices INTEGER,
  sample_size_income INTEGER,
  confidence_level DECIMAL(3, 2),
  calculation_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(calculation_date, region, property_type)
);

-- Indexes for efficient querying
CREATE INDEX idx_hai_region_date ON housing_affordability_index(region, calculation_date DESC);
CREATE INDEX idx_hai_date ON housing_affordability_index(calculation_date DESC);
CREATE INDEX idx_hai_composite ON housing_affordability_index(ghai_composite);
CREATE INDEX idx_hai_category ON housing_affordability_index(ghai_category);
```

### 7.3 HAI Historical Snapshots (NEW)

```sql
-- For time-series analysis and charting
CREATE TABLE hai_time_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region region_code_enum NOT NULL,
  snapshot_date DATE NOT NULL,
  
  ghai_composite DECIMAL(6, 2) NOT NULL,
  mhai_index DECIMAL(6, 2),
  chai_index DECIMAL(6, 2),
  rhai_index DECIMAL(6, 2),
  
  median_price DECIMAL(15, 2),
  median_income DECIMAL(12, 2),
  mortgage_rate DECIMAL(6, 4),
  inflation_rate DECIMAL(6, 4),
  
  UNIQUE(region, snapshot_date)
);

CREATE INDEX idx_hai_ts_region ON hai_time_series(region, snapshot_date);
```

---

## 8. API Endpoints

### 8.1 HAI Routes

```typescript
// File: /backend/src/routes/api/v1/hai.routes.ts

/**
 * GET /api/v1/hai/current
 * Get current GHAI for all regions
 */
router.get('/current', async (req, res) => {
  const indices = await haiService.getCurrentIndices();
  res.json({ success: true, data: indices });
});

/**
 * GET /api/v1/hai/region/:region
 * Get detailed HAI for specific region
 */
router.get('/region/:region', async (req, res) => {
  const { region } = req.params;
  const { propertyType = 'all' } = req.query;
  
  const hai = await haiService.getRegionHAI(region, propertyType);
  res.json({ success: true, data: hai });
});

/**
 * GET /api/v1/hai/history
 * Get historical HAI data for charting
 */
router.get('/history', async (req, res) => {
  const { region, startDate, endDate, granularity = 'monthly' } = req.query;
  
  const history = await haiService.getHistoricalData({
    region,
    startDate,
    endDate,
    granularity,
  });
  
  res.json({ success: true, data: history });
});

/**
 * GET /api/v1/hai/compare
 * Compare HAI across regions
 */
router.get('/compare', async (req, res) => {
  const { regions, date } = req.query;
  
  const comparison = await haiService.compareRegions(
    regions?.split(',') || ['greater_accra', 'kumasi_metro'],
    date
  );
  
  res.json({ success: true, data: comparison });
});

/**
 * POST /api/v1/hai/calculate
 * Calculate custom HAI with user-provided parameters
 */
router.post('/calculate', async (req, res) => {
  const {
    propertyPrice,
    householdIncome,
    mortgageRate,
    rentalPrice,
    region,
  } = req.body;
  
  const result = await haiService.calculateCustomHAI({
    propertyPrice,
    householdIncome,
    mortgageRate,
    rentalPrice,
    region,
  });
  
  res.json({ success: true, data: result });
});

/**
 * GET /api/v1/hai/components
 * Get all component metrics for transparency
 */
router.get('/components/:region', async (req, res) => {
  const { region } = req.params;
  
  const components = await haiService.getComponentBreakdown(region);
  res.json({ success: true, data: components });
});

/**
 * POST /api/v1/hai/recalculate
 * Trigger recalculation for a specific date (admin)
 */
router.post('/recalculate', requireAdmin, async (req, res) => {
  const { date, regions } = req.body;
  
  const results = await haiService.recalculateIndices(date, regions);
  res.json({ success: true, data: results });
});
```

### 8.2 Response Format

```typescript
// GET /api/v1/hai/region/greater_accra

{
  "success": true,
  "data": {
    "region": "greater_accra",
    "calculation_date": "2026-01-01",
    
    "composite": {
      "ghai": 42.5,
      "category": "unaffordable",
      "trend": "worsening",
      "change_mom": -2.3,
      "change_yoy": -8.7
    },
    
    "sub_indices": {
      "mortgage": {
        "mhai": 28.4,
        "monthly_payment": 21450,
        "qualifying_income": 858000,
        "payment_to_income_ratio": 0.54,
        "weight": 0.25
      },
      "cash": {
        "chai": 38.2,
        "price_to_income_ratio": 17.7,
        "years_to_save": 26.2,
        "weight": 0.45
      },
      "rental": {
        "rhai": 68.5,
        "rent_to_income_ratio": 0.44,
        "months_to_cover_advance": 22,
        "weight": 0.30
      }
    },
    
    "inputs": {
      "median_property_price": 850000,
      "median_household_income": 48000,
      "mortgage_rate": 0.32,
      "median_rental": 3500,
      "inflation_rate": 0.232
    },
    
    "supplementary": {
      "mortgage_accessibility_score": 4.7,
      "construction_affordability_index": 35.2,
      "land_affordability_index": 22.8
    },
    
    "methodology": {
      "version": "1.0",
      "sample_size_prices": 1250,
      "sample_size_income": 2400,
      "confidence_level": 0.85
    }
  }
}
```

---

## 9. Service Implementation

### 9.1 HAI Service Structure

```
/backend/src/services/market-intelligence/
├── affordabilityIndexService.ts   # Main HAI service
├── calculators/
│   ├── mortgageHAI.ts             # MHAI calculation
│   ├── cashHAI.ts                 # CHAI calculation
│   ├── rentalHAI.ts               # RHAI calculation
│   ├── compositeGHAI.ts           # Composite calculation
│   └── supplementaryIndices.ts    # CAI, LAI, MAS
├── dataCollectors/
│   ├── priceDataCollector.ts      # Aggregates property prices
│   ├── incomeDataCollector.ts     # Manages income data
│   └── economicDataCollector.ts   # Fetches economic indicators
├── schedulers/
│   └── haiCalculationScheduler.ts # Monthly recalculation jobs
└── utils/
    ├── weights.ts                 # Regional weight configurations
    └── interpretations.ts         # Category/trend logic
```

### 9.2 Core Service Class

```typescript
// File: /backend/src/services/market-intelligence/affordabilityIndexService.ts

import { db } from '@/db';
import { economicIndicatorService } from '@/services/data-hub/economicIndicatorService';
import { calculateMHAI } from './calculators/mortgageHAI';
import { calculateCHAI } from './calculators/cashHAI';
import { calculateRHAI } from './calculators/rentalHAI';
import { calculateCompositeGHAI } from './calculators/compositeGHAI';
import { REGIONAL_WEIGHTS } from './utils/weights';

export class AffordabilityIndexService {
  
  /**
   * Calculate GHAI for a region
   */
  async calculateRegionHAI(
    region: RegionCode,
    calculationDate: Date = new Date()
  ): Promise<HousingAffordabilityIndex> {
    
    // 1. Collect input data
    const [priceData, incomeData, economicData, rentalData] = await Promise.all([
      this.getMedianPriceData(region, calculationDate),
      this.getIncomeData(region, calculationDate),
      economicIndicatorService.getLatestIndicators(),
      this.getMedianRentalData(region, calculationDate),
    ]);
    
    // 2. Calculate sub-indices
    const mhai = calculateMHAI(
      priceData.medianPrice,
      incomeData.medianAnnualIncome,
      economicData.mortgageRate
    );
    
    const chai = calculateCHAI(
      priceData.medianPrice,
      incomeData.medianAnnualIncome
    );
    
    const rhai = calculateRHAI(
      rentalData.medianMonthlyRent,
      incomeData.medianAnnualIncome / 12,
      rentalData.typicalAdvanceMonths
    );
    
    // 3. Get previous period for trend
    const previousGhai = await this.getPreviousPeriodGHAI(region);
    
    // 4. Calculate composite
    const composite = calculateCompositeGHAI(
      region,
      mhai.index,
      chai.chai,
      rhai.rhai,
      previousGhai
    );
    
    // 5. Build result
    const result: HousingAffordabilityIndex = {
      region,
      calculation_date: calculationDate,
      
      ghai_composite: composite.composite,
      ghai_category: composite.interpretation,
      ghai_trend: composite.trend,
      
      mhai_index: mhai.index,
      monthly_mortgage_payment: mhai.monthlyPayment,
      qualifying_income_mortgage: mhai.qualifyingIncome,
      payment_to_income_ratio: mhai.paymentToIncomeRatio,
      
      chai_index: chai.chai,
      price_to_income_ratio: chai.pir,
      years_to_save: chai.yearsToSave,
      
      rhai_index: rhai.rhai,
      rent_to_income_ratio: rhai.rentToIncomeRatio,
      months_to_cover_advance: rhai.monthsToCoverAdvance,
      
      inputs: {
        median_property_price: priceData.medianPrice,
        median_household_income: incomeData.medianAnnualIncome,
        mortgage_rate: economicData.mortgageRate,
        median_rental: rentalData.medianMonthlyRent,
        inflation_rate: economicData.inflationRate,
      },
      
      weights: REGIONAL_WEIGHTS[region],
      methodology_version: '1.0',
      confidence_level: this.calculateConfidence(priceData, incomeData),
    };
    
    // 6. Persist to database
    await this.saveHAI(result);
    
    return result;
  }
  
  /**
   * Get current indices for all regions
   */
  async getCurrentIndices(): Promise<RegionalHAISummary[]> {
    return db.query(`
      SELECT DISTINCT ON (region)
        region,
        calculation_date,
        ghai_composite,
        ghai_category,
        ghai_trend,
        ghai_change_mom,
        mhai_index,
        chai_index,
        rhai_index
      FROM housing_affordability_index
      ORDER BY region, calculation_date DESC
    `);
  }
  
  /**
   * Get historical data for charting
   */
  async getHistoricalData(params: {
    region?: RegionCode;
    startDate?: Date;
    endDate?: Date;
    granularity?: 'daily' | 'weekly' | 'monthly';
  }): Promise<HAITimeSeriesPoint[]> {
    const { region, startDate, endDate, granularity = 'monthly' } = params;
    
    let query = `
      SELECT 
        snapshot_date,
        region,
        ghai_composite,
        mhai_index,
        chai_index,
        rhai_index,
        median_price,
        median_income,
        mortgage_rate
      FROM hai_time_series
      WHERE 1=1
    `;
    
    const queryParams: any[] = [];
    
    if (region) {
      queryParams.push(region);
      query += ` AND region = $${queryParams.length}`;
    }
    
    if (startDate) {
      queryParams.push(startDate);
      query += ` AND snapshot_date >= $${queryParams.length}`;
    }
    
    if (endDate) {
      queryParams.push(endDate);
      query += ` AND snapshot_date <= $${queryParams.length}`;
    }
    
    query += ` ORDER BY snapshot_date ASC`;
    
    return db.query(query, queryParams);
  }
  
  // ... additional methods
}

export const affordabilityIndexService = new AffordabilityIndexService();
```

---

## 10. Frontend Integration

### 10.1 Dashboard Components

```
/frontend/src/app/data-hub/affordability/
├── page.tsx                        # Main HAI dashboard
├── components/
│   ├── GHAIScoreCard.tsx          # Large composite score display
│   ├── SubIndexCards.tsx          # MHAI, CHAI, RHAI cards
│   ├── AffordabilityChart.tsx     # Time series chart
│   ├── RegionalComparison.tsx     # Side-by-side comparison
│   ├── ComponentBreakdown.tsx     # Detailed metric breakdown
│   ├── AffordabilityMap.tsx       # Geographic visualization
│   └── MethodologyModal.tsx       # Transparency disclosure
```

### 10.2 Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────────┐
│  GHANA HOUSING AFFORDABILITY INDEX                    [Jan 2026 ▼] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │           ████████████████░░░░░░░░░░                        │   │
│  │                                                              │   │
│  │                    42.5                                      │   │
│  │              UNAFFORDABLE                                    │   │
│  │                                                              │   │
│  │         Greater Accra  ↓ 2.3 from last month                │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │  MORTGAGE   │ │    CASH     │ │   RENTAL    │                   │
│  │    28.4     │ │    38.2     │ │    68.5     │                   │
│  │  Severely   │ │ Unaffordable│ │  Stretched  │                   │
│  │ Unaffordable│ │             │ │             │                   │
│  │   w: 25%    │ │   w: 45%    │ │   w: 30%    │                   │
│  └─────────────┘ └─────────────┘ └─────────────┘                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  HISTORICAL TREND (12 MONTHS)                               │   │
│  │                                                              │   │
│  │  100 ┤                                                      │   │
│  │   80 ┤                                                      │   │
│  │   60 ┤───────────────────────────                           │   │
│  │   40 ┤                         ───────────                  │   │
│  │   20 ┤                                                      │   │
│  │    0 ┼────┬────┬────┬────┬────┬────┬────┬────┬────┬────┤   │   │
│  │      Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec        │   │
│  │                                                              │   │
│  │  ── GHAI  ── MHAI  ── CHAI  ── RHAI                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────┐ ┌──────────────────────────────┐     │
│  │  REGIONAL COMPARISON     │ │  KEY INPUTS                  │     │
│  │                          │ │                              │     │
│  │  Gr. Accra    42.5 ████  │ │  Median Price: GHS 850,000  │     │
│  │  Kumasi       58.2 █████ │ │  Median Income: GHS 48,000  │     │
│  │  Eastern      64.3 ██████│ │  Mortgage Rate: 32.0%       │     │
│  │  Western      61.8 █████ │ │  Inflation: 23.2%           │     │
│  │  Northern     71.2 ██████│ │  Median Rent: GHS 3,500     │     │
│  │                          │ │                              │     │
│  └──────────────────────────┘ └──────────────────────────────┘     │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  WHAT THIS MEANS                                            │   │
│  │                                                              │   │
│  │  A median-income household in Greater Accra:                │   │
│  │  • Cannot qualify for a bank mortgage (needs 3.5x income)   │   │
│  │  • Would need 26 years to save for cash purchase            │   │
│  │  • Spends 44% of income on rent (severely burdened)         │   │
│  │  • Only 4.7% of households can access bank mortgages        │   │
│  │                                                              │   │
│  │  [View Full Methodology]  [Download Report]                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

| Task | Priority | Effort |
|------|----------|--------|
| Create database migrations (income, HAI tables) | P0 | 2 days |
| Seed initial income data from GSS GLSS7 | P0 | 2 days |
| Implement core HAI calculation functions | P0 | 3 days |
| Create HAI service class | P0 | 2 days |
| Add HAI API routes | P0 | 1 day |

### Phase 2: Data Pipeline (Week 3-4)

| Task | Priority | Effort |
|------|----------|--------|
| Build price data aggregation (from transactions) | P0 | 2 days |
| Build rental data aggregation (from listings) | P0 | 2 days |
| Create income estimation proxy methods | P1 | 3 days |
| Set up monthly recalculation scheduler | P1 | 1 day |
| Add time-series snapshots | P1 | 1 day |

### Phase 3: Frontend (Week 5-6)

| Task | Priority | Effort |
|------|----------|--------|
| Create HAI dashboard page | P0 | 2 days |
| Build score cards and charts | P0 | 3 days |
| Build regional comparison view | P1 | 2 days |
| Add methodology modal | P1 | 1 day |
| Create PDF report generation | P2 | 2 days |

### Phase 4: Enhancement (Week 7-8)

| Task | Priority | Effort |
|------|----------|--------|
| Add neighborhood-level HAI | P2 | 3 days |
| Build affordability calculator widget | P1 | 2 days |
| Create API documentation | P1 | 1 day |
| Add to market intelligence reports | P2 | 2 days |
| Performance optimization | P2 | 2 days |

---

## 12. Competitive Differentiation

### 12.1 Why GHAI Is Proprietary

| Feature | Generic Index | GHAI |
|---------|---------------|------|
| Mortgage-only focus | ✓ | ✗ Multi-path |
| US assumptions | ✓ | ✗ Ghana-calibrated |
| Single index | ✓ | ✗ Composite + sub-indices |
| Static weights | ✓ | ✗ Regional dynamic weights |
| Cash market ignored | ✓ | ✗ Cash HAI included |
| Rental included | Sometimes | ✓ Always |
| Mortgage accessibility | ✗ | ✓ MAS score |
| Construction path | ✗ | ✓ CAI included |

### 12.2 Monetization Opportunities

1. **Subscription Feature**: Premium HAI access with forecasts
2. **API Licensing**: Banks/developers pay for HAI data
3. **Custom Reports**: Location-specific affordability analysis
4. **Consulting**: Policy advisory using HAI methodology
5. **Embedded Widgets**: HAI widget for partner sites

---

## 13. Validation & Testing

### 13.1 Backtesting Strategy

1. **Historical Consistency**: Calculate HAI for past periods using known data
2. **Cross-Validation**: Compare with World Bank/IMF housing metrics
3. **Expert Review**: Present to real estate economists for feedback
4. **Market Validation**: Compare index movement with actual transaction volumes

### 13.2 Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Price data coverage | >80% of transactions | Monthly audit |
| Income data freshness | <6 months old | Quarterly review |
| Calculation accuracy | <1% variance | Automated testing |
| API response time | <200ms | Monitoring |
| User trust score | >4.0/5.0 | User surveys |

---

## 14. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| **GHAI** | Ghana Housing Affordability Index (Composite) |
| **MHAI** | Mortgage-based Housing Affordability Index |
| **CHAI** | Cash-based Housing Affordability Index |
| **RHAI** | Rental Housing Affordability Index |
| **MAS** | Mortgage Accessibility Score |
| **CAI** | Construction Affordability Index |
| **PIR** | Price-to-Income Ratio |
| **DTI** | Debt-to-Income Ratio |
| **GLSS** | Ghana Living Standards Survey (GSS) |

### B. Data Sources Reference

| Source | URL | Data Type | Frequency |
|--------|-----|-----------|-----------|
| Ghana Statistical Service | statsghana.gov.gh | Income, Employment | Annual |
| Bank of Ghana | bog.gov.gh | Interest rates, Mortgage data | Monthly |
| PropMetrik Transactions | Internal | Property prices | Real-time |
| PropMetrik Listings | Internal | Rental prices | Real-time |
| PropMetrik Construction | Internal | Building costs | Weekly |

### C. Sample Calculations

**Greater Accra (January 2026):**

```
Inputs:
  Median Property Price: GHS 850,000
  Median Household Income: GHS 48,000/year (GHS 4,000/month)
  Mortgage Rate: 32.0%
  Median Rent: GHS 3,500/month

MHAI Calculation:
  Down Payment: 25% = GHS 212,500
  Loan Amount: GHS 637,500
  Monthly Payment (15yr @ 32%): GHS 17,847
  Qualifying Income (30% DTI): GHS 713,880/year
  MHAI = (48,000 / 713,880) × 100 = 6.7

CHAI Calculation:
  Price-to-Income Ratio: 850,000 / 48,000 = 17.7
  Savings Rate: 15% = GHS 7,200/year
  Years to Save: 850,000 / 7,200 = 118 years (!)
  CHAI = (10 / 118) × 100 = 8.5

RHAI Calculation:
  Monthly Rent: GHS 3,500
  Monthly Income: GHS 4,000
  Rent-to-Income: 3,500 / 4,000 = 87.5%
  Qualifying Income (30%): GHS 11,667/month
  RHAI = (4,000 / 11,667) × 100 = 34.3

Composite GHAI:
  Weights: Mortgage=0.25, Cash=0.45, Rental=0.30
  GHAI = (0.25 × 6.7) + (0.45 × 8.5) + (0.30 × 34.3)
  GHAI = 1.68 + 3.83 + 10.29 = 15.8

Interpretation: SEVERELY UNAFFORDABLE
```

---

## 15. References

1. **NAR Housing Affordability Index Methodology** - National Association of REALTORS®
2. **Housing Affordability: A Methodological Review** - UN-Habitat (2020)
3. **Ghana Living Standards Survey Round 7** - Ghana Statistical Service (2019)
4. **Mortgage Market Development in Ghana** - Bank of Ghana (2024)
5. **Housing Finance in Africa Yearbook** - CAHF (2024)
6. **World Bank Housing Indicators** - World Development Indicators

---

*This document is proprietary to PropMetrik and contains confidential methodology.*
