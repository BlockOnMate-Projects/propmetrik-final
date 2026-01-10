"""
Valuation Schema
Pydantic models for valuation requests and results
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import date
from enum import Enum

from .property import Property, GhanaRegion


class ValuationMethod(str, Enum):
    SALES_COMPARISON = "sales_comparison"
    COST_APPROACH = "cost_approach"
    INCOME_APPROACH = "income_approach"
    RESIDUAL_METHOD = "residual_method"
    PROFITS_METHOD = "profits_method"
    DRC_METHOD = "drc_method"
    HYBRID = "hybrid"


class ValuationPurpose(str, Enum):
    SALE = "sale"
    PURCHASE = "purchase"
    MORTGAGE = "mortgage"
    REFINANCE = "refinance"
    INSURANCE = "insurance"
    TAX = "tax"
    ESTATE = "estate"
    LITIGATION = "litigation"
    INVESTMENT = "investment"
    DEVELOPMENT = "development"
    RENTAL = "rental"
    INTERNAL = "internal"
    PORTFOLIO = "portfolio"


class ValuationType(str, Enum):
    AVM = "avm"
    PROFESSIONAL = "professional"
    HYBRID = "hybrid"
    DESKTOP = "desktop"
    DRIVE_BY = "drive_by"
    FULL_INSPECTION = "full_inspection"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ValuationRequest(BaseModel):
    property_id: str
    valuation_date: date = Field(default_factory=date.today)
    requested_methods: List[ValuationMethod] = [ValuationMethod.HYBRID]
    purpose: ValuationPurpose = Field(..., description="Purpose of valuation")
    valuation_type: ValuationType = Field(default=ValuationType.AVM)
    
    # Optional overrides and parameters
    force_refresh_comparables: bool = False
    max_comparable_distance_km: Optional[float] = Field(None, gt=0, le=50, description="Maximum distance for comparables in km")
    max_comparable_age_days: Optional[int] = Field(None, gt=0, le=730, description="Maximum age for comparables in days")
    min_comparables_required: Optional[int] = Field(None, gt=0, le=20, description="Minimum number of comparables required")
    
    # Method-specific parameters
    cost_approach_params: Optional[Dict[str, Any]] = None
    income_approach_params: Optional[Dict[str, Any]] = None
    
    # Requestor information
    requested_by: Optional[str] = None
    organization: Optional[str] = None
    
    @validator('requested_methods')
    def validate_methods(cls, v):
        if not v:
            raise ValueError('At least one valuation method must be requested')
        
        # If HYBRID is requested, don't allow other methods
        if ValuationMethod.HYBRID in v and len(v) > 1:
            raise ValueError('HYBRID method cannot be combined with other methods')
        
        return v


class MarketConditions(BaseModel):
    region: GhanaRegion
    market_trend: str = Field(..., description="Current market trend (rising, stable, declining)")
    absorption_rate: Optional[float] = Field(None, ge=0, le=1, description="Market absorption rate")
    average_days_on_market: Optional[int] = Field(None, ge=0)
    price_index_3m: Optional[float] = Field(None, description="3-month price index change")
    price_index_12m: Optional[float] = Field(None, description="12-month price index change")
    supply_demand_ratio: Optional[float] = Field(None, gt=0, description="Supply to demand ratio")
    economic_indicators: Optional[Dict[str, float]] = Field(default_factory=dict)


class ComparableProperty(BaseModel):
    property_id: str
    distance_km: float = Field(..., ge=0)
    days_old: int = Field(..., ge=0)
    sale_price_ghs: float = Field(..., gt=0)
    sale_date: date
    similarity_score: float = Field(..., ge=0, le=1)
    adjustments: Dict[str, float] = Field(default_factory=dict)
    adjusted_value: float = Field(..., gt=0)
    weight_in_valuation: float = Field(..., ge=0, le=1)


class ValuationMethodResult(BaseModel):
    method: ValuationMethod
    estimated_value: float = Field(..., gt=0)
    confidence_score: float = Field(..., ge=0, le=1)
    weight_in_final_value: float = Field(..., ge=0, le=1)
    
    # Method-specific details
    comparables_used: Optional[List[ComparableProperty]] = None
    adjustments_summary: Optional[Dict[str, Any]] = None
    methodology_notes: Optional[str] = None
    assumptions: Optional[List[str]] = Field(default_factory=list)
    limitations: Optional[List[str]] = Field(default_factory=list)


class ValueRange(BaseModel):
    low_value: float = Field(..., gt=0)
    high_value: float = Field(..., gt=0)
    most_probable_value: float = Field(..., gt=0)
    standard_deviation: Optional[float] = Field(None, ge=0)
    
    @validator('high_value')
    def validate_range(cls, v, values):
        if 'low_value' in values and v <= values['low_value']:
            raise ValueError('High value must be greater than low value')
        return v
    
    @validator('most_probable_value')
    def validate_probable_value(cls, v, values):
        if 'low_value' in values and 'high_value' in values:
            if not (values['low_value'] <= v <= values['high_value']):
                raise ValueError('Most probable value must be within the value range')
        return v


class QualityIndicators(BaseModel):
    data_quality_score: float = Field(..., ge=0, le=1)
    comparables_quality_score: float = Field(..., ge=0, le=1)
    market_data_freshness: float = Field(..., ge=0, le=1)
    geographic_coverage_score: float = Field(..., ge=0, le=1)
    method_reliability_score: float = Field(..., ge=0, le=1)


class ValuationResult(BaseModel):
    valuation_id: str
    property_id: str
    valuation_date: date
    valuation_type: ValuationType
    purpose: ValuationPurpose
    
    # Main valuation results
    estimated_value: float = Field(..., gt=0, description="Final estimated value in GHS")
    value_range: ValueRange
    confidence_level: ConfidenceLevel
    confidence_score: float = Field(..., ge=0, le=1, description="Numerical confidence score")
    
    # Method breakdown
    methods_used: Dict[ValuationMethod, ValuationMethodResult]
    primary_method: ValuationMethod = Field(..., description="Primary method used for final value")
    
    # Supporting information
    market_conditions: MarketConditions
    quality_indicators: QualityIndicators
    
    # Analysis details
    total_comparables_analyzed: int = Field(..., ge=0)
    regional_factors_applied: Dict[str, float] = Field(default_factory=dict)
    economic_adjustments: Dict[str, float] = Field(default_factory=dict)
    
    # Metadata
    created_at: date = Field(default_factory=date.today)
    valuation_expires_at: Optional[date] = None
    valuator_id: Optional[str] = None
    organization: Optional[str] = None
    
    # Disclaimers and notes
    assumptions: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    
    class Config:
        schema_extra = {
            "example": {
                "valuation_id": "val_123456789",
                "property_id": "prop_123456789",
                "valuation_date": "2026-01-09",
                "valuation_type": "avm",
                "purpose": "mortgage",
                "estimated_value": 825000,
                "value_range": {
                    "low_value": 785000,
                    "high_value": 865000,
                    "most_probable_value": 825000,
                    "standard_deviation": 25000
                },
                "confidence_level": "high",
                "confidence_score": 0.87,
                "primary_method": "sales_comparison",
                "total_comparables_analyzed": 12,
                "regional_factors_applied": {
                    "greater_accra_premium": 1.30,
                    "east_legon_location_factor": 1.15
                },
                "assumptions": [
                    "Property is in good condition",
                    "No major defects or issues",
                    "Market conditions remain stable"
                ]
            }
        }