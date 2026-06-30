"""
Sales Comparison Approach (legacy / simple) — `/api/v1/methods/sales-comparison`.

Per-method module extracted from main.py (behaviour-preserving). Shared models/helpers are
imported from main; main includes this router and re-exports `calculate_sales_comparison` for the
multi-method dispatcher.
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ..main import (
    ValuationMethodRequest,
    ValuationMethodResponse,
    _get_confidence_level,
    logger,
)

router = APIRouter()


@router.post("/api/v1/methods/sales-comparison", response_model=ValuationMethodResponse)
async def calculate_sales_comparison(request: ValuationMethodRequest):
    """
    Sales Comparison Approach (Legacy/Simple)

    Simple sales comparison using user-provided comparable data.
    For RICS-compliant analysis, use /methods/sales-comparison-rics instead.

    Accepts options:
        - indicated_value: pre-calculated value from comparable basket
        - price_per_sqm: market-derived price per sqm
        - comparables_count: number of comparables used
        - adjustments: adjustment details from the basket analysis
    """
    start_time = datetime.now()
    prop = request.property
    opts = request.options or {}

    try:
        building_sqm = prop.building_size_sqm or 150
        land_sqm = prop.land_area_sqm or 300

        # Use user-provided indicated value if available (from comparable basket)
        indicated_value = opts.get("indicated_value")
        price_per_sqm = opts.get("price_per_sqm")
        comparables_count = opts.get("comparables_count", 0)

        if indicated_value and indicated_value > 0:
            adjusted_value = indicated_value
        elif price_per_sqm and price_per_sqm > 0:
            adjusted_value = building_sqm * price_per_sqm
        else:
            raise HTTPException(
                status_code=400,
                detail="Either indicated_value or price_per_sqm is required in options (from comparable basket analysis)"
            )

        # Apply any user-specified adjustments
        adjustments = opts.get("adjustments", {})
        total_multiplier = adjustments.get("total_multiplier", 1.0)
        adjusted_value = adjusted_value * total_multiplier

        # Confidence based on data quality
        confidence = 0.60  # Base
        if comparables_count >= 5:
            confidence += 0.20
        elif comparables_count >= 3:
            confidence += 0.15
        elif comparables_count >= 1:
            confidence += 0.05
        if prop.bedrooms and prop.bathrooms and prop.year_built:
            confidence += 0.05
        confidence = min(confidence, 0.95)

        calc_time = (datetime.now() - start_time).total_seconds() * 1000

        data_source = "comparable_basket" if indicated_value else "market_price_per_sqm"

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
                "indicated_value": round(adjusted_value, 2),
                "price_per_sqm": price_per_sqm or (round(adjusted_value / building_sqm, 2) if building_sqm > 0 else 0),
                "adjustments": adjustments,
                "comparables_analyzed": comparables_count,
                "data_source": data_source,
            },
            assumptions=[
                f"Analysis based on {comparables_count} comparable properties" if comparables_count > 0 else "Value derived from market price per sqm",
                "Property condition is as stated",
                "No hidden defects or legal encumbrances",
            ],
            limitations=[
                "Limited comparable data in some regions" if comparables_count < 3 else "Adequate comparable data available",
                "Values may not reflect recent market changes",
                "Subject to property inspection verification",
            ],
            calculation_time_ms=calc_time
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sales comparison failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
