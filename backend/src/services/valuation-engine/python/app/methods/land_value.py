"""
Land Value endpoints — `/api/v1/methods/land-value` and `/api/v1/methods/land-value/comparables`.

Extracted from main.py. The land valuation SERVICE classes live in app/services/
(land_value_provider → residual_method + land_comparable_sales); these are the thin HTTP endpoints.

Runtime infrastructure (the asyncpg pool + provider factory + the startup import flag) stays in
main.py — db_pool/lifespan belong there. This module reaches it through main's accessor FUNCTIONS,
which are called at REQUEST time so they read the live pool (not an import-time snapshot):
`get_db_pool()` and `get_land_value_provider()`. `HAS_LAND_SERVICES` is set once at startup, so the
imported value is stable.
"""
from datetime import datetime, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ._shared import PropertyInput, _normalize_region, logger
from ..main import get_db_pool, get_land_value_provider, HAS_LAND_SERVICES
from ..adapters.data_hub_adapter import PostgreSQLMarketDataAdapter
from ..services.land_value_provider import LandValueProvider
from ..schemas import (
    Property,
    PropertyLocation,
    PropertySpecifications,
    PropertyDataQuality,
    GhanaRegion,
    PropertyType,
)

router = APIRouter()


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
# LAND VALUE ENDPOINTS (2-Method Reconciliation: Residual + Comparable)
# ============================================================================

@router.post("/api/v1/methods/land-value", response_model=LandValueResponse)
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
            elif not await get_db_pool():
                reason = "db_pool is None (database not connected)"
            else:
                # Try creating again to get the actual error
                try:
                    test_adapter = PostgreSQLMarketDataAdapter(await get_db_pool())
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


@router.post("/api/v1/methods/land-value/comparables", response_model=LandComparablesResponse)
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
        pool = await get_db_pool()
        if pool and HAS_LAND_SERVICES:
            try:
                adapter = PostgreSQLMarketDataAdapter(pool)

                # Import search criteria
                from ..schemas.land_comparable import LandComparableSearchCriteria

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
