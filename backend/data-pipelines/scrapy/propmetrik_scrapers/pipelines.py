# -*- coding: utf-8 -*-
"""
Propmetrik Scrapers - Item Pipelines

Pipelines for processing, validating, and storing scraped property data.
"""
import logging
import hashlib
import json
import re
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from urllib.parse import urlparse

import psycopg2
from psycopg2.extras import RealDictCursor
from opensearchpy import OpenSearch, helpers
from scrapy.exceptions import DropItem
import redis
import requests

logger = logging.getLogger(__name__)


# ============================================================================
# VALIDATION PIPELINE
# ============================================================================

class ValidationPipeline:
    """
    Validates items have required fields and correct data types.
    """
    
    required_fields = ['source_id', 'source_url', 'title']
    
    def process_item(self, item, spider):
        """Validate item has required fields."""
        
        # Check required fields
        for field in self.required_fields:
            if not item.get(field):
                raise DropItem(f"Missing required field: {field}")
        
        # Validate URL format
        if item.get('source_url'):
            parsed = urlparse(item['source_url'])
            if not parsed.scheme or not parsed.netloc:
                raise DropItem(f"Invalid URL format: {item['source_url']}")
        
        # Validate price is positive
        if item.get('price') and item['price'] < 0:
            raise DropItem(f"Invalid price: {item['price']}")
        
        # Validate bedrooms/bathrooms are reasonable
        if item.get('bedrooms') and (item['bedrooms'] < 0 or item['bedrooms'] > 100):
            logger.warning(f"Suspicious bedroom count: {item['bedrooms']}")
        
        if item.get('bathrooms') and (item['bathrooms'] < 0 or item['bathrooms'] > 50):
            logger.warning(f"Suspicious bathroom count: {item['bathrooms']}")
        
        return item


# ============================================================================
# CLEANING PIPELINE
# ============================================================================

