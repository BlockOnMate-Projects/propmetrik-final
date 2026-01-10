"""
Comparable Schema
Pydantic models for comparable property analysis
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import date
from enum import Enum

from .property import Property, PropertyType, GhanaRegion


class ComparableSourceType(str, Enum):
    DATABASE = "database"
    USER_CONTRIBUTED = "user_contributed"
    MANUAL = "manual"
    API_IMPORT = "api_import"
    HISTORICAL = "historical"
    GOVERNMENT_RECORDS = "government_records"
    AGENCY_LISTING = "agency_listing"


class AdjustmentType(str, Enum):
    SIZE = "size"
    AGE = "age"
    CONDITION = "condition"
    LOCATION = "location"
    TIME = "time"
    LAND_TENURE = "land_tenure"
    AMENITIES = "amenities"
    VIEW = "view"
    ACCESS = "access"
    UTILITIES = "utilities"


class ComparableSearch(BaseModel):
    target_property_id: str
    region: GhanaRegion
    property_type: PropertyType
    
    # Search parameters
    max_distance_km: float = Field(default=5.0, gt=0, le=50)
    max_age_days: int = Field(default=365, gt=0, le=730)
    min_similarity_score: float = Field(default=0.6, ge=0, le=1)
    max_results: int = Field(default=10, gt=0, le=50)
    
    # Size filters
    size_tolerance_pct: float = Field(default=0.3, ge=0, le=1, description="Size tolerance as percentage")
    min_bedrooms: Optional[int] = Field(None, ge=0)
    max_bedrooms: Optional[int] = Field(None, le=20)
    
    # Value filters
    min_price_ghs: Optional[float] = Field(None, gt=0)
    max_price_ghs: Optional[float] = Field(None, gt=0)
    
    @validator('max_price_ghs')
    def validate_price_range(cls, v, values):
        if v is not None and 'min_price_ghs' in values and values['min_price_ghs'] is not None:
            if v <= values['min_price_ghs']:
                raise ValueError('Max price must be greater than min price')
        return v


class SimilarityScore(BaseModel):
    overall_score: float = Field(..., ge=0, le=1)
    
    # Component scores
    location_score: float = Field(..., ge=0, le=1)
    size_score: float = Field(..., ge=0, le=1)
    age_score: float = Field(..., ge=0, le=1)
    type_score: float = Field(..., ge=0, le=1)
    condition_score: float = Field(..., ge=0, le=1)
    amenities_score: float = Field(..., ge=0, le=1)
    
    # Weighting factors used
    weights: Dict[str, float] = Field(default_factory=dict)


class PropertyAdjustment(BaseModel):
    adjustment_type: AdjustmentType
    description: str
    adjustment_amount_ghs: float = Field(..., description="Positive = increase value, Negative = decrease value")
    adjustment_percentage: float = Field(..., description="Percentage adjustment applied")
    confidence: float = Field(..., ge=0, le=1)
    methodology: str
    assumptions: List[str] = Field(default_factory=list)


class ComparablePropertyAnalysis(BaseModel):
    comparable_property: Property
    
    # Distance and time factors
    distance_km: float = Field(..., ge=0)
    bearing_from_subject: Optional[float] = Field(None, ge=0, lt=360, description="Bearing in degrees")
    days_since_sale: int = Field(..., ge=0)
    sale_date: date
    
    # Original sale information
    original_sale_price_ghs: float = Field(..., gt=0)
    sale_conditions: Optional[str] = None
    sale_circumstances: Optional[str] = None
    
    # Analysis results
    similarity_score: SimilarityScore
    adjustments: List[PropertyAdjustment] = Field(default_factory=list)
    total_adjustment_ghs: float = Field(..., description="Sum of all adjustments")
    adjusted_value_ghs: float = Field(..., gt=0, description="Final adjusted value")
    
    # Data quality and reliability
    data_source: ComparableSourceType
    source_reliability: float = Field(..., ge=0, le=1)
    verification_status: str = Field(default="unverified")
    verification_date: Optional[date] = None
    
    # Usage in valuation
    weight_in_valuation: float = Field(..., ge=0, le=1)
    exclusion_reason: Optional[str] = None
    
    @validator('adjusted_value_ghs')
    def calculate_adjusted_value(cls, v, values):
        if 'original_sale_price_ghs' in values and 'total_adjustment_ghs' in values:
            calculated = values['original_sale_price_ghs'] + values['total_adjustment_ghs']
            if abs(v - calculated) > 1.0:  # Allow small rounding differences
                raise ValueError('Adjusted value must equal original price plus total adjustments')
        return v


class ComparableBasket(BaseModel):
    target_property_id: str
    search_criteria: ComparableSearch
    search_date: date = Field(default_factory=date.today)
    
    # Search results
    total_properties_found: int = Field(..., ge=0)
    properties_after_filtering: int = Field(..., ge=0)
    comparables_analyzed: List[ComparablePropertyAnalysis]
    
    # Quality metrics
    average_similarity_score: float = Field(..., ge=0, le=1)
    average_distance_km: float = Field(..., ge=0)
    average_age_days: float = Field(..., ge=0)
    geographic_coverage_score: float = Field(..., ge=0, le=1, description="How well the area is covered")
    
    # Analysis summary
    value_range_ghs: Dict[str, float] = Field(default_factory=dict)  # min, max, median, mean
    recommended_comparables: List[str] = Field(default_factory=list, description="List of comparable property IDs")
    excluded_comparables: List[str] = Field(default_factory=list, description="List of excluded property IDs")
    
    # Metadata
    analysis_version: str = Field(default="1.0")
    analyst_notes: Optional[str] = None
    
    @validator('properties_after_filtering')
    def validate_filtering_count(cls, v, values):
        if 'total_properties_found' in values and v > values['total_properties_found']:
            raise ValueError('Properties after filtering cannot exceed total properties found')
        return v
    
    class Config:
        schema_extra = {
            "example": {
                "target_property_id": "prop_123456789",
                "search_criteria": {
                    "target_property_id": "prop_123456789",
                    "region": "greater_accra",
                    "property_type": "residential_house",
                    "max_distance_km": 5.0,
                    "max_age_days": 365
                },
                "total_properties_found": 25,
                "properties_after_filtering": 12,
                "average_similarity_score": 0.82,
                "average_distance_km": 2.3,
                "average_age_days": 145,
                "geographic_coverage_score": 0.85,
                "value_range_ghs": {
                    "min": 750000,
                    "max": 950000,
                    "median": 825000,
                    "mean": 835000
                }
            }
        }