"""
Property Schema
Pydantic models for property data with Ghana-specific validation
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import date
from enum import Enum


class PropertyType(str, Enum):
    RESIDENTIAL_HOUSE = "residential_house"
    RESIDENTIAL_APARTMENT = "residential_apartment"
    RESIDENTIAL_TOWNHOUSE = "residential_townhouse"
    RESIDENTIAL_VILLA = "residential_villa"
    RESIDENTIAL_PENTHOUSE = "residential_penthouse"
    COMMERCIAL_OFFICE = "commercial_office"
    COMMERCIAL_RETAIL = "commercial_retail"
    COMMERCIAL_WAREHOUSE = "commercial_warehouse"
    COMMERCIAL_MIXED_USE = "commercial_mixed_use"
    INDUSTRIAL_WAREHOUSE = "industrial_warehouse"
    INDUSTRIAL_FACTORY = "industrial_factory"
    LAND_RESIDENTIAL = "land_residential"
    LAND_COMMERCIAL = "land_commercial"
    LAND_INDUSTRIAL = "land_industrial"
    LAND_AGRICULTURAL = "land_agricultural"
    HOSPITALITY_HOTEL = "hospitality_hotel"
    INSTITUTIONAL_SCHOOL = "institutional_school"
    INSTITUTIONAL_HOSPITAL = "institutional_hospital"
    INSTITUTIONAL_RELIGIOUS = "institutional_religious"
    OTHER = "other"


class GhanaRegion(str, Enum):
    GREATER_ACCRA = "greater_accra"
    KUMASI_METRO = "kumasi_metro"
    EASTERN = "eastern"
    WESTERN_CLUSTER = "western_cluster"
    NORTHERN_CLUSTER = "northern_cluster"


class PropertyCondition(str, Enum):
    NEW = "new"
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    RENOVATION_NEEDED = "renovation_needed"


class LandTenureType(str, Enum):
    FREEHOLD = "freehold"
    LEASEHOLD = "leasehold"
    STOOL_LAND = "stool_land"
    FAMILY_LAND = "family_land"
    GOVERNMENT_LAND = "government_land"


class PropertyLocation(BaseModel):
    region: GhanaRegion
    district: str
    neighborhood: Optional[str] = None
    address_raw: str
    address_street: Optional[str] = None
    address_city: str
    coordinates: Optional[tuple[float, float]] = None  # (lat, lng)
    ghana_post_gps: Optional[str] = Field(None, description="Ghana Post GPS digital address")
    
    @validator('ghana_post_gps')
    def validate_ghana_post_gps(cls, v):
        if v is None:
            return v
        
        import re
        # Ghana Post GPS format: XX-XXX-XXXX
        pattern = r'^[A-Z]{2}-[A-Z0-9]{3}-[A-Z0-9]{4}$'
        if not re.match(pattern, v.upper()):
            raise ValueError('Ghana Post GPS must be in format XX-XXX-XXXX')
        return v.upper()
    
    @validator('coordinates')
    def validate_coordinates_in_ghana(cls, v):
        if v is None:
            return v
        
        lat, lng = v
        # Ghana approximate boundaries
        if not (-3.5 <= lng <= 1.3 and 4.5 <= lat <= 11.2):
            raise ValueError('Coordinates must be within Ghana boundaries')
        return v


class PropertySpecifications(BaseModel):
    bedrooms: Optional[int] = Field(None, ge=0, le=20)
    bathrooms: Optional[int] = Field(None, ge=0, le=20)
    parking_spaces: Optional[int] = Field(None, ge=0, le=50)
    land_size_sqm: Optional[float] = Field(None, gt=0, le=1000000)  # Up to 1M sqm
    built_area_sqm: Optional[float] = Field(None, gt=0, le=50000)  # Up to 50K sqm
    year_built: Optional[int] = Field(None, ge=1900, le=2100)
    condition: Optional[PropertyCondition] = None
    land_tenure: Optional[LandTenureType] = None
    lease_years_remaining: Optional[int] = Field(None, ge=0, le=999)
    
    # RICS-required building features
    quality_rating: Optional[str] = Field(None, description="Construction quality: luxury, high, standard, basic, substandard")
    floor_number: Optional[int] = Field(None, ge=0, le=100, description="Floor level for apartments")
    view_quality: Optional[str] = Field(None, description="View quality: panoramic, ocean, city, garden, standard, limited, obstructed")
    
    # Amenities
    has_swimming_pool: Optional[bool] = None
    has_garden: Optional[bool] = None
    has_security: Optional[bool] = None
    has_generator: Optional[bool] = None
    has_borehole: Optional[bool] = None
    has_air_conditioning: Optional[bool] = None
    
    @validator('built_area_sqm')
    def validate_built_area(cls, v, values):
        if v and 'land_size_sqm' in values and values['land_size_sqm']:
            if v > values['land_size_sqm'] * 3:  # Allow up to 3 floors
                raise ValueError('Built area cannot exceed 3x land size (max 3 floors assumed)')
        return v
    
    @validator('lease_years_remaining')
    def validate_lease_years(cls, v, values):
        if v is not None and 'land_tenure' in values:
            if values['land_tenure'] == LandTenureType.FREEHOLD and v is not None:
                raise ValueError('Freehold properties should not have lease years remaining')
            elif values['land_tenure'] in [LandTenureType.LEASEHOLD, LandTenureType.STOOL_LAND] and v is None:
                raise ValueError('Leasehold and stool land properties must specify lease years remaining')
        return v


class PropertyFinancials(BaseModel):
    current_price_ghs: Optional[float] = Field(None, gt=0)
    previous_price_ghs: Optional[float] = Field(None, gt=0)
    price_date: Optional[date] = None
    rental_income_monthly_ghs: Optional[float] = Field(None, gt=0)
    operating_expenses_annual_ghs: Optional[float] = Field(None, ge=0)
    property_taxes_annual_ghs: Optional[float] = Field(None, ge=0)


class PropertyDataQuality(BaseModel):
    data_quality_score: float = Field(..., ge=0, le=1, description="Overall data quality score")
    source_reliability_score: float = Field(..., ge=0, le=1)
    completeness_score: float = Field(..., ge=0, le=1)
    accuracy_score: float = Field(..., ge=0, le=1)
    freshness_score: float = Field(..., ge=0, le=1)
    
    # Data source tracking
    sources: List[str] = Field(default_factory=list, description="List of data sources")
    last_verified: Optional[date] = None
    verification_method: Optional[str] = None


class Property(BaseModel):
    id: str
    property_type: PropertyType
    location: PropertyLocation
    specifications: PropertySpecifications
    financials: Optional[PropertyFinancials] = None
    data_quality: PropertyDataQuality
    
    # Metadata
    created_at: Optional[date] = None
    updated_at: Optional[date] = None
    created_by: Optional[str] = None
    
    class Config:
        schema_extra = {
            "example": {
                "id": "prop_123456789",
                "property_type": "residential_house",
                "location": {
                    "region": "greater_accra",
                    "district": "Accra Metropolitan",
                    "neighborhood": "East Legon",
                    "address_raw": "House 15, Jungle Avenue, East Legon",
                    "address_city": "Accra",
                    "coordinates": [5.6037, -0.1870],
                    "ghana_post_gps": "GA-123-4567"
                },
                "specifications": {
                    "bedrooms": 4,
                    "bathrooms": 3,
                    "parking_spaces": 2,
                    "land_size_sqm": 800,
                    "built_area_sqm": 350,
                    "year_built": 2015,
                    "condition": "good",
                    "land_tenure": "leasehold",
                    "lease_years_remaining": 75,
                    "has_swimming_pool": True,
                    "has_garden": True,
                    "has_security": True
                },
                "financials": {
                    "current_price_ghs": 850000,
                    "price_date": "2026-01-09"
                },
                "data_quality": {
                    "data_quality_score": 0.85,
                    "source_reliability_score": 0.9,
                    "completeness_score": 0.8,
                    "accuracy_score": 0.85,
                    "freshness_score": 0.9,
                    "sources": ["agency_listing", "government_records"],
                    "last_verified": "2026-01-09"
                }
            }
        }