"""
Profits Method — `/api/v1/methods/profits`.

Per-method module extracted from main.py (behaviour-preserving). Shared models/helpers are
imported from the dependency-free ._shared module; main includes this router and re-exports `calculate_profits_method` for the
multi-method dispatcher.
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ._shared import (
    ValuationMethodRequest,
    ValuationMethodResponse,
    _get_confidence_level,
    _normalize_region,
    logger,
)

router = APIRouter()


@router.post("/api/v1/methods/profits", response_model=ValuationMethodResponse)
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

        # Indicated value of this method (= its estimated value) — uniform across all methods.
        details["indicated_value"] = round(value, 2)
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
