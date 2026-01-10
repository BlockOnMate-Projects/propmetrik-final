"""
Ghana-specific Validation Utilities
Validation rules specific to Ghana's property market
"""

import re
from typing import Optional, Tuple, List
from enum import Enum

from ..schemas import GhanaRegion, PropertyType, LandTenureType


class GhanaAddressValidator:
    """Validate Ghana-specific address components"""
    
    VALID_REGIONS = [
        "greater_accra", "ashanti", "western", "central", "eastern",
        "volta", "northern", "upper_west", "upper_east", "brong_ahafo",
        "bono", "bono_east", "ahafo", "oti", "savannah", "north_east"
    ]
    
    # Major districts by region
    REGIONAL_DISTRICTS = {
        "greater_accra": [
            "Accra Metropolitan", "Tema Metropolitan", "Ga South",
            "Ga Central", "Ga East", "Ga West", "Adenta", "Madina",
            "Ashaiman", "Ledzokuku-Krowor", "Ablekuma North", "Ablekuma South",
            "Ablekuma Central", "Ayawaso North", "Ayawaso Central", "Ayawaso East",
            "Ayawaso West", "Okaikwei North", "Okaikwei South", "La Nkwantanang Madina"
        ],
        "kumasi_metro": [
            "Kumasi Metropolitan", "Oforikrom", "Asokwa", "Old Tafo",
            "Subin", "Nhyiaeso", "Bantama", "Kwadaso", "Suame"
        ],
        "eastern": [
            "Koforidua", "Akuapem North", "Akuapem South", "New Juaben North",
            "New Juaben South", "Suhum", "Nsawam Adoagyiri", "Akyemansa",
            "Atiwa East", "Atiwa West", "Fanteakwa North", "Fanteakwa South"
        ]
    }
    
    # Known neighborhoods in major cities
    ACCRA_NEIGHBORHOODS = [
        "East Legon", "Airport Residential", "Cantonments", "Labone",
        "Osu", "Dzorwulu", "Roman Ridge", "North Ridge", "West Ridge",
        "Adabraka", "Asylum Down", "Kokomlemle", "Nima", "Mamobi",
        "Dansoman", "Chorkor", "James Town", "Ussher Town", "Teshie",
        "Nungua", "Tema", "Ashaiman", "Madina", "Adenta", "Pantang",
        "Achimota", "Tesano", "Alajo", "Kotobabi", "Abeka", "Darkuman",
        "Kasoa", "Weija", "Gbawe", "Anyaa", "Santa Maria", "Taifa",
        "Haatso", "Atomic", "Kwabenya", "Ashongman", "Pokuase"
    ]
    
    KUMASI_NEIGHBORHOODS = [
        "Ridge", "KNUST", "Ayeduase", "Maxima", "Ahodwo", "North Suntreso",
        "South Suntreso", "Nhyiaeso", "Dichemso", "Bantama", "Suame",
        "Asokwa", "Tafo", "Kwadaso", "Oforikrom", "Ejisu", "Besease"
    ]
    
    @staticmethod
    def validate_region(region: str) -> bool:
        """Validate if region exists in Ghana"""
        return region.lower() in GhanaAddressValidator.VALID_REGIONS
    
    @staticmethod
    def validate_ghana_post_gps(gps_code: Optional[str]) -> bool:
        """Validate Ghana Post GPS digital address format: XX-XXX-XXXX"""
        if gps_code is None:
            return True
        
        # Ghana Post GPS format: two letters, dash, three alphanumeric, dash, four alphanumeric
        pattern = r'^[A-Z]{2}-[A-Z0-9]{3}-[A-Z0-9]{4}$'
        return bool(re.match(pattern, gps_code.upper()))
    
    @staticmethod
    def standardize_neighborhood(neighborhood: str, region: str) -> str:
        """Standardize neighborhood names for consistency"""
        if not neighborhood:
            return ""
        
        # Clean up common variations
        standardized = neighborhood.strip().title()
        
        # Handle common abbreviations and variations
        replacements = {
            "E. Legon": "East Legon",
            "E Legon": "East Legon", 
            "E.Legon": "East Legon",
            "Eastlegon": "East Legon",
            "W. Ridge": "West Ridge",
            "W Ridge": "West Ridge",
            "N. Ridge": "North Ridge", 
            "N Ridge": "North Ridge",
            "Airport Hills": "Airport Residential",
            "Cantonment": "Cantonments",
            "Tema Com": "Tema Community",
            "TDC": "Tema Development Corporation"
        }
        
        for old, new in replacements.items():
            if standardized.lower() == old.lower():
                standardized = new
                break
        
        return standardized
    
    @staticmethod
    def validate_coordinates_in_ghana(lat: float, lng: float) -> bool:
        """Validate if coordinates are within Ghana's approximate boundaries"""
        # Ghana approximate boundaries (with small buffer)
        # Longitude: -3.5° to 1.3° (west to east)
        # Latitude: 4.5° to 11.2° (south to north)
        return (-3.6 <= lng <= 1.4) and (4.4 <= lat <= 11.3)
    
    @staticmethod
    def get_region_from_coordinates(lat: float, lng: float) -> Optional[GhanaRegion]:
        """Approximate region determination from coordinates"""
        if not GhanaAddressValidator.validate_coordinates_in_ghana(lat, lng):
            return None
        
        # Very rough approximation based on lat/lng
        # This would typically use a proper geospatial database
        if lng > -0.5 and lat < 6.0:  # Southeastern area
            return GhanaRegion.GREATER_ACCRA
        elif lng < -1.0 and lat > 6.5 and lat < 8.5:  # Central-western high elevation
            return GhanaRegion.KUMASI_METRO  # Ashanti region approximation
        elif lng > -1.0 and lat > 6.0 and lat < 7.5:  # Eastern highlands
            return GhanaRegion.EASTERN
        elif lng < -1.5 and lat < 7.0:  # Western coastal
            return GhanaRegion.WESTERN_CLUSTER
        elif lat > 8.0:  # Northern areas
            return GhanaRegion.NORTHERN_CLUSTER
        
        return None  # Unable to determine


