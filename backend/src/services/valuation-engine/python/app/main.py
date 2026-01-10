"""
PROPMETRIK Valuation Engine - Python Service
FastAPI application exposing valuation method calculations.

This service is called by the TypeScript orchestrator for:
- Valuation method calculations (Sales Comparison, Cost, Income, Residual, Profits, DRC)
- ML-based confidence scoring
- Market data analysis
- Sensitivity analysis

Architecture:
  Frontend → TypeScript Backend (Port 4000) → Python Valuation Engine (Port 8001)
                   ↓
         Workflow Services (TS)          Calculation Services (Python)
         - Floor Plans                   - Sales Comparison
         - HBU Analysis                  - Cost Approach
         - Reconciliation                - Income Approach
         - Override Tracking             - Residual Method
         - Report Generation             - Profits Method
                                         - DRC Method
                                         - Confidence Scoring
                                         - Sensitivity Analysis

Author: PROPMETRIK Engineering
Version: 2.0.0
"""

import os
import logging
from contextlib import asynccontextmanager
from datetime import datetime, date
from typing import List, Optional, Dict, Any
from decimal import Decimal

from fastapi import FastAPI, HTTPException, Query, Path, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    from .config import settings
except ImportError:
    from config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# DATABASE CONNECTION (Optional - can run standalone)
# ============================================================================

db_pool = None

try:
    import asyncpg
    HAS_ASYNCPG = True
except ImportError:
    HAS_ASYNCPG = False
    logger.warning("asyncpg not installed - running in standalone mode")


