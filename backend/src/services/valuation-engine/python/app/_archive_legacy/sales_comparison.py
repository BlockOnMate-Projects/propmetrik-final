"""
Sales Comparison Approach
Pure sales comparison valuation - all data via adapters
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import date, timedelta
import logging
import numpy as np
from dataclasses import dataclass

from ..schemas import (
    Property, 
    ValuationMethod,
    ComparableSearch,
    ComparablePropertyAnalysis,
    PropertyAdjustment,
    AdjustmentType,
    SimilarityScore,
    ComparableSourceType,
    ValuationMethodResult
)
from ..adapters.data_hub_adapter import MarketDataAdapter
from ..utils.ghana_validation import GhanaMarketValidator


logger = logging.getLogger(__name__)


@dataclass
class AdjustmentCalculation:
    """Result of an adjustment calculation"""
    adjustment_amount: float
    adjustment_percentage: float
    confidence: float
    methodology: str
    assumptions: List[str]


class SalesComparisonApproach:
    """Pure sales comparison valuation - all data via adapters"""
    
    def __init__(self, market_data_adapter: MarketDataAdapter):
        self.market_data = market_data_adapter
        
        # Configuration - these could be moved to settings
        self.DEFAULT_MIN_COMPARABLES = 3
        self.DEFAULT_MAX_DISTANCE_KM = 5.0
        self.DEFAULT_MAX_AGE_DAYS = 365
        self.MIN_SIMILARITY_SCORE = 0.6
        
        # Adjustment configuration
        self.MAX_SINGLE_ADJUSTMENT_PCT = 0.50  # Maximum 50% adjustment for any single factor
        self.MAX_TOTAL_ADJUSTMENT_PCT = 1.00   # Maximum 100% total adjustment
        
        # Market data cache for current valuation
        self._current_market_stats = None
        self._annual_appreciation_rate = 0.08  # Default fallback
    
    async def value_property(
        self,
        target_property: Property,
        search_criteria: Optional[ComparableSearch] = None,
        valuation_date: date = None
    ) -> ValuationMethodResult:
        """Main valuation method - orchestrates but doesn't do I/O"""
        
        if valuation_date is None:
            valuation_date = date.today()
        
        logger.info(f"Starting sales comparison valuation for property {target_property.id}")
        
        # Fetch market statistics for data-driven appreciation rate
        try:
            period_end = valuation_date
            period_start = period_end - timedelta(days=365)
            self._current_market_stats = await self.market_data.get_market_statistics(
                region=target_property.location.region,
                property_type=target_property.property_type,
                period_start=period_start,
                period_end=period_end
            )
            if self._current_market_stats and self._current_market_stats.price_change_12m_pct is not None:
                self._annual_appreciation_rate = self._current_market_stats.price_change_12m_pct / 100.0
                logger.info(f"Using data-driven appreciation rate: {self._annual_appreciation_rate*100:.1f}%")
            else:
                self._annual_appreciation_rate = 0.08  # Fallback
                logger.info("Using default appreciation rate (8%) - market data not available")
        except Exception as e:
            logger.warning(f"Could not fetch market statistics, using default appreciation rate: {e}")
            self._annual_appreciation_rate = 0.08
        
        # Use provided search criteria or create default
        if search_criteria is None:
            search_criteria = ComparableSearch(
                target_property_id=target_property.id,
                region=target_property.location.region,
                property_type=target_property.property_type,
                max_distance_km=self.DEFAULT_MAX_DISTANCE_KM,
                max_age_days=self.DEFAULT_MAX_AGE_DAYS
            )
        
        # Fetch comparable properties
        comparable_properties = await self.market_data.get_comparable_properties(search_criteria)
        
        if len(comparable_properties) < self.DEFAULT_MIN_COMPARABLES:
            logger.warning(f"Only found {len(comparable_properties)} comparables, minimum {self.DEFAULT_MIN_COMPARABLES} recommended")
        
        # Analyze each comparable
        comparable_analyses = []
        for comp_property in comparable_properties:
            analysis = await self._analyze_comparable(target_property, comp_property, valuation_date)
            if analysis and analysis.similarity_score.overall_score >= self.MIN_SIMILARITY_SCORE:
                comparable_analyses.append(analysis)
        
        if not comparable_analyses:
            raise ValueError("No suitable comparable properties found for sales comparison approach")
        
        # Calculate weighted valuation
        estimated_value, confidence_score, methodology_notes = self._calculate_weighted_valuation(
            comparable_analyses
        )
        
        # NOTE: No regional multiplier is applied. The comparables are drawn from the
        # subject's own market, so their prices already embed the regional price level.
        # Multiplying by a blanket regional factor would double-count the region (RICS:
        # value is evidenced by the comparables, not re-scaled by an arbitrary factor).
        regional_multiplier = 1.0

        # Compile assumptions and limitations
        assumptions = self._compile_assumptions(target_property, comparable_analyses, valuation_date)
        limitations = self._compile_limitations(comparable_analyses)
        
        # Create result
        result = ValuationMethodResult(
            method=ValuationMethod.SALES_COMPARISON,
            estimated_value=estimated_value,
            confidence_score=confidence_score,
            weight_in_final_value=1.0,  # Will be set by calling service
            comparables_used=[],  # Convert analyses to simpler format
            adjustments_summary={
                "total_comparables_analyzed": len(comparable_analyses),
                "average_adjustment_pct": np.mean([abs(comp.total_adjustment_ghs / comp.original_sale_price_ghs) for comp in comparable_analyses]),
                "regional_multiplier": regional_multiplier
            },
            methodology_notes=methodology_notes,
            assumptions=assumptions,
            limitations=limitations
        )
        
        logger.info(f"Sales comparison valuation completed: GHS {estimated_value:,.0f} (confidence: {confidence_score:.2f})")
        return result
    
    async def _analyze_comparable(
        self,
        target_property: Property,
        comparable_property: Property,
        valuation_date: date
    ) -> Optional[ComparablePropertyAnalysis]:
        """Analyze a single comparable property"""
        
        try:
            # Calculate basic metrics
            if not comparable_property.location.coordinates or not target_property.location.coordinates:
                logger.warning(f"Missing coordinates for distance calculation")
                return None
            
            distance_km = self._calculate_distance(
                target_property.location.coordinates,
                comparable_property.location.coordinates
            )
            
            # Get sale information
            if not comparable_property.financials or not comparable_property.financials.current_price_ghs:
                logger.warning(f"Comparable {comparable_property.id} missing price information")
                return None
            
            sale_price = comparable_property.financials.current_price_ghs
            sale_date = comparable_property.financials.price_date or date.today()
            days_since_sale = (valuation_date - sale_date).days
            
            # Calculate similarity score
            similarity_score = self._calculate_similarity_score(target_property, comparable_property)
            
            # Calculate adjustments
            adjustments = self._calculate_adjustments(target_property, comparable_property, valuation_date)
            
            # Calculate total adjustment and adjusted value
            total_adjustment = sum(adj.adjustment_amount for adj in adjustments)
            adjusted_value = sale_price + total_adjustment
            
            # Calculate weight in valuation based on similarity, distance, and age
            weight = self._calculate_comparable_weight(
                similarity_score.overall_score,
                distance_km,
                days_since_sale,
                comparable_property.data_quality.data_quality_score
            )
            
            analysis = ComparablePropertyAnalysis(
                comparable_property=comparable_property,
                distance_km=distance_km,
                days_since_sale=days_since_sale,
                sale_date=sale_date,
                original_sale_price_ghs=sale_price,
                similarity_score=similarity_score,
                adjustments=[
                    PropertyAdjustment(
                        adjustment_type=AdjustmentType(adj_calc.methodology.lower().replace(' ', '_')),
                        description=adj_calc.methodology,
                        adjustment_amount_ghs=adj_calc.adjustment_amount,
                        adjustment_percentage=adj_calc.adjustment_percentage,
                        confidence=adj_calc.confidence,
                        methodology=adj_calc.methodology,
                        assumptions=adj_calc.assumptions
                    ) for adj_calc in adjustments
                ],
                total_adjustment_ghs=total_adjustment,
                adjusted_value_ghs=adjusted_value,
                data_source=ComparableSourceType.DATABASE,  # Would determine from property metadata
                source_reliability=comparable_property.data_quality.source_reliability_score,
                weight_in_valuation=weight
            )
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing comparable {comparable_property.id}: {str(e)}")
            return None
    
    def _calculate_distance(self, coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
        """Calculate distance between two coordinates using Haversine formula"""
        from math import radians, cos, sin, asin, sqrt
        
        lat1, lon1 = coord1
        lat2, lon2 = coord2
        
        # Convert to radians
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        
        # Haversine formula
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a))
        
        # Radius of earth in kilometers
        r = 6371
        return c * r
    
    def _calculate_similarity_score(self, target: Property, comparable: Property) -> SimilarityScore:
        """Calculate similarity score between target and comparable property"""
        
        # Location similarity (same region/district/neighborhood)
        location_score = 1.0  # Same region (filtered in query)
        if target.location.district == comparable.location.district:
            location_score = 1.0
        elif target.location.neighborhood and comparable.location.neighborhood:
            if target.location.neighborhood == comparable.location.neighborhood:
                location_score = 1.0
            else:
                location_score = 0.8
        else:
            location_score = 0.7
        
        # Size similarity
        size_score = 1.0
        if (target.specifications.built_area_sqm is not None and 
            comparable.specifications.built_area_sqm is not None):
            size_diff_pct = abs(target.specifications.built_area_sqm - comparable.specifications.built_area_sqm) / target.specifications.built_area_sqm
            size_score = max(0.0, 1.0 - size_diff_pct)
        
        # Age similarity
        age_score = 1.0
        if (target.specifications.year_built is not None and 
            comparable.specifications.year_built is not None):
            age_diff = abs(target.specifications.year_built - comparable.specifications.year_built)
            age_score = max(0.0, 1.0 - (age_diff / 20.0))  # 20-year reference
        
        # Type similarity (already filtered, so 1.0)
        type_score = 1.0
        
        # Condition similarity
        condition_score = 0.8  # Default if not available
        if (target.specifications.condition is not None and 
            comparable.specifications.condition is not None):
            if target.specifications.condition == comparable.specifications.condition:
                condition_score = 1.0
            else:
                # Map conditions to numeric scale
                condition_values = {
                    'new': 5, 'excellent': 4, 'good': 3, 'fair': 2, 'poor': 1, 'renovation_needed': 0
                }
                target_val = condition_values.get(target.specifications.condition.value, 3)
                comp_val = condition_values.get(comparable.specifications.condition.value, 3)
                condition_score = max(0.0, 1.0 - abs(target_val - comp_val) / 5.0)
        
        # Amenities similarity
        amenities_score = self._calculate_amenities_similarity(target, comparable)
        
        # Weighted overall score
        weights = {
            'location': 0.25,
            'size': 0.25,
            'age': 0.15,
            'type': 0.10,
            'condition': 0.15,
            'amenities': 0.10
        }
        
        overall_score = (
            location_score * weights['location'] +
            size_score * weights['size'] +
            age_score * weights['age'] +
            type_score * weights['type'] +
            condition_score * weights['condition'] +
            amenities_score * weights['amenities']
        )
        
        return SimilarityScore(
            overall_score=overall_score,
            location_score=location_score,
            size_score=size_score,
            age_score=age_score,
            type_score=type_score,
            condition_score=condition_score,
            amenities_score=amenities_score,
            weights=weights
        )
    
    def _calculate_amenities_similarity(self, target: Property, comparable: Property) -> float:
        """Calculate similarity score for amenities"""
        
        amenities_to_check = [
            'has_swimming_pool', 'has_garden', 'has_security',
            'has_generator', 'has_borehole', 'has_air_conditioning'
        ]
        
        matches = 0
        total = 0
        
        for amenity in amenities_to_check:
            target_val = getattr(target.specifications, amenity, None)
            comp_val = getattr(comparable.specifications, amenity, None)
            
            if target_val is not None and comp_val is not None:
                total += 1
                if target_val == comp_val:
                    matches += 1
        
        return matches / total if total > 0 else 0.8  # Default if no amenity data
    
    def _calculate_adjustments(
        self,
        target: Property,
        comparable: Property,
        valuation_date: date
    ) -> List[AdjustmentCalculation]:
        """Calculate all adjustments for a comparable property"""
        
        adjustments = []
        
        # Size adjustment
        size_adj = self._calculate_size_adjustment(target, comparable)
        if size_adj:
            adjustments.append(size_adj)
        
        # Age adjustment
        age_adj = self._calculate_age_adjustment(target, comparable)
        if age_adj:
            adjustments.append(age_adj)
        
        # Condition adjustment
        condition_adj = self._calculate_condition_adjustment(target, comparable)
        if condition_adj:
            adjustments.append(condition_adj)
        
        # Location adjustment (neighborhood-level)
        location_adj = self._calculate_location_adjustment(target, comparable)
        if location_adj:
            adjustments.append(location_adj)
        
        # Time adjustment (market changes since sale)
        time_adj = self._calculate_time_adjustment(comparable, valuation_date)
        if time_adj:
            adjustments.append(time_adj)
        
        # Amenities adjustment
        amenities_adj = self._calculate_amenities_adjustment(target, comparable)
        if amenities_adj:
            adjustments.append(amenities_adj)
        
        # Land tenure adjustment
        tenure_adj = self._calculate_land_tenure_adjustment(target, comparable)
        if tenure_adj:
            adjustments.append(tenure_adj)
        
        # Quality rating adjustment (RICS-required building feature)
        quality_adj = self._calculate_quality_adjustment(target, comparable)
        if quality_adj:
            adjustments.append(quality_adj)
        
        # Floor level adjustment (for apartments - RICS-required)
        floor_adj = self._calculate_floor_level_adjustment(target, comparable)
        if floor_adj:
            adjustments.append(floor_adj)
        
        # View quality adjustment (RICS-required building feature)
        view_adj = self._calculate_view_adjustment(target, comparable)
        if view_adj:
            adjustments.append(view_adj)
        
        # Parking adjustment (RICS-required building feature)
        parking_adj = self._calculate_parking_adjustment(target, comparable)
        if parking_adj:
            adjustments.append(parking_adj)
        
        return adjustments
    
    def _calculate_size_adjustment(self, target: Property, comparable: Property) -> Optional[AdjustmentCalculation]:
        """Calculate size-based adjustment"""
        
        if (target.specifications.built_area_sqm is None or 
            comparable.specifications.built_area_sqm is None or
            not comparable.financials or
            comparable.financials.current_price_ghs is None):
            return None
        
        target_size = target.specifications.built_area_sqm
        comp_size = comparable.specifications.built_area_sqm
        comp_price = comparable.financials.current_price_ghs
        
        if comp_size == 0:
            return None
        
        # Calculate price per sqm for comparable
        price_per_sqm = comp_price / comp_size
        
        # Size difference
        size_diff = target_size - comp_size
        
        # Adjustment calculation
        adjustment_amount = size_diff * price_per_sqm
        adjustment_percentage = adjustment_amount / comp_price
        
        # Cap the adjustment to prevent unrealistic values
        if abs(adjustment_percentage) > self.MAX_SINGLE_ADJUSTMENT_PCT:
            adjustment_amount = comp_price * self.MAX_SINGLE_ADJUSTMENT_PCT * (1 if adjustment_amount > 0 else -1)
            adjustment_percentage = self.MAX_SINGLE_ADJUSTMENT_PCT * (1 if adjustment_amount > 0 else -1)
        
        return AdjustmentCalculation(
            adjustment_amount=adjustment_amount,
            adjustment_percentage=adjustment_percentage,
            confidence=0.85,  # High confidence for size adjustments
            methodology="Size Adjustment",
            assumptions=[
                f"Price per sqm: GHS {price_per_sqm:.0f}",
                f"Size difference: {size_diff:.0f} sqm",
                "Assumes linear relationship between size and value"
            ]
        )
    
    def _calculate_age_adjustment(self, target: Property, comparable: Property) -> Optional[AdjustmentCalculation]:
        """Calculate age-based adjustment"""
        
        if (target.specifications.year_built is None or 
            comparable.specifications.year_built is None or
            not comparable.financials or
            comparable.financials.current_price_ghs is None):
            return None
        
        target_age = date.today().year - target.specifications.year_built
        comp_age = date.today().year - comparable.specifications.year_built
        age_diff = comp_age - target_age  # Positive if comparable is older
        
        if abs(age_diff) < 2:  # No adjustment for small age differences
            return None
        
        # Depreciation rate: roughly 1% per year for first 10 years, 0.5% thereafter
        annual_depreciation_rate = 0.01 if abs(age_diff) <= 10 else 0.005
        depreciation_factor = age_diff * annual_depreciation_rate
        
        comp_price = comparable.financials.current_price_ghs
        adjustment_amount = comp_price * depreciation_factor
        
        return AdjustmentCalculation(
            adjustment_amount=adjustment_amount,
            adjustment_percentage=depreciation_factor,
            confidence=0.7,
            methodology="Age Adjustment",
            assumptions=[
                f"Age difference: {age_diff} years",
                f"Annual depreciation rate: {annual_depreciation_rate*100:.1f}%",
                "Assumes consistent depreciation over time"
            ]
        )
    
    def _calculate_condition_adjustment(self, target: Property, comparable: Property) -> Optional[AdjustmentCalculation]:
        """Calculate condition-based adjustment"""
        
        if (target.specifications.condition is None or 
            comparable.specifications.condition is None or
            not comparable.financials or
            comparable.financials.current_price_ghs is None):
            return None
        
        # Map conditions to adjustment factors
        condition_factors = {
            'new': 1.15,
            'excellent': 1.10,
            'good': 1.00,
            'fair': 0.95,
            'poor': 0.85,
            'renovation_needed': 0.75
        }
        
        target_factor = condition_factors.get(target.specifications.condition.value, 1.0)
        comp_factor = condition_factors.get(comparable.specifications.condition.value, 1.0)
        
        if target_factor == comp_factor:
            return None
        
        comp_price = comparable.financials.current_price_ghs
        # Adjustment to bring comparable to target condition level
        adjustment_factor = (target_factor / comp_factor) - 1.0
        adjustment_amount = comp_price * adjustment_factor
        
        return AdjustmentCalculation(
            adjustment_amount=adjustment_amount,
            adjustment_percentage=adjustment_factor,
            confidence=0.75,
            methodology="Condition Adjustment",
            assumptions=[
                f"Target condition: {target.specifications.condition.value}",
                f"Comparable condition: {comparable.specifications.condition.value}",
                "Based on typical renovation/maintenance costs"
            ]
        )
    
    def _calculate_location_adjustment(self, target: Property, comparable: Property) -> Optional[AdjustmentCalculation]:
        """Calculate location-based adjustment (neighborhood premium/discount)"""
        
        # This is a simplified version - in reality would use market data
        # about neighborhood premiums/discounts
        
        target_neighborhood = target.location.neighborhood
        comp_neighborhood = comparable.location.neighborhood
        
        if not target_neighborhood or not comp_neighborhood or target_neighborhood == comp_neighborhood:
            return None
        
        # Ghana-specific neighborhood premiums (very rough approximation)
        # This should come from market data adapter in real implementation
        accra_premiums = {
            'East Legon': 1.20,
            'Airport Residential': 1.25,
            'Cantonments': 1.15,
            'Dzorwulu': 1.10,
            'Roman Ridge': 1.10,
            'Osu': 1.05,
            'Labone': 1.05,
            'Dansoman': 0.90,
            'Tema': 0.95,
            'Madina': 0.85,
            'Adenta': 0.85
        }
        
        if target.location.region.value == 'greater_accra':
            target_premium = accra_premiums.get(target_neighborhood, 1.0)
            comp_premium = accra_premiums.get(comp_neighborhood, 1.0)
            
            if target_premium != comp_premium:
                adjustment_factor = (target_premium / comp_premium) - 1.0
                comp_price = comparable.financials.current_price_ghs if comparable.financials else 0
                adjustment_amount = comp_price * adjustment_factor
                
                return AdjustmentCalculation(
                    adjustment_amount=adjustment_amount,
                    adjustment_percentage=adjustment_factor,
                    confidence=0.6,  # Lower confidence due to rough estimates
                    methodology="Location Adjustment",
                    assumptions=[
                        f"Target neighborhood premium: {target_premium:.2f}",
                        f"Comparable neighborhood premium: {comp_premium:.2f}",
                        "Based on historical market premiums"
                    ]
                )
        
        return None
    
    def _calculate_time_adjustment(self, comparable: Property, valuation_date: date) -> Optional[AdjustmentCalculation]:
        """Calculate time-based market adjustment using data-driven appreciation rate"""
        
        if not comparable.financials or not comparable.financials.price_date:
            return None
        
        sale_date = comparable.financials.price_date
        months_elapsed = (valuation_date - sale_date).days / 30.44  # Average days per month
        
        if months_elapsed < 3:  # No adjustment for recent sales
            return None
        
        # Use data-driven appreciation rate (fetched from market statistics)
        annual_appreciation_rate = self._annual_appreciation_rate
        monthly_rate = annual_appreciation_rate / 12
        
        time_factor = monthly_rate * months_elapsed
        comp_price = comparable.financials.current_price_ghs
        adjustment_amount = comp_price * time_factor
        
        # Determine data source for transparency
        data_source = "market statistics (data-driven)" if self._current_market_stats else "default estimate"
        
        return AdjustmentCalculation(
            adjustment_amount=adjustment_amount,
            adjustment_percentage=time_factor,
            confidence=0.75 if self._current_market_stats else 0.55,  # Higher confidence with real data
            methodology="Time Adjustment",
            assumptions=[
                f"Months since sale: {months_elapsed:.1f}",
                f"Annual appreciation rate: {annual_appreciation_rate*100:.1f}%",
                f"Rate source: {data_source}"
            ]
        )
    
    def _calculate_amenities_adjustment(self, target: Property, comparable: Property) -> Optional[AdjustmentCalculation]:
        """Calculate amenities-based adjustment"""
        
        amenity_values = {
            'has_swimming_pool': 25000,
            'has_garden': 10000,
            'has_security': 15000,
            'has_generator': 8000,
            'has_borehole': 12000,
            'has_air_conditioning': 5000
        }
        
        total_adjustment = 0.0
        adjustments_made = []
        
        for amenity, value in amenity_values.items():
            target_has = getattr(target.specifications, amenity, False)
            comp_has = getattr(comparable.specifications, amenity, False)
            
            if target_has and not comp_has:
                total_adjustment += value
                adjustments_made.append(f"+{amenity}: +GHS {value:,}")
            elif not target_has and comp_has:
                total_adjustment -= value
                adjustments_made.append(f"-{amenity}: -GHS {value:,}")
        
        if total_adjustment == 0:
            return None
        
        comp_price = comparable.financials.current_price_ghs if comparable.financials else 1
        adjustment_percentage = total_adjustment / comp_price if comp_price > 0 else 0
        
        return AdjustmentCalculation(
            adjustment_amount=total_adjustment,
            adjustment_percentage=adjustment_percentage,
            confidence=0.7,
            methodology="Amenities Adjustment",
            assumptions=adjustments_made
        )
    
    def _calculate_land_tenure_adjustment(self, target: Property, comparable: Property) -> Optional[AdjustmentCalculation]:
        """Calculate land tenure-based adjustment"""
        
        if (target.specifications.land_tenure is None or 
            comparable.specifications.land_tenure is None):
            return None
        
        # Land tenure adjustment factors (rough estimates)
        tenure_factors = {
            'freehold': 1.10,
            'leasehold': 1.00,
            'stool_land': 0.95,
            'family_land': 0.90,
            'government_land': 0.85
        }
        
        target_factor = tenure_factors.get(target.specifications.land_tenure.value, 1.0)
        comp_factor = tenure_factors.get(comparable.specifications.land_tenure.value, 1.0)
        
        if target_factor == comp_factor:
            return None
        
        adjustment_factor = (target_factor / comp_factor) - 1.0
        comp_price = comparable.financials.current_price_ghs if comparable.financials else 0
        adjustment_amount = comp_price * adjustment_factor
        
        return AdjustmentCalculation(
            adjustment_amount=adjustment_amount,
            adjustment_percentage=adjustment_factor,
            confidence=0.8,
            methodology="Land Tenure Adjustment",
            assumptions=[
                f"Target tenure: {target.specifications.land_tenure.value}",
                f"Comparable tenure: {comparable.specifications.land_tenure.value}",
                "Based on typical tenure premiums/discounts"
            ]
        )
    
    def _calculate_quality_adjustment(self, target: Property, comparable: Property) -> Optional[AdjustmentCalculation]:
        """Calculate construction quality-based adjustment (RICS requirement)"""
        
        target_quality = getattr(target.specifications, 'quality_rating', None)
        comp_quality = getattr(comparable.specifications, 'quality_rating', None)
        
        if target_quality is None or comp_quality is None:
            return None
        
        # Quality rating adjustment factors
        quality_factors = {
            'luxury': 1.25,
            'high': 1.15,
            'standard': 1.00,
            'basic': 0.85,
            'substandard': 0.70
        }
        
        target_factor = quality_factors.get(str(target_quality).lower(), 1.0)
        comp_factor = quality_factors.get(str(comp_quality).lower(), 1.0)
        
        if target_factor == comp_factor:
            return None
        
        adjustment_factor = (target_factor / comp_factor) - 1.0
        comp_price = comparable.financials.current_price_ghs if comparable.financials else 0
        adjustment_amount = comp_price * adjustment_factor
        
        return AdjustmentCalculation(
            adjustment_amount=adjustment_amount,
            adjustment_percentage=adjustment_factor,
            confidence=0.75,
            methodology="Quality Rating Adjustment",
            assumptions=[
                f"Target quality: {target_quality}",
                f"Comparable quality: {comp_quality}",
                "Based on construction quality premium/discount"
            ]
        )
    
    def _calculate_floor_level_adjustment(self, target: Property, comparable: Property) -> Optional[AdjustmentCalculation]:
        """Calculate floor level-based adjustment for apartments (RICS requirement)"""
        
        # Only apply to apartments
        if target.property_type.value not in ['apartment', 'flat', 'condo']:
            return None
        
        target_floor = getattr(target.specifications, 'floor_number', None)
        comp_floor = getattr(comparable.specifications, 'floor_number', None)
        
        if target_floor is None or comp_floor is None:
            return None
        
        # Floor level adjustment: ~2% per floor difference
        floor_diff = target_floor - comp_floor
        adjustment_percent = floor_diff * 0.02  # 2% per floor
        
        # Cap at ±15% maximum
        adjustment_percent = max(-0.15, min(0.15, adjustment_percent))
        
        if abs(adjustment_percent) < 0.01:  # Less than 1% - no adjustment
            return None
        
        comp_price = comparable.financials.current_price_ghs if comparable.financials else 0
        adjustment_amount = comp_price * adjustment_percent
        
        return AdjustmentCalculation(
            adjustment_amount=adjustment_amount,
            adjustment_percentage=adjustment_percent,
            confidence=0.70,
            methodology="Floor Level Adjustment",
            assumptions=[
                f"Target floor: {target_floor}",
                f"Comparable floor: {comp_floor}",
                "Premium of ~2% per floor (higher floors preferred)"
            ]
        )
    
    def _calculate_view_adjustment(self, target: Property, comparable: Property) -> Optional[AdjustmentCalculation]:
        """Calculate view quality-based adjustment (RICS requirement)"""
        
        target_view = getattr(target.specifications, 'view_quality', None) or getattr(target.specifications, 'view', None)
        comp_view = getattr(comparable.specifications, 'view_quality', None) or getattr(comparable.specifications, 'view', None)
        
        if target_view is None or comp_view is None:
            return None
        
        # View quality adjustment factors
        view_factors = {
            'panoramic': 1.12,
            'ocean': 1.10,
            'sea': 1.10,
            'water': 1.08,
            'city': 1.05,
            'garden': 1.03,
            'park': 1.03,
            'standard': 1.00,
            'limited': 0.95,
            'obstructed': 0.90,
            'none': 0.90
        }
        
        target_factor = view_factors.get(str(target_view).lower(), 1.0)
        comp_factor = view_factors.get(str(comp_view).lower(), 1.0)
        
        if target_factor == comp_factor:
            return None
        
        adjustment_factor = (target_factor / comp_factor) - 1.0
        comp_price = comparable.financials.current_price_ghs if comparable.financials else 0
        adjustment_amount = comp_price * adjustment_factor
        
        return AdjustmentCalculation(
            adjustment_amount=adjustment_amount,
            adjustment_percentage=adjustment_factor,
            confidence=0.65,
            methodology="View Quality Adjustment",
            assumptions=[
                f"Target view: {target_view}",
                f"Comparable view: {comp_view}",
                "Based on view quality premium/discount"
            ]
        )
    
    def _calculate_parking_adjustment(self, target: Property, comparable: Property) -> Optional[AdjustmentCalculation]:
        """Calculate parking-based adjustment (RICS requirement)"""
        
        target_parking = getattr(target.specifications, 'parking_spaces', 0) or 0
        comp_parking = getattr(comparable.specifications, 'parking_spaces', 0) or 0
        
        parking_diff = target_parking - comp_parking
        
        if parking_diff == 0:
            return None
        
        # Value per parking space (Ghana market estimate)
        # Covered parking: ~GHS 15,000-25,000, Open: ~GHS 8,000-12,000
        value_per_space = 15000  # Average estimate
        
        adjustment_amount = parking_diff * value_per_space
        comp_price = comparable.financials.current_price_ghs if comparable.financials else 1
        adjustment_percentage = adjustment_amount / comp_price if comp_price > 0 else 0
        
        return AdjustmentCalculation(
            adjustment_amount=adjustment_amount,
            adjustment_percentage=adjustment_percentage,
            confidence=0.75,
            methodology="Parking Adjustment",
            assumptions=[
                f"Target parking spaces: {target_parking}",
                f"Comparable parking spaces: {comp_parking}",
                f"Value per parking space: GHS {value_per_space:,}"
            ]
        )
    
    def _calculate_comparable_weight(
        self,
        similarity_score: float,
        distance_km: float,
        age_days: int,
        data_quality: float
    ) -> float:
        """Calculate weight of comparable in final valuation"""
        
        # Distance weight (closer is better)
        distance_weight = max(0.1, 1.0 - (distance_km / 10.0))  # 10km reference
        
        # Age weight (newer sales are better)
        age_weight = max(0.1, 1.0 - (age_days / 365.0))  # 1 year reference
        
        # Combined weight
        weight = (
            similarity_score * 0.4 +
            distance_weight * 0.25 +
            age_weight * 0.25 +
            data_quality * 0.10
        )
        
        return max(0.05, min(1.0, weight))  # Clamp between 5% and 100%
    
    def _calculate_weighted_valuation(
        self,
        comparable_analyses: List[ComparablePropertyAnalysis]
    ) -> Tuple[float, float, str]:
        """Calculate weighted valuation from comparable analyses"""
        
        if not comparable_analyses:
            raise ValueError("No comparable analyses provided")
        
        # Sort by weight (highest first)
        sorted_comparables = sorted(comparable_analyses, key=lambda x: x.weight_in_valuation, reverse=True)
        
        # Calculate weighted average
        total_weighted_value = 0.0
        total_weight = 0.0
        
        for analysis in sorted_comparables:
            total_weighted_value += analysis.adjusted_value_ghs * analysis.weight_in_valuation
            total_weight += analysis.weight_in_valuation
        
        if total_weight == 0:
            raise ValueError("Total weight is zero - cannot calculate valuation")
        
        estimated_value = total_weighted_value / total_weight
        
        # Calculate confidence score based on:
        # - Number of comparables
        # - Average similarity score
        # - Data quality
        # - Spread of adjusted values
        
        num_comparables = len(comparable_analyses)
        avg_similarity = np.mean([comp.similarity_score.overall_score for comp in comparable_analyses])
        avg_data_quality = np.mean([comp.source_reliability for comp in comparable_analyses])
        
        # Value spread (coefficient of variation)
        adjusted_values = [comp.adjusted_value_ghs for comp in comparable_analyses]
        value_std = np.std(adjusted_values)
        value_mean = np.mean(adjusted_values)
        coefficient_of_variation = value_std / value_mean if value_mean > 0 else 1.0
        
        # Confidence calculation
        num_comp_factor = min(1.0, num_comparables / 5.0)  # Up to 5 comparables for full score
        similarity_factor = avg_similarity
        quality_factor = avg_data_quality
        consistency_factor = max(0.1, 1.0 - coefficient_of_variation)  # Lower is better for CoV
        
        confidence_score = (
            num_comp_factor * 0.25 +
            similarity_factor * 0.35 +
            quality_factor * 0.25 +
            consistency_factor * 0.15
        )
        
        confidence_score = max(0.1, min(1.0, confidence_score))
        
        # Methodology notes
        methodology_notes = f"""
        Sales comparison approach using {num_comparables} comparable properties.
        Average similarity score: {avg_similarity:.2f}
        Average distance: {np.mean([comp.distance_km for comp in comparable_analyses]):.1f} km
        Average days since sale: {np.mean([comp.days_since_sale for comp in comparable_analyses]):.0f} days
        Value range: GHS {min(adjusted_values):,.0f} - GHS {max(adjusted_values):,.0f}
        """
        
        return estimated_value, confidence_score, methodology_notes.strip()
    
    def _compile_assumptions(
        self,
        target_property: Property,
        comparable_analyses: List[ComparablePropertyAnalysis],
        valuation_date: date
    ) -> List[str]:
        """Compile list of valuation assumptions"""
        
        assumptions = [
            f"Valuation date: {valuation_date}",
            f"Property is in {target_property.specifications.condition.value if target_property.specifications.condition else 'assumed good'} condition",
            "Market conditions are stable",
            f"Based on {len(comparable_analyses)} comparable sales",
            "No major defects or issues affecting value",
            "Property has clear title and proper documentation",
            "Economic conditions remain similar to comparable sale dates"
        ]
        
        # Add regional assumptions
        regional_multiplier = GhanaMarketValidator.get_regional_multiplier(target_property.location.region)
        assumptions.append(f"Regional pricing factor applied: {regional_multiplier:.2f}x")
        
        return assumptions
    
    def _compile_limitations(self, comparable_analyses: List[ComparablePropertyAnalysis]) -> List[str]:
        """Compile list of valuation limitations"""
        
        limitations = [
            "Valuation based on available market data at time of analysis",
            "Property condition assumed based on available information",
            "Market conditions may change affecting actual sale price",
            "Individual buyer preferences may vary from market average"
        ]
        
        # Add specific limitations based on analysis
        if len(comparable_analyses) < 5:
            limitations.append(f"Limited comparable data ({len(comparable_analyses)} properties)")
        
        avg_distance = np.mean([comp.distance_km for comp in comparable_analyses])
        if avg_distance > 3.0:
            limitations.append(f"Comparables are relatively distant (avg: {avg_distance:.1f}km)")
        
        avg_age = np.mean([comp.days_since_sale for comp in comparable_analyses])
        if avg_age > 180:
            limitations.append(f"Comparable sales are relatively old (avg: {avg_age:.0f} days)")
        
        return limitations