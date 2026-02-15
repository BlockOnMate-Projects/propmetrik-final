# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - Item Definitions

Defines the data structures for scraped property items.
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


def clean_price(price_val) -> Optional[Decimal]:
    """Extract numeric price from string or number."""
    if price_val is None:
        return None
    # If already a number, convert directly
    if isinstance(price_val, (int, float, Decimal)):
        try:
            return Decimal(str(price_val))
        except:
            return None
    # Handle string input
    if not isinstance(price_val, str):
        return None
    # Remove currency symbols and commas
    cleaned = re.sub(r'[^\d.]', '', price_val)
    try:
        return Decimal(cleaned)
    except:
        return None


def extract_currency(price_str: str) -> str:
    """Extract currency from price string."""
    if not price_str:
        return "GHS"
    
    price_upper = price_str.upper()
    if "USD" in price_upper or "$" in price_str:
        return "USD"
    elif "GH₵" in price_str or "GHS" in price_upper or "GH¢" in price_str:
        return "GHS"
    elif "€" in price_str or "EUR" in price_upper:
        return "EUR"
    elif "£" in price_str or "GBP" in price_upper:
        return "GBP"
    return "GHS"


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


def normalize_property_type(prop_type: str) -> str:
    """Normalize property type to standard values."""
    if not prop_type:
        return "unknown"
    
    prop_type_lower = prop_type.lower()
    
    mappings = {
        "house": ["house", "home", "villa", "bungalow", "townhouse", "town house", "detached", "semi-detached"],
        "apartment": ["apartment", "flat", "studio", "penthouse", "condo", "condominium", "self-contained"],
        "land": ["land", "plot", "plots", "acre", "acres", "hectare"],
        "commercial": ["commercial", "office", "shop", "warehouse", "retail", "store", "business"],
        "industrial": ["industrial", "factory", "manufacturing"],
        "hotel": ["hotel", "guest house", "guesthouse", "hostel", "lodge"],
        "school": ["school", "college", "university", "educational"],
        "hospital": ["hospital", "clinic", "medical"],
        "mixed_use": ["mixed use", "mixed-use", "residential/commercial"],
    }
    
    for standard_type, variants in mappings.items():
        if any(variant in prop_type_lower for variant in variants):
            return standard_type
    
    return "other"


def normalize_listing_type(listing_type: str) -> str:
    """Normalize listing type to standard values."""
    if not listing_type:
        return "sale"
    
    listing_lower = listing_type.lower()
    
    if any(term in listing_lower for term in ["rent", "let", "lease", "monthly"]):
        return "rent"
    elif any(term in listing_lower for term in ["sale", "sell", "buy"]):
        return "sale"
    elif any(term in listing_lower for term in ["short", "airbnb", "vacation", "holiday"]):
        return "short_term"
    
    return "sale"


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
    ]
    
    for fmt in date_formats:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    
    return None