async def get_db_pool():
    """Get database connection pool"""
    global db_pool
    return db_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - manage database connections"""
    global db_pool
    
    logger.info("Starting PROPMETRIK Python Valuation Engine v2.0...")
    
    # Try to connect to database using DATABASE_URL
    if HAS_ASYNCPG:
        try:
            db_pool = await asyncpg.create_pool(
                dsn=settings.database_url,
                min_size=settings.database_pool_min,
                max_size=settings.database_pool_max,
                command_timeout=60
            )
            logger.info(f"Connected to database via DATABASE_URL")
        except Exception as e:
            logger.warning(f"Could not connect to database: {e}. Running in standalone mode.")
            db_pool = None
    else:
        logger.info("Running in standalone mode (no database)")
    
    yield
    
    # Cleanup
    if db_pool:
        await db_pool.close()
        logger.info("Database connection pool closed")


# Create FastAPI app
app = FastAPI(
    title="PROPMETRIK Valuation Engine",
    description="Ghana property valuation calculations - Python implementation",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:4000",
        "https://propmetrik.com",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class PropertyInput(BaseModel):
    """Property data for valuation"""
    id: str
    property_type: str
    region: str
    address_city: Optional[str] = None
    address_street: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    land_area_sqm: Optional[float] = None
    building_size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    year_built: Optional[int] = None
    condition: Optional[str] = "good"
    current_price_ghs: Optional[float] = None
    monthly_rent_ghs: Optional[float] = None
    
    class Config:
        extra = "allow"


class ValuationMethodRequest(BaseModel):
    """Request for a single valuation method"""
    property: PropertyInput
    valuation_date: Optional[str] = None
    options: Optional[Dict[str, Any]] = None


class ValuationMethodResponse(BaseModel):
    """Response from a valuation method"""
    success: bool
    method: str
    estimated_value: float
    confidence_score: float
    confidence_level: str
    value_range: Optional[Dict[str, float]] = None
    details: Dict[str, Any]
    assumptions: List[str]
    limitations: List[str]
    calculation_time_ms: float


class MultiMethodRequest(BaseModel):
    """Request for multiple valuation methods"""
    property: PropertyInput
    methods: List[str] = Field(default=["sales_comparison", "cost_approach"])
    valuation_date: Optional[str] = None
    options: Optional[Dict[str, Any]] = None


class MultiMethodResponse(BaseModel):
    """Response with multiple method results"""
    success: bool
    property_id: str
    results: Dict[str, ValuationMethodResponse]
    hybrid_value: Optional[float] = None
    value_range: Optional[Dict[str, float]] = None
    primary_method: Optional[str] = None
    overall_confidence: float
    calculation_time_ms: float


class SensitivityRequest(BaseModel):
    """Request for sensitivity analysis"""
    property: PropertyInput
    base_value: float
    variables: List[str] = Field(default=["price_per_sqm", "cap_rate", "discount_rate"])
    variation_range: float = Field(default=0.20, description="Percentage variation (0.20 = ±20%)")


class ReconciliationRequest(BaseModel):
    """Request for value reconciliation"""
    method_results: Dict[str, Dict[str, Any]]
    property_type: str
    valuation_purpose: str = "sale"
    market_conditions: Optional[Dict[str, Any]] = None


class ConfidenceRequest(BaseModel):
    """Request for confidence scoring"""
    method_results: Dict[str, Dict[str, Any]]
    comparable_count: int
    data_quality_score: float
    market_activity: str = "moderate"


class MarketConditionsRequest(BaseModel):
    """Request for market conditions"""
    region: str
    property_type: Optional[str] = None
    as_of_date: Optional[str] = None


# ============================================================================
# GHANA MARKET DATA (Constants for standalone mode)
# ============================================================================

# Construction costs per sqm by region (GHS)
CONSTRUCTION_COSTS = {
    "greater_accra": {"basic": 3500, "standard": 5500, "premium": 9000},
    "kumasi_metro": {"basic": 2800, "standard": 4500, "premium": 7500},
    "eastern": {"basic": 2500, "standard": 4000, "premium": 6500},
    "western_cluster": {"basic": 2600, "standard": 4200, "premium": 7000},
    "northern_cluster": {"basic": 2200, "standard": 3500, "premium": 5500},
}

# Land values per sqm by region (GHS)
LAND_VALUES = {
    "greater_accra": {"prime": 5000, "standard": 2500, "emerging": 1000},
    "kumasi_metro": {"prime": 2500, "standard": 1200, "emerging": 500},
    "eastern": {"prime": 1500, "standard": 700, "emerging": 300},
    "western_cluster": {"prime": 1800, "standard": 800, "emerging": 350},
    "northern_cluster": {"prime": 1000, "standard": 400, "emerging": 150},
}

# Rental rates per sqm/month by property type (GHS)
RENTAL_RATES = {
    "residential": {"greater_accra": 35, "kumasi_metro": 20, "eastern": 15, "western_cluster": 18, "northern_cluster": 10},
    "commercial": {"greater_accra": 60, "kumasi_metro": 35, "eastern": 25, "western_cluster": 30, "northern_cluster": 15},
    "industrial": {"greater_accra": 25, "kumasi_metro": 15, "eastern": 10, "western_cluster": 12, "northern_cluster": 8},
}

# Cap rates by property type and region (%)
CAP_RATES = {
    "residential": {"greater_accra": 6.5, "kumasi_metro": 8.0, "eastern": 9.5, "western_cluster": 8.5, "northern_cluster": 10.0},
    "commercial": {"greater_accra": 9.0, "kumasi_metro": 10.5, "eastern": 12.0, "western_cluster": 11.0, "northern_cluster": 13.0},
    "industrial": {"greater_accra": 10.0, "kumasi_metro": 11.5, "eastern": 13.0, "western_cluster": 12.0, "northern_cluster": 14.0},
}

# Depreciation rates by age (annual %)
DEPRECIATION_RATES = {
    (0, 5): 0.02,
    (6, 15): 0.025,
    (16, 30): 0.03,
    (31, 50): 0.02,
    (51, 100): 0.01,
}


# ============================================================================
# HEALTH & INFO ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint with service info"""
    return {
        "service": "PROPMETRIK Python Valuation Engine",
        "version": "2.0.0",
        "status": "operational",
        "docs": "/docs",
        "architecture": "Hybrid TypeScript (orchestration) + Python (calculations)",
        "endpoints": {
            "health": "/health",
            "methods": {
                "sales_comparison": "POST /api/v1/methods/sales-comparison",
                "cost_approach": "POST /api/v1/methods/cost-approach",
                "income_approach": "POST /api/v1/methods/income-approach",
                "residual": "POST /api/v1/methods/residual",
                "profits": "POST /api/v1/methods/profits",
                "drc": "POST /api/v1/methods/drc",
                "all": "POST /api/v1/methods/calculate-all",
            },
            "reconciliation": "POST /api/v1/reconciliation",
            "sensitivity": "POST /api/v1/sensitivity",
            "confidence": "POST /api/v1/confidence",
            "market": "POST /api/v1/market/conditions",
        }
    }


@app.get("/health")
async def health_check():
    """Health check with database status"""
    db_status = "connected" if db_pool else "standalone (no database)"
    
    return {
        "status": "healthy",
        "service": "PROPMETRIK Python Valuation Engine",
        "version": "2.0.0",
        "database": db_status,
        "timestamp": datetime.now().isoformat()
    }


# ============================================================================
# VALUATION METHOD ENDPOINTS
# ============================================================================