class GhanaPropertyValidator:
    """Ghana-specific property validation rules"""
    
    # Ghana Building Code minimum standards (approximate)
    MIN_BEDROOM_SIZE_SQM = 9.0
    MIN_BATHROOM_SIZE_SQM = 3.0
    MIN_KITCHEN_SIZE_SQM = 4.5
    MIN_LIVING_ROOM_SIZE_SQM = 12.0
    
    # Reasonable land size ranges by region (in sqm)
    LAND_SIZE_RANGES = {
        GhanaRegion.GREATER_ACCRA: (100, 10000),      # Expensive, smaller plots
        GhanaRegion.KUMASI_METRO: (150, 20000),       # Moderate, medium plots
        GhanaRegion.EASTERN: (200, 50000),            # Tourist/agricultural, larger plots
        GhanaRegion.WESTERN_CLUSTER: (200, 50000),    # Coastal/mining, varied sizes
        GhanaRegion.NORTHERN_CLUSTER: (300, 200000)   # Cheaper, larger plots
    }
    
    # Typical price ranges by region (GHS, rough guidelines)
    PRICE_RANGES = {
        GhanaRegion.GREATER_ACCRA: (150000, 10000000),
        GhanaRegion.KUMASI_METRO: (80000, 5000000),
        GhanaRegion.EASTERN: (60000, 3000000),
        GhanaRegion.WESTERN_CLUSTER: (70000, 4000000),
        GhanaRegion.NORTHERN_CLUSTER: (40000, 2000000)
    }
    
    @staticmethod
    def validate_property_specifications(
        property_type: PropertyType,
        bedrooms: Optional[int],
        built_area_sqm: Optional[float],
        land_size_sqm: Optional[float],
        region: GhanaRegion
    ) -> Tuple[bool, Optional[str]]:
        """Returns (is_valid, error_message)"""
        
        # Land size validation
        if land_size_sqm is not None:
            min_land, max_land = GhanaPropertyValidator.LAND_SIZE_RANGES[region]
            if not (min_land <= land_size_sqm <= max_land):
                return False, f"Land size {land_size_sqm}sqm is outside typical range for {region.value} ({min_land}-{max_land}sqm)"
        
        # Built area validation
        if built_area_sqm is not None and bedrooms is not None:
            # Rough minimum: 30sqm per bedroom for basic accommodation
            min_built_area = bedrooms * 30
            if built_area_sqm < min_built_area:
                return False, f"Built area {built_area_sqm}sqm seems too small for {bedrooms} bedrooms (minimum ~{min_built_area}sqm)"
            
            # Maximum reasonable: 200sqm per bedroom for luxury
            max_built_area = bedrooms * 200
            if built_area_sqm > max_built_area:
                return False, f"Built area {built_area_sqm}sqm seems excessive for {bedrooms} bedrooms (maximum ~{max_built_area}sqm)"
        
        # Property type specific validations
        if property_type in [PropertyType.RESIDENTIAL_HOUSE, PropertyType.RESIDENTIAL_VILLA]:
            if bedrooms is not None and bedrooms < 1:
                return False, "Residential houses must have at least 1 bedroom"
            
            if land_size_sqm is not None and land_size_sqm < 100:
                return False, "Residential houses typically require at least 100sqm of land"
        
        elif property_type == PropertyType.RESIDENTIAL_APARTMENT:
            if land_size_sqm is not None and built_area_sqm is not None:
                # For apartments, land_size might represent the plot share or be null
                # This is more complex validation that might need context
                pass
        
        elif property_type.startswith("land_"):
            if built_area_sqm is not None and built_area_sqm > 0:
                return False, "Land properties should not have built area"
            
            if bedrooms is not None and bedrooms > 0:
                return False, "Land properties should not have bedrooms"
        
        return True, None
    
    @staticmethod
    def validate_price_reasonableness(
        price_ghs: float,
        property_type: PropertyType,
        region: GhanaRegion,
        built_area_sqm: Optional[float] = None
    ) -> Tuple[bool, Optional[str]]:
        """Validate if price seems reasonable for the region and property type"""
        
        min_price, max_price = GhanaPropertyValidator.PRICE_RANGES[region]
        
        if price_ghs < min_price:
            return False, f"Price {price_ghs:,.0f} GHS seems too low for {region.value} (typical minimum: {min_price:,.0f} GHS)"
        
        if price_ghs > max_price:
            return False, f"Price {price_ghs:,.0f} GHS seems too high for {region.value} (typical maximum: {max_price:,.0f} GHS)"
        
        # Price per sqm validation if built area is available
        if built_area_sqm is not None and built_area_sqm > 0:
            price_per_sqm = price_ghs / built_area_sqm
            
            # Regional price per sqm guidelines (very rough)
            price_per_sqm_ranges = {
                GhanaRegion.GREATER_ACCRA: (1000, 15000),
                GhanaRegion.KUMASI_METRO: (500, 8000),
                GhanaRegion.EASTERN: (400, 6000),
                GhanaRegion.WESTERN_CLUSTER: (450, 7000),
                GhanaRegion.NORTHERN_CLUSTER: (300, 4000)
            }
            
            min_psm, max_psm = price_per_sqm_ranges[region]
            if not (min_psm <= price_per_sqm <= max_psm):
                return False, f"Price per sqm {price_per_sqm:,.0f} GHS/sqm is outside typical range for {region.value} ({min_psm:,.0f}-{max_psm:,.0f} GHS/sqm)"
        
        return True, None
    
    @staticmethod
    def validate_land_tenure(
        land_tenure: LandTenureType,
        lease_years_remaining: Optional[int],
        region: GhanaRegion
    ) -> Tuple[bool, Optional[str]]:
        """Validate land tenure and lease information"""
        
        if land_tenure == LandTenureType.FREEHOLD:
            if lease_years_remaining is not None:
                return False, "Freehold properties should not have lease years remaining"
        
        elif land_tenure in [LandTenureType.LEASEHOLD, LandTenureType.STOOL_LAND]:
            if lease_years_remaining is None:
                return False, f"{land_tenure.value} properties must specify lease years remaining"
            
            if lease_years_remaining <= 0:
                return False, "Lease years remaining must be positive"
            
            # Ghana lease terms are typically 50-99 years
            if lease_years_remaining > 99:
                return False, f"Lease years remaining ({lease_years_remaining}) exceeds typical maximum (99 years)"
        
        elif land_tenure == LandTenureType.FAMILY_LAND:
            # Family land can be complex - may or may not have formal lease terms
            if lease_years_remaining is not None and lease_years_remaining > 200:
                return False, "Family land lease terms seem unrealistic"
        
        return True, None


