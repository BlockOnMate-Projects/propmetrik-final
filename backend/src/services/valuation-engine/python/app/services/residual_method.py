"""
Residual Method Service

Implements the Residual Method for development land valuation.
Calculates land value by working backwards from completed development value.

Formula: Land Value = GDV - Development Costs - Developer's Profit

Key Features:
- Gross Development Value (GDV) estimation
- Construction cost calculation
- Professional fees and contingencies
- Finance costs modeling
- Developer's profit margin
- Time-adjusted cashflows
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

# Sale prices per sqm by property type (GHS) - for GDV calculation
SALE_PRICES_PER_SQM: Dict[str, Dict[RegionCode, float]] = {
    "house": {
        RegionCode.GREATER_ACCRA: 8500,
        RegionCode.KUMASI_METRO: 5500,
        RegionCode.EASTERN: 4000,
        RegionCode.WESTERN_CLUSTER: 5000,
        RegionCode.NORTHERN_CLUSTER: 3000,
    },
    "apartment": {
        RegionCode.GREATER_ACCRA: 9500,
        RegionCode.KUMASI_METRO: 6000,
        RegionCode.EASTERN: 4500,
        RegionCode.WESTERN_CLUSTER: 5500,
        RegionCode.NORTHERN_CLUSTER: 3500,
    },
    "townhouse": {
        RegionCode.GREATER_ACCRA: 8000,
        RegionCode.KUMASI_METRO: 5000,
        RegionCode.EASTERN: 3800,
        RegionCode.WESTERN_CLUSTER: 4500,
        RegionCode.NORTHERN_CLUSTER: 2800,
    },
    "commercial": {
        RegionCode.GREATER_ACCRA: 12000,
        RegionCode.KUMASI_METRO: 8000,
        RegionCode.EASTERN: 6000,
        RegionCode.WESTERN_CLUSTER: 7000,
        RegionCode.NORTHERN_CLUSTER: 4500,
    },
    "office": {
        RegionCode.GREATER_ACCRA: 14000,
        RegionCode.KUMASI_METRO: 9000,
        RegionCode.EASTERN: 7000,
        RegionCode.WESTERN_CLUSTER: 8000,
        RegionCode.NORTHERN_CLUSTER: 5000,
    },
    "industrial": {
        RegionCode.GREATER_ACCRA: 5000,
        RegionCode.KUMASI_METRO: 3500,
        RegionCode.EASTERN: 2800,
        RegionCode.WESTERN_CLUSTER: 3000,
        RegionCode.NORTHERN_CLUSTER: 2000,
    },
}

# Construction costs per sqm by property type (GHS)
CONSTRUCTION_COSTS_PER_SQM: Dict[str, float] = {
    "house": 4500,
    "apartment": 5000,
    "townhouse": 4800,
    "commercial": 5500,
    "office": 6500,
    "industrial": 3000,
    "warehouse": 2500,
}

# Professional fees as percentage of construction cost
PROFESSIONAL_FEES = {
    "architectural": 0.05,
    "structural": 0.025,
    "mep": 0.02,
    "quantity_surveyor": 0.02,
    "project_management": 0.03,
    "total": 0.145,  # 14.5%
}

# Other development costs
OTHER_COSTS = {
    "planning_permissions": 0.02,
    "legal_fees": 0.015,
    "marketing": 0.03,
    "sales_commission": 0.03,
    "contingency": 0.05,
}

# Finance costs
FINANCE = {
    "interest_rate": 0.25,  # 25% per annum in Ghana
    "arrangement_fee": 0.02,
    "ltc_ratio": 0.65,  # Loan to cost ratio
}

# Development timelines (months)
DEVELOPMENT_TIMELINES: Dict[str, Dict[str, int]] = {
    "house": {"construction": 18, "sales": 6},
    "apartment": {"construction": 24, "sales": 12},
    "townhouse": {"construction": 20, "sales": 8},
    "commercial": {"construction": 18, "sales": 12},
    "office": {"construction": 24, "sales": 18},
    "industrial": {"construction": 12, "sales": 6},
    "warehouse": {"construction": 10, "sales": 4},
}

# Target developer profit margins
DEVELOPER_PROFIT_MARGINS: Dict[RegionCode, float] = {
    RegionCode.GREATER_ACCRA: 0.20,  # 20% profit on cost
    RegionCode.KUMASI_METRO: 0.22,
    RegionCode.EASTERN: 0.25,
    RegionCode.WESTERN_CLUSTER: 0.23,
    RegionCode.NORTHERN_CLUSTER: 0.28,
}

# Plot coverage ratios
PLOT_COVERAGE: Dict[str, float] = {
    "house": 0.40,
    "apartment": 0.45,
    "townhouse": 0.50,
    "commercial": 0.60,
    "office": 0.50,
    "industrial": 0.50,
    "warehouse": 0.60,
}

# Floor Area Ratios (FAR)
FLOOR_AREA_RATIOS: Dict[str, float] = {
    "house": 0.8,  # Single story typically
    "apartment": 3.0,  # Multi-story
    "townhouse": 1.5,
    "commercial": 4.0,
    "office": 5.0,
    "industrial": 0.6,
    "warehouse": 0.5,
}


class ResidualCalculation:
    """Residual calculation data structure"""
    def __init__(self):
        self.gross_development_value: float = 0
        self.construction_cost: float = 0
        self.professional_fees: float = 0
        self.other_costs: float = 0
        self.finance_costs: float = 0
        self.developer_profit: float = 0
        self.total_costs: float = 0
        self.residual_land_value: float = 0
        self.land_value_per_sqm: float = 0
        self.land_value_per_acre: float = 0


class DevelopmentAssumptions:
    """Development assumptions data structure"""
    def __init__(self):
        self.developable_area_sqm: float = 0
        self.gross_floor_area: float = 0
        self.net_sellable_area: float = 0
        self.development_type: str = ""
        self.construction_duration_months: int = 0
        self.sales_period_months: int = 0
        self.total_project_duration_months: int = 0


class ResidualMethodService:
    """Residual Method Valuation Service"""

    def __init__(self, market_adapter: MarketDataAdapter):
        self.market_adapter = market_adapter

    async def calculate(
        self,
        property_data: PropertyForValuation,
        options: ValuationOptions
    ) -> MethodResult:
        """Calculate land value using Residual Method"""
        start_time = datetime.now()

        logger.debug(f"Starting Residual Method calculation for property {property_data.id}")

        try:
            # 1. Determine development assumptions
            assumptions = self._determine_development_assumptions(property_data)

            # 2. Calculate Gross Development Value (GDV)
            gdv = self._calculate_gdv(property_data, assumptions)

            # 3. Calculate construction costs
            construction_cost = await self._calculate_construction_cost(property_data, assumptions)

            # 4. Calculate professional fees
            professional_fees = construction_cost * PROFESSIONAL_FEES["total"]

            # 5. Calculate other development costs
            other_costs = self._calculate_other_costs(gdv, construction_cost)

            # 6. Calculate finance costs
            finance_costs = self._calculate_finance_costs(
                construction_cost + professional_fees,
                assumptions.construction_duration_months
            )

            # 7. Calculate developer's profit
            total_costs_ex_profit = construction_cost + professional_fees + other_costs + finance_costs
            developer_profit = self._calculate_developer_profit(total_costs_ex_profit, property_data.region)

            # 8. Calculate residual land value
            residual_land_value = gdv - construction_cost - professional_fees - other_costs - finance_costs - developer_profit

            # 9. Calculate land value metrics
            land_area = (
                property_data.land_area_sqm or
                (property_data.plot_size_acres * 4046.86 if property_data.plot_size_acres else None) or
                assumptions.developable_area_sqm
            )
            
            land_value_per_sqm = residual_land_value / land_area if land_area > 0 else 0
            land_value_per_acre = land_value_per_sqm * 4046.86

            # 10. Calculate confidence
            confidence = self._calculate_confidence(property_data, assumptions, residual_land_value)

            # 11. Calculate weight for hybrid valuation
            weight = self._calculate_weight(property_data)

            # Create calculation summary
            calculation = ResidualCalculation()
            calculation.gross_development_value = round(gdv)
            calculation.construction_cost = round(construction_cost)
            calculation.professional_fees = round(professional_fees)
            calculation.other_costs = round(other_costs)
            calculation.finance_costs = round(finance_costs)
            calculation.developer_profit = round(developer_profit)
            calculation.total_costs = round(construction_cost + professional_fees + other_costs + finance_costs + developer_profit)
            calculation.residual_land_value = round(max(0, residual_land_value))
            calculation.land_value_per_sqm = round(max(0, land_value_per_sqm))
            calculation.land_value_per_acre = round(max(0, land_value_per_acre))

            duration = (datetime.now() - start_time).total_seconds()
            logger.info(f"Residual Method completed for property {property_data.id} in {duration:.2f}s")

            return MethodResult(
                method="residual_method",
                value=round(max(0, residual_land_value)),
                confidence=confidence,
                weight=weight,
                details={
                    "calculation": calculation.__dict__,
                    "assumptions": assumptions.__dict__,
                    "cost_breakdown": {
                        "construction": round(construction_cost),
                        "professional_fees": round(professional_fees),
                        "planning_and_legal": round(other_costs * 0.35),
                        "marketing_and_sales": round(other_costs * 0.65),
                        "finance": round(finance_costs),
                        "developer_profit": round(developer_profit),
                    },
                }
            )

        except Exception as error:
            logger.error(f"Residual Method failed for property {property_data.id}: {str(error)}")
            raise error

    def _determine_development_assumptions(self, property_data: PropertyForValuation) -> DevelopmentAssumptions:
        """Determine development assumptions based on property"""
        assumptions = DevelopmentAssumptions()
        
        property_type = property_data.property_type.value
        land_area = (
            property_data.land_area_sqm or
            (property_data.plot_size_acres * 4046.86 if property_data.plot_size_acres else None) or
            500  # Default 500 sqm
        )

        plot_coverage = PLOT_COVERAGE.get(property_type, 0.40)
        far = FLOOR_AREA_RATIOS.get(property_type, 0.8)

        assumptions.developable_area_sqm = land_area
        assumptions.gross_floor_area = land_area * far
        assumptions.net_sellable_area = assumptions.gross_floor_area * 0.85  # 85% efficiency
        assumptions.development_type = property_type

        # Timeline assumptions
        timeline = DEVELOPMENT_TIMELINES.get(property_type, {"construction": 18, "sales": 6})
        assumptions.construction_duration_months = timeline["construction"]
        assumptions.sales_period_months = timeline["sales"]
        assumptions.total_project_duration_months = timeline["construction"] + timeline["sales"]

        return assumptions

    def _calculate_gdv(self, property_data: PropertyForValuation, assumptions: DevelopmentAssumptions) -> float:
        """Calculate Gross Development Value"""
        property_type = property_data.property_type.value
        region = property_data.region

        if property_type in SALE_PRICES_PER_SQM and region in SALE_PRICES_PER_SQM[property_type]:
            price_per_sqm = SALE_PRICES_PER_SQM[property_type][region]
        else:
            # Use house prices as default
            price_per_sqm = SALE_PRICES_PER_SQM["house"].get(region, 4000)

        return assumptions.net_sellable_area * price_per_sqm

    async def _calculate_construction_cost(
        self, 
        property_data: PropertyForValuation, 
        assumptions: DevelopmentAssumptions
    ) -> float:
        """Calculate total construction cost"""
        property_type = property_data.property_type.value
        
        # Base construction cost per sqm
        base_cost = CONSTRUCTION_COSTS_PER_SQM.get(property_type, 4500)
        
        # Regional adjustment
        regional_multipliers = {
            RegionCode.GREATER_ACCRA: 1.15,
            RegionCode.KUMASI_METRO: 1.00,
            RegionCode.EASTERN: 0.90,
            RegionCode.WESTERN_CLUSTER: 1.00,
            RegionCode.NORTHERN_CLUSTER: 0.85,
        }
        
        regional_factor = regional_multipliers.get(property_data.region, 1.00)
        adjusted_cost = base_cost * regional_factor
        
        return assumptions.gross_floor_area * adjusted_cost

    def _calculate_other_costs(self, gdv: float, construction_cost: float) -> float:
        """Calculate other development costs"""
        total_other_costs = 0
        
        # Planning permissions and legal fees (% of construction)
        total_other_costs += construction_cost * (OTHER_COSTS["planning_permissions"] + OTHER_COSTS["legal_fees"])
        
        # Marketing and sales commission (% of GDV)
        total_other_costs += gdv * (OTHER_COSTS["marketing"] + OTHER_COSTS["sales_commission"])
        
        # Contingency (% of construction)
        total_other_costs += construction_cost * OTHER_COSTS["contingency"]
        
        return total_other_costs

    def _calculate_finance_costs(self, development_cost: float, duration_months: int) -> float:
        """Calculate finance costs"""
        loan_amount = development_cost * FINANCE["ltc_ratio"]
        arrangement_fee = loan_amount * FINANCE["arrangement_fee"]
        
        # Monthly interest calculation
        monthly_rate = FINANCE["interest_rate"] / 12
        total_interest = 0
        
        # Assume costs are drawn down evenly over construction period
        for month in range(duration_months):
            outstanding_balance = loan_amount * (month + 1) / duration_months
            total_interest += outstanding_balance * monthly_rate
        
        return arrangement_fee + total_interest

    def _calculate_developer_profit(self, total_costs: float, region: RegionCode) -> float:
        """Calculate developer's profit"""
        profit_margin = DEVELOPER_PROFIT_MARGINS.get(region, 0.22)
        return total_costs * profit_margin

    def _calculate_confidence(
        self, 
        property_data: PropertyForValuation, 
        assumptions: DevelopmentAssumptions, 
        residual_value: float
    ) -> float:
        """Calculate confidence score for residual method"""
        confidence_factors = []

        # 1. Data completeness
        if property_data.land_area_sqm or property_data.plot_size_acres:
            confidence_factors.append(0.8)
        else:
            confidence_factors.append(0.4)

        # 2. Property type suitability
        suitable_types = [PropertyType.LAND, PropertyType.RESIDENTIAL_LAND, PropertyType.COMMERCIAL_LAND]
        if property_data.property_type in suitable_types:
            confidence_factors.append(0.9)
        else:
            confidence_factors.append(0.6)

        # 3. Residual value reasonableness
        if residual_value > 0:
            confidence_factors.append(0.8)
        else:
            confidence_factors.append(0.2)

        # 4. Development assumptions
        if assumptions.developable_area_sqm > 100:  # Reasonable size
            confidence_factors.append(0.7)
        else:
            confidence_factors.append(0.5)

        return sum(confidence_factors) / len(confidence_factors)

    def _calculate_weight(self, property_data: PropertyForValuation) -> float:
        """Calculate method weight for hybrid valuation"""
        # Residual method is most suitable for land and development properties
        if property_data.property_type in [PropertyType.LAND, PropertyType.RESIDENTIAL_LAND, PropertyType.COMMERCIAL_LAND]:
            return 0.7
        elif property_data.property_type in [PropertyType.MIXED_USE]:
            return 0.3
        else:
            return 0.1