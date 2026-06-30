"""
Shared, dependency-free building blocks for the valuation method modules.

This module sits at the BOTTOM of the dependency graph: it imports nothing from `main` or from any
sibling method module. Both `main.py` and every `app/methods/<method>.py` import FROM here, so the
dependency direction is strictly one-way (main → methods → _shared) with no cycles. The method
modules can therefore be imported and unit-tested in isolation.
"""
import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

logger = logging.getLogger("valuation_engine")


# ============================================================================
# SHARED REQUEST / RESPONSE MODELS
# ============================================================================

class PropertyInput(BaseModel):
    """Property data for valuation"""
    id: str
    property_type: str
    region: str
    address_city: Optional[str] = None
    address_street: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    land_area_sqm: Optional[float] = None
    building_size_sqm: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    year_built: Optional[int] = None
    condition: Optional[str] = "good"
    current_price_ghs: Optional[float] = None
    monthly_rent_ghs: Optional[float] = None

    class Config:
        extra = "allow"


class ValuationMethodRequest(BaseModel):
    """Request for a single valuation method"""
    property: PropertyInput
    valuation_date: Optional[str] = None
    options: Optional[Dict[str, Any]] = None


class ValuationMethodResponse(BaseModel):
    """Response from a valuation method"""
    success: bool
    method: str
    estimated_value: float
    confidence_score: float
    confidence_level: str
    value_range: Optional[Dict[str, float]] = None
    details: Dict[str, Any]
    assumptions: List[str]
    limitations: List[str]
    calculation_time_ms: float


# ============================================================================
# SHARED HELPERS
# ============================================================================

def _normalize_region(region: str) -> str:
    """Normalize region string"""
    region_map = {
        "greater_accra": "greater_accra",
        "accra": "greater_accra",
        "kumasi": "kumasi_metro",
        "kumasi_metro": "kumasi_metro",
        "ashanti": "kumasi_metro",
        "eastern": "eastern",
        "western": "western_cluster",
        "western_cluster": "western_cluster",
        "northern": "northern_cluster",
        "northern_cluster": "northern_cluster",
        "upper_east": "northern_cluster",
        "upper_west": "northern_cluster",
        "volta": "eastern",
        "central": "greater_accra",
        "bono": "kumasi_metro",
    }
    return region_map.get(region.lower(), "greater_accra")


def _normalize_property_type(prop_type: str) -> str:
    """Normalize property type string"""
    type_map = {
        "residential": "residential",
        "house": "residential",
        "residential_house": "residential",
        "apartment": "residential",
        "residential_apartment": "residential",
        "townhouse": "residential",
        "villa": "residential",
        "commercial": "commercial",
        "commercial_office": "commercial",
        "office": "commercial",
        "retail": "commercial",
        "commercial_retail": "commercial",
        "industrial": "industrial",
        "warehouse": "industrial",
        "industrial_warehouse": "industrial",
        "land": "land",
        "residential_land": "land",
        "commercial_land": "land",
    }
    return type_map.get(prop_type.lower(), "residential")


def _get_confidence_level(score: float) -> str:
    """Convert confidence score to level"""
    if score >= 0.80:
        return "high"
    elif score >= 0.60:
        return "medium"
    else:
        return "low"
