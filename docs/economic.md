# PROPMETRIK Economic Data Architecture

## Comprehensive Data Acquisition & Integration Framework

**Version:** 1.0  
**Last Updated:** January 2026  
**Status:** Implementation Ready

---

## Executive Summary

This document defines PROPMETRIK's economic data architecture, combining multiple authoritative sources to provide reliable, timely macroeconomic indicators for Ghana's real estate market. The system uses a **hybrid approach**:

1. **Bank of Ghana (BoG)** - Primary source for monetary/financial data via web scraping
2. **World Bank WDI** - Secondary source for historical data and validation via REST API
3. **Real-time FX Feeds** - Live exchange rates via yfinance/Open Exchange Rates
4. **Ghana Statistical Service** - CPI and employment data supplements

---

## 1. Current Implementation Status

### 1.1 Existing Infrastructure

| Component | Status | Location |
|-----------|--------|----------|
| **Database Schema** | ✅ Complete | `migrations/004_economic_construction.sql` |
| **Economic Service** | ✅ 95% Complete | `services/data-hub/economicIndicatorService.ts` |
| **Construction Service** | ✅ Complete | `services/data-hub/constructionCostService.ts` |
| **API Routes** | ✅ Complete | `routes/dataHub.ts` (18 endpoints) |
| **Seed Data** | ✅ Complete | Ghana-specific realistic values |
| **External API Integration** | ⚠️ Placeholder | Returns default values |
| **Web Scrapers** | ❌ Not Started | tier3c directories empty |
| **Scheduled Jobs** | ❌ Not Started | No automated updates |

### 1.2 Current Database Tables

```sql
-- Economic Indicators
CREATE TABLE economic_indicators (
  id UUID PRIMARY KEY,
  indicator_type economic_indicator_type_enum,
  indicator_name VARCHAR(100),
  value DECIMAL(15, 6),
  previous_value DECIMAL(15, 6),
  change_percentage DECIMAL(8, 4),
  effective_date DATE,
  period_type VARCHAR(20),  -- 'daily', 'weekly', 'monthly', 'quarterly', 'annual'
  source_name VARCHAR(100),
  source_url VARCHAR(500),
  unit VARCHAR(50),
  metadata JSONB,
  UNIQUE(indicator_type, effective_date)
);

-- Supporting Tables
CREATE TABLE material_prices (...);
CREATE TABLE labor_rates (...);
CREATE TABLE equipment_rates (...);
CREATE TABLE construction_cost_indices (...);
```

### 1.3 Current Indicator Types

```typescript
type EconomicIndicatorType =
  | 'inflation_rate'      // CPI year-on-year change
  | 'cpi_index'           // Consumer Price Index value
  | 'gdp_growth'          // GDP growth rate
  | 'interest_rate_policy'// BoG Monetary Policy Rate
  | 'interest_rate_prime' // Banks' Prime Rate
  | 'mortgage_rate_avg'   // Average mortgage rate
  | 'exchange_rate_usd'   // GHS per USD
  | 'exchange_rate_gbp'   // GHS per GBP
  | 'exchange_rate_eur'   // GHS per EUR
  | 'unemployment_rate'   // ILO unemployment
  | 'construction_pmi'    // Construction PMI
  | 'property_price_index'; // PROPMETRIK PPI
```

---

## 2. Data Source Analysis

### 2.1 Bank of Ghana (Primary Source)

**URL:** `https://www.bog.gov.gh/economic-data/`

| Data Category | URL | Frequency | Format |
|--------------|-----|-----------|--------|
| **Exchange Rates** | `/exchange-rate/` | Monthly | HTML Table |
| **Interest Rates** | `/interest-rates/` | Monthly | HTML Table |
| **Real Sector (CPI/GDP)** | `/real-sector/` | Monthly/Quarterly | HTML Table |
| **Monetary Survey** | `/monetary-survey/` | Monthly | HTML Table |
| **Financial Soundness** | `/financial-soundness/` | Monthly | HTML Table |

#### Available Indicators from BoG:

**Exchange Rates (Monthly):**
- Inter-Bank Exchange Rate - End Period (GHC/US$)
- Inter-Bank Exchange Rate - Month Average (GHC/US$)
- Inter-Bank Exchange Rate - End Period (GHC/GBP)
- Inter-Bank Exchange Rate - End Period (GHC/EURO)

**Interest Rates (Monthly):**
- Monetary Policy Rate (%)
- Ghana Reference Rate (%)
- Average Commercial Banks Lending Rate (%)
- Average Savings Deposits Rate (%)
- Average Time Deposits Rate: 3-Month (%)
- Inter-Bank Weighted Average (%)

**Real Sector (Monthly/Quarterly/Annual):**
- Inflation_Core (Adjusted for Energy & Utility) (%) Year-on-Year
- Bank of Ghana Composite Index of Economic Activity
- Gross Domestic Product at Current Prices
- Gross Domestic Product Growth Rate (%)

#### BoG Data Structure

The BoG website uses DataTables with this structure:

```html
<table id="DataTable_xxx">
  <thead>
    <tr>
      <th></th>
      <th></th>
      <th>Jan</th><th>Feb</th>...<th>Dec</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>2025</td>
      <td>Inter-Bank Exchange Rate - End Period (GHC/US$)</td>
      <td>15.3000</td>
      <td>15.5300</td>
      ...
    </tr>
  </tbody>
</table>
```

