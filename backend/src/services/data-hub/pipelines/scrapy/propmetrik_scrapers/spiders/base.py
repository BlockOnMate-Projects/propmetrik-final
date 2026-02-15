# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - Base Spider

Abstract base class for all property spiders with common functionality.
"""
import logging
from abc import abstractmethod
from datetime import datetime
from typing import Optional, Generator, Dict, Any, List
from urllib.parse import urljoin, urlparse

import scrapy
from scrapy import Request
from scrapy.http import Response
from itemloaders import ItemLoader

from propmetrik_scrapers.items import PropertyItem

logger = logging.getLogger(__name__)


class BasePropertySpider(scrapy.Spider):
    """
    Base spider class with common functionality for all property spiders.
    
    Subclasses must implement:
    - start_requests(): Generate initial requests
    - parse_listing(): Parse listing page and extract property URLs
    - parse_property(): Parse individual property page and yield PropertyItem
    """
    
    # Spider configuration (override in subclasses)
    source_name: str = "Unknown"
    source_slug: str = "unknown"
    trust_score: float = 0.5
    
    # Default settings
    custom_settings = {
        'DOWNLOAD_DELAY': 2,
        'CONCURRENT_REQUESTS_PER_DOMAIN': 4,
    }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.items_scraped = 0
        self.pages_scraped = 0
        self.errors_count = 0
        self.start_time = datetime.utcnow()
        
        # Optional parameters from command line
        self.max_pages = kwargs.get('max_pages', None)
        self.start_page = kwargs.get('start_page', 1)
        self.listing_type_filter = kwargs.get('listing_type', None)  # 'sale' or 'rent'
        self.property_type_filter = kwargs.get('property_type', None)
        self.region_filter = kwargs.get('region', None)
    
    # ========================================================================
    # ABSTRACT METHODS (must be implemented by subclasses)
    # ========================================================================
    
    @abstractmethod
    def start_requests(self) -> Generator[Request, None, None]:
        """
        Generate initial requests to start crawling.
        Must be implemented by each spider.
        """
        pass
    
    @abstractmethod
    def parse_listing(self, response: Response) -> Generator:
        """
        Parse a listing page and yield:
        - Request objects for individual property pages
        - Request object for next page (if exists)
        
        Must be implemented by each spider.
        """
        pass
    
    @abstractmethod
    def parse_property(self, response: Response) -> Generator[PropertyItem, None, None]:
        """
        Parse an individual property page and yield PropertyItem.
        Must be implemented by each spider.
        """
        pass
    
    # ========================================================================
    # COMMON HELPER METHODS
    # ========================================================================
    
    def create_item_loader(self, response: Response) -> ItemLoader:
        """Create a pre-configured ItemLoader with source metadata."""
        # itemloaders 1.1+ requires selector parameter for add_css/add_xpath to work
        loader = ItemLoader(item=PropertyItem(), selector=response.selector)
        
        # Add source metadata
        loader.add_value('source_name', self.source_name)
        loader.add_value('source_slug', self.source_slug)
        loader.add_value('source_url', response.url)
        loader.add_value('scraped_at', datetime.utcnow().isoformat())
        loader.add_value('spider_name', self.name)
        loader.add_value('spider_version', '1.0.0')
        
        return loader
    
    def extract_id_from_url(self, url: str) -> Optional[str]:
        """
        Extract property ID from URL.
        Override in subclass for site-specific extraction.
        """
        # Default: use last path segment
        parsed = urlparse(url)
        path_parts = [p for p in parsed.path.split('/') if p]
        return path_parts[-1] if path_parts else None
    
    def make_absolute_url(self, url: str, response: Response) -> str:
        """Convert relative URL to absolute URL."""
        return urljoin(response.url, url)
    
    def clean_price_text(self, price_text: str) -> tuple:
        """
        Extract price value and currency from price text.
        Returns: (price_string, currency)
        """
        import re
        
        if not price_text:
            return None, 'GHS'
        
        price_text = price_text.strip()
        
        # Detect currency
        currency = 'GHS'
        if '$' in price_text or 'USD' in price_text.upper():
            currency = 'USD'
        elif '€' in price_text or 'EUR' in price_text.upper():
            currency = 'EUR'
        elif '£' in price_text or 'GBP' in price_text.upper():
            currency = 'GBP'
        
        # Extract numeric value
        numbers = re.findall(r'[\d,]+\.?\d*', price_text.replace(',', ''))
        price_value = numbers[0] if numbers else None
        
        return price_value, currency
    
    def extract_bedrooms(self, text: str) -> Optional[int]:
        """Extract bedroom count from text."""
        import re
        
        if not text:
            return None
        
        text_lower = text.lower()
        
        # Match patterns like "3 bed", "3 bedroom", "3br", "3-bed"
        patterns = [
            r'(\d+)\s*(?:bed(?:room)?s?|br)',
            r'(\d+)\s*-?\s*bed',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text_lower)
            if match:
                return int(match.group(1))
        
        return None
    
    def extract_bathrooms(self, text: str) -> Optional[int]:
        """Extract bathroom count from text."""
        import re
        
        if not text:
            return None
        
        text_lower = text.lower()
        
        # Match patterns like "2 bath", "2 bathroom", "2ba"
        patterns = [
            r'(\d+)\s*(?:bath(?:room)?s?|ba)',
            r'(\d+)\s*-?\s*bath',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text_lower)
            if match:
                return int(match.group(1))
        
        return None
    
    def extract_area(self, text: str) -> tuple:
        """
        Extract area/size from text.
        Returns: (value, unit) where unit is 'sqm', 'sqft', 'acres', 'plots'
        """
        import re
        
        if not text:
            return None, None
        
        text_lower = text.lower()
        
        patterns = [
            (r'([\d,]+\.?\d*)\s*(?:sq\.?\s*m|sqm|m²|square\s*met)', 'sqm'),
            (r'([\d,]+\.?\d*)\s*(?:sq\.?\s*ft|sqft|ft²|square\s*f)', 'sqft'),
            (r'([\d,]+\.?\d*)\s*(?:acre|ac)', 'acres'),
            (r'([\d,]+\.?\d*)\s*(?:plot)', 'plots'),
            (r'([\d,]+\.?\d*)\s*(?:hectare|ha)', 'hectares'),
        ]
        
        for pattern, unit in patterns:
            match = re.search(pattern, text_lower)
            if match:
                value = match.group(1).replace(',', '')
                return float(value), unit
        
        return None, None
    
    def normalize_property_type(self, raw_type: str) -> str:
        """Normalize property type to standard values."""
        if not raw_type:
            return 'unknown'
        
        raw_lower = raw_type.lower()
        
        type_mappings = {
            'house': ['house', 'home', 'villa', 'bungalow', 'townhouse', 'detached', 'semi-detached', 'storey'],
            'apartment': ['apartment', 'flat', 'studio', 'penthouse', 'condo', 'self-contained', 'chamber', 'hall'],
            'land': ['land', 'plot', 'plots', 'acre', 'hectare'],
            'commercial': ['commercial', 'office', 'shop', 'warehouse', 'retail', 'store', 'showroom'],
            'industrial': ['industrial', 'factory', 'manufacturing'],
            'hotel': ['hotel', 'guest house', 'guesthouse', 'hostel', 'lodge'],
        }
        
        for standard_type, keywords in type_mappings.items():
            if any(kw in raw_lower for kw in keywords):
                return standard_type
        
        return 'other'
    
    def normalize_listing_type(self, raw_type: str) -> str:
        """Normalize listing type (sale/rent)."""
        if not raw_type:
            return 'sale'
        
        raw_lower = raw_type.lower()
        
        if any(kw in raw_lower for kw in ['rent', 'let', 'lease', 'monthly', 'per month']):
            return 'rent'
        elif any(kw in raw_lower for kw in ['sale', 'sell', 'buy', 'for sale']):
            return 'sale'
        elif any(kw in raw_lower for kw in ['short', 'daily', 'airbnb', 'vacation']):
            return 'short_term'
        
        return 'sale'
    
    def extract_amenities(self, response: Response, selectors: List[str]) -> List[str]:
        """Extract amenities from multiple possible selectors."""
        amenities = set()
        
        for selector in selectors:
            items = response.css(selector).getall()
            for item in items:
                cleaned = item.strip()
                if cleaned and len(cleaned) < 100:  # Reasonable length check
                    amenities.add(cleaned)
        
        return list(amenities)
    
    def extract_images(self, response: Response, selectors: List[str]) -> List[str]:
        """Extract image URLs from multiple possible selectors."""
        images = []
        seen = set()
        
        for selector in selectors:
            urls = response.css(selector).getall()
            for url in urls:
                if url and url not in seen:
                    abs_url = self.make_absolute_url(url, response)
                    # Filter out placeholders and icons
                    if not any(x in abs_url.lower() for x in ['placeholder', 'icon', 'logo', 'avatar', '1x1']):
                        images.append(abs_url)
                        seen.add(url)
        
        return images
    
    def parse_ghana_address(self, address_text: str) -> Dict[str, str]:
        """
        Parse Ghana address into components.
        Returns dict with: neighborhood, city, region
        """
        if not address_text:
            return {}
        
        result = {}
        
        # Common Ghana regions
        regions = [
            'Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central',
            'Northern', 'Volta', 'Upper East', 'Upper West', 'Bono',
            'Bono East', 'Ahafo', 'Western North', 'Oti', 'Savannah', 'North East'
        ]
        
        # Common cities
        cities = [
            'Accra', 'Kumasi', 'Takoradi', 'Tamale', 'Tema', 'Cape Coast',
            'Ho', 'Koforidua', 'Sunyani', 'Bolgatanga', 'Wa'
        ]
        
        address_lower = address_text.lower()
        
        # Extract region
        for region in regions:
            if region.lower() in address_lower:
                result['region'] = region
                break
        
        # Extract city
        for city in cities:
            if city.lower() in address_lower:
                result['city'] = city
                break
        
        # The rest is likely neighborhood
        parts = [p.strip() for p in address_text.split(',')]
        if parts:
            result['neighborhood'] = parts[0]
        
        return result
    
    # ========================================================================
    # SPIDER LIFECYCLE
    # ========================================================================
    
    def closed(self, reason):
        """Called when spider closes."""
        duration = (datetime.utcnow() - self.start_time).total_seconds()
        
        logger.info(
            f"Spider {self.name} closed. "
            f"Reason: {reason}. "
            f"Items: {self.items_scraped}. "
            f"Pages: {self.pages_scraped}. "
            f"Errors: {self.errors_count}. "
            f"Duration: {duration:.0f}s"
        )
    
    def errback_handler(self, failure):
        """Default error handler for requests."""
        self.errors_count += 1
        logger.error(f"Request failed: {failure.request.url}, error: {failure.value}")
