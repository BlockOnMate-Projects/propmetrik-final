"""
DRC (Depreciated Replacement Cost) Method Service

Implements the Depreciated Replacement Cost method for specialized properties.
Used for properties that rarely trade and have no comparable market data.

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
from datetime import datetime, timedelta
import logging

from ..models.schemas import (
    PropertyForValuation, ValuationOptions, MethodResult, 
    RegionCode, PropertyType
)
from ..adapters.market_data import MarketDataAdapter

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
    """DRC Method Valuation Service"""

    def __init__(self, market_adapter: MarketDataAdapter):
        self.market_adapter = market_adapter

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
        """Calculate Gross Replacement Cost"""
        building_size = (
            property_data.building_size_sqm or
            property_data.built_area_sqm or
            property_data.total_area_sqm or
            500  # Default size
        )
        
        # Base cost per sqm for asset type
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
    ) -> Dict[str, float]:
        """Calculate various forms of depreciation"""
        
        # 1. Physical Depreciation (based on age and condition)
        age_ratio = asset_analysis.effective_age_years / asset_analysis.useful_life_years
        
        # Use S-curve depreciation for specialized assets
        if age_ratio <= 0.1:
            physical_depreciation_rate = age_ratio * 0.5  # Slow initial depreciation
        elif age_ratio <= 0.7:
            physical_depreciation_rate = 0.05 + (age_ratio - 0.1) * 0.75  # Linear middle period
        else:
            physical_depreciation_rate = 0.50 + (age_ratio - 0.7) * 1.67  # Accelerated final period
        
        physical_depreciation_rate = min(0.95, physical_depreciation_rate)  # Cap at 95%
        physical_depreciation = mea_adjusted_grc * physical_depreciation_rate
        
        # 2. Functional Obsolescence
        functional_obsolescence_rate = 0
        
        # Higher functional obsolescence for older technology-dependent buildings
        if asset_analysis.asset_type in ["substation", "power_plant", "water_treatment"]:
            if asset_analysis.effective_age_years > 20:
                functional_obsolescence_rate = min(0.20, (asset_analysis.effective_age_years - 20) * 0.01)
        elif asset_analysis.asset_type in ["library", "museum"]:
            if asset_analysis.effective_age_years > 15:
                functional_obsolescence_rate = min(0.15, (asset_analysis.effective_age_years - 15) * 0.01)
        
        functional_obsolescence = mea_adjusted_grc * functional_obsolescence_rate
        
        # 3. Economic Obsolescence (market conditions)
        economic_obsolescence_rate = 0
        
        # Apply economic obsolescence based on location and demand
        if property_data.region in [RegionCode.NORTHERN_CLUSTER, RegionCode.EASTERN]:
            economic_obsolescence_rate = 0.05  # Lower demand areas
        elif asset_analysis.asset_type in ["stadium", "specialized_industrial"]:
            economic_obsolescence_rate = 0.10  # Specialized uses with limited demand
        
        economic_obsolescence = mea_adjusted_grc * economic_obsolescence_rate
        
        # Total depreciation (but don't double-count)
        total_depreciation = physical_depreciation + functional_obsolescence + economic_obsolescence
        total_depreciation = min(total_depreciation, mea_adjusted_grc * 0.95)  # Cap at 95%
        
        return {
            "physical": physical_depreciation,
            "functional": functional_obsolescence,
            "economic": economic_obsolescence,
            "total": total_depreciation,
        }

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