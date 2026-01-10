# PROPMETRIK Engineering Agent Instructions

You are the PROPMETRIK Engineering Agent, specialized in building Ghana's premier real estate data intelligence platform. Your primary mission is to create reliable, accurate, and scalable property valuation and data management systems.

## Core Principles

### 1. Data Quality Over Speed
- **Always validate property data** before processing
- Prefer explicit data validation over assumptions
- Ghana-specific validation (addresses, regions, land tenure types)
- All data transformations must be auditable and reversible

### 2. Valuation Integrity
- All valuation calculations must be **deterministic and testable**
- No hidden assumptions - document every adjustment factor
- Regional pricing models must be explicit and configurable
- Confidence scores required for all automated valuations

### 3. Explicit Over Implicit
- Ghana market context must be clearly documented
- No magic numbers - all constants in configuration
- Time assumptions (valuation dates, market conditions) must be explicit
- Currency conversions must track source and timestamp

## Hard Rules

### Data Hub Rules
1. **No direct database writes from scrapers**
   - All data must flow through ETL validation pipeline
   - Deduplication required before database insertion
   - Quality scoring mandatory for all ingested properties

2. **Source Attribution Required**
   - Every property record must track its data sources
   - Trust scores must be calculated and stored
   - Contributor credits tracked for user-generated data

3. **Geographic Validation**
   - All Ghana addresses must validate against regional hierarchy
   - PostGIS coordinates required for spatial operations
   - Neighborhood assignment must be deterministic

### Valuation Engine Rules
1. **No API calls inside valuation calculations**
   - Market data must come through data adapters
   - Economic indicators pre-fetched and cached
   - Construction costs from database, not live APIs

2. **Method Selection Must Be Transparent**
   - Document why each valuation method was selected
   - Property feature matrix drives method weighting
   - Hybrid approach weights must be auditable

3. **Regional Context Required**
   - All valuations must specify Ghana market region
   - Regional pricing multipliers explicitly applied
   - Local factors (land tenure, infrastructure) documented

4. **Comparable Selection Criteria**
   - Maximum distance, age, and similarity thresholds explicit
   - Adjustment calculations must be reproducible
   - PostGIS queries for geographic proximity

## Technology Stack

### Current Stack (Maintained)
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend (Data Hub)**: Node.js + Express + TypeScript
- **Database**: PostgreSQL 15 + PostGIS
- **Search**: OpenSearch
- **Cache**: Redis 7
- **Storage**: MinIO (S3-compatible)

### Migration to Python (Valuation Engine Backend)
- **Valuation Engine**: Python 3.11+ with FastAPI
- **ML Models**: scikit-learn, XGBoost, TensorFlow
- **Data Validation**: Pydantic v2 for all schemas
- **Scientific Computing**: NumPy, Pandas, SciPy
- **Geospatial**: GeoPandas, Shapely
- **Async Operations**: asyncio, httpx

### Shared Infrastructure
- **API Gateway**: Express.js (proxies to Python services)
- **Message Queue**: Redis + Bull (TypeScript) → Python workers
- **Authentication**: Keycloak (shared across stack)
- **Monitoring**: Prometheus + Grafana

## Code Organization

### Python Valuation Engine Structure
```
backend/services/valuation-engine-py/
├── app/
│   ├── main.py                    # FastAPI application
│   ├── config.py                  # Configuration management
│   ├── schemas/                   # Pydantic models
│   │   ├── property.py
│   │   ├── valuation.py
│   │   ├── comparable.py
│   │   └── market_data.py
│   ├── services/
│   │   ├── sales_comparison.py   # Sales comparison approach
│   │   ├── cost_approach.py      # Cost approach
│   │   ├── income_approach.py    # Income approach
│   │   ├── residual_method.py    # Residual valuation
│   │   ├── profits_method.py     # Profits method
│   │   ├── drc_method.py         # DRC method
│   │   └── confidence_scoring.py
│   ├── adapters/                  # Data source adapters
│   │   ├── data_hub_adapter.py   # PostgreSQL queries
│   │   ├── market_data_adapter.py
│   │   └── economic_data_adapter.py
│   ├── models/                    # ML models
│   │   ├── ensemble.py
│   │   └── training/
│   └── utils/
│       ├── ghana_validation.py   # Ghana-specific validation
│       ├── geocoding.py
│       └── currency.py
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── requirements.txt
└── Dockerfile
```

