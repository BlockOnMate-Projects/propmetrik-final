"""
Sales Comparison Approach (RICS-compliant) — `/api/v1/methods/sales-comparison`.

The single sales-comparison methodology. Performs valuation using actual comparable properties
from the valuation basket per RICS Valuation Global Standards (a full adjustment grid with
comparability/quality scoring). There is NO simplified/legacy variant — sales comparison requires
real comparables; callers with no comparables must use a different method. Shared models/helpers
are imported from the dependency-free ._shared module; main includes this router.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ._shared import (
    PropertyInput,
    _get_confidence_level,
    logger,
)

router = APIRouter()


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
    # Market-derived location relativity supplied by the caller: median GHS/sqm of the
    # SUBJECT's district ÷ median GHS/sqm of THIS comp's district (recent sales, min
    # sample enforced caller-side). >1 means the subject sits in a pricier locality, so
    # the comp adjusts UP. RICS Comparable Evidence GN: adjustments must be derived from
    # market data, and distance alone cannot sign a location adjustment.
    district_price_relativity: Optional[float] = None

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
    method: str = "sales_comparison"
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


@router.post("/api/v1/methods/sales-comparison", response_model=RICSSalesComparisonResponse)
async def calculate_sales_comparison(request: RICSSalesComparisonRequest):
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

        # Market movement (%/yr) for the time adjustment — supplied by the caller from
        # the regional transaction record (12-month median GHS/sqm movement). The 9%/yr
        # Ghana residential default applies only when no index could be derived, and is
        # flagged in the methodology notes. Clamped ±30%/yr as a data-sanity guard.
        _opt_movement = (request.options or {}).get("annual_market_movement_pct")
        try:
            annual_market_movement = float(_opt_movement) if _opt_movement is not None else 9.0
        except (TypeError, ValueError):
            _opt_movement = None
            annual_market_movement = 9.0
        annual_market_movement = max(-30.0, min(30.0, annual_market_movement))
        movement_is_market_derived = _opt_movement is not None

        analyzed_comparables: List[ComparableAnalysis] = []
        adjustment_grid: Dict[str, Dict[str, float]] = {}
        staged: List[Dict[str, Any]] = []
        location_bases_used: set = set()

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

            # 6. LOCATION ADJUSTMENT — market-derived, per RICS Comparable Evidence GN.
            # Precedence:
            #   a) Same immediate locality (<=2 km): no adjustment — the comp shares the
            #      subject's micro-market.
            #   b) District price relativity (median GHS/sqm subject-district ÷ comp-district,
            #      computed by the caller from recent transactions): adjustment = the observed
            #      differential, capped ±20%. This is the market-derived route.
            #   c) Fallback heuristic (premium-area list) ONLY when no market data exists —
            #      flagged in the notes so the valuer knows it is not evidence-based.
            location_adj = 0.0
            location_basis = "none"
            rel = comp.district_price_relativity
            if comp.distance_km is not None and comp.distance_km <= 2.0:
                location_adj = 0.0
                location_basis = "same_locality"
            elif rel is not None and 0.5 <= rel <= 2.0:
                location_adj = max(-20.0, min(20.0, (rel - 1.0) * 100.0))
                location_basis = "district_price_relativity"
            elif comp.address_district and hasattr(prop, 'address_city'):
                # Last-resort heuristic — insufficient transaction data for relativity.
                premium_areas = ["east legon", "cantonments", "airport residential", "ridge", "labone"]
                comp_district = (comp.address_district or "").lower()
                subject_city = (prop.address_city or "").lower()
                comp_premium = any(area in comp_district for area in premium_areas)
                subject_premium = any(area in subject_city for area in premium_areas)
                if subject_premium and not comp_premium:
                    location_adj = 15.0
                    location_basis = "heuristic_premium_area"
                elif not subject_premium and comp_premium:
                    location_adj = -15.0
                    location_basis = "heuristic_premium_area"
            adjustments["location"] = round(location_adj, 1)

            # 7. TIME ADJUSTMENT (market movement since the comparable's transaction/listing
            # date). RICS Comparable Evidence GN: derive from an observed market index. The
            # caller passes options.annual_market_movement_pct computed from the regional
            # transaction record (12-month median GHS/sqm movement); the historical Ghana
            # residential default (9%/yr) applies only when no index can be derived. A
            # falling market therefore produces a NEGATIVE time adjustment. Capped ±15%.
            months_since = 0.0
            try:
                raw_date = getattr(comp, "transaction_date", None)
                if raw_date:
                    comp_date = datetime.fromisoformat(str(raw_date).replace("Z", "").split("T")[0])
                    months_since = max(0.0, (datetime.now() - comp_date).days / 30.0)
            except Exception:
                months_since = 0.0
            time_adj = max(-15.0, min(15.0, months_since * (annual_market_movement / 12.0)))
            adjustments["time"] = round(time_adj, 1)

            # CALCULATE TOTAL ADJUSTMENT
            total_adj_pct = sum(adjustments.values()) / 100

            # Apply adjustment to total price
            adjusted_price = price_ghs * (1 + total_adj_pct)

            # Gross adjustment (sum of ABSOLUTE adjustments) — the RICS/appraisal measure
            # of how much massaging the comparable needed. Drives auto-weighting below.
            gross_adjustment = sum(abs(v) for v in adjustments.values()) / 100.0

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

            location_bases_used.add(location_basis)
            staged.append({
                "comp": comp,
                "price_ghs": price_ghs,
                "adjusted_price": adjusted_price,
                "adjustments": adjustments,
                "total_adj_pct": total_adj_pct,
                "gross_adjustment": gross_adjustment,
                "months_since": months_since,
                "conf_contribution": conf_contribution,
                "adj_per_sqm": adj_per_sqm,
                "quality_score": quality_score,
            })

        # ================================================================
        # WEIGHTING — RICS Comparable Evidence GN: "most weight should be attached to
        # the evidence requiring least adjustment", tempered by the hierarchy of
        # evidence (Category A direct transactions over asking prices) and recency.
        # Auto-weighting applies UNLESS the valuer supplied differentiated weights —
        # explicit professional judgment is always honored.
        # ================================================================
        provided_weights = [s["comp"].weight if s["comp"].weight is not None else 1.0 for s in staged]
        valuer_weighted = len(set(round(w, 4) for w in provided_weights)) > 1 and sum(provided_weights) > 0

        # Hierarchy of evidence (RICS Comparable Evidence GN, category A > B):
        # completed/verified transactions best; inferred sales next; offers made are
        # firmer evidence than asking prices.
        EVIDENCE_RELIABILITY = {
            "verified_sale": 1.0,
            "sale": 1.0,
            "transaction": 1.0,
            "contributed": 0.95,
            "delisted_inferred": 0.9,
            "offer": 0.85,
            "listing": 0.75,
        }

        raw_weights: List[float] = []
        for i, s in enumerate(staged):
            if valuer_weighted:
                raw_weights.append(max(0.0, provided_weights[i]))
            else:
                comparability = 1.0 / (1.0 + s["gross_adjustment"])  # least adjustment, most weight
                reliability = EVIDENCE_RELIABILITY.get((s["comp"].evidence_type or "listing").lower(), 0.8)
                time_reliability = 1.0 / (1.0 + s["months_since"] / 12.0)  # recency of evidence
                raw_weights.append(comparability * reliability * time_reliability)

        weight_sum = sum(raw_weights) or 1.0
        norm_weights = [w / weight_sum for w in raw_weights]

        total_weighted_value = 0.0
        for s, weight in zip(staged, norm_weights):
            comp = s["comp"]
            adjusted_price = s["adjusted_price"]
            adjustment_grid[comp.id] = {
                "original_price_ghs": round(s["price_ghs"], 2),
                **{k: v for k, v in s["adjustments"].items()},
                "gross_adjustment": round(s["gross_adjustment"] * 100, 1),
                "total_adjustment": round(s["total_adj_pct"] * 100, 1),
                "adjusted_price_ghs": round(adjusted_price, 2),
                "weight": round(weight, 4),
            }
            analyzed_comparables.append(ComparableAnalysis(
                id=comp.id,
                original_price_ghs=round(s["price_ghs"], 2),
                adjusted_price_ghs=round(adjusted_price, 2),
                adjustments_applied=s["adjustments"],
                total_adjustment_percent=round(s["total_adj_pct"] * 100, 1),
                weight=round(weight, 4),
                weighted_value=round(adjusted_price * weight, 2),
                confidence_contribution=s["conf_contribution"],
                adjusted_price_per_sqm=s["adj_per_sqm"],
                quality_score=s["quality_score"],
            ))
            total_weighted_value += adjusted_price * weight

        # Weights are normalized to sum 1, so the weighted value IS the estimate.
        estimated_value = total_weighted_value if total_weighted_value > 0 else (
            sum(c.adjusted_price_ghs for c in analyzed_comparables) / len(analyzed_comparables)
        )

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
            method="sales_comparison",
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
                "RICS Valuation Global Standards (Red Book) / IVS 105 Market Approach; RICS 'Comparable Evidence in Real Estate Valuation' guidance applied",
                "Adjustments calculated on total price, not per-unit basis",
                "Size adjustments capped at ±25% per RICS guidelines",
                (f"Time adjustment from market-derived regional index: {annual_market_movement:+.1f}%/yr"
                 if movement_is_market_derived
                 else f"Time adjustment used DEFAULT {annual_market_movement:+.1f}%/yr — no regional index could be derived from the transaction record"),
                ("Location adjustments market-derived from district price relativity (median GHS/sqm)"
                 if "district_price_relativity" in location_bases_used
                 else "Location adjustments: no district price relativity available"
                 ) + (" — heuristic premium-area fallback used for some comparables" if "heuristic_premium_area" in location_bases_used else ""),
                ("Weights supplied by the valuer (professional judgment honored)"
                 if valuer_weighted
                 else "Auto-weighted per RICS: most weight to least-adjusted evidence × evidence hierarchy (transactions over asking prices) × recency"),
                f"USD to GHS exchange rate: {usd_rate}",
                f"Total comparables analyzed: {len(comparables)}",
            ],
            details={
                # Indicated value of this method (= its estimated value). Uniform field exposed by
                # every methodology so reconciliation / sensitivity / reports read one consistent key.
                "indicated_value": round(estimated_value, 2),
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
