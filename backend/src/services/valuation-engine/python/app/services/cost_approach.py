"""
Cost Approach Service
Pure cost approach valuation - uses live Data Hub API for construction costs
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
from ..adapters.data_hub_api_adapter import get_data_hub_adapter, DataHubAPIAdapter
from ..utils.ghana_validation import GhanaMarketValidator
from .depreciation import (
    PhysicalDepreciationCalculator,
    FunctionalObsolescenceCalculator,
    ExternalObsolescenceCalculator,
    DepreciationReconciliationService,
    PhysicalDepreciationResult,
    FunctionalObsolescenceResult,
    ExternalObsolescenceResult,
    TotalDepreciationResult,
    ConstructionType,
    calculate_physical_depreciation,
    calculate_functional_obsolescence,
    calculate_external_obsolescence,
    calculate_total_depreciation,
)


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
    """Cost approach valuation service - uses live Data Hub API"""
    
    def __init__(self, market_data_adapter: MarketDataAdapter = None):
        self.market_data = market_data_adapter
        self.data_hub = get_data_hub_adapter()  # Live API adapter
        self.reconciliation_service = DepreciationReconciliationService()
        

    
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
        
        # Get construction costs from live Data Hub API first
        region_str = target_property.location.region.value if hasattr(target_property.location.region, 'value') else str(target_property.location.region)
        construction_costs = await self.data_hub.get_construction_costs(
            region=region_str,
            property_type="residential",  # Map from property type
            quality_level="standard"
        )
        
        if not construction_costs:
            logger.warning("No construction cost data from API, trying database adapter")
            # Fallback to database adapter if API fails
            if self.market_data:
                construction_costs = await self.market_data.get_construction_costs(
                    target_property.location.region,
                    target_property.property_type,
                    valuation_date
                )
        
        if not construction_costs:
            raise ValueError(
                f"Construction cost data unavailable for region '{target_property.location.region}': "
                "both the Data Hub API and database adapter returned no data. "
                "Seed construction costs via the Data Hub admin panel before running a cost approach valuation."
            )
        
        # Get regional multiplier from live API
        multiplier_data = await self.data_hub.get_regional_multiplier(region_str)
        regional_multiplier = multiplier_data.get("value", 1.0)
        multiplier_source = multiplier_data.get("source", "fallback")
        
        # Calculate cost components
        cost_components = self._calculate_cost_components(
            target_property,
            construction_costs,
            valuation_date
        )
        
        # Apply regional multiplier (already fetched from live API)
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
                "regional_multiplier_source": multiplier_source,
                "land_value_per_sqm": cost_components.land_value_per_sqm,
                "construction_cost_per_sqm": cost_components.construction_cost_per_sqm,
                "data_source": construction_costs.data_source if hasattr(construction_costs, 'data_source') else "calculated"
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
        # Land value must come from live comparable land sales — no hardcoded estimates.
        # If comparable land sales are unavailable, the caller should supply a
        # land_value_per_sqm override via cost_approach_options.
        raise ValueError(
            f"Land value data unavailable for region '{region}': "
            "no comparable land sales found from the Data Hub or database adapter. "
            "Supply land_value_per_sqm via cost_approach_options, or seed land sale "
            "comparables via LandComparableSalesService before running a cost approach valuation."
        )
        
        land_value_per_sqm = land_value / land_size if land_size > 0 else 0
        
        return land_value, land_value_per_sqm
    

    
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
        if not property.specifications.land_size_sqm:
            raise ValueError(
                "land_size_sqm is required for construction cost calculation — "
                "cannot estimate site preparation cost without it."
            )
        site_prep_cost = property.specifications.land_size_sqm * construction_costs.site_preparation_cost_per_sqm
        
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
        valuation_date: date,
        location_data: Optional[Dict[str, Any]] = None,
        market_data: Optional[Dict[str, Any]] = None,
    ) -> tuple[float, dict]:
        """
        Calculate total depreciation using RICS/GhIS compliant calculators.
        
        Integrates:
        - PhysicalDepreciationCalculator: Modified Age-Life method with condition adjustment
        - FunctionalObsolescenceCalculator: Auto-detection from property specifications
        - ExternalObsolescenceCalculator: Environmental, locational, economic, regulatory factors
        - DepreciationReconciliationService: Combines with age-based caps
        
        Returns tuple of (total_depreciation_amount, depreciation_details_dict)
        """
        
        # 1. Physical Depreciation
        physical_result = calculate_physical_depreciation(
            property_data=property,
            valuation_date=valuation_date,
            construction_type=self._infer_construction_type(property),
        )
        
        # If the calculator couldn't run, we need more data — no legacy fallback.
        if not physical_result.auto_calculated:
            raise ValueError(
                "Physical depreciation could not be calculated: missing year_built or condition. "
                "Provide these fields before running a cost approach valuation."
            )
        else:
            physical_rate = physical_result.depreciation_rate
            physical_depreciation = construction_cost_new * physical_rate
        
        # 2. Functional Obsolescence
        functional_result = calculate_functional_obsolescence(property)
        
        if not functional_result.auto_calculated:
            raise ValueError(
                "Functional obsolescence could not be calculated: insufficient property specification data. "
                "Provide year_built, condition, and bedroom/bathroom counts before running a cost approach valuation."
            )
        else:
            functional_rate = functional_result.depreciation_rate
            functional_obsolescence = construction_cost_new * functional_rate
        
        # 3. External Obsolescence - Use new ExternalObsolescenceCalculator
        external_calculator = ExternalObsolescenceCalculator(data_hub_adapter=self.data_hub)
        external_result = external_calculator.calculate(
            property_data=property,
            location_data=location_data or {},
            market_data=market_data or {},
        )
        external_rate = external_result.depreciation_rate
        external_obsolescence = construction_cost_new * external_rate
        
        # 4. Reconcile all components with age-based caps
        property_age = 0
        if property.specifications.year_built:
            property_age = valuation_date.year - property.specifications.year_built
        
        reconciled = self.reconciliation_service.reconcile(
            physical=physical_result,
            functional=functional_result,
            external=external_result,
            property_age=property_age,
            rcn=construction_cost_new,
        )
        
        # Get capped total depreciation
        total_depreciation = reconciled.total_amount
        
        depreciation_details = {
            'age_depreciation_pct': reconciled.physical_rate,
            'condition_adjustment_pct': 0.0,  # Included in physical via condition factor
            'functional_obsolescence_pct': reconciled.functional_rate,
            'external_obsolescence_pct': reconciled.external_rate,
            # Include full audit trail from calculators
            'physical_result': physical_result.to_dict() if physical_result.auto_calculated else {'error': 'fallback_used'},
            'functional_result': functional_result.to_dict() if functional_result.auto_calculated else {'error': 'fallback_used'},
            'external_result': external_result.to_dict(),
            'method': 'integrated_depreciation_calculators_with_reconciliation',
            'physical': {
                'rate': reconciled.physical_rate,
                'amount': reconciled.physical_amount,
                'actual_age': physical_result.actual_age if physical_result.auto_calculated else None,
                'effective_age': physical_result.effective_age if physical_result.auto_calculated else None,
                'economic_life': physical_result.economic_life if physical_result.auto_calculated else None,
                'remaining_life': physical_result.remaining_life if physical_result.auto_calculated else None,
            },
            'functional': {
                'rate': reconciled.functional_rate,
                'amount': reconciled.functional_amount,
                'items_detected': len(functional_result.items_detected) if functional_result.auto_calculated else 0,
                'curable_rate': functional_result.curable_rate if functional_result.auto_calculated else 0,
                'incurable_rate': functional_result.incurable_rate if functional_result.auto_calculated else 0,
            },
            'external': {
                'rate': reconciled.external_rate,
                'amount': reconciled.external_amount,
                'factors_detected': external_result.total_factors,
                'category_breakdown': external_result.category_breakdown,
            },
            'total': {
                'rate': reconciled.total_rate,
                'percent': reconciled.total_percent,
                'amount': reconciled.total_amount,
                'was_capped': reconciled.was_capped,
                'cap_applied': reconciled.cap_applied,
            },
            'reconciliation': {
                'auto_calculated': reconciled.auto_calculated,
                'confidence': reconciled.confidence,
                'requires_review': reconciled.requires_review,
                'methodology_notes': reconciled.methodology_notes,
            },
        }
        
        return total_depreciation, depreciation_details
        
        return total_depreciation, depreciation_details
    
    def _infer_construction_type(self, property: Property) -> Optional[ConstructionType]:
        """
        Infer construction type from property characteristics.
        Used for selecting appropriate economic life in physical depreciation.
        """
        # In Ghana, most residential is concrete block or sandcrete
        # This could be enhanced with actual construction data when available
        
        if property.property_type in [
            PropertyType.COMMERCIAL_OFFICE,
            PropertyType.COMMERCIAL_RETAIL,
        ]:
            return ConstructionType.REINFORCED_CONCRETE
        elif property.property_type in [
            PropertyType.INDUSTRIAL_WAREHOUSE,
            PropertyType.INDUSTRIAL_FACTORY,
        ]:
            return ConstructionType.STEEL_FRAME
        elif property.property_type == PropertyType.RESIDENTIAL_VILLA:
            return ConstructionType.REINFORCED_CONCRETE
        elif property.property_type in [
            PropertyType.RESIDENTIAL_HOUSE,
            PropertyType.RESIDENTIAL_APARTMENT,
            PropertyType.RESIDENTIAL_TOWNHOUSE,
        ]:
            # Default for residential in Ghana
            return ConstructionType.SANDCRETE_BLOCK
        
        # Default fallback
        return ConstructionType.CONCRETE_BLOCK
    

    
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