class CleaningPipeline:
    """
    Cleans and normalizes item data.
    """
    
    # Ghana regions for normalization
    GHANA_REGIONS = {
        'greater accra': 'Greater Accra',
        'accra': 'Greater Accra',
        'ashanti': 'Ashanti',
        'kumasi': 'Ashanti',
        'western': 'Western',
        'takoradi': 'Western',
        'eastern': 'Eastern',
        'koforidua': 'Eastern',
        'central': 'Central',
        'cape coast': 'Central',
        'northern': 'Northern',
        'tamale': 'Northern',
        'volta': 'Volta',
        'ho': 'Volta',
        'upper east': 'Upper East',
        'bolgatanga': 'Upper East',
        'upper west': 'Upper West',
        'wa': 'Upper West',
        'bono': 'Bono',
        'sunyani': 'Bono',
        'bono east': 'Bono East',
        'ahafo': 'Ahafo',
        'western north': 'Western North',
        'north east': 'North East',
        'savannah': 'Savannah',
        'oti': 'Oti',
    }
    
    # Common Ghana cities/neighborhoods
    ACCRA_AREAS = [
        'east legon', 'cantonments', 'airport residential', 'ridge', 'labone',
        'osu', 'dzorwulu', 'roman ridge', 'adjiringanor', 'tse addo', 'spintex',
        'tema', 'sakumono', 'community', 'ashongman', 'dome', 'kwabenya',
        'madina', 'adenta', 'haatso', 'achimota', 'lapaz', 'dansoman',
        'kasoa', 'weija', 'gbawe', 'mallam', 'kaneshie', 'circle',
        'nungua', 'teshie', 'labadi', 'la', 'ablekuma', 'odorkor',
    ]
    
    # Exchange rates (should be updated dynamically)
    EXCHANGE_RATES = {
        'GHS': 1.0,
        'USD': 15.5,  # 1 USD = 15.5 GHS (approximate)
        'EUR': 17.0,
        'GBP': 19.5,
    }
    
    def process_item(self, item, spider):
        """Clean and normalize item fields."""
        
        # Normalize title
        if item.get('title'):
            item['title'] = self._clean_title(item['title'])
        
        # Normalize description
        if item.get('description'):
            item['description'] = self._clean_description(item['description'])
        
        # Normalize region
        if item.get('region'):
            item['region'] = self._normalize_region(item['region'])
        
        # Normalize city (detect from address/neighborhood if missing)
        if not item.get('city') and item.get('address_raw'):
            item['city'] = self._detect_city(item['address_raw'])
        
        # Normalize country
        if not item.get('country'):
            item['country'] = 'Ghana'
        
        # Calculate USD price
        if item.get('price') and item.get('currency') and 'price_usd' in item.fields:
            item['price_usd'] = self._convert_to_usd(item['price'], item['currency'])
            item['price_ghs'] = self._convert_to_ghs(item['price'], item['currency'])
        
        # Calculate price per sqm
        if item.get('price_usd') and item.get('building_size_sqm') and 'price_per_sqm' in item.fields:
            item['price_per_sqm'] = float(item['price_usd']) / float(item['building_size_sqm'])
        
        # Convert land size to sqm if not present
        if 'land_size_sqm' in item.fields:
            if item.get('land_size_acres') and not item.get('land_size_sqm'):
                item['land_size_sqm'] = float(item['land_size_acres']) * 4046.86
            elif item.get('land_size_plots') and not item.get('land_size_sqm'):
                # 1 plot ≈ 70x100 ft ≈ 650 sqm in Ghana
                item['land_size_sqm'] = float(item['land_size_plots']) * 650
        
        # Clean phone numbers
        if item.get('agent_phone'):
            item['agent_phone'] = self._clean_phone(item['agent_phone'])
        
        # Clean and validate images
        if item.get('images'):
            item['images'] = self._clean_images(item['images'])
            item['image_count'] = len(item['images'])
        
        # Property specific enrichments
        if 'duplicate_hash' in item.fields:
            item['duplicate_hash'] = self._generate_duplicate_hash(item)
        
        if 'data_quality_score' in item.fields:
            item['data_quality_score'] = self._calculate_quality_score(item)
            item['completeness_score'] = self._calculate_completeness_score(item)
        
        return item
    
    def _clean_title(self, title: str) -> str:
        """Clean property title."""
        # Remove excessive punctuation and normalize whitespace
        title = re.sub(r'[!@#$%^&*()_+=\[\]{};:\'"\\|<>?/~`]+', ' ', title)
        title = re.sub(r'\s+', ' ', title).strip()
        # Capitalize properly
        return title.title() if title.isupper() or title.islower() else title
    
    def _clean_description(self, desc: str) -> str:
        """Clean property description."""
        # Remove HTML entities and excessive whitespace
        desc = re.sub(r'&nbsp;|&amp;|&lt;|&gt;', ' ', desc)
        desc = re.sub(r'\s+', ' ', desc).strip()
        return desc
    
    def _normalize_region(self, region: str) -> str:
        """Normalize Ghana region name."""
        region_lower = region.lower().strip()
        return self.GHANA_REGIONS.get(region_lower, region.title())
    
    def _detect_city(self, address: str) -> Optional[str]:
        """Detect city from address string."""
        address_lower = address.lower()
        
        # Check for Accra areas
        for area in self.ACCRA_AREAS:
            if area in address_lower:
                return 'Accra'
        
        # Check for major cities
        major_cities = ['kumasi', 'takoradi', 'tamale', 'tema', 'cape coast']
        for city in major_cities:
            if city in address_lower:
                return city.title()
        
        return None
    
    def _convert_to_usd(self, price: Decimal, currency: str) -> float:
        """Convert price to USD."""
        rate = self.EXCHANGE_RATES.get(currency, 1.0)
        if currency == 'USD':
            return float(price)
        elif currency == 'GHS':
            return float(price) / rate
        else:
            ghs_amount = float(price) * rate
            return ghs_amount / self.EXCHANGE_RATES['USD']
    
    def _convert_to_ghs(self, price: Decimal, currency: str) -> float:
        """Convert price to GHS."""
        rate = self.EXCHANGE_RATES.get(currency, 1.0)
        if currency == 'GHS':
            return float(price)
        else:
            return float(price) * rate
    
    def _clean_phone(self, phone: str) -> str:
        """Clean and format phone number."""
        # Remove non-digits
        digits = re.sub(r'\D', '', phone)
        
        # Handle Ghana phone formats
        if digits.startswith('233'):
            return f"+{digits}"
        elif digits.startswith('0') and len(digits) == 10:
            return f"+233{digits[1:]}"
        elif len(digits) == 9:
            return f"+233{digits}"
        
        return phone
    
    def _clean_images(self, images: List[str]) -> List[str]:
        """Clean and validate image URLs."""
        cleaned = []
        for img in images:
            if img and isinstance(img, str):
                # Ensure absolute URL
                if img.startswith('//'):
                    img = f"https:{img}"
                elif not img.startswith('http'):
                    continue
                # Remove query params for dedup
                cleaned.append(img.split('?')[0])
        return list(dict.fromkeys(cleaned))  # Remove duplicates while preserving order
    
    def _generate_duplicate_hash(self, item) -> str:
        """Generate hash for duplicate detection."""
        # Create composite key from multiple fields
        components = [
            str(item.get('title', '')).lower()[:50],
            str(item.get('address_raw', '') or item.get('address', '')).lower()[:50],
            str(item.get('price', '')),
            str(item.get('bedrooms', '')),
            str(item.get('property_type', '')),
        ]
        composite = '|'.join(components)
        return hashlib.md5(composite.encode()).hexdigest()
    
    def _calculate_quality_score(self, item) -> float:
        """Calculate data quality score (0-1)."""
        score = 0.0
        max_score = 0.0
        
        # Price info (20%)
        max_score += 0.2
        if item.get('price'):
            score += 0.15
            if item.get('currency'):
                score += 0.05
        
        # Location info (25%)
        max_score += 0.25
        if item.get('latitude') and item.get('longitude'):
            score += 0.15
        if item.get('city'):
            score += 0.05
        if item.get('region'):
            score += 0.05
        
        # Property details (25%)
        max_score += 0.25
        if item.get('bedrooms') is not None:
            score += 0.08
        if item.get('bathrooms') is not None:
            score += 0.07
        if item.get('building_size_sqm') or item.get('land_size_sqm'):
            score += 0.10
        
        # Description quality (15%)
        max_score += 0.15
        desc = item.get('description', '')
        if len(desc) > 50:
            score += 0.05
        if len(desc) > 200:
            score += 0.05
        if len(desc) > 500:
            score += 0.05
        
        # Images (15%)
        max_score += 0.15
        img_count = item.get('image_count', 0)
        if img_count >= 1:
            score += 0.05
        if img_count >= 3:
            score += 0.05
        if img_count >= 5:
            score += 0.05
        
        return round(score / max_score, 2) if max_score > 0 else 0.0
    
    def _calculate_completeness_score(self, item) -> float:
        """Calculate field completeness score (0-1)."""
        important_fields = [
            'title', 'description', 'price', 'property_type', 'listing_type',
            'address', 'city', 'region', 'bedrooms', 'bathrooms',
            'building_size_sqm', 'images', 'agent_name', 'agent_phone',
        ]
        
        filled = sum(1 for f in important_fields if item.get(f))
        return round(filled / len(important_fields), 2)


