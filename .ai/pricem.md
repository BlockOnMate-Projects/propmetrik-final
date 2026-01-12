
## Industry Standard: Calculated vs Static Multipliers

You are correct — **price multipliers should be calculated fields** derived from real market data, not hardcoded static values. In professional valuation practice, multipliers are computed using:

1. **Index-based calculations** (comparing current prices to baseline periods)
2. **Market-derived rates** (extracted from comparable transactions)
3. **Statistical analysis** (regression coefficients from market data)

Static multipliers are only acceptable as **initial seed values** until sufficient market data exists.

---

## 1. Construction Cost Multipliers

### 1.1 Quality Level Multiplier

**Industry Standard Formula:**

$$\text{Quality Multiplier}_q = \frac{\text{Avg Cost/sqm for Quality Level } q}{\text{Avg Cost/sqm for Standard Quality}}$$

**Data Required:**
- `material_prices` table: prices by material and quality specification
- `construction_cost_indices` table: tracked indices over time
- Survey data: actual construction costs by quality tier

**Example Calculation:**
```sql
-- Calculate quality multipliers from actual construction data
SELECT 
  quality_level,
  AVG(actual_cost_per_sqm) / 
    (SELECT AVG(actual_cost_per_sqm) FROM completed_projects WHERE quality_level = 'standard')
  AS calculated_multiplier
FROM completed_projects
WHERE survey_date >= NOW() - INTERVAL '12 months'
GROUP BY quality_level;
```

**Current Implementation Status:** ❌ Static → Should be calculated from `completed_projects` or `construction_surveys` table

---

### 1.2 Regional Cost Multiplier

**Industry Standard Formula (Relative Location Index):**

$$\text{Region Multiplier}_r = \frac{\sum_{i=1}^{n} (P_{i,r} \times W_i)}{\sum_{i=1}^{n} (P_{i,\text{base}} \times W_i)}$$

Where:
- $P_{i,r}$ = Price of material $i$ in region $r$
- $P_{i,\text{base}}$ = Price of material $i$ in base region (Kumasi Metro)
- $W_i$ = Weight of material $i$ in construction cost basket

**Data Required:**
- `material_prices` table: prices by region
- `labor_rates` table: labor costs by region
- `material_category_weights` table: weighted basket composition

**Example Calculation:**
```sql
-- Calculate regional multiplier from actual price data
WITH base_region AS (
  SELECT 
    material_category,
    AVG(price_ghs) as base_price
  FROM material_prices
  WHERE region = 'kumasi_metro'
    AND survey_date >= NOW() - INTERVAL '4 weeks'
  GROUP BY material_category
),
regional_prices AS (
  SELECT 
    mp.region,
    mp.material_category,
    AVG(mp.price_ghs) as regional_price,
    mcw.weight
  FROM material_prices mp
  JOIN material_category_weights mcw ON mp.material_category::text = mcw.category::text
  WHERE mp.survey_date >= NOW() - INTERVAL '4 weeks'
  GROUP BY mp.region, mp.material_category, mcw.weight
)
SELECT 
  rp.region,
  SUM(rp.regional_price * rp.weight) / SUM(br.base_price * rp.weight) as calculated_multiplier
FROM regional_prices rp
JOIN base_region br ON rp.material_category = br.material_category
GROUP BY rp.region;
```

**Current Implementation Status:** ❌ Static → Should be calculated from `material_prices` and `labor_rates`

---

### 1.3 Construction Cost Index (Inflation Adjustment)

**Industry Standard Formula (Laspeyres Price Index):**

$$\text{Index}_t = \frac{\sum_{i=1}^{n} (P_{i,t} \times Q_{i,0})}{\sum_{i=1}^{n} (P_{i,0} \times Q_{i,0})} \times 100$$

Where:
- $P_{i,t}$ = Current price of item $i$
- $P_{i,0}$ = Base period price of item $i$
- $Q_{i,0}$ = Base period quantity weight for item $i$

**Already Implemented:** ✅ `calculateCurrentIndices()` in `constructionCostService.ts`

---

## 2. Sales Comparison Approach Adjustments

### 2.1 Location Adjustment

**Industry Standard Formula:**

$$\text{Location Adj} = (\text{Subject Location Score} - \text{Comp Location Score}) \times \text{Price Sensitivity Factor}$$