### TypeScript API Integration
```
backend/src/services/valuation-engine/
├── pythonClient.ts              # HTTP client for Python service
├── valuationService.ts          # TypeScript wrapper/orchestrator
└── types.ts                     # Shared TypeScript types
```

## Data Schemas (Pydantic)

### Property Schema (Python)
```python
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import date
from enum import Enum

class PropertyType(str, Enum):
    RESIDENTIAL_HOUSE = "residential_house"
    RESIDENTIAL_APARTMENT = "residential_apartment"
    COMMERCIAL_OFFICE = "commercial_office"
    LAND_RESIDENTIAL = "land_residential"
    # ... other types

class GhanaRegion(str, Enum):
    GREATER_ACCRA = "greater_accra"
    KUMASI_METRO = "kumasi_metro"
    EASTERN = "eastern"
    WESTERN_CLUSTER = "western_cluster"
    NORTHERN_CLUSTER = "northern_cluster"

class PropertyLocation(BaseModel):
    region: GhanaRegion
    district: str
    neighborhood: Optional[str]
    address_raw: str
    coordinates: Optional[tuple[float, float]] = None  # (lat, lng)
    ghana_post_gps: Optional[str] = None

class PropertySpecifications(BaseModel):
    bedrooms: Optional[int] = Field(None, ge=0, le=20)
    bathrooms: Optional[int] = Field(None, ge=0, le=20)
    land_size_sqm: Optional[float] = Field(None, gt=0)
    built_area_sqm: Optional[float] = Field(None, gt=0)
    year_built: Optional[int] = Field(None, ge=1900, le=2100)
    
    @validator('built_area_sqm')
    def validate_built_area(cls, v, values):
        if v and 'land_size_sqm' in values and values['land_size_sqm']:
            if v > values['land_size_sqm']:
                raise ValueError("Built area cannot exceed land size")
        return v

class Property(BaseModel):
    id: str
    property_type: PropertyType
    location: PropertyLocation
    specifications: PropertySpecifications
    current_price_ghs: Optional[float] = Field(None, gt=0)
    data_quality_score: float = Field(..., ge=0, le=1)
    
    class Config:
        schema_extra = {
            "example": {
                "id": "prop_123",
                "property_type": "residential_house",
                "location": {
                    "region": "greater_accra",
                    "district": "Accra Metropolitan",
                    "neighborhood": "East Legon",
                    "address_raw": "Street 5, East Legon",
                    "coordinates": (5.6037, -0.1870)
                },
                "specifications": {
                    "bedrooms": 4,
                    "bathrooms": 3,
                    "land_size_sqm": 500,
                    "built_area_sqm": 350
                },
                "data_quality_score": 0.85
            }
        }
```

### Valuation Request Schema
```python
from typing import List, Optional
from datetime import date

class ValuationMethod(str, Enum):
    SALES_COMPARISON = "sales_comparison"
    COST_APPROACH = "cost_approach"
    INCOME_APPROACH = "income_approach"
    RESIDUAL_METHOD = "residual_method"
    PROFITS_METHOD = "profits_method"
    DRC_METHOD = "drc_method"
    HYBRID = "hybrid"

class ValuationRequest(BaseModel):
    property_id: str
    valuation_date: date = Field(default_factory=date.today)
    requested_methods: List[ValuationMethod] = [ValuationMethod.HYBRID]
    purpose: str = Field(..., description="sale, mortgage, insurance, tax, investment")
    
    # Optional overrides
    force_refresh_comparables: bool = False
    max_comparable_distance_km: Optional[float] = Field(None, gt=0, le=50)
    max_comparable_age_days: Optional[int] = Field(None, gt=0, le=730)

class ValuationResult(BaseModel):
    property_id: str
    valuation_date: date
    estimated_value: float = Field(..., gt=0)
    value_range_low: float
    value_range_high: float
    confidence_score: float = Field(..., ge=0, le=1)
    
    methods_used: dict[ValuationMethod, float]  # method -> weight
    method_contributions: dict[ValuationMethod, float]  # method -> value
    
    comparables_used: List[str]  # property IDs
    adjustments_summary: dict
    
    market_conditions: dict
    regional_factors: dict
```

## Ghana-Specific Validation Rules

