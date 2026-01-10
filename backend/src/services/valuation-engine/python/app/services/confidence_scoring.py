"""
Confidence Scoring Service

Calculates confidence scores for valuations based on multiple factors.
Provides transparency in valuation reliability and identifies data gaps.

Key Features:
- Data completeness scoring
- Method reliability assessment
- Market data availability
- Comparable quality evaluation
- Overall confidence aggregation
"""

from typing import Dict, List, Optional, Tuple, Any
from decimal import Decimal
import asyncio
from datetime import datetime, timedelta
import logging
import statistics

from ..models.schemas import (
    PropertyForValuation, ValuationOptions, MethodResult, 
    RegionCode, PropertyType, ValuationResult
)
from ..adapters.market_data import MarketDataAdapter

logger = logging.getLogger(__name__)

# Weight factors for confidence components
CONFIDENCE_WEIGHTS = {
    "data_completeness": 0.25,
    "method_reliability": 0.25,
    "market_data_quality": 0.20,
    "comparable_quality": 0.15,
    "value_consistency": 0.15,
}

# Data completeness field weights
DATA_FIELD_WEIGHTS: Dict[str, float] = {
    "building_size_sqm": 0.15,
    "land_area_sqm": 0.10,
    "year_built": 0.12,
    "bedrooms": 0.08,
    "bathrooms": 0.05,
    "condition": 0.10,
    "property_type": 0.10,
    "region": 0.05,
    "address_city": 0.05,
    "price": 0.10,
    "amenities": 0.05,
    "features": 0.05,
}

# Method reliability scores by property type
METHOD_RELIABILITY: Dict[str, Dict[str, float]] = {
    "house": {
        "sales_comparison": 0.90,
        "cost_approach": 0.70,
        "income_approach": 0.50,
        "residual_method": 0.30,
        "profits_method": 0.10,
        "drc_method": 0.10,
    },
    "apartment": {
        "sales_comparison": 0.85,
        "cost_approach": 0.65,
        "income_approach": 0.60,
        "residual_method": 0.30,
        "profits_method": 0.10,
        "drc_method": 0.10,
    },
    "commercial": {
        "sales_comparison": 0.70,
        "cost_approach": 0.60,
        "income_approach": 0.85,
        "residual_method": 0.40,
        "profits_method": 0.30,
        "drc_method": 0.20,
    },
    "hotel": {
        "sales_comparison": 0.50,
        "cost_approach": 0.55,
        "income_approach": 0.75,
        "residual_method": 0.30,
        "profits_method": 0.85,
        "drc_method": 0.20,
    },
    "institutional": {
        "sales_comparison": 0.30,
        "cost_approach": 0.70,
        "income_approach": 0.20,
        "residual_method": 0.20,
        "profits_method": 0.10,
        "drc_method": 0.90,
    },
    "industrial": {
        "sales_comparison": 0.65,
        "cost_approach": 0.75,
        "income_approach": 0.70,
        "residual_method": 0.35,
        "profits_method": 0.15,
        "drc_method": 0.30,
    },
    "land": {
        "sales_comparison": 0.80,
        "cost_approach": 0.10,
        "income_approach": 0.30,
        "residual_method": 0.85,
        "profits_method": 0.10,
        "drc_method": 0.10,
    },
}

# Market data quality thresholds
MARKET_DATA_THRESHOLDS = {
    "excellent": {"comparables": 10, "recent_sales": 20, "market_activity": "high"},
    "good": {"comparables": 5, "recent_sales": 10, "market_activity": "moderate"},
    "fair": {"comparables": 3, "recent_sales": 5, "market_activity": "low"},
    "poor": {"comparables": 1, "recent_sales": 2, "market_activity": "very_low"},
}

# Value variance thresholds for consistency scoring
VARIANCE_THRESHOLDS = {
    "excellent": 0.10,  # <10% variance
    "good": 0.20,       # 10-20% variance
    "fair": 0.30,       # 20-30% variance
    "poor": 0.50,       # >30% variance
}


class ConfidenceComponents:
    """Confidence components data structure"""
    def __init__(self):
        self.data_completeness: float = 0
        self.method_reliability: float = 0
        self.market_data_quality: float = 0
        self.comparable_quality: float = 0
        self.value_consistency: float = 0


