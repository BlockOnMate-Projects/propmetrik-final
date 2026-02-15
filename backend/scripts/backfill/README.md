# Economic Data Backfill Scripts

These scripts populate the PROPMETRIK database with historical economic data from various sources.

## Prerequisites

1. Database migrations must be applied: `npm run migrate`
2. Environment variables configured (see `.env.example`)
3. Node.js and npm installed

## Scripts

### 1. WDI Historical Backfill (`backfill-wdi.ts`)

Fetches historical economic data from World Bank WDI API (2000-present):
- Inflation rate
- GDP growth
- Unemployment rate
- Lending rate
- Exchange rate (annual average)
- GDP per capita
- Population

**Usage:**
```bash
npx ts-node scripts/backfill/backfill-wdi.ts
```

**Options:**
```bash
# Custom date range
npx ts-node scripts/backfill/backfill-wdi.ts --start-year=2010 --end-year=2024

# Specific indicators only
npx ts-node scripts/backfill/backfill-wdi.ts --indicators=FP.CPI.TOTL.ZG,NY.GDP.MKTP.KD.ZG
```

### 2. BOG Historical Backfill (`backfill-bog.ts`)

Scrapes available data from Bank of Ghana website:
- Exchange rates (USD, GBP, EUR)
- Interest rates (policy rate, lending rate, prime rate)
- Real sector data (inflation, GDP growth)

**Usage:**
```bash
npx ts-node scripts/backfill/backfill-bog.ts
```

**Note:** BOG website only shows recent data (typically last 2-3 years). For older data, use WDI.

### 3. FX Rate Backfill (`backfill-fx.ts`)

Populates recent FX rates from ForexRate-API:

**Usage:**
```bash
npx ts-node scripts/backfill/backfill-fx.ts
```

### 4. Full Backfill (`backfill-all.ts`)

Runs all backfill scripts in order:

**Usage:**
```bash
npx ts-node scripts/backfill/backfill-all.ts
```

## Data Priority

When the same indicator exists from multiple sources:
1. **Bank of Ghana** - Official, most authoritative for Ghana
2. **World Bank WDI** - Validated, standardized international data
3. **ForexRate-API** - Real-time FX (unofficial)

The database uses `ON CONFLICT` to update existing records.

## Expected Duration

| Script | Duration | Records |
|--------|----------|---------|
| WDI Backfill | 2-3 minutes | ~150-200 records |
| BOG Backfill | 3-5 minutes | ~100-150 records |
| FX Backfill | 30 seconds | 5-10 records |
| Full Backfill | 5-10 minutes | ~300 records |

## Monitoring

Check backfill progress in logs:
```bash
tail -f /tmp/propmetrik.log | grep -i backfill
```

View sync log entries:
```sql
SELECT * FROM economic_data_sync_log 
WHERE sync_type = 'backfill' 
ORDER BY started_at DESC;
```