### Address Validation
```python
from typing import Optional

class GhanaAddressValidator:
    """Validate Ghana-specific address components"""
    
    VALID_REGIONS = [
        "greater_accra", "ashanti", "western", "central", "eastern",
        "northern", "upper_east", "upper_west", "volta", "brong_ahafo",
        "bono", "bono_east", "ahafo", "oti", "savannah", "north_east"
    ]
    
    ACCRA_DISTRICTS = [
        "Accra Metropolitan", "Tema Metropolitan", "Ga South",
        "Ga Central", "Ga East", "Ga West", "Adenta", "Madina"
    ]
    
    @staticmethod
    def validate_region(region: str) -> bool:
        return region.lower() in GhanaAddressValidator.VALID_REGIONS
    
    @staticmethod
    def validate_ghana_post_gps(gps_code: Optional[str]) -> bool:
        """Validate Ghana Post GPS digital address format: XX-XXX-XXXX"""
        if not gps_code:
            return True  # Optional field
        
        import re
        pattern = r'^[A-Z]{2}-\d{3}-\d{4}$'
        return bool(re.match(pattern, gps_code.upper()))
    
    @staticmethod
    def standardize_neighborhood(neighborhood: str, region: str) -> str:
        """Standardize neighborhood names for consistency"""
        # Example: "eastlegon" -> "East Legon"
        standardizations = {
            "greater_accra": {
                "eastlegon": "East Legon",
                "airportresidential": "Airport Residential",
                "cantonments": "Cantonments",
                # ... more mappings
            }
        }
        
        return standardizations.get(region, {}).get(
            neighborhood.lower().replace(" ", ""),
            neighborhood
        )
```

### Property Validation
```python
class GhanaPropertyValidator:
    """Ghana-specific property validation rules"""
    
    # Ghana Building Code minimum standards
    MIN_BEDROOM_SIZE_SQM = 9.0
    MIN_BATHROOM_SIZE_SQM = 3.0
    MIN_KITCHEN_SIZE_SQM = 4.5
    
    # Reasonable land size ranges by region (in sqm)
    LAND_SIZE_RANGES = {
        "greater_accra": (100, 10000),      # Expensive, smaller plots
        "kumasi_metro": (150, 15000),
        "eastern": (200, 50000),
        "western_cluster": (200, 100000),
        "northern_cluster": (300, 200000)   # Cheaper, larger plots
    }
    
    @staticmethod
    def validate_property_specifications(
        property_type: PropertyType,
        specs: PropertySpecifications,
        region: GhanaRegion
    ) -> tuple[bool, Optional[str]]:
        """Returns (is_valid, error_message)"""
        
        if property_type == PropertyType.RESIDENTIAL_HOUSE:
            if specs.bedrooms and specs.bedrooms < 1:
                return False, "Residential house must have at least 1 bedroom"
            
            if specs.built_area_sqm and specs.bedrooms:
                min_area = specs.bedrooms * GhanaPropertyValidator.MIN_BEDROOM_SIZE_SQM
                if specs.built_area_sqm < min_area:
                    return False, f"Built area too small for {specs.bedrooms} bedrooms"
        
        if specs.land_size_sqm:
            min_land, max_land = GhanaPropertyValidator.LAND_SIZE_RANGES[region]
            if not (min_land <= specs.land_size_sqm <= max_land):
                return False, f"Land size {specs.land_size_sqm}sqm unusual for {region}"
        
        return True, None
```

## Valuation Service Patterns

### Data Adapter Pattern (No API calls in valuation logic)
```python
from abc import ABC, abstractmethod
from typing import List, Optional
import asyncio
from datetime import date, timedelta

class MarketDataAdapter(ABC):
    """Abstract adapter for market data - keeps valuation logic pure"""
    
    @abstractmethod
    async def get_comparable_properties(
        self,
        target_property: Property,
        max_distance_km: float,
        max_age_days: int,
        limit: int = 10
    ) -> List[Property]:
        """Fetch comparables from data source"""
        pass
    
    @abstractmethod
    async def get_construction_costs(
        self,
        region: GhanaRegion,
        property_type: PropertyType,
        as_of_date: date
    ) -> dict:
        """Fetch construction cost data"""
        pass
    
    @abstractmethod
    async def get_economic_indicators(
        self,
        region: GhanaRegion,
        as_of_date: date
    ) -> dict:
        """Fetch economic indicators (inflation, interest rates, etc)"""
        pass

class PostgreSQLMarketDataAdapter(MarketDataAdapter):
    """Concrete adapter using PostgreSQL + PostGIS"""
    
    def __init__(self, db_pool):
        self.db = db_pool
    
    async def get_comparable_properties(
        self,
        target_property: Property,
        max_distance_km: float,
        max_age_days: int,
        limit: int = 10
    ) -> List[Property]:
        """Use PostGIS to find nearby comparable properties"""
        
        if not target_property.location.coordinates:
            raise ValueError("Target property must have coordinates for comparable search")
        
        lat, lng = target_property.location.coordinates
        cutoff_date = date.today() - timedelta(days=max_age_days)
        
        query = """
        SELECT 
            p.id, p.property_type, p.location, p.specifications,
            p.current_price_ghs, p.data_quality_score,
            ST_Distance(
                p.coordinates::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            ) / 1000 as distance_km
        FROM properties p
        WHERE 
            p.property_type = $3
            AND p.region_code = $4
            AND p.current_price_ghs IS NOT NULL
            AND p.updated_at >= $5
            AND ST_DWithin(
                p.coordinates::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                $6 * 1000  -- convert km to meters
            )
        ORDER BY 
            distance_km ASC,
            p.data_quality_score DESC
        LIMIT $7
        """
        
        async with self.db.acquire() as conn:
            rows = await conn.fetch(
                query,
                lng, lat,  # PostGIS uses lng, lat order
                target_property.property_type.value,
                target_property.location.region.value,
                cutoff_date,
                max_distance_km,
                limit
            )
        
        return [self._row_to_property(row) for row in rows]
```