**Data Required:**
- `property_transactions` table: sale prices with location data
- `location_scores` table: infrastructure, amenity, accessibility scores
- Hedonic regression coefficients from sales data

**Calculation Method:**
```typescript
interface LocationAdjustmentInputs {
  subjectLocationScore: number;      // 1-100 composite score
  comparableLocationScore: number;
  basePrice: number;
  locationPriceSensitivity: number;  // % price change per point
}

function calculateLocationAdjustment(inputs: LocationAdjustmentInputs): number {
  const scoreDifference = inputs.subjectLocationScore - inputs.comparableLocationScore;
  return inputs.basePrice * (scoreDifference * inputs.locationPriceSensitivity / 100);
}
```

**Price Sensitivity Derivation:**
```sql
-- Derive location sensitivity from regression on sales data
SELECT 
  REGR_SLOPE(sale_price, location_score) / AVG(sale_price) as price_sensitivity_per_point
FROM property_transactions
WHERE transaction_date >= NOW() - INTERVAL '24 months'
  AND property_type = 'residential';
```

---

### 2.2 Size Adjustment

**Industry Standard Formula:**

$$\text{Size Adj} = \left(\frac{\text{Subject Size}}{\text{Comp Size}}\right)^\beta - 1$$

Where $\beta$ is typically 0.8-0.9 (reflecting diminishing marginal value of size)

**Data Required:**
- `property_transactions` with `building_size_sqm` and `sale_price`
- Regression analysis to derive $\beta$ coefficient

**Calculation:**
```sql
-- Derive size elasticity from market data
SELECT 
  REGR_SLOPE(LN(sale_price), LN(building_size_sqm)) as size_elasticity_beta
FROM property_transactions
WHERE transaction_date >= NOW() - INTERVAL '24 months'
  AND building_size_sqm > 0;
```

---

### 2.3 Time Adjustment (Market Movement)

**Industry Standard Formula:**

$$\text{Time Adj} = (1 + r)^{m/12} - 1$$

Where:
- $r$ = Annual market price change rate
- $m$ = Months between sale and valuation date

**Data Required:**
- `property_transactions` table with sale dates
- `price_indices` table tracking market movement

**Calculation:**
```sql
-- Calculate monthly appreciation rate from repeat sales or index
WITH monthly_indices AS (
  SELECT 
    DATE_TRUNC('month', survey_date) as month,
    AVG(index_value) as month_index
  FROM construction_cost_indices
  GROUP BY DATE_TRUNC('month', survey_date)
  ORDER BY month
)
SELECT 
  (POWER(
    (SELECT month_index FROM monthly_indices ORDER BY month DESC LIMIT 1) /
    (SELECT month_index FROM monthly_indices ORDER BY month ASC LIMIT 1),
    12.0 / COUNT(*)
  ) - 1) as annual_appreciation_rate
FROM monthly_indices;
```

---

### 2.4 Condition Adjustment

**Industry Standard Formula:**

$$\text{Condition Adj} = (\text{Condition Score Diff}) \times \text{Repair Cost Factor}$$

| Condition | Score | Typical Adjustment |
|-----------|-------|-------------------|
| Excellent | 5 | +8% to +15% |
| Good | 4 | +3% to +8% |
| Average | 3 | Base (0%) |
| Fair | 2 | -5% to -15% |
| Poor | 1 | -15% to -30% |

**Data Required:**
- Property condition assessments
- Repair/renovation cost database
- Transaction data with condition ratings

---

## 3. Income Approach Multipliers

### 3.1 Capitalization Rate (Cap Rate)

**Industry Standard Formula (Market Extraction):**

$$\text{Cap Rate} = \frac{\text{Net Operating Income}}{\text{Sale Price}}$$

**Built-up Method:**

$$\text{Cap Rate} = R_f + RP_{RE} + RP_{Loc} + RP_{Prop} + RP_{Mgmt}$$

Where:
- $R_f$ = Risk-free rate (Ghana T-bill: ~19%)
- $RP_{RE}$ = Real estate risk premium (~4%)
- $RP_{Loc}$ = Location risk premium (0-5%)
- $RP_{Prop}$ = Property-specific risk (0-3%)
- $RP_{Mgmt}$ = Management intensity (~2%)

