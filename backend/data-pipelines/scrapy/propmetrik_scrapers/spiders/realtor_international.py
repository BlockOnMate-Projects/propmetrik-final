# -*- coding: utf-8 -*-
"""
Propmetrik Scrapers - Realtor.com International Ghana Spider

Spider for scraping property listings from realtor.com/international/gh
Luxury and international property listings.
"""
import re
import json
import logging
from typing import Generator, Optional, Dict, Any, List
from datetime import datetime
from urllib.parse import urljoin, urlparse, urlencode

import scrapy
from scrapy import Request
from scrapy.http import Response

from propmetrik_scrapers.spiders.base import BasePropertySpider
from propmetrik_scrapers.items import PropertyItem

logger = logging.getLogger(__name__)


class RealtorInternationalSpider(BasePropertySpider):
    """
    Spider for Realtor.com International Ghana
    (https://www.realtor.com/international/gh/)
    
    Features:
    - Luxury and international property listings
    - Expatriate-focused property advertisements
    - High-end residential and commercial properties
    - Multi-currency pricing (USD, GHS)
    - International buyer interest patterns
    
    Usage:
        scrapy crawl realtor_international
        scrapy crawl realtor_international -a listing_type=sale
        scrapy crawl realtor_international -a listing_type=rent
        scrapy crawl realtor_international -a max_pages=10
        scrapy crawl realtor_international -a region=greater-accra
    """
    
    name = 'realtor_international'
    source_name = 'Realtor.com International Ghana'
    source_slug = 'realtor_international'
    trust_score = 0.80  # High trust - major international platform
    
    allowed_domains = ['realtor.com', 'www.realtor.com']
    
    # Base URLs
    BASE_URL = 'https://www.realtor.com'
    GHANA_URL = 'https://www.realtor.com/international/gh/'
    SALE_URL = 'https://www.realtor.com/international/gh/for-sale/'
    RENT_URL = 'https://www.realtor.com/international/gh/for-rent/'
    
    # Region-specific URLs
    REGION_URLS = {
        'greater-accra': 'https://www.realtor.com/international/gh/greater-accra/',
        'ashanti': 'https://www.realtor.com/international/gh/ashanti/',
        'western': 'https://www.realtor.com/international/gh/western/',
        'eastern': 'https://www.realtor.com/international/gh/eastern/',
        'central': 'https://www.realtor.com/international/gh/central/',
        'volta': 'https://www.realtor.com/international/gh/volta/',
        'northern': 'https://www.realtor.com/international/gh/northern/',
    }
    
    custom_settings = {
        'DOWNLOAD_DELAY': 3,
        'CONCURRENT_REQUESTS_PER_DOMAIN': 2,
        'RANDOMIZE_DOWNLOAD_DELAY': 0.5,
        'ROBOTSTXT_OBEY': True,
        'USER_AGENT': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        # Handle JavaScript-rendered content
        'DOWNLOADER_MIDDLEWARES': {
            'scrapy.downloadermiddlewares.useragent.UserAgentMiddleware': None,
        },
    }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.region = kwargs.get('region', None)
    
    def start_requests(self) -> Generator[Request, None, None]:
        """Generate initial requests based on filters."""
        
        # If specific region requested
        if self.region and self.region in self.REGION_URLS:
            base_url = self.REGION_URLS[self.region]
            urls = [base_url]
            if self.listing_type_filter:
                urls = [f"{base_url}{self.listing_type_filter}/"]
        elif self.listing_type_filter == 'sale':
            urls = [self.SALE_URL]
        elif self.listing_type_filter == 'rent':
            urls = [self.RENT_URL]
        else:
            # Default: scrape main Ghana page
            urls = [self.GHANA_URL]
        
        for url in urls:
            listing_type = 'rent' if 'for-rent' in url else 'sale'
            yield Request(
                url=url,
                callback=self.parse_listing,
                meta={
                    'listing_type': listing_type,
                    'page': 1
                },
                errback=self.handle_error
            )
    
    def parse_listing(self, response: Response) -> Generator:
        """Parse listing page and extract property URLs."""
        self.pages_scraped += 1
        listing_type = response.meta.get('listing_type', 'sale')
        current_page = response.meta.get('page', 1)
        
        logger.info(f"Parsing Realtor.com International {listing_type} listings - Page {current_page}")
        
        # Try to extract data from JSON-LD
        json_ld_data = self._extract_json_ld(response)
        if json_ld_data:
            properties = self._parse_json_ld_listings(json_ld_data, listing_type)
            for prop in properties:
                yield prop
        
        # Extract property links from HTML
        property_links = self._extract_property_links(response)
        
        logger.info(f"Found {len(property_links)} property links on page {current_page}")
        
        for link in property_links:
            full_url = urljoin(self.BASE_URL, link)
            yield Request(
                url=full_url,
                callback=self.parse_property,
                meta={'listing_type': listing_type},
                errback=self.handle_error
            )
        
        # Check max pages limit
        if self.max_pages and current_page >= int(self.max_pages):
            logger.info(f"Reached max pages limit ({self.max_pages})")
            return
        
        # Find next page
        next_page = self._find_next_page(response, current_page)
        if next_page:
            yield Request(
                url=next_page,
                callback=self.parse_listing,
                meta={
                    'listing_type': listing_type,
                    'page': current_page + 1
                },
                errback=self.handle_error
            )
    
    def parse_property(self, response: Response) -> Generator[PropertyItem, None, None]:
        """Parse individual property page and yield PropertyItem."""
        self.items_scraped += 1
        listing_type = response.meta.get('listing_type', 'sale')
        
        logger.debug(f"Parsing property: {response.url}")
        
        # Try JSON-LD first for structured data
        json_ld = self._extract_json_ld(response)
        
        loader = self.create_item_loader(response)
        
        # Source ID (external identifier from this source)
        source_id = self._extract_external_id(response.url)
        loader.add_value('source_id', source_id)
        
        # Title
        title = self._extract_title(response, json_ld)
        loader.add_value('title', title)
        
        # Price
        price, currency = self._extract_price(response, json_ld)
        loader.add_value('price', price)
        loader.add_value('currency', currency)
        
        # Property Type
        property_type = self._extract_property_type(response, json_ld)
        loader.add_value('property_type', property_type)
        
        # Listing Type
        loader.add_value('listing_type', listing_type)
        
        # Location
        location_data = self._extract_location(response, json_ld)
        loader.add_value('address', location_data.get('address'))
        loader.add_value('neighborhood', location_data.get('neighborhood'))
        loader.add_value('district', location_data.get('district'))
        loader.add_value('region', location_data.get('region'))
        
        # Coordinates
        coords = self._extract_coordinates(response, json_ld)
        if coords:
            loader.add_value('latitude', coords.get('lat'))
            loader.add_value('longitude', coords.get('lng'))
        
        # Specifications
        specs = self._extract_specifications(response)
        loader.add_value('bedrooms', specs.get('bedrooms'))
        loader.add_value('bathrooms', specs.get('bathrooms'))
        loader.add_value('land_size_sqm', specs.get('land_size_sqm'))
        loader.add_value('building_size_sqm', specs.get('building_size_sqm'))
        
        # Amenities/Features
        amenities = self._extract_amenities(response)
        loader.add_value('amenities', amenities)
        
        # Description
        description = self._extract_description(response, json_ld)
        loader.add_value('description', description)
        
        # Images
        images = self._extract_images(response, json_ld)
        loader.add_value('images', images)
        
        # Agent Information - use individual fields
        agent_info = self._extract_agent_info(response)
        if agent_info:
            loader.add_value('agent_name', agent_info.get('name'))
            loader.add_value('agent_company', agent_info.get('company'))
            loader.add_value('agent_phone', agent_info.get('phone'))
            loader.add_value('agent_email', agent_info.get('email'))
        
        # Scraped timestamp
        loader.add_value('scraped_at', datetime.utcnow().isoformat())
        
        yield loader.load_item()
    
    # ========================================================================
    # EXTRACTION HELPER METHODS
    # ========================================================================
    
    def _extract_json_ld(self, response: Response) -> Optional[Dict]:
        """Extract JSON-LD structured data from page."""
        scripts = response.css('script[type="application/ld+json"]::text').getall()
        for script in scripts:
            try:
                data = json.loads(script)
                # Look for RealEstateListing or similar
                if isinstance(data, dict):
                    if data.get('@type') in ['RealEstateListing', 'Place', 'Product', 'Residence']:
                        return data
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and item.get('@type') in ['RealEstateListing', 'Place', 'Product', 'Residence']:
                            return item
            except json.JSONDecodeError:
                continue
        return None
    
    def _extract_property_links(self, response: Response) -> List[str]:
        """Extract property detail page links."""
        # Realtor.com international property URLs end with a long numeric ID like -310104262611
        # Get all links to Ghana listings
        all_links = response.css('a[href*="/international/gh/"]::attr(href)').getall()
        
        # Filter to only property detail pages (those with numeric IDs at the end)
        property_links = []
        for link in set(all_links):
            # Match URLs like /international/gh/east-legon-accra-greater-accra-region-310104262611/
            # The property ID is typically 9+ digits at the end
            if re.search(r'-\d{9,}/?$', link):
                # Make absolute URL if needed
                if link.startswith('/'):
                    link = response.urljoin(link)
                property_links.append(link)
        
        return list(set(property_links))
    
    def _find_next_page(self, response: Response, current_page: int) -> Optional[str]:
        """Find next page URL."""
        # Multiple pagination strategies
        next_page = response.css('.pagination .next a::attr(href)').get()
        if not next_page:
            next_page = response.css('a[rel="next"]::attr(href)').get()
        if not next_page:
            next_page = response.css('a.next-page::attr(href)').get()
        if not next_page:
            next_page = response.css(f'a[href*="page={current_page + 1}"]::attr(href)').get()
        if not next_page:
            next_page = response.css(f'a[href*="pg-{current_page + 1}"]::attr(href)').get()
        
        if next_page:
            return urljoin(self.BASE_URL, next_page)
        return None
    
    def _extract_external_id(self, url: str) -> str:
        """Extract property ID from URL."""
        # Try different URL patterns
        patterns = [
            r'/property/(\d+)',
            r'/details/(\d+)',
            r'-(\d+)/?$',
            r'/(\d+)/?$',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return f"realtor_{match.group(1)}"
        
        # Fallback: hash the URL
        import hashlib
        return f"realtor_{hashlib.md5(url.encode()).hexdigest()[:12]}"
    
    def _extract_title(self, response: Response, json_ld: Optional[Dict]) -> Optional[str]:
        """Extract property title."""
        if json_ld and json_ld.get('name'):
            return json_ld['name']
        
        selectors = [
            'h1.property-title::text',
            'h1[data-testid="property-title"]::text',
            'h1::text',
            '.property-address::text',
            '[class*="title"]::text',
        ]
        
        for selector in selectors:
            title = response.css(selector).get()
            if title and title.strip():
                return title.strip()
        
        return None
    
    def _extract_price(self, response: Response, json_ld: Optional[Dict]) -> tuple:
        """Extract price and currency."""
        # From JSON-LD
        if json_ld:
            offers = json_ld.get('offers', {})
            if isinstance(offers, dict):
                price = offers.get('price')
                currency = offers.get('priceCurrency', 'USD')
                if price:
                    return float(price), currency
        
        # From HTML
        selectors = [
            '.price::text',
            '.property-price::text',
            '[data-testid="property-price"]::text',
            '[class*="price"]::text',
        ]
        
        for selector in selectors:
            price_text = response.css(selector).get()
            if price_text:
                return self._parse_price_text(price_text)
        
        return None, 'USD'
    
    def _parse_price_text(self, price_text: str) -> tuple:
        """Parse price text and return (amount, currency)."""
        if not price_text:
            return None, 'USD'
        
        price_text = price_text.strip().upper()
        
        # Determine currency
        currency = 'USD'  # Default for international listings
        if 'GH' in price_text or '₵' in price_text or 'CEDI' in price_text:
            currency = 'GHS'
        elif '€' in price_text or 'EUR' in price_text:
            currency = 'EUR'
        elif '£' in price_text or 'GBP' in price_text:
            currency = 'GBP'
        
        # Extract numeric value
        price_clean = re.sub(r'[^\d.]', '', price_text)
        if price_clean:
            try:
                return float(price_clean), currency
            except ValueError:
                pass
        
        return None, currency
    
    def _extract_property_type(self, response: Response, json_ld: Optional[Dict]) -> str:
        """Extract and normalize property type."""
        prop_type = None
        
        if json_ld:
            prop_type = json_ld.get('propertyType') or json_ld.get('@type')
        
        if not prop_type:
            selectors = [
                '.property-type::text',
                '[data-testid="property-type"]::text',
                '[class*="type"]::text',
            ]
            for selector in selectors:
                prop_type = response.css(selector).get()
                if prop_type:
                    break
        
        return self._normalize_property_type(prop_type)
    
    def _normalize_property_type(self, prop_type: Optional[str]) -> str:
        """Normalize property type to standard values."""
        if not prop_type:
            return 'unknown'
        
        prop_type = prop_type.lower().strip()
        
        type_mapping = {
            'house': 'house',
            'home': 'house',
            'single family': 'house',
            'single-family': 'house',
            'detached': 'house',
            'villa': 'villa',
            'mansion': 'villa',
            'estate': 'villa',
            'apartment': 'apartment',
            'flat': 'apartment',
            'condo': 'apartment',
            'condominium': 'apartment',
            'studio': 'studio',
            'townhouse': 'townhouse',
            'townhome': 'townhouse',
            'terrace': 'townhouse',
            'duplex': 'duplex',
            'penthouse': 'penthouse',
            'land': 'land',
            'lot': 'land',
            'plot': 'land',
            'commercial': 'commercial',
            'office': 'office',
            'retail': 'commercial',
            'industrial': 'industrial',
            'warehouse': 'warehouse',
        }
        
        for key, value in type_mapping.items():
            if key in prop_type:
                return value
        
        return 'other'
    
    def _extract_location(self, response: Response, json_ld: Optional[Dict]) -> Dict[str, str]:
        """Extract location components."""
        location = {
            'address': None,
            'neighborhood': None,
            'district': None,
            'region': None,
            'city': None,
        }
        
        # From JSON-LD
        if json_ld:
            address_data = json_ld.get('address', {})
            if isinstance(address_data, dict):
                location['address'] = address_data.get('streetAddress')
                location['city'] = address_data.get('addressLocality')
                location['region'] = address_data.get('addressRegion')
        
        # From HTML
        address_selectors = [
            '.property-address::text',
            '.address::text',
            '[data-testid="address"]::text',
            '.location::text',
        ]
        
        for selector in address_selectors:
            addr = response.css(selector).get()
            if addr and not location['address']:
                location['address'] = addr.strip()
                break
        
        # Extract region from URL if not found
        if not location['region']:
            url = response.url
            for region_key in self.REGION_URLS.keys():
                if region_key in url:
                    location['region'] = region_key.replace('-', ' ').title()
                    break
        
        return location
    
    def _extract_coordinates(self, response: Response, json_ld: Optional[Dict]) -> Optional[Dict]:
        """Extract coordinates."""
        # From JSON-LD
        if json_ld:
            geo = json_ld.get('geo', {})
            if isinstance(geo, dict):
                lat = geo.get('latitude')
                lng = geo.get('longitude')
                if lat and lng:
                    return {'lat': float(lat), 'lng': float(lng)}
        
        # From HTML data attributes
        map_element = response.css('[data-lat][data-lng]')
        if map_element:
            lat = map_element.attrib.get('data-lat')
            lng = map_element.attrib.get('data-lng')
            if lat and lng:
                return {'lat': float(lat), 'lng': float(lng)}
        
        # From script tags
        scripts = response.css('script::text').getall()
        for script in scripts:
            lat_match = re.search(r'"latitude":\s*([-\d.]+)', script)
            lng_match = re.search(r'"longitude":\s*([-\d.]+)', script)
            if lat_match and lng_match:
                return {'lat': float(lat_match.group(1)), 'lng': float(lng_match.group(1))}
        
        return None
    
    def _extract_specifications(self, response: Response) -> Dict:
        """Extract property specifications."""
        specs = {
            'bedrooms': None,
            'bathrooms': None,
            'land_size_sqm': None,
            'building_size_sqm': None,
        }
        
        # Try to get title and description for parsing
        title = response.css('title::text').get() or ""
        description_selectors = [
            '.property-description::text',
            '.description::text',
            '[data-testid="description"]::text',
            'meta[name="description"]::attr(content)',
            'meta[property="og:description"]::attr(content)',
        ]
        
        description = ""
        for selector in description_selectors:
            desc_parts = response.css(selector).getall()
            if desc_parts:
                description = " ".join(desc_parts).strip()
                break
        
        # Combine title and description for pattern matching
        text_to_search = f"{title} {description}".lower()
        
        # Extract bedrooms from description first, then try selectors
        if not specs['bedrooms']:
            specs['bedrooms'] = self._extract_bedrooms_from_text(text_to_search)
        
        # Try CSS selectors for bedrooms if not found in text
        if not specs['bedrooms']:
            bed_selectors = [
                '.bedrooms::text', '[data-testid="beds"]::text',
                '[class*="bed"]::text', '.beds::text',
            ]
            for selector in bed_selectors:
                val = response.css(selector).get()
                if val:
                    num = self._extract_number(val)
                    if num:
                        specs['bedrooms'] = num
                        break
        
        # Extract bathrooms from description first, then try selectors
        if not specs['bathrooms']:
            specs['bathrooms'] = self._extract_bathrooms_from_text(text_to_search)
        
        # Try CSS selectors for bathrooms if not found in text
        if not specs['bathrooms']:
            bath_selectors = [
                '.bathrooms::text', '[data-testid="baths"]::text',
                '[class*="bath"]::text', '.baths::text',
            ]
            for selector in bath_selectors:
                val = response.css(selector).get()
                if val:
                    num = self._extract_number(val)
                    if num:
                        specs['bathrooms'] = num
                        break
        
        # Extract area from description first, then try selectors
        if not specs['building_size_sqm']:
            specs['building_size_sqm'] = self._extract_area_from_text(text_to_search)
        
        # Try CSS selectors for area if not found in text
        if not specs['building_size_sqm']:
            area_selectors = [
                '.area::text', '.sqft::text', '.size::text',
                '[data-testid="sqft"]::text', '[class*="area"]::text',
            ]
            for selector in area_selectors:
                val = response.css(selector).get()
                if val:
                    area = self._parse_area(val)
                    if area:
                        specs['building_size_sqm'] = area
                        break
        
        # Lot size
        lot_selectors = [
            '.lot-size::text', '.land-size::text',
            '[data-testid="lot"]::text',
        ]
        for selector in lot_selectors:
            val = response.css(selector).get()
            if val:
                area = self._parse_area(val)
                if area:
                    specs['land_size_sqm'] = area
                    break
        
        return specs
    
    def _extract_amenities(self, response: Response) -> List[str]:
        """Extract amenities/features."""
        selectors = [
            '.amenities li::text',
            '.features li::text',
            '[class*="amenities"] li::text',
            '[class*="features"] li::text',
            '.property-features li::text',
        ]
        
        amenities = []
        for selector in selectors:
            found = response.css(selector).getall()
            amenities.extend([a.strip() for a in found if a.strip()])
        
        return list(set(amenities))
    
    def _extract_description(self, response: Response, json_ld: Optional[Dict]) -> Optional[str]:
        """Extract property description."""
        if json_ld and json_ld.get('description'):
            return json_ld['description']
        
        selectors = [
            '.property-description::text',
            '.description p::text',
            '[data-testid="description"]::text',
            '[class*="description"]::text',
        ]
        
        for selector in selectors:
            parts = response.css(selector).getall()
            if parts:
                return ' '.join([p.strip() for p in parts if p.strip()])
        
        return None
    
    def _extract_images(self, response: Response, json_ld: Optional[Dict]) -> List[str]:
        """Extract property images."""
        images = []
        
        # From JSON-LD
        if json_ld:
            img = json_ld.get('image')
            if isinstance(img, str):
                images.append(img)
            elif isinstance(img, list):
                images.extend(img)
        
        # From HTML
        selectors = [
            '.property-gallery img::attr(src)',
            '.gallery img::attr(src)',
            '[class*="gallery"] img::attr(src)',
            '.property-images img::attr(src)',
            '[data-testid="property-photo"] img::attr(src)',
        ]
        
        for selector in selectors:
            found = response.css(selector).getall()
            images.extend(found)
        
        # Ensure absolute URLs
        images = [urljoin(self.BASE_URL, img) for img in images if img]
        
        return list(set(images))
    
    def _extract_agent_info(self, response: Response) -> Dict:
        """Extract agent/listing information."""
        agent_info = {}
        
        selectors_map = {
            'name': ['.agent-name::text', '.listing-agent::text', '[class*="agent-name"]::text'],
            'company': ['.agent-company::text', '.brokerage::text', '[class*="company"]::text'],
            'phone': ['.agent-phone::text', '.contact-phone::text', 'a[href^="tel:"]::text'],
            'email': ['.agent-email::text', 'a[href^="mailto:"]::text'],
        }
        
        for field, selectors in selectors_map.items():
            for selector in selectors:
                val = response.css(selector).get()
                if val and val.strip():
                    agent_info[field] = val.strip()
                    break
        
        return agent_info if agent_info else None
    
    def _extract_metadata(self, response: Response) -> Dict:
        """Extract listing metadata."""
        metadata = {}
        
        # Listed date
        date_selectors = ['.listed-date::text', '.date-listed::text', '[class*="listed"]::text']
        for selector in date_selectors:
            val = response.css(selector).get()
            if val:
                metadata['listed_date'] = val.strip()
                break
        
        # Views
        view_selectors = ['.views::text', '.view-count::text', '[class*="views"]::text']
        for selector in view_selectors:
            val = response.css(selector).get()
            if val:
                num = self._extract_number(val)
                if num:
                    metadata['views'] = num
                    break
        
        return metadata if metadata else None
    
    def _parse_json_ld_listings(self, json_ld: Dict, listing_type: str) -> List[PropertyItem]:
        """Parse multiple listings from JSON-LD data."""
        items = []
        
        # Handle ItemList format
        if json_ld.get('@type') == 'ItemList':
            list_items = json_ld.get('itemListElement', [])
            for item in list_items:
                prop_data = item.get('item', item)
                property_item = self._json_ld_to_item(prop_data, listing_type)
                if property_item:
                    items.append(property_item)
        
        return items
    
    def _json_ld_to_item(self, data: Dict, listing_type: str) -> Optional[PropertyItem]:
        """Convert JSON-LD data to PropertyItem."""
        if not data:
            return None
        
        item = PropertyItem()
        item['source_name'] = self.source_name
        item['source_slug'] = self.source_slug
        item['source_url'] = data.get('url', '')
        item['source_id'] = self._extract_external_id(data.get('url', ''))
        item['title'] = data.get('name')
        item['description'] = data.get('description')
        item['listing_type'] = listing_type
        item['scraped_at'] = datetime.utcnow().isoformat()
        
        # Price
        offers = data.get('offers', {})
        if isinstance(offers, dict):
            item['price'] = offers.get('price')
            item['currency'] = offers.get('priceCurrency', 'USD')
        
        # Address
        address = data.get('address', {})
        if isinstance(address, dict):
            item['address'] = address.get('streetAddress')
            item['region'] = address.get('addressRegion')
        
        # Coordinates
        geo = data.get('geo', {})
        if isinstance(geo, dict):
            item['latitude'] = geo.get('latitude')
            item['longitude'] = geo.get('longitude')
        
        # Images
        img = data.get('image')
        if img:
            item['images'] = [img] if isinstance(img, str) else img
        
        return item
    
    # ========================================================================
    # UTILITY METHODS
    # ========================================================================
    
    def _extract_number(self, text: str) -> Optional[int]:
        """Extract first number from text."""
        if not text:
            return None
        match = re.search(r'\d+', text)
        return int(match.group()) if match else None
    
    def _extract_bedrooms_from_text(self, text: str) -> Optional[int]:
        """Extract bedroom count from description text."""
        if not text:
            return None
            
        text = text.lower()
        
        # Handle special cases first
        if 'studio' in text:
            return 0
        
        # Pattern: "X bedroom(s)" or "X bed"
        bedroom_patterns = [
            r'(\d+)[-\s]*bedroom[s]?',
            r'(\d+)[-\s]*bed[s]?\b(?![a-z])',  # prevent matching "bedside", "bedrock"
            r'(\d+)[^\w]*bed[s]?[^\w]*(?:house|apartment|home)',
        ]
        
        for pattern in bedroom_patterns:
            matches = re.findall(pattern, text)
            if matches:
                try:
                    return int(matches[0])
                except (ValueError, TypeError):
                    continue
        
        return None
    
    def _extract_bathrooms_from_text(self, text: str) -> Optional[int]:
        """Extract bathroom count from description text."""
        if not text:
            return None
            
        text = text.lower()
        
        # Pattern: "X bathroom(s)", "X bath", "X.5 bath"
        bathroom_patterns = [
            r'(\d+(?:\.\d+)?)[-\s]*bathroom[s]?',
            r'(\d+(?:\.\d+)?)[-\s]*bath[s]?\b(?![a-z])',  # prevent matching "bathrobe"
            r'(\d+(?:\.\d+)?)[^\w]*bath[s]?[^\w]*(?:house|apartment|home)',
        ]
        
        for pattern in bathroom_patterns:
            matches = re.findall(pattern, text)
            if matches:
                try:
                    # Convert to int (round down for half baths like 4.5 -> 4)
                    return int(float(matches[0]))
                except (ValueError, TypeError):
                    continue
        
        return None
    
    def _extract_area_from_text(self, text: str) -> Optional[float]:
        """Extract area in square meters from description text."""
        if not text:
            return None
            
        # Pattern for area with units (sq ft, sqft, sq m, sqm, m²)
        area_patterns = [
            r'([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|square\s*feet)',  # Square feet
            r'([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*m|sqm|square\s*meters?)',  # Square meters
            r'([\d,]+(?:\.\d+)?)\s*m²',  # Square meters with symbol
            r'([\d,]+(?:\.\d+)?)\s*(?:acres?)',  # Acres
        ]
        
        for pattern in area_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                try:
                    # Remove commas and convert to float
                    area_value = float(matches[0].replace(',', ''))
                    
                    # Convert to square meters if needed
                    if 'sq ft' in pattern or 'sqft' in pattern or 'square feet' in pattern:
                        # Convert sq ft to sq m (1 sq ft = 0.092903 sq m)
                        area_value *= 0.092903
                    elif 'acres' in pattern:
                        # Convert acres to sq m (1 acre = 4046.86 sq m)
                        area_value *= 4046.86
                    
                    return area_value
                except (ValueError, TypeError):
                    continue
        
        return None
    
    def _parse_area(self, area_text: str) -> Optional[float]:
        """Parse area text and return value in sqm."""
        if not area_text:
            return None
        
        area_text = area_text.lower()
        
        # Extract numeric value
        match = re.search(r'[\d,.]+', area_text)
        if not match:
            return None
        
        value = float(match.group().replace(',', ''))
        
        # Convert to sqm
        if 'acre' in area_text:
            value *= 4046.86
        elif 'hectare' in area_text or 'ha' in area_text:
            value *= 10000
        elif 'sqft' in area_text or 'sq ft' in area_text or 'sq.ft' in area_text or 'ft²' in area_text:
            value *= 0.092903
        # Already in sqm or m²
        
        return round(value, 2)
    
    def handle_error(self, failure):
        """Handle request errors."""
        self.errors_count += 1
        logger.error(f"Request failed: {failure.request.url} - {failure.value}")