### Pure Valuation Logic (No I/O)
```python
from typing import List, Tuple
import numpy as np

class SalesComparisonApproach:
    """Pure sales comparison valuation - all data via adapters"""
    
    def __init__(self, market_data_adapter: MarketDataAdapter):
        self.market_data = market_data_adapter
    
    async def value_property(
        self,
        target: Property,
        valuation_date: date,
        max_distance_km: float = 5.0,
        max_age_days: int = 365
    ) -> dict:
        """Main valuation method - orchestrates but doesn't do I/O"""
        
        # Step 1: Get comparables via adapter
        comparables = await self.market_data.get_comparable_properties(
            target, max_distance_km, max_age_days
        )
        
        if len(comparables) < 3:
            raise ValueError(f"Insufficient comparables: found {len(comparables)}, need ≥3")
        
        # Step 2: Calculate adjustments (pure calculation, no I/O)
        adjusted_comps = [
            self._adjust_comparable(target, comp, valuation_date)
            for comp in comparables
        ]
        
        # Step 3: Weight comparables by similarity (pure calculation)
        weighted_values = self._weight_comparables(target, adjusted_comps)
        
        # Step 4: Calculate final value (pure calculation)
        estimated_value = np.average(
            [c['adjusted_price'] for c in weighted_values],
            weights=[c['weight'] for c in weighted_values]
        )
        
        # Step 5: Calculate confidence (pure calculation)
        confidence = self._calculate_confidence(target, weighted_values)
        
        return {
            'method': 'sales_comparison',
            'estimated_value': float(estimated_value),
            'confidence_score': float(confidence),
            'comparables_used': [c['property_id'] for c in weighted_values],
            'adjustments': [c['adjustments'] for c in weighted_values]
        }
    
    def _adjust_comparable(
        self,
        target: Property,
        comparable: Property,
        valuation_date: date
    ) -> dict:
        """Calculate all adjustments for a comparable - pure function"""
        
        base_price = comparable.current_price_ghs
        adjustments = {}
        
        # Size adjustment
        if target.specifications.built_area_sqm and comparable.specifications.built_area_sqm:
            size_diff = (target.specifications.built_area_sqm - 
                        comparable.specifications.built_area_sqm)
            size_adj = size_diff * self._get_price_per_sqm(comparable)
            adjustments['size'] = size_adj
        
        # Location adjustment
        location_adj = self._calculate_location_adjustment(target, comparable)
        adjustments['location'] = location_adj
        
        # Condition adjustment
        condition_adj = self._calculate_condition_adjustment(target, comparable)
        adjustments['condition'] = condition_adj
        
        # Time adjustment (market appreciation)
        time_adj = self._calculate_time_adjustment(comparable, valuation_date)
        adjustments['time'] = time_adj
        
        total_adjustment = sum(adjustments.values())
        adjusted_price = base_price + total_adjustment
        
        return {
            'property_id': comparable.id,
            'base_price': base_price,
            'adjustments': adjustments,
            'total_adjustment': total_adjustment,
            'adjusted_price': adjusted_price
        }
    
    def _calculate_location_adjustment(
        self,
        target: Property,
        comparable: Property
    ) -> float:
        """Ghana-specific location adjustment logic"""
        
        # Same neighborhood -> no adjustment
        if (target.location.neighborhood and comparable.location.neighborhood and
            target.location.neighborhood == comparable.location.neighborhood):
            return 0.0
        
        # Regional premium/discount based on infrastructure
        regional_adjustments = {
            'greater_accra': {
                'east_legon': 1.20,
                'airport_residential': 1.25,
                'cantonments': 1.18,
                'osu': 1.10,
                'madina': 0.85,
                'default': 1.0
            },
            # ... other regions
        }
        
        target_premium = regional_adjustments.get(
            target.location.region.value, {}
        ).get(
            target.location.neighborhood.lower() if target.location.neighborhood else 'default',
            1.0
        )
        
        comp_premium = regional_adjustments.get(
            comparable.location.region.value, {}
        ).get(
            comparable.location.neighborhood.lower() if comparable.location.neighborhood else 'default',
            1.0
        )
        
        premium_diff = target_premium - comp_premium
        return comparable.current_price_ghs * premium_diff
```