**Data Required:**
- `property_transactions` with NOI data
- `economic_indicators` table: T-bill rates, inflation
- Location risk scores

**Should be Calculated:**
```sql
-- Extract cap rates from investment sales
SELECT 
  property_type,
  region,
  AVG(net_operating_income / sale_price) as market_cap_rate,
  STDDEV(net_operating_income / sale_price) as cap_rate_std
FROM property_transactions
WHERE transaction_type = 'investment_sale'
  AND net_operating_income > 0
  AND transaction_date >= NOW() - INTERVAL '24 months'
GROUP BY property_type, region;
```

---

### 3.2 Gross Rent Multiplier (GRM)

**Industry Standard Formula:**

$$\text{GRM} = \frac{\text{Sale Price}}{\text{Annual Gross Rent}}$$

**Data Required:**
- `property_transactions` with rental income data
- `rental_listings` table for market rents

---

### 3.3 Expense Ratios

**Industry Standard (by Property Type):**

| Property Type | Operating Expense Ratio |
|--------------|------------------------|
| Residential (owner-managed) | 25-35% |
| Residential (professionally managed) | 35-45% |
| Office | 35-45% |
| Retail | 25-40% |
| Industrial | 20-30% |

**Should be Calculated:**
```sql
-- Extract expense ratios from operating properties
SELECT 
  property_type,
  AVG(total_operating_expenses / gross_income) as avg_expense_ratio
FROM property_operations
WHERE fiscal_year >= EXTRACT(YEAR FROM NOW()) - 2
GROUP BY property_type;
```

---

## 4. Cost Approach Multipliers

### 4.1 Depreciation Rate

**Industry Standard Formula (Age-Life Method):**

$$\text{Physical Depreciation} = \frac{\text{Effective Age}}{\text{Economic Life}}$$

**Economic Life by Construction Type:**

| Construction | Economic Life | Annual Depreciation |
|--------------|---------------|-------------------|
| Reinforced Concrete | 60-80 years | 1.25-1.67% |
| Concrete Block | 50-60 years | 1.67-2.0% |
| Block & Mortar | 40-50 years | 2.0-2.5% |
| Mud Brick (improved) | 25-40 years | 2.5-4.0% |

**Effective Age Calculation:**
```typescript
// Effective age considers maintenance and upgrades
function calculateEffectiveAge(
  actualAge: number,
  conditionRating: 1 | 2 | 3 | 4 | 5,
  majorRenovations: { year: number; scope: 'minor' | 'major' | 'complete' }[]
): number {
  let effectiveAge = actualAge;
  
  // Condition adjustment
  const conditionFactor = { 1: 1.3, 2: 1.15, 3: 1.0, 4: 0.85, 5: 0.7 }[conditionRating];
  effectiveAge *= conditionFactor;
  
  // Renovation resets
  for (const reno of majorRenovations) {
    const yearsAgo = new Date().getFullYear() - reno.year;
    const resetFactor = { minor: 0.1, major: 0.3, complete: 0.6 }[reno.scope];
    effectiveAge -= (actualAge - yearsAgo) * resetFactor;
  }
  
  return Math.max(0, effectiveAge);
}
```

---

### 4.2 Soft Cost Percentage

**Industry Standard (Ghana Market):**

| Cost Component | Percentage of Hard Costs |
|----------------|-------------------------|
| Professional Fees | 6-10% |
| Permits & Approvals | 2-4% |
| Financing Costs | 3-5% |
| Contingency | 5-10% |
| **Total Soft Costs** | **16-29%** |

**Should Use:**
- Market survey of professional fees
- Historical permit fee data
- Current lending rates

---

## 5. DRC Method Multipliers

### 5.1 Obsolescence Factors

**Functional Obsolescence:**

$$\text{Func Obs} = \text{Cost to Cure} + \text{Capitalized Income Loss}$$

**External Obsolescence:**

| Factor | Impact Range |
|--------|-------------|
| Infrastructure Decline | 0-5% |
| Neighborhood Deterioration | 0-10% |
| Market/Economic Downturn | 0-8% |
| Environmental Issues | 0-15% |
| **Maximum Combined** | **25%** |

---

## 6. Residual Method Parameters

### 6.1 Developer Profit Margin

**Industry Standard:**

