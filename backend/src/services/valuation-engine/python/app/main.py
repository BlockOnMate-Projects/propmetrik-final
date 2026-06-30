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

# Shared request/response models + helpers live in app/methods/_shared.py (dependency-free).
# main and every method module import from there — one-way dependency, no cycles.
from .methods._shared import (
    PropertyInput,
    ValuationMethodRequest,
    ValuationMethodResponse,
    _get_confidence_level,
    _normalize_region,
    _normalize_property_type,
)

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

# PropertyInput moved to app/methods/_shared.py (imported above).


# ComparableInput / RICSSalesComparisonRequest / ComparableAnalysis / RICSSalesComparisonResponse moved to app/methods/sales_comparison.py


# ValuationMethodRequest / ValuationMethodResponse moved to app/methods/_shared.py (imported above).


# MultiMethodRequest / MultiMethodResponse / SensitivityRequest / ReconciliationRequest / ConfidenceRequest moved to app/methods/multi_method.py


# MarketConditionsRequest moved to app/methods/market_conditions.py


# Land value models moved to app/methods/land_value.py.


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

# Sales comparison (the single RICS-compliant methodology) lives in app/methods/sales_comparison.py
# (router included at the bottom). The former simplified/legacy passthrough endpoint was removed.


# calculate_cost_approach moved to app/methods/cost.py (router included at the bottom).


# RentAdjustmentFactor / RentSubjectInput / RentComparableInput / MarketRentRequest / RentComparableAnalysis / MarketRentResponse / calculate_market_rent moved to app/methods/market_rent.py (router included at the bottom).


# calculate_income_approach moved to app/methods/income.py (router included at the bottom).


# calculate_residual_method moved to app/methods/residual.py (router included at the bottom).


# calculate_profits_method moved to app/methods/profits.py (router included at the bottom).


# calculate_drc_method moved to app/methods/drc.py (router included at the bottom).


# Land-value endpoints (calculate_land_value / get_land_comparables) moved to app/methods/land_value.py (router included at the bottom, try-wrapped).


# calculate_all_methods moved to app/methods/multi_method.py (router included at the bottom).


# ============================================================================
# SUPPORTING SERVICE ENDPOINTS
# ============================================================================

# reconcile_values / run_sensitivity_analysis / calculate_confidence moved to app/methods/multi_method.py (router included at the bottom).


# get_market_conditions moved to app/methods/market_conditions.py (router included at the bottom).


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

# _normalize_region / _normalize_property_type / _get_confidence_level moved to app/methods/_shared.py (imported above).


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


# _calculate_hybrid_value moved to app/methods/multi_method.py


# ============================================================================
# DEPRECIATION API ENDPOINTS (D8) moved to app/methods/depreciation.py (router included at the bottom).
# Models DepreciationCalculateRequest / DepreciationOverrideRequest / DepreciationOverrideApprovalRequest /
# DepreciationComponentResult / DepreciationCalculateResponse / DepreciationOverrideResponse and the four
# /api/v1/depreciation/* endpoints all moved there.
# ============================================================================


# ============================================================================
# PER-METHOD MODULE ROUTERS
# Extracted method endpoints live in app/methods/<method>.py (behaviour-preserving).
# Imported here at the BOTTOM purely to register each module's router on the app. Each module
# imports shared models/helpers from app/methods/_shared.py — never from this module — so the
# dependency direction stays one-way (main → methods → _shared). The multi-method dispatcher lives
# in app/methods/multi_method.py and imports the six core `calculate_*` functions sibling-to-sibling,
# so main no longer re-exports anything.
# ============================================================================
from .methods.sales_comparison import router as _sales_comparison_router  # noqa: E402
app.include_router(_sales_comparison_router)

from .methods.drc import router as _drc_router  # noqa: E402
app.include_router(_drc_router)

from .methods.profits import router as _profits_router  # noqa: E402
app.include_router(_profits_router)

from .methods.residual import router as _residual_router  # noqa: E402
app.include_router(_residual_router)

from .methods.cost import router as _cost_router  # noqa: E402
app.include_router(_cost_router)

from .methods.income import router as _income_router  # noqa: E402
app.include_router(_income_router)

from .methods.market_rent import router as _market_rent_router  # noqa: E402
app.include_router(_market_rent_router)

from .methods.market_conditions import router as _market_conditions_router  # noqa: E402
app.include_router(_market_conditions_router)

from .methods.depreciation import router as _depreciation_router  # noqa: E402
app.include_router(_depreciation_router)

from .methods.multi_method import router as _multi_method_router  # noqa: E402
app.include_router(_multi_method_router)

# Land-value endpoints live in app/methods/land_value.py. They reach the runtime db_pool/provider
# (which stay in this module) via the get_db_pool()/get_land_value_provider() accessors at request
# time. Try-wrapped so a land-service import problem degrades gracefully (endpoints absent) instead
# of crashing the whole engine — mirroring the original HAS_LAND_SERVICES try/except.
try:
    from .methods.land_value import router as _land_value_router  # noqa: E402
    app.include_router(_land_value_router)
except Exception as _land_router_err:  # pragma: no cover
    logger.error(f"Land-value endpoints NOT registered (land service import failed): {_land_router_err}")


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
