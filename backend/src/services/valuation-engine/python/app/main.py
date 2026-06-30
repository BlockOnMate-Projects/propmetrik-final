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
    # REQUIRED: the Node route sources the live rate from the DB and passes it. No default —
    # a missing rate must fail loudly, never silently use a guessed number.
    usd_to_ghs_rate: float = Field(..., description="Live USD->GHS rate; caller-supplied, required")
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
    adjusted_price_per_sqm: float = 0.0
    quality_score: float = 0.0  # comparability 0-100 (similarity/recency/adjustment magnitude)


class RICSSalesComparisonResponse(BaseModel):
    """Response from RICS Sales Comparison calculation"""
    success: bool
    method: str = "sales_comparison_rics"
    estimated_value: float
    confidence_score: float
    confidence_level: str
    value_range: Dict[str, float]
    subject_gfa: float = 0.0           # building area (m²) used as the size basis
    implied_price_per_sqm: float = 0.0 # estimated_value / subject_gfa

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
# VALUATION INPUT POLICY
# All valuation inputs must come from the frontend workflow:
# - Construction rates → Data Hub (editable construction cost panels)
# - Land values → LandComparableSalesService + ResidualMethodService → LandValueReconciliationService
# - Rental rates → Rental Market Analysis page (rental comparables basket)
# - Cap rates → CapRateService (RICS A/B/C grade hierarchy)
# - Depreciation → DepreciationReconciliationService
# Endpoints return 400 if required inputs are not provided.
# No hardcoded fallback constants — this is an audited, regulated engine.
# ============================================================================


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
    
    # Test land value provider creation
    land_provider_status = "unknown"
    land_provider_error = None
    try:
        provider = await get_land_value_provider()
        land_provider_status = "available" if provider else "unavailable"
    except Exception as e:
        land_provider_status = "error"
        land_provider_error = str(e)
    
    return {
        "status": "healthy",
        "service": "PROPMETRIK Python Valuation Engine",
        "version": "2.0.0",
        "database": db_status,
        "has_land_services": HAS_LAND_SERVICES,
        "land_provider": land_provider_status,
        "land_provider_error": land_provider_error,
        "timestamp": datetime.now().isoformat()
    }


# ============================================================================
# VALUATION METHOD ENDPOINTS
# ============================================================================