$$\text{Developer Profit} = 15\% \text{ to } 25\% \text{ of GDV}$$

**Risk-Adjusted Formula:**

$$\text{Profit Margin} = \text{Base Return} + \text{Planning Risk} + \text{Market Risk} + \text{Funding Risk}$$

| Project Type | Typical Profit on GDV |
|-------------|----------------------|
| Residential (pre-sold) | 12-18% |
| Residential (speculative) | 18-25% |
| Commercial | 15-22% |
| Mixed-Use | 18-25% |

---

## 7. Recommended Database Schema Changes

To support calculated multipliers, add these tables:

```sql
-- Completed projects for cost benchmarking
CREATE TABLE completed_projects (
  id SERIAL PRIMARY KEY,
  project_name VARCHAR(255),
  property_type VARCHAR(50),
  quality_level VARCHAR(50),
  region VARCHAR(50),
  building_size_sqm DECIMAL(12,2),
  actual_cost_ghs DECIMAL(14,2),
  actual_cost_per_sqm DECIMAL(10,2) GENERATED ALWAYS AS (actual_cost_ghs / NULLIF(building_size_sqm, 0)) STORED,
  completion_date DATE,
  data_source VARCHAR(100),
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Property transactions with full valuation data
CREATE TABLE property_transactions_enhanced (
  id SERIAL PRIMARY KEY,
  property_id UUID,
  transaction_type VARCHAR(50), -- 'sale', 'investment_sale', 'auction'
  sale_price DECIMAL(14,2),
  transaction_date DATE,
  property_type VARCHAR(50),
  region VARCHAR(50),
  building_size_sqm DECIMAL(12,2),
  land_size_sqm DECIMAL(12,2),
  condition_rating INTEGER CHECK (condition_rating BETWEEN 1 AND 5),
  location_score INTEGER CHECK (location_score BETWEEN 1 AND 100),
  net_operating_income DECIMAL(14,2),
  gross_rent DECIMAL(14,2),
  cap_rate DECIMAL(6,4) GENERATED ALWAYS AS (net_operating_income / NULLIF(sale_price, 0)) STORED,
  grm DECIMAL(8,2) GENERATED ALWAYS AS (sale_price / NULLIF(gross_rent, 0)) STORED,
  price_per_sqm DECIMAL(10,2) GENERATED ALWAYS AS (sale_price / NULLIF(building_size_sqm, 0)) STORED,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market-derived multipliers (auto-calculated nightly)
CREATE TABLE calculated_multipliers (
  id SERIAL PRIMARY KEY,
  multiplier_type VARCHAR(50), -- 'quality', 'region', 'condition', 'time'
  category VARCHAR(50),
  value DECIMAL(8,4),
  confidence DECIMAL(4,3),
  sample_size INTEGER,
  calculation_date DATE,
  valid_from DATE,
  valid_to DATE,
  methodology TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. Implementation Roadmap

### Phase 1: Data Collection (Current)
- ✅ Material prices by region
- ✅ Labor rates by region
- ✅ Construction cost indices
- ⬜ Completed project costs
- ⬜ Property transaction data with full attributes

### Phase 2: Calculated Multipliers (Next)
- ⬜ Nightly job to recalculate regional multipliers
- ⬜ Weekly job to update quality multipliers
- ⬜ Monthly cap rate extraction from transactions
- ⬜ Quarterly depreciation rate analysis

### Phase 3: Full AVM Integration
- ⬜ Use calculated multipliers in valuation models
- ⬜ Confidence scoring based on data quality
- ⬜ Fallback hierarchy: calculated → survey → static seed

---

## Summary

| Multiplier | Current State | Target State | Data Source |
|-----------|---------------|--------------|-------------|
| Quality Multiplier | Static (DB-editable) | Calculated | `completed_projects` |
| Region Multiplier | Static (DB-editable) | Calculated | `material_prices`, `labor_rates` |
| Time Adjustment | Calculated ✅ | Calculated | `construction_cost_indices` |
| Cap Rate | Not implemented | Calculated | `property_transactions` |
| Depreciation | Not implemented | Calculated | `property_condition_surveys` |
| Location Adj | Not implemented | Calculated | `property_transactions` + regression |

The current static multipliers serve as **valid seed values** until sufficient transaction and survey data accumulates to enable fully calculated adjustments.
