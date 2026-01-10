"""
Income Approach Service

Implements the Income Approach to property valuation.
Calculates value based on income-generating potential.

Methods:
- Direct Capitalization (NOI / Cap Rate)
- Discounted Cash Flow (DCF)
- Gross Rent Multiplier (GRM)

Key Features:
- Market rental analysis for Ghana regions
- Cap rate derivation from comparable sales
- DCF with 10-year projection
- Expense ratio analysis
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

# Market rental rates per sqm/month by property type and region (GHS)
RENTAL_RATES: Dict[str, Dict[RegionCode, float]] = {
    "house": {
        RegionCode.GREATER_ACCRA: 35,
        RegionCode.KUMASI_METRO: 20,
        RegionCode.EASTERN: 15,
        RegionCode.WESTERN_CLUSTER: 18,
        RegionCode.NORTHERN_CLUSTER: 10,
    },
    "apartment": {
        RegionCode.GREATER_ACCRA: 40,
        RegionCode.KUMASI_METRO: 25,
        RegionCode.EASTERN: 18,
        RegionCode.WESTERN_CLUSTER: 22,
        RegionCode.NORTHERN_CLUSTER: 12,
    },
    "villa": {
        RegionCode.GREATER_ACCRA: 55,
        RegionCode.KUMASI_METRO: 35,
        RegionCode.EASTERN: 25,
        RegionCode.WESTERN_CLUSTER: 30,
        RegionCode.NORTHERN_CLUSTER: 18,
    },
    "commercial": {
        RegionCode.GREATER_ACCRA: 60,
        RegionCode.KUMASI_METRO: 35,
        RegionCode.EASTERN: 25,
        RegionCode.WESTERN_CLUSTER: 30,
        RegionCode.NORTHERN_CLUSTER: 15,
    },
    "office": {
        RegionCode.GREATER_ACCRA: 70,
        RegionCode.KUMASI_METRO: 40,
        RegionCode.EASTERN: 30,
        RegionCode.WESTERN_CLUSTER: 35,
        RegionCode.NORTHERN_CLUSTER: 20,
    },
    "industrial": {
        RegionCode.GREATER_ACCRA: 25,
        RegionCode.KUMASI_METRO: 15,
        RegionCode.EASTERN: 10,
        RegionCode.WESTERN_CLUSTER: 12,
        RegionCode.NORTHERN_CLUSTER: 8,
    },
    "warehouse": {
        RegionCode.GREATER_ACCRA: 20,
        RegionCode.KUMASI_METRO: 12,
        RegionCode.EASTERN: 8,
        RegionCode.WESTERN_CLUSTER: 10,
        RegionCode.NORTHERN_CLUSTER: 6,
    },
    "hotel": {
        RegionCode.GREATER_ACCRA: 100,
        RegionCode.KUMASI_METRO: 60,
        RegionCode.EASTERN: 40,
        RegionCode.WESTERN_CLUSTER: 50,
        RegionCode.NORTHERN_CLUSTER: 30,
    },
}

# Cap rates by property type and region (%)
CAP_RATES: Dict[str, Dict[RegionCode, float]] = {
    "house": {
        RegionCode.GREATER_ACCRA: 6.5,
        RegionCode.KUMASI_METRO: 8.0,
        RegionCode.EASTERN: 9.5,
        RegionCode.WESTERN_CLUSTER: 8.5,
        RegionCode.NORTHERN_CLUSTER: 10.0,
    },
    "apartment": {
        RegionCode.GREATER_ACCRA: 7.0,
        RegionCode.KUMASI_METRO: 8.5,
        RegionCode.EASTERN: 10.0,
        RegionCode.WESTERN_CLUSTER: 9.0,
        RegionCode.NORTHERN_CLUSTER: 10.5,
    },
    "commercial": {
        RegionCode.GREATER_ACCRA: 9.0,
        RegionCode.KUMASI_METRO: 10.5,
        RegionCode.EASTERN: 12.0,
        RegionCode.WESTERN_CLUSTER: 11.0,
        RegionCode.NORTHERN_CLUSTER: 13.0,
    },
    "office": {
        RegionCode.GREATER_ACCRA: 8.5,
        RegionCode.KUMASI_METRO: 10.0,
        RegionCode.EASTERN: 11.5,
        RegionCode.WESTERN_CLUSTER: 10.5,
        RegionCode.NORTHERN_CLUSTER: 12.5,
    },
    "industrial": {
        RegionCode.GREATER_ACCRA: 10.0,
        RegionCode.KUMASI_METRO: 11.5,
        RegionCode.EASTERN: 13.0,
        RegionCode.WESTERN_CLUSTER: 12.0,
        RegionCode.NORTHERN_CLUSTER: 14.0,
    },
    "hotel": {
        RegionCode.GREATER_ACCRA: 11.0,
        RegionCode.KUMASI_METRO: 12.5,
        RegionCode.EASTERN: 14.0,
        RegionCode.WESTERN_CLUSTER: 13.0,
        RegionCode.NORTHERN_CLUSTER: 15.0,
    },
}

# Default cap rate if not found
DEFAULT_CAP_RATE = 9.0

# Typical expense ratios by property type
EXPENSE_RATIOS: Dict[str, float] = {
    "house": 0.25,
    "apartment": 0.35,
    "townhouse": 0.28,
    "villa": 0.30,
    "commercial": 0.35,
    "office": 0.40,
    "industrial": 0.25,
    "warehouse": 0.20,
    "hotel": 0.55,
    "hospital": 0.50,
}

# Vacancy rates by property type
VACANCY_RATES: Dict[str, float] = {
    "house": 0.05,
    "apartment": 0.08,
    "townhouse": 0.06,
    "villa": 0.07,
    "commercial": 0.10,
    "office": 0.12,
    "industrial": 0.08,
    "warehouse": 0.06,
    "hotel": 0.30,  # Higher for hotels
}

# Annual rent growth rates by region
RENT_GROWTH_RATES: Dict[RegionCode, float] = {
    RegionCode.GREATER_ACCRA: 0.08,
    RegionCode.KUMASI_METRO: 0.06,
    RegionCode.EASTERN: 0.04,
    RegionCode.WESTERN_CLUSTER: 0.05,
    RegionCode.NORTHERN_CLUSTER: 0.03,
}

# Discount rates for DCF
DISCOUNT_RATES: Dict[RegionCode, float] = {
    RegionCode.GREATER_ACCRA: 0.14,
    RegionCode.KUMASI_METRO: 0.15,
    RegionCode.EASTERN: 0.16,
    RegionCode.WESTERN_CLUSTER: 0.155,
    RegionCode.NORTHERN_CLUSTER: 0.17,
}

# Terminal cap rate additions (basis points above going-in cap)
TERMINAL_CAP_SPREAD = 0.005  # 50 basis points


class IncomeApproachService:
    """Income Approach Valuation Service"""

    def __init__(self, market_adapter: MarketDataAdapter):
        self.market_adapter = market_adapter

    async def calculate(
        self,
        property_data: PropertyForValuation,
        options: ValuationOptions
    ) -> MethodResult:
        """Calculate property value using Income Approach"""
        start_time = datetime.now()

        logger.debug(f"Starting Income Approach calculation for property {property_data.id}")

        try:
            # 1. Determine if property is suitable for income approach
            if not self._is_suitable_for_income_approach(property_data):
                return MethodResult(
                    method="income_approach",
                    value=0,
                    confidence=0.0,
                    weight=0.0,
                    details={"error": "Property not suitable for income approach"}
                )

            # 2. Calculate market rent
            market_rent = await self._calculate_market_rent(property_data)

            # 3. Calculate expenses
            expenses = self._calculate_expenses(market_rent, property_data)

            # 4. Calculate Net Operating Income (NOI)
            vacancy_allowance = market_rent * 12 * VACANCY_RATES.get(property_data.property_type.value, 0.08)
            effective_gross_income = (market_rent * 12) - vacancy_allowance
            noi = effective_gross_income - expenses["total_annual"]

            # 5. Direct Capitalization
            cap_rate = self._get_cap_rate(property_data)
            direct_cap_value = noi / cap_rate if cap_rate > 0 else 0

            # 6. DCF Analysis (10-year)
            dcf_value = await self._calculate_dcf_value(
                property_data, market_rent, expenses["monthly"]
            )

            # 7. Gross Rent Multiplier
            grm_value = await self._calculate_grm_value(property_data, market_rent)

            # 8. Weight the results
            final_value = self._weight_income_methods(
                direct_cap_value, dcf_value, grm_value, property_data
            )

            # 9. Calculate confidence score
            confidence = self._calculate_confidence(property_data, market_rent, cap_rate)

            # 10. Calculate method weight for hybrid valuation
            weight = self._calculate_method_weight(property_data)

            duration = (datetime.now() - start_time).total_seconds()
            logger.info(f"Income Approach completed for property {property_data.id} in {duration:.2f}s")

            return MethodResult(
                method="income_approach",
                value=round(final_value),
                confidence=confidence,
                weight=weight,
                details={
                    "market_rent_monthly": round(market_rent),
                    "effective_gross_income": round(effective_gross_income),
                    "noi": round(noi),
                    "cap_rate": cap_rate,
                    "direct_cap_value": round(direct_cap_value),
                    "dcf_value": round(dcf_value),
                    "grm_value": round(grm_value),
                    "expense_breakdown": expenses,
                    "vacancy_rate": VACANCY_RATES.get(property_data.property_type.value, 0.08),
                    "calculation_methods": {
                        "direct_capitalization": {
                            "weight": 0.5,
                            "value": round(direct_cap_value)
                        },
                        "dcf_analysis": {
                            "weight": 0.3,
                            "value": round(dcf_value)
                        },
                        "grm": {
                            "weight": 0.2,
                            "value": round(grm_value)
                        }
                    }
                }
            )

        except Exception as error:
            logger.error(f"Income Approach failed for property {property_data.id}: {str(error)}")
            raise error

    def _is_suitable_for_income_approach(self, property_data: PropertyForValuation) -> bool:
        """Check if property is suitable for income approach"""
        income_suitable_types = [
            PropertyType.APARTMENT, PropertyType.COMMERCIAL, PropertyType.OFFICE,
            PropertyType.RETAIL, PropertyType.INDUSTRIAL, PropertyType.WAREHOUSE,
            PropertyType.HOTEL, PropertyType.MIXED_USE
        ]
        return property_data.property_type in income_suitable_types

    async def _calculate_market_rent(self, property_data: PropertyForValuation) -> float:
        """Calculate estimated market rent per month"""
        if property_data.market_rent and property_data.market_rent > 0:
            return property_data.market_rent

        # Use rental rate per sqm for property type and region
        property_type = property_data.property_type.value
        region = property_data.region
        
        if property_type in RENTAL_RATES and region in RENTAL_RATES[property_type]:
            rate_per_sqm = RENTAL_RATES[property_type][region]
        else:
            # Use commercial rates as default
            rate_per_sqm = RENTAL_RATES["commercial"].get(region, 30)

        # Calculate based on building size
        building_size = (
            property_data.building_size_sqm or 
            property_data.built_area_sqm or 
            property_data.total_area_sqm or 
            100  # Default size
        )

        return rate_per_sqm * building_size

    def _calculate_expenses(self, market_rent: float, property_data: PropertyForValuation) -> Dict[str, float]:
        """Calculate property operating expenses"""
        annual_rent = market_rent * 12
        property_type = property_data.property_type.value
        
        expense_ratio = EXPENSE_RATIOS.get(property_type, 0.35)
        total_annual_expenses = annual_rent * expense_ratio

        return {
            "monthly": total_annual_expenses / 12,
            "total_annual": total_annual_expenses,
            "expense_ratio": expense_ratio,
            "breakdown": {
                "management": total_annual_expenses * 0.05,
                "maintenance": total_annual_expenses * 0.15,
                "insurance": total_annual_expenses * 0.10,
                "property_tax": total_annual_expenses * 0.20,
                "utilities": total_annual_expenses * 0.25,
                "marketing": total_annual_expenses * 0.10,
                "legal_admin": total_annual_expenses * 0.15,
            }
        }

    def _get_cap_rate(self, property_data: PropertyForValuation) -> float:
        """Get capitalization rate for property"""
        if property_data.capitalization_rate and property_data.capitalization_rate > 0:
            return property_data.capitalization_rate

        property_type = property_data.property_type.value
        region = property_data.region

        if property_type in CAP_RATES and region in CAP_RATES[property_type]:
            return CAP_RATES[property_type][region] / 100
        else:
            return DEFAULT_CAP_RATE / 100

    async def _calculate_dcf_value(
        self, 
        property_data: PropertyForValuation, 
        market_rent: float, 
        monthly_expenses: float
    ) -> float:
        """Calculate value using 10-year DCF analysis"""
        region = property_data.region
        rent_growth = RENT_GROWTH_RATES.get(region, 0.05)
        discount_rate = DISCOUNT_RATES.get(region, 0.15)
        cap_rate = self._get_cap_rate(property_data)
        
        # Calculate cash flows for 10 years
        cash_flows = []
        current_rent = market_rent
        current_expenses = monthly_expenses
        
        for year in range(1, 11):
            # Grow rent and expenses
            current_rent *= (1 + rent_growth)
            current_expenses *= (1 + 0.03)  # 3% expense growth
            
            # Calculate NOI for the year
            vacancy = current_rent * 12 * VACANCY_RATES.get(property_data.property_type.value, 0.08)
            egi = (current_rent * 12) - vacancy
            noi = egi - (current_expenses * 12)
            
            cash_flows.append(noi)

        # Calculate terminal value (Year 10 NOI / terminal cap rate)
        terminal_cap_rate = cap_rate + TERMINAL_CAP_SPREAD
        terminal_value = cash_flows[-1] / terminal_cap_rate

        # Discount cash flows and terminal value
        dcf_value = 0
        for i, cf in enumerate(cash_flows, 1):
            dcf_value += cf / ((1 + discount_rate) ** i)
        
        # Add discounted terminal value
        dcf_value += terminal_value / ((1 + discount_rate) ** 10)

        return dcf_value

    async def _calculate_grm_value(self, property_data: PropertyForValuation, market_rent: float) -> float:
        """Calculate value using Gross Rent Multiplier"""
        # Try to get market GRM from comparable sales
        try:
            comparables = await self.market_adapter.find_comparables(
                property_data.latitude,
                property_data.longitude,
                2.0,  # 2km radius
                property_data.property_type,
                limit=10
            )
            
            grm_values = []
            for comp in comparables:
                if comp.get("market_rent") and comp["market_rent"] > 0:
                    grm = comp["price"] / (comp["market_rent"] * 12)
                    if 50 <= grm <= 500:  # Reasonable GRM range
                        grm_values.append(grm)
            
            if grm_values:
                avg_grm = sum(grm_values) / len(grm_values)
                return market_rent * 12 * avg_grm
        
        except Exception as e:
            logger.warning(f"Could not calculate market GRM: {str(e)}")

        # Use typical GRM by property type and region
        default_grms = {
            "apartment": {RegionCode.GREATER_ACCRA: 120, RegionCode.KUMASI_METRO: 100},
            "commercial": {RegionCode.GREATER_ACCRA: 100, RegionCode.KUMASI_METRO: 85},
            "office": {RegionCode.GREATER_ACCRA: 110, RegionCode.KUMASI_METRO: 95},
        }
        
        property_type = property_data.property_type.value
        region = property_data.region
        
        if property_type in default_grms and region in default_grms[property_type]:
            grm = default_grms[property_type][region]
        else:
            grm = 100  # Default GRM
        
        return market_rent * 12 * grm

    def _weight_income_methods(
        self, 
        direct_cap: float, 
        dcf: float, 
        grm: float, 
        property_data: PropertyForValuation
    ) -> float:
        """Weight different income method results"""
        # Weights based on property type reliability
        if property_data.property_type in [PropertyType.OFFICE, PropertyType.COMMERCIAL]:
            weights = {"direct_cap": 0.5, "dcf": 0.3, "grm": 0.2}
        elif property_data.property_type == PropertyType.APARTMENT:
            weights = {"direct_cap": 0.4, "dcf": 0.4, "grm": 0.2}
        else:
            weights = {"direct_cap": 0.6, "dcf": 0.2, "grm": 0.2}

        return (direct_cap * weights["direct_cap"] + 
                dcf * weights["dcf"] + 
                grm * weights["grm"])

    def _calculate_confidence(
        self, 
        property_data: PropertyForValuation, 
        market_rent: float, 
        cap_rate: float
    ) -> float:
        """Calculate confidence score for income approach"""
        confidence_factors = []

        # 1. Data completeness
        if property_data.market_rent and property_data.market_rent > 0:
            confidence_factors.append(0.9)
        else:
            confidence_factors.append(0.6)

        # 2. Property type suitability
        income_types = [PropertyType.APARTMENT, PropertyType.COMMERCIAL, PropertyType.OFFICE]
        if property_data.property_type in income_types:
            confidence_factors.append(0.8)
        else:
            confidence_factors.append(0.5)

        # 3. Cap rate reliability
        if property_data.capitalization_rate:
            confidence_factors.append(0.9)
        else:
            confidence_factors.append(0.7)

        # 4. Building size data
        if property_data.building_size_sqm:
            confidence_factors.append(0.8)
        else:
            confidence_factors.append(0.6)

        return sum(confidence_factors) / len(confidence_factors)

    def _calculate_method_weight(self, property_data: PropertyForValuation) -> float:
        """Calculate weight for hybrid valuation"""
        income_suitable_types = [
            PropertyType.APARTMENT, PropertyType.COMMERCIAL, PropertyType.OFFICE,
            PropertyType.RETAIL, PropertyType.INDUSTRIAL, PropertyType.WAREHOUSE,
            PropertyType.HOTEL, PropertyType.MIXED_USE
        ]
        
        if property_data.property_type not in income_suitable_types:
            return 0.0
        
        # Higher weights for commercial properties
        if property_data.property_type in [PropertyType.COMMERCIAL, PropertyType.OFFICE]:
            return 0.6
        elif property_data.property_type == PropertyType.APARTMENT:
            return 0.4
        else:
            return 0.3