### 2.2 World Bank WDI (Secondary Source)

**API:** `https://api.worldbank.org/v2/`

| Indicator Code | Description | Frequency |
|----------------|-------------|-----------|
| `FP.CPI.TOTL.ZG` | Inflation, consumer prices (annual %) | Annual |
| `NY.GDP.MKTP.KD.ZG` | GDP growth (annual %) | Annual |
| `SL.UEM.TOTL.ZS` | Unemployment, total (% of labor force) | Annual |
| `FR.INR.LEND` | Lending interest rate (%) | Annual |
| `PA.NUS.FCRF` | Official exchange rate (LCU per US$) | Annual |

**Sample API Call:**
```bash
curl "https://api.worldbank.org/v2/country/GH/indicator/FP.CPI.TOTL.ZG?format=json&date=2020:2024"
```

**Response:**
```json
[
  {"page":1,"pages":1,"per_page":50,"total":5},
  [
    {"date":"2024","value":22.8483},
    {"date":"2023","value":38.1070},
    {"date":"2022","value":31.2559},
    {"date":"2021","value":9.9711},
    {"date":"2020","value":9.8873}
  ]
]
```

### 2.3 Real-Time Exchange Rates

| Source | Type | Cost | Latency | API |
|--------|------|------|---------|-----|
| **yfinance** | Real-time | Free | ~15 min | `GHSUSD=X` |
| **Open Exchange Rates** | Real-time | Free (1000/mo) | Real-time | REST |
| **ExchangeRate-API** | Real-time | Free (1500/mo) | Real-time | REST |
| **BoG Official** | End of day | Free (scrape) | Daily | Scrape |

---

## 3. Proposed Architecture

### 3.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     PROPMETRIK ECONOMIC DATA PLATFORM                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                         DATA ACQUISITION LAYER                            │ │
│  ├───────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                           │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │ │
│  │  │   BOG SCRAPER   │  │   WDI CLIENT    │  │   FX FEED       │           │ │
│  │  │                 │  │                 │  │                 │           │ │
│  │  │ • Exchange Rate │  │ • Inflation     │  │ • yfinance      │           │ │
│  │  │ • Interest Rate │  │ • GDP Growth    │  │ • Fallback APIs │           │ │
│  │  │ • Real Sector   │  │ • Unemployment  │  │ • WebSocket     │           │ │
│  │  │ • Policy Rate   │  │ • Historical    │  │                 │           │ │
│  │  │                 │  │                 │  │                 │           │ │
│  │  │ Freq: Monthly   │  │ Freq: Quarterly │  │ Freq: 5 min     │           │ │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │ │
│  │           │                    │                    │                     │ │
│  └───────────┼────────────────────┼────────────────────┼─────────────────────┘ │
│              │                    │                    │                       │
│              ▼                    ▼                    ▼                       │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                         DATA PROCESSING LAYER                             │ │
│  ├───────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                           │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │ │
│  │  │   VALIDATOR     │  │   TRANSFORMER   │  │   RECONCILER    │           │ │
│  │  │                 │  │                 │  │                 │           │ │
│  │  │ • Range checks  │  │ • Normalize     │  │ • Source merge  │           │ │
│  │  │ • Type checks   │  │ • Unit convert  │  │ • Conflict res  │           │ │
│  │  │ • Anomaly det   │  │ • Calculate Δ   │  │ • Priority rule │           │ │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │ │
│  │           │                    │                    │                     │ │
│  └───────────┼────────────────────┼────────────────────┼─────────────────────┘ │
│              │                    │                    │                       │
│              ▼                    ▼                    ▼                       │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                           STORAGE LAYER                                   │ │
│  ├───────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                           │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │ │
│  │  │   POSTGRESQL    │  │     REDIS       │  │   TIMESERIES    │           │ │
│  │  │                 │  │                 │  │   (Future)      │           │ │
│  │  │ • Historical    │  │ • Current rates │  │ • High-freq FX  │           │ │
│  │  │ • Validated     │  │ • Cache layer   │  │ • Tick data     │           │ │
│  │  │ • Auditable     │  │ • TTL: 5 min    │  │                 │           │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘           │ │
│  │                                                                           │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                         SCHEDULING LAYER                                  │ │
│  ├───────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                           │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │  │                      CRON SCHEDULER                                 │ │ │
│  │  │                                                                     │ │ │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │ │
│  │  │  │ FX Update    │  │ BOG Sync     │  │ WDI Sync     │              │ │ │
│  │  │  │ */5 * * * *  │  │ 0 8 1 * *    │  │ 0 0 1 */3 *  │              │ │ │
│  │  │  │ Every 5 min  │  │ 1st of month │  │ Quarterly    │              │ │ │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │ │
│  │  │                                                                     │ │ │
│  │  └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                           │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow Priority

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA RECONCILIATION RULES                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PRIORITY 1: Bank of Ghana (Official, Authoritative)            │
│  ├── Policy Rate         → Exclusive source                    │
│  ├── Exchange Rates      → Official interbank rate             │
│  ├── Interest Rates      → Prime, Lending, Mortgage            │
│  ├── Inflation           → Monthly CPI (faster than WDI)       │
│  └── GDP Growth          → Quarterly (faster than WDI)         │
│                                                                 │
│  PRIORITY 2: World Bank WDI (Validated, Historical)             │
│  ├── Unemployment        → ILO methodology (standardized)      │
│  ├── Historical Backfill → 1960+ time series                   │
│  └── Cross-validation    → Verify BoG data consistency         │
│                                                                 │
│  PRIORITY 3: Real-time Feeds (Live, Approximate)                │
│  ├── yfinance            → Intraday FX (not official)          │
│  └── Fallback APIs       → When yfinance unavailable           │
│                                                                 │
│  CONFLICT RESOLUTION:                                           │
│  • If BoG available → Use BoG                                   │
│  • If BoG unavailable → Use WDI with warning flag               │
│  • Real-time FX → Always available but marked 'unofficial'      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Components

