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
    """
    Normalize a Ghana region string to one of the 5 pricing clusters.

    Covers all 16 current administrative regions (post-2019 split). A region that is
    NOT recognised falls through to the raw lowercased input — so the downstream
    multiplier lookup (`regional_multipliers.get(region, 1.0)`) returns the neutral
    1.0 national baseline. Previously the fallback was "greater_accra", which silently
    applied Accra's premium (1.20×) to every unrecognised region — e.g. a Savannah or
    Oti property (rural, low-value) was over-valued by ~60%.
    """
    region_map = {
        # Greater Accra cluster
        "greater_accra": "greater_accra",
        "accra": "greater_accra",
        "central": "greater_accra",
        # Ashanti / Bono cluster
        "kumasi": "kumasi_metro",
        "kumasi_metro": "kumasi_metro",
        "ashanti": "kumasi_metro",
        "bono": "kumasi_metro",
        "bono_east": "kumasi_metro",
        "brong_ahafo": "kumasi_metro",  # legacy pre-2019 name
        "ahafo": "kumasi_metro",
        # Eastern / Volta cluster
        "eastern": "eastern",
        "volta": "eastern",
        "oti": "eastern",               # split from Volta (2019)
        # Western cluster
        "western": "western_cluster",
        "western_cluster": "western_cluster",
        "western_north": "western_cluster",  # split from Western (2019)
        # Northern cluster
        "northern": "northern_cluster",
        "northern_cluster": "northern_cluster",
        "upper_east": "northern_cluster",
        "upper_west": "northern_cluster",
        "savannah": "northern_cluster",  # split from Northern (2019)
        "north_east": "northern_cluster",  # split from Northern (2019)
    }
    key = region.lower().strip().replace(" ", "_") if region else ""
    if key not in region_map:
        logger.warning(
            "Unrecognised region '%s' — using neutral 1.0 baseline multiplier "
            "(no longer defaulting to Greater Accra's premium)", region
        )
        return key
    return region_map[key]


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


def _to_float(value, default: float = 0.0) -> float:
    """Coerce an untyped option value (which may arrive as a JSON string, e.g. a
    Postgres NUMERIC rate serialized as "8708") to float. Returns `default` for
    None / empty / non-numeric values. Method `options` are `Dict[str, Any]`, so
    they bypass pydantic coercion and MUST be coerced before any arithmetic."""
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
