"""
Land Comparable Schema
Pydantic models for land comparable sales analysis and valuation

This module provides data structures for:
- Land comparable scoring (6-factor weighted)
- Land-specific adjustments (time, size, zoning, infrastructure, access, tenure)
- Outlier detection results (IQR + Modified Z-Score)
- Complete land comparable analysis
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Tuple, Any
from datetime import date
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================

class LandZoning(str, Enum):
    """Land use zoning categories"""
    RESIDENTIAL = "residential"
    COMMERCIAL = "commercial"
    INDUSTRIAL = "industrial"
    MIXED_USE = "mixed_use"
    AGRICULTURAL = "agricultural"
    INSTITUTIONAL = "institutional"
    RECREATIONAL = "recreational"
    UNKNOWN = "unknown"


class LandTenureType(str, Enum):
    """Land tenure types in Ghana"""
    FREEHOLD = "freehold"
    LEASEHOLD = "leasehold"
    STOOL_LAND = "stool_land"
    FAMILY_LAND = "family_land"
    GOVERNMENT_LAND = "government_land"
    UNKNOWN = "unknown"


class RoadAccessType(str, Enum):
    """Road access categories"""
    PAVED_MAJOR = "paved_major"
    PAVED_MINOR = "paved_minor"
    UNPAVED = "unpaved"
    NO_ROAD = "no_road"
    UNKNOWN = "unknown"


class Topography(str, Enum):
    """Land topography categories"""
    FLAT = "flat"
    GENTLE_SLOPE = "gentle_slope"
    MODERATE_SLOPE = "moderate_slope"
    STEEP = "steep"
    IRREGULAR = "irregular"
    UNKNOWN = "unknown"


class LandShape(str, Enum):
    """Land shape categories"""
    REGULAR = "regular"
    IRREGULAR = "irregular"
    CORNER_LOT = "corner_lot"
    FLAG_LOT = "flag_lot"
    UNKNOWN = "unknown"


class LandAdjustmentType(str, Enum):
    """Types of adjustments applicable to land comparables"""
    TIME = "time"
    SIZE = "size"
    ZONING = "zoning"
    INFRASTRUCTURE = "infrastructure"
    ACCESS = "access"
    TENURE = "tenure"
    TOPOGRAPHY = "topography"
    SHAPE = "shape"
    LOCATION = "location"
    DEVELOPMENT_POTENTIAL = "development_potential"
    FLOOD_RISK = "flood_risk"


class OutlierDetectionMethod(str, Enum):
    """Outlier detection methods used"""
    IQR = "iqr"
    Z_SCORE = "z_score"
    BOTH = "both"


class ConfidenceLevel(str, Enum):
    """Confidence level categories"""
    HIGH = "high"
    MODERATE = "moderate"
    LOW = "low"


# ============================================================================
# DATA CLASSES
# ============================================================================

class LandCharacteristics(BaseModel):
    """Land-specific characteristics for scoring and adjustment"""
    
    # Location
    region: str = Field(..., description="Ghana region code")
    district: Optional[str] = None
    locality: Optional[str] = None
    neighborhood: Optional[str] = None
    coordinates: Optional[Tuple[float, float]] = Field(None, description="(lat, lng)")
    
    # Zoning and tenure
    zoning: LandZoning = Field(default=LandZoning.UNKNOWN)
    tenure_type: LandTenureType = Field(default=LandTenureType.UNKNOWN)
    lease_years_remaining: Optional[int] = Field(None, ge=0, le=999)
    
    # Infrastructure
    has_road_access: Optional[bool] = None
    road_type: RoadAccessType = Field(default=RoadAccessType.UNKNOWN)
    has_electricity: Optional[bool] = None
    has_water: Optional[bool] = None
    has_sewage: Optional[bool] = None
    
    # Physical characteristics
    topography: Topography = Field(default=Topography.UNKNOWN)
    shape: LandShape = Field(default=LandShape.UNKNOWN)
    frontage_meters: Optional[float] = Field(None, gt=0)
    
    # Development potential
    development_potential: Optional[str] = Field(None, description="high, medium, low, none")
    flood_risk: Optional[str] = Field(None, description="none, low, medium, high")
    
    class Config:
        use_enum_values = True


class LandComparableScore(BaseModel):
    """
    Scoring result for a land comparable.
    Uses 6-factor weighted scoring with configurable weights.
    """
    
    overall_score: float = Field(..., ge=0, le=1, description="Weighted overall score")
    
    # Component scores (each 0-1)
    location_score: float = Field(..., ge=0, le=1, description="Distance-based score")
    size_score: float = Field(..., ge=0, le=1, description="Land area similarity score")
    zoning_score: float = Field(..., ge=0, le=1, description="Zoning compatibility score")
    infrastructure_score: float = Field(..., ge=0, le=1, description="Infrastructure access score")
    time_score: float = Field(..., ge=0, le=1, description="Recency of sale score")
    data_quality_score: float = Field(..., ge=0, le=1, description="Data reliability score")
    
    # For detailed breakdown
    component_scores: Dict[str, float] = Field(
        default_factory=dict,
        description="All component scores with names"
    )
    
    # Weights used (for audit trail)
    weights: Dict[str, float] = Field(
        default_factory=lambda: {
            'location': 0.30,
            'size': 0.20,
            'zoning': 0.15,
            'infrastructure': 0.15,
            'time': 0.10,
            'data_quality': 0.10
        },
        description="Scoring weights used"
    )
    
    @validator('overall_score')
    def validate_overall_score(cls, v, values):
        """Validate that overall score is reasonable"""
        if v < 0 or v > 1:
            raise ValueError('Overall score must be between 0 and 1')
        return round(v, 4)


class LandAdjustment(BaseModel):
    """
    Individual adjustment applied to a land comparable.
    Each adjustment captures the methodology and assumptions for audit trail.
    """
    
    adjustment_type: LandAdjustmentType
    adjustment_amount_ghs: float = Field(..., description="GHS amount (positive = increase)")
    adjustment_percentage: float = Field(..., description="Percentage of original price")
    confidence: float = Field(..., ge=0, le=1, description="Confidence in adjustment")
    methodology: str = Field(..., description="Method used for calculation")
    assumptions: List[str] = Field(default_factory=list, description="Key assumptions made")
    
    # For reference
    subject_value: Optional[str] = Field(None, description="Subject property's value for this factor")
    comparable_value: Optional[str] = Field(None, description="Comparable's value for this factor")
    
    class Config:
        use_enum_values = True


class OutlierInfo(BaseModel):
    """
    Outlier detection result for a single comparable.
    Uses dual-method detection: IQR and Modified Z-Score.
    """
    
    is_outlier: bool = Field(False, description="TRUE if flagged by BOTH methods")
    outlier_reason: Optional[str] = None
    detection_method: OutlierDetectionMethod = Field(default=OutlierDetectionMethod.BOTH)
    
    # IQR method results
    iqr_flagged: bool = Field(False, description="Flagged by IQR method")
    iqr_lower_bound: Optional[float] = Field(None, description="Q1 - 1.5*IQR")
    iqr_upper_bound: Optional[float] = Field(None, description="Q3 + 1.5*IQR")
    
    # Modified Z-Score results
    z_score_flagged: bool = Field(False, description="Flagged by Modified Z-Score")
    modified_z_score: Optional[float] = None
    z_score_threshold: float = Field(default=3.5)
    median_value: Optional[float] = None
    mad_value: Optional[float] = Field(None, description="Median Absolute Deviation")


class LandComparableAnalysis(BaseModel):
    """
    Complete analysis of a single land comparable.
    Includes all data needed for valuation and reporting.
    """
    
    # Identification
    comparable_id: str = Field(..., description="Property ID of comparable")
    valuation_id: Optional[str] = Field(None, description="Parent valuation ID")
    
    # Location and distance
    distance_km: float = Field(..., ge=0, description="Distance from subject")
    
    # Sale information
    sale_date: date
    days_since_sale: int = Field(..., ge=0)
    original_price_ghs: float = Field(..., gt=0)
    original_price_per_sqm: float = Field(..., gt=0)
    land_area_sqm: float = Field(..., gt=0)
    
    # Land characteristics
    characteristics: LandCharacteristics
    
    # Scoring
    score: LandComparableScore
    
    # Adjustments
    adjustments: List[LandAdjustment] = Field(default_factory=list)
    total_adjustment_ghs: float = Field(default=0)
    total_adjustment_pct: float = Field(default=0)
    
    # Adjusted values
    adjusted_price_ghs: float = Field(..., gt=0)
    adjusted_price_per_sqm: float = Field(..., gt=0)
    
    # Weighting
    weight_in_valuation: float = Field(default=0, ge=0, le=1)
    
    # Outlier status
    outlier_info: OutlierInfo = Field(default_factory=OutlierInfo)
    is_outlier: bool = Field(default=False)
    outlier_reason: Optional[str] = None
    
    # Metadata
    source_type: str = Field(default="database")
    source_reference: Optional[str] = None
    is_verified: bool = Field(default=False)
    
    # Exclusion (user can exclude)
    is_excluded: bool = Field(default=False)
    exclusion_reason: Optional[str] = None
    
    @validator('adjusted_price_ghs', always=True)
    def calculate_adjusted_price(cls, v, values):
        """Validate adjusted price calculation"""
        if 'original_price_ghs' in values and 'total_adjustment_ghs' in values:
            expected = values['original_price_ghs'] + values['total_adjustment_ghs']
            if abs(v - expected) > 1.0:  # Allow small rounding
                # Auto-correct
                return round(expected, 2)
        return round(v, 2)
    
    @validator('adjusted_price_per_sqm', always=True)
    def calculate_adjusted_price_per_sqm(cls, v, values):
        """Calculate price per sqm from adjusted price"""
        if 'adjusted_price_ghs' in values and 'land_area_sqm' in values:
            if values['land_area_sqm'] > 0:
                return round(values['adjusted_price_ghs'] / values['land_area_sqm'], 2)
        return v


class LandComparableSearchCriteria(BaseModel):
    """Search criteria for finding land comparables"""
    
    # Target property
    target_property_id: str
    target_region: str
    target_coordinates: Optional[Tuple[float, float]] = None
    target_land_area_sqm: float = Field(..., gt=0)
    target_zoning: Optional[LandZoning] = None
    
    # Search parameters
    max_distance_km: float = Field(default=10.0, gt=0, le=50)
    max_age_days: int = Field(default=730, gt=0, le=1095)  # 2 years default, 3 max
    min_score_threshold: float = Field(default=0.50, ge=0, le=1)
    max_results: int = Field(default=15, gt=0, le=50)
    
    # Size tolerance
    size_tolerance_pct: float = Field(default=0.50, ge=0, le=1)  # 50% default for land
    
    # Optional filters
    zoning_filter: Optional[List[LandZoning]] = None
    tenure_filter: Optional[List[LandTenureType]] = None
    min_price_ghs: Optional[float] = Field(None, gt=0)
    max_price_ghs: Optional[float] = Field(None, gt=0)
    
    class Config:
        use_enum_values = True


class LandComparableBasket(BaseModel):
    """
    Collection of land comparables for a valuation.
    Includes statistical analysis and outlier detection results.
    """
    
    # Identification
    valuation_id: str
    search_criteria: LandComparableSearchCriteria
    analysis_date: date = Field(default_factory=date.today)
    
    # Comparables
    comparables: List[LandComparableAnalysis] = Field(default_factory=list)
    active_comparables: int = Field(default=0, description="Non-outlier, non-excluded count")
    
    # Statistics (based on active comparables)
    mean_adjusted_price_per_sqm: Optional[float] = None
    median_adjusted_price_per_sqm: Optional[float] = None
    std_deviation: Optional[float] = None
    coefficient_of_variation: Optional[float] = None
    value_range_low: Optional[float] = None
    value_range_high: Optional[float] = None
    
    # Outlier detection summary
    outliers_detected: int = Field(default=0)
    outlier_ids: List[str] = Field(default_factory=list)
    
    # IQR bounds used
    iqr_lower_bound: Optional[float] = None
    iqr_upper_bound: Optional[float] = None
    iqr_multiplier: float = Field(default=1.5)
    
    # Quality metrics
    average_score: Optional[float] = None
    average_distance_km: Optional[float] = None
    average_days_since_sale: Optional[float] = None
    
    # Final indicated value
    indicated_land_value_per_sqm: Optional[float] = None
    indicated_land_value: Optional[float] = None
    confidence_score: Optional[float] = None
    confidence_level: Optional[ConfidenceLevel] = None
    
    # Metadata
    methodology_notes: Optional[str] = None
    analyst_notes: Optional[str] = None


class LandComparableSalesResult(BaseModel):
    """
    Final result from the Land Comparable Sales Service.
    This is returned to the calling service (LandValueProvider).
    """
    
    success: bool
    error: Optional[str] = None
    
    # Values
    indicated_value: Optional[float] = Field(None, description="Total land value in GHS")
    value_per_sqm: Optional[float] = None
    land_area_sqm: Optional[float] = None
    
    # Confidence
    confidence_score: Optional[float] = Field(None, ge=0, le=1)
    confidence_level: Optional[ConfidenceLevel] = None
    
    # Statistics
    comparables_found: int = Field(default=0)
    comparables_used: int = Field(default=0)
    outliers_excluded: int = Field(default=0)
    
    # Detailed analysis
    basket: Optional[LandComparableBasket] = None
    
    # Method identifier
    method: str = Field(default="comparable_land_sales")
    
    # Methodology documentation
    methodology_notes: Optional[str] = None
    assumptions: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)


class LandValueReconciliationResult(BaseModel):
    """
    Result from land value reconciliation (weighted average of methods).
    Exported from this module for schema consistency.
    """
    success: bool = True
    final_land_value: float = 0.0
    final_land_value_per_sqm: float = 0.0
    land_area_sqm: float = 0.0
    confidence_score: float = 0.0
    
    # Method weights and values
    methods_used: List[str] = Field(default_factory=list)
    methods_failed: List[str] = Field(default_factory=list)
    method_weights: Dict[str, float] = Field(default_factory=dict)
    method_values: Dict[str, float] = Field(default_factory=dict)
    
    # Comparable strength (determines weights)
    comparable_strength: str = "balanced"  # weak, balanced, strong
    
    # Value spread indicator
    value_spread_pct: Optional[float] = None
    
    # Outlier info
    outlier_info: Dict[str, Any] = Field(default_factory=dict)
    
    # Error message if failed
    error: Optional[str] = None