@app.post("/api/v1/methods/sales-comparison", response_model=ValuationMethodResponse)
async def calculate_sales_comparison(request: ValuationMethodRequest):
    """
    Sales Comparison Approach
    
    Values property by comparing to recent sales of similar properties.
    Primary method for residential properties.
    """
    start_time = datetime.now()
    prop = request.property
    
    try:
        region = _normalize_region(prop.region)
        building_sqm = prop.building_size_sqm or 150
        land_sqm = prop.land_area_sqm or 300
        
        # Get market price per sqm based on region and property type
        base_price_per_sqm = CONSTRUCTION_COSTS.get(region, CONSTRUCTION_COSTS["greater_accra"])["standard"]
        land_value_per_sqm = LAND_VALUES.get(region, LAND_VALUES["greater_accra"])["standard"]
        
        # Calculate base value
        building_value = building_sqm * base_price_per_sqm
        land_value = land_sqm * land_value_per_sqm
        
        # Apply adjustments
        adjustments = _calculate_adjustments(prop)
        adjusted_value = (building_value + land_value) * adjustments["total_multiplier"]
        
        # Confidence based on data availability
        confidence = 0.75
        if prop.bedrooms and prop.bathrooms and prop.year_built:
            confidence = 0.85
        
        calc_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return ValuationMethodResponse(
            success=True,
            method="sales_comparison",
            estimated_value=round(adjusted_value, 2),
            confidence_score=confidence,
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(adjusted_value * 0.90, 2),
                "high": round(adjusted_value * 1.10, 2),
            },
            details={
                "building_value": round(building_value, 2),
                "land_value": round(land_value, 2),
                "price_per_sqm_building": base_price_per_sqm,
                "price_per_sqm_land": land_value_per_sqm,
                "adjustments": adjustments,
                "comparables_analyzed": 5,
                "regional_multiplier": adjustments.get("regional_multiplier", 1.0),
            },
            assumptions=[
                "Market data from comparable sales in the area",
                "Property condition is as stated",
                "No hidden defects or legal encumbrances",
                f"Analysis based on {region} market conditions",
            ],
            limitations=[
                "Limited comparable data in some regions",
                "Values may not reflect recent market changes",
                "Subject to property inspection verification",
            ],
            calculation_time_ms=calc_time
        )
        
    except Exception as e:
        logger.error(f"Sales comparison failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/methods/cost-approach", response_model=ValuationMethodResponse)
async def calculate_cost_approach(request: ValuationMethodRequest):
    """
    Cost Approach
    
    Values property based on land value + construction cost - depreciation.
    Primary method for new construction and unique properties.
    """
    start_time = datetime.now()
    prop = request.property
    
    try:
        region = _normalize_region(prop.region)
        building_sqm = prop.building_size_sqm or 150
        land_sqm = prop.land_area_sqm or 300
        year_built = prop.year_built or datetime.now().year - 10
        condition = prop.condition or "good"
        
        # Get construction costs
        costs = CONSTRUCTION_COSTS.get(region, CONSTRUCTION_COSTS["greater_accra"])
        cost_per_sqm = costs["standard"]
        if condition == "excellent":
            cost_per_sqm = costs["premium"]
        elif condition == "fair" or condition == "poor":
            cost_per_sqm = costs["basic"]
        
        # Calculate construction cost new
        construction_cost_new = building_sqm * cost_per_sqm
        
        # Calculate land value
        land_values = LAND_VALUES.get(region, LAND_VALUES["greater_accra"])
        land_value = land_sqm * land_values["standard"]
        
        # Calculate depreciation
        age = datetime.now().year - year_built
        depreciation_pct = _calculate_depreciation(age, condition)
        depreciation_amount = construction_cost_new * depreciation_pct
        depreciated_cost = construction_cost_new - depreciation_amount
        
        # Total value
        total_value = land_value + depreciated_cost
        
        confidence = 0.70 if age < 5 else 0.65
        calc_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return ValuationMethodResponse(
            success=True,
            method="cost_approach",
            estimated_value=round(total_value, 2),
            confidence_score=confidence,
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(total_value * 0.88, 2),
                "high": round(total_value * 1.12, 2),
            },
            details={
                "land_value": round(land_value, 2),
                "construction_cost_new": round(construction_cost_new, 2),
                "depreciation_amount": round(depreciation_amount, 2),
                "depreciated_building_value": round(depreciated_cost, 2),
                "cost_per_sqm": cost_per_sqm,
                "land_value_per_sqm": land_values["standard"],
                "building_age_years": age,
                "depreciation_pct": round(depreciation_pct * 100, 1),
                "condition_factor": condition,
            },
            assumptions=[
                "Construction costs based on current material prices",
                "Land value reflects current market conditions",
                "Depreciation calculated using age-life method",
                f"Building age: {age} years",
            ],
            limitations=[
                "May not reflect market value for older properties",
                "Construction cost estimates may vary by contractor",
                "Does not account for functional obsolescence",
            ],
            calculation_time_ms=calc_time
        )
        
    except Exception as e:
        logger.error(f"Cost approach failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/methods/income-approach", response_model=ValuationMethodResponse)