# ============================================================================
# GEOCODING PIPELINE
# ============================================================================

class GeocodingPipeline:
    """
    Geocodes addresses that don't have coordinates.
    Uses the Propmetrik API geocoding endpoint.
    """
    
    def __init__(self, api_url: str, api_key: str, cache_enabled: bool):
        self.api_url = api_url
        self.api_key = api_key
        self.cache_enabled = cache_enabled
        self.geocoded_count = 0
        self.cache_hits = 0
    
    @classmethod
    def from_crawler(cls, crawler):
        return cls(
            api_url=crawler.settings.get('PROPMETRIK_API_URL'),
            api_key=crawler.settings.get('PROPMETRIK_API_KEY', ''),
            cache_enabled=crawler.settings.getbool('GEOCODING_CACHE_ENABLED', True)
        )
    
    def process_item(self, item, spider):
        """Geocode item if coordinates are missing."""
        
        # Skip if already has coordinates
        if item.get('latitude') and item.get('longitude'):
            item['coordinates_source'] = 'original'
            return item
        
        # Build address string
        address_parts = []
        if item.get('address'):
            address_parts.append(item['address'])
        elif item.get('address_raw'):
            address_parts.append(item['address_raw'])
        
        if item.get('neighborhood'):
            address_parts.append(item['neighborhood'])
        if item.get('city'):
            address_parts.append(item['city'])
        if item.get('region'):
            address_parts.append(item['region'])
        
        address_parts.append('Ghana')
        
        address = ', '.join(filter(None, address_parts))
        
        if not address or address == 'Ghana':
            return item
        
        try:
            # Call geocoding API
            response = requests.post(
                f"{self.api_url}/api/v1/data-hub/geocode",
                json={'address': address},
                headers={'Authorization': f'Bearer {self.api_key}'} if self.api_key else {},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success') and data.get('data'):
                    result = data['data']
                    item['latitude'] = result.get('latitude')
                    item['longitude'] = result.get('longitude')
                    item['coordinates_source'] = 'geocoded'
                    item['geocoding_confidence'] = result.get('confidence')
                    
                    # Update address fields from geocoding result
                    if result.get('formatted_address'):
                        item['address'] = result['formatted_address']
                    
                    self.geocoded_count += 1
                    logger.debug(f"Geocoded: {address}")
            
        except Exception as e:
            logger.warning(f"Geocoding failed for '{address}': {e}")
        
        return item
    
    def close_spider(self, spider):
        logger.info(f"Geocoding stats: {self.geocoded_count} addresses geocoded")


# ============================================================================
# DUPLICATE FILTER PIPELINE
# ============================================================================

class DuplicateFilterPipeline:
    """
    Filters duplicate properties using Redis-based deduplication.
    Uses REDIS_URL for connection string consistency with backend.
    """
    
    def __init__(self, redis_client: redis.Redis, key_prefix: str, ttl: int):
        self.redis = redis_client
        self.key_prefix = key_prefix
        self.ttl = ttl
        self.duplicates_found = 0
    
    @classmethod
    def from_crawler(cls, crawler):
        redis_url = crawler.settings.get('REDIS_URL')
        if redis_url:
            redis_client = redis.from_url(redis_url, decode_responses=True)
        else:
            # Fallback to individual settings
            redis_client = redis.Redis(
                host=crawler.settings.get('REDIS_HOST', 'localhost'),
                port=crawler.settings.getint('REDIS_PORT', 6379),
                password=crawler.settings.get('REDIS_PASSWORD'),
                db=crawler.settings.getint('REDIS_DB', 0),
                decode_responses=True
            )
        return cls(
            redis_client=redis_client,
            key_prefix='propmetrik:dedup:',
            ttl=86400 * 7  # 7 days
        )
    
    def process_item(self, item, spider):
        """Check for duplicates and filter if needed."""
        
        dup_hash = item.get('duplicate_hash')
        if not dup_hash:
            return item
        
        key = f"{self.key_prefix}{dup_hash}"
        
        # Check if we've seen this hash
        existing = self.redis.get(key)
        
        if existing:
            self.duplicates_found += 1
            existing_data = json.loads(existing)
            
            # If from same source, update; if different source, keep both
            if existing_data.get('source_slug') == item.get('source_slug'):
                # Same source - update the existing entry
                self.redis.setex(key, self.ttl, json.dumps({
                    'source_slug': item.get('source_slug'),
                    'source_id': item.get('source_id'),
                    'scraped_at': item.get('scraped_at'),
                }))
                logger.debug(f"Updated duplicate: {item.get('source_id')}")
            else:
                # Different source - this is valuable for cross-referencing
                logger.debug(f"Cross-source match: {item.get('source_slug')} vs {existing_data.get('source_slug')}")
        else:
            # New item - store in dedup cache
            self.redis.setex(key, self.ttl, json.dumps({
                'source_slug': item.get('source_slug'),
                'source_id': item.get('source_id'),
                'scraped_at': item.get('scraped_at'),
            }))
        
        return item
    
    def close_spider(self, spider):
        logger.info(f"Duplicate filter stats: {self.duplicates_found} duplicates found")


# ============================================================================
# POSTGRES PIPELINE
# ============================================================================

class PostgresPipeline:
    """
    Stores items in PostgreSQL database.
    Uses DATABASE_URL for connection string consistency with backend.
    Now includes multi-source tracking integration.
    """
    
    def __init__(self, database_url: str, enable_multi_source_tracking: bool = True):
        self.database_url = database_url
        self.enable_multi_source_tracking = enable_multi_source_tracking
        self.conn = None
        self.items_saved = 0
        self.items_updated = 0
        self.sources_tracked = 0
        self._multi_source_tracker = None
    
    @classmethod
    def from_crawler(cls, crawler):
        database_url = crawler.settings.get('DATABASE_URL')
        if not database_url:
            raise ValueError("DATABASE_URL not configured in settings")
        enable_tracking = crawler.settings.getbool('ENABLE_MULTI_SOURCE_TRACKING', True)
        return cls(database_url, enable_tracking)
    
    def open_spider(self, spider):
        """Open database connection."""
        self.conn = psycopg2.connect(self.database_url)
        self.conn.autocommit = False
        logger.info("PostgreSQL connection opened")
        
        # Initialize multi-source tracker if enabled
        if self.enable_multi_source_tracking:
            try:
                from .multi_source_tracker import MultiSourceTracker
                self._multi_source_tracker = MultiSourceTracker(self.conn)
                logger.info("Multi-source tracking enabled")
            except ImportError as e:
                logger.warning(f"Multi-source tracking unavailable: {e}")
                self._multi_source_tracker = None
    
    def close_spider(self, spider):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            logger.info(f"PostgreSQL: {self.items_saved} items saved, {self.items_updated} items updated, {self.sources_tracked} sources tracked")
    
    # Region name to enum mapping for Ghana
    REGION_ENUM_MAP = {
        'greater accra': 'greater_accra',
        'accra': 'greater_accra',
        'ashanti': 'kumasi_metro',
        'kumasi': 'kumasi_metro',
        'eastern': 'eastern',
        'western': 'western_cluster',
        'central': 'western_cluster',
        'northern': 'northern_cluster',
        'volta': 'eastern',
        'upper east': 'northern_cluster',
        'upper west': 'northern_cluster',
        'bono': 'northern_cluster',
    }

    def _normalize_region_enum(self, region: str) -> str:
        """Convert region name to database enum value."""
        if not region:
            return 'greater_accra'  # Default
        region_lower = region.lower().strip()
        return self.REGION_ENUM_MAP.get(region_lower, 'greater_accra')

    def _normalize_transaction_type(self, listing_type: str) -> str:
        """Convert listing type to transaction_type enum."""
        if not listing_type:
            return 'sale'
        lt_lower = listing_type.lower()
        if 'rent' in lt_lower:
            return 'rental'
        elif 'lease' in lt_lower:
            return 'lease'
        return 'sale'

    def _save_litigation_data(self, cursor, item):
        """Save litigation risk item."""
        # Check existence using source_url
        cursor.execute("SELECT id FROM litigation_risk_data WHERE source_url = %s", (item.get('source_url'),))
        if cursor.fetchone():
            return # Skip existing for now
            
        cursor.execute("""
            INSERT INTO litigation_risk_data (
                source_name, source_url,
                case_number, case_title, court_name,
                plaintiff_names, defendant_names,
                property_description, land_parcel_id, land_size_acres,
                raw_address, neighborhood, city, region,
                dispute_type, status, judgment_date, judgment_summary,
                involves_landguard, involves_violence,
                extracted_data
            ) VALUES (
                %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                %s
            )
        """, (
            item.get('source_name'), item.get('source_url'),
            item.get('case_number'), item.get('case_title'), item.get('court_name'),
            item.get('plaintiff_names'), item.get('defendant_names'),
            item.get('property_description'), item.get('land_parcel_id'), item.get('land_size_acres'),
            item.get('raw_address'), item.get('neighborhood'), item.get('city'), item.get('region'),
            item.get('dispute_type'), item.get('status'), item.get('judgment_date'), item.get('judgment_summary'),
            item.get('involves_landguard')[0] if isinstance(item.get('involves_landguard'), list) else item.get('involves_landguard'),
            item.get('involves_violence')[0] if isinstance(item.get('involves_violence'), list) else item.get('involves_violence'),
            json.dumps(item.get('extracted_data') or {})
        ))
        self.items_saved += 1
        
    def _save_flood_data(self, cursor, item):
        """Save flood risk incident."""
        pass

    def _save_short_stay_listing_data(self, cursor, item):
        """Save short-stay listing data."""
        # Check existence using platform and external_id
        cursor.execute("""
            SELECT id FROM short_stay_listings 
            WHERE platform = %s AND external_id = %s
        """, (item.get('platform'), item.get('external_id')))
        
        existing = cursor.fetchone()
        
        # Prepare location point
        location = None
        if item.get('latitude') and item.get('longitude'):
            location = f"SRID=4326;POINT({item['longitude']} {item['latitude']})"

        if existing:
            # Update existing
            cursor.execute("""
                UPDATE short_stay_listings SET
                    property_name = %s, property_type = %s,
                    neighborhood = %s, city = %s, region = %s,
                    location = %s::geography,
                    bedrooms = %s, bathrooms = %s, max_guests = %s,
                    amenities = %s,
                    host_id = %s, host_name = %s, host_is_superhost = %s,
                    rating_average = %s, rating_count = %s,
                    is_active = %s,
                    extracted_data = %s,
                    last_seen_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s
            """, (
                item.get('property_name'), item.get('property_type'),
                item.get('neighborhood'), item.get('city'), item.get('region'),
                location,
                item.get('bedrooms'), item.get('bathrooms'), item.get('max_guests'),
                item.get('amenities'),
                item.get('host_id'), item.get('host_name'), item.get('host_is_superhost'),
                item.get('rating_average'), item.get('rating_count'),
                item.get('is_active', True),
                json.dumps(item.get('extracted_data') or {}),
                existing['id']
            ))
            self.items_updated += 1
            return existing['id']
        else:
            # Insert new
            cursor.execute("""
                INSERT INTO short_stay_listings (
                    platform, external_id, listing_url,
                    property_name, property_type,
                    neighborhood, city, region,
                    location,
                    bedrooms, bathrooms, max_guests,
                    amenities,
                    host_id, host_name, host_is_superhost,
                    rating_average, rating_count,
                    is_active,
                    extracted_data
                ) VALUES (
                    %s, %s, %s,
                    %s, %s,
                    %s, %s, %s,
                    %s::geography,
                    %s, %s, %s,
                    %s,
                    %s, %s, %s,
                    %s, %s,
                    %s,
                    %s
                ) RETURNING id
            """, (
                item.get('platform'), item.get('external_id'), item.get('listing_url'),
                item.get('property_name'), item.get('property_type'),
                item.get('neighborhood'), item.get('city'), item.get('region'),
                location,
                item.get('bedrooms'), item.get('bathrooms'), item.get('max_guests'),
                item.get('amenities'),
                item.get('host_id'), item.get('host_name'), item.get('host_is_superhost'),
                item.get('rating_average'), item.get('rating_count'),
                item.get('is_active', True),
                json.dumps(item.get('extracted_data') or {})
            ))
            result = cursor.fetchone()
            self.items_saved += 1
            return result['id']

    def _save_short_stay_availability_data(self, cursor, item):
        """Save short-stay availability snapshot."""
        # Find listing_id correctly
        cursor.execute("""
            SELECT id FROM short_stay_listings 
            WHERE platform = %s AND external_id = %s
        """, (item.get('platform'), item.get('listing_external_id')))
        
        listing = cursor.fetchone()
        if not listing:
            logger.warning(f"Could not find listing {item.get('listing_external_id')} for availability snapshot")
            return

        # Insert snapshot (UPSERT on listing_id, check_date, snapshot_date)
        cursor.execute("""
            INSERT INTO short_stay_availability (
                listing_id, check_date, snapshot_date,
                is_available, min_nights, max_nights,
                price_per_night_usd, price_per_night_local, currency,
                cleaning_fee_usd, service_fee_usd,
                extracted_data
            ) VALUES (
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s
            ) ON CONFLICT (listing_id, check_date, snapshot_date) DO UPDATE SET
                is_available = EXCLUDED.is_available,
                min_nights = EXCLUDED.min_nights,
                max_nights = EXCLUDED.max_nights,
                price_per_night_usd = EXCLUDED.price_per_night_usd,
                price_per_night_local = EXCLUDED.price_per_night_local,
                currency = EXCLUDED.currency,
                cleaning_fee_usd = EXCLUDED.cleaning_fee_usd,
                service_fee_usd = EXCLUDED.service_fee_usd,
                extracted_data = EXCLUDED.extracted_data
        """, (
            listing['id'], item.get('check_date'), item.get('snapshot_date'),
            item.get('is_available'), item.get('min_nights'), item.get('max_nights'),
            item.get('price_per_night_usd'), item.get('price_per_night_local'), item.get('currency'),
            item.get('cleaning_fee_usd'), item.get('service_fee_usd'),
            json.dumps(item.get('extracted_data') or {})
        ))
        self.items_saved += 1

    def _normalize_property_type(self, prop_type: str) -> str:
        """Convert property type to database enum value."""
        if not prop_type:
            return 'residential_house'
        pt_lower = prop_type.lower()
        if 'apartment' in pt_lower or 'flat' in pt_lower:
            return 'apartment_flat'
        elif 'commercial' in pt_lower or 'shop' in pt_lower:
            return 'commercial_shop'
        elif 'office' in pt_lower:
            return 'commercial_office'
        elif 'warehouse' in pt_lower:
            return 'warehouse'
        elif 'land' in pt_lower or 'plot' in pt_lower:
            return 'land'
        elif 'industrial' in pt_lower:
            return 'industrial'
        elif 'mixed' in pt_lower:
            return 'mixed_use'
        return 'residential_house'

    def process_item(self, item, spider):
        """Save item to PostgreSQL and track multi-source contributions."""
        
        try:
            # Determine Item Type and Route
            from propmetrik_scrapers.critical_data_items import (
                LitigationItem, FloodIncidentItem, 
                ShortStayListingItem, ShortStayAvailabilityItem
            )
            
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                if isinstance(item, LitigationItem) or 'case_number' in item.fields:
                     self._save_litigation_data(cur, item)
                elif isinstance(item, FloodIncidentItem) or 'incident_description' in item.fields:
                     self._save_flood_data(cur, item)
                elif isinstance(item, ShortStayListingItem) or 'property_name' in item.fields:
                     self._save_short_stay_listing_data(cur, item)
                elif isinstance(item, ShortStayAvailabilityItem) or 'check_date' in item.fields:
                     self._save_short_stay_availability_data(cur, item)
                else:
                    # Default: Property Listing
                    # Check if property exists by external_id and external_source
                    cur.execute("""
                        SELECT id, region FROM properties 
                        WHERE external_id = %s AND external_source = %s
                    """, (item.get('source_id'), item.get('source_slug')))
                    
                    existing = cur.fetchone()
                    property_id = None
                    
                    if existing:
                        # Update existing property
                        property_id = existing['id']
                        self._update_property(cur, existing['id'], existing['region'], item)
                        self.items_updated += 1
                    else:
                        # Insert new property
                        property_id = self._insert_property(cur, item)
                        self.items_saved += 1
                    
                    # Track multi-source contribution if enabled and we have a property_id
                    if self._multi_source_tracker and property_id:
                        try:
                            source_type = self._get_source_type(item.get('source_slug'))
                            self._multi_source_tracker.track_contribution(
                                property_id=str(property_id),
                                source_slug=item.get('source_slug', 'unknown'),
                                source_type=source_type,
                                item_data=dict(item),
                                source_url=item.get('source_url')
                            )
                            self.sources_tracked += 1
                        except Exception as e:
                            logger.warning(f"Multi-source tracking failed: {e}")
                            # Don't fail the pipeline, just log the error

            self.conn.commit()
        except Exception as e:
            self.conn.rollback()
            logger.error(f"PostgreSQL error: {e}")
            raise
        
        return item
    
    def _get_source_type(self, source_slug: str) -> str:
        """Determine source type tier based on source slug."""
        # Tier mapping for known sources
        source_tiers = {
            # Tier 1 - Government
            'lands-commission': 'tier1_government',
            'gra': 'tier1_government',
            'ama': 'tier1_government',
            # Tier 2 - Financial
            'ecobank': 'tier2_financial',
            'gcb': 'tier2_financial',
            'stanbic': 'tier2_financial',
            'absa': 'tier2_financial',
            'fidelity': 'tier2_financial',
            'zenith': 'tier2_financial',
            # Tier 3 - Partners
            'agency-network': 'tier3_partner',
            'broll': 'tier3_partner',
            'devtraco': 'tier3_partner',
            'kpone-associates': 'tier3_partner',
            # Tier 5 - Web scraped
            'meqasa': 'tier5_web',
            'gpc': 'tier5_web',
            'jiji': 'tier5_web',
            'tonaton': 'tier5_web',
            'housemaster': 'tier5_web',
            'realtor': 'tier5_web',
        }
        return source_tiers.get(source_slug, 'tier5_web')
    
    def _get_evidence_type(self, source_slug: str, item: dict) -> tuple:
        """
        Determine evidence_type and transaction classification based on source tier.
        Returns: (evidence_type, is_transaction_record, transaction_confidence, transaction_source)
        
        RICS/GhIS Compliant Evidence Classification:
        - Tier 1 (Government): Verified transactions from Lands Commission
        - Tier 2 (Financial): Bank valuations and collateral records
        - Tier 3 (Partners): Agent-confirmed transactions
        - Tier 5 (Web): Listings (asking prices only)
        """
        source_tier = self._get_source_type(source_slug)
        
        # Check if we have explicit sold_price data
        has_sold_data = item.get('sold_price') is not None and item.get('sold_at') is not None
        
        if has_sold_data:
            return ('verified_sale', True, 0.95, source_slug)
        
        # Map source tier to evidence classification
        evidence_mapping = {
            'tier1_government': {
                'evidence_type': 'government_record',
                'is_transaction': True,
                'confidence': 0.98,
            },
            'tier2_financial': {
                'evidence_type': 'bank_valuation',
                'is_transaction': True,
                'confidence': 0.90,
            },
            'tier3_partner': {
                'evidence_type': 'partner_transaction',
                'is_transaction': False,  # Set to True when confirmed
                'confidence': 0.78,
            },
            'tier5_web': {
                'evidence_type': 'listing',
                'is_transaction': False,
                'confidence': 0.65,
            },
        }
        
        mapping = evidence_mapping.get(source_tier, evidence_mapping['tier5_web'])
        
        return (
            mapping['evidence_type'],
            mapping['is_transaction'],
            mapping['confidence'],
            source_slug
        )
    
    def _insert_property(self, cursor, item):
        """Insert new property record matching the actual database schema."""
        import uuid
        
        # Generate reference number
        ref_number = f"PM-{item.get('source_slug', 'WEB')[:3].upper()}-{str(uuid.uuid4())[:8].upper()}"
        
        # Normalize enum values
        region_enum = self._normalize_region_enum(item.get('region'))
        transaction_type = self._normalize_transaction_type(item.get('listing_type'))
        property_type = self._normalize_property_type(item.get('property_type'))
        
        # Parse price - handle Decimal serialization
        price = item.get('price')
        if price is not None:
            try:
                price = float(price)
            except (ValueError, TypeError):
                price = None
        
        # Get source tier and data_source value
        source_slug = item.get('source_slug', 'web')
        source_tier = self._get_source_type(source_slug)
        
        # Get evidence classification based on source tier
        evidence_type, is_transaction, transaction_confidence, transaction_source = \
            self._get_evidence_type(source_slug, item)
        
        # Calculate transaction_value for tier 1/2 sources
        transaction_value = None
        if is_transaction:
            # For government/bank sources, price IS the transaction value
            transaction_value = price
        
        cursor.execute("""
            INSERT INTO properties (
                reference_number,
                region,
                address_street,
                address_city,
                property_type,
                transaction_type,
                title,
                description,
                bedrooms,
                bathrooms,
                total_area_sqm,
                land_area_sqm,
                built_area_sqm,
                price,
                price_currency,
                status,
                data_source,
                completeness_score,
                primary_image_url,
                image_urls,
                amenities,
                latitude,
                longitude,
                external_id,
                external_source,
                metadata,
                created_at,
                updated_at,
                first_seen_at,
                last_seen_at,
                evidence_type,
                is_transaction_record,
                transaction_value,
                transaction_date,
                transaction_source,
                transaction_confidence
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, NOW(), NOW(),
                NOW(), NOW(), %s, %s, %s, 
                CASE WHEN %s THEN CURRENT_DATE ELSE NULL END,
                %s, %s
            )
            RETURNING id
        """, (
            ref_number,
            region_enum,
            item.get('address') or item.get('address_raw'),
            item.get('city', 'Accra'),
            property_type,
            transaction_type,
            item.get('title'),
            item.get('description'),
            item.get('bedrooms'),
            item.get('bathrooms'),
            item.get('total_area_sqm') or item.get('building_size_sqm'),
            item.get('land_size_sqm'),
            item.get('building_size_sqm'),
            price,
            item.get('currency', 'GHS'),
            'active',  # Default status for scraped listings
            source_tier,  # Use proper tier instead of hardcoded 'tier5_web'
            item.get('data_quality_score') or item.get('completeness_score') or 0.5,
            item.get('images', [None])[0] if item.get('images') else None,
            json.dumps(item.get('images', [])),
            json.dumps(item.get('amenities', [])),
            item.get('latitude'),
            item.get('longitude'),
            item.get('source_id'),
            item.get('source_slug'),
            json.dumps({
                'source_url': item.get('source_url'),
                'agent_name': item.get('agent_name'),
                'agent_phone': item.get('agent_phone'),
                'raw_data': item.get('raw_data', {}),
                'scraped_at': item.get('scraped_at'),
            }),
            evidence_type,
            is_transaction,
            transaction_value,
            is_transaction,  # Used in CASE statement for transaction_date
            transaction_source,
            transaction_confidence,
        ))
        
        # Return the inserted property ID
        result = cursor.fetchone()
        return result['id'] if result else None
    
    def _update_property(self, cursor, property_id: str, region: str, item):
        """Update existing property record and track last_seen_at for delisting detection."""
        
        # Parse price
        price = item.get('price')
        if price is not None:
            try:
                price = float(price)
            except (ValueError, TypeError):
                price = None
        
        # Update property with last_seen_at for delisting tracking
        # Note: The database trigger will also update last_seen_at and handle un-delisting
        cursor.execute("""
            UPDATE properties SET
                title = COALESCE(%s, title),
                description = COALESCE(%s, description),
                price = COALESCE(%s, price),
                price_currency = COALESCE(%s, price_currency),
                address_street = COALESCE(%s, address_street),
                address_city = COALESCE(%s, address_city),
                latitude = COALESCE(%s, latitude),
                longitude = COALESCE(%s, longitude),
                bedrooms = COALESCE(%s, bedrooms),
                bathrooms = COALESCE(%s, bathrooms),
                image_urls = COALESCE(%s, image_urls),
                completeness_score = COALESCE(%s, completeness_score),
                updated_at = NOW(),
                last_seen_at = NOW(),
                -- If property was previously delisted, un-delist it since we see it again
                is_delisted = CASE WHEN is_delisted = TRUE THEN FALSE ELSE is_delisted END,
                delisted_at = CASE WHEN is_delisted = TRUE THEN NULL ELSE delisted_at END,
                evidence_type = CASE WHEN is_delisted = TRUE THEN 'listing' ELSE evidence_type END,
                inferred_sale_price = CASE WHEN is_delisted = TRUE THEN NULL ELSE inferred_sale_price END
            WHERE id = %s AND region = %s
        """, (
            item.get('title'),
            item.get('description'),
            price,
            item.get('currency'),
            item.get('address') or item.get('address_raw'),
            item.get('city'),
            item.get('latitude'),
            item.get('longitude'),
            item.get('bedrooms'),
            item.get('bathrooms'),
            json.dumps(item.get('images', [])) if item.get('images') else None,
            item.get('data_quality_score') or item.get('completeness_score'),
            property_id,
            region,
        ))


# ============================================================================
# OPENSEARCH PIPELINE
# ============================================================================

class OpenSearchPipeline:
    """
    Indexes items in OpenSearch for full-text search.
    Uses OPENSEARCH_URL for connection string consistency with backend.
    """
    
    def __init__(self, client: OpenSearch, index_name: str, request_timeout_s: int = 30):
        self.client = client
        self.index_name = index_name
        self.request_timeout_s = request_timeout_s
        self.items_indexed = 0
        self.bulk_buffer = []
        self.bulk_size = 100
    
    @classmethod
    def from_crawler(cls, crawler):
        opensearch_url = crawler.settings.get('OPENSEARCH_URL', 'https://opensearch.cedynhq.com')
        opensearch_user = crawler.settings.get('OPENSEARCH_USERNAME', '')
        opensearch_pass = crawler.settings.get('OPENSEARCH_PASSWORD', '')
        
        # Parse URL to extract host
        from urllib.parse import urlparse
        parsed = urlparse(opensearch_url)
        use_ssl = parsed.scheme == 'https'
        host = parsed.hostname or 'localhost'
        port = parsed.port or (443 if use_ssl else 9200)
        
        timeout_s = int(crawler.settings.get('OPENSEARCH_TIMEOUT', 30))
        client = OpenSearch(
            hosts=[{'host': host, 'port': port}],
            http_auth=(opensearch_user, opensearch_pass) if opensearch_user else None,
            use_ssl=use_ssl,
            verify_certs=False,
            ssl_show_warn=False,
            timeout=timeout_s,
            max_retries=3,
            retry_on_timeout=True,
        )
        
        index_prefix = crawler.settings.get('OPENSEARCH_INDEX_PREFIX', 'propmetrik_')
        return cls(
            client=client,
            index_name=f"{index_prefix}properties",
            request_timeout_s=timeout_s,
        )
    
    def process_item(self, item, spider):
        """Add item to bulk buffer for indexing."""
        
        doc = {
            '_index': self.index_name,
            '_id': f"{item.get('source_slug')}_{item.get('source_id')}",
            '_source': {
                'source_id': item.get('source_id'),
                'source_slug': item.get('source_slug'),
                'source_url': item.get('source_url'),
                'title': item.get('title'),
                'description': item.get('description'),
                'property_type': item.get('property_type'),
                'listing_type': item.get('listing_type'),
                'price': float(item['price']) if item.get('price') else None,
                'price_usd': item.get('price_usd'),
                'currency': item.get('currency'),
                'address': item.get('address'),
                'city': item.get('city'),
                'region': item.get('region'),
                'neighborhood': item.get('neighborhood'),
                'country': item.get('country', 'Ghana'),
                'bedrooms': item.get('bedrooms'),
                'bathrooms': item.get('bathrooms'),
                'land_size_sqm': float(item['land_size_sqm']) if item.get('land_size_sqm') else None,
                'building_size_sqm': float(item['building_size_sqm']) if item.get('building_size_sqm') else None,
                'amenities': item.get('amenities', []),
                'images': item.get('images', [])[:5],  # Store only first 5 images
                'image_count': item.get('image_count', 0),
                'agent_name': item.get('agent_name'),
                'data_quality_score': item.get('data_quality_score'),
                'scraped_at': item.get('scraped_at'),
                'indexed_at': datetime.utcnow().isoformat(),
            }
        }
        
        # Add location if available
        if item.get('latitude') and item.get('longitude'):
            doc['_source']['location'] = {
                'lat': float(item['latitude']),
                'lon': float(item['longitude'])
            }
        
        self.bulk_buffer.append(doc)
        
        # Flush buffer when full
        if len(self.bulk_buffer) >= self.bulk_size:
            self._flush_bulk()
        
        return item
    
    def _flush_bulk(self):
        """Flush bulk buffer to OpenSearch."""
        if not self.bulk_buffer:
            return
        
        try:
            success, failed = helpers.bulk(
                self.client,
                self.bulk_buffer,
                raise_on_error=False,
                request_timeout=self.request_timeout_s,
            )
            self.items_indexed += success
            if failed:
                logger.warning(f"Failed to index {len(failed)} documents")
            
        except Exception as e:
            logger.error(f"OpenSearch bulk indexing error: {e}")
        
        self.bulk_buffer = []
    
    def close_spider(self, spider):
        """Flush remaining items and close."""
        self._flush_bulk()
        logger.info(f"OpenSearch: {self.items_indexed} items indexed")