### 4.1 Directory Structure

```
backend/
├── src/
│   ├── services/
│   │   └── data-hub/
│   │       ├── economicIndicatorService.ts    # Existing - enhance
│   │       ├── constructionCostService.ts     # Existing - complete
│   │       ├── scrapers/                      # NEW
│   │       │   ├── index.ts
│   │       │   ├── bogScraper.ts              # Bank of Ghana scraper
│   │       │   ├── wdiClient.ts               # World Bank API client
│   │       │   └── fxFeedService.ts           # Real-time FX
│   │       ├── processors/                    # NEW
│   │       │   ├── dataValidator.ts
│   │       │   ├── dataTransformer.ts
│   │       │   └── dataReconciler.ts
│   │       └── schedulers/                    # NEW
│   │           ├── economicDataScheduler.ts
│   │           └── fxUpdateScheduler.ts
│   └── routes/
│       └── api/v1/
│           └── economic.routes.ts             # Existing - enhance
│
├── services/
│   └── data-hub/
│       └── acquisition/
│           └── tier3c-economic-construction-data/
│               ├── macroeconomic/
│               │   ├── bog-scraper/           # NEW - Python/Puppeteer
│               │   └── wdi-sync/              # NEW - API sync scripts
│               └── construction-materials/
│                   └── price-surveys/         # NEW - Material price collection
```

### 4.2 Bank of Ghana Scraper

