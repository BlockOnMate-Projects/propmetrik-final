# Valuation Engine

PROPMETRIK's hybrid valuation engine combining TypeScript orchestration with Python calculations.

## Architecture

```
Frontend (Next.js)
       ↓
TypeScript Backend (Port 4000)
       ├── Workflow Services (TypeScript)
       │   ├── valuationEngineService - Main orchestrator
       │   ├── valuationReportService - PDF/report generation
       │   ├── floorPlanService - Floor plan management
       │   ├── hbuAnalysisService - Highest & Best Use
       │   ├── overrideTrackingService - Manual overrides
       │   └── contributionWorkflowService - Gap detection
       │
       └── pythonClient ──→ Python Valuation Service (Port 8001)
                            ├── Sales Comparison Method
                            ├── Cost Approach Method
                            ├── Income Approach Method
                            ├── Residual Method (Development Land)
                            ├── Profits Method (Hotels, Hospitality)
                            ├── DRC Method (Specialized Properties)
                            ├── Confidence Scoring
                            ├── Sensitivity Analysis
                            ├── Reconciliation
                            └── Market Conditions
```

## Folder Structure

```
valuation-engine/
├── index.ts                    # Service exports
├── types.ts                    # TypeScript type definitions
├── valuationEngineService.ts   # Main orchestrator (TypeScript)
├── pythonClient.ts             # HTTP client for Python service
├── valuationReportService.ts   # Report generation
├── floorPlanService.ts         # Floor plan management
├── hbuAnalysisService.ts       # HBU analysis
├── overrideTrackingService.ts  # Override tracking
├── contributionWorkflowService.ts # Gap detection & contributions
├── README.md                   # This file
└── python/                     # Python valuation service
    ├── app/
    │   ├── main.py             # FastAPI application
    │   ├── config.py           # Configuration
    │   ├── adapters/           # External service adapters
    │   ├── models/             # Database models
    │   ├── schemas/            # Pydantic schemas
    │   ├── services/           # Business logic services
    │   └── utils/              # Utility functions
    ├── requirements.txt        # Python dependencies
    └── simple_start.py         # Standalone startup script
```

## Python Service Endpoints

### Health & Info
- `GET /health` - Service health check
- `GET /info` - Service information

### Valuation Methods
- `POST /api/v1/methods/sales-comparison` - Sales Comparison Approach
- `POST /api/v1/methods/cost-approach` - Cost Approach
- `POST /api/v1/methods/income-approach` - Income Approach
- `POST /api/v1/methods/residual` - Residual Method (development land)
- `POST /api/v1/methods/profits` - Profits Method (hotels, pubs)
- `POST /api/v1/methods/drc` - DRC Method (specialized properties)
- `POST /api/v1/methods/calculate-all` - Calculate all applicable methods

### Supporting Services
- `POST /api/v1/reconciliation` - Reconcile multiple method results
- `POST /api/v1/sensitivity` - Sensitivity analysis
- `POST /api/v1/confidence` - Confidence scoring
- `POST /api/v1/market/conditions` - Market conditions lookup

## Usage

### Start Python Service

```bash
cd python
pip install -r requirements.txt
python simple_start.py
# or
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### TypeScript Integration

```typescript
import { pythonClient } from './pythonClient';

// Single method
const result = await pythonClient.salesComparison({
  id: 'prop-123',
  property_type: 'residential',
  region: 'Greater Accra',
  building_size_sqm: 250,
  bedrooms: 4,
});

// Multiple methods
const allResults = await pythonClient.calculateAllMethods(
  property,
  ['sales_comparison', 'cost_approach', 'income_approach']
);

// Reconciliation
const reconciled = await pythonClient.reconcile({
  method_results: { ... },
  property_type: 'residential',
});
```

## Ghana Market Data

The Python service includes real Ghana market data:

### Construction Costs (GHS/sqm)
- Greater Accra: 4,500 - 8,000
- Ashanti: 3,800 - 6,500
- Western: 3,500 - 6,000

### Land Values (GHS/sqm)
- Airport Residential: 6,000 - 15,000
- East Legon: 5,000 - 12,000
- Cantonments: 8,000 - 20,000

### Cap Rates
- Residential: 5-7%
- Commercial: 7-10%
- Industrial: 8-12%

### Rental Rates (GHS/sqm/month)
- Residential: 8-15
- Commercial/Office: 25-45
- Retail: 30-60

## Configuration

Environment variables:
- `PYTHON_VALUATION_URL` - Python service URL (default: http://localhost:8001)
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string (optional)

## Development

### Running Tests

```bash
# TypeScript tests
npm test

# Python tests
cd python
pytest
```

### Adding a New Valuation Method

1. Add endpoint in `python/app/main.py`
2. Add method in `pythonClient.ts`
3. Update `valuationEngineService.ts` if orchestration changes
4. Add to `executeMethod` dispatch table

## Version History

- **2.0.0** - Hybrid architecture (TypeScript + Python)
- **1.0.0** - Initial TypeScript-only implementation
