"""
Core Valuation Service

Main orchestrator for property valuations implementing all 6 valuation methodologies:
1. Sales Comparison Approach
2. Cost Approach 
3. Income Approach
4. Residual Method
5. Profits Method
6. Depreciated Replacement Cost (DRC)

Provides comprehensive valuation with confidence scoring and method reconciliation.
"""

from typing import Dict, List, Optional, Tuple, Any
from decimal import Decimal
import asyncio
from datetime import datetime, timedelta
import logging

from ..models.schemas import (
    PropertyForValuation, ValuationOptions, MethodResult, 
    RegionCode, PropertyType, ValuationType, ValuationPurpose, 
    ValuationResult, ConfidenceLevel
)
from .sales_comparison import SalesComparisonService
from .cost_approach import CostApproachService
from .income_approach import IncomeApproachService
from .residual_method import ResidualMethodService
from .profits_method import ProfitsMethodService
from .drc_method import DRCMethodService
from .confidence_scoring import ConfidenceScoringService
from ..adapters.market_data import MarketDataAdapter
from ..utils.ghana_validation import validate_property_data

logger = logging.getLogger(__name__)

# Method applicability by property type
METHOD_APPLICABILITY: Dict[str, List[str]] = {
    "house": ["sales_comparison", "cost_approach"],
    "residential_house": ["sales_comparison", "cost_approach"],
    "apartment": ["sales_comparison", "cost_approach", "income_approach"],
    "residential_apartment": ["sales_comparison", "cost_approach", "income_approach"],
    "townhouse": ["sales_comparison", "cost_approach"],
    "villa": ["sales_comparison", "cost_approach"],
    "land": ["sales_comparison", "residual_method"],
    "residential_land": ["sales_comparison", "residual_method"],
    "commercial_land": ["sales_comparison", "residual_method"],
    "commercial": ["sales_comparison", "income_approach", "cost_approach"],
    "commercial_office": ["income_approach", "sales_comparison", "cost_approach"],
    "commercial_retail": ["income_approach", "sales_comparison", "profits_method"],
    "commercial_warehouse": ["cost_approach", "income_approach"],
    "office": ["income_approach", "sales_comparison", "cost_approach"],
    "retail": ["income_approach", "sales_comparison", "profits_method"],
    "industrial": ["cost_approach", "income_approach", "sales_comparison"],
    "warehouse": ["cost_approach", "income_approach"],
    "hotel": ["profits_method", "income_approach"],
    "hospital": ["drc_method", "profits_method"],
    "school": ["drc_method", "cost_approach"],
    "religious": ["drc_method", "cost_approach"],
    "mixed_use": ["income_approach", "sales_comparison", "residual_method"],
    "institutional": ["drc_method", "cost_approach"],
    "government": ["drc_method", "cost_approach"],
    "default": ["sales_comparison", "cost_approach"],
}

# Default method weights for reconciliation
DEFAULT_METHOD_WEIGHTS: Dict[str, float] = {
    "sales_comparison": 0.40,
    "cost_approach": 0.25,
    "income_approach": 0.25,
    "residual_method": 0.10,
    "profits_method": 0.00,
    "drc_method": 0.00,
}