class PropertyItem(scrapy.Item):
    """
    Standard property item structure for all Ghana property spiders.
    
    This item is designed to match the PROPMETRIK database schema for properties.
    """
    
    # === IDENTIFIERS ===
    source_id = Field(
        input_processor=MapCompose(str.strip),
        output_processor=TakeFirst()
    )
    source_url = Field(
        input_processor=MapCompose(str.strip),
        output_processor=TakeFirst()
    )
    source_name = Field(
        input_processor=MapCompose(str.strip),
        output_processor=TakeFirst()
    )
    source_slug = Field(
        input_processor=MapCompose(str.strip),
        output_processor=TakeFirst()
    )
    
    # === BASIC DETAILS ===
    title = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    description = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    property_type = Field(
        input_processor=MapCompose(clean_text, normalize_property_type),
        output_processor=TakeFirst()
    )
    listing_type = Field(
        input_processor=MapCompose(clean_text, normalize_listing_type),
        output_processor=TakeFirst()
    )
    
    # === PRICING ===
    price_raw = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    price = Field(
        input_processor=MapCompose(clean_price),
        output_processor=TakeFirst()
    )
    currency = Field(
        input_processor=MapCompose(extract_currency),
        output_processor=TakeFirst()
    )
    price_usd = Field()  # Calculated in pipeline
    price_ghs = Field()  # Calculated in pipeline
    price_per_sqm = Field()  # Calculated in pipeline
    price_negotiable = Field()
    
    # === LOCATION ===
    address_raw = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    address = Field(
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
    neighborhood = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    district = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    country = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    postal_code = Field(
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
    coordinates_source = Field(
        output_processor=TakeFirst()
    )  # 'original', 'geocoded', 'estimated'
    geocoding_confidence = Field()
    
    # === PROPERTY FEATURES ===
    bedrooms = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    bathrooms = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    toilets = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    parking_spaces = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    floors = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    floor_level = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )  # For apartments
    total_floors_in_building = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    
    # === AREA / SIZE ===
    land_size_raw = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    land_size_sqm = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    land_size_acres = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    land_size_plots = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    building_size_raw = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    building_size_sqm = Field(
        input_processor=MapCompose(extract_decimal),
        output_processor=TakeFirst()
    )
    
    # === BUILDING DETAILS ===
    year_built = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    condition = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # new, renovated, good, fair, needs_renovation
    furnishing = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )  # furnished, semi_furnished, unfurnished
    
    # === AMENITIES & FEATURES ===
    amenities = Field(
        output_processor=Identity()
    )  # List of amenities
    features = Field(
        output_processor=Identity()
    )  # List of features
    
    # === MEDIA ===
    images = Field(
        output_processor=Identity()
    )  # List of image URLs
    image_count = Field()
    has_video = Field()
    video_url = Field(
        output_processor=TakeFirst()
    )
    has_virtual_tour = Field()
    virtual_tour_url = Field(
        output_processor=TakeFirst()
    )
    
    # === AGENT / SELLER INFO ===
    agent_name = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    agent_phone = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    agent_email = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    agent_company = Field(
        input_processor=MapCompose(clean_text),
        output_processor=TakeFirst()
    )
    is_agent = Field()  # Boolean: True if listed by agent, False if owner
    
    # === LISTING METADATA ===
    date_listed = Field(
        input_processor=MapCompose(parse_date),
        output_processor=TakeFirst()
    )
    date_updated = Field(
        input_processor=MapCompose(parse_date),
        output_processor=TakeFirst()
    )
    views_count = Field(
        input_processor=MapCompose(extract_number),
        output_processor=TakeFirst()
    )
    is_featured = Field()
    is_verified = Field()
    listing_status = Field(
        output_processor=TakeFirst()
    )  # active, sold, rented, expired
    
    # === SCRAPY METADATA ===
    scraped_at = Field()  # Timestamp when scraped
    spider_name = Field()
    spider_version = Field()
    raw_html = Field()  # Optional: store raw HTML for debugging
    raw_data = Field()  # Original data from source
    
    # === CALCULATED FIELDS ===
    data_quality_score = Field()  # Calculated quality score 0-1
    completeness_score = Field()  # Field completeness 0-1
    duplicate_hash = Field()  # Hash for deduplication
    canonical_id = Field()  # Link to canonical property in DB


class PropertyImageItem(scrapy.Item):
    """Item for property images to be downloaded."""
    
    property_source_id = Field()
    source_slug = Field()
    image_url = Field()
    image_index = Field()
    image_type = Field()  # main, thumbnail, gallery
    local_path = Field()  # Path after download


class AgentItem(scrapy.Item):
    """Item for agent/realtor information."""
    
    source_id = Field()
    source_slug = Field()
    name = Field()
    company = Field()
    phone = Field()
    email = Field()
    website = Field()
    address = Field()
    profile_url = Field()
    profile_image = Field()
    total_listings = Field()
    rating = Field()
    reviews_count = Field()
    verified = Field()
    scraped_at = Field()