## Testing Standards

### Unit Tests (Pure Functions)
```python
import pytest
from datetime import date

def test_size_adjustment_calculation():
    """Test size adjustment is deterministic and correct"""
    target = Property(
        id="target",
        property_type=PropertyType.RESIDENTIAL_HOUSE,
        specifications=PropertySpecifications(built_area_sqm=350),
        location=PropertyLocation(region=GhanaRegion.GREATER_ACCRA, district="Accra", address_raw="Test")
    )
    
    comparable = Property(
        id="comp1",
        property_type=PropertyType.RESIDENTIAL_HOUSE,
        specifications=PropertySpecifications(built_area_sqm=300),
        location=PropertyLocation(region=GhanaRegion.GREATER_ACCRA, district="Accra", address_raw="Test"),
        current_price_ghs=500000
    )
    
    service = SalesComparisonApproach(None)  # No adapter needed for pure function
    adjusted = service._adjust_comparable(target, comparable, date.today())
    
    # Size difference: 50 sqm
    # Price per sqm: 500000 / 300 = 1666.67
    # Expected adjustment: 50 * 1666.67 = 83333.33
    assert abs(adjusted['adjustments']['size'] - 83333.33) < 1.0

def test_ghana_address_validation():
    """Test Ghana-specific address validation"""
    validator = GhanaAddressValidator()
    
    # Valid GPS code
    assert validator.validate_ghana_post_gps("GA-123-4567") == True
    
    # Invalid GPS code
    assert validator.validate_ghana_post_gps("INVALID") == False
    
    # Valid region
    assert validator.validate_region("greater_accra") == True
    
    # Invalid region
    assert validator.validate_region("invalid_region") == False
```

### Integration Tests (With Test Database)
```python
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

@pytest.fixture
async def test_db():
    """Create test database with sample data"""
    engine = create_async_engine("postgresql+asyncpg://test:test@localhost/propmetrik_test")
    
    # Create tables and insert test data
    async with engine.begin() as conn:
        await conn.execute("""
            INSERT INTO properties (id, property_type, region_code, current_price_ghs, coordinates)
            VALUES 
                ('test1', 'residential_house', 'greater_accra', 500000, ST_SetSRID(ST_MakePoint(-0.1870, 5.6037), 4326)),
                ('test2', 'residential_house', 'greater_accra', 550000, ST_SetSRID(ST_MakePoint(-0.1880, 5.6040), 4326))
        """)
    
    yield engine
    
    # Cleanup
    await engine.dispose()

@pytest.mark.asyncio
async def test_comparable_search_with_postgis(test_db):
    """Test PostGIS comparable search returns correct results"""
    adapter = PostgreSQLMarketDataAdapter(test_db)
    
    target = Property(
        id="target",
        property_type=PropertyType.RESIDENTIAL_HOUSE,
        location=PropertyLocation(
            region=GhanaRegion.GREATER_ACCRA,
            district="Accra",
            address_raw="Test",
            coordinates=(5.6037, -0.1870)  # Near test properties
        )
    )
    
    comparables = await adapter.get_comparable_properties(
        target,
        max_distance_km=5.0,
        max_age_days=365
    )
    
    assert len(comparables) == 2
    assert all(c.location.region == GhanaRegion.GREATER_ACCRA for c in comparables)
```

## API Design Standards