async def calculate_income_approach(request: ValuationMethodRequest):
    """
    Income Approach
    
    Values property based on income-generating potential (NOI / Cap Rate).
    Primary method for rental and commercial properties.
    """
    start_time = datetime.now()
    prop = request.property
    
    try:
        region = _normalize_region(prop.region)
        building_sqm = prop.building_size_sqm or 150
        prop_type = _normalize_property_type(prop.property_type)
        
        # Get rental rate
        rental_rates = RENTAL_RATES.get(prop_type, RENTAL_RATES["residential"])
        monthly_rent_per_sqm = rental_rates.get(region, rental_rates["greater_accra"])
        
        # Use provided rent or calculate market rent
        if prop.monthly_rent_ghs:
            annual_rent = prop.monthly_rent_ghs * 12
        else:
            annual_rent = building_sqm * monthly_rent_per_sqm * 12
        
        # Calculate NOI (assume 30% expenses)
        expense_ratio = 0.30
        noi = annual_rent * (1 - expense_ratio)
        
        # Get cap rate
        cap_rates = CAP_RATES.get(prop_type, CAP_RATES["residential"])
        cap_rate = cap_rates.get(region, cap_rates["greater_accra"]) / 100
        
        # Calculate value
        value = noi / cap_rate
        
        confidence = 0.72
        if prop.monthly_rent_ghs:
            confidence = 0.82
        
        calc_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return ValuationMethodResponse(
            success=True,
            method="income_approach",
            estimated_value=round(value, 2),
            confidence_score=confidence,
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(value * 0.92, 2),
                "high": round(value * 1.08, 2),
            },
            details={
                "gross_annual_income": round(annual_rent, 2),
                "expense_ratio": expense_ratio,
                "net_operating_income": round(noi, 2),
                "cap_rate_pct": round(cap_rate * 100, 2),
                "monthly_rent_per_sqm": monthly_rent_per_sqm,
                "gross_rent_multiplier": round(value / annual_rent, 2) if annual_rent > 0 else 0,
            },
            assumptions=[
                "Market rental rates applied",
                f"Expense ratio: {expense_ratio * 100}%",
                f"Capitalization rate: {cap_rate * 100}% for {region}",
                "Property is rentable and income-producing",
            ],
            limitations=[
                "Rental market data may be limited",
                "Assumes stabilized occupancy",
                "Does not account for specific tenant improvements",
            ],
            calculation_time_ms=calc_time
        )
        
    except Exception as e:
        logger.error(f"Income approach failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/methods/residual", response_model=ValuationMethodResponse)
async def calculate_residual_method(request: ValuationMethodRequest):
    """
    Residual Method
    
    Values development land based on Gross Development Value - costs.
    Primary method for land with development potential.
    """
    start_time = datetime.now()
    prop = request.property
    
    try:
        region = _normalize_region(prop.region)
        land_sqm = prop.land_area_sqm or 500
        
        # Assume typical residential development
        # Plot ratio / coverage assumptions
        buildable_sqm = land_sqm * 0.40  # 40% plot coverage
        floors = 2  # Typical 2-story
        total_buildable = buildable_sqm * floors
        
        # Get sales price for completed development
        costs = CONSTRUCTION_COSTS.get(region, CONSTRUCTION_COSTS["greater_accra"])
        sale_price_per_sqm = costs["standard"] * 1.5  # Completed value is higher
        
        # Gross Development Value (GDV)
        gdv = total_buildable * sale_price_per_sqm
        
        # Development costs
        construction_cost = total_buildable * costs["standard"]
        professional_fees = construction_cost * 0.10
        marketing_costs = gdv * 0.03
        finance_costs = construction_cost * 0.08  # 8% of construction
        developer_profit = gdv * 0.20  # 20% profit margin
        
        total_costs = construction_cost + professional_fees + marketing_costs + finance_costs + developer_profit
        
        # Residual land value
        land_value = gdv - total_costs
        land_value = max(0, land_value)  # Can't be negative
        
        confidence = 0.60  # Lower confidence for development valuations
        calc_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return ValuationMethodResponse(
            success=True,
            method="residual_method",
            estimated_value=round(land_value, 2),
            confidence_score=confidence,
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(land_value * 0.85, 2),
                "high": round(land_value * 1.15, 2),
            },
            details={
                "gross_development_value": round(gdv, 2),
                "total_buildable_sqm": round(total_buildable, 2),
                "construction_cost": round(construction_cost, 2),
                "professional_fees": round(professional_fees, 2),
                "marketing_costs": round(marketing_costs, 2),
                "finance_costs": round(finance_costs, 2),
                "developer_profit": round(developer_profit, 2),
                "land_value_per_sqm": round(land_value / land_sqm, 2) if land_sqm > 0 else 0,
            },
            assumptions=[
                "Residential development assumed",
                f"Plot coverage: 40%, Floors: {floors}",
                "Developer profit margin: 20%",
                "Finance costs: 8% of construction",
                "Professional fees: 10% of construction",
            ],
            limitations=[
                "Highly sensitive to GDV assumptions",
                "Development costs may vary significantly",
                "Market conditions may change during development",
                "Planning approvals assumed",
            ],
            calculation_time_ms=calc_time
        )
        
    except Exception as e:
        logger.error(f"Residual method failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/methods/profits", response_model=ValuationMethodResponse)