class ValuationEngineService:
    """Core Valuation Engine Service"""

    def __init__(self, market_adapter: MarketDataAdapter):
        self.market_adapter = market_adapter
        self.sales_comparison_service = SalesComparisonService(market_adapter)
        self.cost_approach_service = CostApproachService(market_adapter)
        self.income_approach_service = IncomeApproachService(market_adapter)
        self.residual_method_service = ResidualMethodService(market_adapter)
        self.profits_method_service = ProfitsMethodService(market_adapter)
        self.drc_method_service = DRCMethodService(market_adapter)
        self.confidence_scoring_service = ConfidenceScoringService(market_adapter)

    async def generate_valuation(
        self,
        property_data: PropertyForValuation,
        valuation_type: ValuationType,
        valuation_purpose: ValuationPurpose,
        options: Optional[ValuationOptions] = None
    ) -> ValuationResult:
        """Generate comprehensive property valuation"""
        start_time = datetime.now()
        
        # Use default options if not provided
        if options is None:
            options = ValuationOptions()

        logger.info(f"Starting valuation for property {property_data.id} ({valuation_type.value} - {valuation_purpose.value})")

        try:
            # 1. Validate property data
            validation_result = validate_property_data(property_data)
            if not validation_result.is_valid:
                raise ValueError(f"Property data validation failed: {validation_result.errors}")

            # 2. Run applicable valuation methods
            method_results = []
            
            # Sales Comparison Approach
            if self._is_method_applicable("sales_comparison", property_data):
                try:
                    sales_result = await self.sales_comparison_service.calculate(property_data, options)
                    if sales_result.value > 0:
                        method_results.append(sales_result)
                        logger.info(f"Sales Comparison: GHS {sales_result.value:,.0f} (confidence: {sales_result.confidence:.2f})")
                except Exception as e:
                    logger.warning(f"Sales Comparison method failed: {str(e)}")

            # Cost Approach
            if self._is_method_applicable("cost_approach", property_data):
                try:
                    cost_result = await self.cost_approach_service.calculate(property_data, options)
                    if cost_result.value > 0:
                        method_results.append(cost_result)
                        logger.info(f"Cost Approach: GHS {cost_result.value:,.0f} (confidence: {cost_result.confidence:.2f})")
                except Exception as e:
                    logger.warning(f"Cost Approach method failed: {str(e)}")

            # Income Approach
            if self._is_method_applicable("income_approach", property_data):
                try:
                    income_result = await self.income_approach_service.calculate(property_data, options)
                    if income_result.value > 0:
                        method_results.append(income_result)
                        logger.info(f"Income Approach: GHS {income_result.value:,.0f} (confidence: {income_result.confidence:.2f})")
                except Exception as e:
                    logger.warning(f"Income Approach method failed: {str(e)}")

            # Residual Method
            if self._is_method_applicable("residual_method", property_data):
                try:
                    residual_result = await self.residual_method_service.calculate(property_data, options)
                    if residual_result.value > 0:
                        method_results.append(residual_result)
                        logger.info(f"Residual Method: GHS {residual_result.value:,.0f} (confidence: {residual_result.confidence:.2f})")
                except Exception as e:
                    logger.warning(f"Residual Method failed: {str(e)}")

            # Profits Method
            if self._is_method_applicable("profits_method", property_data):
                try:
                    profits_result = await self.profits_method_service.calculate(property_data, options)
                    if profits_result.value > 0:
                        method_results.append(profits_result)
                        logger.info(f"Profits Method: GHS {profits_result.value:,.0f} (confidence: {profits_result.confidence:.2f})")
                except Exception as e:
                    logger.warning(f"Profits Method failed: {str(e)}")

            # DRC Method
            if self._is_method_applicable("drc_method", property_data):
                try:
                    drc_result = await self.drc_method_service.calculate(property_data, options)
                    if drc_result.value > 0:
                        method_results.append(drc_result)
                        logger.info(f"DRC Method: GHS {drc_result.value:,.0f} (confidence: {drc_result.confidence:.2f})")
                except Exception as e:
                    logger.warning(f"DRC Method failed: {str(e)}")

            # 3. Ensure we have at least one valid result
            if not method_results:
                raise ValueError("No valuation methods produced valid results")

            # 4. Calculate final valuation using weighted approach
            final_value = self._calculate_weighted_value(method_results)
            value_range = self._calculate_value_range(method_results, final_value)
            
            # 5. Calculate comprehensive confidence analysis
            confidence_analysis = await self.confidence_scoring_service.calculate_confidence(
                property_data, 
                None,  # Will be populated with final result
                method_results
            )
            confidence_score = confidence_analysis.overall_score
            confidence_level = self._determine_confidence_level(confidence_score)
            
            # 6. Determine primary method
            primary_method = self._determine_primary_method(method_results)

            # 7. Calculate value per sqm
            building_size = (
                property_data.building_size_sqm or 
                property_data.built_area_sqm or 
                property_data.total_area_sqm
            )
            value_per_sqm = final_value / building_size if building_size and building_size > 0 else None

            # 8. Create valuation result
            valuation_result = ValuationResult(
                property_id=property_data.id,
                valuation_type=valuation_type,
                valuation_purpose=valuation_purpose,
                estimated_value=round(final_value),
                value_range_low=round(value_range["low"]),
                value_range_high=round(value_range["high"]),
                value_per_sqm=round(value_per_sqm) if value_per_sqm else None,
                value_currency="GHS",
                confidence_score=round(confidence_score, 3),
                confidence_level=confidence_level,
                data_quality_score=round(confidence_analysis.components.data_completeness, 3),
                comparable_quality_score=round(confidence_analysis.components.comparable_quality, 3),
                methods_used=method_results,
                primary_method=primary_method,
                # Individual method values for reference
                sales_comparison_value=self._get_method_value(method_results, "sales_comparison"),
                sales_comparison_confidence=self._get_method_confidence(method_results, "sales_comparison"),
                cost_approach_value=self._get_method_value(method_results, "cost_approach"),
                cost_approach_confidence=self._get_method_confidence(method_results, "cost_approach"),
                income_approach_value=self._get_method_value(method_results, "income_approach"),
                income_approach_confidence=self._get_method_confidence(method_results, "income_approach"),
                residual_value=self._get_method_value(method_results, "residual_method"),
                residual_confidence=self._get_method_confidence(method_results, "residual_method"),
                profits_value=self._get_method_value(method_results, "profits_method"),
                profits_confidence=self._get_method_confidence(method_results, "profits_method"),
                drc_value=self._get_method_value(method_results, "drc_method"),
                drc_confidence=self._get_method_confidence(method_results, "drc_method"),
                comparables_count=0,  # Will be populated by market data service
                comparables=[],  # Will be populated by market data service
                created_at=datetime.now(),
                updated_at=datetime.now()
            )

            duration = (datetime.now() - start_time).total_seconds()
            logger.info(f"Valuation completed for property {property_data.id} in {duration:.2f}s - Final Value: GHS {final_value:,.0f}")

            return valuation_result

        except Exception as error:
            logger.error(f"Valuation failed for property {property_data.id}: {str(error)}")
            raise error

    def _is_method_applicable(self, method: str, property_data: PropertyForValuation) -> bool:
        """Check if a valuation method is applicable to the property type"""
        property_type = property_data.property_type.value.lower()
        
        # Check direct mapping first
        if property_type in METHOD_APPLICABILITY:
            return method in METHOD_APPLICABILITY[property_type]
        
        # Check for partial matches
        for prop_type, methods in METHOD_APPLICABILITY.items():
            if prop_type in property_type or property_type in prop_type:
                return method in methods
        
        # Use default applicability
        return method in METHOD_APPLICABILITY["default"]

    def _calculate_weighted_value(self, method_results: List[MethodResult]) -> float:
        """Calculate weighted final value from all method results"""
        if not method_results:
            return 0
        
        # Normalize weights to sum to 1.0
        total_weight = sum(result.weight for result in method_results)
        if total_weight == 0:
            # Equal weighting if no weights specified
            weight_per_method = 1.0 / len(method_results)
            return sum(result.value * weight_per_method for result in method_results)
        
        # Weighted average
        weighted_sum = sum(result.value * result.weight for result in method_results)
        return weighted_sum / total_weight

    def _calculate_value_range(self, method_results: List[MethodResult], final_value: float) -> Dict[str, float]:
        """Calculate reasonable value range around final value"""
        if not method_results:
            return {"low": final_value * 0.9, "high": final_value * 1.1}
        
        values = [result.value for result in method_results if result.value > 0]
        if len(values) < 2:
            # Single method - use confidence-based range
            confidence = method_results[0].confidence
            range_factor = 0.15 - (confidence * 0.05)  # 10-15% range based on confidence
            return {
                "low": final_value * (1 - range_factor),
                "high": final_value * (1 + range_factor)
            }
        
        # Multiple methods - use actual range but cap at reasonable limits
        min_value = min(values)
        max_value = max(values)
        
        # Ensure range is not too narrow or too wide
        range_width = max_value - min_value
        if range_width < final_value * 0.1:  # Minimum 10% range
            range_factor = 0.05
            return {
                "low": final_value * (1 - range_factor),
                "high": final_value * (1 + range_factor)
            }
        elif range_width > final_value * 0.5:  # Maximum 50% range
            return {
                "low": final_value * 0.75,
                "high": final_value * 1.25
            }
        else:
            return {"low": min_value, "high": max_value}

    def _determine_confidence_level(self, confidence_score: float) -> ConfidenceLevel:
        """Determine confidence level from score"""
        if confidence_score >= 0.75:
            return ConfidenceLevel.HIGH
        elif confidence_score >= 0.55:
            return ConfidenceLevel.MEDIUM
        else:
            return ConfidenceLevel.LOW

    def _determine_primary_method(self, method_results: List[MethodResult]) -> str:
        """Determine the primary valuation method based on highest weight and confidence"""
        if not method_results:
            return "sales_comparison"  # Default
        
        # Find method with highest combined weight and confidence
        best_score = 0
        primary_method = method_results[0].method
        
        for result in method_results:
            # Combined score of weight and confidence
            combined_score = (result.weight * 0.6) + (result.confidence * 0.4)
            if combined_score > best_score:
                best_score = combined_score
                primary_method = result.method
        
        return primary_method

    def _get_method_value(self, method_results: List[MethodResult], method_name: str) -> Optional[float]:
        """Get value from specific method"""
        for result in method_results:
            if result.method == method_name:
                return round(result.value)
        return None

    def _get_method_confidence(self, method_results: List[MethodResult], method_name: str) -> Optional[float]:
        """Get confidence from specific method"""
        for result in method_results:
            if result.method == method_name:
                return round(result.confidence, 3)
        return None