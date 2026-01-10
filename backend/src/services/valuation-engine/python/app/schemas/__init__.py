"""
Schema Initialization
Import all schemas for easy access
"""

from .property import (
    Property,
    PropertyType,
    GhanaRegion,
    PropertyCondition,
    LandTenureType,
    PropertyLocation,
    PropertySpecifications,
    PropertyFinancials,
    PropertyDataQuality,
)

from .valuation import (
    ValuationRequest,
    ValuationResult,
    ValuationMethod,
    ValuationPurpose,
    ValuationType,
    ConfidenceLevel,
    MarketConditions,
    ComparableProperty,
    ValuationMethodResult,
    ValueRange,
    QualityIndicators,
)

from .comparable import (
    ComparableSearch,
    ComparableSourceType,
    AdjustmentType,
    SimilarityScore,
    PropertyAdjustment,
    ComparablePropertyAnalysis,
    ComparableBasket,
)

from .market_data import (
    MarketTrend,
    ConstructionMaterial,
    EconomicIndicatorType,
    ConstructionCosts,
    MarketStatistics,
    EconomicIndicator,
    RegionalMarketData,
    MarketDataRequest,
)

__all__ = [
    # Property schemas
    "Property",
    "PropertyType",
    "GhanaRegion", 
    "PropertyCondition",
    "LandTenureType",
    "PropertyLocation",
    "PropertySpecifications",
    "PropertyFinancials",
    "PropertyDataQuality",
    
    # Valuation schemas
    "ValuationRequest",
    "ValuationResult",
    "ValuationMethod",
    "ValuationPurpose",
    "ValuationType",
    "ConfidenceLevel",
    "MarketConditions",
    "ComparableProperty",
    "ValuationMethodResult",
    "ValueRange",
    "QualityIndicators",
    
    # Comparable schemas
    "ComparableSearch",
    "ComparableSourceType",
    "AdjustmentType",
    "SimilarityScore",
    "PropertyAdjustment",
    "ComparablePropertyAnalysis",
    "ComparableBasket",
    
    # Market data schemas
    "MarketTrend",
    "ConstructionMaterial",
    "EconomicIndicatorType",
    "ConstructionCosts",
    "MarketStatistics",
    "EconomicIndicator",
    "RegionalMarketData",
    "MarketDataRequest",
]