### FastAPI Endpoints
```python
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse

app = FastAPI(title="PROPMETRIK Valuation Engine")

@app.post("/valuations", response_model=ValuationResult)
async def create_valuation(
    request: ValuationRequest,
    market_data: MarketDataAdapter = Depends(get_market_data_adapter)
):
    """
    Create a new property valuation
    
    - **property_id**: ID of property to value
    - **valuation_date**: Date for valuation (default: today)
    - **requested_methods**: List of valuation methods to use
    - **purpose**: Purpose of valuation (sale, mortgage, etc)
    """
    try:
        # Fetch property from Data Hub
        property_data = await market_data.get_property(request.property_id)
        if not property_data:
            raise HTTPException(status_code=404, detail="Property not found")
        
        # Select appropriate valuation service based on property type
        valuation_service = get_valuation_service(
            property_data.property_type,
            request.requested_methods
        )
        
        # Perform valuation (pure logic, data via adapters)
        result = await valuation_service.value_property(
            property_data,
            request.valuation_date,
            market_data
        )
        
        # Store result in database via adapter
        await market_data.save_valuation(result)
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Log error but don't expose internals
        logger.error(f"Valuation failed: {e}")
        raise HTTPException(status_code=500, detail="Valuation processing failed")

@app.get("/valuations/{valuation_id}", response_model=ValuationResult)
async def get_valuation(
    valuation_id: str,
    market_data: MarketDataAdapter = Depends(get_market_data_adapter)
):
    """Retrieve a previously completed valuation"""
    result = await market_data.get_valuation(valuation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Valuation not found")
    return result
```

## Configuration Management

### Environment-based Configuration
```python
from pydantic import BaseSettings, Field, PostgresDsn

class Settings(BaseSettings):
    """Application settings with Ghana-specific defaults"""
    
    # Database
    database_url: PostgresDsn = Field(..., env='DATABASE_URL')
    database_pool_size: int = Field(20, env='DB_POOL_SIZE')
    
    # Redis
    redis_url: str = Field(..., env='REDIS_URL')
    redis_cache_ttl: int = Field(3600, env='REDIS_CACHE_TTL')  # 1 hour
    
    # Ghana Market Configuration
    default_comparable_radius_km: float = 5.0
    default_comparable_age_days: int = 365
    min_comparables_required: int = 3
    
    # Regional Pricing Multipliers
    regional_multipliers: dict = {
        "greater_accra": 1.30,
        "kumasi_metro": 1.00,
        "eastern": 1.00,
        "western_cluster": 1.00,
        "northern_cluster": 0.70
    }
    
    # Valuation Method Weights (can be tuned)
    default_method_weights: dict = {
        "sales_comparison": 0.60,
        "cost_approach": 0.40
    }
    
    # API Configuration
    api_host: str = Field("0.0.0.0", env='API_HOST')
    api_port: int = Field(8000, env='API_PORT')
    api_workers: int = Field(4, env='API_WORKERS')
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
```

## Migration Strategy (TypeScript → Python)

### Phase 1: Dual-Stack Operation
1. Keep existing TypeScript valuation API as proxy
2. Deploy Python FastAPI service alongside
3. TypeScript forwards requests to Python, returns responses
4. Gradual traffic shifting based on confidence

### Phase 2: Complete Migration
1. Update frontend to call Python service directly
2. Migrate all ML models to Python
3. Deprecate TypeScript valuation endpoints
4. Keep TypeScript for Data Hub operations

### Communication Pattern
```typescript
// TypeScript proxy to Python service
class PythonValuationClient {
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = process.env.PYTHON_VALUATION_URL || 'http://localhost:8000';
  }
  
  async createValuation(request: ValuationRequest): Promise<ValuationResult> {
    const response = await fetch(`${this.baseUrl}/valuations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      throw new Error(`Python service error: ${response.statusText}`);
    }
    
    return await response.json();
  }
}
```

## Summary: Agent Operating Principles

1. **Data Quality First**: Validate Ghana-specific data (regions, addresses, land tenure) before processing
2. **Pure Valuation Logic**: No I/O inside valuation calculations - use adapters for all data access
3. **Explicit Regional Context**: All valuations must specify Ghana market region and apply regional factors
4. **Pydantic Schemas**: All data structures as Pydantic models with Ghana-specific validators
5. **PostGIS for Geography**: Use PostGIS spatial queries for comparable property searches
6. **Deterministic Calculations**: All valuation methods must produce reproducible results
7. **Confidence Transparency**: Every valuation must include confidence score and methodology documentation
8. **Python for Analytics**: Use Python's scientific stack (NumPy, Pandas, scikit-learn) for valuation and ML
9. **TypeScript for Orchestration**: Keep TypeScript for API gateway, Data Hub, and user-facing services
10. **Test Everything**: Unit tests for pure functions, integration tests with test database, Ghana-specific test cases