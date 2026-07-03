"""
Cost Approach — `/api/v1/methods/cost-approach`.

Per-method module extracted from main.py (behaviour-preserving). Shared models/helpers are
imported from the dependency-free ._shared module; main includes this router and re-exports `calculate_cost_approach` for the
multi-method dispatcher.
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ._shared import (
    ValuationMethodRequest,
    ValuationMethodResponse,
    _get_confidence_level,
    _to_float,
    logger,
)

router = APIRouter()


@router.post("/api/v1/methods/cost-approach", response_model=ValuationMethodResponse)
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

        # Use user-provided construction cost per sqm (from Data Hub) — required.
        # `options` is Dict[str, Any] (no pydantic coercion), so numerics MUST be
        # coerced: a Postgres NUMERIC rate can arrive as the string "8708".
        cost_per_sqm = _to_float(opts.get("construction_cost_per_sqm"), 0)
        if cost_per_sqm <= 0:
            raise HTTPException(
                status_code=400,
                detail="construction_cost_per_sqm is required in options (from Data Hub market rates)"
            )

        # Use user-provided land value per sqm (from comparable land sales)
        # Defaults to 0 if not yet available (frontend calculates indicatedValue independently)
        land_value_per_sqm = _to_float(opts.get("land_value_per_sqm"), 0)

        # ---- Reproduction Cost New (full RICS/GhIS cost approach) ----
        # Hard costs: component breakdown if supplied, else market rate × building area.
        hard_costs = _to_float(opts.get("hard_costs"), 0) or (building_sqm * cost_per_sqm)

        # Soft costs (% of hard), siteworks (absolute), entrepreneurial profit (% of construction cost).
        soft_costs_pct = _to_float(opts.get("soft_costs_percent"), 10) / 100.0
        siteworks = _to_float(opts.get("siteworks"), 0)
        profit_pct = _to_float(opts.get("entrepreneurial_profit_percent"), 15) / 100.0

        soft_costs = hard_costs * soft_costs_pct
        total_construction_cost = hard_costs + soft_costs + siteworks
        entrepreneurial_profit = total_construction_cost * profit_pct
        reproduction_cost_new = total_construction_cost + entrepreneurial_profit

        # Land value from provided per-sqm rate
        land_value = land_sqm * land_value_per_sqm

        # Depreciation from the depreciation service. Inputs are PERCENTAGES (e.g. 1.8),
        # kept to full precision (no rounding). Applied to the FULL reproduction cost new —
        # hard costs, soft costs and profit all depreciate, not just hard costs.
        depreciation_overrides = opts.get("depreciation_overrides", {}) or {}
        physical_dep = _to_float(depreciation_overrides.get("physical"), 0) / 100.0
        functional_dep = _to_float(depreciation_overrides.get("functional"), 0) / 100.0
        external_dep = _to_float(depreciation_overrides.get("external"), 0) / 100.0
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
