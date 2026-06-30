"""
Depreciation API endpoints (D8) — `/api/v1/depreciation/*`.

Per-method module extracted from main.py (behaviour-preserving). Calculates physical / functional /
external depreciation components, handles valuer overrides and supervisor approval. Service and
schema classes are imported in-body from ..services / ..schemas (one level up); shared models/helpers
come from the dependency-free ._shared module. Main includes this router.
"""
from datetime import datetime, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from ._shared import (
    PropertyInput,
    logger,
)

router = APIRouter()


class DepreciationCalculateRequest(BaseModel):
    """Request for depreciation calculation"""
    property: PropertyInput
    include_external: bool = True
    location_data: Optional[Dict[str, Any]] = None
    market_data: Optional[Dict[str, Any]] = None


class DepreciationOverrideRequest(BaseModel):
    """Request to submit a depreciation override"""
    valuation_id: str
    component: str = Field(..., pattern="^(physical|functional|external)$")
    auto_calculated_rate: float = Field(..., ge=0, le=1)
    override_rate: float = Field(..., ge=0, le=1)
    justification: str = Field(..., min_length=50)
    evidence_type: str = Field(..., pattern="^(inspection|photo|market_data|expert_opinion|comparable_analysis|engineering_report|insurance_assessment)$")
    evidence_reference: Optional[str] = None
    valuer_id: Optional[str] = None


class DepreciationOverrideApprovalRequest(BaseModel):
    """Request to approve a depreciation override"""
    override_id: str
    approver_id: str
    approved: bool
    comments: Optional[str] = None


class DepreciationComponentResult(BaseModel):
    """Result for a single depreciation component"""
    depreciation_rate: float
    depreciation_percent: float
    auto_calculated: bool
    confidence: float
    notes: List[str]
    details: Dict[str, Any]


class DepreciationCalculateResponse(BaseModel):
    """Response from depreciation calculation"""
    success: bool
    property_id: str
    physical: DepreciationComponentResult
    functional: DepreciationComponentResult
    external: Optional[DepreciationComponentResult] = None
    total: Dict[str, Any]
    reconciliation: Dict[str, Any]
    rcn: float
    calculation_time_ms: float


class DepreciationOverrideResponse(BaseModel):
    """Response from override submission"""
    success: bool
    override_id: str
    component: str
    variance_percent: float
    requires_approval: bool
    is_valid: bool
    validation_errors: List[str]
    message: str


