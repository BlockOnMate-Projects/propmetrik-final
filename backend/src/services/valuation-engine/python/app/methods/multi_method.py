"""
Multi-method orchestration & reconciliation endpoints.

`/api/v1/methods/calculate-all`, `/api/v1/reconciliation`, `/api/v1/sensitivity`,
`/api/v1/confidence`.

Per-method module extracted from main.py (behaviour-preserving). `calculate_all_methods` dispatches
to the six core method calculators, which are imported sibling-to-sibling from their own modules so
this module owns the dispatcher without depending on main. Shared models/helpers come from the
dependency-free ._shared module; main includes this router.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ._shared import (
    PropertyInput,
    ValuationMethodRequest,
    ValuationMethodResponse,
    _get_confidence_level,
    _normalize_property_type,
    logger,
)

# Sibling method calculators for the multi-method dispatcher.
# NOTE: sales_comparison is intentionally NOT dispatched here — it is RICS-only and requires a real
# comparables grid, which this generic (property-only) request cannot supply. Callers run sales
# comparison via the dedicated POST /api/v1/methods/sales-comparison endpoint instead.
from .cost import calculate_cost_approach
from .income import calculate_income_approach
from .residual import calculate_residual_method
from .profits import calculate_profits_method
from .drc import calculate_drc_method

router = APIRouter()


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


@router.post("/api/v1/methods/calculate-all", response_model=MultiMethodResponse)
async def calculate_all_methods(request: MultiMethodRequest):
    """
    Calculate multiple valuation methods

    Returns results from all requested methods with hybrid value calculation.
    """
    start_time = datetime.now()

    method_handlers = {
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


@router.post("/api/v1/reconciliation")
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


@router.post("/api/v1/sensitivity")
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


@router.post("/api/v1/confidence")
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