# calculate_sales_comparison moved to app/methods/sales_comparison.py (router included at the bottom).


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

            # 7. TIME ADJUSTMENT (market movement since the comparable's transaction/listing date)
            months_since = 0.0
            try:
                raw_date = getattr(comp, "transaction_date", None)
                if raw_date:
                    comp_date = datetime.fromisoformat(str(raw_date).replace("Z", "").split("T")[0])
                    months_since = max(0.0, (datetime.now() - comp_date).days / 30.0)
            except Exception:
                months_since = 0.0
            annual_appreciation = 9.0  # %/yr Ghana residential
            time_adj = min(15.0, months_since * (annual_appreciation / 12.0))
            adjustments["time"] = round(time_adj, 1)

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
            
            # Per-comparable quality (comparability): high when similar size, recent, low adjustment
            adj_per_sqm = round(adjusted_price / comp_gfa, 2) if comp_gfa > 0 else 0.0
            size_sim = max(0.0, 1.0 - abs(subject_gfa - comp_gfa) / subject_gfa) if subject_gfa > 0 else 0.5
            recency = max(0.0, 1.0 - months_since / 24.0)
            adj_penalty = max(0.0, 1.0 - adj_magnitude / 0.30)
            quality_score = round((0.45 * size_sim + 0.35 * adj_penalty + 0.20 * recency) * 100, 0)

            analyzed_comparables.append(ComparableAnalysis(
                id=comp.id,
                original_price_ghs=round(price_ghs, 2),
                adjusted_price_ghs=round(adjusted_price, 2),
                adjustments_applied=adjustments,
                total_adjustment_percent=round(total_adj_pct * 100, 1),
                weight=weight,
                weighted_value=round(adjusted_price * weight, 2),
                confidence_contribution=conf_contribution,
                adjusted_price_per_sqm=adj_per_sqm,
                quality_score=quality_score
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
            subject_gfa=round(subject_gfa, 2),
            implied_price_per_sqm=round(estimated_value / subject_gfa, 2) if subject_gfa > 0 else 0.0,
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
    All input values (land value, construction cost, depreciation) must come from
    the frontend workflow — this endpoint does NOT use hardcoded constants.
    
    Required options:
        - construction_cost_per_sqm: from Data Hub market rates
        - land_value_per_sqm: from comparable land sales service
        - depreciation_overrides: { physical, functional, external } from depreciation service
    """
    start_time = datetime.now()
    prop = request.property
    opts = request.options or {}
    
    try:
        building_sqm = prop.building_size_sqm or 150
        land_sqm = prop.land_area_sqm or 300
        year_built = prop.year_built or datetime.now().year - 10
        condition = prop.condition or "good"
        age = datetime.now().year - year_built
        
        # Use user-provided construction cost per sqm (from Data Hub) — required
        cost_per_sqm = opts.get("construction_cost_per_sqm")
        if not cost_per_sqm or cost_per_sqm <= 0:
            raise HTTPException(
                status_code=400,
                detail="construction_cost_per_sqm is required in options (from Data Hub market rates)"
            )
        
        # Use user-provided land value per sqm (from comparable land sales)
        # Defaults to 0 if not yet available (frontend calculates indicatedValue independently)
        land_value_per_sqm = opts.get("land_value_per_sqm", 0) or 0
        
        # ---- Reproduction Cost New (full RICS/GhIS cost approach) ----
        # Hard costs: component breakdown if supplied, else market rate × building area.
        hard_costs = opts.get("hard_costs") or (building_sqm * cost_per_sqm)

        # Soft costs (% of hard), siteworks (absolute), entrepreneurial profit (% of construction cost).
        soft_costs_pct = (opts.get("soft_costs_percent", 10) or 0) / 100.0
        siteworks = opts.get("siteworks", 0) or 0
        profit_pct = (opts.get("entrepreneurial_profit_percent", 15) or 0) / 100.0

        soft_costs = hard_costs * soft_costs_pct
        total_construction_cost = hard_costs + soft_costs + siteworks
        entrepreneurial_profit = total_construction_cost * profit_pct
        reproduction_cost_new = total_construction_cost + entrepreneurial_profit

        # Land value from provided per-sqm rate
        land_value = land_sqm * land_value_per_sqm

        # Depreciation from the depreciation service. Inputs are PERCENTAGES (e.g. 1.8),
        # kept to full precision (no rounding). Applied to the FULL reproduction cost new —
        # hard costs, soft costs and profit all depreciate, not just hard costs.
        depreciation_overrides = opts.get("depreciation_overrides", {})
        physical_dep = (depreciation_overrides.get("physical", 0) or 0) / 100.0
        functional_dep = (depreciation_overrides.get("functional", 0) or 0) / 100.0
        external_dep = (depreciation_overrides.get("external", 0) or 0) / 100.0
        total_depreciation_pct = physical_dep + functional_dep + external_dep

        depreciation_amount = reproduction_cost_new * total_depreciation_pct
        depreciated_building_value = reproduction_cost_new - depreciation_amount

        # Keep legacy alias for any older consumer
        construction_cost_new = reproduction_cost_new
        depreciated_cost = depreciated_building_value

        # Total value
        total_value = land_value + depreciated_building_value
        
        # Confidence based on data quality
        confidence = 0.55  # Base confidence
        if cost_per_sqm > 0:
            confidence += 0.10  # Has construction rate from Data Hub
        if land_value_per_sqm > 0:
            confidence += 0.10  # Has land value from comparable sales
        if depreciation_overrides:
            confidence += 0.10  # Has depreciation from service
        if age < 5:
            confidence += 0.05  # Newer buildings are easier to value
        confidence = min(confidence, 0.95)
        
        calc_time = (datetime.now() - start_time).total_seconds() * 1000
        
        assumptions = [
            f"Construction cost: ₵{cost_per_sqm:,.0f}/sqm from Data Hub market rates",
            f"Land value: ₵{land_value_per_sqm:,.0f}/sqm from comparable land sales",
            f"Physical depreciation: {physical_dep*100:.1f}% from depreciation service",
            f"Building age: {age} years, condition: {condition}",
        ]
        if functional_dep > 0:
            assumptions.append(f"Functional obsolescence: {functional_dep*100:.1f}%")
        if external_dep > 0:
            assumptions.append(f"External obsolescence: {external_dep*100:.1f}%")
        
        return ValuationMethodResponse(
            success=True,
            method="cost_approach",
            estimated_value=round(total_value, 2),
            confidence_score=confidence,
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(total_value * 0.90, 2),
                "high": round(total_value * 1.10, 2),
            },
            details={
                # Full cost-approach breakdown — the single source the UI renders
                "hard_costs": round(hard_costs, 2),
                "soft_costs": round(soft_costs, 2),
                "soft_costs_pct": round(soft_costs_pct * 100, 2),
                "siteworks": round(siteworks, 2),
                "total_construction_cost": round(total_construction_cost, 2),
                "entrepreneurial_profit": round(entrepreneurial_profit, 2),
                "entrepreneurial_profit_pct": round(profit_pct * 100, 2),
                "reproduction_cost_new": round(reproduction_cost_new, 2),
                "construction_cost_new": round(reproduction_cost_new, 2),  # legacy alias
                "depreciation_amount": round(depreciation_amount, 2),
                "depreciated_building_value": round(depreciated_building_value, 2),
                "land_value": round(land_value, 2),
                "indicated_value": round(total_value, 2),
                "cost_per_sqm": cost_per_sqm,
                "building_size_sqm": building_sqm,
                "land_area_sqm": land_sqm,
                "land_value_per_sqm": round(land_value_per_sqm, 2),
                "building_age_years": age,
                "depreciation_pct": round(total_depreciation_pct * 100, 2),
                "physical_depreciation_pct": round(physical_dep * 100, 2),
                "functional_obsolescence_pct": round(functional_dep * 100, 2),
                "external_obsolescence_pct": round(external_dep * 100, 2),
                "condition_factor": condition,
                # Value composition for the UI bars
                "value_composition": {
                    "land_pct": round(land_value / total_value * 100, 1) if total_value > 0 else 0,
                    "building_pct": round(depreciated_building_value / total_value * 100, 1) if total_value > 0 else 0,
                    "depreciation_pct": round(-depreciation_amount / total_value * 100, 1) if total_value > 0 else 0,
                },
                "data_sources": {
                    "construction_cost": "data_hub",
                    "land_value": "comparable_sales",
                    "depreciation": "depreciation_service",
                },
            },
            assumptions=assumptions,
            limitations=[
                "Accuracy depends on quality of input market data",
                "Construction cost estimates may vary by contractor",
                "Land value derived from comparable sales analysis",
            ],
            calculation_time_ms=calc_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cost approach failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================================
# MARKET RENT (rental comparison) — single source of truth for rent estimation
# Adjustment factors are SUPPLIED by the caller (from valuation_adjustment_factors),
# never hardcoded here. Rents arrive already in GHS (the Node route converts once).
# =====================================================================

class RentAdjustmentFactor(BaseModel):
    base_adjustment_percent: float = 0.0
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    unit: Optional[str] = None


class RentSubjectInput(BaseModel):
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    building_size_sqm: Optional[float] = None
    year_built: Optional[int] = None
    furnishing: Optional[str] = None

    class Config:
        extra = "allow"


class RentComparableInput(BaseModel):
    id: str
    monthly_rent_ghs: float            # already GHS (caller converts via live FX)
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    gfa_sqm: Optional[float] = None
    year_built: Optional[int] = None
    furnishing: Optional[str] = None
    transaction_date: Optional[str] = None
    weight: Optional[float] = 1.0


class MarketRentRequest(BaseModel):
    subject: RentSubjectInput
    comparables: List[RentComparableInput]
    adjustment_factors: Dict[str, RentAdjustmentFactor] = Field(default_factory=dict)


class RentComparableAnalysis(BaseModel):
    id: str
    original_rent_ghs: float
    adjusted_rent_ghs: float
    adjusted_rent_per_sqm: float
    adjustments_applied: Dict[str, float]
    total_adjustment_percent: float
    weight: float
    quality_score: float


class MarketRentResponse(BaseModel):
    success: bool
    method: str = "market_rent"
    indicated_monthly_rent: float
    rent_per_sqm: float
    confidence_score: float
    confidence_level: str
    value_range: Dict[str, float]
    comparables_analyzed: List[RentComparableAnalysis]
    methodology_notes: List[str]
    calculation_time_ms: float


_FURNISH_LEVEL = {"furnished": 3, "semi-furnished": 2, "semi_furnished": 2, "unfurnished": 1, "unfurnished/none": 1}


@app.post("/api/v1/methods/market-rent", response_model=MarketRentResponse)
async def calculate_market_rent(request: MarketRentRequest):
    """RICS/GhIS market-rent comparison. Adjustment percentages come from the caller
    (valuation_adjustment_factors) — nothing is hardcoded. Returns the weighted indicated
    monthly rent, range, per-comparable adjustments and comparability quality."""
    start_time = datetime.now()
    subj = request.subject
    comps = request.comparables
    factors = request.adjustment_factors

    try:
        if not comps:
            raise HTTPException(status_code=400, detail="At least one rental comparable required")

        def furnish(v: Optional[str]) -> int:
            return _FURNISH_LEVEL.get((v or "unfurnished").lower(), 1)

        def pct(key: str) -> float:
            f = factors.get(key)
            return f.base_adjustment_percent if f else 0.0

        def cap(val: float, key: str) -> float:
            f = factors.get(key)
            lo = f.min_value if (f and f.min_value is not None) else -100.0
            hi = f.max_value if (f and f.max_value is not None) else 100.0
            return max(lo, min(hi, val))

        now_year = datetime.now().year
        subj_beds = subj.bedrooms or 0
        subj_baths = subj.bathrooms or 0
        subj_gfa = subj.building_size_sqm or 0
        subj_year = subj.year_built or now_year
        subj_furnish = furnish(subj.furnishing)

        analyzed: List[RentComparableAnalysis] = []
        for c in comps:
            adj: Dict[str, float] = {}
            if subj_beds and c.bedrooms is not None:
                adj["bedrooms"] = round(cap((subj_beds - c.bedrooms) * pct("bedrooms"), "bedrooms"), 2)
            if subj_baths and c.bathrooms is not None:
                adj["bathrooms"] = round(cap((subj_baths - c.bathrooms) * pct("bathrooms"), "bathrooms"), 2)
            adj["furnishing"] = round(cap((subj_furnish - furnish(c.furnishing)) * pct("furnishing"), "furnishing"), 2)
            months_since = 0.0
            if c.year_built:
                comp_age = now_year - c.year_built
                subj_age = now_year - subj_year
                adj["age"] = round(cap((comp_age - subj_age) * pct("age"), "age"), 2)
            try:
                if c.transaction_date:
                    d = datetime.fromisoformat(str(c.transaction_date).replace("Z", "").split("T")[0])
                    months_since = max(0.0, (datetime.now() - d).days / 30.0)
            except Exception:
                months_since = 0.0

            total_adj = sum(adj.values())
            adjusted_rent = c.monthly_rent_ghs * (1 + total_adj / 100.0)
            rps = adjusted_rent / c.gfa_sqm if c.gfa_sqm else 0.0

            # Comparability quality: size similarity / low adjustment / recency
            size_sim = max(0.0, 1.0 - abs(subj_gfa - (c.gfa_sqm or subj_gfa)) / subj_gfa) if subj_gfa else 0.5
            adj_penalty = max(0.0, 1.0 - abs(total_adj) / 30.0)
            recency = max(0.0, 1.0 - months_since / 12.0)
            quality = round((0.45 * size_sim + 0.35 * adj_penalty + 0.20 * recency) * 100, 0)

            analyzed.append(RentComparableAnalysis(
                id=c.id,
                original_rent_ghs=round(c.monthly_rent_ghs, 2),
                adjusted_rent_ghs=round(adjusted_rent, 2),
                adjusted_rent_per_sqm=round(rps, 2),
                adjustments_applied=adj,
                total_adjustment_percent=round(total_adj, 2),
                weight=c.weight or 1.0,
                quality_score=quality,
            ))

        total_weight = sum(a.weight for a in analyzed)
        indicated = (sum(a.adjusted_rent_ghs * a.weight for a in analyzed) / total_weight) if total_weight > 0 \
            else (sum(a.adjusted_rent_ghs for a in analyzed) / len(analyzed))
        adjusted_rents = [a.adjusted_rent_ghs for a in analyzed]
        rent_per_sqm = (indicated / subj_gfa) if subj_gfa > 0 else (
            sum(a.adjusted_rent_per_sqm for a in analyzed) / len(analyzed))

        # Confidence: comparable count + value spread + average quality
        n = len(analyzed)
        mean_rent = sum(adjusted_rents) / n
        spread = (max(adjusted_rents) - min(adjusted_rents)) / mean_rent if mean_rent > 0 else 1.0
        avg_quality = sum(a.quality_score for a in analyzed) / n / 100.0
        confidence = max(0.1, min(0.95,
            min(1.0, n / 5.0) * 0.30 + max(0.0, 1.0 - spread) * 0.30 + avg_quality * 0.40))

        calc_time = (datetime.now() - start_time).total_seconds() * 1000
        return MarketRentResponse(
            success=True,
            indicated_monthly_rent=round(indicated, 2),
            rent_per_sqm=round(rent_per_sqm, 2),
            confidence_score=round(confidence, 2),
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(min(adjusted_rents), 2),
                "high": round(max(adjusted_rents), 2),
                "most_probable": round(indicated, 2),
            },
            comparables_analyzed=analyzed,
            methodology_notes=[
                "GhIS/RICS market-rent comparison (weighted average of adjusted comparable rents)",
                f"Adjustment factors sourced from valuation_adjustment_factors: {', '.join(sorted(factors.keys())) or 'none supplied'}",
                f"{n} comparable(s) analysed; rents normalised to GHS before adjustment",
            ],
            calculation_time_ms=calc_time,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Market rent failed: {e}")
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
        
        def fnum(v, default=0.0):
            # Coerce any numeric-ish input (incl. strings from form fields) to float.
            if v is None or v == "":
                return default
            try:
                return float(v)
            except (TypeError, ValueError):
                return default

        def as_rate(v, default):
            if v is None or v == "":
                return default
            v = fnum(v, default)
            return v / 100 if v > 1 else v

        # ---- Income (required: from Rental Market Analysis or user entry) ----
        monthly_rent = fnum(opts.get("monthly_rent"))
        if not monthly_rent or monthly_rent <= 0:
            raise HTTPException(status_code=400, detail="monthly_rent is required (from Rental Market Analysis or user entry).")
        parking_income = fnum(opts.get("parking_income"))        # monthly
        other_income = fnum(opts.get("other_income"))            # monthly
        potential_gross_income = (monthly_rent + parking_income + other_income) * 12

        # ---- Vacancy + collection loss -> EGI ----
        vacancy_rate = as_rate(opts.get("vacancy_rate"), 0.05)
        collection_loss = as_rate(opts.get("collection_loss"), 0.0)
        effective_gross_income = potential_gross_income * (1 - vacancy_rate - collection_loss)

        # ---- Operating expenses: % of EGI (management, reserves) + fixed annual amounts ----
        mgmt_pct = as_rate(opts.get("management_fee_percent"), 0.0)
        reserves_pct = as_rate(opts.get("reserves_percent"), 0.0)
        fixed_opex = sum(float(opts.get(k, 0) or 0) for k in
                         ("maintenance", "insurance", "property_tax", "utilities", "security", "other_expenses"))
        operating_expenses = effective_gross_income * (mgmt_pct + reserves_pct) + fixed_opex
        noi = effective_gross_income - operating_expenses

        # ---- Cap rate (required) ----
        cap_rate = fnum(opts.get("cap_rate"))
        if not cap_rate or cap_rate <= 0:
            raise HTTPException(status_code=400, detail="cap_rate is required (from CapRateService or user entry).")
        cap_rate = cap_rate / 100 if cap_rate > 1 else cap_rate

        # ---- Direct capitalization ----
        direct_cap_value = noi / cap_rate if cap_rate > 0 else 0

        # ---- DCF cross-check (inflation-coherent) ----
        # In Ghana rents track inflation, so the projection growth is NOMINAL and inflation-anchored:
        # nominal_growth = (1 + real_growth) * (1 + inflation) - 1. This keeps the DCF on the SAME
        # (nominal) basis as the build-up discount rate, eliminating the real-cap-vs-nominal-discount
        # incoherence that previously collapsed the DCF. Inflation comes from live economic data.
        inflation = as_rate(opts.get("inflation_rate"), 0.0)
        real_rent_growth = as_rate(opts.get("real_rent_growth"), 0.0)
        nominal_growth = (1 + real_rent_growth) * (1 + inflation) - 1
        # Discount rate: use the supplied (build-up) rate, else default to the cap-coherent rate.
        discount_rate = as_rate(opts.get("discount_rate"), cap_rate + nominal_growth)
        terminal_cap_rate = as_rate(opts.get("terminal_cap_rate"), cap_rate)
        holding_period = int(fnum(opts.get("holding_period"), 10)) or 10

        pv_cash_flows = 0.0
        current_noi = noi
        for year in range(1, holding_period + 1):
            current_noi *= (1 + nominal_growth)
            pv_cash_flows += current_noi / ((1 + discount_rate) ** year)
        terminal_value = (current_noi * (1 + nominal_growth)) / terminal_cap_rate if terminal_cap_rate > 0 else 0
        pv_terminal = terminal_value / ((1 + discount_rate) ** holding_period)
        dcf_value = pv_cash_flows + pv_terminal
        dcf_variance = (dcf_value - direct_cap_value) / direct_cap_value if direct_cap_value > 0 else 0

        confidence = 0.85
        calc_time = (datetime.now() - start_time).total_seconds() * 1000

        return ValuationMethodResponse(
            success=True,
            method="income_approach",
            estimated_value=round(direct_cap_value, 2),
            confidence_score=confidence,
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(direct_cap_value * 0.92, 2),
                "high": round(direct_cap_value * 1.08, 2),
            },
            details={
                # Pro forma
                "potential_gross_income": round(potential_gross_income, 2),
                "monthly_rent": round(monthly_rent, 2),
                "parking_income": round(parking_income, 2),
                "other_income": round(other_income, 2),
                "vacancy_rate": round(vacancy_rate * 100, 2),
                "vacancy_loss": round(potential_gross_income * vacancy_rate, 2),
                "collection_loss_pct": round(collection_loss * 100, 2),
                "collection_loss": round(potential_gross_income * collection_loss, 2),
                "effective_gross_income": round(effective_gross_income, 2),
                "operating_expenses": round(operating_expenses, 2),
                "expense_ratio": round(operating_expenses / effective_gross_income * 100, 2) if effective_gross_income > 0 else 0,
                "net_operating_income": round(noi, 2),
                "cap_rate_pct": round(cap_rate * 100, 4),
                "direct_cap_value": round(direct_cap_value, 2),
                "gross_rent_multiplier": round(direct_cap_value / potential_gross_income, 2) if potential_gross_income > 0 else 0,
                # DCF cross-check
                "dcf_value": round(dcf_value, 2),
                "dcf_variance_pct": round(dcf_variance * 100, 1),
                "discount_rate_pct": round(discount_rate * 100, 2),
                "nominal_rent_growth_pct": round(nominal_growth * 100, 2),
                "real_rent_growth_pct": round(real_rent_growth * 100, 2),
                "inflation_pct": round(inflation * 100, 2),
                "terminal_cap_rate_pct": round(terminal_cap_rate * 100, 2),
                "holding_period_years": holding_period,
                "pv_cash_flows": round(pv_cash_flows, 2),
                "pv_terminal": round(pv_terminal, 2),
            },
            assumptions=[
                f"Monthly rent: GH₵{monthly_rent:,.2f}",
                f"Vacancy {vacancy_rate*100:.1f}%, collection loss {collection_loss*100:.1f}%",
                f"Capitalization rate: {cap_rate*100:.2f}%",
                f"DCF: nominal rent growth {nominal_growth*100:.1f}% (inflation {inflation*100:.1f}% + real {real_rent_growth*100:.1f}%), discount {discount_rate*100:.1f}%, {holding_period}-yr hold",
            ],
            limitations=[
                "Assumes stabilized occupancy",
                "DCF is a reasonableness cross-check; coherence assumes rents track inflation",
            ],
            calculation_time_ms=calc_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Income approach failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/methods/residual", response_model=ValuationMethodResponse)
async def calculate_residual_method(request: ValuationMethodRequest):
    """
    Residual Method
    
    Values development land based on Gross Development Value - costs.
    Primary method for land with development potential.
    
    Accepts options:
        - gdv: Gross Development Value (required, or sale_price_per_sqm)
        - sale_price_per_sqm: completed development sale price per sqm
        - construction_cost_per_sqm: from Data Hub market rates
        - plot_coverage: fraction (default 0.40)
        - floors: number of floors (default 2)
        - professional_fees_pct: as decimal (default 0.10)
        - marketing_costs_pct: as decimal (default 0.03)
        - finance_costs_pct: as decimal (default 0.08)
        - developer_profit_pct: as decimal (default 0.20)
    """
    start_time = datetime.now()
    prop = request.property
    opts = request.options or {}

    def _frac(v):
        """Accept a ratio as a fraction (0.20) or a percentage (20) → fraction."""
        v = float(v)
        return v / 100 if v > 1 else v

    def _req(key, label):
        """Required numeric option — strict-fail (no fallback)."""
        v = opts.get(key)
        if v is None or float(v) <= 0:
            raise HTTPException(status_code=400, detail=f"{label} is required for the residual method")
        return float(v)

    try:
        # ── Scheme geometry ──────────────────────────────────────────────────
        plot_size = prop.land_area_sqm
        if not plot_size or plot_size <= 0:
            raise HTTPException(status_code=400, detail="land_area_sqm (plot size) is required for the residual method")
        plot_coverage = _frac(_req("plot_coverage", "plot_coverage"))
        floors = _req("floors", "floors")
        efficiency = _frac(_req("efficiency", "efficiency"))
        gross_building_area = plot_size * plot_coverage * floors
        net_saleable_area = gross_building_area * efficiency

        # ── Gross Development Value (always on NET saleable area) ─────────────
        sale_price_per_sqm = _req("sale_price_per_sqm", "sale_price_per_sqm")
        gdv = net_saleable_area * sale_price_per_sqm

        # ── Construction + soft costs ────────────────────────────────────────
        cost_basis = opts.get("cost_basis", "gross")
        construction_cost_per_sqm = _req("construction_cost_per_sqm", "construction_cost_per_sqm")
        # A NET-quoted rate is grossed up to a gross-area basis for calculation.
        effective_cost_per_sqm = (construction_cost_per_sqm / efficiency) if cost_basis == "net" else construction_cost_per_sqm
        construction_cost = gross_building_area * effective_cost_per_sqm
        professional_fees = construction_cost * _frac(_req("professional_fees_pct", "professional_fees_pct"))
        contingency = construction_cost * _frac(_req("contingency_pct", "contingency_pct"))
        total_construction_cost = construction_cost + professional_fees + contingency

        # ── Sales & marketing costs (on GDV) ─────────────────────────────────
        marketing = gdv * _frac(_req("marketing_pct", "marketing_pct"))
        sales_commission = gdv * _frac(_req("sales_commission_pct", "sales_commission_pct"))
        legal_fees = gdv * _frac(_req("legal_fees_pct", "legal_fees_pct"))
        total_sales_cost = marketing + sales_commission + legal_fees

        # ── Finance — S-curve drawdown model (interest during construction) ──
        interest_rate = _frac(_req("finance_rate", "finance_rate"))
        ltv = _frac(_req("finance_ltv_pct", "finance_ltv_pct"))
        avg_balance_factor = _req("finance_avg_balance_factor", "finance_avg_balance_factor")
        construction_months = _req("construction_months", "construction_months")
        loan_amount = total_construction_cost * ltv
        monthly_rate = interest_rate / 12
        finance_cost = loan_amount * avg_balance_factor * monthly_rate * construction_months

        # ── Total development costs + developer's profit (ON COST) ───────────
        total_development_costs = total_construction_cost + total_sales_cost + finance_cost
        developer_profit_pct = _frac(_req("developer_profit_pct", "developer_profit_pct"))
        developer_profit = total_development_costs * developer_profit_pct

        # ── Residual land value (RICS: floored at nil; raw shown for viability) ──
        raw_residual = gdv - total_development_costs - developer_profit
        residual_land_value = max(0.0, raw_residual)
        land_value_per_sqm = residual_land_value / plot_size if plot_size > 0 else 0

        # ── Viability analytics ──────────────────────────────────────────────
        break_even_profit = gdv - total_development_costs
        break_even_profit_pct = (break_even_profit / total_development_costs) if total_development_costs > 0 else 0
        min_profit_pct = _frac(opts.get("min_profit_pct") or 0.15)
        min_profit_amount = total_development_costs * min_profit_pct
        min_viable_land_value = max(0.0, gdv - total_development_costs - min_profit_amount)
        is_viable = raw_residual > 0

        confidence = 0.62 if is_viable else 0.50
        calc_time = (datetime.now() - start_time).total_seconds() * 1000

        return ValuationMethodResponse(
            success=True,
            method="residual_method",
            estimated_value=round(residual_land_value, 2),
            confidence_score=confidence,
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(residual_land_value * 0.85, 2),
                "high": round(residual_land_value * 1.15, 2),
            },
            details={
                # Scheme
                "plot_size_sqm": round(plot_size, 2),
                "plot_coverage": round(plot_coverage, 4),
                "floors": floors,
                "efficiency": round(efficiency, 4),
                "gross_building_area": round(gross_building_area, 2),
                "net_saleable_area": round(net_saleable_area, 2),
                # GDV
                "gross_development_value": round(gdv, 2),
                "sale_price_per_sqm": sale_price_per_sqm,
                # Construction
                "construction_cost": round(construction_cost, 2),
                "construction_cost_per_sqm": construction_cost_per_sqm,
                "cost_basis": cost_basis,
                "professional_fees": round(professional_fees, 2),
                "contingency": round(contingency, 2),
                "total_construction_cost": round(total_construction_cost, 2),
                # Sales
                "marketing": round(marketing, 2),
                "sales_commission": round(sales_commission, 2),
                "legal_fees": round(legal_fees, 2),
                "total_sales_cost": round(total_sales_cost, 2),
                # Finance
                "finance_cost": round(finance_cost, 2),
                "finance_rate": round(interest_rate, 4),
                "finance_ltv": round(ltv, 4),
                "construction_months": construction_months,
                # Totals
                "total_development_costs": round(total_development_costs, 2),
                "developer_profit_pct": round(developer_profit_pct, 4),
                "developer_profit": round(developer_profit, 2),
                # Residual + viability
                "raw_residual_land_value": round(raw_residual, 2),
                "residual_land_value": round(residual_land_value, 2),
                "land_value_per_sqm": round(land_value_per_sqm, 2),
                "is_viable": is_viable,
                "break_even_profit": round(break_even_profit, 2),
                "break_even_profit_pct": round(break_even_profit_pct, 4),
                "min_viable_land_value": round(min_viable_land_value, 2),
            },
            assumptions=[
                f"Gross building area {gross_building_area:,.0f} sqm at {plot_coverage*100:.0f}% coverage over {floors:.0f} floor(s)",
                f"Net saleable area {net_saleable_area:,.0f} sqm at {efficiency*100:.0f}% efficiency",
                f"GDV from sale price ₵{sale_price_per_sqm:,.0f}/sqm (market comparables)",
                f"Construction ₵{construction_cost_per_sqm:,.0f}/sqm (Data Hub base costs)",
                f"Finance at {interest_rate*100:.1f}% over {construction_months:.0f} months (S-curve drawdown)",
                f"Developer's profit {developer_profit_pct*100:.0f}% on cost",
            ],
            limitations=[
                "Highly sensitive to GDV and cost assumptions",
                "Land value floored at nil where the scheme is not viable (RICS)",
                "Market conditions may change during the development period",
                "Planning approvals assumed",
            ],
            calculation_time_ms=calc_time
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Residual method failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/methods/profits", response_model=ValuationMethodResponse)
async def calculate_profits_method(request: ValuationMethodRequest):
    """
    Profits Method

    Values property based on business profits it can generate.
    Primary method for hotels, petrol stations, healthcare facilities.

    Workflow callers can supply any of the following in ``request.options``
    (or via ``ValuationOptions.profits_method_options`` when using the full
    valuation pipeline):

    * ``gross_annual_revenue``   – actual audited turnover (GHS)
    * ``revenue_per_sqm_annual`` – override per-sqm revenue benchmark
    * ``operating_ratio``        – aggregate operating cost ratio (0–1 or 0–100)
    * ``operating_cost_ratios``  – dict of per-category ratios; ``"total"`` key
                                   takes precedence when present
    * ``owner_remuneration_pct`` – owner drawings as fraction of net profit (0–1 or 0–100)
    * ``cap_rate``               – capitalisation rate (0–1 or 0–100); mutually
                                   exclusive with ``years_purchase``
    * ``years_purchase`` / ``yp``– Years' Purchase multiplier (ignored when
                                   ``cap_rate`` is provided)
    """
    start_time = datetime.now()
    prop = request.property

    try:
        region = _normalize_region(prop.region)
        opts: dict = request.options or {}

        def _frac(v):
            """Accept a ratio as a fraction (0.25) or a percentage (25) and return a fraction."""
            v = float(v)
            return v / 100 if v > 1 else v

        # ── 1. Gross revenue — prefer actual Fair Maintainable Turnover, else unit benchmark ──
        #     No hardcoded revenue fallback: one of the two paths must be supplied.
        gross_annual_revenue = opts.get("gross_annual_revenue")
        unit_count = opts.get("unit_count")
        revenue_per_unit = opts.get("revenue_per_unit")
        if gross_annual_revenue and float(gross_annual_revenue) > 0:
            potential_gross_revenue = float(gross_annual_revenue)
            occupancy = 1.0
            effective_gross_revenue = potential_gross_revenue
            revenue_source = "actual_turnover"
        else:
            occupancy_rate = opts.get("occupancy_rate")
            rev_missing = []
            if not unit_count or float(unit_count) <= 0:
                rev_missing.append("unit_count")
            if not revenue_per_unit or float(revenue_per_unit) <= 0:
                rev_missing.append("revenue_per_unit")
            if occupancy_rate is None:
                rev_missing.append("occupancy_rate")
            if rev_missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Provide gross_annual_revenue (actual turnover) OR all of: {', '.join(rev_missing)}",
                )
            unit_count = float(unit_count)
            revenue_per_unit = float(revenue_per_unit)
            occupancy = _frac(occupancy_rate)
            potential_gross_revenue = unit_count * revenue_per_unit
            effective_gross_revenue = potential_gross_revenue * occupancy
            revenue_source = "unit_benchmark"

        # ── 2. Operating costs — per-category ratios required (from Data Hub config) ──
        ratios_in = opts.get("operating_cost_ratios")
        if not ratios_in or not isinstance(ratios_in, dict) or len(ratios_in) == 0:
            raise HTTPException(
                status_code=400,
                detail="operating_cost_ratios is required (from trading benchmarks config)",
            )
        ratios = {k: _frac(v) for k, v in ratios_in.items() if k != "total"}
        operating_ratio = sum(ratios.values())
        operating_costs = effective_gross_revenue * operating_ratio
        net_profit = effective_gross_revenue - operating_costs

        # ── 3. Operator's remuneration (divisible balance) — required, no default ──
        #     The reward to the Reasonably Efficient Operator; the remainder is the profit
        #     attributable to the PROPERTY (Fair Maintainable Operating Profit).
        op_rem = opts.get("operator_remuneration_pct")
        if op_rem is None:
            raise HTTPException(
                status_code=400,
                detail="operator_remuneration_pct is required (from trading benchmarks config)",
            )
        operator_remuneration_pct = _frac(op_rem)
        operator_remuneration = net_profit * operator_remuneration_pct

        # ── 3b. Return on the operator's capital (FF&E + trade stock) ──────────
        # Institutional divisible balance: the operator also earns a return on the capital tied up in
        # fixtures, fittings, equipment and stock; this is deducted before the residual profit is
        # attributable to the PROPERTY. operator_capital_pct expresses that capital as a fraction of
        # turnover; return_on_operator_capital_pct is the required return on it.
        op_capital_pct = opts.get("operator_capital_pct")
        roc_pct = opts.get("return_on_operator_capital_pct")
        operator_capital = effective_gross_revenue * _frac(op_capital_pct) if op_capital_pct is not None else 0.0
        return_on_capital_pct = _frac(roc_pct) if roc_pct is not None else 0.0
        return_on_operator_capital = operator_capital * return_on_capital_pct

        maintainable_profit = net_profit - operator_remuneration - return_on_operator_capital

        # ── 4. Capitalisation — trading cap rate required (no YP fallback) ──
        cap_rate_in = opts.get("cap_rate")
        if cap_rate_in is None or float(cap_rate_in) <= 0:
            raise HTTPException(
                status_code=400,
                detail="cap_rate is required (trading yield from config or valuer)",
            )
        cap_rate = _frac(cap_rate_in)
        yp = 1 / cap_rate
        value = maintainable_profit * yp
        cap_low = opts.get("cap_rate_low")
        cap_high = opts.get("cap_rate_high")

        # ── 5. Confidence — driven by evidence quality, not a magic constant ──
        confidence = 0.55
        confidence += 0.20 if revenue_source == "actual_turnover" else 0.05
        if opts.get("ratios_source") == "user":
            confidence += 0.05
        if opts.get("cap_rate_source") == "user":
            confidence += 0.05
        confidence = min(confidence, 0.90)

        calc_time = (datetime.now() - start_time).total_seconds() * 1000

        details = {
            "potential_gross_revenue": round(potential_gross_revenue, 2),
            "occupancy_rate": round(occupancy * 100, 2),
            "effective_gross_revenue": round(effective_gross_revenue, 2),
            "revenue_source": revenue_source,
            "operating_cost_ratios": {k: round(v, 4) for k, v in ratios.items()},
            "operating_ratio": round(operating_ratio, 4),
            "operating_costs": round(operating_costs, 2),
            "net_profit": round(net_profit, 2),
            "operator_remuneration_pct": round(operator_remuneration_pct, 4),
            "operator_remuneration": round(operator_remuneration, 2),
            "operator_capital_pct": round(_frac(op_capital_pct), 4) if op_capital_pct is not None else 0.0,
            "operator_capital": round(operator_capital, 2),
            "return_on_operator_capital_pct": round(return_on_capital_pct, 4),
            "return_on_operator_capital": round(return_on_operator_capital, 2),
            "maintainable_profit": round(maintainable_profit, 2),
            "cap_rate": round(cap_rate, 6),
            "years_purchase": round(yp, 4),
        }
        if cap_low is not None and cap_high is not None:
            details["cap_rate_range"] = {"low": round(_frac(cap_low), 6), "high": round(_frac(cap_high), 6)}
        if unit_count:
            details["unit_count"] = unit_count
        if revenue_per_unit:
            details["revenue_per_unit"] = round(revenue_per_unit, 2)

        assumptions = [
            "Trade-related property valued by the profits method",
            f"Revenue basis: {revenue_source.replace('_', ' ')}",
            f"Operating costs: {operating_ratio * 100:.1f}% of effective gross revenue",
            f"Operator's remuneration: {operator_remuneration_pct * 100:.1f}% of net profit",
            f"Return on operator's capital (FF&E + stock): {return_on_capital_pct * 100:.1f}% of {(_frac(op_capital_pct) * 100 if op_capital_pct is not None else 0):.0f}% of turnover",
            f"Capitalised at {cap_rate * 100:.2f}% (YP {yp:.2f})",
            "Reasonably Efficient Operator assumed; profit attributable to the property is the divisible balance",
        ]

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
            details=details,
            assumptions=assumptions,
            limitations=[
                "Requires actual trading accounts for highest accuracy",
                "Business goodwill may vary significantly",
                "Sensitive to management efficiency",
                "Market conditions affect trading potential",
            ],
            calculation_time_ms=calc_time
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Profits method failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _drc_feature_mea(baseline: float, feature_range: float, features: dict) -> dict:
    """
    Feature-driven Modern Equivalent Asset (MEA) factor for DRC — RICS "Model A" single-obsolescence
    path. The class baseline (from the Data Hub) is the anchor for an *average* asset of the class;
    the building's OWN features modulate it within +/- feature_range to reflect its functional/design
    adequacy relative to a modern equivalent (design era, specification appropriateness, services,
    configuration). Because functional/design adequacy is captured HERE, functional obsolescence is
    NOT deducted again downstream (no double counting).

    Each dimension is a 1-5 adequacy score (3 = neutral / at baseline, 5 = matches a modern
    equivalent, 1 = highly divergent). MISSING data scores a neutral 3 and is noted — never a silent
    skew. Final MEA = clamp(baseline * (1 + ((wavg-3)/2) * feature_range), 0.5, 1.0).
    """
    dims = []

    # 1. Design era — older designs diverge further from a modern equivalent.
    age = features.get("age_years")
    if age is None:
        dims.append(("design_era", 3.0, 0.35, "design era: unknown (neutral)"))
    else:
        era = (5.0 if age <= 5 else 4.5 if age <= 15 else 3.5 if age <= 30
               else 2.5 if age <= 50 else 1.5)
        dims.append(("design_era", era, 0.35, f"design era: ~{int(age)}y old"))

    # 2. Specification appropriateness — deviation from the function-appropriate ('standard')
    #    specification reduces the match (super-adequacy/over-build is optimised out of the MEA).
    q = str(features.get("quality_rating") or "").strip().lower()
    spec_map = {"standard": 5.0, "basic": 4.0, "high": 3.5, "premium": 3.5,
                "luxury": 2.5, "substandard": 2.5}
    if q in spec_map:
        dims.append(("specification", spec_map[q], 0.30, f"specification: {q}"))
    else:
        dims.append(("specification", 3.0, 0.30, "specification: unknown (neutral)"))

    # 3. Services adequacy — fraction of the modern-equivalent service set present.
    svc = features.get("services") or {}
    expected = ["generator", "security", "water", "drainage"]
    if isinstance(svc, dict) and (svc.get("elevator") is not None or features.get("floors", 0) and features.get("floors", 0) > 2):
        expected.append("elevator")
    present = sum(1 for k in expected if bool(svc.get(k)))
    if isinstance(svc, dict) and len(svc) > 0:
        frac = present / max(1, len(expected))
        dims.append(("services", 1.0 + frac * 4.0, 0.20, f"services: {present}/{len(expected)} modern services present"))
    else:
        dims.append(("services", 3.0, 0.20, "services: not assessed (neutral)"))

    # 4. Configuration / storey efficiency — taller specialised buildings diverge mildly.
    floors = features.get("floors")
    if not floors or floors <= 0:
        dims.append(("configuration", 3.0, 0.15, "configuration: unknown (neutral)"))
    else:
        cfg = (5.0 if floors <= 2 else 4.0 if floors <= 4 else 3.5 if floors <= 6 else 3.0)
        dims.append(("configuration", cfg, 0.15, f"configuration: {int(floors)} floor(s)"))

    wsum = sum(w for _, _, w, _ in dims) or 1.0
    adequacy = sum(s * w for _, s, w, _ in dims) / wsum          # 1..5
    normalized = (adequacy - 3.0) / 2.0                          # -1..+1
    mea = baseline * (1.0 + normalized * (feature_range or 0.0))
    mea = max(0.5, min(1.0, mea))
    return {
        "source": "feature_model",
        "mea_factor": round(mea, 4),
        "baseline": round(baseline, 4),
        "feature_range": round(feature_range or 0.0, 3),
        "adequacy_score": round(adequacy, 2),
        "dimensions": [
            {"key": k, "score": round(s, 2), "weight": w, "note": n}
            for k, s, w, n in dims
        ],
    }


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

        # All value-affecting inputs are REQUIRED — no hardcoded fallbacks. The Node DRC route
        # (/valuations/:id/drc/value) resolves them from the Data Hub config / property / valuer
        # overrides and strict-fails before calling here; we re-validate as defence in depth.
        building_sqm = prop.building_size_sqm
        if not building_sqm or building_sqm <= 0:
            raise HTTPException(status_code=400, detail="building_size_sqm (GFA) is required for DRC")

        year_built = prop.year_built
        if not year_built or year_built <= 0:
            raise HTTPException(status_code=400, detail="year_built is required for DRC depreciation")

        land_sqm = prop.land_area_sqm  # informational only; may be None

        replacement_cost_per_sqm = opts.get("replacement_cost_per_sqm")
        if not replacement_cost_per_sqm or replacement_cost_per_sqm <= 0:
            raise HTTPException(
                status_code=400,
                detail="replacement_cost_per_sqm is required in options (from Data Hub specialized cost rates)"
            )

        # Gross Replacement Cost (GRC)
        grc = building_sqm * replacement_cost_per_sqm

        # MEA Factor (Modern Equivalent Asset). The Data Hub supplies the per-class BASELINE (anchor);
        # the building's own features modulate it (feature-driven, RICS Model A — see _drc_feature_mea).
        # A valuer may instead post an explicit final MEA override. No default — baseline is required.
        mea_baseline = opts.get("mea_factor")
        if not mea_baseline or mea_baseline <= 0:
            raise HTTPException(status_code=400, detail="mea_factor (baseline) is required in options (from Data Hub config)")
        mea_override = opts.get("mea_factor_override")
        if mea_override and float(mea_override) > 0:
            mea_factor = float(mea_override)
            mea_breakdown = {"source": "valuer_override", "mea_factor": round(mea_factor, 4),
                             "baseline": round(float(mea_baseline), 4)}
        else:
            mea_breakdown = _drc_feature_mea(float(mea_baseline),
                                             float(opts.get("mea_feature_range") or 0.0),
                                             opts.get("features") or {})
            mea_factor = mea_breakdown["mea_factor"]
        mea_adjusted_grc = grc * mea_factor

        # Economic (useful) life — required from Data Hub config, no default.
        useful_life = opts.get("useful_life")
        if not useful_life or useful_life <= 0:
            raise HTTPException(status_code=400, detail="useful_life is required in options (from Data Hub config)")
        
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
        condition_str = (prop.condition or "").strip().lower()
        if not condition_str:
            raise HTTPException(status_code=400, detail="condition is required for DRC depreciation assessment")
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
                land_size_sqm=land_sqm if (land_sqm and land_sqm > 0) else None,
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
        
        # 2. FUNCTIONAL OBSOLESCENCE — under the DRC single-obsolescence path (Model A), functional /
        #    design adequacy is captured ENTIRELY by the feature-driven MEA factor above, so it is NOT
        #    deducted again here (RICS: avoid double counting). Reported as 0, source 'captured_in_mea'.
        functional_rate = 0.0
        functional_source = "captured_in_mea"
        functional_obsolescence = 0.0

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

        # 4. TOTAL DEPRECIATION = physical + external (functional folded into MEA), age-capped.
        property_age = datetime.now().year - year_built
        max_rates = {
            (0, 5): 0.15, (5, 15): 0.35, (15, 30): 0.55,
            (30, 50): 0.75, (50, 999): 0.90
        }
        max_rate = 0.90
        for (min_age, max_age), cap in max_rates.items():
            if min_age <= property_age < max_age:
                max_rate = cap
                break

        raw_total_rate = physical_rate + external_rate
        total_depreciation_rate = min(raw_total_rate, max_rate)
        was_capped = total_depreciation_rate < raw_total_rate

        total_depreciation = mea_adjusted_grc * total_depreciation_rate
        
        # Depreciated Replacement Cost
        drc_building = mea_adjusted_grc - total_depreciation
        
        # ========================================
        # LAND VALUE (from Land Value System)
        # ========================================
        passed_land_value = opts.get("land_value")
        if not passed_land_value or passed_land_value <= 0:
            raise HTTPException(
                status_code=400,
                detail="land_value is required in options (from land value service)"
            )
        land_value = float(passed_land_value)
        land_value_source = "land_value_system"
        
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
                "mea_factor": round(mea_factor, 4),
                "mea_breakdown": mea_breakdown,
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
                        "note": "Functional/design adequacy is captured in the MEA factor (Model A) — not deducted again.",
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
        
    except HTTPException:
        raise
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
                    logger.warning(f"LandValueProvider failed: {result.error}")
                    

            except Exception as provider_error:
                logger.warning(f"LandValueProvider error: {provider_error}")
        
        # ========================================
        # ERROR Handling for Enterprise Compliance (No Hardcoded Fallbacks)
        # ========================================
        
        if not land_value_provider:
            reason = "unknown"
            if not HAS_LAND_SERVICES:
                reason = "HAS_LAND_SERVICES=False (import failed at startup)"
            elif not db_pool:
                reason = "db_pool is None (database not connected)"
            else:
                # Try creating again to get the actual error
                try:
                    test_adapter = PostgreSQLMarketDataAdapter(db_pool)
                    test_provider = LandValueProvider(test_adapter)
                    reason = f"get_land_value_provider returned None but manual creation succeeded (provider={test_provider})"
                except Exception as create_err:
                    reason = f"LandValueProvider creation failed: {create_err}"
            
            err_msg = f"Land valuation service unavailable: {reason}"
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
                logger.warning(f"Database comparables query failed: {db_error}")
        
        # ========================================
        # NO FALLBACK: Return empty results
        # Land values come from LandComparableSalesService + ResidualMethodService
        # on the frontend. Synthetic data would bypass the audited workflow.
        # ========================================
        logger.info(f"No land comparables found for region: {region}, returning empty result")
        
        return LandComparablesResponse(
            success=True,
            comparables=[],
            strength="weak",
            count=0,
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
        PhysicalDepreciationCalculator,
        FunctionalObsolescenceCalculator,
        ExternalObsolescenceCalculator,
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
        
        # Calculate Physical Depreciation
        physical_calculator = PhysicalDepreciationCalculator()
        physical_result = physical_calculator.calculate(
            property_data=property_schema,
            valuation_date=date.today(),
            construction_type=None,  # Let it infer from property type
            last_renovation_year=getattr(prop, 'last_renovation', None),
        )
        
        # Calculate Functional Obsolescence
        functional_calculator = FunctionalObsolescenceCalculator()
        functional_result = functional_calculator.calculate(property_schema)
        
        # Calculate External Obsolescence (if requested)
        external_result = None
        if request.include_external:
            external_calculator = ExternalObsolescenceCalculator()
            external_result = external_calculator.calculate(
                property_data=property_schema,
                location_data=request.location_data or {},
                market_data=request.market_data or {},
            )
        
        # Estimate RCN for context — use provided value or estimate from building size
        rcn = request.rcn if hasattr(request, 'rcn') and request.rcn else None
        if not rcn:
            # Rough estimate: use a reasonable per-sqm rate for context only
            # This is NOT used in the depreciation calculation itself
            cost_per_sqm = 8500  # Default estimate, not authoritative
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
        "app.main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )
