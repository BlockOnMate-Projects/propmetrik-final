"""
Market Data Service
Python implementation for PROPMETRIK valuation engine

Provides comprehensive market intelligence and analysis for Ghana property valuations,
including market trends, indices, economic factors, and seasonal adjustments.
"""

import logging
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any, Tuple
from decimal import Decimal
from enum import Enum
import uuid
import statistics

from pydantic import BaseModel, Field
import numpy as np
import pandas as pd

from ..schemas import (
    GhanaRegion,
    PropertyType,
    TransactionType,
    ValuationPurpose
)

# Setup logging
logger = logging.getLogger(__name__)


# ============================================================================
# ENUMS AND CONSTANTS
# ============================================================================

class MarketTrend(str, Enum):
    """Market trend classifications"""
    strong_growth = "strong_growth"
    moderate_growth = "moderate_growth" 
    stable = "stable"
    moderate_decline = "moderate_decline"
    strong_decline = "strong_decline"

class MarketCycle(str, Enum):
    """Market cycle phases"""
    expansion = "expansion"
    peak = "peak"
    contraction = "contraction"
    trough = "trough"
    recovery = "recovery"

class MarketActivity(str, Enum):
    """Market activity levels"""
    very_low = "very_low"
    low = "low"
    moderate = "moderate"
    high = "high"

class InventoryLevel(str, Enum):
    """Market inventory levels"""
    low = "low"
    balanced = "balanced"
    high = "high"

# Ghana-specific seasonal factors (1.0 = normal, >1.0 = above average, <1.0 = below average)
GHANA_SEASONAL_FACTORS = {
    1: 0.98,  # January - post-holiday slowdown
    2: 0.99,  # February
    3: 1.02,  # March - pre-Easter activity
    4: 1.01,  # April
    5: 1.00,  # May
    6: 0.98,  # June - rainy season begins
    7: 0.97,  # July - peak rainy season
    8: 0.97,  # August - peak rainy season
    9: 1.00,  # September - rainy season ends
    10: 1.02, # October - year-end activity starts
    11: 1.03, # November - year-end push
    12: 1.03, # December - diaspora purchases
}

# Default market indices (Greater Accra = 100 base)
DEFAULT_MARKET_INDICES = {
    GhanaRegion.greater_accra: 100,
    GhanaRegion.kumasi_metro: 85,
    GhanaRegion.eastern: 70,
    GhanaRegion.western: 75,
    GhanaRegion.ashanti: 80,
    GhanaRegion.central: 65,
    GhanaRegion.volta: 60,
    GhanaRegion.northern: 55,
    GhanaRegion.upper_east: 50,
    GhanaRegion.upper_west: 50,
    GhanaRegion.brong_ahafo: 58
}


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class EconomicFactors(BaseModel):
    """Economic factors affecting property markets"""
    gdp_growth_rate: float = Field(..., description="GDP growth rate %")
    inflation_rate: float = Field(..., description="Inflation rate %")
    interest_rate: float = Field(..., description="Bank of Ghana policy rate %")
    unemployment_rate: float = Field(..., description="Unemployment rate %")
    exchange_rate_usd: float = Field(..., description="GHS/USD exchange rate")
    foreign_investment: float = Field(..., description="Foreign investment index")
    construction_cost_index: float = Field(..., description="Construction cost index")
    population_growth: float = Field(..., description="Population growth rate %")

class MarketIndex(BaseModel):
    """Market price index for region/property type"""
    region: GhanaRegion = Field(..., description="Ghana region")
    property_type: PropertyType = Field(..., description="Property type")
    current_index: float = Field(..., description="Current index value")
    index_change_1m: float = Field(..., description="1-month change %")
    index_change_3m: float = Field(..., description="3-month change %") 
    index_change_6m: float = Field(..., description="6-month change %")
    index_change_12m: float = Field(..., description="12-month change %")
    last_updated: datetime = Field(default_factory=datetime.now)

class PriceTrend(BaseModel):
    """Price trend data point"""
    period: str = Field(..., description="Period (YYYY-MM)")
    average_price: float = Field(..., description="Average price in GHS")
    median_price: float = Field(..., description="Median price in GHS")
    transaction_count: int = Field(..., description="Number of transactions")
    price_per_sqm_avg: float = Field(..., description="Average price per sqm")
    price_per_sqm_median: float = Field(..., description="Median price per sqm")

