"""
DRC (Depreciated Replacement Cost) Method Service

Implements the Depreciated Replacement Cost method for specialized properties.
Uses live Data Hub API for construction costs and regional multipliers.

Typical Applications:
- Government/institutional buildings
- Religious buildings (churches, mosques)
- Community centers
- Specialized industrial facilities
- Heritage/historic properties
- Utilities and infrastructure

Key Features:
- Modern Equivalent Asset (MEA) consideration
- Functional and physical obsolescence
- Specialized asset adjustments
- Asset-specific depreciation curves
"""

from typing import Dict, List, Optional, Tuple
from decimal import Decimal
import asyncio
from datetime import datetime, date, timedelta
import logging

from ..models.schemas import (
    PropertyForValuation, ValuationOptions, MethodResult, 
    RegionCode, PropertyType
)
from ..adapters.market_data import MarketDataAdapter
from ..adapters.data_hub_api_adapter import get_data_hub_adapter
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
)

logger = logging.getLogger(__name__)

# Specialized property types for DRC
DRC_PROPERTY_TYPES = [
    "institutional",
    "government",
    "religious",
    "church",
    "mosque",
    "community_center",
    "library",
    "museum",
    "heritage",
    "utility",
    "substation",
    "water_treatment",
    "sewage_treatment",
    "power_plant",
    "airport",
    "port",
    "stadium",
    "specialized_industrial",
]

# Construction costs per sqm for specialized properties (GHS)
SPECIALIZED_COSTS: Dict[str, float] = {
    "institutional": 5500,
    "government": 6000,
    "religious": 4500,
    "church": 5000,
    "mosque": 5500,
    "community_center": 4000,
    "library": 5500,
    "museum": 7000,
    "heritage": 8000,  # Higher due to specialized restoration
    "utility": 3500,
    "substation": 8000,
    "water_treatment": 10000,
    "sewage_treatment": 9000,
    "power_plant": 12000,
    "airport": 8000,  # Terminal buildings
    "port": 6000,
    "stadium": 7000,
    "specialized_industrial": 6000,
}

# Useful lives for specialized properties (years)
SPECIALIZED_USEFUL_LIVES: Dict[str, int] = {
    "institutional": 60,
    "government": 60,
    "religious": 80,  # Often maintained longer
    "church": 80,
    "mosque": 80,
    "community_center": 45,
    "library": 55,
    "museum": 70,
    "heritage": 100,  # Listed/protected
    "utility": 50,
    "substation": 45,
    "water_treatment": 40,
    "sewage_treatment": 40,
    "power_plant": 35,
    "airport": 50,
    "port": 50,
    "stadium": 45,
    "specialized_industrial": 40,
}

# Modern Equivalent Asset (MEA) factors
# Represents how much of the original asset is still functionally required
MEA_FACTORS: Dict[str, float] = {
    "institutional": 0.95,
    "government": 0.90,
    "religious": 1.00,  # Religious buildings rarely have MEA reduction
    "church": 1.00,
    "mosque": 1.00,
    "community_center": 0.85,
    "library": 0.80,  # Smaller library needs due to digital
    "museum": 0.95,
    "heritage": 1.00,
    "utility": 0.90,
    "substation": 0.95,
    "water_treatment": 1.00,
    "sewage_treatment": 1.00,
    "power_plant": 0.90,
    "airport": 0.85,
    "port": 0.90,
    "stadium": 0.85,
    "specialized_industrial": 0.90,
}

# Regional cost multipliers for specialized construction
REGIONAL_MULTIPLIERS: Dict[RegionCode, float] = {
    RegionCode.GREATER_ACCRA: 1.15,
    RegionCode.KUMASI_METRO: 1.00,
    RegionCode.EASTERN: 0.90,
    RegionCode.WESTERN_CLUSTER: 1.00,
    RegionCode.NORTHERN_CLUSTER: 0.85,
}


class DRCCalculation:
    """DRC calculation data structure"""
    def __init__(self):
        self.gross_replacement_cost: float = 0
        self.mea_adjustment: float = 0
        self.physical_depreciation: float = 0
        self.functional_obsolescence: float = 0
        self.economic_obsolescence: float = 0
        self.total_depreciation: float = 0
        self.depreciated_replacement_cost: float = 0
        self.land_value: float = 0
        self.total_value: float = 0
        self.depreciation_rate_percent: float = 0


