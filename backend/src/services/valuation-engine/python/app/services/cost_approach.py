"""
Cost Approach Service
Pure cost approach valuation - all data via adapters
"""

from typing import Optional, Dict, List, Any
from datetime import date
import logging
from dataclasses import dataclass

from ..schemas import (
    Property,
    ValuationMethod,
    ValuationMethodResult,
    ConstructionCosts,
    GhanaRegion,
    PropertyType,
    PropertyCondition
)
from ..adapters.data_hub_adapter import MarketDataAdapter
from ..utils.ghana_validation import GhanaMarketValidator


logger = logging.getLogger(__name__)


@dataclass
class CostComponents:
    """Components of cost approach calculation"""
    land_value: float
    construction_cost_new: float
    depreciation: float
    depreciated_construction_cost: float
    total_estimated_value: float
    
    # Supporting details
    land_value_per_sqm: float
    construction_cost_per_sqm: float
    age_depreciation_pct: float
    condition_adjustment_pct: float
    functional_obsolescence_pct: float
    external_obsolescence_pct: float


class CostApproach:
    """Cost approach valuation service"""
    
    def __init__(self, market_data_adapter: MarketDataAdapter):
        self.market_data = market_data_adapter
        
        # Default land value ratios by region (of total property value)
        self.DEFAULT_LAND_VALUE_RATIOS = {
            GhanaRegion.GREATER_ACCRA: 0.40,  # Land is expensive in Accra
            GhanaRegion.KUMASI_METRO: 0.30,
            GhanaRegion.EASTERN: 0.25,
            GhanaRegion.WESTERN_CLUSTER: 0.25,
            GhanaRegion.NORTHERN_CLUSTER: 0.20
        }
        
        # Depreciation rates by age
        self.DEPRECIATION_SCHEDULE = {
            # Age range (years): annual depreciation rate
            (0, 5): 0.02,    # 2% per year for first 5 years
            (6, 15): 0.025,  # 2.5% per year for years 6-15
            (16, 30): 0.03,  # 3% per year for years 16-30
            (31, 50): 0.02,  # 2% per year for years 31-50
            (51, 100): 0.01  # 1% per year for years 51+
        }
        
        # Maximum depreciation by property type
        self.MAX_DEPRECIATION = {
            PropertyType.RESIDENTIAL_HOUSE: 0.80,     # Max 80% depreciation
            PropertyType.RESIDENTIAL_APARTMENT: 0.75,
            PropertyType.COMMERCIAL_OFFICE: 0.85,
            PropertyType.INDUSTRIAL_WAREHOUSE: 0.90,
            PropertyType.LAND_RESIDENTIAL: 0.0        # Land doesn't depreciate
        }
    
    async def value_property(
        self,
        target_property: Property,
        valuation_date: date = None
    ) -> ValuationMethodResult:
        """Main cost approach valuation method"""
        
        if valuation_date is None:
            valuation_date = date.today()
        
        logger.info(f"Starting cost approach valuation for property {target_property.id}")
        
        # Check if property is suitable for cost approach
        if not self._is_suitable_for_cost_approach(target_property):
            raise ValueError("Property not suitable for cost approach valuation")
        
        # Get construction costs
        construction_costs = await self.market_data.get_construction_costs(
            target_property.location.region,
            target_property.property_type,
            valuation_date
        )
        
        if not construction_costs:
            logger.warning("No construction cost data available, using estimates")
            construction_costs = self._estimate_construction_costs(
                target_property.location.region,
                target_property.property_type
            )
        
        # Calculate cost components
        cost_components = self._calculate_cost_components(
            target_property,
            construction_costs,
            valuation_date
        )
        
        # Apply regional factors
        regional_multiplier = GhanaMarketValidator.get_regional_multiplier(
            target_property.location.region
        )
        estimated_value = cost_components.total_estimated_value * regional_multiplier
        
        # Calculate confidence score
        confidence_score = self._calculate_confidence_score(
            target_property,
            construction_costs,
            cost_components
        )
        
        # Compile methodology notes
        methodology_notes = self._compile_methodology_notes(cost_components, regional_multiplier)
        
        # Compile assumptions and limitations
        assumptions = self._compile_assumptions(target_property, construction_costs, valuation_date)
        limitations = self._compile_limitations(target_property, construction_costs)
        
        result = ValuationMethodResult(
            method=ValuationMethod.COST_APPROACH,
            estimated_value=estimated_value,
            confidence_score=confidence_score,
            weight_in_final_value=1.0,  # Will be set by calling service
            adjustments_summary={
                "land_value": cost_components.land_value,
                "construction_cost_new": cost_components.construction_cost_new,
                "total_depreciation": cost_components.depreciation,
                "depreciated_construction_cost": cost_components.depreciated_construction_cost,
                "regional_multiplier": regional_multiplier,
                "land_value_per_sqm": cost_components.land_value_per_sqm,
                "construction_cost_per_sqm": cost_components.construction_cost_per_sqm
            },
            methodology_notes=methodology_notes,
            assumptions=assumptions,
            limitations=limitations
        )
        
        logger.info(f"Cost approach valuation completed: GHS {estimated_value:,.0f} (confidence: {confidence_score:.2f})")
        return result
    
    def _is_suitable_for_cost_approach(self, property: Property) -> bool:
        """Check if property is suitable for cost approach"""
        
        # Cost approach works best for:
        # - Newer properties (less than 20 years old)
        # - Properties with known construction details
        # - Standard construction types
        
        if property.property_type in [PropertyType.LAND_RESIDENTIAL, PropertyType.LAND_COMMERCIAL]:
            return True  # Always suitable for land
        
        # Check if we have required information
        if not property.specifications.built_area_sqm:
            logger.warning("Missing built area - cost approach may be unreliable")
            return False
        
        if not property.specifications.land_size_sqm:
            logger.warning("Missing land size - cost approach may be unreliable")
            return False
        
        # Check age
        if property.specifications.year_built:
            age = date.today().year - property.specifications.year_built
            if age > 50:
                logger.warning(f"Property age ({age} years) makes cost approach less reliable")
                # Still suitable but with lower confidence
        
        return True
    
    def _estimate_construction_costs(
        self,
        region: GhanaRegion,
        property_type: PropertyType
    ) -> ConstructionCosts:
        """Estimate construction costs when database data is unavailable"""
        
        # Regional base construction costs (GHS per sqm) - rough estimates
        base_costs = {
            GhanaRegion.GREATER_ACCRA: {
                'basic': 1200,
                'standard': 2000,
                'premium': 3500,
                'luxury': 6000
            },
            GhanaRegion.KUMASI_METRO: {
                'basic': 1000,
                'standard': 1600,
                'premium': 2800,
                'luxury': 4800
            },
            GhanaRegion.EASTERN: {
                'basic': 900,
                'standard': 1400,
                'premium': 2500,
                'luxury': 4200
            },
            GhanaRegion.WESTERN_CLUSTER: {
                'basic': 950,
                'standard': 1500,
                'premium': 2600,
                'luxury': 4400
            },
            GhanaRegion.NORTHERN_CLUSTER: {
                'basic': 800,
                'standard': 1200,
                'premium': 2000,
                'luxury': 3500
            }
        }
        
        costs = base_costs.get(region, base_costs[GhanaRegion.KUMASI_METRO])
        
        return ConstructionCosts(
            region=region,
            effective_date=date.today(),
            cost_per_sqm_basic=costs['basic'],
            cost_per_sqm_standard=costs['standard'],
            cost_per_sqm_premium=costs['premium'],
            cost_per_sqm_luxury=costs['luxury'],
            skilled_labor_rate_per_day=120.0,  # Rough estimate
            unskilled_labor_rate_per_day=60.0,
            utilities_connection_cost=5000.0,
            site_preparation_cost_per_sqm=50.0,
            data_source="Estimated",
            material_costs={}
        )
    
    def _calculate_cost_components(
        self,
        property: Property,
        construction_costs: ConstructionCosts,
        valuation_date: date
    ) -> CostComponents:
        """Calculate all cost components"""
        
        # 1. Calculate land value
        land_value, land_value_per_sqm = self._calculate_land_value(property, construction_costs)
        
        # 2. Calculate construction cost new
        construction_cost_new, cost_per_sqm = self._calculate_construction_cost_new(
            property, construction_costs
        )
        
        # 3. Calculate depreciation
        depreciation, depreciation_details = self._calculate_depreciation(
            property, construction_cost_new, valuation_date
        )
        
        # 4. Calculate depreciated construction cost
        depreciated_construction_cost = construction_cost_new - depreciation
        
        # 5. Total estimated value
        total_estimated_value = land_value + depreciated_construction_cost
        
        return CostComponents(
            land_value=land_value,
            construction_cost_new=construction_cost_new,
            depreciation=depreciation,
            depreciated_construction_cost=depreciated_construction_cost,
            total_estimated_value=total_estimated_value,
            land_value_per_sqm=land_value_per_sqm,
            construction_cost_per_sqm=cost_per_sqm,
            **depreciation_details
        )
    
    def _calculate_land_value(
        self,
        property: Property,
        construction_costs: ConstructionCosts
    ) -> tuple[float, float]:
        """Calculate land value component"""
        
        if not property.specifications.land_size_sqm:
            raise ValueError("Land size required for cost approach")
        
        land_size = property.specifications.land_size_sqm
        region = property.location.region
        
        # Method 1: Use comparable land sales (if available)
        # This would query the database for recent land sales
        # For now, using method 2
        
        # Method 2: Extract from improved property sales
        # Using default land value ratios
        land_ratio = self.DEFAULT_LAND_VALUE_RATIOS.get(region, 0.30)
        
        # Estimate total property value to calculate land value
        # This is circular reasoning - using construction costs as proxy
        if property.specifications.built_area_sqm:
            estimated_total_value = (
                property.specifications.built_area_sqm * construction_costs.cost_per_sqm_standard +
                land_size * 200  # Base land value estimate
            )
            land_value = estimated_total_value * land_ratio
        else:
            # For vacant land, use regional land value estimates
            land_value_per_sqm = self._get_regional_land_value_per_sqm(region)
            land_value = land_size * land_value_per_sqm
        
        land_value_per_sqm = land_value / land_size if land_size > 0 else 0
        
        return land_value, land_value_per_sqm
    
    def _get_regional_land_value_per_sqm(self, region: GhanaRegion) -> float:
        """Get estimated land value per sqm by region"""
        
        # These are very rough estimates - should come from market data
        land_values = {
            GhanaRegion.GREATER_ACCRA: 500,
            GhanaRegion.KUMASI_METRO: 300,
            GhanaRegion.EASTERN: 200,
            GhanaRegion.WESTERN_CLUSTER: 250,
            GhanaRegion.NORTHERN_CLUSTER: 150
        }
        
        return land_values.get(region, 200)
    
    def _calculate_construction_cost_new(
        self,
        property: Property,
        construction_costs: ConstructionCosts
    ) -> tuple[float, float]:
        """Calculate replacement cost new"""
        
        if not property.specifications.built_area_sqm:
            if property.property_type.value.startswith('land_'):
                return 0.0, 0.0  # No construction cost for land
            else:
                raise ValueError("Built area required for construction cost calculation")
        
        built_area = property.specifications.built_area_sqm
        
        # Determine construction quality level based on property details
        cost_per_sqm = self._determine_construction_cost_per_sqm(property, construction_costs)
        
        # Base construction cost
        base_construction_cost = built_area * cost_per_sqm
        
        # Add site preparation costs
        if property.specifications.land_size_sqm:
            site_prep_cost = property.specifications.land_size_sqm * construction_costs.site_preparation_cost_per_sqm
        else:
            site_prep_cost = built_area * 50  # Estimate based on built area
        
        # Add utilities connection costs
        utilities_cost = construction_costs.utilities_connection_cost
        
        # Total construction cost new
        total_construction_cost = base_construction_cost + site_prep_cost + utilities_cost
        
        return total_construction_cost, cost_per_sqm
    
    def _determine_construction_cost_per_sqm(
        self,
        property: Property,
        construction_costs: ConstructionCosts
    ) -> float:
        """Determine appropriate construction cost per sqm based on property characteristics"""
        
        # Default to standard construction
        cost_per_sqm = construction_costs.cost_per_sqm_standard
        
        # Adjust based on property condition and features
        if property.specifications.condition == PropertyCondition.NEW:
            cost_per_sqm = construction_costs.cost_per_sqm_premium
        elif property.specifications.condition == PropertyCondition.EXCELLENT:
            cost_per_sqm = construction_costs.cost_per_sqm_premium
        elif property.specifications.condition in [PropertyCondition.POOR, PropertyCondition.RENOVATION_NEEDED]:
            cost_per_sqm = construction_costs.cost_per_sqm_basic
        
        # Adjust for amenities (premium features)
        amenity_multiplier = 1.0
        if property.specifications.has_swimming_pool:
            amenity_multiplier += 0.15
        if property.specifications.has_air_conditioning:
            amenity_multiplier += 0.10
        if property.specifications.has_security:
            amenity_multiplier += 0.05
        if property.specifications.has_generator:
            amenity_multiplier += 0.05
        
        # Check if this pushes us to luxury category
        if amenity_multiplier > 1.25:
            cost_per_sqm = construction_costs.cost_per_sqm_luxury
        elif amenity_multiplier > 1.10:
            cost_per_sqm = construction_costs.cost_per_sqm_premium
        
        cost_per_sqm *= amenity_multiplier
        
        return cost_per_sqm
    
    def _calculate_depreciation(
        self,
        property: Property,
        construction_cost_new: float,
        valuation_date: date
    ) -> tuple[float, dict]:
        """Calculate total depreciation (physical, functional, external)"""
        
        # Physical depreciation (age and condition based)
        physical_depreciation = self._calculate_physical_depreciation(
            property, construction_cost_new, valuation_date
        )
        
        # Functional obsolescence (design, layout issues)
        functional_obsolescence = self._calculate_functional_obsolescence(
            property, construction_cost_new
        )
        
        # External obsolescence (neighborhood, economic factors)
        external_obsolescence = self._calculate_external_obsolescence(
            property, construction_cost_new
        )
        
        total_depreciation = physical_depreciation + functional_obsolescence + external_obsolescence
        
        # Cap depreciation at maximum for property type
        max_depreciation = self.MAX_DEPRECIATION.get(
            property.property_type, 0.80
        ) * construction_cost_new
        
        total_depreciation = min(total_depreciation, max_depreciation)
        
        depreciation_details = {
            'age_depreciation_pct': physical_depreciation / construction_cost_new if construction_cost_new > 0 else 0,
            'condition_adjustment_pct': 0.0,  # Included in physical
            'functional_obsolescence_pct': functional_obsolescence / construction_cost_new if construction_cost_new > 0 else 0,
            'external_obsolescence_pct': external_obsolescence / construction_cost_new if construction_cost_new > 0 else 0
        }
        
        return total_depreciation, depreciation_details
    
    def _calculate_physical_depreciation(
        self,
        property: Property,
        construction_cost_new: float,
        valuation_date: date
    ) -> float:
        """Calculate physical depreciation based on age and condition"""
        
        if not property.specifications.year_built:
            # Assume 10 years if age unknown
            age = 10
        else:
            age = valuation_date.year - property.specifications.year_built
        
        # Calculate depreciation based on age schedule
        total_depreciation_rate = 0.0
        remaining_years = age
        
        for (start_year, end_year), annual_rate in self.DEPRECIATION_SCHEDULE.items():
            if remaining_years <= 0:
                break
            
            years_in_bracket = min(remaining_years, end_year - start_year + 1)
            total_depreciation_rate += years_in_bracket * annual_rate
            remaining_years -= years_in_bracket
        
        # Adjust for condition
        condition_adjustment = {
            PropertyCondition.NEW: -0.05,           # Reduce depreciation
            PropertyCondition.EXCELLENT: 0.0,
            PropertyCondition.GOOD: 0.0,
            PropertyCondition.FAIR: 0.10,          # Increase depreciation
            PropertyCondition.POOR: 0.25,
            PropertyCondition.RENOVATION_NEEDED: 0.40
        }
        
        if property.specifications.condition:
            total_depreciation_rate += condition_adjustment.get(
                property.specifications.condition, 0.0
            )
        
        # Cap depreciation rate
        total_depreciation_rate = min(total_depreciation_rate, 0.90)
        
        return construction_cost_new * total_depreciation_rate
    
    def _calculate_functional_obsolescence(
        self,
        property: Property,
        construction_cost_new: float
    ) -> float:
        """Calculate functional obsolescence"""
        
        obsolescence_rate = 0.0
        
        # Check for functional issues
        if property.specifications.year_built and property.specifications.year_built < 1990:
            obsolescence_rate += 0.05  # Older design standards
        
        if property.specifications.year_built and property.specifications.year_built < 1970:
            obsolescence_rate += 0.10  # Very outdated design
        
        # Check bathroom/bedroom ratio
        if (property.specifications.bedrooms and property.specifications.bathrooms and
            property.specifications.bedrooms > 0):
            bathroom_ratio = property.specifications.bathrooms / property.specifications.bedrooms
            if bathroom_ratio < 0.5:  # Less than 1 bathroom per 2 bedrooms
                obsolescence_rate += 0.05
        
        return construction_cost_new * obsolescence_rate
    
    def _calculate_external_obsolescence(
        self,
        property: Property,
        construction_cost_new: float
    ) -> float:
        """Calculate external obsolescence (location, economic factors)"""
        
        # This would typically be based on neighborhood trends, economic conditions
        # For now, using minimal external obsolescence
        
        obsolescence_rate = 0.0
        
        # Regional economic factors could be applied here
        # This would come from economic indicators in real implementation
        
        return construction_cost_new * obsolescence_rate
    
    def _calculate_confidence_score(
        self,
        property: Property,
        construction_costs: ConstructionCosts,
        cost_components: CostComponents
    ) -> float:
        """Calculate confidence score for cost approach valuation"""
        
        confidence_factors = []
        
        # Data completeness factor
        completeness_score = 0.0
        if property.specifications.built_area_sqm:
            completeness_score += 0.3
        if property.specifications.land_size_sqm:
            completeness_score += 0.2
        if property.specifications.year_built:
            completeness_score += 0.2
        if property.specifications.condition:
            completeness_score += 0.2
        if property.specifications.bedrooms and property.specifications.bathrooms:
            completeness_score += 0.1
        
        confidence_factors.append(completeness_score)
        
        # Construction cost data quality
        cost_data_quality = 0.8 if construction_costs.data_source != "Estimated" else 0.5
        confidence_factors.append(cost_data_quality)
        
        # Property age factor (newer properties more suitable for cost approach)
        age_factor = 1.0
        if property.specifications.year_built:
            age = date.today().year - property.specifications.year_built
            if age <= 10:
                age_factor = 1.0
            elif age <= 20:
                age_factor = 0.9
            elif age <= 30:
                age_factor = 0.8
            else:
                age_factor = 0.6
        else:
            age_factor = 0.7  # Unknown age penalty
        
        confidence_factors.append(age_factor)
        
        # Property type suitability
        type_suitability = {
            PropertyType.RESIDENTIAL_HOUSE: 0.9,
            PropertyType.RESIDENTIAL_APARTMENT: 0.8,
            PropertyType.COMMERCIAL_OFFICE: 0.7,
            PropertyType.LAND_RESIDENTIAL: 0.95,
            PropertyType.LAND_COMMERCIAL: 0.9
        }
        
        suitability_score = type_suitability.get(property.property_type, 0.6)
        confidence_factors.append(suitability_score)
        
        # Calculate weighted average
        weights = [0.3, 0.25, 0.25, 0.2]  # Adjust weights as needed
        confidence_score = sum(factor * weight for factor, weight in zip(confidence_factors, weights))
        
        return max(0.1, min(1.0, confidence_score))
    
    def _compile_methodology_notes(
        self,
        cost_components: CostComponents,
        regional_multiplier: float
    ) -> str:
        """Compile methodology notes"""
        
        return f"""
        Cost approach valuation methodology:
        
        Land Value: GHS {cost_components.land_value:,.0f}
        - Land value per sqm: GHS {cost_components.land_value_per_sqm:,.0f}
        
        Construction Cost New: GHS {cost_components.construction_cost_new:,.0f}
        - Construction cost per sqm: GHS {cost_components.construction_cost_per_sqm:,.0f}
        
        Less: Depreciation: GHS {cost_components.depreciation:,.0f}
        - Physical depreciation: {cost_components.age_depreciation_pct*100:.1f}%
        - Functional obsolescence: {cost_components.functional_obsolescence_pct*100:.1f}%
        - External obsolescence: {cost_components.external_obsolescence_pct*100:.1f}%
        
        Depreciated Construction Cost: GHS {cost_components.depreciated_construction_cost:,.0f}
        
        Total Estimated Value (before regional adjustment): GHS {cost_components.total_estimated_value:,.0f}
        Regional multiplier applied: {regional_multiplier:.2f}x
        """.strip()
    
    def _compile_assumptions(
        self,
        property: Property,
        construction_costs: ConstructionCosts,
        valuation_date: date
    ) -> List[str]:
        """Compile valuation assumptions"""
        
        assumptions = [
            f"Valuation date: {valuation_date}",
            "Property can be replaced with similar utility",
            "Construction costs reflect current market rates",
            "Land value based on regional market analysis",
            f"Construction cost data source: {construction_costs.data_source}",
            "Depreciation calculated using economic age method",
            "No extraordinary financing or buyer motivations"
        ]
        
        if property.specifications.condition:
            assumptions.append(f"Property condition: {property.specifications.condition.value}")
        else:
            assumptions.append("Property condition assumed to be average")
        
        return assumptions
    
    def _compile_limitations(
        self,
        property: Property,
        construction_costs: ConstructionCosts
    ) -> List[str]:
        """Compile valuation limitations"""
        
        limitations = [
            "Cost approach assumes property's highest and best use as improved",
            "Depreciation estimates based on typical market depreciation patterns",
            "Land value estimates may not reflect unique site characteristics",
            "Construction costs based on typical construction methods"
        ]
        
        if construction_costs.data_source == "Estimated":
            limitations.append("Construction cost data is estimated due to lack of current market data")
        
        if not property.specifications.year_built:
            limitations.append("Property age estimated due to missing construction date")
        
        if property.specifications.year_built and (date.today().year - property.specifications.year_built) > 30:
            limitations.append("Cost approach less reliable for older properties due to depreciation complexities")
        
        return limitations