class MarketAnalysis(BaseModel):
    """Comprehensive market analysis for region/property type"""
    region: GhanaRegion = Field(..., description="Ghana region")
    property_type: PropertyType = Field(..., description="Property type")
    
    # Index and trends
    current_index: float = Field(..., description="Current market index")
    index_change_1m: float = Field(..., description="1-month index change %")
    index_change_3m: float = Field(..., description="3-month index change %")
    index_change_12m: float = Field(..., description="12-month index change %")
    trend: MarketTrend = Field(..., description="Market trend classification")
    trend_strength: float = Field(..., ge=0, le=1, description="Trend strength 0-1")
    cycle_phase: MarketCycle = Field(..., description="Market cycle phase")
    
    # Seasonal and activity
    seasonal_factor: float = Field(..., description="Current seasonal adjustment factor")
    market_activity: MarketActivity = Field(..., description="Market activity level")
    
    # Pricing
    average_price_per_sqm: float = Field(..., description="Average price per sqm")
    median_price_per_sqm: float = Field(..., description="Median price per sqm")
    price_range: Dict[str, float] = Field(..., description="Price range min/max")
    
    # Market dynamics
    days_on_market_avg: float = Field(..., description="Average days on market")
    inventory_level: InventoryLevel = Field(..., description="Inventory level")
    supply_demand_ratio: float = Field(..., description="Supply/demand ratio")
    
    # Supporting data
    transaction_volume_3m: int = Field(..., description="3-month transaction volume")
    new_listings_3m: int = Field(..., description="3-month new listings")
    absorption_rate: float = Field(..., description="Monthly absorption rate %")

class MarketConditions(BaseModel):
    """Overall market conditions summary"""
    region: GhanaRegion = Field(..., description="Ghana region")
    analysis_date: date = Field(default_factory=date.today)
    
    # Overall assessment
    market_health_score: float = Field(..., ge=0, le=100, description="Overall market health score")
    market_summary: str = Field(..., description="Market summary description")
    key_factors: List[str] = Field(..., description="Key market factors")
    
    # Economic context
    economic_factors: EconomicFactors = Field(..., description="Economic environment")
    
    # Property type analyses
    property_analyses: Dict[str, MarketAnalysis] = Field(..., description="Analysis by property type")
    
    # Forecasts and outlook
    price_forecast_6m: float = Field(..., description="6-month price change forecast %")
    price_forecast_12m: float = Field(..., description="12-month price change forecast %")
    market_outlook: str = Field(..., description="Market outlook narrative")
    risk_factors: List[str] = Field(..., description="Key risk factors")
    
    # Recommendations
    buyer_advice: str = Field(..., description="Advice for buyers")
    seller_advice: str = Field(..., description="Advice for sellers")
    investment_outlook: str = Field(..., description="Investment outlook")

class ComparableSearchCriteria(BaseModel):
    """Criteria for searching comparable properties"""
    region: GhanaRegion = Field(..., description="Target region")
    property_type: PropertyType = Field(..., description="Property type")
    transaction_type: TransactionType = Field(TransactionType.sale, description="Transaction type")
    
    # Location filters
    max_distance_km: float = Field(5.0, description="Maximum distance in km")
    specific_areas: Optional[List[str]] = Field(None, description="Specific area names")
    
    # Property filters
    size_range: Optional[Dict[str, float]] = Field(None, description="Building size range sqm")
    land_range: Optional[Dict[str, float]] = Field(None, description="Land size range sqm")
    bedroom_range: Optional[Dict[str, int]] = Field(None, description="Bedroom count range")
    age_range: Optional[Dict[str, int]] = Field(None, description="Property age range years")
    
    # Transaction filters
    date_range: Optional[Dict[str, date]] = Field(None, description="Sale date range")
    price_range: Optional[Dict[str, float]] = Field(None, description="Price range GHS")
    
    # Quality filters
    min_data_quality: float = Field(0.5, description="Minimum data quality score")
    exclude_distressed: bool = Field(True, description="Exclude distressed sales")
    
    # Result limits
    max_results: int = Field(50, description="Maximum results to return")


# ============================================================================
# MARKET DATA SERVICE
# ============================================================================

