# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - Critical Data Gaps Item Definitions

Defines the data structures for:
- Litigation/Legal Notice items
- Flood Risk items
- Short-Stay Listings items
"""
import scrapy
from scrapy import Field
from itemloaders.processors import TakeFirst, MapCompose, Join, Identity
from w3lib.html import remove_tags
import re
from datetime import datetime
from decimal import Decimal
from typing import Optional


def clean_text(text: str) -> str:
    """Clean and normalize text content."""
    if not text:
        return ""
    text = remove_tags(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def parse_date(date_str: str) -> Optional[datetime]:
    """Parse date string to datetime."""
    if not date_str:
        return None
    
    date_formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%B %d, %Y",
        "%d %B %Y",
        "%b %d, %Y",
        "%d %b %Y",
        "%d.%m.%Y",
        "%Y/%m/%d",
    ]
    
    for fmt in date_formats:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    
    return None


def extract_number(value: str) -> Optional[int]:
    """Extract integer from string."""
    if not value:
        return None
    numbers = re.findall(r'\d+', str(value))
    return int(numbers[0]) if numbers else None


def extract_decimal(value: str) -> Optional[Decimal]:
    """Extract decimal from string."""
    if not value:
        return None
    numbers = re.findall(r'[\d.]+', str(value))
    try:
        return Decimal(numbers[0]) if numbers else None
    except:
        return None


class LitigationItem(scrapy.Item):
    """
    Legal notice/litigation item for land dispute data.
    
    Designed to match litigation_risk_data table schema.
    """
    
    # === SOURCE INFORMATION ===
    source_name = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # 'Daily Graphic', 'Ghanaian Times', etc.
    source_url = Field(
        input_processor=MapCompose(str.strip),
        output_processor=TakeFirst()
    )
    source_id = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    publication_date = Field(
        input_processor=MapCompose(parse_date),
        output_processor=TakeFirst()
    )
    
    # === CASE INFORMATION ===
    case_number = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    # Generic title for validation pipeline
    title = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    case_title = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    court_name = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    
    # === PARTIES ===
    plaintiff_names = Field(
        output_processor=Identity()
    )  # List of plaintiff names
    defendant_names = Field(
        output_processor=Identity()
    )  # List of defendant names
    
    # === PROPERTY/LAND DETAILS ===
    property_description = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    land_parcel_id = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    land_size_acres = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    
    # === LOCATION ===
    raw_address = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    neighborhood = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    city = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    region = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    
    country = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    
    # === CASE DETAILS ===
    dispute_type = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # 'land ownership', 'boundary dispute', 'landguard', etc.
    status = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # 'pending', 'active', 'resolved', 'dismissed'
    judgment_date = Field(
        input_processor=MapCompose(parse_date),
        output_processor=TakeFirst()
    )
    judgment_summary = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    
    # === RISK INDICATORS ===
    involves_landguard = Field()  # Boolean
    involves_violence = Field()  # Boolean
    
    # === METADATA ===
    extracted_data = Field()  # Additional extracted data as dict
    scraped_at = Field()  # Timestamp when scraped
    spider_name = Field()
    spider_version = Field()


class FloodIncidentItem(scrapy.Item):
    """
    Flood incident item for hyper-local flood risk data.
    
    Designed to match flood_risk_incidents table schema.
    """
    
    # === SOURCE INFORMATION ===
    source_type = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # 'nadmo', 'twitter', 'news', 'government_report'
    source_name = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    source_url = Field(
        input_processor=MapCompose(str.strip),
        output_processor=TakeFirst()
    )
    source_id = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # Tweet ID, article ID, etc.
    
    # === INCIDENT DETAILS ===
    incident_date = Field(
        input_processor=MapCompose(parse_date),
        output_processor=TakeFirst()
    )
    
    # === LOCATION ===
    raw_address = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    neighborhood = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    city = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    region = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    
    # === SEVERITY ===
    severity = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # 'minor', 'moderate', 'severe', 'catastrophic'
    severity_score = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    
    # === IMPACT METRICS ===
    estimated_affected_properties = Field()
    estimated_affected_people = Field()
    estimated_damage_usd = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    
    # === DESCRIPTION ===
    incident_description = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    extracted_keywords = Field(
        output_processor=Identity()
    )  # List of keywords
    
    # === WEATHER CONTEXT ===
    rainfall_mm = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    weather_data = Field()  # Additional weather data as dict
    
    # === METADATA ===
    is_verified = Field()  # Boolean
    extracted_data = Field()  # Additional extracted data as dict
    scraped_at = Field()
    spider_name = Field()
    spider_version = Field()


class ShortStayListingItem(scrapy.Item):
    """
    Short-stay rental listing item for AirDNA-style metrics.
    
    Designed to match short_stay_listings table schema.
    """
    
    # === PLATFORM INFORMATION ===
    platform = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # 'airbnb', 'booking_com', 'vrbo', 'other'
    external_id = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # Platform-specific listing ID
    listing_url = Field(
        input_processor=MapCompose(str.strip),
        output_processor=TakeFirst()
    )
    
    # Standard fields for ValidationPipeline
    source_id = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    source_url = Field(
        input_processor=MapCompose(str.strip),
        output_processor=TakeFirst()
    )
    title = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    country = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    source_slug = Field(
        input_processor=MapCompose(str.strip),
        output_processor=TakeFirst()
    )
    source_name = Field(
        input_processor=MapCompose(str.strip),
        output_processor=TakeFirst()
    )
    description = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    listing_type = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    
    # === PROPERTY DETAILS ===
    property_name = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    property_type = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # 'entire_home', 'private_room', 'shared_room'
    
    # === LOCATION ===
    neighborhood = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    city = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    region = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    
    # === COORDINATES ===
    latitude = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    longitude = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    coordinates_source = Field(output_processor=TakeFirst())
    geocoding_confidence = Field()
    
    # === CAPACITY ===
    bedrooms = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    bathrooms = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    max_guests = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    
    # === AMENITIES ===
    amenities = Field(
        output_processor=Identity()
    )  # List of amenities
    
    # === HOST INFORMATION ===
    host_id = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    host_name = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    host_is_superhost = Field(
        output_processor=TakeFirst()
    )  # Boolean
    
    # === RATINGS ===
    rating_average = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    rating_count = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    
    # === STATUS ===
    is_active = Field(output_processor=TakeFirst())  # Boolean
    
    # === METADATA ===
    extracted_data = Field()  # Additional extracted data as dict
    scraped_at = Field()
    spider_name = Field()
    spider_version = Field()


class ShortStayAvailabilityItem(scrapy.Item):
    """
    Short-stay availability snapshot for occupancy calculations.
    
    Designed to match short_stay_availability table schema.
    """
    
    # === REFERENCE ===
    listing_external_id = Field(
        output_processor=TakeFirst()
    )  # Links to ShortStayListingItem
    platform = Field(
        output_processor=TakeFirst()
    )
    
    # Standard fields for ValidationPipeline
    source_id = Field(output_processor=TakeFirst())
    source_url = Field(output_processor=TakeFirst())
    title = Field(output_processor=TakeFirst())
    country = Field(output_processor=TakeFirst())
    source_slug = Field(output_processor=TakeFirst())
    source_name = Field(output_processor=TakeFirst())
    
    # === DATES ===
    check_date = Field(
        input_processor=MapCompose(parse_date),
        output_processor=TakeFirst()
    )  # Date being checked
    snapshot_date = Field(
        output_processor=TakeFirst()
    )  # Date when snapshot was taken
    
    # === AVAILABILITY ===
    is_available = Field(output_processor=TakeFirst())  # Boolean
    min_nights = Field(output_processor=TakeFirst())
    max_nights = Field(output_processor=TakeFirst())
    
    # === PRICING ===
    price_per_night_usd = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    price_per_night_local = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    currency = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    
    # === FEES ===
    cleaning_fee_usd = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    service_fee_usd = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    
    # === METADATA ===
    extracted_data = Field()
    scraped_at = Field()
    spider_name = Field()
    spider_version = Field()
