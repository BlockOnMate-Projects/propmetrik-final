"""
Depreciated Replacement Cost (DRC) Method — `/api/v1/methods/drc`.

Per-method module extracted from main.py (behaviour-preserving). Shared models/helpers are
imported from the dependency-free ._shared module; main includes this router and re-exports `calculate_drc_method` for the
multi-method dispatcher. The `_drc_feature_mea` helper moved here verbatim from main.py.
"""
from datetime import datetime, date

from fastapi import APIRouter, HTTPException

from ._shared import (
    ValuationMethodRequest,
    ValuationMethodResponse,
    _get_confidence_level,
    _normalize_region,
    logger,
)

router = APIRouter()


def _drc_feature_mea(baseline: float, feature_range: float, features: dict) -> dict:
    """
    Feature-driven Modern Equivalent Asset (MEA) factor for DRC — RICS "Model A" single-obsolescence
    path. The class baseline (from the Data Hub) is the anchor for an *average* asset of the class;
    the building's OWN features modulate it within +/- feature_range to reflect its functional/design
    adequacy relative to a modern equivalent (design era, specification appropriateness, services,
    configuration). Because functional/design adequacy is captured HERE, functional obsolescence is
    NOT deducted again downstream (no double counting).

    Each dimension is a 1-5 adequacy score (3 = neutral / at baseline, 5 = matches a modern
    equivalent, 1 = highly divergent). MISSING data scores a neutral 3 and is noted — never a silent
    skew. Final MEA = clamp(baseline * (1 + ((wavg-3)/2) * feature_range), 0.5, 1.0).
    """
    dims = []

    # 1. Design era — older designs diverge further from a modern equivalent.
    age = features.get("age_years")
    if age is None:
        dims.append(("design_era", 3.0, 0.35, "design era: unknown (neutral)"))
    else:
        era = (5.0 if age <= 5 else 4.5 if age <= 15 else 3.5 if age <= 30
               else 2.5 if age <= 50 else 1.5)
        dims.append(("design_era", era, 0.35, f"design era: ~{int(age)}y old"))

    # 2. Specification appropriateness — deviation from the function-appropriate ('standard')
    #    specification reduces the match (super-adequacy/over-build is optimised out of the MEA).
    q = str(features.get("quality_rating") or "").strip().lower()
    spec_map = {"standard": 5.0, "basic": 4.0, "high": 3.5, "premium": 3.5,
                "luxury": 2.5, "substandard": 2.5}
    if q in spec_map:
        dims.append(("specification", spec_map[q], 0.30, f"specification: {q}"))
    else:
        dims.append(("specification", 3.0, 0.30, "specification: unknown (neutral)"))

    # 3. Services adequacy — fraction of the modern-equivalent service set present.
    svc = features.get("services") or {}
    expected = ["generator", "security", "water", "drainage"]
    if isinstance(svc, dict) and (svc.get("elevator") is not None or features.get("floors", 0) and features.get("floors", 0) > 2):
        expected.append("elevator")
    present = sum(1 for k in expected if bool(svc.get(k)))
    if isinstance(svc, dict) and len(svc) > 0:
        frac = present / max(1, len(expected))
        dims.append(("services", 1.0 + frac * 4.0, 0.20, f"services: {present}/{len(expected)} modern services present"))
    else:
        dims.append(("services", 3.0, 0.20, "services: not assessed (neutral)"))

    # 4. Configuration / storey efficiency — taller specialised buildings diverge mildly.
    floors = features.get("floors")
    if not floors or floors <= 0:
        dims.append(("configuration", 3.0, 0.15, "configuration: unknown (neutral)"))
    else:
        cfg = (5.0 if floors <= 2 else 4.0 if floors <= 4 else 3.5 if floors <= 6 else 3.0)
        dims.append(("configuration", cfg, 0.15, f"configuration: {int(floors)} floor(s)"))

    wsum = sum(w for _, _, w, _ in dims) or 1.0
    adequacy = sum(s * w for _, s, w, _ in dims) / wsum          # 1..5
    normalized = (adequacy - 3.0) / 2.0                          # -1..+1
    mea = baseline * (1.0 + normalized * (feature_range or 0.0))
    mea = max(0.5, min(1.0, mea))
    return {
        "source": "feature_model",
        "mea_factor": round(mea, 4),
        "baseline": round(baseline, 4),
        "feature_range": round(feature_range or 0.0, 3),
        "adequacy_score": round(adequacy, 2),
        "dimensions": [
            {"key": k, "score": round(s, 2), "weight": w, "note": n}
            for k, s, w, n in dims
        ],
    }


