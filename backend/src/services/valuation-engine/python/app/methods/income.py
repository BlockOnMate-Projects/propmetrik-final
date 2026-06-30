"""
Income Approach — `/api/v1/methods/income-approach`.

Per-method module extracted from main.py (behaviour-preserving). Shared models/helpers are
imported from the dependency-free ._shared module; main includes this router and re-exports `calculate_income_approach` for the
multi-method dispatcher.
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ._shared import (
    ValuationMethodRequest,
    ValuationMethodResponse,
    _get_confidence_level,
    _normalize_region,
    _normalize_property_type,
    logger,
)

router = APIRouter()


@router.post("/api/v1/methods/income-approach", response_model=ValuationMethodResponse)
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
                # Indicated value of this method (= its estimated value) — uniform across all methods.
                "indicated_value": round(direct_cap_value, 2),
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