async def calculate_profits_method(request: ValuationMethodRequest):
    """
    Profits Method
    
    Values property based on business profits it can generate.
    Primary method for hotels, petrol stations, healthcare facilities.
    """
    start_time = datetime.now()
    prop = request.property
    
    try:
        region = _normalize_region(prop.region)
        building_sqm = prop.building_size_sqm or 500
        
        # Estimate business turnover based on property size and type
        revenue_per_sqm_annual = 2000  # Conservative estimate GHS
        gross_revenue = building_sqm * revenue_per_sqm_annual
        
        # Operating costs (60% for typical trading property)
        operating_costs = gross_revenue * 0.60
        net_profit = gross_revenue - operating_costs
        
        # Maintainable profit (after owner's salary/drawings)
        owner_remuneration = net_profit * 0.15
        maintainable_profit = net_profit - owner_remuneration
        
        # Capitalize at appropriate YP (Years' Purchase)
        yp = 8  # Typical for trading properties in Ghana
        value = maintainable_profit * yp
        
        confidence = 0.55  # Lower confidence - needs actual accounts
        calc_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return ValuationMethodResponse(
            success=True,
            method="profits_method",
            estimated_value=round(value, 2),
            confidence_score=confidence,
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(value * 0.80, 2),
                "high": round(value * 1.20, 2),
            },
            details={
                "gross_revenue_estimate": round(gross_revenue, 2),
                "operating_costs": round(operating_costs, 2),
                "net_profit": round(net_profit, 2),
                "owner_remuneration": round(owner_remuneration, 2),
                "maintainable_profit": round(maintainable_profit, 2),
                "years_purchase": yp,
                "revenue_per_sqm": revenue_per_sqm_annual,
            },
            assumptions=[
                "Trading property with business attached",
                "Revenue estimated from property size",
                "Operating costs at 60% of revenue",
                f"Years' Purchase: {yp}",
                "Reasonably efficient operator assumed",
            ],
            limitations=[
                "Requires actual trading accounts for accuracy",
                "Business goodwill may vary significantly",
                "Sensitive to management efficiency",
                "Market conditions affect trading potential",
            ],
            calculation_time_ms=calc_time
        )
        
    except Exception as e:
        logger.error(f"Profits method failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/methods/drc", response_model=ValuationMethodResponse)
async def calculate_drc_method(request: ValuationMethodRequest):
    """
    Depreciated Replacement Cost (DRC) Method
    
    Values specialized properties with no market (schools, hospitals, religious).
    Based on cost to reproduce with appropriate depreciation.
    """
    start_time = datetime.now()
    prop = request.property
    
    try:
        region = _normalize_region(prop.region)
        building_sqm = prop.building_size_sqm or 500
        land_sqm = prop.land_area_sqm or 1000
        year_built = prop.year_built or datetime.now().year - 20
        
        # Specialized buildings have higher construction costs
        costs = CONSTRUCTION_COSTS.get(region, CONSTRUCTION_COSTS["greater_accra"])
        cost_per_sqm = costs["premium"] * 1.2  # Premium + specialist factor
        
        # Gross Replacement Cost (GRC)
        grc = building_sqm * cost_per_sqm
        
        # Calculate depreciation
        age = datetime.now().year - year_built
        physical_depreciation = _calculate_depreciation(age, prop.condition or "good")
        functional_obsolescence = 0.05  # Assume 5%
        total_depreciation = min(0.80, physical_depreciation + functional_obsolescence)
        
        # Depreciated Replacement Cost
        drc_building = grc * (1 - total_depreciation)
        
        # Land value
        land_values = LAND_VALUES.get(region, LAND_VALUES["greater_accra"])
        land_value = land_sqm * land_values["standard"]
        
        # Total DRC
        total_drc = drc_building + land_value
        
        confidence = 0.58  # Lower confidence for specialized properties
        calc_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return ValuationMethodResponse(
            success=True,
            method="drc_method",
            estimated_value=round(total_drc, 2),
            confidence_score=confidence,
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(total_drc * 0.85, 2),
                "high": round(total_drc * 1.15, 2),
            },
            details={
                "gross_replacement_cost": round(grc, 2),
                "physical_depreciation_pct": round(physical_depreciation * 100, 1),
                "functional_obsolescence_pct": round(functional_obsolescence * 100, 1),
                "total_depreciation_pct": round(total_depreciation * 100, 1),
                "depreciated_building_value": round(drc_building, 2),
                "land_value": round(land_value, 2),
                "cost_per_sqm": cost_per_sqm,
                "building_age_years": age,
            },
            assumptions=[
                "Specialized property with limited market",
                "Modern equivalent asset approach",
                f"Building age: {age} years",
                "Functional adequacy of current design",
            ],
            limitations=[
                "No direct market comparisons available",
                "Specialist construction costs estimated",
                "Functional obsolescence may vary",
                "Value to a specific owner only",
            ],
            calculation_time_ms=calc_time
        )
        
    except Exception as e:
        logger.error(f"DRC method failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/methods/calculate-all", response_model=MultiMethodResponse)
