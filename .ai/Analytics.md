# Propmetrik Analytics Platform

**Version:** 3.0  
**Date:** January 2026  
**Classification:** Product Analytics Documentation  
**Status:** Implementation Ready

---

## Executive Summary

The Propmetrik Analytics Platform is a comprehensive, subscription-based analytics service providing deep market intelligence for Ghana's real estate and construction sectors. This document consolidates all analytics capabilities across five major domains:

1. **Construction & Labour Analytics** - Real-time cost monitoring and forecasting
2. **Housing Affordability Index (GHAI)** - Multi-path affordability measurement
3. **Valuation Analytics** - Portfolio-level valuation insights and benchmarking
4. **Market Intelligence Analytics** - Price trends, forecasting, and investment signals
5. **Machine Learning Analytics** - Predictive models and automated valuation insights

**Target Customers:**
- Real estate developers and investors
- Financial institutions (banks, insurance, pension funds)
- Government agencies (Bank of Ghana, Ministry of Housing)
- International development organizations
- Property management companies
- Construction firms and contractors

---

## Table of Contents

1. [Construction & Labour Analytics](#1-construction--labour-analytics)
2. [Housing Affordability Index (GHAI)](#2-housing-affordability-index-ghai)
3. [Valuation Analytics](#3-valuation-analytics)
4. [Market Intelligence Analytics](#4-market-intelligence-analytics)
5. [Commercial Property Monitor](#5-commercial-property-monitor) ⭐ **NEW**
6. [Investment & Transaction Analytics](#6-investment--transaction-analytics) ⭐ **NEW**
7. [Ghana-Specific Analytics](#7-ghana-specific-analytics) ⭐ **NEW**
8. [Machine Learning Analytics](#8-machine-learning-analytics)
   - 8.7 [Centralized ML/NLP Services](#87-centralized-mlnlp-services) **Shared Services Layer**
9. [Advanced Risk & Specialized Asset Analytics](#9-advanced-risk--specialized-asset-analytics) ⭐ **NEW**
10. [Data Sources & Integration](#10-data-sources--integration)
11. [API Endpoints](#11-api-endpoints)
12. [Database Schema](#12-database-schema)
13. [UI/UX Design](#13-uiux-design)
14. [Implementation Roadmap](#14-implementation-roadmap)

> **Architecture Principle**: All analytics domains integrate with the **Centralized ML/NLP Services** layer. PropMetrik provides CBRE/RICS/JLL-grade analytics purpose-built for Ghana.

---

## 1. Construction & Labour Analytics

### 1.1 Construction Cost Index Dashboard

**Primary KPI: National Construction Cost Index**
- **Current Index Value**: Display current national construction cost index with baseline comparison
- **Trend Indicators**: Monthly, quarterly, and annual percentage changes
- **Visual Elements**:
  - Large primary metric card showing current index (e.g., "1,347.50")
  - Trend arrows and percentage changes (↑12.3% YoY)
  - Sparkline showing 12-month historical trend
  - Color-coded indicators (green/red) for positive/negative changes

**Component Breakdown Analysis**
- **Material Costs (55%)**: Weighted contribution to overall index
- **Labor Costs (35%)**: Skill-based wage component analysis
- **Overhead (10%)**: Equipment, permits, and profit margins
- **Visualization**: Interactive donut chart with drill-down capabilities

```typescript
interface ConstructionCostIndex {
  national_index: number;
  baseline_date: string;
  components: {
    materials: { value: number; weight: number; change_mom: number; change_yoy: number };
    labor: { value: number; weight: number; change_mom: number; change_yoy: number };
    overhead: { value: number; weight: number; change_mom: number; change_yoy: number };
  };
  regional_indices: Record<RegionCode, number>;
  historical_trend: Array<{ date: string; value: number }>;
}
```

**Year-over-Year Comparison Metrics**
- Cost inflation rate compared to general CPI
- Real vs nominal cost changes
- Seasonal adjustment factors
- Construction purchasing power analysis

### 1.2 Regional Cost Comparison Matrix

**Regional Heatmap Visualization**
- **16-Region Coverage**: All administrative regions of Ghana
- **Cost Multipliers**: Range from 0.75x (Upper West) to 1.15x (Greater Accra)
- **Interactive Features**:
  - Click-to-drill-down regional details
  - Hover tooltips with exact multipliers
  - Toggle between absolute costs and multipliers
  - Historical comparison slider

**Regional Rankings Dashboard**

| Rank | Region | Multiplier | YoY Change |
|------|--------|------------|------------|
| 1 | Greater Accra | 1.15x | +2.3% |
| 2 | Ashanti | 1.08x | +1.8% |
| 3 | Western | 1.02x | +1.5% |
| ... | ... | ... | ... |
| 16 | Upper West | 0.75x | +0.9% |

**Transport Impact Analysis**
- **Distance-Based Cost Model**: Show how kilometers from Tema Port affect costs
- **Logistics Cost Mapping**: Fuel costs, transport time, and accessibility
- **Supply Chain Efficiency**: Regional infrastructure quality impact

```typescript
interface RegionalCostData {
  region: RegionCode;
  multiplier: number;
  distance_from_port_km: number;
  transport_factor: number;
  infrastructure_score: number;
  cost_components: {
    materials: number;
    labor: number;
    transport: number;
  };
  trend_6m: number;
  trend_12m: number;
}
```

### 1.3 Material Cost Analytics

**Individual Material Tracking**

| Material | Local % | Import % | Price Volatility | YoY Change |
|----------|---------|----------|------------------|------------|
| Cement | 60% | 40% | Low | +8.2% |
| Steel/Rebar | 20% | 80% | High | +15.7% |
| Aggregates | 90% | 10% | Low | +3.1% |
| Timber | 75% | 25% | Medium | +6.4% |
| Electrical | 15% | 85% | High | +12.8% |
| Plumbing | 25% | 75% | Medium | +9.3% |

**Import vs Local Component Analysis**
- **Exchange Rate Sensitivity**: USD/GHS impact on imported materials
- **Local Production Capacity**: Domestic supply chain analysis
- **Price Volatility Dashboard**: Standard deviation and coefficient of variation
- **Commodity Correlation**: International commodity price tracking

### 1.4 Labor Market Analytics

**Skill-Based Wage Analysis**

| Skill Level | Daily Rate (GHS) | Monthly (GHS) | YoY Change | Supply Status |
|-------------|------------------|---------------|------------|---------------|
| Unskilled | 80-120 | 2,000-3,000 | +12% | Adequate |
| Semi-skilled | 150-200 | 3,750-5,000 | +15% | Moderate |
| Skilled (Mason) | 250-350 | 6,250-8,750 | +18% | Shortage |
| Skilled (Electrician) | 300-400 | 7,500-10,000 | +20% | Critical |
| Supervisor | 400-600 | 10,000-15,000 | +10% | Adequate |

**Employment Structure Analytics**
- Construction employment share of total industry
- Skills distribution: 45% skilled, 45% unskilled, 10% supervision
- Labor force participation by region
- Unemployment impact on wage levels

**Productivity Indicators**
- GDP per capita correlation
- Output per worker measurements
- Skills premium analysis
- Training ROI metrics

### 1.5 Economic Drivers Dashboard

**Exchange Rate Impact Analysis**
- USD/GHS correlation with construction costs
- Import price pass-through lag (typically 2-3 months)
- Hedging strategy recommendations
- Historical sensitivity: 1% depreciation = 0.6% cost increase

**Inflation Correlation Matrix**
- CPI vs Construction Cost Index comparison
- Sector-specific inflation rates
- Real cost analysis (inflation-adjusted)
- Purchasing power erosion tracking

**GDP Construction Share Trends**
- Construction value-added as % of GDP
- Growth patterns vs overall economy
- Cyclical analysis (leading/lagging indicator)
- Investment flow tracking

### 1.6 Predictive Analytics

**Seasonal Pattern Recognition**
- Monthly seasonality (dry vs wet season)
- Quarterly business cycle impact
- Holiday effects on labor costs
- Weather correlation analysis

**Economic Forecasting Models**
- WDI-based prediction models
- Leading indicator analysis
- 3-6-12 month forecasts
- Confidence intervals

**Risk Indicators and Alerts**
- Threshold monitoring (>5% deviation alerts)
- Early warning system for cost spikes
- Supply chain disruption detection
- Economic shock identification

### 1.7 ML/NLP Integration (Centralized Services)

**News Sentiment Analysis**
- Monitor construction-related news sentiment
- Track mentions of "material shortage", "labor shortage", "price increase"
- Correlate news sentiment with actual cost index changes
- Early warning: Negative sentiment spikes often precede cost increases

```typescript
// Integration with Centralized ML/NLP Services
import { SentimentAnalysisService } from '@/services/ml_nlp';

function getConstructionMarketSentiment(region: RegionCode): Promise<SentimentMetrics> {
  const sentimentService = new SentimentAnalysisService();
  
  // Analyze construction news from past 30 days
  return sentimentService.analyzeBatch({
    source: 'news',
    keywords: ['construction', 'building materials', 'labor costs'],
    region,
    period: '30d'
  });
}

// Use sentiment to enhance forecasting
function enhancedCostForecast(region: RegionCode) {
  const sentiment = await getConstructionMarketSentiment(region);
  const numericalForecast = calculateBaseForecast(region);
  
  // Adjust forecast based on sentiment
  const sentimentAdjustment = sentiment.score * 0.1; // Max ±10% adjustment
  const adjustedForecast = numericalForecast * (1 + sentimentAdjustment);
  
  return {
    base_forecast: numericalForecast,
    sentiment_adjusted: adjustedForecast,
    confidence: sentiment.confidence,
    key_factors: sentiment.aspects.map(a => a.key_phrases).flat()
  };
}
```

**Document Intelligence for Construction Bids**
- Extract material quantities and unit prices from bid documents
- Compare bids automatically
- Flag anomalies (suspiciously low/high prices)
- Track regional bid pricing patterns

**Use Cases:**
1. **Sentiment-Enhanced Forecasting**: Combine numerical models with news sentiment
2. **Automated Bid Processing**: Extract and compare construction bids via NLP
3. **Crisis Detection**: Identify "material shortage" mentions before price spikes
4. **Contractor Intelligence**: Track which contractors are bidding where

---

## 2. Housing Affordability Index (GHAI)

### 2.1 Framework Overview

The Ghana Housing Affordability Index (GHAI) is a proprietary, multi-dimensional metric designed for Ghana's unique market conditions:

- **Multiple Purchase Paths**: Mortgage, cash, and rent-to-own
- **Informal Income**: Large informal sector requires proxy methodologies
- **High Interest Rates**: 28-35% mortgage rates fundamentally change calculations
- **Cash Dominance**: 60-70% of transactions are cash-funded

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
│   │  sector buyers  │  │  buyers (60%+   │  │  (40%+ of HH)   │   │
│   │  (~10-15%)      │  │  of market)     │  │                 │   │
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

### 2.2 Regional Weight Matrix

| Region | Mortgage (w₁) | Cash (w₂) | Rental (w₃) |
|--------|---------------|-----------|-------------|
| Greater Accra | 0.25 | 0.45 | 0.30 |
| Kumasi Metro | 0.15 | 0.55 | 0.30 |
| Eastern Region | 0.10 | 0.60 | 0.30 |
| Western Cluster | 0.12 | 0.58 | 0.30 |
| Northern Cluster | 0.05 | 0.65 | 0.30 |

### 2.3 Core Formulas

**Mortgage-Based HAI (MHAI)**

```typescript
interface MHAIParams {
  downPaymentPct: 0.25;        // 25% down (Ghana standard)
  qualifyingRatio: 0.35;       // 35% of income max
  tenorMonths: 180;            // 15-year standard
  propertyTaxRate: 0.001;      // Annual property tax
  insuranceRate: 0.003;        // Homeowner's insurance
}

function calculateMHAI(
  medianPropertyPrice: number,
  medianHouseholdIncome: number,
  mortgageRate: number
): number {
  const monthlyHousing = calculateMonthlyHousingCost(medianPropertyPrice, mortgageRate);
  const qualifyingIncome = (monthlyHousing / 0.35) * 12;
  return (medianHouseholdIncome / qualifyingIncome) * 100;
}
```

| MHAI Value | Interpretation |
|------------|----------------|
| ≥ 100 | Median household can qualify for median home |
| 80 – 99 | Marginally unaffordable |
| 50 – 79 | Significantly unaffordable |
| < 50 | Severely unaffordable |

**Cash-Based HAI (CHAI)**

```typescript
function calculateCHAI(
  medianPropertyPrice: number,
  medianHouseholdIncome: number,
  savingsRate: number = 0.20,
  savingsHorizonYears: number = 10
): { chai: number; yearsToSave: number; pir: number } {
  const priceToIncomeRatio = medianPropertyPrice / medianHouseholdIncome;
  const annualSavings = medianHouseholdIncome * savingsRate;
  const yearsToSave = medianPropertyPrice / annualSavings;
  const chai = (savingsHorizonYears / yearsToSave) * 100;
  
  return { chai, yearsToSave, pir: priceToIncomeRatio };
}
```

| CHAI Value | Years to Save | Interpretation |
|------------|---------------|----------------|
| ≥ 100 | ≤ 10 years | Achievable within reasonable horizon |
| 70 – 99 | 10-14 years | Stretched but possible |
| 50 – 69 | 14-20 years | Difficult without external help |
| < 50 | > 20 years | Practically unattainable |

**Rental Affordability Index (RHAI)**

```typescript
function calculateRHAI(
  medianMonthlyRent: number,
  medianMonthlyIncome: number,
  advanceMonths: number = 12  // Ghana typically 1-2 years advance
): { rhai: number; rentToIncomeRatio: number } {
  const rentToIncomeRatio = medianMonthlyRent / medianMonthlyIncome;
  const targetRatio = 0.30;  // 30% threshold
  const rhai = (targetRatio / rentToIncomeRatio) * 100;
  
  return { rhai, rentToIncomeRatio };
}
```

| RHAI Value | Rent Burden | Interpretation |
|------------|-------------|----------------|
| ≥ 100 | < 30% | Affordable |
| 80 – 99 | 30-37% | Moderately Burdened |
| 60 – 79 | 38-50% | Severely Burdened |
| < 60 | > 50% | Critically Burdened |

### 2.4 Supplementary Indices

**Construction Affordability Index (CAI)**
- Measures ability to build rather than buy
- Considers land cost + construction cost vs income
- Important for self-build market (common in Ghana)

**Land Affordability Index (LAI)**
- Tracks land price trends relative to income
- Regional breakdown by development potential
- Speculative vs development land differentiation

**Mortgage Accessibility Score (MAS)**
- Percentage of households that can qualify for mortgage
- Considers: formal employment, credit history, DTI ratio
- Example: Greater Accra MAS = 4.7% (only ~5% can access mortgages)

### 2.5 GHAI Dashboard Components

```
┌─────────────────────────────────────────────────────────────────┐
│                 HOUSING AFFORDABILITY DASHBOARD                  │
├─────────────────────┬─────────────────────┬─────────────────────┤
│   COMPOSITE GHAI    │   REGIONAL MAP      │   TREND CHART       │
│       67.3         │   [Ghana heatmap]   │   ▼ -3.2% YoY      │
│    ⚠️ UNAFFORDABLE  │   Accra: 45.2       │   ████████░░        │
│                     │   Kumasi: 72.1      │                     │
├─────────────────────┼─────────────────────┼─────────────────────┤
│      MHAI: 23.4     │     CHAI: 58.7      │     RHAI: 71.2      │
│   💳 Mortgage       │   💵 Cash           │   🏠 Rental          │
│   SEVERELY UNAFFORD │   STRETCHED         │   MODERATE BURDEN   │
├─────────────────────┴─────────────────────┴─────────────────────┤
│   SUPPLEMENTARY INDICES                                         │
│   CAI: 82.3 (Build)  │  LAI: 34.5 (Land)  │  MAS: 4.7% (Access) │
└─────────────────────────────────────────────────────────────────┘
```

### 2.6 ML/NLP Integration (Centralized Services)

**Affordability Crisis Detection**
- Monitor mentions of "housing crisis", "rent burden", "eviction"
- Track sentiment around "affordable housing" policies
- Detect early warning signals via language patterns

```typescript
// Detect affordability crisis via trend analysis
import { TrendAnalysisService } from '@/services/ml_nlp';

async function detectAffordabilityCrisis() {
  const trendService = new TrendAnalysisService();
  
  const trends = await trendService.analyze({
    keywords: ['housing crisis', 'affordability', 'rent burden', 'eviction'],
    time_range: { start_date: '2025-10-01', end_date: '2026-01-01' },
    source: 'all'
  });
  
  // Crisis detected if:
  // 1. Mention spike (>2x baseline)
  // 2. Negative sentiment
  // 3. Multiple keywords trending
  const crisisDetected = trends.trending_topics.filter(
    t => t.change_pct > 100 && t.sentiment < -0.3
  ).length >= 2;
  
  return {
    crisis_detected: crisisDetected,
    severity: calculateSeverity(trends),
    affected_regions: extractRegions(trends),
    trending_concerns: trends.emerging_trends
  };
}
```

**Policy Impact Analysis**
- Analyze Bank of Ghana / government housing policy announcements
- Predict impact on affordability via sentiment analysis
- Track public reaction to new policies

**Use Cases:**
1. **Early Warning System**: Detect affordability crises before they appear in official stats
2. **Policy Monitoring**: Track "national housing policy" sentiment and impact
3. **Public Sentiment**: Gauge whether housing is becoming a political issue

---

## 3. Valuation Analytics

### 3.1 Portfolio Valuation Analytics

**Valuation Volume Metrics**

| Metric | Description | Visualization |
|--------|-------------|---------------|
| Total Valuations | Count by period (daily/weekly/monthly) | Time series chart |
| Value Distribution | Histogram of valuation values | Distribution curve |
| Regional Distribution | Valuations by region | Choropleth map |
| Property Type Mix | Breakdown by property type | Donut chart |
| Purpose Analysis | Mortgage, insurance, sale, etc. | Bar chart |

```typescript
interface ValuationVolumeMetrics {
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  total_count: number;
  total_value_ghs: number;
  avg_value_ghs: number;
  median_value_ghs: number;
  by_region: Record<RegionCode, { count: number; value: number }>;
  by_property_type: Record<PropertyType, { count: number; value: number }>;
  by_purpose: Record<ValuationPurpose, { count: number; value: number }>;
  by_method: Record<ValuationMethod, { count: number; avg_weight: number }>;
}
```

### 3.2 Valuation Accuracy & Quality

**Method Performance Analytics**

| Method | Avg Confidence | Weight Distribution | Accuracy vs Actual |
|--------|----------------|---------------------|-------------------|
| Sales Comparison | 82.3% | 55% primary | ±8.2% |
| Cost Approach | 71.5% | 25% primary | ±12.1% |
| Income Approach | 76.8% | 15% primary | ±9.7% |
| DRC | 68.2% | 5% primary | ±15.3% |

**RICS Red Book Compliance Audit**
- **Process Compliance**: Tracks adherence to IVS/RICS VPS 1-5 standards.
- **Reporting Standards**: Automatic flagging of reports missing mandatory RICS disclosures.
- **Conflict Checks**: Automated conflict of interest detection log.

```typescript
interface RICSComplianceMetrics {
  valuation_id: string;
  is_red_book_compliant: boolean;
  compliance_score: number;        // 0-100
  missing_disclosures: string[];    // e.g., "Special Assumptions", "Liability Cap"
  valuer_accreditation_valid: boolean;
}
```

**Comparable Quality Metrics**
- Average comparables per valuation
- Similarity score distribution
- Adjustment range analysis
- Time-to-sale freshness

```typescript
interface ValuationQualityMetrics {
  period: string;
  
  // Method performance
  method_stats: Record<ValuationMethod, {
    count: number;
    avg_confidence: number;
    avg_weight: number;
    value_range: { min: number; max: number };
  }>;
  
  // Comparable analytics
  comparable_stats: {
    avg_per_valuation: number;
    median_similarity_score: number;
    avg_adjustment_pct: number;
    freshness_days_avg: number;
  };
  
  // Reconciliation analytics
  reconciliation_stats: {
    avg_spread_pct: number;  // Spread between methods
    override_rate: number;   // How often valuers override system
    confidence_correlation: number;
  };
}
```

### 3.3 Valuer Performance Analytics

**Individual Valuer Metrics**

| Metric | Description |
|--------|-------------|
| Valuation Count | Total valuations completed |
| Avg Time to Complete | Average days from start to final |
| Override Rate | % of system recommendations overridden |
| Confidence Distribution | How confident are their valuations |
| Accuracy vs Resale | Comparison to actual transaction prices |

**Team/Organization Analytics**
- Throughput by team
- Quality benchmarking
- Regional specialization
- Client satisfaction correlation

```typescript
interface ValuerPerformanceMetrics {
  valuer_id: string;
  period: string;
  
  volume: {
    total_valuations: number;
    by_property_type: Record<PropertyType, number>;
    by_region: Record<RegionCode, number>;
  };
  
  quality: {
    avg_confidence: number;
    avg_time_to_complete_days: number;
    override_rate: number;
    accuracy_vs_resale: number | null;
  };
  
  comparable_usage: {
    avg_comparables_used: number;
    auto_vs_manual_selection_ratio: number;
  };
  
  peer_comparison: {
    percentile_volume: number;
    percentile_quality: number;
    percentile_speed: number;
  };
}
```

### 3.4 Market-Relative Valuation Analytics

**Price Position Analysis**
- Valuations vs market median (by region/type)
- Premium/discount distribution
- Outlier detection and flagging

**Trend Alignment**
- Are valuations tracking market trends?
- Leading/lagging indicator analysis
- Forecast accuracy over time

```typescript
interface MarketRelativeAnalytics {
  region: RegionCode;
  property_type: PropertyType;
  period: string;
  
  price_position: {
    valuations_median: number;
    market_median: number;
    premium_discount_pct: number;
    distribution: Array<{ bucket: string; count: number }>;
  };
  
  trend_alignment: {
    valuation_trend_3m: number;
    market_trend_3m: number;
    correlation: number;
    lag_days: number;
  };
  
  outliers: {
    high_count: number;
    low_count: number;
    outlier_rate: number;
  };
}
```

### 3.5 Floor Plan & Measurement Analytics

**GFA/NIA Analysis**
- Distribution of building sizes by type
- Efficiency ratio benchmarks
- Regional size variations

**Room Composition Analytics**
- Average room counts by property type
- Room size distributions
- Ghana Building Code compliance rates

```typescript
interface FloorPlanAnalytics {
  property_type: PropertyType;
  region: RegionCode;
  
  area_metrics: {
    avg_gfa_sqm: number;
    median_gfa_sqm: number;
    avg_nia_sqm: number;
    avg_efficiency_ratio: number;
    distribution: Array<{ range: string; count: number }>;
  };
  
  room_metrics: {
    avg_bedrooms: number;
    avg_bathrooms: number;
    avg_room_size_sqm: Record<RoomType, number>;
  };
  
  compliance: {
    code_compliant_rate: number;
    common_violations: Array<{ type: string; count: number }>;
  };
}
```

### 3.6 Sensitivity Analysis Analytics

**Value Driver Impact Analysis**

| Driver | Avg Impact | Most Sensitive Property Types |
|--------|------------|------------------------------|
| Location | ±35% | Residential, Commercial |
| Size (GFA) | ±25% | All types |
| Age/Condition | ±20% | Residential |
| Cap Rate | ±15% | Commercial, Investment |
| Construction Cost | ±18% | New/Proposed |
| Land Value | ±22% | Development sites |

**Scenario Analysis**
- Best/worst case value ranges
- Monte Carlo simulation results
- Key assumption sensitivity

### 3.7 ML/NLP Integration (Centralized Services)

**Automated Property Data Extraction**
- Extract property details from listing PDFs/emails
- Auto-populate valuation requests
- Reduce manual data entry time by 80%

```typescript
// Extract property from listing document
import { DocumentIntelligenceService } from '@/services/ml_nlp';

async function createValuationFromListing(listingPdfUrl: string) {
  const docService = new DocumentIntelligenceService();
  
  const extracted = await docService.process({
    document_url: listingPdfUrl,
    document_type: 'listing',
    extract_tables: true
  });
  
  const property = extracted.extracted_data.property;
  
  // Automatically create valuation request
  return createValuation({
    address: property.address,
    property_type: property.property_type,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    gfa_sqm: property.gfa_sqm,
    asking_price: property.price,
    source: 'listing_extraction'
  });
}
```

**Market Report Mining for Comparables**
- Extract comparable sales from market reports (PDFs)
- Identify recent transactions mentioned in news
- Expand comparable database automatically

**Valuer Report Quality Analysis**
- Analyze text quality of valuation reports
- Extract key assumptions and caveats
- Flag reports with missing sections

**Use Cases:**
1. **Bulk Import**: Process 100s of property listings via document intel
2. **Comparable Discovery**: Find comparables mentioned in news/reports
3. **Quality Assurance**: Analyze valuer report completeness and clarity

---

## 4. Market Intelligence Analytics

### 4.1 Price Index Analytics

**Property Price Index (PPI)**
- Regional price indices (base = 100)
- Property type sub-indices
- Monthly/quarterly/annual changes
- Real vs nominal adjustments

```typescript
interface PropertyPriceIndex {
  region: RegionCode;
  property_type: PropertyType;
  period: string;
  
  index_value: number;
  base_period: string;
  change_mom: number;
  change_qoq: number;
  change_yoy: number;
  
  real_index: number;  // Inflation-adjusted
  nominal_index: number;
  
  sub_indices: {
    new_builds: number;
    resales: number;
    rental: number;
  };
}
```

### 4.2 Market Activity Analytics

**Transaction Volume Metrics**
- Monthly transaction counts
- Value turnover
- Days on market trends
- Listing vs transaction ratio

**Supply/Demand Indicators**
- New listings rate
- Absorption rate
- Inventory months
- Price negotiation margins

```typescript
interface MarketActivityMetrics {
  region: RegionCode;
  property_type: PropertyType;
  period: string;
  
  transactions: {
    count: number;
    total_value_ghs: number;
    avg_value_ghs: number;
    change_mom: number;
  };
  
  listings: {
    new_listings: number;
    active_listings: number;
    avg_days_on_market: number;
    listing_to_sale_ratio: number;
  };
  
  supply_demand: {
    absorption_rate: number;
    inventory_months: number;
    avg_discount_pct: number;
  };
}
```

### 4.3 Rental Market Analytics

**Rental Price Tracking**
- Median rents by region/type/size
- Rental yield calculations
- Vacancy rate estimates
- Rent-to-price ratios

**Rental Comparable Analytics**
- Available rental comparables
- Rent per sqm benchmarks
- Amenity premiums

```typescript
interface RentalMarketAnalytics {
  region: RegionCode;
  property_type: PropertyType;
  
  rental_prices: {
    median_monthly_rent: number;
    avg_rent_per_sqm: number;
    change_yoy: number;
    range: { min: number; max: number };
  };
  
  yields: {
    gross_yield: number;
    net_yield_estimate: number;
    yield_trend_12m: number;
  };
  
  market_conditions: {
    vacancy_rate_estimate: number;
    avg_lease_term_months: number;
    advance_rent_months: number;
  };
}
```

### 4.4 Investment Opportunity Analytics

**Yield Analysis**
- Cap rate trends by region/type
- Risk-adjusted return metrics
- Comparison to alternative investments

**Emerging Markets Identification**
- Price growth hotspots
- Infrastructure development impact
- Gentrification indicators

```typescript
interface InvestmentAnalytics {
  region: RegionCode;
  
  yield_metrics: {
    avg_cap_rate: number;
    cap_rate_trend: number;
    risk_premium_vs_tbill: number;
    sharpe_ratio_estimate: number;
  };
  
  growth_indicators: {
    price_growth_12m: number;
    price_growth_36m: number;
    rental_growth_12m: number;
    infrastructure_score: number;
  };
  
  opportunity_score: number;  // 0-100 composite score
  opportunity_factors: Array<{ factor: string; contribution: number }>;
}
```

### 4.5 ML/NLP Integration (Centralized Services) - **Primary Consumer**

Market Intelligence is the **primary consumer** of centralized ML/NLP services:

**Market Confidence Index (Sentiment-Driven)**
```typescript
import { SentimentAnalysisService, TrendAnalysisService } from '@/services/ml_nlp';

async function calculateMarketConfidenceIndex(region: RegionCode) {
  const sentimentService = new SentimentAnalysisService();
  const trendService = new TrendAnalysisService();
  
  const newsSentiment = await sentimentService.analyzeBatch({
    source: 'news',
    keywords: ['property market', 'real estate', 'housing'],
    region,
    period: '30d'
  });
  
  const trends = await trendService.analyze({
    keywords: ['buyer', 'seller', 'investment', 'price drop', 'price surge'],
    time_range: { start_date: '30d_ago', end_date: 'today' }
  });
  
  return {
    confidence_index: newsSentiment.overall_score * 0.5 + trends.sentiment_avg * 0.5,
    news_component: newsSentiment.overall_score,
    trend_component: trends.sentiment_avg,
    key_drivers: newsSentiment.aspects.slice(0, 3)
  };
}
```

**Investment Opportunity Discovery via NER**
```typescript
import { NERService, SentimentAnalysisService } from '@/services/ml_nlp';

async function findInvestmentOpportunities() {
  const nerService = new NERService();
  const news = await fetchNews({ keywords: ['new development', 'infrastructure'] });
  
  return Promise.all(news.map(async (article) => {
    const entities = await nerService.extract({ text: article.text });
    const sentiment = await sentimentService.analyze({ text: article.text });
    
    if (sentiment.score > 0.5 && entities.entities.locations.length > 0) {
      return {
        location: entities.entities.locations[0].standardized_name,
        developer: entities.entities.organizations[0]?.text,
        sentiment_score: sentiment.score
      };
    }
  }));
}
```

**Natural Language Market Queries (AI Assistant)**
```typescript
import { MarketIntelligenceAssistant } from '@/services/ml_nlp';

// Example queries: "What's the avg price of 3-bed apartments in East Legon?"
async function queryMarketData(userQuery: string) {
  const assistant = new MarketIntelligenceAssistant();
  return assistant.query({ query: userQuery, response_format: 'both' });
}
```

**Use Cases Summary:**
| Use Case | Centralized Service |
|----------|---------------------|
| Market Confidence Index | Sentiment + Trends |
| Investment Discovery | NER + Sentiment |
| Natural Language Queries | AI Assistant |
| Competitive Intelligence | NER + Trends |
| Automated Reports | AI Assistant |

---

## 5. Commercial Property Monitor

> **Industry Standard**: Based on RICS Commercial Property Market Survey methodology, providing forward-looking indicators for institutional investors and market participants.

### 5.1 Occupier Demand Index

**Purpose**: Track tenant demand trends across commercial property sectors in Ghana.

**Metrics by Sector**:

| Sector | Sub-Categories |
|--------|----------------|
| **Office** | Prime CBD (Accra Central), Grade A (Airport City), Grade B (Osu/Labone), Flexible/Co-working |
| **Retail** | Mall (Accra Mall, West Hills), High Street, Neighborhood, Market-Adjacent |
| **Industrial** | Warehouse (Tema), Manufacturing, Logistics/Last-Mile, Cold Storage |
| **Hospitality** | Hotels (5-star, 3-star), Serviced Apartments, Short-Stay |

```typescript
interface OccupierDemandIndex {
  sector: 'office' | 'retail' | 'industrial' | 'hospitality';
  sub_category: string;
  region: RegionCode;
  period: string;
  
  demand_index: number;              // -100 to +100 (net balance)
  change_qoq: number;
  trend_direction: 'rising' | 'stable' | 'falling';
  
  factors: {
    new_enquiries: number;           // Count of new tenant enquiries
    conversion_rate: number;         // Enquiry to lease %
    expansion_demand: number;        // Existing tenants seeking more space
    contraction_risk: number;        // Existing tenants downsizing
  };
  
  ml_sentiment_correlation: number;  // Link to centralized sentiment service
}
```

### 5.2 Rent Expectations (12-Month Forward)

**Purpose**: Provide forward-looking rent projections by sector and region.

```typescript
interface RentExpectations {
  sector: string;
  region: RegionCode;
  property_type: PropertyType;
  
  current_rent_psqm: number;          // GHS per sqm per month
  expected_rent_12m: number;          // 12-month projection
  expected_change_pct: number;
  confidence: number;
  
  breakdown: {
    prime_locations: { current: number; forecast: number };
    secondary_locations: { current: number; forecast: number };
  };
  
  drivers: Array<{
    factor: string;                   // e.g., "New office supply", "Diaspora demand"
    impact: 'positive' | 'negative';
    magnitude: number;
  }>;
}
```

### 5.3 Capital Value Expectations

**Purpose**: Track expected price direction for each sector over next 12 months.

```typescript
interface CapitalValueExpectations {
  sector: string;
  region: RegionCode;
  period: string;
  
  expectation_index: number;          // -100 to +100
  interpretation: 'strong_growth' | 'moderate_growth' | 'stable' | 'decline';
  expected_change_pct: number;
  
  by_property_type: Record<PropertyType, {
    expectation: number;
    confidence: number;
  }>;
  
  historical_accuracy: number;        // How accurate past forecasts were
}
```

### 5.4 Investment Enquiries Index

**Purpose**: Track institutional investor interest and capital flows.

```typescript
interface InvestmentEnquiriesIndex {
  region: RegionCode;
  period: string;
  
  enquiries_index: number;            // 0-100 scale
  change_qoq: number;
  
  investor_types: {
    institutional_local: number;      // Pension funds, insurance
    institutional_foreign: number;    // DFIs, private equity
    high_net_worth: number;           // Individual investors
    diaspora: number;                 // Ghanaians abroad
  };
  
  preferred_sectors: Array<{
    sector: string;
    interest_score: number;
    avg_ticket_size_ghs: number;
  }>;
  
  source_countries: Array<{
    country: string;
    enquiry_share: number;
  }>;
}
```

### 5.5 Incentive Packages Tracker

**Purpose**: Monitor landlord incentives offered to tenants (indicator of market conditions).

```typescript
interface IncentivePackages {
  sector: string;
  region: RegionCode;
  period: string;
  
  avg_rent_free_months: number;       // Months of free rent offered
  avg_fitout_contribution_pct: number; // % of fit-out covered by landlord
  avg_discount_from_asking: number;   // Negotiation margin
  
  trend: 'increasing' | 'stable' | 'decreasing';
  market_condition: 'tenant_favored' | 'balanced' | 'landlord_favored';
  
  by_grade: Record<string, {
    rent_free_months: number;
    fitout_contribution: number;
  }>;
}
```

### 5.6 Service Charge Monitor (OCM)
**Purpose**: Benchmark operating costs (Service Charges) for strata-title and commercial properties.
- **Metrics**: GHS/USD per sqm/month.
- **Components**: Security, Cleaning, Power (Gen Set), Water, Management Fee.
- **Analysis**: "Total Cost of Occupancy" (Rent + Service Charge) visualization.

```typescript
interface ServiceChargeAnalytics {
  property_grad: 'A' | 'B' | 'C';
  avg_service_charge_psqm: number;
  charge_components_breakdown: Record<string, number>;
  collection_rate: number;          // % of tenants paying on time
}
```

### 5.7 Availability Index

**Purpose**: Track supply of commercial space available by sector.

```typescript
interface AvailabilityIndex {
  sector: string;
  region: RegionCode;
  period: string;
  
  available_sqm: number;
  vacancy_rate: number;
  months_of_supply: number;           // Time to absorb current vacancy
  
  new_supply_pipeline: {
    under_construction_sqm: number;
    expected_delivery_12m: number;
    expected_delivery_24m: number;
  };
  
  absorption_rate: number;            // sqm absorbed per month
  net_absorption_trend: 'positive' | 'negative' | 'stable';
}
```

### 5.8 ML/NLP Integration for Commercial Monitor

```typescript
// Link to centralized sentiment service for market commentary
import { SentimentAnalysisService, TrendAnalysisService } from '@/services/ml_nlp';

async function enhanceCPMWithSentiment(sector: string, region: RegionCode) {
  const sentimentService = new SentimentAnalysisService();
  
  const sectorSentiment = await sentimentService.analyzeBatch({
    source: 'news',
    keywords: [sector, 'commercial', 'lease', 'office', 'retail'],
    region,
    period: '30d'
  });
  
  return {
    qualitative_outlook: sectorSentiment.overall,
    key_themes: sectorSentiment.aspects.map(a => a.key_phrases).flat(),
    sentiment_score: sectorSentiment.score
  };
}
```

---

## 6. Investment & Transaction Analytics

> **Industry Standard**: Based on CBRE Vantage Analytics and JLL Investment Performance methodologies.

### 6.1 Investment Performance Benchmarks

**Purpose**: Track total returns for property investment in Ghana.

```typescript
interface InvestmentPerformance {
  sector: string;
  region: RegionCode;
  period: string;
  
  total_return: number;              // Income + capital growth %
  income_return: number;             // Net rental yield %
  capital_growth: number;            // Price appreciation %
  
  risk_metrics: {
    volatility: number;              // Standard deviation of returns
    sharpe_ratio: number;            // Risk-adjusted return
    max_drawdown: number;            // Largest peak-to-trough decline
  };
  
  comparison: {
    vs_inflation: number;            // Real return
    vs_tbill: number;                // Premium over T-bills
    vs_stock_market: number;         // Comparison to GSE index
  };
  
  by_property_type: Record<PropertyType, {
    total_return: number;
    income_return: number;
    capital_growth: number;
  }>;
}
```

### 6.2 Peer Portfolio Benchmarking

**Purpose**: Allow investors to compare their portfolio against market benchmarks.

```typescript
interface PortfolioBenchmark {
  portfolio_id: string;
  period: string;
  
  portfolio_metrics: {
    total_value_ghs: number;
    property_count: number;
    avg_occupancy_rate: number;
    avg_yield: number;
    total_return: number;
  };
  
  benchmark_comparison: {
    market_median: {
      avg_yield: number;
      total_return: number;
      occupancy_rate: number;
    };
    percentile_rank: number;         // 0-100 (higher is better)
    outperformance_pct: number;
  };
  
  recommendations: Array<{
    action: string;
    rationale: string;
    expected_impact: number;
  }>;
}
```

### 6.3 Transaction Velocity Analytics

**Purpose**: Track market liquidity and transaction pace.

```typescript
interface TransactionVelocity {
  region: RegionCode;
  property_type: PropertyType;
  period: string;
  
  avg_days_on_market: number;        // Time from listing to sale
  median_days_on_market: number;
  trend_vs_prior_period: number;
  
  bid_ask_spread: {
    avg_listing_price: number;
    avg_closing_price: number;
    spread_pct: number;              // Gap between ask and close
  };
  
  negotiation_margin: {
    avg_discount_pct: number;        // Discount from initial asking
    negotiation_rounds: number;      // Avg rounds of negotiation
  };
  
  by_price_band: Record<string, {    // "0-500K", "500K-1M", "1M+"
    avg_days_on_market: number;
    transaction_volume: number;
  }>;
  
  listing_metrics: {
    new_listings_count: number;
    withdrawn_listings: number;
    price_revision_rate: number;     // % of listings with price changes
    listing_to_sale_ratio: number;
  };
}
```

### 6.4 Location Intelligence & Site Selection

**Purpose**: CBRE-style GIS-powered analytics for developers and retailers.

```typescript
interface LocationIntelligence {
  location: GeoCoordinates;
  radius_km: number;
  
  demographics: {
    population: number;
    households: number;
    avg_household_income: number;
    income_distribution: Record<string, number>;
    age_distribution: Record<string, number>;
  };
  
  accessibility: {
    major_roads_proximity_m: number;
    public_transit_score: number;    // 0-100
    trotro_routes_nearby: number;    // Ghana-specific
    parking_availability: 'high' | 'medium' | 'low';
  };
  
  amenities_proximity: {
    schools: Array<{ name: string; distance_m: number; type: string }>;
    hospitals: Array<{ name: string; distance_m: number }>;
    markets: Array<{ name: string; distance_m: number }>;  // Makola, Kejetia
    malls: Array<{ name: string; distance_m: number }>;
  };
  
  competition: {
    similar_properties: number;       // Within radius
    avg_competitor_price: number;
    market_saturation: 'low' | 'medium' | 'high';
  };
  
  foot_traffic: {
    estimated_daily_traffic: number;
    peak_hours: string[];
    weekend_vs_weekday_ratio: number;
  };
  
  site_selection_score: number;       // 0-100 composite
}
```

### 6.5 Developer Pipeline Analytics

**Purpose**: Track active developments across Ghana.

```typescript
interface DeveloperPipeline {
  region: RegionCode;
  period: string;
  
  active_developments: {
    under_construction: number;
    in_planning: number;
    recently_completed: number;
  };
  
  pipeline_by_type: Record<PropertyType, {
    units: number;
    total_sqm: number;
    avg_unit_size: number;
  }>;
  
  top_developers: Array<{
    developer_name: string;
    active_projects: number;
    total_units: number;
    market_share_pct: number;
  }>;
  
  completion_forecast: Array<{
    quarter: string;
    expected_units: number;
    expected_sqm: number;
    confidence: number;
  }>;
  
  presales_velocity: {
    avg_presale_rate: number;        // % sold before completion
    avg_presale_price_premium: number;
  };
}
```

---

## 7. Ghana-Specific Analytics

> **Unique to PropMetrik**: Analytics addressing Ghana's specific market characteristics not found in global platforms.

### 7.1 Diaspora Investment Analytics ⭐

**Purpose**: Track investment patterns from Ghanaian diaspora (3M+ Ghanaians abroad).

```typescript
interface DiasporaInvestmentAnalytics {
  period: string;
  
  capital_flows: {
    total_inflow_ghs: number;        // Total diaspora investment
    change_yoy: number;
    share_of_total_investment: number;
  };
  
  source_countries: Array<{
    country: string;                  // USA, UK, Canada, Germany, etc.
    investment_volume_ghs: number;
    avg_ticket_size: number;
    growth_rate: number;
  }>;
  
  preferred_locations: Array<{
    location: string;                 // East Legon, Trasacco, Airport Residential
    diaspora_transaction_share: number;
    avg_price: number;
  }>;
  
  property_preferences: {
    single_family: number;            // % preference
    apartment: number;
    land: number;
    commercial: number;
  };
  
  investment_purpose: {
    personal_use: number;             // For family/retirement
    rental_income: number;
    speculation: number;
    development: number;
  };
  
  remittance_to_property_ratio: number; // % of remittances going to real estate
}
```

### 7.2 Land Market Analytics ⭐

**Purpose**: Address Ghana's critical land transparency challenges.

```typescript
interface LandMarketAnalytics {
  region: RegionCode;
  period: string;
  
  land_price_index: {
    index_value: number;
    base_period: string;
    change_yoy: number;
    price_per_acre_avg: number;
    price_per_plot_avg: number;      // Standard 70x100 or 100x100 plot
    standardized_plot_size: string;  // Normalization factor
  };
  
  title_security: {
    registered_land_pct: number;     // % with Lands Commission cert
    stool_land_pct: number;          // % stool/family land
    litigation_risk_score: number;   // 0-100 (100 = High "Landguard" risk)
    encumbrance_check_time_avg: number; // Days to verify title
  };
  
  title_security_scoring: Record<string, {
    area_name: string;
    security_score: number;          // 0-100 (100 = safest)
    risk_factors: string[];
    recommendation: string;
  }>;
  
  stool_land_mapping: Array<{
    stool_name: string;
    region: RegionCode;
    estimated_coverage_sqkm: number;
    dispute_history: 'low' | 'medium' | 'high';
  }>;
  
  land_banking_activity: {
    speculative_purchases_pct: number;
    avg_holding_period_years: number;
    hotspots: string[];               // Areas with high speculation
  };
  
  development_potential: Record<string, {
    zoning: string;
    utilities_available: boolean;
    road_access: boolean;
    potential_score: number;
  }>;
}
```

### 7.3 Infrastructure Impact Analytics ⭐

**Purpose**: Quantify how infrastructure projects affect property values.

```typescript
interface InfrastructureImpact {
  project_name: string;
  project_type: 'road' | 'rail' | 'airport' | 'port' | 'utility';
  status: 'announced' | 'under_construction' | 'completed';
  
  impact_zone: {
    radius_km: number;
    affected_neighborhoods: string[];
  };
  
  property_value_impact: {
    pre_announcement_avg_price: number;
    current_avg_price: number;
    appreciation_pct: number;
    premium_vs_non_impacted: number;
  };
  
  historical_analysis: Array<{
    similar_project: string;
    completion_year: number;
    value_impact_pct: number;
  }>;
  
  forecast: {
    expected_additional_appreciation: number;
    confidence: number;
    timeline_years: number;
  };
}

// Ghana-specific infrastructure projects
const ghanaInfrastructureProjects = [
  { name: "Accra-Tema Motorway Extension", type: "road" },
  { name: "Pokuase Interchange", type: "road" },
  { name: "Accra SkyTrain", type: "rail" },
  { name: "Tema Port Expansion", type: "port" },
  { name: "Cape Coast Airport", type: "airport" }
];
```

### 7.4 Ghana Market Transparency Index (GMTI) ⭐

**Purpose**: Ghana's own transparency benchmark based on JLL methodology.

```typescript
interface GhanaTransparencyIndex {
  period: string;
  overall_score: number;              // 1-5 scale (1 = high transparency)
  
  sub_indices: {
    investment_performance: {
      score: number;
      metrics: {
        return_benchmarks_available: boolean;
        risk_metrics_published: boolean;
        fund_reporting_standards: number;
      };
    };
    
    market_fundamentals: {
      score: number;
      metrics: {
        rent_data_availability: number;
        vacancy_data_availability: number;
        transaction_data_frequency: number;
      };
    };
    
    regulatory_legal: {
      score: number;
      metrics: {
        land_registry_digitization: number;
        tax_clarity: number;
        dispute_resolution_efficiency: number;
      };
    };
    
    transaction_process: {
      score: number;
      metrics: {
        due_diligence_standards: number;
        avg_closing_days: number;
        title_transfer_clarity: number;
      };
    };
    
    sustainability: {
      score: number;
      metrics: {
        green_certifications_available: boolean;
        energy_data_disclosure: number;
        esg_reporting_adoption: number;
      };
    };
  };
  
  comparison: {
    regional_rank_africa: number;
    global_rank: number;
    yoy_improvement: number;
  };
}
```

### 7.5 Sustainability & ESG Analytics

**Purpose**: Meet growing institutional investor requirements.

```typescript
interface ESGAnalytics {
  region: RegionCode;
  period: string;
  
  green_building_inventory: {
    total_certified: number;
    by_certification: Record<string, number>;  // LEED, EDGE, IFC Excellence
    new_certifications_ytd: number;
  };
  
  energy_performance: {
    avg_kwh_per_sqm: number;
    by_property_type: Record<PropertyType, number>;
    solar_adoption_rate: number;
    backup_power_reliance: number;    // Generator usage
  };
  
  water_usage: {
    avg_liters_per_sqm: number;
    rainwater_harvesting_rate: number;
    borehole_dependency: number;
  };
  
  carbon_footprint: {
    avg_co2_per_sqm: number;
    trend_yoy: number;
  };
  
  esg_property_scoring: Record<string, {
    property_id: string;
    environmental_score: number;
    social_score: number;
    governance_score: number;
    composite_score: number;
  }>;
}
```

### 7.6 ML/NLP Integration for Ghana-Specific Analytics

```typescript
// Diaspora sentiment tracking using centralized NLP
import { SentimentAnalysisService, NERService } from '@/services/ml_nlp';

async function trackDiasporaSentiment() {
  const sentimentService = new SentimentAnalysisService();
  
  return sentimentService.analyzeBatch({
    source: 'social_media',
    keywords: ['ghana property', 'invest ghana', 'ghana real estate', 'buy land ghana'],
    // Target diaspora social media groups
    period: '30d'
  });
}

async function extractInfrastructureProjects() {
  const nerService = new NERService();
  
  const news = await fetchNews({
    keywords: ['infrastructure', 'road construction', 'railway', 'airport']
  });
  
  return nerService.extract({
    text: news.map(n => n.text).join('\n'),
    document_type: 'news',
    extract_relationships: true
  });
}
```

---

## 8. Machine Learning Analytics

### 8.1 AVM (Automated Valuation Model) Performance

**Model Accuracy Metrics**

| Metric | Description | Target |
|--------|-------------|--------|
| MAE | Mean Absolute Error | < GHS 50,000 |
| MAPE | Mean Absolute Percentage Error | < 12% |
| RMSE | Root Mean Square Error | < GHS 75,000 |
| R² | Coefficient of Determination | > 0.85 |
| Accuracy ±10% | % within 10% of actual | > 70% |
| Accuracy ±15% | % within 15% of actual | > 85% |

```typescript
interface AVMPerformanceMetrics {
  model_version: string;
  evaluation_date: string;
  sample_size: number;
  
  accuracy: {
    mae: number;
    mape: number;
    rmse: number;
    r2_score: number;
    accuracy_within_10: number;
    accuracy_within_15: number;
    accuracy_within_20: number;
  };
  
  by_segment: Record<string, {
    sample_size: number;
    mae: number;
    mape: number;
  }>;
  
  prediction_intervals: {
    coverage_90: number;  // % of actuals within 90% CI
    coverage_95: number;
    avg_interval_width: number;
  };
}
```

### 8.2 Feature Importance Analytics

**Top Value Drivers (ML-Identified)**

| Feature | Importance | Category |
|---------|------------|----------|
| Location (lat/lon) | 28.5% | Location |
| Built Area (sqm) | 18.2% | Size |
| Region | 15.7% | Location |
| Property Type | 12.3% | Type |
| Condition Score | 8.1% | Quality |
| Year Built | 6.4% | Age |
| Bedrooms | 4.8% | Size |
| Quality Score | 3.2% | Quality |
| Amenities | 2.8% | Features |

**Feature Contribution Analysis**
- SHAP values for individual predictions
- Partial dependence plots
- Feature interaction effects

```typescript
interface FeatureImportanceAnalytics {
  model_version: string;
  
  global_importance: Array<{
    feature: string;
    importance: number;
    category: string;
  }>;
  
  interactions: Array<{
    feature_pair: [string, string];
    interaction_strength: number;
  }>;
  
  by_property_type: Record<PropertyType, Array<{
    feature: string;
    importance: number;
  }>>;
}
```

### 8.3 Prediction Confidence Analytics

**Confidence Distribution**
- High confidence (>80%): reliable predictions
- Medium confidence (60-80%): use with caution
- Low confidence (<60%): manual review recommended

**Uncertainty Quantification**
- Prediction interval widths
- Epistemic vs aleatoric uncertainty
- Data quality impact on confidence

```typescript
interface PredictionConfidenceAnalytics {
  period: string;
  
  distribution: {
    high_confidence_rate: number;    // >80%
    medium_confidence_rate: number;  // 60-80%
    low_confidence_rate: number;     // <60%
  };
  
  uncertainty_sources: {
    data_quality_impact: number;
    model_uncertainty: number;
    market_volatility_impact: number;
  };
  
  by_segment: Record<string, {
    avg_confidence: number;
    interval_width_pct: number;
  }>;
}
```

### 8.4 Model Drift & Monitoring

**Performance Over Time**
- Daily/weekly model accuracy tracking
- Drift detection alerts
- Retraining trigger thresholds

**Data Distribution Monitoring**
- Input feature distribution changes
- Target variable distribution shifts
- Anomaly detection in predictions

```typescript
interface ModelMonitoringMetrics {
  model_version: string;
  monitoring_period: string;
  
  drift_detection: {
    feature_drift_score: number;
    target_drift_score: number;
    prediction_drift_score: number;
    drift_detected: boolean;
  };
  
  performance_trend: Array<{
    date: string;
    mape: number;
    sample_size: number;
  }>;
  
  alerts: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    timestamp: string;
  }>;
}
```

### 8.5 Price Prediction Analytics

**Short-Term Forecasts (1-6 months)**
- Price direction probability
- Expected appreciation/depreciation
- Confidence intervals

**Long-Term Projections (1-3 years)**
- Scenario-based forecasts
- Economic factor integration
- Risk-adjusted projections

```typescript
interface PriceForecastAnalytics {
  region: RegionCode;
  property_type: PropertyType;
  forecast_date: string;
  
  short_term: {
    horizon_months: 6;
    expected_change_pct: number;
    direction_probability: number;  // Probability of appreciation
    confidence_interval: { low: number; high: number };
  };
  
  long_term: {
    horizon_years: 3;
    scenarios: {
      optimistic: number;
      base: number;
      pessimistic: number;
    };
    key_assumptions: string[];
  };
  
  drivers: Array<{
    factor: string;
    direction: 'positive' | 'negative';
    impact_magnitude: number;
  }>;
}
```

### 8.6 Ensemble Model Analytics

**Model Composition**
- Random Forest contribution
- Gradient Boosting (XGBoost) contribution
- Neural Network contribution
- Ensemble weights by segment

**A/B Testing Results**
- Model version comparison
- Champion vs challenger performance
- Rollout recommendations

```typescript
interface EnsembleAnalytics {
  ensemble_version: string;
  
  component_models: Array<{
    model_type: string;
    version: string;
    weight: number;
    standalone_mape: number;
  }>;
  
  ensemble_benefit: {
    ensemble_mape: number;
    best_single_mape: number;
    improvement_pct: number;
  };
  
  weight_optimization: {
    optimal_weights: Record<string, number>;
    validation_mape: number;
    last_optimized: string;
  };
}
```

---

## 8.7 Centralized ML/NLP Services

### 8.7.1 Service Architecture Overview

The Centralized ML/NLP Services layer provides unified natural language processing and machine learning capabilities to support Market Intelligence, sentiment analysis, trend extraction, and automated insights generation across all analytics domains.

```
┌─────────────────────────────────────────────────────────────────────┐
│               CENTRALIZED ML/NLP SERVICES LAYER                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│   │   SENTIMENT     │  │   NAMED ENTITY  │  │     TREND       │   │
│   │   ANALYSIS      │  │   RECOGNITION   │  │   EXTRACTION    │   │
│   │                 │  │     (NER)       │  │                 │   │
│   │  News, social   │  │  Locations,     │  │  Pattern        │   │
│   │  media, reports │  │  developers,    │  │  discovery,     │   │
│   │                 │  │  projects       │  │  forecasting    │   │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │
│            │                    │                    │             │
│            ▼                    ▼                    ▼             │
│   ┌─────────────────────────────────────────────────────────────┐ │
│   │           DOCUMENT INTELLIGENCE ENGINE                      │ │
│   │  • PDF Report Analysis     • Property Listings Extraction  │ │
│   │  • Legal Document Parsing  • Construction Bid Analysis     │ │
│   └─────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│   ┌─────────────────────────────────────────────────────────────┐ │
│   │         MARKET INTELLIGENCE AI ASSISTANT                    │ │
│   │  • Natural Language Queries  • Automated Report Generation │ │
│   │  • Investment Recommendations • Risk Alerts               │ │
│   └─────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.7.2 Sentiment Analysis Service

**Purpose**: Analyze sentiment from news articles, social media, market reports, and stakeholder communications to gauge market sentiment and confidence.

**Data Sources**:
- Ghana real estate news portals (GhanaWeb, MyJoyOnline, Graphic Online)
- Social media (Twitter/X, LinkedIn, Facebook real estate groups)
- Published market reports and analyses
- Bank of Ghana statements and policy reports
- Developer announcements and press releases

```typescript
interface SentimentAnalysisRequest {
  source: 'news' | 'social_media' | 'report' | 'policy';
  text?: string;                    // Direct text input
  url?: string;                     // URL to scrape and analyze
  document_id?: string;              // Stored document reference
  region_filter?: RegionCode;        // Filter for regional relevance
  property_type_filter?: PropertyType;
}

interface SentimentAnalysisResponse {
  request_id: string;
  analyzed_at: string;
  
  sentiment: {
    overall: 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
    score: number;                   // -1 to +1
    confidence: number;              // 0 to 1
  };
  
  aspects: Array<{
    aspect: string;                  // e.g., "housing prices", "mortgage rates"
    sentiment: number;               // -1 to +1
    mentions: number;
    key_phrases: string[];
  }>;
  
  entities: {
    locations: string[];             // Mentioned regions/cities
    developers: string[];            // Company names
    property_types: string[];
    projects: string[];
  };
  
  market_indicators: {
    bullish_signals: string[];       // Positive indicators found
    bearish_signals: string[];       // Negative indicators found
    neutral_statements: string[];
  };
  
  time_series?: Array<{             // For historical analysis
    date: string;
    sentiment_score: number;
  }>;
}
```

**ML Models**:
- **Fine-tuned BERT**: Ghana real estate domain-specific
- **Aspect-Based Sentiment**: Identify sentiment per topic (prices, demand, construction)
- **Multi-lingual Support**: English + Twi/Ga keywords

**Use Cases**:
1. **Market Confidence Index**: Aggregate sentiment scores into a weekly/monthly market sentiment index
2. **Early Warning System**: Detect negative sentiment spikes indicating market stress
3. **Investment Timing**: Correlate sentiment with price movements for timing insights
4. **Stakeholder Analysis**: Track developer/bank sentiment toward market sectors

```typescript
// Example API Usage
POST /api/v1/ml/sentiment/analyze
{
  "source": "news",
  "url": "https://ghananewsportal.com/accra-property-prices-surge",
  "region_filter": "greater_accra"
}

// Response
{
  "sentiment": {
    "overall": "positive",
    "score": 0.73,
    "confidence": 0.89
  },
  "aspects": [
    {
      "aspect": "housing_prices",
      "sentiment": 0.85,
      "mentions": 12,
      "key_phrases": ["surge in demand", "price appreciation", "strong market"]
    },
    {
      "aspect": "mortgage_rates",
      "sentiment": -0.42,
      "mentions": 5,
      "key_phrases": ["high interest", "affordability concerns"]
    }
  ]
}
```

### 8.7.3 Named Entity Recognition (NER) Service

**Purpose**: Extract structured information from unstructured text including locations, developers, projects, prices, and stakeholders.

**Entity Types**:
- **Locations**: Regions, cities, neighborhoods, landmarks
- **Organizations**: Developers, construction firms, banks, government agencies
- **Projects**: Property developments, infrastructure projects
- **Financial**: Prices, costs, investment amounts, valuations
- **Temporal**: Dates, project timelines, market periods
- **Technical**: Property specifications, building materials, floor areas

```typescript
interface NERRequest {
  text: string;
  document_type?: 'news' | 'listing' | 'report' | 'legal' | 'bid';
  extract_relationships?: boolean;  // Extract entity relationships
}

interface NERResponse {
  request_id: string;
  entities: {
    locations: Array<{
      text: string;
      type: 'region' | 'city' | 'neighborhood' | 'landmark';
      confidence: number;
      standardized_name?: string;    // Normalized/mapped name
      coordinates?: { lat: number; lng: number };
    }>;
    
    organizations: Array<{
      text: string;
      type: 'developer' | 'contractor' | 'bank' | 'government' | 'other';
      confidence: number;
      org_id?: string;                // Link to known organization
    }>;
    
    projects: Array<{
      name: string;
      type?: PropertyType;
      location?: string;
      status?: 'proposed' | 'under_construction' | 'completed';
      units?: number;
    }>;
    
    financial: Array<{
      text: string;
      type: 'price' | 'cost' | 'investment' | 'valuation';
      amount?: number;
      currency?: string;
      confidence: number;
    }>;
    
    temporal: Array<{
      text: string;
      type: 'date' | 'duration' | 'deadline';
      normalized_date?: string;
      confidence: number;
    }>;
  };
  
  relationships?: Array<{
    subject: string;
    predicate: string;                // "developed_by", "located_in", "valued_at"
    object: string;
    confidence: number;
  }>;
  
  structured_summary: {
    location_summary: string;
    financial_summary: string;
    project_summary: string;
  };
}
```

**Training Data**:
- Ghana property listings (PropMetrik database)
- Construction permits and approvals
- Bank of Ghana reports
- News articles on real estate
- Legal documents (sale agreements, leases)

**Use Cases**:
1. **Automated Data Entry**: Extract property details from listings/emails
2. **Market Mapping**: Build knowledge graph of developers, projects, locations
3. **Competitive Intelligence**: Track competitor projects and pricing
4. **Investment Sourcing**: Identify new development opportunities from news

```typescript
// Example: Extract from property listing
POST /api/v1/ml/ner/extract
{
  "text": "Prime location in Cantonments, Accra. 4-bedroom villa developed by Meridian Properties. Listed at GHS 2.5M. Completion Q2 2026.",
  "document_type": "listing",
  "extract_relationships": true
}

// Response includes:
{
  "entities": {
    "locations": [
      { "text": "Cantonments", "type": "neighborhood", "standardized_name": "Cantonments, Greater Accra" }
    ],
    "organizations": [
      { "text": "Meridian Properties", "type": "developer", "org_id": "dev_123" }
    ],
    "financial": [
      { "text": "GHS 2.5M", "type": "price", "amount": 2500000, "currency": "GHS" }
    ],
    "temporal": [
      { "text": "Q2 2026", "type": "deadline", "normalized_date": "2026-06-30" }
    ]
  },
  "relationships": [
    { "subject": "villa", "predicate": "located_in", "object": "Cantonments" },
    { "subject": "villa", "predicate": "developed_by", "object": "Meridian Properties" },
    { "subject": "villa", "predicate": "valued_at", "object": "GHS 2.5M" }
  ]
}
```

### 8.7.4 Trend Extraction & Forecasting Service

**Purpose**: Identify emerging trends, patterns, and anomalies from text data to complement numerical market analytics.

**Capabilities**:

**1. Topic Modeling**
- Discover trending topics in real estate discussions
- Track topic evolution over time
- Identify emerging vs declining themes

**2. Keyword Trend Analysis**
- Monitor frequency of key terms (e.g., "affordable housing", "mortgage", "rental")
- Detect sudden spikes or drops in mentions
- Geographic distribution of keyword usage

**3. Pattern Recognition**
- Identify recurring phrases indicating market cycles
- Detect seasonal patterns in language
- Recognize crisis indicators ("bubble", "crash", "correction")

```typescript
interface TrendAnalysisRequest {
  data_source: 'news' | 'social_media' | 'reports' | 'all';
  time_range: {
    start_date: string;
    end_date: string;
  };
  region?: RegionCode;
  min_mentions?: number;              // Minimum threshold for trend
  include_forecasts?: boolean;
}

interface TrendAnalysisResponse {
  analysis_id: string;
  period: { start: string; end: string };
  
  trending_topics: Array<{
    topic: string;
    keywords: string[];
    mention_count: number;
    change_pct: number;                // vs previous period
    sentiment: number;
    relevance_score: number;
  }>;
  
  emerging_trends: Array<{
    trend: string;
    first_detected: string;
    growth_rate: number;
    examples: string[];                // Sample mentions
    confidence: number;
  }>;
  
  declining_trends: Array<{
    trend: string;
    peak_date: string;
    decline_rate: number;
    last_mention?: string;
  }>;
  
  keyword_trends: Array<{
    keyword: string;
    time_series: Array<{
      date: string;
      mentions: number;
      sentiment: number;
    }>;
    forecast?: Array<{                 // If requested
      date: string;
      predicted_mentions: number;
      confidence_interval: { low: number; high: number };
    }>;
  }>;
  
  anomalies: Array<{
    date: string;
    keyword: string;
    expected_mentions: number;
    actual_mentions: number;
    severity: 'low' | 'medium' | 'high';
    context: string;
  }>;
}
```

**ML Techniques**:
- **LDA (Latent Dirichlet Allocation)**: Topic discovery
- **TF-IDF + Time Series**: Keyword trend tracking
- **ARIMA/Prophet**: Time series forecasting
- **Isolation Forest**: Anomaly detection

**Use Cases**:
1. **Market Narrative Tracking**: Monitor how market narrative changes (e.g., "buyer's market" vs "seller's market")
2. **Regulatory Impact**: Detect discussions spike after policy announcements
3. **Crisis Detection**: Early warning via language pattern changes
4. **Content Strategy**: Identify what topics resonate with audience

### 8.7.5 Document Intelligence Engine

**Purpose**: Extract actionable data from PDFs, scanned documents, property listings, and unstructured reports.

**Document Types Supported**:

**1. Property Listings**
- Extract: price, location, bedrooms, bathrooms, GFA, amenities
- Classify: property type, purpose (sale/rent)
- Normalize: address formats, price formats

**2. Construction Bids**
- Extract: materials, quantities, unit prices, total costs
- Compare: across multiple bids for same project
- Flag: anomalies or suspiciously low/high bids

**3. Legal Documents**
- Extract: parties, property descriptions, transaction price, terms
- Identify: document type (sale agreement, lease, transfer)
- Validate: completeness (missing clauses)

**4. Market Reports (PDF)**
- Extract: statistics,tables, charts
- Summarize: key findings, forecasts
- Compare: across multiple reports

```typescript
interface DocumentIntelligenceRequest {
  document_url?: string;
  document_base64?: string;
  document_type: 'listing' | 'bid' | 'legal' | 'report' | 'permit';
  ocr_required?: boolean;             // For scanned documents
  extract_tables?: boolean;
  extract_images?: boolean;
}

interface DocumentIntelligenceResponse {
  document_id: string;
  processed_at: string;
  pages: number;
  
  classification: {
    document_type: string;
    confidence: number;
    sub_type?: string;
  };
  
  extracted_data: {
    // Document-type specific structured data
    property?: PropertyListing;
    bid?: ConstructionBid;
    legal?: LegalDocument;
    report?: MarketReportSummary;
  };
  
  tables: Array<{
    page: number;
    table_data: Array<Record<string, any>>;
    confidence: number;
  }>;
  
  entities: NERResponse['entities'];  // Reuse NER structure
  
  summary: string;                    // AI-generated summary
  key_findings: string[];
  
  validation: {
    completeness_score: number;
    missing_fields: string[];
    anomalies: string[];
  };
}
```

**Processing Pipeline**:
1. **Document Classification**: Identify document type
2. **OCR** (if needed): Tesseract or Google Vision API
3. **Layout Analysis**: Identify sections, tables, headers
4. **Entity Extraction**: Apply NER
5. **Table Extraction**: Parse tabular data
6. **Validation**: Check for required fields
7. **Summarization**: Generate key insights

**Use Cases**:
1. **Bulk Listing Import**: Mass import property listings from emails/PDFs
2. **Bid Analysis**: Compare construction bids automatically
3. **Due Diligence**: Extract legal document data for property transactions
4. **Report Aggregation**: Consolidate insights from multiple market reports

```typescript
// Example: Process property listing PDF
POST /api/v1/ml/document/process
{
  "document_url": "https://example.com/listing.pdf",
  "document_type": "listing",
  "extract_tables": true
}

// Response
{
  "classification": {
    "document_type": "listing",
    "confidence": 0.96,
    "sub_type": "residential_sale"
  },
  "extracted_data": {
    "property": {
      "address": "House 23, Cantonments, Accra",
      "price": 2500000,
      "currency": "GHS",
      "bedrooms": 4,
      "bathrooms": 3,
      "gfa_sqm": 250,
      "property_type": "villa",
      "amenities": ["pool", "garden", "security"],
      "developer": "Meridian Properties"
    }
  },
  "summary": "4-bedroom villa in Cantonments listed at GHS 2.5M with pool and garden..."
}
```

### 8.7.6 Market Intelligence AI Assistant

**Purpose**: Natural language interface for querying market data and generating automated insights.

**Capabilities**:

**1. Natural Language Queries**
```typescript
// User asks in plain English
"What's the average price of 3-bedroom apartments in East Legon?"
"Show me price trends for Kumasi commercial properties in the last 6 months"
"Which developers are most active in Tema?"

// System translates to API calls and returns structured + narrative response
```

**2. Automated Report Generation**
- Weekly Market Briefings: Auto-generate summaries of market activity
- Investment Opportunity Reports: Identify and describe high-potential areas
- Risk Alerts: Flag concerning trends with explanations
- Comparison Reports: Compare regions, property types, or time periods

**3. Investment Recommendations**
- Analyze user portfolio composition
- Suggest diversification opportunities
- Rank investment options by risk/return
- Explain recommendations in natural language

```typescript
interface AIAssistantRequest {
  query: string;
  context?: {
    user_role?: 'investor' | 'developer' | 'analyst' | 'lender';
    region_preference?: RegionCode[];
    risk_tolerance?: 'low' | 'medium' | 'high';
  };
  response_format?: 'json' | 'narrative' | 'both';
}

interface AIAssistantResponse {
  query_understood: string;           // System's interpretation
  confidence: number;
  
  data: any;                          // Structured data response
  
  narrative: {
    summary: string;                  // Natural language answer
    key_insights: string[];
    recommendations?: string[];
    caveats?: string[];
  };
  
  visualizations?: Array<{
    type: 'chart' | 'map' | 'table';
    data: any;
    config: any;
  }>;
  
  follow_up_questions?: string[];    // Suggested next queries
  
  sources: Array<{
    type: string;
    description: string;
    last_updated: string;
  }>;
}
```

**ML Models**:
- **OpenAI GPT-4** or **Claude 3**: Query understanding and response generation
- **LangChain**: Orchestration of retrieval and generation
- **Vector DB (Pinecone/Weaviate)**: Semantic search for market knowledge
- **Query-to-SQL**: Convert natural language to database queries

**Example Interaction**:
```typescript
// User Query
POST /api/v1/ml/assistant/query
{
  "query": "Where should I invest GHS 500,000 for rental income?",
  "context": {
    "user_role": "investor",
    "risk_tolerance": "medium"
  },
  "response_format": "both"
}

// Response
{
  "query_understood": "Investment opportunity search: GHS 500K budget, rental income focus, medium risk",
  "confidence": 0.92,
  "data": {
    "recommendations": [
      {
        "location": "Spintex, Greater Accra",
        "property_type": "2-bedroom apartment",
        "estimated_price": 450000,
        "estimated_rental_yield": 7.2,
        "risk_score": 3.5
      }
    ]
  },
  "narrative": {
    "summary": "Based on GHS 500K budget and medium risk tolerance, I recommend 2-bedroom apartments in Spintex offering 7-8% annual rental yields.",
    "key_insights": [
      "Spintex shows strong rental demand from young professionals",
      "Average 2-bed apartment costs GHS 450K, leaving room for due diligence",
      "Historical rental yield: 7.2% gross (5.8% net after expenses)"
    ],
    "recommendations": [
      "Focus on properties within 500m of Spintex Road for higher demand",
      "Budget GHS 50K for closing costs and initial renovation",
      "Target corporate tenants for stable long-term leases"
    ]
  },
  "follow_up_questions": [
    "What are the property tax implications in Spintex?",
    "Show me actual listings in Spintex under GHS 450K",
    "Compare Spintex vs Tema rental yields"
  ]
}
```

### 8.7.7 API Endpoints

```typescript
// Sentiment Analysis
POST /api/v1/ml/sentiment/analyze
GET /api/v1/ml/sentiment/history?region=greater_accra&period=30d
GET /api/v1/ml/sentiment/market-confidence-index

// Named Entity Recognition
POST /api/v1/ml/ner/extract
POST /api/v1/ml/ner/batch-extract
GET /api/v1/ml/ner/entities/:entity_type

// Trend Analysis
POST /api/v1/ml/trends/analyze
GET /api/v1/ml/trends/trending-topics
GET /api/v1/ml/trends/forecasts/:keyword

// Document Intelligence
POST /api/v1/ml/document/process
POST /api/v1/ml/document/batch-process
GET /api/v1/ml/document/status/:document_id
GET /api/v1/ml/document/results/:document_id

// AI Assistant
POST /api/v1/ml/assistant/query
POST /api/v1/ml/assistant/generate-report
GET /api/v1/ml/assistant/recommendations
```

### 8.7.8 Database Schema

```sql
-- Sentiment Analysis Results
CREATE TABLE ml_sentiment_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(50) UNIQUE NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_url TEXT,
  source_text TEXT,
  region VARCHAR(50),
  
  sentiment_overall VARCHAR(20),
  sentiment_score DECIMAL(4,3),
  confidence DECIMAL(4,3),
  
  aspects JSONB,
  entities JSONB,
  market_indicators JSONB,
  
  analyzed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sentiment_region ON ml_sentiment_analysis(region);
CREATE INDEX idx_sentiment_date ON ml_sentiment_analysis(analyzed_at);

-- Named Entities
CREATE TABLE ml_extracted_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID,
  source_type VARCHAR(50),
  
  entity_type VARCHAR(50) NOT NULL,
  entity_text TEXT NOT NULL,
  entity_subtype VARCHAR(50),
  confidence DECIMAL(4,3),
  
  normalized_value TEXT,
  metadata JSONB,
  
  extracted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_entity_type ON ml_extracted_entities(entity_type);
CREATE INDEX idx_entity_text ON ml_extracted_entities(entity_text);

-- Trend Analysis
CREATE TABLE ml_trend_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id VARCHAR(50) UNIQUE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  region VARCHAR(50),
  
  trending_topics JSONB,
  emerging_trends JSONB,
  declining_trends JSONB,
  keyword_trends JSONB,
  anomalies JSONB,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Document Intelligence
CREATE TABLE ml_processed_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id VARCHAR(50) UNIQUE NOT NULL,
  document_url TEXT,
  document_type VARCHAR(50),
  pages INTEGER,
  
  classification JSONB,
  extracted_data JSONB,
  tables JSONB,
  entities JSONB,
  
  summary TEXT,
  key_findings TEXT[],
  validation JSONB,
  
  processed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI Assistant Queries
CREATE TABLE ml_assistant_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  query TEXT NOT NULL,
  query_understood TEXT,
  confidence DECIMAL(4,3),
  
  response_data JSONB,
  response_narrative JSONB,
  
  context JSONB,
  execution_time_ms INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_assistant_user ON ml_assistant_queries(user_id);
CREATE INDEX idx_assistant_date ON ml_assistant_queries(created_at);
```

### 8.7.9 Integration with Market Intelligence

The ML/NLP services enhance Market Intelligence in the following ways:

| Market Intelligence Feature | ML/NLP Enhancement |
|----------------------------|--------------------|
| **Price Trends** | + Sentiment correlation: Does negative news precede price drops? |
| **Supply/Demand** | + Topic analysis: Track "housing shortage" vs "oversupply" mentions |
| **Investment Opportunities** | + AI recommendations: Natural language investment suggestions |
| **Market Reports** | + Automated generation: Weekly briefings with narrative insights |
| **Transaction Data** | + Entity extraction: Auto-populate from documents |
| **Competitive Intelligence** | + Developer tracking: Monitor competitor announcements |
| **Risk Assessment** | + Early warning: Detect crisis language patterns |
| **Market Forecasts** | + Narrative forecasts: Explain predictions in plain language |

### 8.7.10 Performance Metrics

```typescript
interface MLServiceMetrics {
  service: 'sentiment' | 'ner' | 'trends' | 'document' | 'assistant';
  period: string;
  
  volume: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    avg_requests_per_day: number;
  };
  
  performance: {
    avg_latency_ms: number;
    p95_latency_ms: number;
    avg_tokens_processed: number;
  };
  
  accuracy: {
    avg_confidence: number;
    user_feedback_score: number;      // 0-5 stars
    correction_rate: number;           // % of results corrected by users
  };
  
  cost: {
    total_api_costs: number;           // For external APIs (OpenAI, etc.)
    cost_per_request: number;
    monthly_budget_used_pct: number;
  };
}
```

---

## 9. Advanced Risk & Specialized Asset Analytics

### 9.1 Climate & Resilience Analytics
> **Industry Standard**: Based on First Street Foundation and FEMA risk modeling standards, adapted for Ghana's unique environmental challenges.

**Flood Risk Score**
- **Hyper-local Analysis**: 0-100 score based on elevation, drainage proximity, and historical flood patterns (NADMO data).
- **Impact on Valuation**: Direct correlation model between high flood risk and insurance premiums/resale value.
- **Visual Mapping**: Inundation zones overlay on regional heatmaps.

**Utility Reliability Score**
- **"Dumsor" (Power Outage) Frequency**: Neighborhood-level stability rating.
- **Water Supply Reliability**: Connection consistency and dependence on private tankers.
- **Livability Index**: Composite score of flood + power + water risks.

```typescript
interface ClimateResilienceMetrics {
  location: GeoCoordinates;
  
  flood_risk: {
    score: number;                   // 0-100 (100 = high risk)
    zone_type: 'safe' | 'prone' | 'critical';
    historical_incidents: number;
    drainage_proximity_m: number;
    elevation_m: number;
  };
  
  utility_reliability: {
    power_stability_score: number;   // 0-100
    avg_outage_hours_weekly: number;
    water_reliability_score: number;
    borehole_necessity: 'optional' | 'recommended' | 'critical';
  };
  
  livability_score: number;          // Composite 0-100
}
```

### 9.2 Short-Stay & Tourism Analytics
> **Industry Standard**: Based on AirDNA architecture, tracking the booming "Year of Return" tourism market.

**Performance Metrics**
- **RevPAR (Revenue Per Available Room)**: Daily/Weekly tracking for short-term rentals.
- **ADR (Average Daily Rate)**: Dynamic pricing insights.
- **Occupancy Impact**: "December in GH" seasonality spikes vs lean season.
- **Arbitrage Monitor**: Calculator comparing Long-term Rental Income vs Short-term potential (factoring in management fees/turnover).

```typescript
interface ShortStayAnalytics {
  region: RegionCode;
  
  performance: {
    revpar_avg: number;
    adr_avg: number;
    occupancy_rate: number;
    seasonality_factor: number;      // Multiplier for peak season
  };
  
  arbitrage: {
    long_term_yield: number;
    short_term_yield_potential: number;
    breakeven_occupancy: number;
  };
}
```

### 9.3 Distressed Property Monitor
> **Industry Standard**: Based on RealtyTrac methodology for foreclosure and auction data.

**Foreclosure Pipeline**
- **Pre-Foreclosure**: Properties with 90+ days mortgage delinquency (bank data integration).
- **Auction Tracker**: Aggregation of public auction listings.
- **REO (Real Estate Owned)**: Bank-held inventory analysis.
- **Equity Buffer Estimates**: Estimated gap between outstanding loan and current market value.

### 9.4 ML/NLP Integration for Specialized Analytics
- **"Dumsor" Sentiment Tracking**: Monitor social media for hyperlocal power outage complaints to update reliability scores in real-time.
- **Flood Incident Detection**: Real-time extraction of flood reports from news/twitter during rainy season.
- **Auction Listing Scraper**: Automated extraction of auction dates/locations from newspaper legal notices (using the Document Intelligence Engine).

---

## 10. Data Sources & Integration

### 10.1 Internal Data Sources

| Source | Data Type | Refresh Rate |
|--------|-----------|--------------|
| PropMetrik Transactions | Sales, listings, valuations | Real-time |
| Floor Plan Service | GFA, NIA, room data | Real-time |
| Valuation Engine | Method results, confidence | Real-time |
| Rental Comparables | Rental listings, agreements | Daily |
| Construction Cost Service | Material/labor costs | Weekly |

### 10.2 External Data Sources

| Source | Data Type | Refresh Rate |
|--------|-----------|--------------|
| Bank of Ghana | Policy rate, inflation, FX | Monthly |
| Ghana Statistical Service | GLSS, CPI, employment | Quarterly/Annual |
| World Bank WDI | Economic indicators | Annual |
| Commodity Markets | Steel, cement, fuel prices | Daily |
| Ghana Lands Commission | Transaction records | Monthly |

### 10.3 Data Quality Framework

```typescript
interface DataQualityMetrics {
  source: string;
  last_updated: string;
  
  completeness: {
    rate: number;
    missing_fields: string[];
  };
  
  accuracy: {
    validation_rate: number;
    error_rate: number;
  };
  
  timeliness: {
    expected_refresh: string;
    actual_lag_hours: number;
  };
  
  confidence_weight: number;  // 0-1 weight for multi-source fusion
}
```

### 10.4 Critical Data Gaps & Acquisition Strategy ⭐ **NEW**

**1. RICS & Valuation Compliance Data**
- **Gap**: No automated way to verify if a report meets IVS/RICS standards (VPS 1-5).
- **Strategy**: Build a PDF parsing pipeline (Document Intelligence) to extract mandatory disclosures (e.g., "Special Assumptions", "Conflict of Interest Declarations") from uploaded valuation reports.

**2. Specialized Risk Data (Litigation & Flood)**
- **Gap**: "Landguard" activity and specific land litigation court judgments are not digitized.
- **Gap**: Hyper-local flood risk data is sparse.
- **Strategy**: 
    - **Litigation**: Scrape "Legal Notices" from Daily Graphic/Ghanaian Times archives for land dispute judgments.
    - **Flood**: Partner with NADMO for historical incident data + scrape social media for real-time flood reports during rainy seasons.

**3. Short-Stay/Tourism Metrics (AirDNA style)**
- **Gap**: No direct feed for Airbnb/Booking.com occupancy and ADR in Ghana.
- **Strategy**: Build a scraper for major booking platforms (Airbnb, Booking.com) to track availability calendars and pricing changes for key neighborhoods (Osu, Cantonments, East Legon).

---

## 11. API Endpoints

### 11.1 Construction Analytics API

```typescript
// GET /api/v1/analytics/construction/index
// Returns: Current construction cost index with components

// GET /api/v1/analytics/construction/regional
// Query: ?region=greater_accra
// Returns: Regional cost data with multipliers

// GET /api/v1/analytics/construction/materials
// Query: ?material=cement&period=12m
// Returns: Material price trends

// GET /api/v1/analytics/construction/labor
// Query: ?skill_level=skilled&region=ashanti
// Returns: Labor cost analytics

// GET /api/v1/analytics/construction/forecast
// Query: ?horizon=6m&region=greater_accra
// Returns: Cost forecasts with confidence intervals
```

### 11.2 Housing Affordability API

```typescript
// GET /api/v1/analytics/hai/current
// Returns: All regional GHAI values

// GET /api/v1/analytics/hai/region/:region
// Returns: Detailed HAI for specific region

// GET /api/v1/analytics/hai/history
// Query: ?region=greater_accra&period=24m
// Returns: Historical HAI trends

// POST /api/v1/analytics/hai/calculate
// Body: { property_price, household_income, mortgage_rate, ... }
// Returns: Custom HAI calculation

// GET /api/v1/analytics/hai/components/:region
// Returns: MHAI, CHAI, RHAI breakdown
```

### 11.3 Valuation Analytics API

```typescript
// GET /api/v1/analytics/valuations/volume
// Query: ?period=monthly&region=greater_accra
// Returns: Valuation volume metrics

// GET /api/v1/analytics/valuations/quality
// Query: ?period=quarterly
// Returns: Quality and accuracy metrics

// GET /api/v1/analytics/valuations/valuer/:valuerId
// Returns: Individual valuer performance

// GET /api/v1/analytics/valuations/market-relative
// Query: ?region=greater_accra&property_type=residential
// Returns: Market-relative analytics

// GET /api/v1/analytics/valuations/sensitivity
// Query: ?valuation_id=xxx
// Returns: Sensitivity analysis results
```

### 11.4 Market Intelligence API

```typescript
// GET /api/v1/analytics/market/price-index
// Query: ?region=greater_accra&property_type=residential
// Returns: Property price index

// GET /api/v1/analytics/market/activity
// Query: ?region=ashanti&period=3m
// Returns: Transaction and listing metrics

// GET /api/v1/analytics/market/rental
// Query: ?region=greater_accra&bedrooms=3
// Returns: Rental market analytics

// GET /api/v1/analytics/market/investment
// Query: ?region=western
// Returns: Investment opportunity metrics
```

### 11.5 ML Analytics API

```typescript
// GET /api/v1/analytics/ml/performance
// Query: ?model_version=latest
// Returns: AVM accuracy metrics

// GET /api/v1/analytics/ml/features
// Returns: Feature importance rankings

// GET /api/v1/analytics/ml/monitoring
// Query: ?period=7d
// Returns: Model drift and health metrics

// GET /api/v1/analytics/ml/forecast
// Query: ?region=greater_accra&property_type=residential&horizon=6m
// Returns: Price forecasts

// POST /api/v1/analytics/ml/predict
// Body: PropertyFeatures
// Returns: AVM prediction with confidence
```

---

## 12. Database Schema

### 12.1 Analytics Summary Tables

```sql
-- Construction Cost Index (time series)
CREATE TABLE construction_cost_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL,  -- 'daily', 'weekly', 'monthly'
  region VARCHAR(50),  -- NULL for national
  
  -- Index values
  index_value DECIMAL(10,2) NOT NULL,
  base_value DECIMAL(10,2) NOT NULL,
  base_date DATE NOT NULL,
  
  -- Components
  materials_index DECIMAL(10,2),
  materials_weight DECIMAL(5,4),
  labor_index DECIMAL(10,2),
  labor_weight DECIMAL(5,4),
  overhead_index DECIMAL(10,2),
  overhead_weight DECIMAL(5,4),
  
  -- Changes
  change_mom DECIMAL(6,3),
  change_qoq DECIMAL(6,3),
  change_yoy DECIMAL(6,3),
  
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(period_date, period_type, region)
);

-- Housing Affordability Index
CREATE TABLE housing_affordability_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_date DATE NOT NULL,
  region VARCHAR(50) NOT NULL,
  property_type VARCHAR(50) DEFAULT 'residential',
  
  -- Core indices
  ghai_composite DECIMAL(6,2) NOT NULL,
  ghai_category VARCHAR(30),
  mhai DECIMAL(6,2),
  chai DECIMAL(6,2),
  rhai DECIMAL(6,2),
  
  -- Weights used
  mortgage_weight DECIMAL(5,4),
  cash_weight DECIMAL(5,4),
  rental_weight DECIMAL(5,4),
  
  -- Supplementary indices
  cai DECIMAL(6,2),  -- Construction Affordability
  lai DECIMAL(6,2),  -- Land Affordability
  mas DECIMAL(6,2),  -- Mortgage Accessibility Score
  
  -- Input data
  median_property_price DECIMAL(15,2),
  median_household_income DECIMAL(15,2),
  mortgage_rate DECIMAL(6,4),
  median_monthly_rent DECIMAL(12,2),
  
  -- Trend
  trend_direction VARCHAR(20),
  change_mom DECIMAL(6,3),
  change_yoy DECIMAL(6,3),
  
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(calculation_date, region, property_type)
);

-- Valuation Analytics Snapshots
CREATE TABLE valuation_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL,
  region VARCHAR(50),
  property_type VARCHAR(50),
  
  -- Volume metrics
  valuation_count INTEGER,
  total_value DECIMAL(18,2),
  avg_value DECIMAL(15,2),
  median_value DECIMAL(15,2),
  
  -- Method distribution
  sales_comparison_count INTEGER,
  sales_comparison_avg_confidence DECIMAL(5,2),
  cost_approach_count INTEGER,
  cost_approach_avg_confidence DECIMAL(5,2),
  income_approach_count INTEGER,
  income_approach_avg_confidence DECIMAL(5,2),
  
  -- Quality metrics
  avg_comparables_used DECIMAL(4,2),
  avg_time_to_complete_days DECIMAL(6,2),
  override_rate DECIMAL(5,4),
  
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(snapshot_date, period_type, region, property_type)
);

-- ML Model Performance Tracking
CREATE TABLE ml_model_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version VARCHAR(50) NOT NULL,
  evaluation_date DATE NOT NULL,
  
  -- Sample info
  sample_size INTEGER,
  property_type VARCHAR(50),
  region VARCHAR(50),
  
  -- Accuracy metrics
  mae DECIMAL(12,2),
  mape DECIMAL(6,4),
  rmse DECIMAL(12,2),
  r2_score DECIMAL(6,4),
  accuracy_within_10 DECIMAL(5,4),
  accuracy_within_15 DECIMAL(5,4),
  accuracy_within_20 DECIMAL(5,4),
  
  -- Prediction intervals
  coverage_90 DECIMAL(5,4),
  coverage_95 DECIMAL(5,4),
  avg_interval_width DECIMAL(12,2),
  
  -- Drift metrics
  feature_drift_score DECIMAL(6,4),
  prediction_drift_score DECIMAL(6,4),
  drift_detected BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(model_version, evaluation_date, property_type, region)
);

-- Market Activity Metrics
CREATE TABLE market_activity_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_date DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL,
  region VARCHAR(50) NOT NULL,
  property_type VARCHAR(50),
  
  -- Transaction metrics
  transaction_count INTEGER,
  transaction_value DECIMAL(18,2),
  avg_transaction_value DECIMAL(15,2),
  median_transaction_value DECIMAL(15,2),
  
  -- Listing metrics
  new_listings INTEGER,
  active_listings INTEGER,
  avg_days_on_market DECIMAL(6,2),
  listing_to_sale_ratio DECIMAL(6,4),
  
  -- Supply/demand
  absorption_rate DECIMAL(6,4),
  inventory_months DECIMAL(6,2),
  avg_discount_pct DECIMAL(5,2),
  
  -- Price index
  price_index DECIMAL(10,2),
  price_change_mom DECIMAL(6,3),
  price_change_yoy DECIMAL(6,3),
  
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(period_date, period_type, region, property_type)
);
```

### 12.2 Indexes and Partitioning

```sql
-- Indexes for efficient querying
CREATE INDEX idx_cci_period ON construction_cost_index(period_date, region);
CREATE INDEX idx_hai_date ON housing_affordability_index(calculation_date, region);
CREATE INDEX idx_vas_snapshot ON valuation_analytics_snapshots(snapshot_date, region);
CREATE INDEX idx_mlp_model ON ml_model_performance(model_version, evaluation_date);
CREATE INDEX idx_mam_period ON market_activity_metrics(period_date, region);

-- Partitioning for large tables (by year)
-- Applied to time-series tables for query performance
```

---

## 13. UI/UX Design

### 13.1 Analytics Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROPMETRIK ANALYTICS                                    [🔔] [👤] [⚙️]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────┐│
│  │ CONSTRUCTION│ │ AFFORDABILITY│ │ VALUATION   │ │ MARKET      │ │ ML     ││
│  │ ANALYTICS   │ │ INDEX        │ │ ANALYTICS   │ │ INTEL       │ │INSIGHTS││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        EXECUTIVE SUMMARY                                ││
│  ├─────────────────┬─────────────────┬─────────────────┬───────────────────┤│
│  │  COST INDEX     │  AFFORDABILITY  │  VALUATIONS     │  MARKET TREND     ││
│  │  1,347.50       │  GHAI: 67.3     │  +245 MTD       │  +2.8% YoY        ││
│  │  ↑12.3% YoY     │  ⚠️ UNAFFORDABLE │  GHS 1.2B       │  STABLE           ││
│  └─────────────────┴─────────────────┴─────────────────┴───────────────────┘│
│                                                                             │
│  ┌──────────────────────────────────┐ ┌────────────────────────────────────┐│
│  │     REGIONAL HEATMAP             │ │     TREND CHARTS                   ││
│  │                                  │ │                                    ││
│  │    [Interactive Ghana Map]       │ │    [Multi-line time series]       ││
│  │                                  │ │                                    ││
│  │    Region: Greater Accra ▼       │ │    Metric: Price Index ▼          ││
│  │    Metric: Cost Multiplier ▼     │ │    Period: 12 Months ▼            ││
│  └──────────────────────────────────┘ └────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │     DATA TABLES & DRILL-DOWN                                            ││
│  │                                                                         ││
│  │  Region          │ Cost Index │ GHAI  │ Valuations │ Price ▲/▼         ││
│  │  Greater Accra   │ 1,563.10   │ 45.2  │ 156        │ +3.2%             ││
│  │  Ashanti         │ 1,421.20   │ 72.1  │ 89         │ +2.1%             ││
│  │  Western         │ 1,378.50   │ 68.4  │ 45         │ +1.8%             ││
│  │  ...             │ ...        │ ...   │ ...        │ ...               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │     ALERTS & NOTIFICATIONS                                              ││
│  │  🔴 Steel prices up 18% MoM - Supply chain disruption detected          ││
│  │  🟡 Greater Accra GHAI declined 3.2% - Affordability worsening          ││
│  │  🟢 Model accuracy improved to 89.2% - Retraining successful            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Component Library

**Metric Cards**
- Large number display with trend indicator
- Sparkline for historical context
- Color-coded status (green/amber/red)

**Regional Heatmaps**
- Interactive Ghana map with region boundaries
- Color gradient based on metric value
- Click-to-drill-down functionality

**Time Series Charts**
- Multi-line with legend
- Zoom and pan capabilities
- Date range selector
- Export to PNG/CSV

**Comparison Tables**
- Sortable columns
- Conditional formatting
- Row expansion for details
- Pagination

**Alert Banners**
- Severity levels (info/warning/critical)
- Dismissible
- Link to detailed analysis

---

## 14. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

| Week | Deliverable | Owner |
|------|-------------|-------|
| 1 | Database schema creation (all analytics tables) | Backend |
| 1 | Construction Cost Index API endpoints | Backend |
| 2 | GHAI calculation service and API | Backend |
| 2 | Basic analytics dashboard shell | Frontend |
| 3 | Construction analytics dashboard | Frontend |
| 3 | Regional heatmap component | Frontend |
| 4 | GHAI dashboard with all sub-indices | Frontend |
| 4 | Alert system foundation | Backend |

**Deliverables:**
- ✅ Construction Cost Index with regional breakdown
- ✅ Housing Affordability Index (MHAI, CHAI, RHAI)
- ✅ Basic dashboard with metric cards and charts
- ✅ Regional heatmap visualization

### Phase 2: Valuation Analytics (Weeks 5-8)

| Week | Deliverable | Owner |
|------|-------------|-------|
| 5 | Valuation volume metrics aggregation | Backend |
| 5 | Method performance tracking | Backend |
| 6 | Valuer performance analytics service | Backend |
| 6 | Market-relative analytics | Backend |
| 7 | Valuation analytics dashboard | Frontend |
| 7 | Valuer leaderboard/benchmarking UI | Frontend |
| 8 | Floor plan analytics integration | Backend |
| 8 | Sensitivity analysis visualization | Frontend |

**Deliverables:**
- ✅ Portfolio valuation metrics
- ✅ Method performance benchmarking
- ✅ Valuer performance analytics
- ✅ Floor plan/measurement analytics

### Phase 3: Market Intelligence (Weeks 9-12)

| Week | Deliverable | Owner |
|------|-------------|-------|
| 9 | Property Price Index calculation | Backend |
| 9 | Market activity metrics aggregation | Backend |
| 10 | Rental market analytics service | Backend |
| 10 | Investment opportunity scoring | Backend |
| 11 | Market intelligence dashboard | Frontend |
| 11 | Price trend visualization | Frontend |
| 12 | Investment opportunity finder UI | Frontend |
| 12 | Custom report generation | Backend |

**Deliverables:**
- ✅ Property Price Index by region/type
- ✅ Transaction and listing analytics
- ✅ Rental market insights
- ✅ Investment opportunity identification

### Phase 4: ML Analytics (Weeks 13-16)

| Week | Deliverable | Owner |
|------|-------------|-------|
| 13 | AVM performance tracking pipeline | ML Team |
| 13 | Feature importance service | ML Team |
| 14 | Model monitoring infrastructure | ML Team |
| 14 | Drift detection alerts | Backend |
| 15 | ML analytics dashboard | Frontend |
| 15 | SHAP/feature contribution visualization | Frontend |
| 16 | Price forecasting API | ML Team |
| 16 | Forecast visualization | Frontend |

**Deliverables:**
- ✅ AVM accuracy tracking and visualization
- ✅ Feature importance analytics
- ✅ Model health monitoring
- ✅ Price forecasting with confidence intervals

### Phase 5: Centralized ML/NLP Services (Weeks 17-22) ⭐ NEW

> **Architecture Note**: This phase establishes **centralized** ML/NLP services that all analytics domains consume. No isolated NLP implementations - all domains integrate with these shared services.

| Week | Deliverable | Owner |
|------|-------------|-------|
| 17 | ML/NLP database schema (5 tables) | Backend |
| 17 | Base service classes with caching | Backend |
| 18 | Sentiment Analysis service (fine-tuned BERT) | ML Team |
| 18 | NER service (spaCy + Ghana entities) | ML Team |
| 19 | Document Intelligence engine (PDF/OCR) | ML Team |
| 19 | Table extraction (Camelot/Tabula) | Backend |
| 20 | Trend Analysis service (topic modeling) | ML Team |
| 20 | Keyword tracking with anomaly detection | Backend |
| 21 | AI Assistant (LangChain + GPT-4) | ML Team |
| 21 | Vector DB setup (Pinecone) | Backend |
| 22 | Integration with all analytics domains | All |
| 22 | ML/NLP API endpoints and testing | Backend |

**Deliverables:**
- ✅ Sentiment Analysis API (`/api/v1/ml/sentiment/*`)
- ✅ NER API (`/api/v1/ml/ner/*`)
- ✅ Document Intelligence API (`/api/v1/ml/document/*`)
- ✅ Trend Analysis API (`/api/v1/ml/trends/*`)
- ✅ AI Assistant API (`/api/v1/ml/assistant/*`)

**Integration Points Completed:**
- ✅ Construction Analytics → Sentiment (cost forecasting)
- ✅ GHAI → Trends (crisis detection)
- ✅ Valuation → Document Intel (listing extraction)
- ✅ Market Intelligence → All services (primary consumer)

### Phase 6: Advanced Features (Weeks 23-26)

| Week | Deliverable | Owner |
|------|-------------|-------|
| 23 | Climate & Flood Risk modeling service | Backend |
| 23 | Predictive construction cost forecasting | ML Team |
| 23 | GHAI forecasting model | ML Team |
| 24 | Short-stay/Airbnb analytics engine | Backend |
| 24 | Custom dashboard builder | Frontend |
| 24 | Report scheduling and distribution | Backend |
| 25 | API rate limiting and subscription tiers | Backend |
| 25 | White-label customization | Frontend |
| 26 | Mobile-responsive dashboard | Frontend |
| 26 | Final testing and documentation | All |

**Deliverables:**
- ✅ Predictive analytics for all domains
- ✅ Custom dashboard creation
- ✅ Automated reporting
- ✅ Subscription management

### Phase 7: Commercialization (Weeks 27-30)

| Week | Deliverable | Owner |
|------|-------------|-------|
| 27 | Pricing tier implementation | Product |
| 27 | Payment integration | Backend |
| 28 | API documentation portal | Backend |
| 28 | User onboarding flow | Frontend |
| 29 | Customer success dashboard | Frontend |
| 29 | Usage analytics | Backend |
| 30 | Launch preparation | All |
| 30 | Go-to-market execution | Marketing |

**Deliverables:**
- ✅ Subscription billing system
- ✅ Developer API portal
- ✅ Self-service onboarding
- ✅ Analytics-as-a-Service launch

---

## Subscription Tiers

### Pricing Structure

| Tier | Price (GHS/month) | Features |
|------|-------------------|----------|
| **Basic** | 500 | Construction Cost Index, Regional Heatmap, Basic Exports |
| **Professional** | 2,000 | + GHAI, Valuation Analytics, Market Activity |
| **Enterprise** | 5,000 | + ML Predictions, Custom Reports, API Access |
| **Partner** | Custom | + White-label, Bulk API, Dedicated Support |

### Feature Matrix

| Feature | Basic | Pro | Enterprise | Partner |
|---------|-------|-----|------------|---------|
| Construction Cost Index | ✅ | ✅ | ✅ | ✅ |
| Regional Comparison | ✅ | ✅ | ✅ | ✅ |
| Material Cost Tracking | ✅ | ✅ | ✅ | ✅ |
| Housing Affordability Index | - | ✅ | ✅ | ✅ |
| Valuation Analytics | - | ✅ | ✅ | ✅ |
| Market Activity Metrics | - | ✅ | ✅ | ✅ |
| ML Predictions (AVM) | - | - | ✅ | ✅ |
| Price Forecasting | - | - | ✅ | ✅ |
| API Access | - | - | ✅ | ✅ |
| Custom Reports | - | - | ✅ | ✅ |
| White-label | - | - | - | ✅ |
| Dedicated Support | - | - | - | ✅ |

---

## Success Metrics

### Business KPIs

| Metric | Target (Year 1) |
|--------|-----------------|
| Paying Subscribers | 100+ |
| Monthly Recurring Revenue | GHS 200,000+ |
| API Requests/Month | 1M+ |
| Customer Retention | >90% |
| NPS Score | >50 |

### Technical KPIs

| Metric | Target |
|--------|--------|
| Data Freshness | <24 hours |
| API Response Time | <200ms |
| Dashboard Load Time | <3 seconds |
| Data Accuracy | >95% |
| Uptime | >99.5% |

---

*Document maintained by Propmetrik Analytics Team*  
*Last updated: January 2026*