```typescript
// File: /backend/src/services/data-hub/scrapers/bogScraper.ts

import axios from 'axios';
import * as cheerio from 'cheerio';
import { db } from '@/db';

interface BOGIndicator {
  year: number;
  month: number;
  indicatorName: string;
  value: number;
  category: 'exchange_rate' | 'interest_rate' | 'real_sector';
}

const BOG_URLS = {
  exchangeRates: 'https://www.bog.gov.gh/economic-data/exchange-rate/',
  interestRates: 'https://www.bog.gov.gh/economic-data/interest-rates/',
  realSector: 'https://www.bog.gov.gh/economic-data/real-sector/',
};

// Mapping BOG indicator names to our types
const INDICATOR_MAPPING: Record<string, string> = {
  'Inter-Bank Exchange Rate - End Period (GHC/US$)': 'exchange_rate_usd',
  'Inter-Bank Exchange Rate - End Period (GHC/GBP)': 'exchange_rate_gbp',
  'Inter-Bank Exchange Rate - End Period (GHC/EURO)': 'exchange_rate_eur',
  'Monetary Policy Rate (%)': 'interest_rate_policy',
  'Ghana Reference Rate (%)': 'prime_rate',
  'Average Commercial Banks Lending Rate (%)': 'lending_rate',
  'Average Mortgage Rate (%)': 'mortgage_rate_avg',
  'Inflation_Core (Adjusted for Energy & Utility) (%) Year-on-Year': 'inflation_rate',
  'Gross Domestic Product Growth Rate (%)': 'gdp_growth',
};

export class BOGScraper {
  private static readonly MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  /**
   * Fetch and parse exchange rates from BoG website
   */
  async scrapeExchangeRates(): Promise<BOGIndicator[]> {
    const response = await axios.get(BOG_URLS.exchangeRates, {
      headers: {
        'User-Agent': 'PROPMETRIK Economic Data Bot/1.0 (+https://propmetrik.com)',
      },
    });

    const $ = cheerio.load(response.data);
    const indicators: BOGIndicator[] = [];

    // BoG uses DataTables - parse the table rows
    $('table tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const year = parseInt($(cells[0]).text().trim());
      const indicatorName = $(cells[1]).text().trim();

      // Skip if not a mapped indicator
      if (!INDICATOR_MAPPING[indicatorName]) return;

      // Parse monthly values (columns 3-14)
      for (let month = 0; month < 12; month++) {
        const cellIndex = month + 2;
        if (cellIndex >= cells.length) break;

        const valueText = $(cells[cellIndex]).text().trim();
        const value = parseFloat(valueText);

        if (!isNaN(value) && value !== 0) {
          indicators.push({
            year,
            month: month + 1,
            indicatorName,
            value,
            category: 'exchange_rate',
          });
        }
      }
    });

    return indicators;
  }

  /**
   * Fetch and parse interest rates from BoG website
   */
  async scrapeInterestRates(): Promise<BOGIndicator[]> {
    const response = await axios.get(BOG_URLS.interestRates, {
      headers: {
        'User-Agent': 'PROPMETRIK Economic Data Bot/1.0 (+https://propmetrik.com)',
      },
    });

    const $ = cheerio.load(response.data);
    const indicators: BOGIndicator[] = [];

    $('table tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const year = parseInt($(cells[0]).text().trim());
      const indicatorName = $(cells[1]).text().trim();

      if (!INDICATOR_MAPPING[indicatorName]) return;

      for (let month = 0; month < 12; month++) {
        const cellIndex = month + 2;
        if (cellIndex >= cells.length) break;

        const valueText = $(cells[cellIndex]).text().trim();
        const value = parseFloat(valueText);

        if (!isNaN(value) && value !== 0) {
          indicators.push({
            year,
            month: month + 1,
            indicatorName,
            value,
            category: 'interest_rate',
          });
        }
      }
    });

    return indicators;
  }

  /**
   * Fetch and parse real sector data (CPI, GDP) from BoG website
   */
  async scrapeRealSector(): Promise<BOGIndicator[]> {
    const response = await axios.get(BOG_URLS.realSector, {
      headers: {
        'User-Agent': 'PROPMETRIK Economic Data Bot/1.0 (+https://propmetrik.com)',
      },
    });

    const $ = cheerio.load(response.data);
    const indicators: BOGIndicator[] = [];

    // Monthly data table
    $('table').first().find('tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const year = parseInt($(cells[0]).text().trim());
      const indicatorName = $(cells[1]).text().trim();

      if (!INDICATOR_MAPPING[indicatorName]) return;

      for (let month = 0; month < 12; month++) {
        const cellIndex = month + 2;
        if (cellIndex >= cells.length) break;

        const valueText = $(cells[cellIndex]).text().trim();
        const value = parseFloat(valueText);

        if (!isNaN(value) && value !== 0) {
          indicators.push({
            year,
            month: month + 1,
            indicatorName,
            value,
            category: 'real_sector',
          });
        }
      }
    });

    return indicators;
  }

  /**
   * Run full scrape and save to database
   */
  async syncAllIndicators(): Promise<SyncResult> {
    const results: SyncResult = {
      success: 0,
      failed: 0,
      errors: [],
      timestamp: new Date(),
    };

    try {
      // Scrape all categories
      const [exchangeRates, interestRates, realSector] = await Promise.all([
        this.scrapeExchangeRates(),
        this.scrapeInterestRates(),
        this.scrapeRealSector(),
      ]);

      const allIndicators = [...exchangeRates, ...interestRates, ...realSector];

      // Save to database
      for (const indicator of allIndicators) {
        try {
          await this.saveIndicator(indicator);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            indicator: indicator.indicatorName,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      console.log(`BOG Sync complete: ${results.success} saved, ${results.failed} failed`);
    } catch (error) {
      results.errors.push({
        indicator: 'ALL',
        error: error instanceof Error ? error.message : 'Scraper failed',
      });
    }

    return results;
  }

  private async saveIndicator(indicator: BOGIndicator): Promise<void> {
    const indicatorType = INDICATOR_MAPPING[indicator.indicatorName];
    if (!indicatorType) return;

    const effectiveDate = new Date(indicator.year, indicator.month - 1, 1);

    // Upsert - update if exists, insert if not
    await db.query(`
      INSERT INTO economic_indicators (
        id, indicator_type, indicator_name, value, effective_date,
        period_type, source_name, source_url, unit, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        'monthly', 'Bank of Ghana', $5, $6, NOW(), NOW()
      )
      ON CONFLICT (indicator_type, effective_date) 
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `, [
      indicatorType,
      indicator.indicatorName,
      indicator.value,
      effectiveDate,
      BOG_URLS[indicator.category === 'exchange_rate' ? 'exchangeRates' : 
               indicator.category === 'interest_rate' ? 'interestRates' : 'realSector'],
      indicatorType.includes('rate') ? 'percentage' : 
        indicatorType.includes('exchange') ? 'ghs_per_unit' : 'index',
    ]);
  }
}

export const bogScraper = new BOGScraper();

interface SyncResult {
  success: number;
  failed: number;
  errors: Array<{ indicator: string; error: string }>;
  timestamp: Date;
}
```

### 4.3 World Bank WDI Client