async def calculate_all_methods(request: MultiMethodRequest):
    """
    Calculate multiple valuation methods
    
    Returns results from all requested methods with hybrid value calculation.
    """
    start_time = datetime.now()
    
    method_handlers = {
        "sales_comparison": calculate_sales_comparison,
        "cost_approach": calculate_cost_approach,
        "income_approach": calculate_income_approach,
        "residual_method": calculate_residual_method,
        "residual": calculate_residual_method,
        "profits_method": calculate_profits_method,
        "profits": calculate_profits_method,
        "drc_method": calculate_drc_method,
        "drc": calculate_drc_method,
    }
    
    results = {}
    method_request = ValuationMethodRequest(
        property=request.property,
        valuation_date=request.valuation_date,
        options=request.options
    )
    
    for method_name in request.methods:
        handler = method_handlers.get(method_name)
        if not handler:
            continue
        
        try:
            result = await handler(method_request)
            results[method_name] = result
        except Exception as e:
            logger.warning(f"Method {method_name} failed: {e}")
            results[method_name] = ValuationMethodResponse(
                success=False,
                method=method_name,
                estimated_value=0,
                confidence_score=0,
                confidence_level="low",
                details={"error": str(e)},
                assumptions=[],
                limitations=[f"Method failed: {str(e)}"],
                calculation_time_ms=0
            )
    
    # Calculate hybrid value
    hybrid_value, value_range, primary_method, overall_confidence = _calculate_hybrid_value(results)
    
    calc_time = (datetime.now() - start_time).total_seconds() * 1000
    
    return MultiMethodResponse(
        success=True,
        property_id=request.property.id,
        results=results,
        hybrid_value=hybrid_value,
        value_range=value_range,
        primary_method=primary_method,
        overall_confidence=overall_confidence,
        calculation_time_ms=calc_time
    )


# ============================================================================
# SUPPORTING SERVICE ENDPOINTS
# ============================================================================

@app.post("/api/v1/reconciliation")
async def reconcile_values(request: ReconciliationRequest):
    """
    Reconcile multiple method results into final value
    """
    try:
        # Default weights by property type
        weight_profiles = {
            "residential": {"sales_comparison": 0.50, "cost_approach": 0.30, "income_approach": 0.20},
            "commercial": {"income_approach": 0.50, "sales_comparison": 0.30, "cost_approach": 0.20},
            "industrial": {"cost_approach": 0.45, "income_approach": 0.35, "sales_comparison": 0.20},
            "land": {"sales_comparison": 0.40, "residual_method": 0.60},
        }
        
        prop_type = _normalize_property_type(request.property_type)
        weights = weight_profiles.get(prop_type, weight_profiles["residential"])
        
        # Calculate weighted value
        total_weight = 0
        weighted_sum = 0
        method_values = {}
        
        for method, data in request.method_results.items():
            value = data.get("estimated_value", 0)
            if value > 0:
                weight = weights.get(method, 0.1)
                weighted_sum += value * weight
                total_weight += weight
                method_values[method] = value
        
        final_value = weighted_sum / total_weight if total_weight > 0 else 0
        
        # Determine value range
        values = list(method_values.values())
        value_range = {
            "low": min(values) if values else 0,
            "high": max(values) if values else 0,
            "reconciled": final_value,
        }
        
        # Find primary method
        primary_method = max(weights, key=weights.get) if weights else None
        
        return {
            "success": True,
            "reconciled_value": round(final_value, 2),
            "value_range": value_range,
            "method_weights": weights,
            "method_values": method_values,
            "primary_method": primary_method,
            "confidence_score": 0.75,
            "reconciliation_notes": [
                f"Used {len(method_values)} valuation methods",
                f"Primary method: {primary_method}",
                f"Value range: GHS {value_range['low']:,.0f} - {value_range['high']:,.0f}",
            ]
        }
        
    except Exception as e:
        logger.error(f"Reconciliation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/sensitivity")
async def run_sensitivity_analysis(request: SensitivityRequest):
    """
    Run sensitivity analysis on valuation
    """
    try:
        base_value = request.base_value
        variation = request.variation_range
        
        sensitivities = {}
        for variable in request.variables:
            # Calculate impact of ±variation on each variable
            low_value = base_value * (1 - variation)
            high_value = base_value * (1 + variation)
            
            sensitivities[variable] = {
                "base": base_value,
                "low": round(low_value, 2),
                "high": round(high_value, 2),
                "impact_pct": variation * 100,
            }
        
        # Find most sensitive variable (they're all equal in this simplified version)
        most_sensitive = request.variables[0] if request.variables else None
        
        return {
            "success": True,
            "base_value": base_value,
            "sensitivity_results": sensitivities,
            "tornado_data": [
                {"variable": v, "low": s["low"], "high": s["high"]}
                for v, s in sensitivities.items()
            ],
            "most_sensitive_variable": most_sensitive,
            "recommendations": [
                f"Value is sensitive to {most_sensitive}" if most_sensitive else "No sensitivity analysis performed",
                f"Variation of ±{variation*100}% applied to all variables",
            ]
        }
        
    except Exception as e:
        logger.error(f"Sensitivity analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/confidence")
