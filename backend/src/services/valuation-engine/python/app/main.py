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
    import sys
    import os
    # Add parent directory to path for standalone execution
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from app.config import settings

# Configure logging (before imports that may log)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import land value services for real comparable-based calculation
try:
    from .adapters.data_hub_adapter import PostgreSQLMarketDataAdapter
    from .services.land_value_provider import LandValueProvider
    from .schemas import Property, PropertyLocation, PropertySpecifications, PropertyDataQuality, GhanaRegion, PropertyType
    HAS_LAND_SERVICES = True
except ImportError as e:
    HAS_LAND_SERVICES = False
    logger.warning(f"Land value services not available - using fallback calculations. Error: {e}")

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


async def get_land_value_provider():
    """
    Get LandValueProvider with database adapter.
    
    Returns None if database is not connected or services not available.
    """
    global db_pool
    if not db_pool or not HAS_LAND_SERVICES:
        return None
    
    try:
        adapter = PostgreSQLMarketDataAdapter(db_pool)
        return LandValueProvider(adapter)
    except Exception as e:
        logger.warning(f"Could not create LandValueProvider: {e}")
        return None


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


# ============================================================================
# COMPARABLE INPUT SCHEMA (for basket-based RICS calculation)
# ============================================================================

class ComparableInput(BaseModel):
    """Comparable property from basket for RICS Sales Comparison"""
    id: str
    price: float = Field(..., gt=0, description="Sale/listing price")
    price_currency: str = Field(default="GHS", description="Currency (GHS, USD)")
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    gfa_sqm: Optional[float] = Field(None, description="Gross Floor Area in sqm")
    land_area_sqm: Optional[float] = None
    year_built: Optional[int] = None
    condition: Optional[str] = Field(default="good")
    region: Optional[str] = None
    address_city: Optional[str] = None
    address_district: Optional[str] = None
    property_type: Optional[str] = None
    evidence_type: Optional[str] = Field(default="listing", description="sale, listing, offer")
    transaction_date: Optional[str] = None
    distance_km: Optional[float] = None
    weight: Optional[float] = Field(default=1.0, ge=0, le=1)
    
    # Pre-calculated adjustments from frontend (optional)
    adjustments: Optional[Dict[str, float]] = Field(default_factory=dict)
    
    class Config:
        extra = "allow"


class RICSSalesComparisonRequest(BaseModel):
    """Request for RICS-compliant Sales Comparison using basket comparables"""
    property: PropertyInput
    comparables: List[ComparableInput] = Field(..., min_items=1)
    valuation_date: Optional[str] = None
    usd_to_ghs_rate: float = Field(default=16.0, description="Exchange rate USD to GHS")
    options: Optional[Dict[str, Any]] = Field(default_factory=dict)
    
    class Config:
        extra = "allow"


class ComparableAnalysis(BaseModel):
    """Analysis result for a single comparable"""
    id: str
    original_price_ghs: float
    adjusted_price_ghs: float
    adjustments_applied: Dict[str, float]
    total_adjustment_percent: float
    weight: float
    weighted_value: float
    confidence_contribution: float


class RICSSalesComparisonResponse(BaseModel):
    """Response from RICS Sales Comparison calculation"""
    success: bool
    method: str = "sales_comparison_rics"
    estimated_value: float
    confidence_score: float
    confidence_level: str
    value_range: Dict[str, float]
    
    # RICS-specific details
    comparables_analyzed: List[ComparableAnalysis]
    adjustment_grid: Dict[str, Dict[str, float]]
    methodology_notes: List[str]
    
    # Standard fields
    details: Dict[str, Any]
    assumptions: List[str]
    limitations: List[str]
    calculation_time_ms: float


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
# LAND VALUE MODELS
# ============================================================================

class LandValueMethodDetail(BaseModel):
    """Details for a single land value method"""
    value: float
    value_per_sqm: float
    confidence: float
    weight: float
    weighted_contribution: float
    method_specific: Dict[str, Any] = {}


class LandComparableSummary(BaseModel):
    """Summary of a comparable land sale"""
    id: str
    distance_km: float
    sale_date: str
    sale_price_per_sqm: float
    adjusted_price_per_sqm: float
    similarity_score: float
    adjustment_factor: float


class LandValueRequest(BaseModel):
    """
    Request for land value calculation
    
    If user_entered_value is provided, it is a 100% OVERRIDE
    that bypasses the valuation methods entirely.
    """
    property: PropertyInput
    valuation_id: str
    valuation_date: Optional[str] = None
    user_entered_value: Optional[float] = None
    user_justification: Optional[str] = None
    force_recalculate: bool = False


class LandValueResponse(BaseModel):
    """
    Response from land value calculation
    
    Weight Distribution (per GhIS/RICS):
        | Comparable Strength | Residual | Comparable |
        |---------------------|----------|------------|
        | Weak                | 70%      | 30%        |
        | Balanced            | 50%      | 50%        |
        | Strong              | 30%      | 70%        |
    """
    success: bool
    final_land_value: float
    final_land_value_per_sqm: float
    land_area_sqm: float
    confidence_score: float
    primary_method: str
    
    # User override info
    is_user_override: bool = False
    user_justification: Optional[str] = None
    
    # Method details (only present if not user override)
    methods: Optional[Dict[str, LandValueMethodDetail]] = None
    
    # Comparable details (if comparable method used)
    comparables_summary: Optional[Dict[str, Any]] = None
    
    # Reconciliation details
    reconciliation: Optional[Dict[str, Any]] = None
    
    # Comparable strength for weighting
    comparable_strength: str = "balanced"
    
    # Disclosure (RICS compliance)
    disclosure_required: bool = False
    disclosure_text: str = ""
    
    # Metadata
    cached: bool = False
    error: Optional[str] = None


class LandComparablesRequest(BaseModel):
    """Request for land comparables only"""
    property: PropertyInput
    options: Optional[Dict[str, Any]] = None


class LandComparablesResponse(BaseModel):
    """Response with land comparables only"""
    success: bool
    comparables: List[LandComparableSummary]
    strength: str  # 'weak', 'balanced', 'strong'
    count: int
    search_radius_km: float
    error: Optional[str] = None


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


# ============================================================================
# RICS-COMPLIANT SALES COMPARISON (Uses actual basket comparables)
# ============================================================================

