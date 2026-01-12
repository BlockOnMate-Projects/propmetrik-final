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

from .land_comparable import (
    # Enums
    LandZoning,
    LandTenureType as LandComparableTenureType,  # Alias to avoid conflict with property LandTenureType
    RoadAccessType,
    Topography,
    LandShape,
    LandAdjustmentType,
    OutlierDetectionMethod,
    ConfidenceLevel as LandConfidenceLevel,  # Alias to avoid conflict with valuation ConfidenceLevel
    # Characteristics and Scoring
    LandCharacteristics,
    LandComparableScore,
    LandAdjustment,
    OutlierInfo,
    LandComparableAnalysis,
    # Search and Results
    LandComparableSearchCriteria,
    LandComparableBasket,
    LandComparableSalesResult,
    LandValueReconciliationResult,
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
    
    # Land comparable schemas
    "LandZoning",
    "LandComparableTenureType",
    "RoadAccessType",
    "Topography",
    "LandShape",
    "LandAdjustmentType",
    "OutlierDetectionMethod",
    "LandConfidenceLevel",
    "LandCharacteristics",
    "LandComparableScore",
    "LandAdjustment",
    "OutlierInfo",
    "LandComparableAnalysis",
    "LandComparableSearchCriteria",
    "LandComparableBasket",
    "LandComparableSalesResult",
    "LandValueReconciliationResult",
]