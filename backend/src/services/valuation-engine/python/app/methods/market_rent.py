"""
Market Rent (rental comparison) — `/api/v1/methods/market-rent`.

Single source of truth for rent estimation. Per-method module extracted from main.py
(behaviour-preserving). Adjustment factors are SUPPLIED by the caller (from
valuation_adjustment_factors), never hardcoded here. Rents arrive already in GHS (the Node route
converts once). Shared helpers are imported from the dependency-free ._shared module; main includes
this router.
"""
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ._shared import (
    _get_confidence_level,
    logger,
)

router = APIRouter()


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


@router.post("/api/v1/methods/market-rent", response_model=MarketRentResponse)
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
