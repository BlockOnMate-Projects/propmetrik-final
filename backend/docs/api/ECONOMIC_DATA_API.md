# PropMetrik Economic Data API

## Overview

The Economic Data API provides access to Ghana's macroeconomic indicators, exchange rates, and construction costs. Data is sourced from:

- **Bank of Ghana (BOG)**: Official monetary policy, exchange rates, interest rates
- **World Bank WDI**: Historical economic indicators (GDP, inflation, unemployment)
- **ForexRate-API**: Real-time exchange rates

Base URL: `/api/v1/data-hub`

---

## Table of Contents

1. [Economic Indicators](#1-economic-indicators)
2. [Exchange Rates](#2-exchange-rates)
3. [Construction Costs](#3-construction-costs)
4. [Sync Management](#4-sync-management)
5. [Scheduler Management](#5-scheduler-management)
6. [Monitoring](#6-monitoring)

---

## 1. Economic Indicators

### Get Economic Snapshot

Returns the latest value for all economic indicators.

**Endpoint:** `GET /economic/snapshot`

**Response:**
```json
{
  "success": true,
  "data": {
    "inflation_rate": {
      "value": 23.2,
      "effective_date": "2024-12-01",
      "source": "Bank of Ghana"
    },
    "gdp_growth": {
      "value": 5.1,
      "effective_date": "2024-09-30",
      "source": "Bank of Ghana"
    },
    "policy_rate": {
      "value": 29.0,
      "effective_date": "2024-12-01",
      "source": "Bank of Ghana"
    },
    "unemployment_rate": {
      "value": 4.7,
      "effective_date": "2023-12-31",
      "source": "World Bank WDI"
    }
  },
  "timestamp": "2026-01-05T12:00:00Z"
}
```

---

### Get Specific Indicator

Get historical data for a specific indicator.

**Endpoint:** `GET /economic/indicator/:type`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Indicator type (see below) |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `startDate` | string | 1 year ago | Start date (YYYY-MM-DD) |
| `endDate` | string | today | End date (YYYY-MM-DD) |
| `source` | string | all | Filter by source name |

**Available Indicator Types:**
- `inflation_rate`
- `gdp_growth`
- `unemployment_rate`
- `policy_rate` / `interest_rate_policy`
- `prime_rate`
- `lending_rate`
- `mortgage_rate_avg`
- `exchange_rate_usd`
- `exchange_rate_gbp`
- `exchange_rate_eur`

**Example Request:**
```bash
curl "http://localhost:4000/api/v1/data-hub/economic/indicator/inflation_rate?startDate=2023-01-01"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "indicator_type": "inflation_rate",
      "value": 23.2,
      "effective_date": "2024-12-01",
      "period_type": "monthly",
      "source_name": "Bank of Ghana",
      "unit": "percentage"
    }
  ],
  "meta": {
    "count": 24,
    "startDate": "2023-01-01",
    "endDate": "2024-12-31"
  }
}
```

---

### Get Indicator History

Get historical trend for an indicator.

**Endpoint:** `GET /economic/history`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Indicator type |
| `years` | number | No (default: 5) | Years of history |

---

## 2. Exchange Rates

### Get Live Exchange Rate

Get real-time exchange rate from cache (updated every 5 minutes).

**Endpoint:** `GET /economic/exchange-rate/:currency`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `currency` | string | Currency code (USD, GBP, EUR, CNY, NGN) |

**Example Request:**
```bash
curl "http://localhost:4000/api/v1/data-hub/economic/exchange-rate/USD"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pair": "USD/GHS",
    "rate": 10.4569,
    "source": "ForexRate-API",
    "timestamp": "2026-01-05T10:30:00Z",
    "isOfficial": false
  }
}
```

---

### Get All Live FX Rates

**Endpoint:** `GET /economic/fx/live`

**Response:**
```json
{
  "success": true,
  "data": {
    "USD": { "rate": 10.4569, "source": "ForexRate-API", "timestamp": "..." },
    "GBP": { "rate": 14.0748, "source": "ForexRate-API", "timestamp": "..." },
    "EUR": { "rate": 12.2553, "source": "ForexRate-API", "timestamp": "..." },
    "CNY": { "rate": 1.4953, "source": "ForexRate-API", "timestamp": "..." },
    "NGN": { "rate": 0.0073, "source": "ForexRate-API", "timestamp": "..." }
  }
}
```

---

### Currency Conversion

Convert foreign currency to GHS.

**Endpoint:** `POST /economic/convert`

**Request Body:**
```json
{
  "amount": 1000,
  "fromCurrency": "USD"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "original_amount": 1000,
    "converted_amount": 10456.90,
    "rate": 10.4569,
    "from_currency": "USD",
    "to_currency": "GHS",
    "source": "ForexRate-API",
    "timestamp": "2026-01-05T10:30:00Z"
  }
}
```

---

### Calculate Affordability Index

**Endpoint:** `POST /economic/affordability`

**Request Body:**
```json
{
  "property_price": 500000,
  "monthly_income": 8000,
  "region": "GR"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "affordability_index": 62.5,
    "price_to_income_ratio": 5.21,
    "monthly_payment": 4500,
    "debt_to_income": 0.56,
    "mortgage_rate_used": 29.0,
    "is_affordable": false
  }
}
```

---

## 3. Construction Costs

### Get Material Prices

**Endpoint:** `GET /construction/materials`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | Material category |
| `region` | string | Region code (GR, AR, etc.) |

---

### Get Labor Rates

**Endpoint:** `GET /construction/labor`

---

### Calculate Construction Estimate

**Endpoint:** `POST /construction/estimate`

**Request Body:**
```json
{
  "buildingType": "residential_single",
  "squareMeters": 150,
  "finishLevel": "standard",
  "region": "GR"
}
```

---

## 4. Sync Management

### Trigger Manual Sync

Manually trigger data sync from a source.

**Endpoint:** `POST /economic/sync/:source`

**Path Parameters:**
| Parameter | Values |
|-----------|--------|
| `source` | `bog`, `wdi`, `fx`, `all` |

**Example:**
```bash
curl -X POST "http://localhost:4000/api/v1/data-hub/economic/sync/fx"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "source": "ForexRate-API",
    "status": "success",
    "records_saved": 5,
    "started_at": "2026-01-05T10:30:00Z",
    "completed_at": "2026-01-05T10:30:02Z"
  }
}
```

---

### Get Sync Status

**Endpoint:** `GET /economic/sync/status`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "source": "Bank of Ghana",
      "is_running": false,
      "last_sync": {
        "started_at": "2026-01-01T08:00:00Z",
        "completed_at": "2026-01-01T08:02:30Z",
        "status": "success",
        "records_saved": 45
      },
      "health": {
        "is_healthy": true,
        "consecutive_failures": 0,
        "success_rate": 95.5
      }
    }
  ]
}
```

---

### Get Sync History

**Endpoint:** `GET /economic/sync/history`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `source` | string | all | Filter by source |
| `limit` | number | 20 | Max records |

---

### Sync Health Check

**Endpoint:** `GET /economic/sync/health`

**Response:**
```json
{
  "success": true,
  "data": {
    "bog": true,
    "wdi": true,
    "fx": true,
    "cache": true
  },
  "all_healthy": true
}
```

---

## 5. Scheduler Management

### Get Scheduler Status

**Endpoint:** `GET /scheduler/status`

**Response:**
```json
{
  "success": true,
  "data": {
    "isActive": true,
    "jobs": [
      {
        "name": "bog-sync",
        "cronExpression": "0 8 1 * *",
        "lastRun": "2026-01-01T08:00:00Z",
        "lastStatus": "success",
        "nextRun": "2026-02-01T08:00:00Z",
        "runCount": 12,
        "errorCount": 0
      },
      {
        "name": "fx-cache-update",
        "cronExpression": "*/5 * * * *",
        "lastRun": "2026-01-05T10:30:00Z",
        "lastStatus": "success",
        "runCount": 8640,
        "errorCount": 3
      }
    ]
  }
}
```

---

### Start Scheduler

**Endpoint:** `POST /scheduler/start`

---

### Stop Scheduler

**Endpoint:** `POST /scheduler/stop`

---

### Trigger Immediate Sync

**Endpoint:** `POST /scheduler/trigger/:source`

**Path Parameters:**
| Parameter | Values |
|-----------|--------|
| `source` | `BOG`, `WDI`, `FX`, `all` |

---

## 6. Monitoring

### Get Full Monitoring Report

Comprehensive report including data freshness, source health, and alerts.

**Endpoint:** `GET /monitoring/report`

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-01-05T12:00:00Z",
    "overallStatus": "healthy",
    "dataFreshness": [
      {
        "source": "Bank of Ghana",
        "lastUpdate": "2024-12-01",
        "thresholdDays": 35,
        "ageInDays": 35,
        "isStale": false,
        "status": "healthy"
      }
    ],
    "sourceHealth": [
      {
        "source": "Bank of Ghana",
        "status": "healthy",
        "consecutiveFailures": 0,
        "successRate": 95.5,
        "totalSyncsLast30Days": 30
      }
    ],
    "alerts": [],
    "metrics": {
      "totalIndicators": 150,
      "indicatorsBySource": {
        "Bank of Ghana": 45,
        "World Bank WDI": 100,
        "ForexRate-API": 5
      },
      "oldestData": "2000-01-01",
      "newestData": "2026-01-05"
    }
  }
}
```

---

### Check Data Freshness

**Endpoint:** `GET /monitoring/freshness`

---

### Get Source Health

**Endpoint:** `GET /monitoring/health`

---

### Get Active Alerts

**Endpoint:** `GET /monitoring/alerts`

**Response:**
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "stale_data_bank_of_ghana",
        "severity": "warning",
        "title": "Stale data from Bank of Ghana",
        "message": "Data is 40 days old (threshold: 35 days)",
        "source": "Bank of Ghana",
        "createdAt": "2026-01-05T12:00:00Z",
        "acknowledged": false
      }
    ],
    "count": 1,
    "hasCritical": false
  }
}
```

---

### Acknowledge Alert

**Endpoint:** `POST /monitoring/alerts/:alertId/acknowledge`

---

### Get Data Metrics

**Endpoint:** `GET /monitoring/metrics`

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common error codes:
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request parameters
- `ALREADY_RUNNING` - Sync already in progress
- `SOURCE_UNAVAILABLE` - Data source temporarily unavailable

---

## Rate Limits

| Endpoint Category | Rate Limit |
|-------------------|------------|
| Read endpoints | 100/minute |
| Sync triggers | 10/minute |
| Scheduler management | 5/minute |

---

## Caching

| Data Type | Cache TTL |
|-----------|-----------|
| FX rates | 5 minutes |
| BOG indicators | 1 hour |
| WDI indicators | 24 hours |
| Economic snapshot | 15 minutes |

---

## Changelog

### v1.0.0 (January 2026)
- Initial release
- BOG, WDI, and FX data sources
- Automated scheduler
- Monitoring and alerting