class MarketDataService:
    """
    Service for Ghana property market data and analysis.
    
    Features:
    - Real-time market indices and trends
    - Economic factors integration  
    - Seasonal adjustments for Ghana market
    - Comparable property search
    - Market forecasting and outlook
    - Regional market analysis
    """
    
    def __init__(self):
        """Initialize the service"""
        self.base_year = 2020
        self.current_indices = DEFAULT_MARKET_INDICES.copy()
        
        # Mock current economic factors (would come from data sources)
        self.current_economic_factors = EconomicFactors(
            gdp_growth_rate=3.2,
            inflation_rate=12.4,
            interest_rate=20.0,
            unemployment_rate=8.5,
            exchange_rate_usd=12.5,
            foreign_investment=85.3,
            construction_cost_index=142.8,
            population_growth=2.1
        )
    
    # --------------------------------------------------------------------------
    # MARKET INDICES AND TRENDS
    # --------------------------------------------------------------------------
    
    async def get_market_index(
        self,
        region: GhanaRegion,
        property_type: PropertyType,
        include_history: bool = False
    ) -> MarketIndex:
        """Get current market index for region and property type"""
        
        logger.info(f"Getting market index for {region} {property_type}")
        
        # Base index from regional multipliers
        base_index = self.current_indices.get(region, 75)
        
        # Property type adjustments
        type_adjustments = {
            PropertyType.residential_house: 1.0,
            PropertyType.apartment_flat: 0.95,
            PropertyType.commercial_office: 1.15,
            PropertyType.commercial_shop: 1.10,
            PropertyType.warehouse: 0.85,
            PropertyType.land: 0.80,
            PropertyType.industrial: 0.90
        }
        
        current_index = base_index * type_adjustments.get(property_type, 1.0)
        
        # Mock historical changes (would come from real data)
        index = MarketIndex(
            region=region,
            property_type=property_type,
            current_index=current_index,
            index_change_1m=0.8,  # 0.8% monthly growth
            index_change_3m=2.4,  # 2.4% quarterly growth
            index_change_6m=4.9,  # 4.9% semi-annual growth
            index_change_12m=9.6   # 9.6% annual growth
        )
        
        logger.info(f"Market index retrieved: {current_index:.1f} (annual change: {index.index_change_12m:.1f}%)")
        return index
    
    async def analyze_market_trends(
        self,
        region: GhanaRegion,
        property_type: PropertyType,
        analysis_period_months: int = 12
    ) -> MarketAnalysis:
        """Comprehensive market trend analysis"""
        
        logger.info(f"Analyzing market trends for {region} {property_type}")
        
        # Get market index
        index = await self.get_market_index(region, property_type)
        
        # Determine trend classification
        annual_change = index.index_change_12m / 100
        trend = self._classify_trend(annual_change)
        trend_strength = min(abs(annual_change) / 0.15, 1.0)  # Normalize to 0-1
        
        # Determine cycle phase
        cycle_phase = self._determine_cycle_phase(index)
        
        # Current seasonal factor
        current_month = datetime.now().month
        seasonal_factor = GHANA_SEASONAL_FACTORS.get(current_month, 1.0)
        
        # Mock market activity (would be calculated from transaction data)
        activity_score = 0.65  # Mock moderate activity
        market_activity = self._classify_activity(activity_score)
        
        # Mock pricing data (would come from recent transactions)
        base_price_sqm = self._get_base_price_per_sqm(region, property_type)
        
        analysis = MarketAnalysis(
            region=region,
            property_type=property_type,
            current_index=index.current_index,
            index_change_1m=index.index_change_1m,
            index_change_3m=index.index_change_3m,
            index_change_12m=index.index_change_12m,
            trend=trend,
            trend_strength=trend_strength,
            cycle_phase=cycle_phase,
            seasonal_factor=seasonal_factor,
            market_activity=market_activity,
            average_price_per_sqm=base_price_sqm,
            median_price_per_sqm=base_price_sqm * 0.92,  # Median typically 8% below mean
            price_range={
                "min": base_price_sqm * 0.7,
                "max": base_price_sqm * 1.4
            },
            days_on_market_avg=85.0,  # Mock - would calculate from data
            inventory_level=InventoryLevel.balanced,
            supply_demand_ratio=1.15,  # Slight oversupply
            transaction_volume_3m=45,  # Mock transaction count
            new_listings_3m=68,
            absorption_rate=12.5  # Monthly absorption rate %
        )
        
        logger.info(f"Market analysis completed: {trend} trend, {cycle_phase} cycle phase")
        return analysis
    
    # --------------------------------------------------------------------------
    # MARKET CONDITIONS
    # --------------------------------------------------------------------------
    
    async def get_market_conditions(
        self,
        region: GhanaRegion,
        include_forecasts: bool = True
    ) -> MarketConditions:
        """Get comprehensive market conditions for region"""
        
        logger.info(f"Getting market conditions for {region}")
        
        # Analyze major property types
        property_types = [
            PropertyType.residential_house,
            PropertyType.apartment_flat,
            PropertyType.commercial_office,
            PropertyType.land
        ]
        
        property_analyses = {}
        for prop_type in property_types:
            analysis = await self.analyze_market_trends(region, prop_type)
            property_analyses[prop_type.value] = analysis
        
        # Calculate overall market health score
        avg_growth = statistics.mean(
            analysis.index_change_12m for analysis in property_analyses.values()
        )
        health_score = self._calculate_market_health_score(avg_growth)
        
        # Generate market summary and factors
        market_summary = self._generate_market_summary(region, avg_growth)
        key_factors = self._identify_key_factors(region)
        
        conditions = MarketConditions(
            region=region,
            market_health_score=health_score,
            market_summary=market_summary,
            key_factors=key_factors,
            economic_factors=self.current_economic_factors,
            property_analyses=property_analyses,
            price_forecast_6m=avg_growth * 0.5,  # Half the annual rate for 6 months
            price_forecast_12m=avg_growth * 0.9,  # Slightly moderated for next year
            market_outlook=self._generate_market_outlook(region, avg_growth),
            risk_factors=self._identify_risk_factors(region),
            buyer_advice=self._generate_buyer_advice(region, avg_growth),
            seller_advice=self._generate_seller_advice(region, avg_growth),
            investment_outlook=self._generate_investment_outlook(region, avg_growth)
        )
        
        logger.info(f"Market conditions compiled: health score {health_score:.1f}")
        return conditions
    
    # --------------------------------------------------------------------------
    # COMPARABLE SEARCH
    # --------------------------------------------------------------------------
    
    async def search_comparables(
        self,
        criteria: ComparableSearchCriteria,
        subject_location: Optional[Tuple[float, float]] = None
    ) -> List[Dict[str, Any]]:
        """Search for comparable properties matching criteria"""
        
        logger.info(f"Searching comparables for {criteria.region} {criteria.property_type}")
        
        # Mock comparable properties (would query actual database)
        comparables = []
        
        base_price_sqm = self._get_base_price_per_sqm(criteria.region, criteria.property_type)
        
        for i in range(min(8, criteria.max_results)):  # Generate up to 8 mock comparables
            # Add some variation to the base price
            variation = 1 + (np.random.normal(0, 0.15))  # 15% standard deviation
            price_per_sqm = base_price_sqm * variation
            
            building_size = 150 + (i * 25)  # Vary building size
            land_size = building_size * 2.5  # Typical land to building ratio
            sale_price = price_per_sqm * building_size
            
            comparable = {
                "id": str(uuid.uuid4()),
                "address": f"Comparable Property {i+1}, {criteria.region.value.title()}",
                "region": criteria.region.value,
                "property_type": criteria.property_type.value,
                "transaction_type": criteria.transaction_type.value,
                "sale_price": round(sale_price, 2),
                "sale_date": (date.today() - timedelta(days=30 + (i * 15))).isoformat(),
                "building_area_sqm": building_size,
                "land_area_sqm": land_size,
                "bedrooms": 3 + (i % 2),
                "bathrooms": 2 + (i % 2),
                "age_years": 5 + (i * 2),
                "price_per_sqm": round(price_per_sqm, 2),
                "distance_km": round(1.5 + (i * 0.5), 1),
                "data_quality_score": 0.8 - (i * 0.05),  # Decreasing quality
                "source": "Ghana Property Database",
                "location": {
                    "latitude": 5.6037 + (i * 0.01),  # Mock coordinates near Accra
                    "longitude": -0.1870 + (i * 0.01)
                }
            }
            
            comparables.append(comparable)
        
        logger.info(f"Found {len(comparables)} comparable properties")
        return comparables
    
    # --------------------------------------------------------------------------
    # SEASONAL AND ECONOMIC ADJUSTMENTS
    # --------------------------------------------------------------------------
    
    async def get_seasonal_adjustment(
        self,
        region: GhanaRegion,
        target_date: Optional[date] = None
    ) -> float:
        """Get seasonal adjustment factor for Ghana market"""
        
        if not target_date:
            target_date = date.today()
        
        month = target_date.month
        base_factor = GHANA_SEASONAL_FACTORS.get(month, 1.0)
        
        # Regional adjustments (some regions less affected by seasonality)
        regional_adjustments = {
            GhanaRegion.greater_accra: 1.0,  # Full seasonal impact
            GhanaRegion.kumasi_metro: 0.8,  # Moderate seasonal impact
            GhanaRegion.northern: 0.5,      # Low seasonal impact
            GhanaRegion.upper_east: 0.3,    # Minimal seasonal impact
            GhanaRegion.upper_west: 0.3,
        }
        
        regional_factor = regional_adjustments.get(region, 0.7)
        adjusted_factor = 1.0 + ((base_factor - 1.0) * regional_factor)
        
        logger.info(f"Seasonal adjustment for {region} in month {month}: {adjusted_factor:.3f}")
        return adjusted_factor
    
    async def apply_economic_adjustments(
        self,
        base_value: float,
        region: GhanaRegion,
        valuation_date: date
    ) -> Tuple[float, List[str]]:
        """Apply economic adjustments to property value"""
        
        logger.info("Applying economic adjustments")
        
        adjusted_value = base_value
        adjustment_factors = []
        
        # Inflation adjustment
        inflation_factor = 1 + (self.current_economic_factors.inflation_rate / 100) * 0.5
        adjusted_value *= inflation_factor
        adjustment_factors.append(f"Inflation adjustment: {((inflation_factor - 1) * 100):.1f}%")
        
        # Interest rate impact (inverse relationship)
        interest_impact = max(0.95, 1 - (self.current_economic_factors.interest_rate - 15) / 100)
        adjusted_value *= interest_impact
        adjustment_factors.append(f"Interest rate impact: {((interest_impact - 1) * 100):.1f}%")
        
        # Exchange rate stability (affects high-end properties more)
        if region in [GhanaRegion.greater_accra, GhanaRegion.kumasi_metro]:
            fx_impact = 0.98  # Mock slight negative impact
            adjusted_value *= fx_impact
            adjustment_factors.append(f"FX stability impact: {((fx_impact - 1) * 100):.1f}%")
        
        logger.info(f"Economic adjustments applied: {adjusted_value/base_value:.3f}x multiplier")
        return adjusted_value, adjustment_factors
    
    # --------------------------------------------------------------------------
    # HELPER METHODS
    # --------------------------------------------------------------------------
    
    def _classify_trend(self, annual_change: float) -> MarketTrend:
        """Classify market trend based on annual change"""
        if annual_change >= 0.10:
            return MarketTrend.strong_growth
        elif annual_change >= 0.05:
            return MarketTrend.moderate_growth
        elif annual_change >= -0.02:
            return MarketTrend.stable
        elif annual_change >= -0.10:
            return MarketTrend.moderate_decline
        else:
            return MarketTrend.strong_decline
    
    def _determine_cycle_phase(self, index: MarketIndex) -> MarketCycle:
        """Determine market cycle phase"""
        # Simple heuristic based on trend changes
        if index.index_change_1m > 1.0 and index.index_change_3m > 3.0:
            return MarketCycle.expansion
        elif index.index_change_1m < 0.5 and index.index_change_3m > 2.0:
            return MarketCycle.peak
        elif index.index_change_3m < 0:
            return MarketCycle.contraction
        elif index.index_change_12m < -5.0:
            return MarketCycle.trough
        else:
            return MarketCycle.recovery
    
    def _classify_activity(self, activity_score: float) -> MarketActivity:
        """Classify market activity level"""
        if activity_score >= 0.8:
            return MarketActivity.high
        elif activity_score >= 0.6:
            return MarketActivity.moderate
        elif activity_score >= 0.4:
            return MarketActivity.low
        else:
            return MarketActivity.very_low
    
    def _get_base_price_per_sqm(self, region: GhanaRegion, property_type: PropertyType) -> float:
        """Get base price per sqm for region and property type"""
        
        # Base prices in GHS per sqm (Greater Accra reference)
        base_prices = {
            PropertyType.residential_house: 2800,
            PropertyType.apartment_flat: 3200,
            PropertyType.commercial_office: 4500,
            PropertyType.commercial_shop: 3800,
            PropertyType.warehouse: 1800,
            PropertyType.industrial: 2000,
            PropertyType.land: 800
        }
        
        base_price = base_prices.get(property_type, 2500)
        regional_multiplier = self.current_indices.get(region, 75) / 100
        
        return base_price * regional_multiplier
    
    def _calculate_market_health_score(self, avg_growth: float) -> float:
        """Calculate overall market health score (0-100)"""
        
        # Base score from growth rate
        if avg_growth >= 10:
            base_score = 90
        elif avg_growth >= 5:
            base_score = 75
        elif avg_growth >= 0:
            base_score = 60
        elif avg_growth >= -5:
            base_score = 40
        else:
            base_score = 20
        
        # Adjust for economic factors
        if self.current_economic_factors.inflation_rate > 15:
            base_score -= 10
        if self.current_economic_factors.interest_rate > 22:
            base_score -= 5
        
        return max(0, min(100, base_score))
    
    def _generate_market_summary(self, region: GhanaRegion, avg_growth: float) -> str:
        """Generate market summary text"""
        
        trend_desc = "growing" if avg_growth > 2 else "stable" if avg_growth >= 0 else "declining"
        region_name = region.value.replace("_", " ").title()
        
        return f"The {region_name} property market is currently {trend_desc} with an average annual growth rate of {avg_growth:.1f}%. Market conditions reflect typical Ghana economic patterns with seasonal variations."
    
    def _identify_key_factors(self, region: GhanaRegion) -> List[str]:
        """Identify key market factors"""
        
        factors = [
            "Bank of Ghana monetary policy impact",
            "Cedi exchange rate stability",
            "Construction cost inflation",
            "Diaspora investment patterns",
        ]
        
        if region == GhanaRegion.greater_accra:
            factors.extend([
                "Urban development projects",
                "Infrastructure improvements",
                "Commercial activity growth"
            ])
        
        return factors
    
    def _generate_market_outlook(self, region: GhanaRegion, avg_growth: float) -> str:
        """Generate market outlook narrative"""
        
        if avg_growth > 5:
            return "Positive outlook with continued growth expected, supported by economic fundamentals and development activity."
        elif avg_growth > 0:
            return "Cautiously optimistic outlook with moderate growth potential, dependent on economic stability."
        else:
            return "Challenging outlook requiring careful market monitoring and conservative investment approaches."
    
    def _identify_risk_factors(self, region: GhanaRegion) -> List[str]:
        """Identify key risk factors"""
        
        return [
            "Currency volatility impact",
            "Interest rate fluctuations", 
            "Inflationary pressures",
            "Political and policy changes",
            "Regional security considerations",
            "Construction material cost increases"
        ]
    
    def _generate_buyer_advice(self, region: GhanaRegion, avg_growth: float) -> str:
        """Generate buyer advice"""
        
        if avg_growth > 5:
            return "Consider acting soon as prices are rising. Focus on quality locations with good fundamentals."
        elif avg_growth > 0:
            return "Good time to buy with moderate price growth. Take time to research and negotiate."
        else:
            return "Buyer's market conditions present opportunities. Be selective and negotiate strongly."
    
    def _generate_seller_advice(self, region: GhanaRegion, avg_growth: float) -> str:
        """Generate seller advice"""
        
        if avg_growth > 5:
            return "Strong seller's market. Price competitively but expect good demand."
        elif avg_growth > 0:
            return "Balanced market conditions. Price fairly and market professionally."
        else:
            return "Challenging conditions for sellers. Consider pricing strategically and allow longer marketing time."
    
    def _generate_investment_outlook(self, region: GhanaRegion, avg_growth: float) -> str:
        """Generate investment outlook"""
        
        if avg_growth > 5:
            return "Attractive investment environment with good growth prospects and rental yields."
        elif avg_growth > 0:
            return "Moderate investment opportunity requiring careful property and location selection."
        else:
            return "Conservative investment approach recommended. Focus on prime locations and distressed opportunities."


# ============================================================================
# SERVICE INSTANCE
# ============================================================================

market_data_service = MarketDataService()