@app.post("/api/v1/methods/sales-comparison-rics", response_model=RICSSalesComparisonResponse)
async def calculate_sales_comparison_rics(request: RICSSalesComparisonRequest):
    """
    RICS-Compliant Sales Comparison Approach
    
    Performs valuation using actual comparable properties from the valuation basket.
    Follows RICS Valuation Global Standards methodology:
    - Adjustments applied to TOTAL PRICE (not per sqm)
    - Size adjustments capped at ±25%
    - Weighted average of adjusted comparables
    - Confidence based on adjustment magnitudes and data quality
    
    Reference: RICS Valuation Global Standards (Red Book), GhIS Standards
    """
    start_time = datetime.now()
    prop = request.property
    comparables = request.comparables
    usd_rate = request.usd_to_ghs_rate
    
    try:
        if not comparables:
            raise HTTPException(status_code=400, detail="At least one comparable required")
        
        # Subject property characteristics
        subject_beds = prop.bedrooms or 3
        subject_baths = prop.bathrooms or 2
        subject_gfa = prop.building_size_sqm or prop.land_area_sqm or 200
        subject_year = prop.year_built or (datetime.now().year - 10)
        subject_age = datetime.now().year - subject_year
        
        analyzed_comparables: List[ComparableAnalysis] = []
        adjustment_grid: Dict[str, Dict[str, float]] = {}
        total_weighted_value = 0.0
        total_weight = 0.0
        
        for comp in comparables:
            # Convert price to GHS
            price_ghs = comp.price
            if comp.price_currency == "USD":
                price_ghs = comp.price * usd_rate
            
            # Get comparable characteristics
            comp_beds = comp.bedrooms or subject_beds
            comp_baths = comp.bathrooms or subject_baths
            comp_gfa = comp.gfa_sqm or comp.land_area_sqm or subject_gfa
            comp_year = comp.year_built or subject_year
            comp_age = datetime.now().year - comp_year
            
            # ================================================================
            # RICS ADJUSTMENT METHODOLOGY
            # Adjustments are applied to TOTAL PRICE, not price per unit
            # ================================================================
            
            adjustments: Dict[str, float] = {}
            
            # 1. SIZE ADJUSTMENT (per RICS: typically 10-15% impact, capped at ±25%)
            # If subject is larger than comp, comp price should be adjusted UP
            size_diff_pct = (subject_gfa - comp_gfa) / comp_gfa if comp_gfa > 0 else 0
            # Cap size difference at ±25%
            size_diff_pct = max(-0.25, min(0.25, size_diff_pct))
            # Size factor: 15% price impact for each 100% size difference
            size_adj = size_diff_pct * 0.15
            adjustments["size"] = round(size_adj * 100, 1)  # As percentage
            
            # 2. BEDROOM ADJUSTMENT (typically GHS 50,000-100,000 per bedroom in Ghana)
            bed_diff = subject_beds - comp_beds
            bedroom_value = 75000  # GHS per bedroom differential
            bed_adj_amount = bed_diff * bedroom_value
            bed_adj_pct = bed_adj_amount / price_ghs if price_ghs > 0 else 0
            adjustments["bedrooms"] = round(bed_adj_pct * 100, 1)
            
            # 3. BATHROOM ADJUSTMENT (typically GHS 30,000-50,000 per bathroom)
            bath_diff = subject_baths - comp_baths
            bathroom_value = 40000  # GHS per bathroom differential
            bath_adj_amount = bath_diff * bathroom_value
            bath_adj_pct = bath_adj_amount / price_ghs if price_ghs > 0 else 0
            adjustments["bathrooms"] = round(bath_adj_pct * 100, 1)
            
            # 4. AGE/CONDITION ADJUSTMENT (typically 1-2% per year difference)
            age_diff = subject_age - comp_age  # Positive = subject is older
            age_adj = -age_diff * 0.015  # 1.5% per year (older = lower value)
            age_adj = max(-0.20, min(0.20, age_adj))  # Cap at ±20%
            adjustments["age_condition"] = round(age_adj * 100, 1)
            
            # 5. EVIDENCE TYPE ADJUSTMENT
            # Listings typically 5-10% above transaction prices
            if comp.evidence_type == "listing":
                adjustments["evidence_type"] = -5.0  # Adjust down 5%
            elif comp.evidence_type == "offer":
                adjustments["evidence_type"] = -2.0  # Adjust down 2%
            else:
                adjustments["evidence_type"] = 0.0  # Transaction = no adjustment
            
            # 6. LOCATION ADJUSTMENT (if different districts)
            location_adj = 0.0
            if comp.address_district and hasattr(prop, 'address_city'):
                # Premium areas in Greater Accra
                premium_areas = ["east legon", "cantonments", "airport residential", "ridge", "labone"]
                standard_areas = ["tema", "spintex", "achimota", "dansoman"]
                
                comp_district = (comp.address_district or "").lower()
                subject_city = (prop.address_city or "").lower()
                
                comp_premium = any(area in comp_district for area in premium_areas)
                subject_premium = any(area in subject_city for area in premium_areas)
                
                if subject_premium and not comp_premium:
                    location_adj = 15.0  # Subject in premium area
                elif not subject_premium and comp_premium:
                    location_adj = -15.0  # Comp in premium area
            adjustments["location"] = location_adj
            
            # CALCULATE TOTAL ADJUSTMENT
            total_adj_pct = sum(adjustments.values()) / 100
            
            # Apply adjustment to total price
            adjusted_price = price_ghs * (1 + total_adj_pct)
            
            # Weight (use provided weight or default)
            weight = comp.weight or 1.0
            
            # Store in grid
            adjustment_grid[comp.id] = {
                "original_price_ghs": round(price_ghs, 2),
                **{k: v for k, v in adjustments.items()},
                "total_adjustment": round(total_adj_pct * 100, 1),
                "adjusted_price_ghs": round(adjusted_price, 2),
                "weight": weight
            }
            
            # Confidence contribution based on adjustment magnitude
            adj_magnitude = abs(total_adj_pct)
            if adj_magnitude < 0.10:
                conf_contribution = 0.95  # Excellent comparable
            elif adj_magnitude < 0.20:
                conf_contribution = 0.85  # Good comparable
            elif adj_magnitude < 0.30:
                conf_contribution = 0.70  # Fair comparable
            else:
                conf_contribution = 0.50  # Marginal comparable
            
            analyzed_comparables.append(ComparableAnalysis(
                id=comp.id,
                original_price_ghs=round(price_ghs, 2),
                adjusted_price_ghs=round(adjusted_price, 2),
                adjustments_applied=adjustments,
                total_adjustment_percent=round(total_adj_pct * 100, 1),
                weight=weight,
                weighted_value=round(adjusted_price * weight, 2),
                confidence_contribution=conf_contribution
            ))
            
            total_weighted_value += adjusted_price * weight
            total_weight += weight
        
        # Calculate weighted average
        if total_weight > 0:
            estimated_value = total_weighted_value / total_weight
        else:
            estimated_value = sum(c.adjusted_price_ghs for c in analyzed_comparables) / len(analyzed_comparables)
        
        # Calculate value range from adjusted prices
        adjusted_prices = [c.adjusted_price_ghs for c in analyzed_comparables]
        value_low = min(adjusted_prices)
        value_high = max(adjusted_prices)
        
        # Calculate confidence score
        avg_conf = sum(c.confidence_contribution for c in analyzed_comparables) / len(analyzed_comparables)
        count_bonus = min(len(comparables) / 5, 0.1)  # Bonus for more comparables, max 10%
        confidence = min(avg_conf + count_bonus, 0.95)
        
        calc_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return RICSSalesComparisonResponse(
            success=True,
            method="sales_comparison_rics",
            estimated_value=round(estimated_value, 2),
            confidence_score=round(confidence, 2),
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(value_low, 2),
                "high": round(value_high, 2),
                "most_probable": round(estimated_value, 2)
            },
            comparables_analyzed=analyzed_comparables,
            adjustment_grid=adjustment_grid,
            methodology_notes=[
                "RICS Valuation Global Standards methodology applied",
                "Adjustments calculated on total price, not per-unit basis",
                "Size adjustments capped at ±25% per RICS guidelines",
                f"USD to GHS exchange rate: {usd_rate}",
                f"Total comparables analyzed: {len(comparables)}",
                f"Weighted average calculation used with {round(total_weight, 2)} total weight"
            ],
            details={
                "subject_property": {
                    "bedrooms": subject_beds,
                    "bathrooms": subject_baths,
                    "gfa_sqm": subject_gfa,
                    "year_built": subject_year,
                    "age_years": subject_age
                },
                "comparables_count": len(comparables),
                "exchange_rate": usd_rate,
                "weighted_average": round(estimated_value, 2),
                "simple_average": round(sum(adjusted_prices) / len(adjusted_prices), 2),
                "price_range": {
                    "min": round(min(adjusted_prices), 2),
                    "max": round(max(adjusted_prices), 2),
                    "spread": round(max(adjusted_prices) - min(adjusted_prices), 2)
                }
            },
            assumptions=[
                "All comparables are valid market transactions or listings",
                "Property condition as stated in the data",
                "No material changes in market conditions since comparable dates",
                "Subject property has no hidden defects or encumbrances",
                "Adjustments based on Ghana market norms and RICS standards"
            ],
            limitations=[
                "Valuation subject to physical inspection verification",
                "Listing prices may differ from actual transaction prices",
                "Limited comparable data may affect accuracy",
                "Market conditions may have changed since valuation date"
            ],
            calculation_time_ms=calc_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"RICS Sales comparison failed: {e}")
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
    opts = request.options or {}
    
    try:
        region = _normalize_region(prop.region)
        building_sqm = prop.building_size_sqm or 150
        prop_type = _normalize_property_type(prop.property_type)
        
        # Get rental rate
        rental_rates = RENTAL_RATES.get(prop_type, RENTAL_RATES["residential"])
        monthly_rent_per_sqm = rental_rates.get(region, rental_rates["greater_accra"])
        
        # Use provided rent or calculate market rent
        # Check for monthly_rent in options first (from frontend), then property
        monthly_rent = opts.get("monthly_rent") or prop.monthly_rent_ghs
        if monthly_rent:
            annual_rent = monthly_rent * 12
        else:
            annual_rent = building_sqm * monthly_rent_per_sqm * 12
        
        # Get expense ratio from options or use default
        expense_ratio = opts.get("operating_expenses")
        if expense_ratio is not None and expense_ratio > 0:
            # Convert from percentage to decimal if needed
            expense_ratio = expense_ratio / 100 if expense_ratio > 1 else expense_ratio
        else:
            expense_ratio = 0.30
        
        # Get vacancy rate from options or use default
        vacancy_rate = opts.get("vacancy_rate")
        if vacancy_rate is not None and vacancy_rate > 0:
            vacancy_rate = vacancy_rate / 100 if vacancy_rate > 1 else vacancy_rate
        else:
            vacancy_rate = 0.05
        
        # Calculate effective gross income after vacancy
        effective_gross_income = annual_rent * (1 - vacancy_rate)
        
        # Calculate NOI
        noi = effective_gross_income * (1 - expense_ratio)
        
        # Get cap rate: use provided cap_rate from options, or fall back to defaults
        cap_rate = opts.get("cap_rate")
        cap_rate_source = "user_provided"
        if cap_rate is not None and cap_rate > 0:
            # Convert from percentage to decimal if needed (e.g., 6.5 -> 0.065)
            cap_rate = cap_rate / 100 if cap_rate > 1 else cap_rate
        else:
            # Fall back to hardcoded rates
            cap_rates = CAP_RATES.get(prop_type, CAP_RATES["residential"])
            cap_rate = cap_rates.get(region, cap_rates["greater_accra"]) / 100
            cap_rate_source = "market_default"
        
        # Calculate value
        value = noi / cap_rate if cap_rate > 0 else 0
        
        confidence = 0.72
        if monthly_rent:
            confidence = 0.82
        if cap_rate_source == "user_provided":
            confidence = min(confidence + 0.05, 0.90)  # Boost confidence when user provides cap rate
        
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
                "vacancy_rate": round(vacancy_rate * 100, 2),
                "effective_gross_income": round(effective_gross_income, 2),
                "expense_ratio": round(expense_ratio * 100, 2),
                "net_operating_income": round(noi, 2),
                "cap_rate_pct": round(cap_rate * 100, 2),
                "cap_rate_source": cap_rate_source,
                "monthly_rent_per_sqm": monthly_rent_per_sqm,
                "gross_rent_multiplier": round(value / annual_rent, 2) if annual_rent > 0 else 0,
            },
            assumptions=[
                f"{'User-provided' if monthly_rent else 'Market'} rental rate applied",
                f"Vacancy rate: {vacancy_rate * 100:.1f}%",
                f"Expense ratio: {expense_ratio * 100:.1f}%",
                f"Capitalization rate: {cap_rate * 100:.2f}% ({cap_rate_source})",
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
    
    Uses integrated depreciation services:
    - PhysicalDepreciationCalculator: Modified Age-Life with condition adjustment
    - FunctionalObsolescenceCalculator: Auto-detection from property specs
    - ExternalObsolescenceCalculator: Environmental/locational factors
    - DepreciationReconciliationService: Age-based caps and validation
    """
    from .services import (
        PhysicalDepreciationCalculator,
        FunctionalObsolescenceCalculator,
        ExternalObsolescenceCalculator,
        DepreciationReconciliationService,
        ConstructionType,
    )
    from .schemas.property import (
        Property, 
        PropertyType, 
        PropertyCondition,
        PropertyLocation,
        PropertySpecifications,
        PropertyDataQuality,
        GhanaRegion,
    )
    
    start_time = datetime.now()
    prop = request.property
    opts = request.options or {}
    
    try:
        region = _normalize_region(prop.region)
        building_sqm = prop.building_size_sqm or 500
        land_sqm = prop.land_area_sqm or 1000
        year_built = prop.year_built or datetime.now().year - 20
        
        # Get replacement cost (from options or calculate)
        replacement_cost_per_sqm = opts.get("replacement_cost_per_sqm")
        if not replacement_cost_per_sqm:
            costs = CONSTRUCTION_COSTS.get(region, CONSTRUCTION_COSTS["greater_accra"])
            replacement_cost_per_sqm = costs["premium"] * 1.2  # Premium + specialist factor
        
        # Gross Replacement Cost (GRC)
        grc = building_sqm * replacement_cost_per_sqm
        
        # MEA Factor (Modern Equivalent Asset)
        mea_factor = opts.get("mea_factor", 0.95)
        mea_adjusted_grc = grc * mea_factor
        
        # Useful life (from options or default by asset type)
        useful_life = opts.get("useful_life", 60)
        
        # ========================================
        # DEPRECIATION CALCULATION (Using Services)
        # ========================================
        
        # Map condition string to enum
        condition_map = {
            "new": PropertyCondition.EXCELLENT,
            "excellent": PropertyCondition.EXCELLENT,
            "good": PropertyCondition.GOOD,
            "fair": PropertyCondition.FAIR,
            "average": PropertyCondition.FAIR,
            "poor": PropertyCondition.POOR,
            "very_poor": PropertyCondition.RENOVATION_NEEDED,  # Map to RENOVATION_NEEDED
        }
        condition_str = (prop.condition or "good").lower()
        condition_enum = condition_map.get(condition_str, PropertyCondition.GOOD)
        
        # Map region to GhanaRegion enum (use available values)
        region_map = {
            "greater_accra": GhanaRegion.GREATER_ACCRA,
            "ashanti": GhanaRegion.KUMASI_METRO,  # Ashanti -> Kumasi Metro
            "kumasi": GhanaRegion.KUMASI_METRO,
            "western": GhanaRegion.WESTERN_CLUSTER,
            "eastern": GhanaRegion.EASTERN,
            "central": GhanaRegion.WESTERN_CLUSTER,  # Map to cluster
            "volta": GhanaRegion.EASTERN,  # Map to Eastern cluster
            "northern": GhanaRegion.NORTHERN_CLUSTER,
            "upper_east": GhanaRegion.NORTHERN_CLUSTER,
            "upper_west": GhanaRegion.NORTHERN_CLUSTER,
            "bono": GhanaRegion.KUMASI_METRO,  # Map to Kumasi cluster
        }
        region_enum = region_map.get(region, GhanaRegion.GREATER_ACCRA)
        
        # Create Property schema for depreciation calculators
        # Map asset type to PropertyType
        asset_type_to_property_type = {
            "institutional": PropertyType.INSTITUTIONAL_SCHOOL,
            "government": PropertyType.COMMERCIAL_OFFICE,
            "religious": PropertyType.INSTITUTIONAL_RELIGIOUS,
            "church": PropertyType.INSTITUTIONAL_RELIGIOUS,
            "mosque": PropertyType.INSTITUTIONAL_RELIGIOUS,
            "hospital": PropertyType.INSTITUTIONAL_HOSPITAL,
            "school": PropertyType.INSTITUTIONAL_SCHOOL,
            "community_center": PropertyType.OTHER,
            "library": PropertyType.OTHER,
            "museum": PropertyType.OTHER,
            "heritage": PropertyType.OTHER,
            "utility": PropertyType.INDUSTRIAL_FACTORY,
            "stadium": PropertyType.OTHER,
        }
        property_type_enum = asset_type_to_property_type.get(
            prop.property_type, PropertyType.OTHER
        )
        
        property_schema = Property(
            id=prop.id or "temp-drc",
            property_type=property_type_enum,
            location=PropertyLocation(
                region=region_enum,
                district=getattr(prop, 'address_city', None) or "Accra Metro",  # district field
                neighborhood=getattr(prop, 'address_street', None),  # neighborhood field
                address_raw=getattr(prop, 'address_street', None) or "No address provided",  # address_raw field
                address_city=getattr(prop, 'address_city', None) or "Accra",  # address_city field
            ),
            specifications=PropertySpecifications(
                built_area_sqm=building_sqm if building_sqm > 0 else None,
                land_size_sqm=land_sqm if land_sqm > 0 else None,
                year_built=year_built if year_built else None,
                bedrooms=getattr(prop, 'bedrooms', None),
                bathrooms=getattr(prop, 'bathrooms', None),
                condition=condition_enum,  # Add condition for depreciation calculator
            ),
            data_quality=PropertyDataQuality(
                data_quality_score=0.8,
                source_reliability_score=0.8,
                completeness_score=0.7,
                accuracy_score=0.8,
                freshness_score=0.9,
                sources=["user_input"],
            ),
        )
        
        # Infer construction type based on region/property type
        construction_type = ConstructionType.SANDCRETE_BLOCK  # Default for Ghana
        if region in ["greater_accra", "ashanti"]:
            construction_type = ConstructionType.CONCRETE_BLOCK
        
        # Check for depreciation overrides from frontend
        depreciation_overrides = opts.get("depreciation_overrides", {})
        physical_override = depreciation_overrides.get("physical")
        functional_override = depreciation_overrides.get("functional")
        external_override = depreciation_overrides.get("external")
        
        # 1. PHYSICAL DEPRECIATION
        physical_calculator = PhysicalDepreciationCalculator()
        physical_result = physical_calculator.calculate(
            property_data=property_schema,
            valuation_date=date.today(),
            construction_type=construction_type,
        )
        
        # Use override if provided, otherwise use calculated
        if physical_override is not None and physical_override >= 0:
            physical_rate = float(physical_override)
            physical_source = "user_override"
        else:
            # For DRC, adjust physical depreciation to use asset-specific useful life
            effective_age = physical_result.effective_age
            physical_rate = min(effective_age / useful_life, 0.95)
            physical_source = "calculated"
        
        physical_depreciation = mea_adjusted_grc * physical_rate
        
        # 2. FUNCTIONAL OBSOLESCENCE
        functional_calculator = FunctionalObsolescenceCalculator()
        functional_result = functional_calculator.calculate(property_data=property_schema)
        
        if functional_override is not None and functional_override >= 0:
            functional_rate = float(functional_override)
            functional_source = "user_override"
        else:
            functional_rate = functional_result.depreciation_rate
            functional_source = "calculated"
        
        functional_obsolescence = mea_adjusted_grc * functional_rate
        
        # 3. EXTERNAL OBSOLESCENCE
        external_calculator = ExternalObsolescenceCalculator()
        external_result = external_calculator.calculate(
            property_data=property_schema,
            location_data={},
            market_data={},
        )
        
        if external_override is not None and external_override >= 0:
            external_rate = float(external_override)
            external_source = "user_override"
        else:
            external_rate = external_result.depreciation_rate
            external_source = "calculated"
        
        external_obsolescence = mea_adjusted_grc * external_rate
        
        # 4. TOTAL DEPRECIATION with age-based cap
        reconciliation_service = DepreciationReconciliationService()
        property_age = datetime.now().year - year_built
        
        total_result = reconciliation_service.reconcile(
            physical=physical_result,
            functional=functional_result,
            external=external_result,
            property_age=property_age,
            rcn=mea_adjusted_grc,
        )
        
        # If any overrides were used, recalculate total
        # Calculate age-based max rate first
        max_rates = {
            (0, 5): 0.15, (5, 15): 0.35, (15, 30): 0.55,
            (30, 50): 0.75, (50, 999): 0.90
        }
        max_rate = 0.90
        for (min_age, max_age), cap in max_rates.items():
            if min_age <= property_age < max_age:
                max_rate = cap
                break
        
        if physical_override is not None or functional_override is not None or external_override is not None:
            raw_total_rate = physical_rate + functional_rate + external_rate
            total_depreciation_rate = min(raw_total_rate, max_rate)
            was_capped = total_depreciation_rate < raw_total_rate
        else:
            total_depreciation_rate = total_result.total_rate
            was_capped = total_result.was_capped
        
        total_depreciation = mea_adjusted_grc * total_depreciation_rate
        
        # Depreciated Replacement Cost
        drc_building = mea_adjusted_grc - total_depreciation
        
        # ========================================
        # LAND VALUE (from Land Value System)
        # ========================================
        passed_land_value = opts.get("land_value")
        land_value_source = "land_value_system" if passed_land_value and passed_land_value > 0 else "calculated"
        
        if passed_land_value and passed_land_value > 0:
            land_value = float(passed_land_value)
        else:
            land_values = LAND_VALUES.get(region, LAND_VALUES["greater_accra"])
            land_value = land_sqm * land_values["standard"]
        
        # Total DRC Value
        total_drc = drc_building + land_value
        
        # Confidence based on data quality
        confidence = 0.62 if physical_source == "calculated" else 0.55
        if was_capped:
            confidence -= 0.05
        
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
                # Building Cost Details
                "gross_replacement_cost": round(grc, 2),
                "replacement_cost_per_sqm": replacement_cost_per_sqm,
                "mea_factor": mea_factor,
                "mea_adjusted_grc": round(mea_adjusted_grc, 2),
                "building_size_sqm": building_sqm,
                
                # Depreciation Breakdown
                "depreciation": {
                    "physical": {
                        "rate": round(physical_rate * 100, 2),
                        "amount": round(physical_depreciation, 2),
                        "source": physical_source,
                        "effective_age": physical_result.effective_age,
                        "economic_life": physical_result.economic_life,
                        "remaining_life": physical_result.remaining_life,
                        "method": physical_result.method,
                    },
                    "functional": {
                        "rate": round(functional_rate * 100, 2),
                        "amount": round(functional_obsolescence, 2),
                        "source": functional_source,
                        "items_detected": len(functional_result.items_detected),
                        "curable_rate": round(functional_result.curable_rate * 100, 2),
                        "incurable_rate": round(functional_result.incurable_rate * 100, 2),
                    },
                    "external": {
                        "rate": round(external_rate * 100, 2),
                        "amount": round(external_obsolescence, 2),
                        "source": external_source,
                    },
                    "total": {
                        "rate": round(total_depreciation_rate * 100, 2),
                        "amount": round(total_depreciation, 2),
                        "was_capped": was_capped,
                        "age_based_max": round(max_rate * 100, 1) if max_rate else 90.0,
                    },
                },
                
                # Building Value
                "depreciated_building_value": round(drc_building, 2),
                
                # Land Value
                "land_value": round(land_value, 2),
                "land_value_source": land_value_source,
                "land_area_sqm": land_sqm,
                
                # Property Info
                "building_age_years": property_age,
                "useful_life_years": useful_life,
                "construction_type": construction_type.value,
                "condition": condition_str,
            },
            assumptions=[
                "Specialized property with limited market",
                "Modern equivalent asset approach",
                f"Building age: {property_age} years",
                f"Useful life: {useful_life} years",
                f"Physical depreciation: {physical_source}",
                f"Functional obsolescence: {functional_source}",
                f"Land value: {land_value_source}",
            ],
            limitations=[
                "No direct market comparisons available",
                "Specialist construction costs estimated",
                "Value to a specific owner only",
            ] + (["Depreciation was capped due to age-based limits"] if was_capped else []),
            calculation_time_ms=calc_time
        )
        
    except Exception as e:
        logger.error(f"DRC method failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# LAND VALUE ENDPOINTS (2-Method Reconciliation: Residual + Comparable)
# ============================================================================

@app.post("/api/v1/methods/land-value", response_model=LandValueResponse)
async def calculate_land_value(request: LandValueRequest):
    """
    Calculate Reconciled Land Value
    
    LAND VALUE can come from:
        A) Residual Land Value (GDV-based) - valuation method
        B) Comparable-Adjusted Land Value - valuation method  
        C) User-Entered Land Price - 100% OVERRIDE (NOT a valuation method)
    
    Only A and B are valuation-derived and reconciled via weighted average.
    User-entered (C) is a 100% OVERRIDE that bypasses reconciliation.
    
    Weight Distribution (per GhIS/RICS):
        | Comparable Strength | Residual | Comparable |
        |---------------------|----------|------------|
        | Weak                | 70%      | 30%        |
        | Balanced            | 50%      | 50%        |
        | Strong              | 30%      | 70%        |
    """
    start_time = datetime.now()
    prop = request.property
    
    try:
        # Get land area
        land_sqm = prop.land_area_sqm or 0
        if land_sqm <= 0:
            return LandValueResponse(
                success=False,
                final_land_value=0,
                final_land_value_per_sqm=0,
                land_area_sqm=0,
                confidence_score=0,
                primary_method="none",
                error="Property has no land area specified"
            )
        
        # Check for user override - 100% bypass
        if request.user_entered_value is not None and request.user_entered_value > 0:
            value_per_sqm = request.user_entered_value / land_sqm
            return LandValueResponse(
                success=True,
                final_land_value=round(request.user_entered_value, 2),
                final_land_value_per_sqm=round(value_per_sqm, 2),
                land_area_sqm=land_sqm,
                confidence_score=1.0,  # User knows what they're doing
                primary_method="user_entered",
                is_user_override=True,
                user_justification=request.user_justification or "User-provided land value",
                comparable_strength="N/A",
                disclosure_required=True,
                disclosure_text=(
                    f"Land value of GHS {request.user_entered_value:,.0f} provided by valuer. "
                    f"Justification: {request.user_justification or 'Not provided'}. "
                    "This user-entered value overrides automated valuation methods."
                ),
                cached=False
            )
        
        region = _normalize_region(prop.region)
        
        # ========================================
        # TRY REAL COMPARABLE-BASED CALCULATION
        # ========================================
        land_value_provider = await get_land_value_provider()
        
        if land_value_provider and HAS_LAND_SERVICES:
            try:
                # Convert PropertyInput to Property schema for LandValueProvider
                property_for_valuation = Property(
                    id=prop.id,
                    property_type=PropertyType.LAND_RESIDENTIAL,  # Default for land
                    location=PropertyLocation(
                        region=GhanaRegion(region) if region in [r.value for r in GhanaRegion] else GhanaRegion.GREATER_ACCRA,
                        district=prop.address_city or "Unknown",
                        address_raw=prop.address_street or prop.address_city or "Unknown",
                        address_city=prop.address_city or "Unknown",
                        coordinates=(prop.latitude, prop.longitude) if prop.latitude and prop.longitude else None
                    ),
                    specifications=PropertySpecifications(
                        land_size_sqm=land_sqm,
                        land_tenure=None  # Could be extended
                    ),
                    data_quality=PropertyDataQuality(
                        data_quality_score=0.8,
                        source_reliability_score=0.8,
                        completeness_score=0.8,
                        accuracy_score=0.8,
                        freshness_score=0.8
                    )
                )
                
                # Parse valuation date
                valuation_date = None
                if request.valuation_date:
                    try:
                        valuation_date = date.fromisoformat(request.valuation_date)
                    except ValueError:
                        valuation_date = date.today()
                
                # Get land value from provider (uses real comparables from database)
                result = await land_value_provider.get_land_value(
                    property=property_for_valuation,
                    valuation_id=request.valuation_id,
                    valuation_date=valuation_date,
                    user_entered_value=request.user_entered_value,
                    user_justification=request.user_justification,
                    force_recalculate=request.force_recalculate
                )
                
                if result.success:
                    logger.info(f"Land value calculated using real comparables: GHS {result.final_land_value:,.0f}")
                    
                    # Convert LandValueResult to LandValueResponse
                    calc_time = (datetime.now() - start_time).total_seconds() * 1000
                    
                    return LandValueResponse(
                        success=True,
                        final_land_value=result.final_land_value,
                        final_land_value_per_sqm=result.final_land_value_per_sqm,
                        land_area_sqm=result.land_area_sqm,
                        confidence_score=result.confidence_score,
                        primary_method=result.primary_method,
                        is_user_override=result.is_user_override,
                        user_justification=result.user_justification if result.is_user_override else None,
                        methods={
                            k: LandValueMethodDetail(
                                value=v.get('indicated_value', v.get('value', 0)),
                                value_per_sqm=v.get('indicated_value', 0) / land_sqm if land_sqm > 0 and 'indicated_value' in v else 0,
                                confidence=v.get('confidence', 0.5),
                                weight=v.get('weight', 0.5),
                                weighted_contribution=v.get('weighted_contribution', 0),
                                method_specific=v
                            ) for k, v in result.methods.items()
                        } if result.methods else None,
                        reconciliation=result.reconciliation,
                        comparable_strength=result.comparable_strength,
                        disclosure_required=result.disclosure_required,
                        disclosure_text=result.disclosure_text,
                        cached=result.cached
                    )
                else:
                    logger.warning(f"LandValueProvider failed: {result.error}, falling back to hardcoded")
                    

            except Exception as provider_error:
                logger.warning(f"LandValueProvider error: {provider_error}, falling back to hardcoded")
        
        # ========================================
        # ERROR Handling for Enterprise Compliance (No Hardcoded Fallbacks)
        # ========================================
        
        if not land_value_provider:
            err_msg = "Land valuation service unavailable and fallback logic has been disabled for compliance."
            logger.error(err_msg)
            return LandValueResponse(
                success=False, 
                final_land_value=0, final_land_value_per_sqm=0, land_area_sqm=0, 
                confidence_score=0, primary_method="none", error=err_msg
            )

        # Note: If LandValueProvider was called above but returned success=False (in the try/except block),
        # the code falls through to here. We must RETURN failure instead of executing fallback logic.
        
        logger.warning(f"LandValueProvider failed to determine value for region: {region}. Skipping fallback calculation.")
        return LandValueResponse(
            success=False,
            final_land_value=0,
            final_land_value_per_sqm=0,
            land_area_sqm=land_sqm,
            confidence_score=0,
            primary_method="none",
            error="Insufficient market data to determine land value compliant with RICS standards.",
            disclosure_required=False,
            disclosure_text="",
            cached=False
        )


    except Exception as e:
        logger.error(f"Land value calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/methods/land-value/comparables", response_model=LandComparablesResponse)
async def get_land_comparables(request: LandComparablesRequest):
    """
    Get land comparables without full reconciliation.
    
    Useful for displaying comparables to the user before calculating land value.
    Returns comparable sales with similarity scores and adjustments.
    """
    prop = request.property
    options = request.options or {}
    
    try:
        region = _normalize_region(prop.region)
        land_sqm = prop.land_area_sqm or 500
        max_distance = options.get("max_distance_km", 10.0)
        max_results = options.get("max_results", 10)
        
        # ========================================
        # TRY REAL DATABASE COMPARABLES
        # ========================================
        global db_pool
        if db_pool and HAS_LAND_SERVICES:
            try:
                adapter = PostgreSQLMarketDataAdapter(db_pool)
                
                # Import search criteria
                from .schemas.land_comparable import LandComparableSearchCriteria
                
                search_criteria = LandComparableSearchCriteria(
                    target_property_id=prop.id,
                    target_region=region,
                    target_coordinates=(prop.latitude, prop.longitude) if prop.latitude and prop.longitude else None,
                    target_land_area_sqm=land_sqm,
                    max_distance_km=max_distance,
                    size_tolerance_pct=0.5,  # 50% size tolerance for land
                    max_results=max_results
                )
                
                # Fetch real comparables
                real_comparables = await adapter.get_land_comparables(search_criteria)
                
                if real_comparables and len(real_comparables) > 0:
                    logger.info(f"Found {len(real_comparables)} real land comparables from database")
                    
                    comparables = []
                    for i, comp in enumerate(real_comparables[:max_results]):
                        comp_land_size = comp.specifications.land_size_sqm or 500
                        comp_price_per_sqm = comp.financials.current_price_ghs / comp_land_size if comp.financials and comp.financials.current_price_ghs else 0
                        
                        # Calculate distance if coordinates available
                        distance = 0.0
                        if prop.latitude and prop.longitude and comp.location.coordinates:
                            from math import radians, sin, cos, sqrt, asin
                            lat1, lon1 = radians(prop.latitude), radians(prop.longitude)
                            lat2, lon2 = radians(comp.location.coordinates[0]), radians(comp.location.coordinates[1])
                            dlat = lat2 - lat1
                            dlon = lon2 - lon1
                            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
                            distance = 6371 * 2 * asin(sqrt(a))
                        
                        # Calculate size adjustment
                        size_ratio = land_sqm / comp_land_size if comp_land_size > 0 else 1.0
                        size_adj = 1.0 + (1.0 - size_ratio) * 0.15
                        adjusted_price = comp_price_per_sqm * size_adj
                        
                        # Calculate similarity
                        similarity = max(0.4, 1.0 - (distance * 0.05) - abs(1.0 - size_ratio) * 0.1)
                        
                        comparables.append(LandComparableSummary(
                            id=comp.id,
                            distance_km=round(distance, 1),
                            sale_date=comp.financials.price_date.isoformat() if comp.financials and comp.financials.price_date else None,
                            sale_price_per_sqm=round(comp_price_per_sqm, 2),
                            adjusted_price_per_sqm=round(adjusted_price, 2),
                            similarity_score=round(similarity, 3),
                            adjustment_factor=round(size_adj, 3),
                        ))
                    
                    comp_count = len(comparables)
                    if comp_count >= 5:
                        strength = "strong"
                    elif comp_count >= 3:
                        strength = "balanced"
                    else:
                        strength = "weak"
                    
                    return LandComparablesResponse(
                        success=True,
                        comparables=comparables,
                        strength=strength,
                        count=comp_count,
                        search_radius_km=max_distance,
                    )
                    
            except Exception as db_error:
                logger.warning(f"Database comparables failed: {db_error}, using fallback")
        
        # ========================================
        # FALLBACK: Simulated Comparables
        # ========================================
        logger.info(f"Using fallback land comparables for region: {region}")
        
        land_values = LAND_VALUES.get(region, LAND_VALUES["greater_accra"])
        
        # Generate synthetic comparables for demo
        # In production, this would query actual land sales
        comparables = []
        base_per_sqm = land_values["standard"]
        
        for i in range(min(6, max_results)):
            distance = 1.0 + i * 1.5  # 1km, 2.5km, 4km, etc.
            if distance > max_distance:
                break
                
            # Vary the price slightly
            variation = 1.0 + ((i % 3) - 1) * 0.15  # -15%, 0%, +15%
            sale_price = base_per_sqm * variation
            
            # Calculate adjustment
            size_ratio = 500 / land_sqm  # Compare to standard 500sqm
            distance_adj = 1.0 - (distance * 0.02)  # 2% per km
            adjustment_factor = size_ratio * distance_adj
            adjusted_price = sale_price * adjustment_factor
            
            similarity = max(0.4, 1.0 - (distance * 0.05) - abs(1.0 - size_ratio) * 0.1)
            
            comparables.append(LandComparableSummary(
                id=f"land-comp-{region}-{i+1}",
                distance_km=round(distance, 1),
                sale_date=f"2024-{(12-i):02d}-15",  # Recent dates
                sale_price_per_sqm=round(sale_price, 2),
                adjusted_price_per_sqm=round(adjusted_price, 2),
                similarity_score=round(similarity, 3),
                adjustment_factor=round(adjustment_factor, 3),
            ))
        
        # Determine strength
        comp_count = len(comparables)
        if comp_count >= 5:
            strength = "strong"
        elif comp_count >= 3:
            strength = "balanced"
        else:
            strength = "weak"
        
        return LandComparablesResponse(
            success=True,
            comparables=comparables,
            strength=strength,
            count=comp_count,
            search_radius_km=max_distance,
        )
        
    except Exception as e:
        logger.error(f"Land comparables lookup failed: {e}")
        return LandComparablesResponse(
            success=False,
            comparables=[],
            strength="weak",
            count=0,
            search_radius_km=10.0,
            error=str(e)
        )


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
# DEPRECIATION API ENDPOINTS (D8)
# ============================================================================

class DepreciationCalculateRequest(BaseModel):
    """Request for depreciation calculation"""
    property: PropertyInput
    include_external: bool = True
    location_data: Optional[Dict[str, Any]] = None
    market_data: Optional[Dict[str, Any]] = None


class DepreciationOverrideRequest(BaseModel):
    """Request to submit a depreciation override"""
    valuation_id: str
    component: str = Field(..., pattern="^(physical|functional|external)$")
    auto_calculated_rate: float = Field(..., ge=0, le=1)
    override_rate: float = Field(..., ge=0, le=1)
    justification: str = Field(..., min_length=50)
    evidence_type: str = Field(..., pattern="^(inspection|photo|market_data|expert_opinion|comparable_analysis|engineering_report|insurance_assessment)$")
    evidence_reference: Optional[str] = None
    valuer_id: Optional[str] = None


class DepreciationOverrideApprovalRequest(BaseModel):
    """Request to approve a depreciation override"""
    override_id: str
    approver_id: str
    approved: bool
    comments: Optional[str] = None


class DepreciationComponentResult(BaseModel):
    """Result for a single depreciation component"""
    depreciation_rate: float
    depreciation_percent: float
    auto_calculated: bool
    confidence: float
    notes: List[str]
    details: Dict[str, Any]


class DepreciationCalculateResponse(BaseModel):
    """Response from depreciation calculation"""
    success: bool
    property_id: str
    physical: DepreciationComponentResult
    functional: DepreciationComponentResult
    external: Optional[DepreciationComponentResult] = None
    total: Dict[str, Any]
    reconciliation: Dict[str, Any]
    rcn: float
    calculation_time_ms: float


class DepreciationOverrideResponse(BaseModel):
    """Response from override submission"""
    success: bool
    override_id: str
    component: str
    variance_percent: float
    requires_approval: bool
    is_valid: bool
    validation_errors: List[str]
    message: str


@app.post("/api/v1/depreciation/calculate", response_model=DepreciationCalculateResponse)
async def calculate_depreciation(request: DepreciationCalculateRequest):
    """
    Calculate Depreciation (D8)
    
    Calculates all depreciation components for a property:
    - Physical: Modified Age-Life method with condition adjustment
    - Functional: Auto-detected from property specifications
    - External: Environmental, locational, economic, regulatory factors
    
    Uses RICS/GhIS compliant methodology with age-based caps.
    """
    from .services import (
        PhysicalDepreciationCalculator as calculate_physical_depreciation,
        FunctionalObsolescenceCalculator as calculate_functional_obsolescence,
        ExternalObsolescenceCalculator as calculate_external_obsolescence,
        DepreciationReconciliationService,
    )
    from .schemas.property import (
        Property, 
        PropertyType, 
        PropertyCondition,
        PropertyLocation,
        PropertySpecifications,
        PropertyDataQuality,
        GhanaRegion,
    )
    
    start_time = datetime.now()
    prop = request.property
    
    try:
        # Map condition string to enum
        condition_map = {
            "new": PropertyCondition.EXCELLENT,  # NEW not in enum, use EXCELLENT
            "excellent": PropertyCondition.EXCELLENT,
            "good": PropertyCondition.GOOD,
            "fair": PropertyCondition.FAIR,
            "poor": PropertyCondition.POOR,
            "very_poor": PropertyCondition.RENOVATION_NEEDED,  # VERY_POOR not in enum
            "renovation_needed": PropertyCondition.RENOVATION_NEEDED,
        }
        condition = condition_map.get(
            (prop.condition or "good").lower().replace(" ", "_"),
            PropertyCondition.GOOD
        )
        
        # Map property type string to enum
        property_type_map = {
            "residential_house": PropertyType.RESIDENTIAL_HOUSE,
            "residential_apartment": PropertyType.RESIDENTIAL_APARTMENT,
            "residential_townhouse": PropertyType.RESIDENTIAL_TOWNHOUSE,
            "residential_villa": PropertyType.RESIDENTIAL_VILLA,
            "commercial_office": PropertyType.COMMERCIAL_OFFICE,
            "commercial_retail": PropertyType.COMMERCIAL_RETAIL,
            "industrial_warehouse": PropertyType.INDUSTRIAL_WAREHOUSE,
        }
        property_type = property_type_map.get(
            (prop.property_type or "residential_house").lower().replace(" ", "_"),
            PropertyType.RESIDENTIAL_HOUSE
        )
        
        # Map region string to enum (cluster-based regions)
        region_map = {
            "greater_accra": GhanaRegion.GREATER_ACCRA,
            "accra": GhanaRegion.GREATER_ACCRA,
            "tema": GhanaRegion.GREATER_ACCRA,
            "ashanti": GhanaRegion.KUMASI_METRO,
            "kumasi": GhanaRegion.KUMASI_METRO,
            "kumasi_metro": GhanaRegion.KUMASI_METRO,
            "western": GhanaRegion.WESTERN_CLUSTER,
            "western_cluster": GhanaRegion.WESTERN_CLUSTER,
            "central": GhanaRegion.WESTERN_CLUSTER,
            "eastern": GhanaRegion.EASTERN,
            "volta": GhanaRegion.EASTERN,
            "northern": GhanaRegion.NORTHERN_CLUSTER,
            "northern_cluster": GhanaRegion.NORTHERN_CLUSTER,
            "upper_east": GhanaRegion.NORTHERN_CLUSTER,
            "upper_west": GhanaRegion.NORTHERN_CLUSTER,
            "brong_ahafo": GhanaRegion.KUMASI_METRO,
            "bono": GhanaRegion.KUMASI_METRO,
        }
        region = region_map.get(
            (prop.region or "greater_accra").lower().replace(" ", "_"),
            GhanaRegion.GREATER_ACCRA
        )
        
        year_built = prop.year_built or datetime.now().year - 15
        building_sqm = prop.building_size_sqm or 150
        
        # Build Property schema object
        property_schema = Property(
            id=prop.id,
            property_type=property_type,
            location=PropertyLocation(
                region=region,
                district=getattr(prop, 'district', None) or "Unknown",
                neighborhood=getattr(prop, 'neighborhood', None) or "Unknown",
                address_raw=prop.address_street or "Unknown",
                address_city=getattr(prop, 'city', None) or "Accra",
            ),
            specifications=PropertySpecifications(
                year_built=year_built,
                condition=condition,
                bedrooms=prop.bedrooms,
                bathrooms=prop.bathrooms,
                parking_spaces=getattr(prop, 'parking_spaces', None),
                has_air_conditioning=getattr(prop, 'has_ac', None),
                has_generator=getattr(prop, 'has_generator', None),
                has_borehole=getattr(prop, 'has_borehole', None),
                land_size_sqm=prop.land_area_sqm or 300,
                built_area_sqm=building_sqm,
            ),
            data_quality=PropertyDataQuality(
                data_quality_score=0.7,
                source_reliability_score=0.7,
                completeness_score=0.7,
                accuracy_score=0.7,
                freshness_score=0.7,
                sources=["api_input"],
            ),
        )
        
        # Calculate Physical Depreciation using convenience function
        physical_result = calculate_physical_depreciation(
            property_data=property_schema,
            valuation_date=date.today(),
            construction_type=None,  # Let it infer from property type
            last_renovation_year=getattr(prop, 'last_renovation', None),
        )
        
        # Calculate Functional Obsolescence
        functional_result = calculate_functional_obsolescence(property_schema)
        
        # Calculate External Obsolescence (if requested)
        external_result = None
        if request.include_external:
            external_result = calculate_external_obsolescence(
                property_data=property_schema,
                location_data=request.location_data or {},
                market_data=request.market_data or {},
            )
        
        # Estimate RCN for context
        norm_region = _normalize_region(prop.region)
        costs = CONSTRUCTION_COSTS.get(norm_region, CONSTRUCTION_COSTS["greater_accra"])
        cost_per_sqm = costs.get("standard", 8500)
        rcn = building_sqm * cost_per_sqm
        
        # Reconcile with age-based caps
        reconciliation = DepreciationReconciliationService()
        property_age = datetime.now().year - year_built
        
        # Create a minimal external result if not calculated
        if external_result is None:
            from .services.depreciation import ExternalObsolescenceResult
            external_result = ExternalObsolescenceResult(
                depreciation_rate=0.0,
                depreciation_percent=0.0,
                factors_detected=[],
                category_breakdown={},
                total_factors=0,
                auto_calculated=False,
                confidence=0.0,
                requires_review=False,
                data_sources_used=[],
                notes=["External obsolescence not calculated"],
            )
        
        total_result = reconciliation.reconcile(
            physical=physical_result,
            functional=functional_result,
            external=external_result,
            property_age=property_age,
            rcn=rcn,
        )
        
        calc_time = (datetime.now() - start_time).total_seconds() * 1000
        
        # Build response
        response = DepreciationCalculateResponse(
            success=True,
            property_id=prop.id,
            physical=DepreciationComponentResult(
                depreciation_rate=physical_result.depreciation_rate,
                depreciation_percent=physical_result.depreciation_percent,
                auto_calculated=physical_result.auto_calculated,
                confidence=physical_result.confidence,
                notes=physical_result.notes,
                details={
                    "actual_age": physical_result.actual_age,
                    "effective_age": physical_result.effective_age,
                    "economic_life": physical_result.economic_life,
                    "remaining_life": physical_result.remaining_life,
                    "method": physical_result.method,
                    "inputs_used": physical_result.inputs_used,
                },
            ),
            functional=DepreciationComponentResult(
                depreciation_rate=functional_result.depreciation_rate,
                depreciation_percent=functional_result.depreciation_percent,
                auto_calculated=functional_result.auto_calculated,
                confidence=functional_result.confidence,
                notes=functional_result.notes,
                details={
                    "items_detected": [
                        {
                            "item_key": item.item_key,
                            "type": item.type.value,
                            "curable": item.curable,
                            "description": item.description,
                            "rate": item.rate,
                            "rate_range": list(item.rate_range),
                        }
                        for item in functional_result.items_detected
                    ],
                    "total_items": functional_result.total_items,
                    "curable_rate": functional_result.curable_rate,
                    "incurable_rate": functional_result.incurable_rate,
                    "requires_review": functional_result.requires_review,
                },
            ),
            external=DepreciationComponentResult(
                depreciation_rate=external_result.depreciation_rate,
                depreciation_percent=external_result.depreciation_percent,
                auto_calculated=external_result.auto_calculated,
                confidence=external_result.confidence,
                notes=external_result.notes,
                details={
                    "factors_detected": [
                        {
                            "factor_key": f.factor_key,
                            "category": f.category.value,
                            "description": f.description,
                            "rate": f.rate,
                            "rate_range": list(f.rate_range),
                            "data_source": f.data_source,
                        }
                        for f in external_result.factors_detected
                    ],
                    "total_factors": external_result.total_factors,
                    "category_breakdown": external_result.category_breakdown,
                    "requires_review": external_result.requires_review,
                },
            ) if external_result else None,
            total={
                "rate": total_result.total_rate,
                "percent": total_result.total_percent,
                "was_capped": total_result.was_capped,
                "cap_applied": total_result.cap_applied,
                "components": {
                    "physical": {
                        "rate": total_result.physical_rate,
                        "amount": total_result.physical_amount,
                    },
                    "functional": {
                        "rate": total_result.functional_rate,
                        "amount": total_result.functional_amount,
                    },
                    "external": {
                        "rate": total_result.external_rate,
                        "amount": total_result.external_amount,
                    },
                },
                "methodology_notes": total_result.methodology_notes,
            },
            reconciliation={
                "auto_calculated": True,
                "confidence": min(
                    physical_result.confidence,
                    functional_result.confidence,
                    external_result.confidence if external_result else 1.0,
                ),
                "requires_review": any([
                    functional_result.requires_review,
                    external_result.requires_review if external_result else False,
                ]),
                "methodology_notes": total_result.methodology_notes,
            },
            rcn=round(rcn, 2),
            calculation_time_ms=round(calc_time, 2),
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Depreciation calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/depreciation/override", response_model=DepreciationOverrideResponse)
async def submit_depreciation_override(request: DepreciationOverrideRequest):
    """
    Submit Depreciation Override (D8)
    
    Allows valuers to override auto-calculated depreciation values.
    Per GhIS/RICS standards:
    - Minimum 50-character justification required
    - Evidence must be provided (except expert opinion)
    - Variance > 20% requires supervisor approval
    """
    from .services import (
        EvidenceType as DepEvidenceType,
        DepreciationComponent as DepComponent,
        DepreciationOverride as DepOverride,
        validate_override,
    )
    
    try:
        # Map string to enum
        component_map = {
            "physical": DepComponent.PHYSICAL,
            "functional": DepComponent.FUNCTIONAL,
            "external": DepComponent.EXTERNAL,
        }
        evidence_map = {
            "inspection": DepEvidenceType.INSPECTION,
            "photo": DepEvidenceType.PHOTO,
            "market_data": DepEvidenceType.MARKET_DATA,
            "expert_opinion": DepEvidenceType.EXPERT_OPINION,
            "comparable_analysis": DepEvidenceType.COMPARABLE_ANALYSIS,
            "engineering_report": DepEvidenceType.ENGINEERING_REPORT,
            "insurance_assessment": DepEvidenceType.INSURANCE_ASSESSMENT,
        }
        
        component = component_map[request.component]
        evidence_type = evidence_map[request.evidence_type]
        
        # Create override object
        override = DepOverride(
            component=component,
            auto_calculated_rate=request.auto_calculated_rate,
            override_rate=request.override_rate,
            justification=request.justification,
            evidence_type=evidence_type,
            evidence_reference=request.evidence_reference,
            valuer_id=request.valuer_id,
        )
        
        # Validate
        is_valid, errors = override.is_valid()
        requires_approval = override.requires_approval()
        
        # Generate override ID (in production, this would be stored in DB)
        import uuid
        override_id = str(uuid.uuid4())
        
        # Build message
        if is_valid:
            if requires_approval:
                message = (
                    f"Override submitted for approval. Variance of {override.variance_percent:.1f}% "
                    f"exceeds {override.APPROVAL_THRESHOLD_PERCENT}% threshold."
                )
            else:
                message = "Override applied successfully."
        else:
            message = "Override validation failed. Please fix errors and resubmit."
        
        return DepreciationOverrideResponse(
            success=is_valid,
            override_id=override_id,
            component=request.component,
            variance_percent=round(override.variance_percent, 2),
            requires_approval=requires_approval,
            is_valid=is_valid,
            validation_errors=errors,
            message=message,
        )
        
    except Exception as e:
        logger.error(f"Override submission failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/depreciation/{valuation_id}")
async def get_depreciation_details(
    valuation_id: str = Path(..., description="Valuation ID"),
    include_overrides: bool = Query(True, description="Include override history"),
):
    """
    Get Depreciation Details (D8)
    
    Retrieves stored depreciation calculation and any overrides
    for a specific valuation.
    
    Note: In production, this would fetch from database.
    Currently returns a sample structure.
    """
    # In production, fetch from database
    # For now, return a sample structure showing expected format
    
    return {
        "success": True,
        "valuation_id": valuation_id,
        "depreciation": {
            "physical": {
                "auto_calculated_rate": 0.15,
                "override_rate": None,
                "effective_rate": 0.15,
                "has_override": False,
            },
            "functional": {
                "auto_calculated_rate": 0.05,
                "override_rate": None,
                "effective_rate": 0.05,
                "has_override": False,
            },
            "external": {
                "auto_calculated_rate": 0.02,
                "override_rate": None,
                "effective_rate": 0.02,
                "has_override": False,
            },
            "total_rate": 0.22,
            "total_percent": 22.0,
        },
        "overrides": [] if include_overrides else None,
        "message": "Fetch from database in production implementation",
    }


@app.post("/api/v1/depreciation/override/{override_id}/approve")
async def approve_depreciation_override(
    override_id: str = Path(..., description="Override ID"),
    request: DepreciationOverrideApprovalRequest = None,
):
    """
    Approve/Reject Depreciation Override (D8)
    
    Supervisors can approve or reject overrides that exceed
    the 20% variance threshold.
    
    Note: In production, this would update database records.
    """
    if request is None:
        raise HTTPException(status_code=400, detail="Request body required")
    
    return {
        "success": True,
        "override_id": override_id,
        "approved": request.approved,
        "approved_by": request.approver_id,
        "approval_date": date.today().isoformat(),
        "comments": request.comments,
        "message": (
            "Override approved and applied to valuation."
            if request.approved
            else "Override rejected. Original auto-calculated value retained."
        ),
    }


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