@router.post("/api/v1/methods/drc", response_model=ValuationMethodResponse)
async def calculate_drc_method(request: ValuationMethodRequest):
    """
    Depreciated Replacement Cost (DRC) Method

    Values specialized properties with no market (schools, hospitals, religious).
    Based on cost to reproduce with appropriate depreciation.

    Uses integrated depreciation services:
    - PhysicalDepreciationCalculator: Modified Age-Life with condition adjustment
    - FunctionalObsolescenceCalculator: Auto-detection from property specs
    - ExternalObsolescenceCalculator: Environmental/locational factors
    - DepreciationReconciliationService: Age-based caps and validation
    """
    from ..services import (
        PhysicalDepreciationCalculator,
        FunctionalObsolescenceCalculator,
        ExternalObsolescenceCalculator,
        DepreciationReconciliationService,
        ConstructionType,
    )
    from ..schemas.property import (
        Property,
        PropertyType,
        PropertyCondition,
        PropertyLocation,
        PropertySpecifications,
        PropertyDataQuality,
        GhanaRegion,
    )

    start_time = datetime.now()
    prop = request.property
    opts = request.options or {}

    try:
        region = _normalize_region(prop.region)

        # All value-affecting inputs are REQUIRED — no hardcoded fallbacks. The Node DRC route
        # (/valuations/:id/drc/value) resolves them from the Data Hub config / property / valuer
        # overrides and strict-fails before calling here; we re-validate as defence in depth.
        building_sqm = prop.building_size_sqm
        if not building_sqm or building_sqm <= 0:
            raise HTTPException(status_code=400, detail="building_size_sqm (GFA) is required for DRC")

        year_built = prop.year_built
        if not year_built or year_built <= 0:
            raise HTTPException(status_code=400, detail="year_built is required for DRC depreciation")

        land_sqm = prop.land_area_sqm  # informational only; may be None

        replacement_cost_per_sqm = opts.get("replacement_cost_per_sqm")
        if not replacement_cost_per_sqm or replacement_cost_per_sqm <= 0:
            raise HTTPException(
                status_code=400,
                detail="replacement_cost_per_sqm is required in options (from Data Hub specialized cost rates)"
            )

        # Gross Replacement Cost (GRC)
        grc = building_sqm * replacement_cost_per_sqm

        # MEA Factor (Modern Equivalent Asset). The Data Hub supplies the per-class BASELINE (anchor);
        # the building's own features modulate it (feature-driven, RICS Model A — see _drc_feature_mea).
        # A valuer may instead post an explicit final MEA override. No default — baseline is required.
        mea_baseline = opts.get("mea_factor")
        if not mea_baseline or mea_baseline <= 0:
            raise HTTPException(status_code=400, detail="mea_factor (baseline) is required in options (from Data Hub config)")
        mea_override = opts.get("mea_factor_override")
        if mea_override and float(mea_override) > 0:
            mea_factor = float(mea_override)
            mea_breakdown = {"source": "valuer_override", "mea_factor": round(mea_factor, 4),
                             "baseline": round(float(mea_baseline), 4)}
        else:
            mea_breakdown = _drc_feature_mea(float(mea_baseline),
                                             float(opts.get("mea_feature_range") or 0.0),
                                             opts.get("features") or {})
            mea_factor = mea_breakdown["mea_factor"]
        mea_adjusted_grc = grc * mea_factor

        # Economic (useful) life — required from Data Hub config, no default.
        useful_life = opts.get("useful_life")
        if not useful_life or useful_life <= 0:
            raise HTTPException(status_code=400, detail="useful_life is required in options (from Data Hub config)")

        # ========================================
        # DEPRECIATION CALCULATION (Using Services)
        # ========================================

        # Map condition string to enum
        condition_map = {
            "new": PropertyCondition.EXCELLENT,
            "excellent": PropertyCondition.EXCELLENT,
            "good": PropertyCondition.GOOD,
            "fair": PropertyCondition.FAIR,
            "average": PropertyCondition.FAIR,
            "poor": PropertyCondition.POOR,
            "very_poor": PropertyCondition.RENOVATION_NEEDED,  # Map to RENOVATION_NEEDED
        }
        condition_str = (prop.condition or "").strip().lower()
        if not condition_str:
            raise HTTPException(status_code=400, detail="condition is required for DRC depreciation assessment")
        condition_enum = condition_map.get(condition_str, PropertyCondition.GOOD)

        # Map region to GhanaRegion enum (use available values)
        region_map = {
            "greater_accra": GhanaRegion.GREATER_ACCRA,
            "ashanti": GhanaRegion.KUMASI_METRO,  # Ashanti -> Kumasi Metro
            "kumasi": GhanaRegion.KUMASI_METRO,
            "western": GhanaRegion.WESTERN_CLUSTER,
            "eastern": GhanaRegion.EASTERN,
            "central": GhanaRegion.WESTERN_CLUSTER,  # Map to cluster
            "volta": GhanaRegion.EASTERN,  # Map to Eastern cluster
            "northern": GhanaRegion.NORTHERN_CLUSTER,
            "upper_east": GhanaRegion.NORTHERN_CLUSTER,
            "upper_west": GhanaRegion.NORTHERN_CLUSTER,
            "bono": GhanaRegion.KUMASI_METRO,  # Map to Kumasi cluster
        }
        region_enum = region_map.get(region, GhanaRegion.GREATER_ACCRA)

        # Create Property schema for depreciation calculators
        # Map asset type to PropertyType
        asset_type_to_property_type = {
            "institutional": PropertyType.INSTITUTIONAL_SCHOOL,
            "government": PropertyType.COMMERCIAL_OFFICE,
            "religious": PropertyType.INSTITUTIONAL_RELIGIOUS,
            "church": PropertyType.INSTITUTIONAL_RELIGIOUS,
            "mosque": PropertyType.INSTITUTIONAL_RELIGIOUS,
            "hospital": PropertyType.INSTITUTIONAL_HOSPITAL,
            "school": PropertyType.INSTITUTIONAL_SCHOOL,
            "community_center": PropertyType.OTHER,
            "library": PropertyType.OTHER,
            "museum": PropertyType.OTHER,
            "heritage": PropertyType.OTHER,
            "utility": PropertyType.INDUSTRIAL_FACTORY,
            "stadium": PropertyType.OTHER,
        }
        property_type_enum = asset_type_to_property_type.get(
            prop.property_type, PropertyType.OTHER
        )

        property_schema = Property(
            id=prop.id or "temp-drc",
            property_type=property_type_enum,
            location=PropertyLocation(
                region=region_enum,
                district=getattr(prop, 'address_city', None) or "Accra Metro",  # district field
                neighborhood=getattr(prop, 'address_street', None),  # neighborhood field
                address_raw=getattr(prop, 'address_street', None) or "No address provided",  # address_raw field
                address_city=getattr(prop, 'address_city', None) or "Accra",  # address_city field
            ),
            specifications=PropertySpecifications(
                built_area_sqm=building_sqm if building_sqm > 0 else None,
                land_size_sqm=land_sqm if (land_sqm and land_sqm > 0) else None,
                year_built=year_built if year_built else None,
                bedrooms=getattr(prop, 'bedrooms', None),
                bathrooms=getattr(prop, 'bathrooms', None),
                condition=condition_enum,  # Add condition for depreciation calculator
            ),
            data_quality=PropertyDataQuality(
                data_quality_score=0.8,
                source_reliability_score=0.8,
                completeness_score=0.7,
                accuracy_score=0.8,
                freshness_score=0.9,
                sources=["user_input"],
            ),
        )

        # Infer construction type based on region/property type
        construction_type = ConstructionType.SANDCRETE_BLOCK  # Default for Ghana
        if region in ["greater_accra", "ashanti"]:
            construction_type = ConstructionType.CONCRETE_BLOCK

        # Check for depreciation overrides from frontend
        depreciation_overrides = opts.get("depreciation_overrides", {})
        physical_override = depreciation_overrides.get("physical")
        functional_override = depreciation_overrides.get("functional")
        external_override = depreciation_overrides.get("external")

        # 1. PHYSICAL DEPRECIATION
        physical_calculator = PhysicalDepreciationCalculator()
        physical_result = physical_calculator.calculate(
            property_data=property_schema,
            valuation_date=date.today(),
            construction_type=construction_type,
        )

        # Use override if provided, otherwise use calculated
        if physical_override is not None and physical_override >= 0:
            physical_rate = float(physical_override)
            physical_source = "user_override"
        else:
            # For DRC, adjust physical depreciation to use asset-specific useful life
            effective_age = physical_result.effective_age
            physical_rate = min(effective_age / useful_life, 0.95)
            physical_source = "calculated"

        physical_depreciation = mea_adjusted_grc * physical_rate

        # 2. FUNCTIONAL OBSOLESCENCE — under the DRC single-obsolescence path (Model A), functional /
        #    design adequacy is captured ENTIRELY by the feature-driven MEA factor above, so it is NOT
        #    deducted again here (RICS: avoid double counting). Reported as 0, source 'captured_in_mea'.
        functional_rate = 0.0
        functional_source = "captured_in_mea"
        functional_obsolescence = 0.0

        # 3. EXTERNAL OBSOLESCENCE
        external_calculator = ExternalObsolescenceCalculator()
        external_result = external_calculator.calculate(
            property_data=property_schema,
            location_data={},
            market_data={},
        )

        if external_override is not None and external_override >= 0:
            external_rate = float(external_override)
            external_source = "user_override"
        else:
            external_rate = external_result.depreciation_rate
            external_source = "calculated"

        external_obsolescence = mea_adjusted_grc * external_rate

        # 4. TOTAL DEPRECIATION = physical + external (functional folded into MEA), age-capped.
        property_age = datetime.now().year - year_built
        max_rates = {
            (0, 5): 0.15, (5, 15): 0.35, (15, 30): 0.55,
            (30, 50): 0.75, (50, 999): 0.90
        }
        max_rate = 0.90
        for (min_age, max_age), cap in max_rates.items():
            if min_age <= property_age < max_age:
                max_rate = cap
                break

        raw_total_rate = physical_rate + external_rate
        total_depreciation_rate = min(raw_total_rate, max_rate)
        was_capped = total_depreciation_rate < raw_total_rate

        total_depreciation = mea_adjusted_grc * total_depreciation_rate

        # Depreciated Replacement Cost
        drc_building = mea_adjusted_grc - total_depreciation

        # ========================================
        # LAND VALUE (from Land Value System)
        # ========================================
        passed_land_value = opts.get("land_value")
        if not passed_land_value or passed_land_value <= 0:
            raise HTTPException(
                status_code=400,
                detail="land_value is required in options (from land value service)"
            )
        land_value = float(passed_land_value)
        land_value_source = "land_value_system"

        # Total DRC Value
        total_drc = drc_building + land_value

        # Confidence based on data quality
        confidence = 0.62 if physical_source == "calculated" else 0.55
        if was_capped:
            confidence -= 0.05

        calc_time = (datetime.now() - start_time).total_seconds() * 1000

        return ValuationMethodResponse(
            success=True,
            method="drc_method",
            estimated_value=round(total_drc, 2),
            confidence_score=confidence,
            confidence_level=_get_confidence_level(confidence),
            value_range={
                "low": round(total_drc * 0.85, 2),
                "high": round(total_drc * 1.15, 2),
            },
            details={
                # Indicated value of this method (= its estimated value) — uniform across all methods.
                "indicated_value": round(total_drc, 2),
                # Building Cost Details
                "gross_replacement_cost": round(grc, 2),
                "replacement_cost_per_sqm": replacement_cost_per_sqm,
                "mea_factor": round(mea_factor, 4),
                "mea_breakdown": mea_breakdown,
                "mea_adjusted_grc": round(mea_adjusted_grc, 2),
                "building_size_sqm": building_sqm,

                # Depreciation Breakdown
                "depreciation": {
                    "physical": {
                        "rate": round(physical_rate * 100, 2),
                        "amount": round(physical_depreciation, 2),
                        "source": physical_source,
                        "effective_age": physical_result.effective_age,
                        "economic_life": physical_result.economic_life,
                        "remaining_life": physical_result.remaining_life,
                        "method": physical_result.method,
                    },
                    "functional": {
                        "rate": round(functional_rate * 100, 2),
                        "amount": round(functional_obsolescence, 2),
                        "source": functional_source,
                        "note": "Functional/design adequacy is captured in the MEA factor (Model A) — not deducted again.",
                    },
                    "external": {
                        "rate": round(external_rate * 100, 2),
                        "amount": round(external_obsolescence, 2),
                        "source": external_source,
                    },
                    "total": {
                        "rate": round(total_depreciation_rate * 100, 2),
                        "amount": round(total_depreciation, 2),
                        "was_capped": was_capped,
                        "age_based_max": round(max_rate * 100, 1) if max_rate else 90.0,
                    },
                },

                # Building Value
                "depreciated_building_value": round(drc_building, 2),

                # Land Value
                "land_value": round(land_value, 2),
                "land_value_source": land_value_source,
                "land_area_sqm": land_sqm,

                # Property Info
                "building_age_years": property_age,
                "useful_life_years": useful_life,
                "construction_type": construction_type.value,
                "condition": condition_str,
            },
            assumptions=[
                "Specialized property with limited market",
                "Modern equivalent asset approach",
                f"Building age: {property_age} years",
                f"Useful life: {useful_life} years",
                f"Physical depreciation: {physical_source}",
                f"Functional obsolescence: {functional_source}",
                f"Land value: {land_value_source}",
            ],
            limitations=[
                "No direct market comparisons available",
                "Specialist construction costs estimated",
                "Value to a specific owner only",
            ] + (["Depreciation was capped due to age-based limits"] if was_capped else []),
            calculation_time_ms=calc_time
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DRC method failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
