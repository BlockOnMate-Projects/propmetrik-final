"""
Residual Method — `/api/v1/methods/residual`.

Per-method module extracted from main.py (behaviour-preserving). Shared models/helpers are
imported from the dependency-free ._shared module; main includes this router and re-exports `calculate_residual_method` for the
multi-method dispatcher.
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ._shared import (
    ValuationMethodRequest,
    ValuationMethodResponse,
    _get_confidence_level,
    logger,
)

router = APIRouter()


@router.post("/api/v1/methods/residual", response_model=ValuationMethodResponse)
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
                # Indicated value of this method (= its estimated value) — uniform across all methods.
                "indicated_value": round(residual_land_value, 2),
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