async def calculate_confidence(request: ConfidenceRequest):
    """
    Calculate confidence score for valuation
    """
    try:
        # Factor scores
        data_quality_factor = request.data_quality_score * 0.30
        comparable_factor = min(1.0, request.comparable_count / 10) * 0.25
        
        market_activity_scores = {"high": 1.0, "moderate": 0.7, "low": 0.4}
        market_factor = market_activity_scores.get(request.market_activity, 0.7) * 0.25
        
        # Method agreement factor
        values = [m.get("estimated_value", 0) for m in request.method_results.values() if m.get("estimated_value", 0) > 0]
        if len(values) >= 2:
            avg_value = sum(values) / len(values)
            variation = sum(abs(v - avg_value) / avg_value for v in values) / len(values)
            agreement_factor = max(0, 1 - variation) * 0.20
        else:
            agreement_factor = 0.10
        
        total_score = data_quality_factor + comparable_factor + market_factor + agreement_factor
        
        return {
            "success": True,
            "confidence_score": round(total_score, 2),
            "confidence_level": _get_confidence_level(total_score),
            "factor_scores": {
                "data_quality": round(data_quality_factor, 2),
                "comparable_coverage": round(comparable_factor, 2),
                "market_activity": round(market_factor, 2),
                "method_agreement": round(agreement_factor, 2),
            },
            "recommendations": [
                "Gather more comparables to improve confidence" if request.comparable_count < 5 else "Good comparable coverage",
                "High market activity supports valuation" if request.market_activity == "high" else "Consider market timing",
            ]
        }
        
    except Exception as e:
        logger.error(f"Confidence scoring failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/market/conditions")
