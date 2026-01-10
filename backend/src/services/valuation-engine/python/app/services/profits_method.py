"""
Profits Method Service

Implements the Profits Method for trading property valuation.
Used for properties where value is directly related to trading potential.

Typical Applications:
- Hotels and hospitality
- Healthcare facilities
- Educational institutions
- Petrol/fuel stations
- Restaurants and entertainment venues

Key Features:
- Revenue analysis and projections
- Operating cost structures by property type
- Maintainable Operating Profit (MOP) calculation
- Capitalization of MOP
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

# Revenue benchmarks per unit/sqm by property type (GHS per year)
REVENUE_BENCHMARKS: Dict[str, Dict[str, Dict[RegionCode, float]]] = {
    "hotel": {
        "metric": "per_room_year",
        "value": {
            RegionCode.GREATER_ACCRA: 120000,  # ~$8,000/room/year average
            RegionCode.KUMASI_METRO: 72000,
            RegionCode.EASTERN: 48000,
            RegionCode.WESTERN_CLUSTER: 60000,
            RegionCode.NORTHERN_CLUSTER: 36000,
        },
    },
    "hospital": {
        "metric": "per_bed_year",
        "value": {
            RegionCode.GREATER_ACCRA: 180000,
            RegionCode.KUMASI_METRO: 120000,
            RegionCode.EASTERN: 84000,
            RegionCode.WESTERN_CLUSTER: 96000,
            RegionCode.NORTHERN_CLUSTER: 60000,
        },
    },
    "school": {
        "metric": "per_student_year",
        "value": {
            RegionCode.GREATER_ACCRA: 24000,
            RegionCode.KUMASI_METRO: 15000,
            RegionCode.EASTERN: 9600,
            RegionCode.WESTERN_CLUSTER: 12000,
            RegionCode.NORTHERN_CLUSTER: 6000,
        },
    },
    "restaurant": {
        "metric": "per_sqm_year",
        "value": {
            RegionCode.GREATER_ACCRA: 6000,
            RegionCode.KUMASI_METRO: 3600,
            RegionCode.EASTERN: 2400,
            RegionCode.WESTERN_CLUSTER: 3000,
            RegionCode.NORTHERN_CLUSTER: 1800,
        },
    },
    "fuel_station": {
        "metric": "per_pump_year",
        "value": {
            RegionCode.GREATER_ACCRA: 480000,
            RegionCode.KUMASI_METRO: 360000,
            RegionCode.EASTERN: 240000,
            RegionCode.WESTERN_CLUSTER: 300000,
            RegionCode.NORTHERN_CLUSTER: 180000,
        },
    },
    "healthcare": {
        "metric": "per_sqm_year",
        "value": {
            RegionCode.GREATER_ACCRA: 4800,
            RegionCode.KUMASI_METRO: 3000,
            RegionCode.EASTERN: 2100,
            RegionCode.WESTERN_CLUSTER: 2400,
            RegionCode.NORTHERN_CLUSTER: 1500,
        },
    },
}

# Operating cost ratios by property type
OPERATING_COST_RATIOS: Dict[str, Dict[str, float]] = {
    "hotel": {
        "cost_of_sales": 0.25,
        "staff_costs": 0.30,
        "utilities": 0.08,
        "maintenance": 0.05,
        "admin": 0.05,
        "marketing": 0.05,
        "total": 0.78,
    },
    "hospital": {
        "cost_of_sales": 0.30,
        "staff_costs": 0.40,
        "utilities": 0.05,
        "maintenance": 0.04,
        "admin": 0.05,
        "total": 0.84,
    },
    "school": {
        "staff_costs": 0.55,
        "utilities": 0.05,
        "maintenance": 0.05,
        "admin": 0.08,
        "total": 0.73,
    },
    "restaurant": {
        "cost_of_sales": 0.35,
        "staff_costs": 0.25,
        "utilities": 0.06,
        "maintenance": 0.03,
        "admin": 0.05,
        "total": 0.74,
    },
    "fuel_station": {
        "cost_of_sales": 0.85,
        "staff_costs": 0.04,
        "utilities": 0.02,
        "maintenance": 0.02,
        "total": 0.93,
    },
    "healthcare": {
        "cost_of_sales": 0.25,
        "staff_costs": 0.45,
        "utilities": 0.05,
        "maintenance": 0.04,
        "admin": 0.05,
        "total": 0.84,
    },
}

# Capitalization rates for profits method
PROFITS_CAP_RATES: Dict[str, Dict[RegionCode, float]] = {
    "hotel": {
        RegionCode.GREATER_ACCRA: 0.12,
        RegionCode.KUMASI_METRO: 0.14,
        RegionCode.EASTERN: 0.16,
        RegionCode.WESTERN_CLUSTER: 0.15,
        RegionCode.NORTHERN_CLUSTER: 0.18,
    },
    "hospital": {
        RegionCode.GREATER_ACCRA: 0.10,
        RegionCode.KUMASI_METRO: 0.12,
        RegionCode.EASTERN: 0.14,
        RegionCode.WESTERN_CLUSTER: 0.13,
        RegionCode.NORTHERN_CLUSTER: 0.16,
    },
    "school": {
        RegionCode.GREATER_ACCRA: 0.11,
        RegionCode.KUMASI_METRO: 0.13,
        RegionCode.EASTERN: 0.15,
        RegionCode.WESTERN_CLUSTER: 0.14,
        RegionCode.NORTHERN_CLUSTER: 0.17,
    },
    "restaurant": {
        RegionCode.GREATER_ACCRA: 0.15,
        RegionCode.KUMASI_METRO: 0.17,
        RegionCode.EASTERN: 0.19,
        RegionCode.WESTERN_CLUSTER: 0.18,
        RegionCode.NORTHERN_CLUSTER: 0.21,
    },
    "fuel_station": {
        RegionCode.GREATER_ACCRA: 0.14,
        RegionCode.KUMASI_METRO: 0.16,
        RegionCode.EASTERN: 0.18,
        RegionCode.WESTERN_CLUSTER: 0.17,
        RegionCode.NORTHERN_CLUSTER: 0.20,
    },
    "healthcare": {
        RegionCode.GREATER_ACCRA: 0.11,
        RegionCode.KUMASI_METRO: 0.13,
        RegionCode.EASTERN: 0.15,
        RegionCode.WESTERN_CLUSTER: 0.14,
        RegionCode.NORTHERN_CLUSTER: 0.17,
    },
}

# Default values for unknown property types
DEFAULT_REVENUE_PER_SQM = 3000  # GHS per sqm per year
DEFAULT_OPERATING_RATIO = 0.75
DEFAULT_CAP_RATE = 0.14

# Property type mapping for profits method
PROFITS_PROPERTY_TYPES = [
    "hotel", "hospital", "school", "restaurant", "fuel_station", 
    "healthcare", "entertainment", "cinema", "gym", "spa"
]


class ProfitsCalculation:
    """Profits method calculation data structure"""
    def __init__(self):
        self.gross_revenue: float = 0
        self.operating_costs: float = 0
        self.maintainable_profit: float = 0
        self.capitalization_rate: float = 0
        self.property_value: float = 0
        self.tenant_improvements_value: float = 0
        self.total_property_value: float = 0


class RevenueAnalysis:
    """Revenue analysis data structure"""
    def __init__(self):
        self.revenue_metric: str = ""
        self.revenue_units: float = 0
        self.revenue_per_unit: float = 0
        self.gross_annual_revenue: float = 0
        self.occupancy_rate: float = 0
        self.effective_gross_revenue: float = 0


class OperatingCostAnalysis:
    """Operating cost analysis data structure"""
    def __init__(self):
        self.cost_of_sales: float = 0
        self.staff_costs: float = 0
        self.utilities: float = 0
        self.maintenance: float = 0
        self.admin: float = 0
        self.marketing: float = 0
        self.other: float = 0
        self.total_operating_costs: float = 0
        self.operating_ratio: float = 0


class ProfitsMethodService:
    """Profits Method Valuation Service"""

    def __init__(self, market_adapter: MarketDataAdapter):
        self.market_adapter = market_adapter

    async def calculate(
        self,
        property_data: PropertyForValuation,
        options: ValuationOptions
    ) -> MethodResult:
        """Calculate property value using Profits Method"""
        start_time = datetime.now()

        logger.debug(f"Starting Profits Method calculation for property {property_data.id}")

        try:
            # 1. Check if property is suitable for profits method
            if not self._is_suitable_for_profits_method(property_data):
                return MethodResult(
                    method="profits_method",
                    value=0,
                    confidence=0.0,
                    weight=0.0,
                    details={"error": "Property not suitable for profits method"}
                )

            # 2. Analyze revenue potential
            revenue_analysis = await self._analyze_revenue(property_data)

            # 3. Analyze operating costs
            cost_analysis = self._analyze_operating_costs(revenue_analysis.effective_gross_revenue, property_data)

            # 4. Calculate Maintainable Operating Profit (MOP)
            mop = revenue_analysis.effective_gross_revenue - cost_analysis.total_operating_costs

            # 5. Get capitalization rate
            cap_rate = self._get_profits_cap_rate(property_data)

            # 6. Calculate property value (MOP / Cap Rate)
            property_value = mop / cap_rate if cap_rate > 0 and mop > 0 else 0

            # 7. Add tenant improvements value if applicable
            tenant_improvements = await self._calculate_tenant_improvements(property_data)
            total_value = property_value + tenant_improvements

            # 8. Calculate confidence score
            confidence = self._calculate_confidence(property_data, revenue_analysis, mop)

            # 9. Calculate method weight
            weight = self._calculate_method_weight(property_data)

            # Create calculation summary
            calculation = ProfitsCalculation()
            calculation.gross_revenue = round(revenue_analysis.gross_annual_revenue)
            calculation.operating_costs = round(cost_analysis.total_operating_costs)
            calculation.maintainable_profit = round(mop)
            calculation.capitalization_rate = cap_rate
            calculation.property_value = round(property_value)
            calculation.tenant_improvements_value = round(tenant_improvements)
            calculation.total_property_value = round(total_value)

            duration = (datetime.now() - start_time).total_seconds()
            logger.info(f"Profits Method completed for property {property_data.id} in {duration:.2f}s")

            return MethodResult(
                method="profits_method",
                value=round(max(0, total_value)),
                confidence=confidence,
                weight=weight,
                details={
                    "calculation": calculation.__dict__,
                    "revenue_analysis": revenue_analysis.__dict__,
                    "cost_analysis": cost_analysis.__dict__,
                    "key_metrics": {
                        "operating_margin": (mop / revenue_analysis.effective_gross_revenue) if revenue_analysis.effective_gross_revenue > 0 else 0,
                        "revenue_multiple": total_value / revenue_analysis.effective_gross_revenue if revenue_analysis.effective_gross_revenue > 0 else 0,
                        "profit_yield": (mop / total_value) if total_value > 0 else 0,
                    }
                }
            )

        except Exception as error:
            logger.error(f"Profits Method failed for property {property_data.id}: {str(error)}")
            raise error

    def _is_suitable_for_profits_method(self, property_data: PropertyForValuation) -> bool:
        """Check if property is suitable for profits method"""
        property_type = property_data.property_type.value.lower()
        
        # Direct match
        if property_type in PROFITS_PROPERTY_TYPES:
            return True
            
        # Check property type keywords
        suitable_keywords = ["hotel", "hospital", "school", "restaurant", "fuel", "healthcare", "clinic"]
        return any(keyword in property_type for keyword in suitable_keywords)

    async def _analyze_revenue(self, property_data: PropertyForValuation) -> RevenueAnalysis:
        """Analyze revenue potential"""
        analysis = RevenueAnalysis()
        property_type = property_data.property_type.value.lower()
        region = property_data.region

        # Get revenue benchmark data
        if property_type in REVENUE_BENCHMARKS:
            benchmark_data = REVENUE_BENCHMARKS[property_type]
            analysis.revenue_metric = benchmark_data["metric"]
            
            if region in benchmark_data["value"]:
                analysis.revenue_per_unit = benchmark_data["value"][region]
            else:
                # Use average of available regions
                analysis.revenue_per_unit = sum(benchmark_data["value"].values()) / len(benchmark_data["value"])
        else:
            # Use per sqm default
            analysis.revenue_metric = "per_sqm_year"
            analysis.revenue_per_unit = DEFAULT_REVENUE_PER_SQM

        # Determine revenue units based on metric
        analysis.revenue_units = self._get_revenue_units(property_data, analysis.revenue_metric)
        
        # Calculate gross revenue
        analysis.gross_annual_revenue = analysis.revenue_units * analysis.revenue_per_unit

        # Apply occupancy rate
        analysis.occupancy_rate = self._get_occupancy_rate(property_data)
        analysis.effective_gross_revenue = analysis.gross_annual_revenue * analysis.occupancy_rate

        return analysis

    def _get_revenue_units(self, property_data: PropertyForValuation, metric: str) -> float:
        """Get revenue units based on metric type"""
        if metric == "per_room_year":
            # Estimate rooms for hotel (assume 25 sqm per room)
            building_size = property_data.building_size_sqm or property_data.built_area_sqm or 500
            return max(1, building_size / 25)
        
        elif metric == "per_bed_year":
            # Estimate beds for hospital (assume 40 sqm per bed including common areas)
            building_size = property_data.building_size_sqm or property_data.built_area_sqm or 500
            return max(1, building_size / 40)
        
        elif metric == "per_student_year":
            # Estimate students for school (assume 5 sqm per student)
            building_size = property_data.building_size_sqm or property_data.built_area_sqm or 500
            return max(1, building_size / 5)
        
        elif metric == "per_pump_year":
            # Default number of pumps for fuel station
            return 6  # Typical fuel station has 6-8 pumps
        
        else:  # per_sqm_year
            return property_data.building_size_sqm or property_data.built_area_sqm or 500

    def _get_occupancy_rate(self, property_data: PropertyForValuation) -> float:
        """Get typical occupancy rate by property type"""
        occupancy_rates = {
            "hotel": 0.65,
            "hospital": 0.80,
            "school": 0.85,
            "restaurant": 0.70,
            "fuel_station": 1.00,  # Always operational
            "healthcare": 0.75,
        }
        
        property_type = property_data.property_type.value.lower()
        return occupancy_rates.get(property_type, 0.70)

    def _analyze_operating_costs(self, gross_revenue: float, property_data: PropertyForValuation) -> OperatingCostAnalysis:
        """Analyze operating cost structure"""
        analysis = OperatingCostAnalysis()
        property_type = property_data.property_type.value.lower()

        # Get cost ratios for property type
        if property_type in OPERATING_COST_RATIOS:
            cost_ratios = OPERATING_COST_RATIOS[property_type]
        else:
            # Use default ratios
            cost_ratios = {
                "cost_of_sales": 0.30,
                "staff_costs": 0.25,
                "utilities": 0.06,
                "maintenance": 0.05,
                "admin": 0.05,
                "marketing": 0.04,
                "total": DEFAULT_OPERATING_RATIO,
            }

        # Calculate individual cost components
        analysis.cost_of_sales = gross_revenue * cost_ratios.get("cost_of_sales", 0)
        analysis.staff_costs = gross_revenue * cost_ratios.get("staff_costs", 0)
        analysis.utilities = gross_revenue * cost_ratios.get("utilities", 0)
        analysis.maintenance = gross_revenue * cost_ratios.get("maintenance", 0)
        analysis.admin = gross_revenue * cost_ratios.get("admin", 0)
        analysis.marketing = gross_revenue * cost_ratios.get("marketing", 0)

        # Calculate total
        analysis.total_operating_costs = gross_revenue * cost_ratios["total"]
        analysis.operating_ratio = cost_ratios["total"]

        return analysis

    def _get_profits_cap_rate(self, property_data: PropertyForValuation) -> float:
        """Get capitalization rate for profits method"""
        property_type = property_data.property_type.value.lower()
        region = property_data.region

        if property_type in PROFITS_CAP_RATES and region in PROFITS_CAP_RATES[property_type]:
            return PROFITS_CAP_RATES[property_type][region]
        else:
            return DEFAULT_CAP_RATE

    async def _calculate_tenant_improvements(self, property_data: PropertyForValuation) -> float:
        """Calculate value of tenant improvements and fixtures"""
        building_size = property_data.building_size_sqm or property_data.built_area_sqm or 500
        property_type = property_data.property_type.value.lower()

        # Typical tenant improvement costs per sqm by property type
        ti_costs_per_sqm = {
            "hotel": 2000,  # Furniture, fixtures, equipment
            "restaurant": 1500,
            "healthcare": 1000,
            "hospital": 2500,
            "school": 500,
            "fuel_station": 1000,
        }

        cost_per_sqm = ti_costs_per_sqm.get(property_type, 800)
        return building_size * cost_per_sqm * 0.6  # 60% of new cost

    def _calculate_confidence(
        self, 
        property_data: PropertyForValuation, 
        revenue_analysis: RevenueAnalysis, 
        mop: float
    ) -> float:
        """Calculate confidence score for profits method"""
        confidence_factors = []

        # 1. Property type suitability
        property_type = property_data.property_type.value.lower()
        if property_type in PROFITS_PROPERTY_TYPES:
            confidence_factors.append(0.9)
        else:
            confidence_factors.append(0.6)

        # 2. Revenue reasonableness
        if revenue_analysis.effective_gross_revenue > 0:
            confidence_factors.append(0.8)
        else:
            confidence_factors.append(0.3)

        # 3. Profit margin reasonableness
        if mop > 0 and revenue_analysis.effective_gross_revenue > 0:
            margin = mop / revenue_analysis.effective_gross_revenue
            if 0.1 <= margin <= 0.5:  # 10-50% operating margin
                confidence_factors.append(0.8)
            else:
                confidence_factors.append(0.5)
        else:
            confidence_factors.append(0.3)

        # 4. Building size data availability
        if property_data.building_size_sqm or property_data.built_area_sqm:
            confidence_factors.append(0.7)
        else:
            confidence_factors.append(0.4)

        return sum(confidence_factors) / len(confidence_factors)

    def _calculate_method_weight(self, property_data: PropertyForValuation) -> float:
        """Calculate method weight for hybrid valuation"""
        property_type = property_data.property_type.value.lower()
        
        # High weight for properties where profits method is primary
        high_weight_types = ["hotel", "restaurant", "fuel_station"]
        if any(t in property_type for t in high_weight_types):
            return 0.8
        
        # Medium weight for institutional properties
        medium_weight_types = ["hospital", "school", "healthcare", "clinic"]
        if any(t in property_type for t in medium_weight_types):
            return 0.5
        
        # Low weight for other properties
        return 0.1