```typescript
// File: /backend/src/services/data-hub/scrapers/wdiClient.ts

import axios from 'axios';
import { db } from '@/db';

const WDI_BASE_URL = 'https://api.worldbank.org/v2';
const COUNTRY_CODE = 'GH'; // Ghana

interface WDIIndicatorConfig {
  code: string;
  name: string;
  mapTo: string;
  unit: string;
}

const WDI_INDICATORS: WDIIndicatorConfig[] = [
  {
    code: 'FP.CPI.TOTL.ZG',
    name: 'Inflation, consumer prices (annual %)',
    mapTo: 'inflation_rate',
    unit: 'percentage',
  },
  {
    code: 'NY.GDP.MKTP.KD.ZG',
    name: 'GDP growth (annual %)',
    mapTo: 'gdp_growth',
    unit: 'percentage',
  },
  {
    code: 'SL.UEM.TOTL.ZS',
    name: 'Unemployment, total (% of labor force)',
    mapTo: 'unemployment_rate',
    unit: 'percentage',
  },
  {
    code: 'FR.INR.LEND',
    name: 'Lending interest rate (%)',
    mapTo: 'lending_rate',
    unit: 'percentage',
  },
  {
    code: 'PA.NUS.FCRF',
    name: 'Official exchange rate (LCU per US$)',
    mapTo: 'exchange_rate_usd_annual',
    unit: 'ghs_per_usd',
  },
];

interface WDIDataPoint {
  date: string;
  value: number | null;
  indicator: {
    id: string;
    value: string;
  };
  country: {
    id: string;
    value: string;
  };
}

export class WDIClient {
  /**
   * Fetch indicator data from World Bank API
   */
  async fetchIndicator(
    indicatorCode: string,
    startYear: number = 2000,
    endYear: number = new Date().getFullYear()
  ): Promise<WDIDataPoint[]> {
    const url = `${WDI_BASE_URL}/country/${COUNTRY_CODE}/indicator/${indicatorCode}`;

    const response = await axios.get(url, {
      params: {
        format: 'json',
        date: `${startYear}:${endYear}`,
        per_page: 100,
      },
    });

    // WDI returns [metadata, data]
    const [meta, data] = response.data;

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.filter((d: WDIDataPoint) => d.value !== null);
  }

  /**
   * Sync all configured indicators
   */
  async syncAllIndicators(): Promise<SyncResult> {
    const results: SyncResult = {
      success: 0,
      failed: 0,
      indicators: [],
      timestamp: new Date(),
    };

    for (const config of WDI_INDICATORS) {
      try {
        const data = await this.fetchIndicator(config.code);
        
        for (const point of data) {
          await this.saveIndicator(config, point);
          results.success++;
        }

        results.indicators.push({
          code: config.code,
          count: data.length,
          status: 'success',
        });
      } catch (error) {
        results.failed++;
        results.indicators.push({
          code: config.code,
          count: 0,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`WDI Sync complete: ${results.success} saved, ${results.failed} failed`);
    return results;
  }

  private async saveIndicator(config: WDIIndicatorConfig, point: WDIDataPoint): Promise<void> {
    // WDI data is annual - use December 31 as effective date
    const effectiveDate = new Date(`${point.date}-12-31`);

    await db.query(`
      INSERT INTO economic_indicators (
        id, indicator_type, indicator_name, value, effective_date,
        period_type, source_name, source_url, source_reference, unit,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        'annual', 'World Bank WDI', 'https://data.worldbank.org', $5, $6,
        NOW(), NOW()
      )
      ON CONFLICT (indicator_type, effective_date) 
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
      WHERE economic_indicators.source_name = 'World Bank WDI'
    `, [
      config.mapTo,
      config.name,
      point.value,
      effectiveDate,
      config.code,
      config.unit,
    ]);
  }

  /**
   * Get latest value for an indicator
   */
  async getLatestValue(indicatorCode: string): Promise<number | null> {
    const data = await this.fetchIndicator(
      indicatorCode,
      new Date().getFullYear() - 5,
      new Date().getFullYear()
    );

    if (data.length === 0) return null;

    // Sort by date descending and get first non-null value
    const sorted = data.sort((a, b) => parseInt(b.date) - parseInt(a.date));
    return sorted[0]?.value ?? null;
  }
}

export const wdiClient = new WDIClient();

interface SyncResult {
  success: number;
  failed: number;
  indicators: Array<{
    code: string;
    count: number;
    status: 'success' | 'failed';
    error?: string;
  }>;
  timestamp: Date;
}
```

### 4.4 Real-Time FX Service