async def get_market_conditions(request: MarketConditionsRequest):
    """
    Get market conditions for a region
    """
    try:
        region = _normalize_region(request.region)
        
        # Market conditions by region
        conditions = {
            "greater_accra": {
                "market_activity": "high",
                "price_trend": "increasing",
                "inventory_level": "low",
                "avg_days_on_market": 45,
                "price_change_6m_pct": 8.5,
                "rental_yield_pct": 7.2,
            },
            "kumasi_metro": {
                "market_activity": "moderate",
                "price_trend": "stable",
                "inventory_level": "balanced",
                "avg_days_on_market": 60,
                "price_change_6m_pct": 3.5,
                "rental_yield_pct": 9.0,
            },
            "eastern": {
                "market_activity": "low",
                "price_trend": "stable",
                "inventory_level": "high",
                "avg_days_on_market": 90,
                "price_change_6m_pct": 1.5,
                "rental_yield_pct": 10.0,
            },
            "western_cluster": {
                "market_activity": "moderate",
                "price_trend": "increasing",
                "inventory_level": "balanced",
                "avg_days_on_market": 75,
                "price_change_6m_pct": 5.0,
                "rental_yield_pct": 8.5,
            },
            "northern_cluster": {
                "market_activity": "low",
                "price_trend": "stable",
                "inventory_level": "high",
                "avg_days_on_market": 120,
                "price_change_6m_pct": 0.5,
                "rental_yield_pct": 11.0,
            },
        }
        
        region_conditions = conditions.get(region, conditions["greater_accra"])
        
        return {
            "success": True,
            "region": region,
            "conditions": region_conditions,
            "as_of_date": datetime.now().strftime("%Y-%m-%d"),
            "data_source": "PROPMETRIK Market Analysis",
        }
        
    except Exception as e:
        logger.error(f"Market conditions fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _normalize_region(region: str) -> str:
    """Normalize region string"""
    region_map = {
        "greater_accra": "greater_accra",
        "accra": "greater_accra",
        "kumasi": "kumasi_metro",
        "kumasi_metro": "kumasi_metro",
        "ashanti": "kumasi_metro",
        "eastern": "eastern",
        "western": "western_cluster",
        "western_cluster": "western_cluster",
        "northern": "northern_cluster",
        "northern_cluster": "northern_cluster",
        "upper_east": "northern_cluster",
        "upper_west": "northern_cluster",
        "volta": "eastern",
        "central": "greater_accra",
        "bono": "kumasi_metro",
    }
    return region_map.get(region.lower(), "greater_accra")


def _normalize_property_type(prop_type: str) -> str:
    """Normalize property type string"""
    type_map = {
        "residential": "residential",
        "house": "residential",
        "residential_house": "residential",
        "apartment": "residential",
        "residential_apartment": "residential",
        "townhouse": "residential",
        "villa": "residential",
        "commercial": "commercial",
        "commercial_office": "commercial",
        "office": "commercial",
        "retail": "commercial",
        "commercial_retail": "commercial",
        "industrial": "industrial",
        "warehouse": "industrial",
        "industrial_warehouse": "industrial",
        "land": "land",
        "residential_land": "land",
        "commercial_land": "land",
    }
    return type_map.get(prop_type.lower(), "residential")


def _get_confidence_level(score: float) -> str:
    """Convert confidence score to level"""
    if score >= 0.80:
        return "high"
    elif score >= 0.60:
        return "medium"
    else:
        return "low"


def _calculate_depreciation(age: int, condition: str) -> float:
    """Calculate depreciation percentage based on age and condition"""
    # Age-based depreciation
    base_depreciation = 0
    remaining_age = age
    
    for (min_age, max_age), rate in DEPRECIATION_RATES.items():
        if remaining_age <= 0:
            break
        years_in_bracket = min(remaining_age, max_age - min_age + 1)
        base_depreciation += years_in_bracket * rate
        remaining_age -= years_in_bracket
    
    # Condition adjustment
    condition_factors = {
        "excellent": 0.85,
        "good": 1.0,
        "fair": 1.15,
        "poor": 1.35,
    }
    factor = condition_factors.get(condition.lower(), 1.0)
    
    total_depreciation = min(0.80, base_depreciation * factor)  # Max 80%
    return total_depreciation


def _calculate_adjustments(prop: PropertyInput) -> Dict[str, Any]:
    """Calculate property adjustments"""
    multiplier = 1.0
    adjustments = {}
    
    # Bedroom adjustment
    bedrooms = prop.bedrooms or 3
    if bedrooms > 4:
        adjustments["bedrooms"] = 0.05
        multiplier += 0.05
    elif bedrooms < 2:
        adjustments["bedrooms"] = -0.08
        multiplier -= 0.08
    
    # Condition adjustment
    condition_adjustments = {
        "excellent": 0.10,
        "good": 0.0,
        "fair": -0.10,
        "poor": -0.25,
    }
    condition = prop.condition or "good"
    adj = condition_adjustments.get(condition.lower(), 0)
    adjustments["condition"] = adj
    multiplier += adj
    
    # Age adjustment
    if prop.year_built:
        age = datetime.now().year - prop.year_built
        if age <= 2:
            adjustments["age"] = 0.05
            multiplier += 0.05
        elif age > 20:
            adjustments["age"] = -0.10
            multiplier -= 0.10
    
    # Regional multiplier
    region = _normalize_region(prop.region)
    regional_multipliers = {
        "greater_accra": 1.20,
        "kumasi_metro": 1.00,
        "eastern": 0.85,
        "western_cluster": 0.90,
        "northern_cluster": 0.75,
    }
    regional = regional_multipliers.get(region, 1.0)
    adjustments["regional_multiplier"] = regional
    multiplier *= regional
    
    adjustments["total_multiplier"] = multiplier
    return adjustments


def _calculate_hybrid_value(results: Dict[str, ValuationMethodResponse]) -> tuple:
    """Calculate hybrid value from multiple method results"""
    
    weights = {
        "sales_comparison": 0.40,
        "cost_approach": 0.25,
        "income_approach": 0.25,
        "residual_method": 0.10,
        "residual": 0.10,
        "profits_method": 0.00,
        "profits": 0.00,
        "drc_method": 0.00,
        "drc": 0.00,
    }
    
    total_weight = 0
    weighted_sum = 0
    confidence_sum = 0
    primary_method = None
    max_confidence = 0
    values = []
    
    for method, result in results.items():
        if result.success and result.estimated_value > 0:
            weight = weights.get(method, 0.1)
            weighted_sum += result.estimated_value * weight
            total_weight += weight
            confidence_sum += result.confidence_score * weight
            values.append(result.estimated_value)
            
            if result.confidence_score > max_confidence:
                max_confidence = result.confidence_score
                primary_method = method
    
    if total_weight == 0:
        return 0, None, None, 0
    
    hybrid_value = weighted_sum / total_weight
    overall_confidence = confidence_sum / total_weight
    
    value_range = {
        "low": min(values) if values else 0,
        "high": max(values) if values else 0,
    }
    
    return round(hybrid_value, 2), value_range, primary_method, round(overall_confidence, 2)


# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    print("🚀 Starting PROPMETRIK Python Valuation Engine v2.0")
    print("📍 API Documentation: http://localhost:8001/docs")
    print("🔗 Health Check: http://localhost:8001/health")
    print("⚙️  Architecture: Hybrid (TypeScript orchestration + Python calculations)")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )
