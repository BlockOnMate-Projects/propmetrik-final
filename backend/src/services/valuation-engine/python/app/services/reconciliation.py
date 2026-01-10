"""
Reconciliation Service
Python implementation for PROPMETRIK valuation engine

Handles multi-method reconciliation, weighting, and final value determination
with RICS-compliant narrative generation for Ghana property valuations.
"""

import logging
from datetime import datetime, date
from typing import List, Optional, Dict, Any, Tuple
from decimal import Decimal
from enum import Enum
import uuid
import re

from pydantic import BaseModel, Field, validator
import numpy as np
import statistics

from ..schemas import (
    GhanaRegion,
    PropertyType,
    ValuationMethod,
    ValuationPurpose,
    ConfidenceLevel
)

# Setup logging
logger = logging.getLogger(__name__)


# ============================================================================
# ENUMS AND TYPES
# ============================================================================

class WeightingMethod(str, Enum):
    """Method weighting approaches"""
    confidence_based = "confidence_based"
    standard_property_type = "standard_property_type"
    custom = "custom"
    equal = "equal"

class FinalValueSelection(str, Enum):
    """Final value selection methods"""
    weighted_average = "weighted_average"
    primary_method = "primary_method"
    rounded_midpoint = "rounded_midpoint"
    custom = "custom"

class ReconciliationStatus(str, Enum):
    """Reconciliation workflow status"""
    draft = "draft"
    pending_review = "pending_review"
    approved = "approved"
    locked = "locked"


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class MethodResult(BaseModel):
    """Results from individual valuation method"""
    indicated_value: float = Field(..., description="Method's indicated value")
    confidence_score: float = Field(..., ge=0, le=1, description="Confidence score 0-1")
    data_quality_score: float = Field(..., ge=0, le=1, description="Data quality score 0-1")
    applicability_score: float = Field(..., ge=0, le=1, description="Method applicability score 0-1")
    comparable_count: Optional[int] = Field(None, description="Number of comparables used")
    avg_gross_adjustment: Optional[float] = Field(None, description="Average gross adjustment %")
    method_specific: Optional[Dict[str, Any]] = Field(None, description="Method-specific data")

class MethodWeight(BaseModel):
    """Weight assignment for valuation method"""
    weight: float = Field(..., ge=0, le=1, description="Method weight 0-1")
    is_manual: bool = Field(False, description="Is manually assigned")
    reason: Optional[str] = Field(None, description="Weighting justification")

class Reconciliation(BaseModel):
    """Complete reconciliation record"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    valuation_id: str = Field(..., description="Parent valuation ID")
    
    # Method results and weights
    method_results: Dict[str, MethodResult] = Field(..., description="Results by method")
    value_range_low: float = Field(..., description="Lowest indicated value")
    value_range_high: float = Field(..., description="Highest indicated value")
    value_spread_percentage: float = Field(..., description="Value spread as percentage")
    
    # Weighting
    weighting_method: WeightingMethod = Field(..., description="Weighting approach")
    method_weights: Dict[str, MethodWeight] = Field(..., description="Method weights")
    weighted_average_value: float = Field(..., description="Weighted average value")
    
    # Final value
    final_value_selection: FinalValueSelection = Field(..., description="Final value selection method")
    final_market_value: float = Field(..., description="Final market value in GHS")
    final_value_currency: str = Field("GHS", description="Final value currency")
    final_value_usd: Optional[float] = Field(None, description="Final value in USD")
    exchange_rate_used: Optional[float] = Field(None, description="Exchange rate used")
    value_per_sqm: Optional[float] = Field(None, description="Value per sqm")
    value_per_sqm_usd: Optional[float] = Field(None, description="Value per sqm in USD")
    
    # Narrative and confidence
    reconciliation_narrative: str = Field(..., description="Reconciliation narrative")
    narrative_word_count: int = Field(0, description="Narrative word count")
    narrative_meets_minimum: bool = Field(False, description="Meets minimum narrative requirements")
    overall_confidence_level: ConfidenceLevel = Field(..., description="Overall confidence level")
    overall_confidence_score: float = Field(..., ge=0, le=1, description="Overall confidence score")
    confidence_factors: List[str] = Field(default_factory=list, description="Confidence factors")
    
    # Assumptions and departures
    special_assumptions: List[str] = Field(default_factory=list, description="Special assumptions")
    departures_from_standards: List[str] = Field(default_factory=list, description="Departures from standards")
    
    # Workflow
    status: ReconciliationStatus = Field(ReconciliationStatus.draft, description="Status")
    finalized_at: Optional[datetime] = Field(None, description="Finalized timestamp")
    finalized_by: Optional[str] = Field(None, description="Finalized by user")
    requires_review: bool = Field(False, description="Requires review")
    reviewed_by: Optional[str] = Field(None, description="Reviewed by user")
    reviewed_at: Optional[datetime] = Field(None, description="Reviewed timestamp")
    review_notes: Optional[str] = Field(None, description="Review notes")
    
    # Metadata
    created_by: Optional[str] = Field(None, description="Created by user")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class CreateReconciliationInput(BaseModel):
    """Input for creating reconciliation"""
    valuation_id: str = Field(..., description="Valuation ID")
    method_results: Dict[str, MethodResult] = Field(..., description="Method results")
    weighting_method: WeightingMethod = Field(WeightingMethod.confidence_based, description="Weighting method")
    created_by: Optional[str] = Field(None, description="Created by user")

class SetMethodWeightsInput(BaseModel):
    """Input for setting manual method weights"""
    weights: Dict[str, float] = Field(..., description="Method weights")
    justifications: Optional[Dict[str, str]] = Field(None, description="Weight justifications")

class FinalizeInput(BaseModel):
    """Input for finalizing reconciliation"""
    final_value_selection: FinalValueSelection = Field(..., description="Final value selection method")
    final_market_value: Optional[float] = Field(None, description="Override final value")
    reconciliation_narrative: str = Field(..., min_length=200, description="Reconciliation narrative")
    special_assumptions: Optional[List[str]] = Field(None, description="Special assumptions")
    departures_from_standards: Optional[List[str]] = Field(None, description="Departures")
    building_area_sqm: Optional[float] = Field(None, description="Building area for per sqm calculation")
    finalized_by: str = Field(..., description="Finalizing user")


# ============================================================================
# RECONCILIATION SERVICE
# ============================================================================

class ReconciliationService:
    """
    Service for reconciling multiple valuation methods in Ghana property valuations.
    
    Features:
    - Multi-method reconciliation with confidence-based weighting
    - RICS-compliant narrative generation
    - Ghana-specific market considerations
    - Professional review workflow
    - Currency conversion (GHS/USD)
    """
    
    def __init__(self):
        """Initialize the service"""
        self.ghana_standard_weights = {
            PropertyType.residential_house: {
                ValuationMethod.sales_comparison: 0.5,
                ValuationMethod.cost_approach: 0.3,
                ValuationMethod.income_approach: 0.2
            },
            PropertyType.apartment_flat: {
                ValuationMethod.sales_comparison: 0.4,
                ValuationMethod.cost_approach: 0.2,
                ValuationMethod.income_approach: 0.4
            },
            PropertyType.commercial_office: {
                ValuationMethod.sales_comparison: 0.3,
                ValuationMethod.cost_approach: 0.2,
                ValuationMethod.income_approach: 0.5
            },
            PropertyType.land: {
                ValuationMethod.sales_comparison: 0.6,
                ValuationMethod.residual_method: 0.4
            }
        }
        
        self.minimum_narrative_words = 200
        self.current_usd_rate = 12.5  # Mock GHS/USD rate
    
    # --------------------------------------------------------------------------
    # RECONCILIATION CRUD
    # --------------------------------------------------------------------------
    
    async def create_reconciliation(
        self,
        input_data: CreateReconciliationInput
    ) -> Reconciliation:
        """Create new reconciliation with initial weighting"""
        
        logger.info(f"Creating reconciliation for valuation {input_data.valuation_id}")
        
        # Calculate value range
        values = [result.indicated_value for result in input_data.method_results.values()]
        value_range_low = min(values)
        value_range_high = max(values)
        value_spread = ((value_range_high - value_range_low) / value_range_low) * 100 if value_range_low > 0 else 0
        
        # Calculate initial weights
        method_weights = await self._calculate_initial_weights(
            input_data.method_results,
            input_data.weighting_method
        )
        
        # Calculate weighted average
        weighted_average = self._calculate_weighted_average(input_data.method_results, method_weights)
        
        # Determine overall confidence
        overall_confidence_score, confidence_level, confidence_factors = self._calculate_overall_confidence(
            input_data.method_results,
            method_weights
        )
        
        reconciliation = Reconciliation(
            valuation_id=input_data.valuation_id,
            method_results=input_data.method_results,
            value_range_low=value_range_low,
            value_range_high=value_range_high,
            value_spread_percentage=value_spread,
            weighting_method=input_data.weighting_method,
            method_weights=method_weights,
            weighted_average_value=weighted_average,
            final_value_selection=FinalValueSelection.weighted_average,
            final_market_value=weighted_average,
            overall_confidence_level=confidence_level,
            overall_confidence_score=overall_confidence_score,
            confidence_factors=confidence_factors,
            reconciliation_narrative="",  # To be completed during finalization
            created_by=input_data.created_by,
            requires_review=value_spread > 20.0  # Require review if spread > 20%
        )
        
        logger.info(f"Reconciliation created: {reconciliation.id}, value={reconciliation.final_market_value:,.0f}")
        return reconciliation
    
    async def set_method_weights(
        self,
        reconciliation_id: str,
        weights_input: SetMethodWeightsInput
    ) -> Reconciliation:
        """Set manual method weights with justification"""
        
        logger.info(f"Setting manual weights for reconciliation {reconciliation_id}")
        
        # Validate weights sum to 1.0
        total_weight = sum(weights_input.weights.values())
        if abs(total_weight - 1.0) > 0.01:
            raise ValueError(f"Weights must sum to 1.0, got {total_weight}")
        
        # Mock: In real implementation, fetch existing reconciliation
        # For now, create updated method weights
        method_weights = {}
        for method, weight in weights_input.weights.items():
            justification = weights_input.justifications.get(method) if weights_input.justifications else None
            method_weights[method] = MethodWeight(
                weight=weight,
                is_manual=True,
                reason=justification
            )
        
        # Mock response - would update existing reconciliation
        reconciliation = Reconciliation(
            id=reconciliation_id,
            valuation_id="mock-valuation",
            method_results={},
            value_range_low=700000,
            value_range_high=900000,
            value_spread_percentage=22.2,
            weighting_method=WeightingMethod.custom,
            method_weights=method_weights,
            weighted_average_value=800000,
            final_value_selection=FinalValueSelection.weighted_average,
            final_market_value=800000,
            overall_confidence_level=ConfidenceLevel.moderate,
            overall_confidence_score=0.75,
            reconciliation_narrative=""
        )
        
        logger.info("Manual weights applied successfully")
        return reconciliation
    
    async def finalize_reconciliation(
        self,
        reconciliation_id: str,
        finalize_input: FinalizeInput
    ) -> Reconciliation:
        """Finalize reconciliation with narrative and final value"""
        
        logger.info(f"Finalizing reconciliation {reconciliation_id}")
        
        # Validate narrative length
        word_count = len(finalize_input.reconciliation_narrative.split())
        narrative_meets_minimum = word_count >= self.minimum_narrative_words
        
        if not narrative_meets_minimum:
            raise ValueError(f"Narrative must be at least {self.minimum_narrative_words} words, got {word_count}")
        
        # Calculate final value
        final_value = finalize_input.final_market_value or 800000  # Mock base value
        
        # Currency conversion
        final_value_usd = final_value / self.current_usd_rate
        
        # Calculate per sqm values if building area provided
        value_per_sqm = None
        value_per_sqm_usd = None
        if finalize_input.building_area_sqm:
            value_per_sqm = final_value / finalize_input.building_area_sqm
            value_per_sqm_usd = final_value_usd / finalize_input.building_area_sqm
        
        # Mock finalized reconciliation
        reconciliation = Reconciliation(
            id=reconciliation_id,
            valuation_id="mock-valuation",
            method_results={},
            value_range_low=700000,
            value_range_high=900000,
            value_spread_percentage=22.2,
            weighting_method=WeightingMethod.confidence_based,
            method_weights={},
            weighted_average_value=800000,
            final_value_selection=finalize_input.final_value_selection,
            final_market_value=final_value,
            final_value_usd=final_value_usd,
            exchange_rate_used=self.current_usd_rate,
            value_per_sqm=value_per_sqm,
            value_per_sqm_usd=value_per_sqm_usd,
            reconciliation_narrative=finalize_input.reconciliation_narrative,
            narrative_word_count=word_count,
            narrative_meets_minimum=narrative_meets_minimum,
            overall_confidence_level=ConfidenceLevel.moderate,
            overall_confidence_score=0.75,
            special_assumptions=finalize_input.special_assumptions or [],
            departures_from_standards=finalize_input.departures_from_standards or [],
            status=ReconciliationStatus.pending_review,
            finalized_at=datetime.now(),
            finalized_by=finalize_input.finalized_by
        )
        
        logger.info(f"Reconciliation finalized: final_value={final_value:,.0f}")
        return reconciliation
    
    # --------------------------------------------------------------------------
    # WEIGHTING CALCULATIONS
    # --------------------------------------------------------------------------
    
    async def _calculate_initial_weights(
        self,
        method_results: Dict[str, MethodResult],
        weighting_method: WeightingMethod
    ) -> Dict[str, MethodWeight]:
        """Calculate initial method weights"""
        
        method_weights = {}
        
        if weighting_method == WeightingMethod.equal:
            # Equal weighting
            weight = 1.0 / len(method_results)
            for method in method_results.keys():
                method_weights[method] = MethodWeight(
                    weight=weight,
                    is_manual=False,
                    reason="Equal weighting applied"
                )
        
        elif weighting_method == WeightingMethod.confidence_based:
            # Confidence-based weighting
            total_confidence = sum(result.confidence_score for result in method_results.values())
            
            for method, result in method_results.items():
                weight = result.confidence_score / total_confidence if total_confidence > 0 else 0
                method_weights[method] = MethodWeight(
                    weight=weight,
                    is_manual=False,
                    reason=f"Confidence-based weight ({result.confidence_score:.2f} confidence)"
                )
        
        elif weighting_method == WeightingMethod.standard_property_type:
            # Standard property type weights (mock implementation)
            # In real implementation, would use property type from valuation
            standard_weights = {
                "sales_comparison": 0.5,
                "cost_approach": 0.3,
                "income_approach": 0.2
            }
            
            for method in method_results.keys():
                weight = standard_weights.get(method, 1.0 / len(method_results))
                method_weights[method] = MethodWeight(
                    weight=weight,
                    is_manual=False,
                    reason="Standard property type weighting"
                )
        
        else:  # Custom - start with equal weights
            weight = 1.0 / len(method_results)
            for method in method_results.keys():
                method_weights[method] = MethodWeight(
                    weight=weight,
                    is_manual=False,
                    reason="Equal weighting (custom to be adjusted)"
                )
        
        return method_weights
    
    def _calculate_weighted_average(
        self,
        method_results: Dict[str, MethodResult],
        method_weights: Dict[str, MethodWeight]
    ) -> float:
        """Calculate weighted average value"""
        
        weighted_sum = 0.0
        total_weight = 0.0
        
        for method, result in method_results.items():
            if method in method_weights:
                weight = method_weights[method].weight
                weighted_sum += result.indicated_value * weight
                total_weight += weight
        
        return weighted_sum / total_weight if total_weight > 0 else 0.0
    
    def _calculate_overall_confidence(
        self,
        method_results: Dict[str, MethodResult],
        method_weights: Dict[str, MethodWeight]
    ) -> Tuple[float, ConfidenceLevel, List[str]]:
        """Calculate overall confidence score and level"""
        
        # Weighted confidence score
        weighted_confidence = 0.0
        total_weight = 0.0
        
        for method, result in method_results.items():
            if method in method_weights:
                weight = method_weights[method].weight
                weighted_confidence += result.confidence_score * weight
                total_weight += weight
        
        overall_score = weighted_confidence / total_weight if total_weight > 0 else 0.0
        
        # Determine confidence level
        if overall_score >= 0.8:
            confidence_level = ConfidenceLevel.high
        elif overall_score >= 0.6:
            confidence_level = ConfidenceLevel.moderate
        else:
            confidence_level = ConfidenceLevel.low
        
        # Generate confidence factors
        factors = []
        
        # Method count
        method_count = len(method_results)
        if method_count >= 3:
            factors.append("Multiple valuation methods applied")
        elif method_count == 2:
            factors.append("Two valuation methods applied")
        else:
            factors.append("Limited to single valuation method")
        
        # Value spread
        values = [result.indicated_value for result in method_results.values()]
        if len(values) > 1:
            spread = (max(values) - min(values)) / min(values) * 100
            if spread <= 10:
                factors.append("Low value spread between methods (<10%)")
            elif spread <= 20:
                factors.append("Moderate value spread between methods (10-20%)")
            else:
                factors.append("High value spread between methods (>20%)")
        
        # Data quality
        avg_data_quality = statistics.mean(result.data_quality_score for result in method_results.values())
        if avg_data_quality >= 0.8:
            factors.append("High quality market data available")
        elif avg_data_quality >= 0.6:
            factors.append("Reasonable quality market data available")
        else:
            factors.append("Limited quality market data available")
        
        return overall_score, confidence_level, factors
    
    # --------------------------------------------------------------------------
    # NARRATIVE GENERATION
    # --------------------------------------------------------------------------
    
    def generate_narrative_template(
        self,
        reconciliation: Reconciliation,
        property_type: Optional[PropertyType] = None,
        region: Optional[GhanaRegion] = None
    ) -> str:
        """Generate RICS-compliant narrative template"""
        
        logger.info("Generating reconciliation narrative template")
        
        template = f"""RECONCILIATION OF VALUE

The valuation has been undertaken using {len(reconciliation.method_results)} valuation approaches as follows:

"""
        
        # Method summaries
        for method, result in reconciliation.method_results.items():
            method_name = method.replace("_", " ").title()
            weight = reconciliation.method_weights.get(method)
            weight_pct = weight.weight * 100 if weight else 0
            
            template += f"""{method_name}: GH₵ {result.indicated_value:,.0f}
- Confidence Score: {result.confidence_score:.0%}
- Weight Applied: {weight_pct:.1f}%
- {weight.reason if weight and weight.reason else "Standard weighting applied"}

"""
        
        # Value range analysis
        template += f"""VALUE RANGE ANALYSIS

The valuation approaches resulted in a value range of GH₵ {reconciliation.value_range_low:,.0f} to GH₵ {reconciliation.value_range_high:,.0f}, representing a spread of {reconciliation.value_spread_percentage:.1f}%.

"""
        
        # Weighting rationale
        template += f"""WEIGHTING RATIONALE

The weighting methodology applied is {reconciliation.weighting_method.value.replace("_", " ")}.

"""
        
        # Final value conclusion
        template += f"""FINAL VALUE CONCLUSION

Having considered all valuation approaches and their relative reliability, the market value is assessed at:

GH₵ {reconciliation.final_market_value:,.0f}

This represents the final reconciled market value as at the valuation date.

CONFIDENCE ASSESSMENT

Overall confidence level: {reconciliation.overall_confidence_level.value.title()}
Overall confidence score: {reconciliation.overall_confidence_score:.0%}

Confidence factors considered:
"""
        
        for factor in reconciliation.confidence_factors:
            template += f"• {factor}\n"
        
        # Special assumptions
        if reconciliation.special_assumptions:
            template += "\nSPECIAL ASSUMPTIONS\n\n"
            for assumption in reconciliation.special_assumptions:
                template += f"• {assumption}\n"
        
        # Departures from standards
        if reconciliation.departures_from_standards:
            template += "\nDEPARTURES FROM VALUATION STANDARDS\n\n"
            for departure in reconciliation.departures_from_standards:
                template += f"• {departure}\n"
        
        logger.info(f"Narrative template generated: {len(template.split())} words")
        return template


# ============================================================================
# SERVICE INSTANCE
# ============================================================================

reconciliation_service = ReconciliationService()