```typescript
// File: /backend/src/services/data-hub/scrapers/fxFeedService.ts

import axios from 'axios';
import { redis } from '@/redis';

interface ExchangeRate {
  pair: string;
  rate: number;
  source: string;
  timestamp: Date;
  isOfficial: boolean;
}

const CACHE_KEY_PREFIX = 'fx_rate:';
const CACHE_TTL_SECONDS = 300; // 5 minutes

export class FXFeedService {
  private fallbackRates: Record<string, number> = {
    USD: 15.5,
    GBP: 19.5,
    EUR: 16.8,
  };

  /**
   * Fetch live rate from yfinance via Yahoo Finance API
   * Note: yfinance uses inverse notation (GHSUSD=X means GHS per USD inverted)
   */
  async fetchYahooRate(currency: string = 'USD'): Promise<ExchangeRate | null> {
    try {
      // Yahoo Finance uses GHSUSD=X format for GHS/USD
      const symbol = `GHS${currency}=X`;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;

      const response = await axios.get(url, {
        params: { interval: '1d', range: '1d' },
        timeout: 5000,
      });

      const result = response.data.chart.result?.[0];
      if (!result?.meta?.regularMarketPrice) {
        return null;
      }

      // Yahoo returns GHS per 1 unit of foreign currency (inverted)
      // We need to invert it back
      const rawRate = result.meta.regularMarketPrice;
      const rate = 1 / rawRate; // Convert to "how many GHS for 1 USD"

      return {
        pair: `${currency}/GHS`,
        rate: Math.round(rate * 10000) / 10000,
        source: 'yahoo_finance',
        timestamp: new Date(),
        isOfficial: false,
      };
    } catch (error) {
      console.error('Yahoo Finance fetch failed:', error);
      return null;
    }
  }

  /**
   * Fetch from Open Exchange Rates (free tier)
   * Requires API key in env: OPEN_EXCHANGE_RATES_API_KEY
   */
  async fetchOpenExchangeRate(currency: string = 'USD'): Promise<ExchangeRate | null> {
    const apiKey = process.env.OPEN_EXCHANGE_RATES_API_KEY;
    if (!apiKey) return null;

    try {
      const url = `https://openexchangerates.org/api/latest.json`;
      const response = await axios.get(url, {
        params: { app_id: apiKey, base: 'USD' },
        timeout: 5000,
      });

      const ghsRate = response.data.rates?.GHS;
      if (!ghsRate) return null;

      // Convert: if base is USD and we have GHS rate, that's USD→GHS
      let rate = ghsRate;
      if (currency !== 'USD') {
        const currencyRate = response.data.rates?.[currency];
        if (currencyRate) {
          // Cross rate calculation
          rate = ghsRate / currencyRate;
        }
      }

      return {
        pair: `${currency}/GHS`,
        rate: Math.round(rate * 10000) / 10000,
        source: 'open_exchange_rates',
        timestamp: new Date(),
        isOfficial: false,
      };
    } catch (error) {
      console.error('Open Exchange Rates fetch failed:', error);
      return null;
    }
  }

  /**
   * Get current rate with fallback chain
   */
  async getCurrentRate(currency: string = 'USD'): Promise<ExchangeRate> {
    // Check cache first
    const cached = await this.getCachedRate(currency);
    if (cached) return cached;

    // Try Yahoo first
    let rate = await this.fetchYahooRate(currency);

    // Fallback to Open Exchange Rates
    if (!rate) {
      rate = await this.fetchOpenExchangeRate(currency);
    }

    // Ultimate fallback to hardcoded rates
    if (!rate) {
      rate = {
        pair: `${currency}/GHS`,
        rate: this.fallbackRates[currency] || 15.5,
        source: 'fallback',
        timestamp: new Date(),
        isOfficial: false,
      };
    }

    // Cache the rate
    await this.cacheRate(currency, rate);

    return rate;
  }

  /**
   * Get all major currency rates
   */
  async getAllRates(): Promise<Record<string, ExchangeRate>> {
    const currencies = ['USD', 'GBP', 'EUR'];
    const rates: Record<string, ExchangeRate> = {};

    await Promise.all(
      currencies.map(async (currency) => {
        rates[currency] = await this.getCurrentRate(currency);
      })
    );

    return rates;
  }

  private async getCachedRate(currency: string): Promise<ExchangeRate | null> {
    try {
      const cached = await redis.get(`${CACHE_KEY_PREFIX}${currency}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis not available
    }
    return null;
  }

  private async cacheRate(currency: string, rate: ExchangeRate): Promise<void> {
    try {
      await redis.setex(
        `${CACHE_KEY_PREFIX}${currency}`,
        CACHE_TTL_SECONDS,
        JSON.stringify(rate)
      );
    } catch {
      // Redis not available
    }
  }

  /**
   * Save daily closing rate to database
   */
  async saveDailyRate(currency: string, rate: ExchangeRate): Promise<void> {
    const indicatorType = `exchange_rate_${currency.toLowerCase()}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await db.query(`
      INSERT INTO economic_indicators (
        id, indicator_type, indicator_name, value, effective_date,
        period_type, source_name, unit, metadata, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        'daily', $5, 'ghs_per_unit', $6, NOW(), NOW()
      )
      ON CONFLICT (indicator_type, effective_date) 
      DO UPDATE SET
        value = EXCLUDED.value,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `, [
      indicatorType,
      `${currency}/GHS Exchange Rate`,
      rate.rate,
      today,
      rate.source,
      JSON.stringify({ is_official: rate.isOfficial }),
    ]);
  }
}

export const fxFeedService = new FXFeedService();
```

### 4.5 Economic Data Scheduler

```typescript
// File: /backend/src/services/data-hub/schedulers/economicDataScheduler.ts

import cron from 'node-cron';
import { bogScraper } from '../scrapers/bogScraper';
import { wdiClient } from '../scrapers/wdiClient';
import { fxFeedService } from '../scrapers/fxFeedService';

interface SchedulerConfig {
  bogSyncCron: string;      // Monthly BOG sync
  wdiSyncCron: string;      // Quarterly WDI sync
  fxUpdateCron: string;     // Every 5 minutes FX update
  fxDailyCron: string;      // Daily FX close save
}

const DEFAULT_CONFIG: SchedulerConfig = {
  bogSyncCron: '0 8 1 * *',       // 8 AM on 1st of each month
  wdiSyncCron: '0 0 1 */3 *',     // Midnight on 1st of Jan, Apr, Jul, Oct
  fxUpdateCron: '*/5 * * * *',    // Every 5 minutes
  fxDailyCron: '0 17 * * 1-5',    // 5 PM on weekdays (market close)
};

export class EconomicDataScheduler {
  private jobs: cron.ScheduledTask[] = [];
  private isRunning = false;

  /**
   * Start all scheduled jobs
   */
  start(config: Partial<SchedulerConfig> = {}): void {
    if (this.isRunning) {
      console.warn('Scheduler already running');
      return;
    }

    const cfg = { ...DEFAULT_CONFIG, ...config };

    // Bank of Ghana monthly sync
    this.jobs.push(
      cron.schedule(cfg.bogSyncCron, async () => {
        console.log('[Scheduler] Running BOG sync...');
        try {
          const result = await bogScraper.syncAllIndicators();
          console.log(`[Scheduler] BOG sync complete: ${result.success} indicators saved`);
        } catch (error) {
          console.error('[Scheduler] BOG sync failed:', error);
        }
      })
    );

    // World Bank WDI quarterly sync
    this.jobs.push(
      cron.schedule(cfg.wdiSyncCron, async () => {
        console.log('[Scheduler] Running WDI sync...');
        try {
          const result = await wdiClient.syncAllIndicators();
          console.log(`[Scheduler] WDI sync complete: ${result.success} indicators saved`);
        } catch (error) {
          console.error('[Scheduler] WDI sync failed:', error);
        }
      })
    );

    // Real-time FX update (cache only)
    this.jobs.push(
      cron.schedule(cfg.fxUpdateCron, async () => {
        try {
          await fxFeedService.getAllRates();
        } catch (error) {
          console.error('[Scheduler] FX update failed:', error);
        }
      })
    );

    // Daily FX close save to database
    this.jobs.push(
      cron.schedule(cfg.fxDailyCron, async () => {
        console.log('[Scheduler] Saving daily FX rates...');
        try {
          const rates = await fxFeedService.getAllRates();
          for (const [currency, rate] of Object.entries(rates)) {
            await fxFeedService.saveDailyRate(currency, rate);
          }
          console.log('[Scheduler] Daily FX rates saved');
        } catch (error) {
          console.error('[Scheduler] Daily FX save failed:', error);
        }
      })
    );

    this.isRunning = true;
    console.log('[Scheduler] Economic data scheduler started');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
    this.isRunning = false;
    console.log('[Scheduler] Economic data scheduler stopped');
  }

  /**
   * Run immediate sync (for testing or manual trigger)
   */
  async runImmediateSync(source: 'bog' | 'wdi' | 'fx' | 'all'): Promise<void> {
    console.log(`[Scheduler] Running immediate sync for: ${source}`);

    if (source === 'bog' || source === 'all') {
      await bogScraper.syncAllIndicators();
    }

    if (source === 'wdi' || source === 'all') {
      await wdiClient.syncAllIndicators();
    }

    if (source === 'fx' || source === 'all') {
      const rates = await fxFeedService.getAllRates();
      for (const [currency, rate] of Object.entries(rates)) {
        await fxFeedService.saveDailyRate(currency, rate);
      }
    }

    console.log('[Scheduler] Immediate sync complete');
  }
}

export const economicDataScheduler = new EconomicDataScheduler();
```

---

## 5. API Enhancements

### 5.1 New Endpoints

```typescript
// File: /backend/src/routes/api/v1/economic.routes.ts (additions)

// Trigger manual sync
router.post('/sync/bog', requireAdmin, async (req, res) => {
  const result = await bogScraper.syncAllIndicators();
  res.json({ success: true, data: result });
});

router.post('/sync/wdi', requireAdmin, async (req, res) => {
  const result = await wdiClient.syncAllIndicators();
  res.json({ success: true, data: result });
});

router.post('/sync/fx', requireAdmin, async (req, res) => {
  const rates = await fxFeedService.getAllRates();
  res.json({ success: true, data: rates });
});

// Get live FX rates
router.get('/fx/live', async (req, res) => {
  const rates = await fxFeedService.getAllRates();
  res.json({ success: true, data: rates });
});

// Get data source status
router.get('/sources/status', async (req, res) => {
  const status = {
    bog: {
      lastSync: await getLastSyncTime('Bank of Ghana'),
      indicatorCount: await getIndicatorCount('Bank of Ghana'),
      status: 'active',
    },
    wdi: {
      lastSync: await getLastSyncTime('World Bank WDI'),
      indicatorCount: await getIndicatorCount('World Bank WDI'),
      status: 'active',
    },
    fx: {
      lastUpdate: new Date(),
      sources: ['yahoo_finance', 'open_exchange_rates'],
      status: 'active',
    },
  };
  res.json({ success: true, data: status });
});
```

### 5.2 Updated Endpoint Summary

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/economic/snapshot` | All latest indicators | Public |
| GET | `/api/v1/economic/indicator/:type` | Specific indicator | Public |
| GET | `/api/v1/economic/history` | Historical data | Public |
| GET | `/api/v1/economic/exchange-rate/:currency` | Exchange rate | Public |
| GET | `/api/v1/economic/fx/live` | Real-time FX rates | Public |
| POST | `/api/v1/economic/convert` | Currency conversion | Public |
| POST | `/api/v1/economic/affordability` | Calculate HAI | Public |
| POST | `/api/v1/economic/sync/bog` | Trigger BOG sync | Admin |
| POST | `/api/v1/economic/sync/wdi` | Trigger WDI sync | Admin |
| POST | `/api/v1/economic/sync/fx` | Refresh FX rates | Admin |
| GET | `/api/v1/economic/sources/status` | Data source health | Public |

---

## 6. Database Enhancements

### 6.1 New Indexes

```sql
-- Optimize indicator lookups
CREATE INDEX idx_economic_indicators_type_date 
ON economic_indicators(indicator_type, effective_date DESC);

CREATE INDEX idx_economic_indicators_source 
ON economic_indicators(source_name);

CREATE INDEX idx_economic_indicators_period 
ON economic_indicators(period_type, effective_date);
```

### 6.2 Data Source Tracking Table

```sql
-- Track sync history and source health
CREATE TABLE economic_data_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name VARCHAR(100) NOT NULL,
  sync_type VARCHAR(50) NOT NULL,  -- 'full', 'incremental', 'manual'
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL,  -- 'running', 'success', 'failed'
  records_processed INTEGER DEFAULT 0,
  records_saved INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  
  CONSTRAINT valid_status CHECK (status IN ('running', 'success', 'failed'))
);

CREATE INDEX idx_sync_log_source ON economic_data_sync_log(source_name, started_at DESC);
```

---

## 7. Configuration

### 7.1 Environment Variables

```bash
# .env additions

# Bank of Ghana Scraper
BOG_SCRAPER_USER_AGENT="PROPMETRIK Economic Data Bot/1.0"
BOG_SCRAPER_TIMEOUT_MS=30000

# World Bank WDI
WDI_API_BASE_URL="https://api.worldbank.org/v2"
WDI_COUNTRY_CODE="GH"

# Exchange Rate APIs
OPEN_EXCHANGE_RATES_API_KEY=""  # Optional - for fallback
YAHOO_FINANCE_TIMEOUT_MS=5000

# Scheduler
ECONOMIC_SCHEDULER_ENABLED=true
BOG_SYNC_CRON="0 8 1 * *"
WDI_SYNC_CRON="0 0 1 */3 *"
FX_UPDATE_CRON="*/5 * * * *"

# Redis for FX caching
REDIS_FX_CACHE_TTL=300
```

### 7.2 Dependencies

```json
// package.json additions
{
  "dependencies": {
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11"
  }
}
```

---

## 8. Monitoring & Alerts

### 8.1 Health Checks

```typescript
// Health check for economic data freshness
async function checkEconomicDataHealth(): Promise<HealthStatus> {
  const checks = {
    bog_freshness: await checkDataFreshness('Bank of Ghana', 35), // days
    wdi_freshness: await checkDataFreshness('World Bank WDI', 400), // days
    fx_freshness: await checkFxCacheFreshness(10), // minutes
  };

  const allHealthy = Object.values(checks).every(c => c.healthy);

  return {
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date(),
  };
}
```

### 8.2 Alert Conditions

| Condition | Severity | Action |
|-----------|----------|--------|
| BOG sync failed | High | Email + Slack alert |
| BOG data >35 days stale | Medium | Dashboard warning |
| FX feed unavailable | Medium | Use fallback rates |
| WDI sync failed | Low | Log only (quarterly) |

---

## 9. Implementation Roadmap

### Phase 1: Core Scrapers (Week 1)

| Task | Effort | Priority |
|------|--------|----------|
| Install dependencies (axios, cheerio, node-cron) | 0.5 day | P0 |
| Implement BOG Scraper | 2 days | P0 |
| Implement WDI Client | 1 day | P0 |
| Implement FX Feed Service | 1 day | P0 |
| Unit tests for scrapers | 1 day | P1 |

### Phase 2: Integration (Week 2)

| Task | Effort | Priority |
|------|--------|----------|
| Create scheduler | 1 day | P0 |
| Add sync API endpoints | 0.5 day | P0 |
| Update economic service | 1 day | P0 |
| Database migrations | 0.5 day | P0 |
| Integration tests | 1 day | P1 |

### Phase 3: Production (Week 3)

| Task | Effort | Priority |
|------|--------|----------|
| Configure environment | 0.5 day | P0 |
| Initial data backfill | 1 day | P0 |
| Monitoring setup | 1 day | P1 |
| Documentation | 0.5 day | P1 |
| Load testing | 0.5 day | P2 |

---

## 10. Summary

### Data Source Matrix

| Indicator | Primary | Frequency | Backup | Latency |
|-----------|---------|-----------|--------|---------|
| **Policy Rate** | BoG | Monthly | — | ~1 week |
| **Inflation** | BoG | Monthly | WDI (annual) | ~2 weeks |
| **GDP Growth** | BoG | Quarterly | WDI (annual) | ~1 month |
| **Unemployment** | WDI | Annual | — | ~6 months |
| **Exchange Rate (live)** | yfinance | 5 min | OXR | ~15 min |
| **Exchange Rate (official)** | BoG | Daily | — | EOD |
| **Mortgage Rate** | BoG | Monthly | — | ~2 weeks |
| **Prime Rate** | BoG | Monthly | — | ~1 week |

### Key Benefits

1. **Authoritative Data**: BoG as primary source for Ghana-specific monetary data
2. **Historical Depth**: WDI provides 60+ years of validated historical data
3. **Real-Time FX**: Live exchange rates for currency conversion
4. **Automated Updates**: Scheduled jobs reduce manual work
5. **Fault Tolerance**: Multiple fallback sources for each indicator
6. **Audit Trail**: Full sync history and data provenance tracking

---

*This architecture ensures PROPMETRIK has reliable, timely, and authoritative economic data to power the Housing Affordability Index and market intelligence features.*

Week 1: Core scrapers (BoG, WDI, FX)
Week 2: Integration (scheduler, endpoints, tests)
Week 3: Production (backfill, monitoring, docs)