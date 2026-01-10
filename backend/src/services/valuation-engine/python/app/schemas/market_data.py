"""
Market Data Schema
Pydantic models for market data and economic indicators
"""

from pydantic import BaseModel, Field, validator
from typing import Dict, List, Optional, Any
from datetime import date, datetime
from enum import Enum

from .property import GhanaRegion, PropertyType


class MarketTrend(str, Enum):
    RISING = "rising"
    STABLE = "stable"
    DECLINING = "declining"
    VOLATILE = "volatile"


class ConstructionMaterial(str, Enum):
    CEMENT = "cement"
    STEEL = "steel"
    SAND = "sand"
    GRAVEL = "gravel"
    BLOCKS = "blocks"
    ROOFING_SHEETS = "roofing_sheets"
    TIMBER = "timber"
    PAINT = "paint"
    TILES = "tiles"
    ELECTRICAL = "electrical"
    PLUMBING = "plumbing"


class EconomicIndicatorType(str, Enum):
    INFLATION_RATE = "inflation_rate"
    INTEREST_RATE = "interest_rate"
    GDP_GROWTH = "gdp_growth"
    UNEMPLOYMENT_RATE = "unemployment_rate"
    CURRENCY_EXCHANGE_USD = "currency_exchange_usd"
    CURRENCY_EXCHANGE_GBP = "currency_exchange_gbp"
    CURRENCY_EXCHANGE_EUR = "currency_exchange_eur"


class ConstructionCosts(BaseModel):
    region: GhanaRegion
    effective_date: date
    currency: str = Field(default="GHS", description="Currency code")
    
    # Cost per unit (GHS)
    cost_per_sqm_basic: float = Field(..., gt=0, description="Basic construction cost per sqm")
    cost_per_sqm_standard: float = Field(..., gt=0, description="Standard construction cost per sqm")
    cost_per_sqm_premium: float = Field(..., gt=0, description="Premium construction cost per sqm")
    cost_per_sqm_luxury: float = Field(..., gt=0, description="Luxury construction cost per sqm")
    
    # Material costs
    material_costs: Dict[ConstructionMaterial, float] = Field(default_factory=dict)
    
    # Labor costs
    skilled_labor_rate_per_day: float = Field(..., gt=0)
    unskilled_labor_rate_per_day: float = Field(..., gt=0)
    
    # Infrastructure costs
    utilities_connection_cost: float = Field(..., ge=0)
    site_preparation_cost_per_sqm: float = Field(..., ge=0)
    
    # Regional adjustments
    transport_cost_factor: float = Field(default=1.0, gt=0, description="Transport cost multiplier")
    availability_factor: float = Field(default=1.0, gt=0, description="Material availability factor")
    
    # Metadata
    data_source: str
    last_updated: datetime = Field(default_factory=datetime.now)
    next_update_due: Optional[date] = None


class MarketStatistics(BaseModel):
    region: GhanaRegion
    property_type: PropertyType
    period_start: date
    period_end: date
    
    # Volume statistics
    total_sales: int = Field(..., ge=0)
    total_listings: int = Field(..., ge=0)
    total_inventory: int = Field(..., ge=0)
    
    # Price statistics
    median_price_ghs: float = Field(..., gt=0)
    mean_price_ghs: float = Field(..., gt=0)
    min_price_ghs: float = Field(..., gt=0)
    max_price_ghs: float = Field(..., gt=0)
    price_per_sqm_median: Optional[float] = Field(None, gt=0)
    
    # Market dynamics
    days_on_market_median: int = Field(..., ge=0)
    days_on_market_mean: int = Field(..., ge=0)
    absorption_rate: float = Field(..., ge=0, le=1, description="Rate at which inventory is absorbed")
    months_of_inventory: float = Field(..., ge=0, description="Months to clear current inventory")
    
    # Price changes
    price_change_3m_pct: Optional[float] = None
    price_change_6m_pct: Optional[float] = None
    price_change_12m_pct: Optional[float] = None
    
    # Market activity
    new_listings_count: int = Field(..., ge=0)
    price_reductions_count: int = Field(..., ge=0)
    expired_listings_count: int = Field(..., ge=0)
    
    @validator('mean_price_ghs')
    def validate_price_relationship(cls, v, values):
        if 'median_price_ghs' in values:
            # Mean should typically be close to median in normal markets
            ratio = v / values['median_price_ghs']
            if ratio < 0.5 or ratio > 2.0:
                raise ValueError('Mean price seems unrealistic compared to median price')
        return v


class EconomicIndicator(BaseModel):
    indicator_type: EconomicIndicatorType
    value: float
    effective_date: date
    currency: Optional[str] = None
    unit: Optional[str] = None
    
    # Source and reliability
    data_source: str
    reliability_score: float = Field(..., ge=0, le=1)
    
    # Metadata
    collection_method: Optional[str] = None
    frequency: Optional[str] = None  # daily, weekly, monthly, quarterly, annually
    last_updated: datetime = Field(default_factory=datetime.now)


class RegionalMarketData(BaseModel):
    region: GhanaRegion
    as_of_date: date
    
    # Market trend analysis
    overall_trend: MarketTrend
    trend_confidence: float = Field(..., ge=0, le=1)
    trend_duration_months: int = Field(..., ge=0)
    
    # Property type statistics
    property_type_stats: Dict[PropertyType, MarketStatistics] = Field(default_factory=dict)
    
    # Economic context
    economic_indicators: List[EconomicIndicator] = Field(default_factory=list)
    construction_costs: Optional[ConstructionCosts] = None
    
    # Regional factors
    infrastructure_quality_score: float = Field(..., ge=0, le=1)
    accessibility_score: float = Field(..., ge=0, le=1)
    amenities_score: float = Field(..., ge=0, le=1)
    safety_score: float = Field(..., ge=0, le=1)
    
    # Investment attractiveness
    rental_yield_median_pct: Optional[float] = Field(None, ge=0, le=50)
    capital_appreciation_12m_pct: Optional[float] = None
    liquidity_score: float = Field(..., ge=0, le=1, description="How easily properties sell")
    
    # Development pipeline
    upcoming_developments_count: int = Field(default=0, ge=0)
    planned_infrastructure_projects: List[str] = Field(default_factory=list)
    zoning_changes: List[str] = Field(default_factory=list)
    
    # Data quality
    data_completeness_score: float = Field(..., ge=0, le=1)
    data_freshness_days: int = Field(..., ge=0, description="Days since last significant update")
    
    class Config:
        schema_extra = {
            "example": {
                "region": "greater_accra",
                "as_of_date": "2026-01-09",
                "overall_trend": "rising",
                "trend_confidence": 0.82,
                "trend_duration_months": 8,
                "infrastructure_quality_score": 0.85,
                "accessibility_score": 0.90,
                "amenities_score": 0.88,
                "safety_score": 0.75,
                "rental_yield_median_pct": 8.5,
                "capital_appreciation_12m_pct": 12.3,
                "liquidity_score": 0.78,
                "data_completeness_score": 0.89,
                "data_freshness_days": 7
            }
        }


class MarketDataRequest(BaseModel):
    region: Optional[GhanaRegion] = None
    property_type: Optional[PropertyType] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    include_economic_indicators: bool = True
    include_construction_costs: bool = True
    include_trends: bool = True
    
    @validator('end_date')
    def validate_date_range(cls, v, values):
        if v is not None and 'start_date' in values and values['start_date'] is not None:
            if v <= values['start_date']:
                raise ValueError('End date must be after start date')
        return v