class GhanaMarketValidator:
    """Validate market-related data for Ghana"""
    
    # Regional multipliers for pricing
    REGIONAL_MULTIPLIERS = {
        GhanaRegion.GREATER_ACCRA: 1.30,
        GhanaRegion.KUMASI_METRO: 1.00,
        GhanaRegion.EASTERN: 1.00,
        GhanaRegion.WESTERN_CLUSTER: 1.00,
        GhanaRegion.NORTHERN_CLUSTER: 0.70
    }
    
    # Typical rental yields by region (annual %)
    TYPICAL_RENTAL_YIELDS = {
        GhanaRegion.GREATER_ACCRA: (4.0, 12.0),
        GhanaRegion.KUMASI_METRO: (6.0, 15.0),
        GhanaRegion.EASTERN: (5.0, 14.0),
        GhanaRegion.WESTERN_CLUSTER: (5.5, 14.0),
        GhanaRegion.NORTHERN_CLUSTER: (7.0, 18.0)
    }
    
    @staticmethod
    def validate_rental_yield(
        rental_yield_pct: float,
        region: GhanaRegion
    ) -> Tuple[bool, Optional[str]]:
        """Validate if rental yield is reasonable for the region"""
        
        min_yield, max_yield = GhanaMarketValidator.TYPICAL_RENTAL_YIELDS[region]
        
        if rental_yield_pct < min_yield:
            return False, f"Rental yield {rental_yield_pct:.1f}% seems too low for {region.value} (typical range: {min_yield:.1f}%-{max_yield:.1f}%)"
        
        if rental_yield_pct > max_yield:
            return False, f"Rental yield {rental_yield_pct:.1f}% seems too high for {region.value} (typical range: {min_yield:.1f}%-{max_yield:.1f}%)"
        
        return True, None
    
    @staticmethod
    def get_regional_multiplier(region: GhanaRegion) -> float:
        """Get the pricing multiplier for a region"""
        return GhanaMarketValidator.REGIONAL_MULTIPLIERS.get(region, 1.0)