class DataGap:
    """Data gap data structure"""
    def __init__(self, field: str, impact: str, recommendation: str):
        self.field = field
        self.impact = impact  # 'high', 'medium', 'low'
        self.recommendation = recommendation


class ConfidenceAnalysis:
    """Confidence analysis data structure"""
    def __init__(self):
        self.overall_score: float = 0
        self.components: ConfidenceComponents = ConfidenceComponents()
        self.data_gaps: List[DataGap] = []
        self.recommendations: List[str] = []
        self.reliability_grade: str = ""


class ConfidenceScoringService:
    """Confidence Scoring Service"""

    def __init__(self, market_adapter: MarketDataAdapter):
        self.market_adapter = market_adapter

    async def calculate_confidence(
        self,
        property_data: PropertyForValuation,
        valuation_result: ValuationResult,
        method_results: List[MethodResult],
        comparables: List[Dict[str, Any]] = None
    ) -> ConfidenceAnalysis:
        """Calculate comprehensive confidence analysis"""
        start_time = datetime.now()

        logger.debug(f"Starting confidence calculation for property {property_data.id}")

        try:
            analysis = ConfidenceAnalysis()
            components = ConfidenceComponents()

            # 1. Calculate data completeness score
            components.data_completeness = self._calculate_data_completeness(property_data, analysis)

            # 2. Calculate method reliability score
            components.method_reliability = self._calculate_method_reliability(
                property_data, method_results
            )

            # 3. Calculate market data quality score
            components.market_data_quality = await self._calculate_market_data_quality(
                property_data, comparables
            )

            # 4. Calculate comparable quality score
            components.comparable_quality = self._calculate_comparable_quality(
                property_data, comparables or []
            )

            # 5. Calculate value consistency score
            components.value_consistency = self._calculate_value_consistency(method_results)

            # 6. Calculate overall confidence score
            analysis.overall_score = self._calculate_overall_confidence(components)

            # 7. Assign reliability grade
            analysis.reliability_grade = self._assign_reliability_grade(analysis.overall_score)

            # 8. Generate recommendations
            analysis.recommendations = self._generate_recommendations(analysis, property_data, method_results)

            analysis.components = components

            duration = (datetime.now() - start_time).total_seconds()
            logger.info(f"Confidence calculation completed for property {property_data.id} in {duration:.2f}s")

            return analysis

        except Exception as error:
            logger.error(f"Confidence calculation failed for property {property_data.id}: {str(error)}")
            raise error

    def _calculate_data_completeness(
        self, 
        property_data: PropertyForValuation, 
        analysis: ConfidenceAnalysis
    ) -> float:
        """Calculate data completeness score"""
        total_weight = 0
        achieved_weight = 0

        for field, weight in DATA_FIELD_WEIGHTS.items():
            total_weight += weight
            
            field_value = getattr(property_data, field, None)
            
            if field == "amenities" or field == "features":
                # Check if lists have content
                if field_value and len(field_value) > 0:
                    achieved_weight += weight
                else:
                    analysis.data_gaps.append(DataGap(
                        field=field,
                        impact="low",
                        recommendation=f"Add {field} information to improve data completeness"
                    ))
            
            elif field_value is not None:
                if isinstance(field_value, str) and field_value.strip():
                    achieved_weight += weight
                elif isinstance(field_value, (int, float)) and field_value > 0:
                    achieved_weight += weight
                elif field_value:  # Other truthy values
                    achieved_weight += weight
                else:
                    self._add_data_gap(analysis, field, weight)
            else:
                self._add_data_gap(analysis, field, weight)

        return achieved_weight / total_weight if total_weight > 0 else 0

    def _add_data_gap(self, analysis: ConfidenceAnalysis, field: str, weight: float):
        """Add data gap with appropriate impact level"""
        if weight >= 0.10:
            impact = "high"
            recommendation = f"Critical: {field} is required for accurate valuation"
        elif weight >= 0.05:
            impact = "medium"
            recommendation = f"Important: {field} would improve valuation accuracy"
        else:
            impact = "low"
            recommendation = f"Optional: {field} would enhance data completeness"
        
        analysis.data_gaps.append(DataGap(field, impact, recommendation))

    def _calculate_method_reliability(
        self, 
        property_data: PropertyForValuation, 
        method_results: List[MethodResult]
    ) -> float:
        """Calculate method reliability score based on methods used and property type"""
        property_type = property_data.property_type.value.lower()
        
        # Get reliability scores for this property type
        type_reliability = METHOD_RELIABILITY.get(property_type, METHOD_RELIABILITY["house"])
        
        total_weighted_reliability = 0
        total_weight = 0
        
        for method_result in method_results:
            method_name = method_result.method
            method_weight = method_result.weight
            method_reliability = type_reliability.get(method_name, 0.5)  # Default 0.5
            
            total_weighted_reliability += method_reliability * method_weight
            total_weight += method_weight
        
        return total_weighted_reliability / total_weight if total_weight > 0 else 0.5

    async def _calculate_market_data_quality(
        self, 
        property_data: PropertyForValuation, 
        comparables: Optional[List[Dict[str, Any]]]
    ) -> float:
        """Calculate market data quality score"""
        try:
            # If comparables not provided, try to fetch them
            if not comparables:
                comparables = await self.market_adapter.find_comparables(
                    property_data.latitude,
                    property_data.longitude,
                    5.0,  # 5km radius
                    property_data.property_type,
                    limit=20
                )

            num_comparables = len(comparables) if comparables else 0
            
            # Count recent sales (last 12 months)
            recent_sales = 0
            if comparables:
                cutoff_date = datetime.now() - timedelta(days=365)
                for comp in comparables:
                    sale_date = comp.get("sale_date")
                    if sale_date and isinstance(sale_date, datetime) and sale_date >= cutoff_date:
                        recent_sales += 1

            # Determine market data quality level
            if num_comparables >= MARKET_DATA_THRESHOLDS["excellent"]["comparables"]:
                quality_level = "excellent"
            elif num_comparables >= MARKET_DATA_THRESHOLDS["good"]["comparables"]:
                quality_level = "good"
            elif num_comparables >= MARKET_DATA_THRESHOLDS["fair"]["comparables"]:
                quality_level = "fair"
            else:
                quality_level = "poor"

            # Adjust based on recent sales
            recent_sales_threshold = MARKET_DATA_THRESHOLDS[quality_level]["recent_sales"]
            if recent_sales < recent_sales_threshold:
                # Downgrade quality level
                quality_levels = ["poor", "fair", "good", "excellent"]
                current_index = quality_levels.index(quality_level)
                if current_index > 0:
                    quality_level = quality_levels[current_index - 1]

            # Convert to score
            quality_scores = {
                "excellent": 0.90,
                "good": 0.75,
                "fair": 0.60,
                "poor": 0.40,
            }

            return quality_scores[quality_level]

        except Exception as e:
            logger.warning(f"Could not assess market data quality: {str(e)}")
            return 0.50  # Default score

    def _calculate_comparable_quality(
        self, 
        property_data: PropertyForValuation, 
        comparables: List[Dict[str, Any]]
    ) -> float:
        """Calculate comparable quality score"""
        if not comparables:
            return 0.0

        quality_scores = []
        
        for comp in comparables:
            score = 0
            factors = 0

            # 1. Location proximity (assume distance_km is available)
            distance = comp.get("distance_km", 10)
            if distance <= 1:
                score += 0.25
            elif distance <= 3:
                score += 0.20
            elif distance <= 5:
                score += 0.15
            else:
                score += 0.10
            factors += 0.25

            # 2. Property type match
            if comp.get("property_type") == property_data.property_type.value:
                score += 0.20
            factors += 0.20

            # 3. Size similarity (within 20%)
            comp_size = comp.get("building_size_sqm", 0)
            subject_size = property_data.building_size_sqm or property_data.built_area_sqm or 100
            
            if comp_size > 0:
                size_ratio = min(comp_size, subject_size) / max(comp_size, subject_size)
                if size_ratio >= 0.8:
                    score += 0.20
                elif size_ratio >= 0.6:
                    score += 0.15
                else:
                    score += 0.10
            factors += 0.20

            # 4. Age similarity
            comp_year = comp.get("year_built")
            subject_year = property_data.year_built
            
            if comp_year and subject_year:
                age_diff = abs(comp_year - subject_year)
                if age_diff <= 5:
                    score += 0.15
                elif age_diff <= 10:
                    score += 0.10
                else:
                    score += 0.05
            elif comp_year or subject_year:
                score += 0.05  # Partial credit
            factors += 0.15

            # 5. Data recency
            sale_date = comp.get("sale_date")
            if isinstance(sale_date, datetime):
                days_old = (datetime.now() - sale_date).days
                if days_old <= 90:
                    score += 0.20
                elif days_old <= 180:
                    score += 0.15
                elif days_old <= 365:
                    score += 0.10
                else:
                    score += 0.05
            factors += 0.20

            quality_scores.append(score / factors if factors > 0 else 0)

        return sum(quality_scores) / len(quality_scores) if quality_scores else 0

    def _calculate_value_consistency(self, method_results: List[MethodResult]) -> float:
        """Calculate value consistency score across methods"""
        if len(method_results) < 2:
            return 0.5  # Cannot assess consistency with fewer than 2 methods

        # Get values from methods with non-zero weights
        values = [result.value for result in method_results if result.weight > 0 and result.value > 0]
        
        if len(values) < 2:
            return 0.5

        # Calculate coefficient of variation (standard deviation / mean)
        mean_value = statistics.mean(values)
        if mean_value == 0:
            return 0.0

        std_dev = statistics.stdev(values) if len(values) > 1 else 0
        cv = std_dev / mean_value

        # Convert coefficient of variation to consistency score
        if cv <= VARIANCE_THRESHOLDS["excellent"]:
            return 0.90
        elif cv <= VARIANCE_THRESHOLDS["good"]:
            return 0.75
        elif cv <= VARIANCE_THRESHOLDS["fair"]:
            return 0.60
        else:
            return 0.40

    def _calculate_overall_confidence(self, components: ConfidenceComponents) -> float:
        """Calculate overall confidence score"""
        weighted_score = (
            components.data_completeness * CONFIDENCE_WEIGHTS["data_completeness"] +
            components.method_reliability * CONFIDENCE_WEIGHTS["method_reliability"] +
            components.market_data_quality * CONFIDENCE_WEIGHTS["market_data_quality"] +
            components.comparable_quality * CONFIDENCE_WEIGHTS["comparable_quality"] +
            components.value_consistency * CONFIDENCE_WEIGHTS["value_consistency"]
        )
        
        return min(1.0, max(0.0, weighted_score))

    def _assign_reliability_grade(self, overall_score: float) -> str:
        """Assign reliability grade based on overall score"""
        if overall_score >= 0.80:
            return "A - Very High"
        elif overall_score >= 0.70:
            return "B - High"
        elif overall_score >= 0.60:
            return "C - Medium"
        elif overall_score >= 0.50:
            return "D - Low"
        else:
            return "E - Very Low"

    def _generate_recommendations(
        self, 
        analysis: ConfidenceAnalysis, 
        property_data: PropertyForValuation, 
        method_results: List[MethodResult]
    ) -> List[str]:
        """Generate recommendations to improve confidence"""
        recommendations = []

        # Data completeness recommendations
        high_impact_gaps = [gap for gap in analysis.data_gaps if gap.impact == "high"]
        if high_impact_gaps:
            recommendations.append(
                f"Critical data missing: {', '.join([gap.field for gap in high_impact_gaps])}. "
                "Obtaining this data would significantly improve valuation accuracy."
            )

        # Market data recommendations
        if analysis.components.market_data_quality < 0.60:
            recommendations.append(
                "Limited market data available. Consider expanding search radius or "
                "seeking additional comparable sales from recent transactions."
            )

        # Method reliability recommendations
        if analysis.components.method_reliability < 0.70:
            property_type = property_data.property_type.value
            if property_type in ["commercial", "office", "retail"]:
                recommendations.append(
                    "For commercial properties, income approach data (rents, expenses) "
                    "would improve valuation reliability."
                )
            elif property_type in ["land", "residential_land"]:
                recommendations.append(
                    "For land valuations, development feasibility analysis would "
                    "strengthen the residual method approach."
                )

        # Value consistency recommendations
        if analysis.components.value_consistency < 0.60:
            recommendations.append(
                "Significant variation between valuation methods detected. "
                "Review method assumptions and consider additional data collection."
            )

        # Overall confidence recommendations
        if analysis.overall_score < 0.70:
            recommendations.append(
                "Overall confidence is below recommended levels. Consider obtaining "
                "additional property data or commissioning a professional inspection."
            )

        return recommendations