@router.post("/api/v1/depreciation/calculate", response_model=DepreciationCalculateResponse)
async def calculate_depreciation(request: DepreciationCalculateRequest):
    """
    Calculate Depreciation (D8)

    Calculates all depreciation components for a property:
    - Physical: Modified Age-Life method with condition adjustment
    - Functional: Auto-detected from property specifications
    - External: Environmental, locational, economic, regulatory factors

    Uses RICS/GhIS compliant methodology with age-based caps.
    """
    from ..services import (
        PhysicalDepreciationCalculator,
        FunctionalObsolescenceCalculator,
        ExternalObsolescenceCalculator,
        DepreciationReconciliationService,
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

    try:
        # Map condition string to enum
        condition_map = {
            "new": PropertyCondition.EXCELLENT,  # NEW not in enum, use EXCELLENT
            "excellent": PropertyCondition.EXCELLENT,
            "good": PropertyCondition.GOOD,
            "fair": PropertyCondition.FAIR,
            "poor": PropertyCondition.POOR,
            "very_poor": PropertyCondition.RENOVATION_NEEDED,  # VERY_POOR not in enum
            "renovation_needed": PropertyCondition.RENOVATION_NEEDED,
        }
        condition = condition_map.get(
            (prop.condition or "good").lower().replace(" ", "_"),
            PropertyCondition.GOOD
        )

        # Map property type string to enum
        property_type_map = {
            "residential_house": PropertyType.RESIDENTIAL_HOUSE,
            "residential_apartment": PropertyType.RESIDENTIAL_APARTMENT,
            "residential_townhouse": PropertyType.RESIDENTIAL_TOWNHOUSE,
            "residential_villa": PropertyType.RESIDENTIAL_VILLA,
            "commercial_office": PropertyType.COMMERCIAL_OFFICE,
            "commercial_retail": PropertyType.COMMERCIAL_RETAIL,
            "industrial_warehouse": PropertyType.INDUSTRIAL_WAREHOUSE,
        }
        property_type = property_type_map.get(
            (prop.property_type or "residential_house").lower().replace(" ", "_"),
            PropertyType.RESIDENTIAL_HOUSE
        )

        # Map region string to enum (cluster-based regions)
        region_map = {
            "greater_accra": GhanaRegion.GREATER_ACCRA,
            "accra": GhanaRegion.GREATER_ACCRA,
            "tema": GhanaRegion.GREATER_ACCRA,
            "ashanti": GhanaRegion.KUMASI_METRO,
            "kumasi": GhanaRegion.KUMASI_METRO,
            "kumasi_metro": GhanaRegion.KUMASI_METRO,
            "western": GhanaRegion.WESTERN_CLUSTER,
            "western_cluster": GhanaRegion.WESTERN_CLUSTER,
            "central": GhanaRegion.WESTERN_CLUSTER,
            "eastern": GhanaRegion.EASTERN,
            "volta": GhanaRegion.EASTERN,
            "northern": GhanaRegion.NORTHERN_CLUSTER,
            "northern_cluster": GhanaRegion.NORTHERN_CLUSTER,
            "upper_east": GhanaRegion.NORTHERN_CLUSTER,
            "upper_west": GhanaRegion.NORTHERN_CLUSTER,
            "brong_ahafo": GhanaRegion.KUMASI_METRO,
            "bono": GhanaRegion.KUMASI_METRO,
        }
        region = region_map.get(
            (prop.region or "greater_accra").lower().replace(" ", "_"),
            GhanaRegion.GREATER_ACCRA
        )

        year_built = prop.year_built or datetime.now().year - 15
        building_sqm = prop.building_size_sqm or 150

        # Build Property schema object
        property_schema = Property(
            id=prop.id,
            property_type=property_type,
            location=PropertyLocation(
                region=region,
                district=getattr(prop, 'district', None) or "Unknown",
                neighborhood=getattr(prop, 'neighborhood', None) or "Unknown",
                address_raw=prop.address_street or "Unknown",
                address_city=getattr(prop, 'city', None) or "Accra",
            ),
            specifications=PropertySpecifications(
                year_built=year_built,
                condition=condition,
                bedrooms=prop.bedrooms,
                bathrooms=prop.bathrooms,
                parking_spaces=getattr(prop, 'parking_spaces', None),
                has_air_conditioning=getattr(prop, 'has_ac', None),
                has_generator=getattr(prop, 'has_generator', None),
                has_borehole=getattr(prop, 'has_borehole', None),
                land_size_sqm=prop.land_area_sqm or 300,
                built_area_sqm=building_sqm,
            ),
            data_quality=PropertyDataQuality(
                data_quality_score=0.7,
                source_reliability_score=0.7,
                completeness_score=0.7,
                accuracy_score=0.7,
                freshness_score=0.7,
                sources=["api_input"],
            ),
        )

        # Calculate Physical Depreciation
        physical_calculator = PhysicalDepreciationCalculator()
        physical_result = physical_calculator.calculate(
            property_data=property_schema,
            valuation_date=date.today(),
            construction_type=None,  # Let it infer from property type
            last_renovation_year=getattr(prop, 'last_renovation', None),
        )

        # Calculate Functional Obsolescence
        functional_calculator = FunctionalObsolescenceCalculator()
        functional_result = functional_calculator.calculate(property_schema)

        # Calculate External Obsolescence (if requested)
        external_result = None
        if request.include_external:
            external_calculator = ExternalObsolescenceCalculator()
            external_result = external_calculator.calculate(
                property_data=property_schema,
                location_data=request.location_data or {},
                market_data=request.market_data or {},
            )

        # Estimate RCN for context — use provided value or estimate from building size
        rcn = request.rcn if hasattr(request, 'rcn') and request.rcn else None
        if not rcn:
            # Rough estimate: use a reasonable per-sqm rate for context only
            # This is NOT used in the depreciation calculation itself
            cost_per_sqm = 8500  # Default estimate, not authoritative
            rcn = building_sqm * cost_per_sqm

        # Reconcile with age-based caps
        reconciliation = DepreciationReconciliationService()
        property_age = datetime.now().year - year_built

        # Create a minimal external result if not calculated
        if external_result is None:
            from ..services.depreciation import ExternalObsolescenceResult
            external_result = ExternalObsolescenceResult(
                depreciation_rate=0.0,
                depreciation_percent=0.0,
                factors_detected=[],
                category_breakdown={},
                total_factors=0,
                auto_calculated=False,
                confidence=0.0,
                requires_review=False,
                data_sources_used=[],
                notes=["External obsolescence not calculated"],
            )

        total_result = reconciliation.reconcile(
            physical=physical_result,
            functional=functional_result,
            external=external_result,
            property_age=property_age,
            rcn=rcn,
        )

        calc_time = (datetime.now() - start_time).total_seconds() * 1000

        # Build response
        response = DepreciationCalculateResponse(
            success=True,
            property_id=prop.id,
            physical=DepreciationComponentResult(
                depreciation_rate=physical_result.depreciation_rate,
                depreciation_percent=physical_result.depreciation_percent,
                auto_calculated=physical_result.auto_calculated,
                confidence=physical_result.confidence,
                notes=physical_result.notes,
                details={
                    "actual_age": physical_result.actual_age,
                    "effective_age": physical_result.effective_age,
                    "economic_life": physical_result.economic_life,
                    "remaining_life": physical_result.remaining_life,
                    "method": physical_result.method,
                    "inputs_used": physical_result.inputs_used,
                },
            ),
            functional=DepreciationComponentResult(
                depreciation_rate=functional_result.depreciation_rate,
                depreciation_percent=functional_result.depreciation_percent,
                auto_calculated=functional_result.auto_calculated,
                confidence=functional_result.confidence,
                notes=functional_result.notes,
                details={
                    "items_detected": [
                        {
                            "item_key": item.item_key,
                            "type": item.type.value,
                            "curable": item.curable,
                            "description": item.description,
                            "rate": item.rate,
                            "rate_range": list(item.rate_range),
                        }
                        for item in functional_result.items_detected
                    ],
                    "total_items": functional_result.total_items,
                    "curable_rate": functional_result.curable_rate,
                    "incurable_rate": functional_result.incurable_rate,
                    "requires_review": functional_result.requires_review,
                },
            ),
            external=DepreciationComponentResult(
                depreciation_rate=external_result.depreciation_rate,
                depreciation_percent=external_result.depreciation_percent,
                auto_calculated=external_result.auto_calculated,
                confidence=external_result.confidence,
                notes=external_result.notes,
                details={
                    "factors_detected": [
                        {
                            "factor_key": f.factor_key,
                            "category": f.category.value,
                            "description": f.description,
                            "rate": f.rate,
                            "rate_range": list(f.rate_range),
                            "data_source": f.data_source,
                        }
                        for f in external_result.factors_detected
                    ],
                    "total_factors": external_result.total_factors,
                    "category_breakdown": external_result.category_breakdown,
                    "requires_review": external_result.requires_review,
                },
            ) if external_result else None,
            total={
                "rate": total_result.total_rate,
                "percent": total_result.total_percent,
                "was_capped": total_result.was_capped,
                "cap_applied": total_result.cap_applied,
                "components": {
                    "physical": {
                        "rate": total_result.physical_rate,
                        "amount": total_result.physical_amount,
                    },
                    "functional": {
                        "rate": total_result.functional_rate,
                        "amount": total_result.functional_amount,
                    },
                    "external": {
                        "rate": total_result.external_rate,
                        "amount": total_result.external_amount,
                    },
                },
                "methodology_notes": total_result.methodology_notes,
            },
            reconciliation={
                "auto_calculated": True,
                "confidence": min(
                    physical_result.confidence,
                    functional_result.confidence,
                    external_result.confidence if external_result else 1.0,
                ),
                "requires_review": any([
                    functional_result.requires_review,
                    external_result.requires_review if external_result else False,
                ]),
                "methodology_notes": total_result.methodology_notes,
            },
            rcn=round(rcn, 2),
            calculation_time_ms=round(calc_time, 2),
        )

        return response

    except Exception as e:
        logger.error(f"Depreciation calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/v1/depreciation/override", response_model=DepreciationOverrideResponse)
async def submit_depreciation_override(request: DepreciationOverrideRequest):
    """
    Submit Depreciation Override (D8)

    Allows valuers to override auto-calculated depreciation values.
    Per GhIS/RICS standards:
    - Minimum 50-character justification required
    - Evidence must be provided (except expert opinion)
    - Variance > 20% requires supervisor approval
    """
    from ..services import (
        EvidenceType as DepEvidenceType,
        DepreciationComponent as DepComponent,
        DepreciationOverride as DepOverride,
        validate_override,
    )

    try:
        # Map string to enum
        component_map = {
            "physical": DepComponent.PHYSICAL,
            "functional": DepComponent.FUNCTIONAL,
            "external": DepComponent.EXTERNAL,
        }
        evidence_map = {
            "inspection": DepEvidenceType.INSPECTION,
            "photo": DepEvidenceType.PHOTO,
            "market_data": DepEvidenceType.MARKET_DATA,
            "expert_opinion": DepEvidenceType.EXPERT_OPINION,
            "comparable_analysis": DepEvidenceType.COMPARABLE_ANALYSIS,
            "engineering_report": DepEvidenceType.ENGINEERING_REPORT,
            "insurance_assessment": DepEvidenceType.INSURANCE_ASSESSMENT,
        }

        component = component_map[request.component]
        evidence_type = evidence_map[request.evidence_type]

        # Create override object
        override = DepOverride(
            component=component,
            auto_calculated_rate=request.auto_calculated_rate,
            override_rate=request.override_rate,
            justification=request.justification,
            evidence_type=evidence_type,
            evidence_reference=request.evidence_reference,
            valuer_id=request.valuer_id,
        )

        # Validate
        is_valid, errors = override.is_valid()
        requires_approval = override.requires_approval()

        # Generate override ID (in production, this would be stored in DB)
        import uuid
        override_id = str(uuid.uuid4())

        # Build message
        if is_valid:
            if requires_approval:
                message = (
                    f"Override submitted for approval. Variance of {override.variance_percent:.1f}% "
                    f"exceeds {override.APPROVAL_THRESHOLD_PERCENT}% threshold."
                )
            else:
                message = "Override applied successfully."
        else:
            message = "Override validation failed. Please fix errors and resubmit."

        return DepreciationOverrideResponse(
            success=is_valid,
            override_id=override_id,
            component=request.component,
            variance_percent=round(override.variance_percent, 2),
            requires_approval=requires_approval,
            is_valid=is_valid,
            validation_errors=errors,
            message=message,
        )

    except Exception as e:
        logger.error(f"Override submission failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/v1/depreciation/{valuation_id}")
async def get_depreciation_details(
    valuation_id: str = Path(..., description="Valuation ID"),
    include_overrides: bool = Query(True, description="Include override history"),
):
    """
    Get Depreciation Details (D8)

    Retrieves stored depreciation calculation and any overrides
    for a specific valuation.

    Note: In production, this would fetch from database.
    Currently returns a sample structure.
    """
    # In production, fetch from database
    # For now, return a sample structure showing expected format

    return {
        "success": True,
        "valuation_id": valuation_id,
        "depreciation": {
            "physical": {
                "auto_calculated_rate": 0.15,
                "override_rate": None,
                "effective_rate": 0.15,
                "has_override": False,
            },
            "functional": {
                "auto_calculated_rate": 0.05,
                "override_rate": None,
                "effective_rate": 0.05,
                "has_override": False,
            },
            "external": {
                "auto_calculated_rate": 0.02,
                "override_rate": None,
                "effective_rate": 0.02,
                "has_override": False,
            },
            "total_rate": 0.22,
            "total_percent": 22.0,
        },
        "overrides": [] if include_overrides else None,
        "message": "Fetch from database in production implementation",
    }


@router.post("/api/v1/depreciation/override/{override_id}/approve")
async def approve_depreciation_override(
    override_id: str = Path(..., description="Override ID"),
    request: DepreciationOverrideApprovalRequest = None,
):
    """
    Approve/Reject Depreciation Override (D8)

    Supervisors can approve or reject overrides that exceed
    the 20% variance threshold.

    Note: In production, this would update database records.
    """
    if request is None:
        raise HTTPException(status_code=400, detail="Request body required")

    return {
        "success": True,
        "override_id": override_id,
        "approved": request.approved,
        "approved_by": request.approver_id,
        "approval_date": date.today().isoformat(),
        "comments": request.comments,
        "message": (
            "Override approved and applied to valuation."
            if request.approved
            else "Override rejected. Original auto-calculated value retained."
        ),
    }