class AssetAnalysis:
    """Asset analysis data structure"""
    def __init__(self):
        self.asset_type: str = ""
        self.useful_life_years: int = 0
        self.effective_age_years: int = 0
        self.remaining_useful_life_years: int = 0
        self.condition_rating: str = ""
        self.mea_factor: float = 0


class DRCMethodService:
    """DRC Method Valuation Service - uses live Data Hub API"""

    def __init__(self, market_adapter: MarketDataAdapter = None):
        self.market_adapter = market_adapter
        self.data_hub = get_data_hub_adapter()  # Live API adapter

    async def calculate(
        self,
        property_data: PropertyForValuation,
        options: ValuationOptions
    ) -> MethodResult:
        """Calculate property value using DRC Method"""
        start_time = datetime.now()

        logger.debug(f"Starting DRC Method calculation for property {property_data.id}")

        try:
            # 1. Identify specialized asset type
            asset_type = self._identify_asset_type(property_data)

            # 2. Analyze asset characteristics
            asset_analysis = self._analyze_asset(property_data, asset_type)

            # 3. Calculate Gross Replacement Cost (GRC)
            grc = await self._calculate_gross_replacement_cost(property_data, asset_type)

            # 4. Apply MEA adjustment
            mea_adjusted_grc = grc * asset_analysis.mea_factor
            mea_adjustment = grc - mea_adjusted_grc

            # 5. Calculate depreciation
            depreciation = self._calculate_depreciation(
                mea_adjusted_grc,
                asset_analysis,
                property_data
            )

            # 6. Calculate DRC
            drc = mea_adjusted_grc - depreciation["total"]

            # 7. Calculate land value
            land_value = await self._calculate_land_value(property_data)

            # 8. Calculate total property value
            total_value = drc + land_value

            # 9. Calculate confidence score
            confidence = self._calculate_confidence(property_data, asset_analysis, drc)

            # 10. Calculate method weight
            weight = self._calculate_method_weight(property_data)

            # Create calculation summary
            calculation = DRCCalculation()
            calculation.gross_replacement_cost = round(grc)
            calculation.mea_adjustment = round(mea_adjustment)
            calculation.physical_depreciation = round(depreciation["physical"])
            calculation.functional_obsolescence = round(depreciation["functional"])
            calculation.economic_obsolescence = round(depreciation["economic"])
            calculation.total_depreciation = round(depreciation["total"])
            calculation.depreciated_replacement_cost = round(drc)
            calculation.land_value = round(land_value)
            calculation.total_value = round(total_value)
            calculation.depreciation_rate_percent = round(
                (depreciation["total"] / mea_adjusted_grc * 100) if mea_adjusted_grc > 0 else 0, 1
            )

            duration = (datetime.now() - start_time).total_seconds()
            logger.info(f"DRC Method completed for property {property_data.id} in {duration:.2f}s")

            return MethodResult(
                method="drc_method",
                value=round(max(0, total_value)),
                confidence=confidence,
                weight=weight,
                details={
                    "calculation": calculation.__dict__,
                    "asset_analysis": asset_analysis.__dict__,
                    "depreciation_breakdown": {
                        "physical": round(depreciation["physical"]),
                        "functional": round(depreciation["functional"]),
                        "economic": round(depreciation["economic"]),
                        "total": round(depreciation["total"]),
                    },
                    "cost_components": {
                        "gross_replacement_cost": round(grc),
                        "mea_adjusted_cost": round(mea_adjusted_grc),
                        "depreciated_building_value": round(drc),
                        "land_value": round(land_value),
                    }
                }
            )

        except Exception as error:
            logger.error(f"DRC Method failed for property {property_data.id}: {str(error)}")
            raise error

    def _identify_asset_type(self, property_data: PropertyForValuation) -> str:
        """Identify specialized asset type"""
        property_type = property_data.property_type.value.lower()
        
        # Direct match
        if property_type in DRC_PROPERTY_TYPES:
            return property_type
        
        # Keyword matching
        type_keywords = {
            "institutional": ["institution", "public", "civic"],
            "government": ["government", "municipal", "state", "ministry"],
            "religious": ["temple", "synagogue", "chapel"],
            "church": ["church", "cathedral", "parish"],
            "mosque": ["mosque", "masjid"],
            "community_center": ["community", "social", "recreation"],
            "library": ["library", "archive"],
            "museum": ["museum", "gallery", "exhibition"],
            "heritage": ["heritage", "historic", "monument"],
            "utility": ["utility", "service"],
            "hospital": ["hospital", "clinic", "medical"],
            "school": ["school", "university", "college", "academy"],
        }
        
        for asset_type, keywords in type_keywords.items():
            if any(keyword in property_type for keyword in keywords):
                return asset_type
        
        # Default for specialized properties
        return "institutional"

    def _analyze_asset(self, property_data: PropertyForValuation, asset_type: str) -> AssetAnalysis:
        """Analyze asset characteristics"""
        analysis = AssetAnalysis()
        
        analysis.asset_type = asset_type
        analysis.useful_life_years = SPECIALIZED_USEFUL_LIVES.get(asset_type, 50)
        analysis.mea_factor = MEA_FACTORS.get(asset_type, 0.90)
        
        # Estimate effective age
        current_year = datetime.now().year
        if property_data.year_built:
            analysis.effective_age_years = max(0, current_year - property_data.year_built)
        else:
            # Estimate based on condition
            condition_ages = {
                "new": 0,
                "excellent": 5,
                "good": 15,
                "fair": 25,
                "poor": 35,
                "renovation_needed": 40,
            }
            condition = property_data.condition.value if property_data.condition else "fair"
            analysis.effective_age_years = condition_ages.get(condition, 20)
        
        # Calculate remaining useful life
        analysis.remaining_useful_life_years = max(0, analysis.useful_life_years - analysis.effective_age_years)
        
        # Determine condition rating
        if analysis.effective_age_years < analysis.useful_life_years * 0.2:
            analysis.condition_rating = "excellent"
        elif analysis.effective_age_years < analysis.useful_life_years * 0.4:
            analysis.condition_rating = "good"
        elif analysis.effective_age_years < analysis.useful_life_years * 0.7:
            analysis.condition_rating = "fair"
        else:
            analysis.condition_rating = "poor"
        
        return analysis

    async def _calculate_gross_replacement_cost(
        self, 
        property_data: PropertyForValuation, 
        asset_type: str
    ) -> float:
        """Calculate Gross Replacement Cost using live Data Hub API"""
        building_size = (
            property_data.building_size_sqm or
            property_data.built_area_sqm or
            property_data.total_area_sqm or
            500  # Default size
        )
        
        region_str = property_data.region.value if hasattr(property_data.region, 'value') else str(property_data.region)
        
        # Try to get construction cost from live API for specialized properties
        try:
            # Map asset type to standard property types for API
            property_type_map = {
                "institutional": "commercial",
                "government": "commercial",
                "religious": "commercial",
                "church": "commercial",
                "mosque": "commercial",
                "industrial": "industrial",
                "specialized_industrial": "industrial",
                "warehouse": "industrial",
            }
            api_property_type = property_type_map.get(asset_type, "commercial")
            
            base_cost_data = await self.data_hub.get_base_cost_per_sqm(
                property_type=api_property_type,
                quality_level="premium",  # Specialized properties use premium costs
                region=region_str
            )
            
            if base_cost_data and base_cost_data.get("adjusted_cost", 0) > 0:
                # Add specialized premium on top of API cost
                specialized_premium = {
                    "heritage": 1.5,
                    "museum": 1.4,
                    "power_plant": 2.0,
                    "water_treatment": 1.8,
                    "sewage_treatment": 1.7,
                    "substation": 1.6,
                    "airport": 1.5,
                    "stadium": 1.4,
                }.get(asset_type, 1.0)
                
                adjusted_cost = base_cost_data["adjusted_cost"] * specialized_premium
                logger.info(f"Using live construction cost for DRC: {adjusted_cost} GHS/sqm (with {specialized_premium}x premium)")
                return building_size * adjusted_cost
                
        except Exception as e:
            logger.warning(f"Failed to get construction cost from API for DRC: {e}")
        
        # Fallback to static specialized costs
        base_cost = SPECIALIZED_COSTS.get(asset_type, 5000)
        
        # Apply regional multiplier
        regional_factor = REGIONAL_MULTIPLIERS.get(property_data.region, 1.00)
        
        # Apply inflation adjustment (assume 8% annual construction cost inflation)
        current_year = datetime.now().year
        base_year = 2024
        years_elapsed = current_year - base_year
        inflation_factor = (1.08) ** years_elapsed
        
        adjusted_cost = base_cost * regional_factor * inflation_factor
        
        return building_size * adjusted_cost

    def _calculate_depreciation(
        self, 
        mea_adjusted_grc: float, 
        asset_analysis: AssetAnalysis, 
        property_data: PropertyForValuation
    ) -> Dict[str, any]:
        """
        Calculate depreciation using standardized RICS/GhIS compliant calculators.
        
        Integrates:
        - PhysicalDepreciationCalculator: Modified Age-Life method with condition adjustment
        - FunctionalObsolescenceCalculator: Auto-detection from property specifications
        - ExternalObsolescenceCalculator: Environmental, locational, economic, regulatory factors
        - DepreciationReconciliationService: Combines with age-based caps
        
        Returns dict with depreciation amounts and full audit trail.
        """
        
        # Convert PropertyForValuation to Property schema for calculators
        property_schema = self._convert_to_property_schema(property_data)
        
        # Map asset type to construction type for economic life calculation
        construction_type = self._map_asset_to_construction_type(asset_analysis.asset_type)
        
        # 1. Physical Depreciation - Use standardized calculator
        physical_calculator = PhysicalDepreciationCalculator()
        physical_result = physical_calculator.calculate(
            property_data=property_schema,
            valuation_date=date.today(),
            construction_type=construction_type,
        )
        
        # For DRC, override economic life with specialized asset useful life
        # if the asset has a specific useful life defined
        if asset_analysis.useful_life_years > 0:
            # Recalculate using asset-specific useful life
            effective_age = physical_result.effective_age
            specialized_depreciation_rate = min(
                effective_age / asset_analysis.useful_life_years,
                0.95
            )
            physical_depreciation = mea_adjusted_grc * specialized_depreciation_rate
            physical_rate = specialized_depreciation_rate
        else:
            physical_depreciation = mea_adjusted_grc * physical_result.depreciation_rate
            physical_rate = physical_result.depreciation_rate
        
        # 2. Functional Obsolescence - Use standardized calculator
        functional_calculator = FunctionalObsolescenceCalculator()
        functional_result = functional_calculator.calculate(property_data=property_schema)
        
        # Additional functional obsolescence for technology-dependent specialized assets
        specialized_functional_rate = 0.0
        if asset_analysis.asset_type in ["substation", "power_plant", "water_treatment"]:
            if asset_analysis.effective_age_years > 20:
                specialized_functional_rate = min(0.15, (asset_analysis.effective_age_years - 20) * 0.01)
        elif asset_analysis.asset_type in ["library", "museum"]:
            if asset_analysis.effective_age_years > 15:
                specialized_functional_rate = min(0.10, (asset_analysis.effective_age_years - 15) * 0.01)
        
        total_functional_rate = min(
            functional_result.depreciation_rate + specialized_functional_rate,
            0.25  # Cap at 25% per architecture
        )
        functional_obsolescence = mea_adjusted_grc * total_functional_rate
        
        # 3. External Obsolescence - Use ExternalObsolescenceCalculator
        external_calculator = ExternalObsolescenceCalculator()
        
        # Build location data for specialized assets
        location_data = {}
        if property_data.region in [RegionCode.NORTHERN_CLUSTER, RegionCode.EASTERN]:
            location_data['property_value_trend_3yr'] = 'declining_slight'  # Lower demand areas
        
        # Add specialized asset external factors
        market_data = {}
        if asset_analysis.asset_type in ["stadium", "specialized_industrial"]:
            market_data['market_condition_index'] = 'slow'  # Limited demand for specialized uses
        
        external_result = external_calculator.calculate(
            property_data=property_schema,
            location_data=location_data,
            market_data=market_data,
        )
        external_rate = external_result.depreciation_rate
        economic_obsolescence = mea_adjusted_grc * external_rate
        
        # 4. Reconcile with age-based caps using DepreciationReconciliationService
        reconciliation = DepreciationReconciliationService()
        
        # Get effective age for reconciliation
        property_age = asset_analysis.effective_age_years if asset_analysis.effective_age_years > 0 else 20
        
        reconciled = reconciliation.reconcile(
            physical=physical_result,
            functional=functional_result,
            external=external_result,
            property_age=property_age,
            rcn=mea_adjusted_grc,
        )
        
        # Apply specialized overrides for DRC (physical and functional may use asset-specific rates)
        # Total depreciation considering specialized calculations
        total_depreciation = physical_depreciation + functional_obsolescence + economic_obsolescence
        
        # Apply age-based cap from reconciliation service
        max_rate = reconciliation._get_age_based_cap(property_age)
        max_depreciation = mea_adjusted_grc * max_rate
        total_depreciation = min(total_depreciation, max_depreciation)
        
        was_capped = total_depreciation >= max_depreciation
        
        return {
            "physical": physical_depreciation,
            "physical_rate": physical_rate,
            "physical_result": physical_result.to_dict(),  # Full audit trail
            "functional": functional_obsolescence,
            "functional_rate": total_functional_rate,
            "functional_result": functional_result.to_dict(),  # Full audit trail
            "specialized_functional_rate": specialized_functional_rate,
            "economic": economic_obsolescence,
            "economic_rate": external_rate,
            "external_result": external_result.to_dict(),  # Full audit trail
            "total": total_depreciation,
            "total_rate": total_depreciation / mea_adjusted_grc if mea_adjusted_grc > 0 else 0,
            "was_capped": was_capped,
            "cap_applied": max_rate if was_capped else None,
            "method": "integrated_depreciation_calculators_with_reconciliation",
            "construction_type_used": construction_type.value if construction_type else None,
            "reconciliation": {
                "methodology_notes": reconciled.methodology_notes,
                "confidence": reconciled.confidence,
                "requires_review": reconciled.requires_review,
            },
        }
    
    def _convert_to_property_schema(self, property_data: PropertyForValuation):
        """
        Convert PropertyForValuation to Property schema for depreciation calculators.
        """
        from ..schemas import (
            Property as PropertySchema,
            PropertyLocation,
            PropertySpecifications,
            PropertyDataQuality,
            PropertyCondition,
            GhanaRegion,
        )
        
        # Map condition
        condition_map = {
            "new": PropertyCondition.NEW,
            "excellent": PropertyCondition.EXCELLENT,
            "good": PropertyCondition.GOOD,
            "fair": PropertyCondition.FAIR,
            "poor": PropertyCondition.POOR,
            "renovation_needed": PropertyCondition.RENOVATION_NEEDED,
        }
        condition = None
        if property_data.condition:
            condition_str = property_data.condition.value if hasattr(property_data.condition, 'value') else str(property_data.condition)
            condition = condition_map.get(condition_str.lower(), PropertyCondition.FAIR)
        
        # Map region
        region_map = {
            RegionCode.GREATER_ACCRA: GhanaRegion.GREATER_ACCRA,
            RegionCode.KUMASI_METRO: GhanaRegion.KUMASI_METRO,
            RegionCode.EASTERN: GhanaRegion.EASTERN,
            RegionCode.WESTERN_CLUSTER: GhanaRegion.WESTERN_CLUSTER,
            RegionCode.NORTHERN_CLUSTER: GhanaRegion.NORTHERN_CLUSTER,
        }
        region = region_map.get(property_data.region, GhanaRegion.GREATER_ACCRA)
        
        # Build Property schema
        return PropertySchema(
            id=str(property_data.id) if property_data.id else "drc_property",
            property_type=property_data.property_type,
            location=PropertyLocation(
                region=region,
                district=getattr(property_data, 'district', None) or "Unknown",
                neighborhood=getattr(property_data, 'neighborhood', None),
                address_raw=getattr(property_data, 'address', None) or "Unknown",
            ),
            specifications=PropertySpecifications(
                year_built=property_data.year_built,
                condition=condition,
                bedrooms=getattr(property_data, 'bedrooms', None),
                bathrooms=getattr(property_data, 'bathrooms', None),
                parking_spaces=getattr(property_data, 'parking_spaces', None),
                land_size_sqm=property_data.land_area_sqm,
                built_area_sqm=property_data.building_size_sqm or property_data.built_area_sqm,
                has_air_conditioning=getattr(property_data, 'has_air_conditioning', None),
                has_generator=getattr(property_data, 'has_generator', None),
                has_borehole=getattr(property_data, 'has_borehole', None),
            ),
            data_quality=PropertyDataQuality(
                data_quality_score=0.7,
                source_reliability_score=0.7,
                completeness_score=0.7,
                accuracy_score=0.7,
                freshness_score=0.7,
                sources=["drc_valuation"],
            ),
        )
    
    def _map_asset_to_construction_type(self, asset_type: str) -> Optional[ConstructionType]:
        """
        Map specialized asset types to construction types for economic life.
        """
        # Most institutional/specialized buildings use reinforced concrete or concrete block
        asset_construction_map = {
            "institutional": ConstructionType.REINFORCED_CONCRETE,
            "government": ConstructionType.REINFORCED_CONCRETE,
            "religious": ConstructionType.CONCRETE_BLOCK,
            "church": ConstructionType.CONCRETE_BLOCK,
            "mosque": ConstructionType.CONCRETE_BLOCK,
            "community_center": ConstructionType.CONCRETE_BLOCK,
            "library": ConstructionType.REINFORCED_CONCRETE,
            "museum": ConstructionType.REINFORCED_CONCRETE,
            "heritage": ConstructionType.MIXED,  # Historic buildings vary
            "utility": ConstructionType.CONCRETE_BLOCK,
            "substation": ConstructionType.REINFORCED_CONCRETE,
            "water_treatment": ConstructionType.REINFORCED_CONCRETE,
            "sewage_treatment": ConstructionType.REINFORCED_CONCRETE,
            "power_plant": ConstructionType.STEEL_FRAME,
            "airport": ConstructionType.STEEL_FRAME,
            "port": ConstructionType.REINFORCED_CONCRETE,
            "stadium": ConstructionType.REINFORCED_CONCRETE,
            "specialized_industrial": ConstructionType.STEEL_FRAME,
        }
        return asset_construction_map.get(asset_type, ConstructionType.CONCRETE_BLOCK)

    async def _calculate_land_value(self, property_data: PropertyForValuation) -> float:
        """Calculate land value component"""
        land_area = (
            property_data.land_area_sqm or
            (property_data.plot_size_acres * 4046.86 if property_data.plot_size_acres else None) or
            1000  # Default 1000 sqm
        )
        
        # Typical land values per sqm by region for institutional use
        institutional_land_values = {
            RegionCode.GREATER_ACCRA: 1200,
            RegionCode.KUMASI_METRO: 600,
            RegionCode.EASTERN: 300,
            RegionCode.WESTERN_CLUSTER: 400,
            RegionCode.NORTHERN_CLUSTER: 150,
        }
        
        land_value_per_sqm = institutional_land_values.get(property_data.region, 400)
        
        return land_area * land_value_per_sqm

    def _calculate_confidence(
        self, 
        property_data: PropertyForValuation, 
        asset_analysis: AssetAnalysis, 
        drc: float
    ) -> float:
        """Calculate confidence score for DRC method"""
        confidence_factors = []

        # 1. Property type suitability
        if asset_analysis.asset_type in DRC_PROPERTY_TYPES:
            confidence_factors.append(0.9)
        else:
            confidence_factors.append(0.6)

        # 2. Age data availability
        if property_data.year_built:
            confidence_factors.append(0.8)
        else:
            confidence_factors.append(0.5)

        # 3. Building size data
        if property_data.building_size_sqm or property_data.built_area_sqm:
            confidence_factors.append(0.8)
        else:
            confidence_factors.append(0.5)

        # 4. Asset condition assessment
        if property_data.condition:
            confidence_factors.append(0.7)
        else:
            confidence_factors.append(0.4)

        # 5. DRC reasonableness
        if drc > 0:
            confidence_factors.append(0.8)
        else:
            confidence_factors.append(0.2)

        return sum(confidence_factors) / len(confidence_factors)

    def _calculate_method_weight(self, property_data: PropertyForValuation) -> float:
        """Calculate method weight for hybrid valuation"""
        property_type = property_data.property_type.value.lower()
        
        # Very high weight for specialized properties with no market data
        specialized_types = ["government", "religious", "church", "mosque", "utility", "heritage"]
        if any(t in property_type for t in specialized_types):
            return 0.9
        
        # High weight for institutional properties
        institutional_types = ["institutional", "hospital", "school", "library", "museum"]
        if any(t in property_type for t in institutional_types):
            return 0.7
        
        # Medium weight for specialized industrial/infrastructure
        industrial_types = ["specialized_industrial", "power_plant", "treatment", "airport", "port"]
        if any(t in property_type for t in industrial_types):
            return 0.6
        
        # Low weight for properties that might have market data
        return 0.2