# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - Ghana Property Centre Spider

Spider for scraping property listings from ghanapropertycentre.com
"""
import re
import json
import logging
from typing import Generator, Optional
from datetime import datetime

import scrapy
from scrapy import Request
from scrapy.http import Response

from propmetrik_scrapers.items import PropertyItem
from .base import BasePropertySpider

logger = logging.getLogger(__name__)


class GhanaPropertyCentreSpider(BasePropertySpider):
    """
    Spider for ghanapropertycentre.com - Major Ghana property listing site.
    
    Features:
    - Wide variety of property types
    - Detailed agent information
    - Regional coverage across Ghana
    
    Usage:
        scrapy crawl gpc
        scrapy crawl gpc -a listing_type=rent
        scrapy crawl gpc -a max_pages=20
    """
    
    name = 'gpc'
    source_name = 'Ghana Property Centre'
    source_slug = 'gpc'
    trust_score = 0.65
    
    allowed_domains = ['ghanapropertycentre.com']
    
    BASE_URLS = {
        'sale': 'https://www.ghanapropertycentre.com/for-sale',
        'rent': 'https://www.ghanapropertycentre.com/for-rent',
    }
    
    custom_settings = {
        'DOWNLOAD_DELAY': 3,
        'CONCURRENT_REQUESTS_PER_DOMAIN': 3,
        'ROBOTSTXT_OBEY': True,
    }
    
    def start_requests(self) -> Generator[Request, None, None]:
        """Generate initial requests for listing pages."""
        
        listing_types = ['sale', 'rent']
        if self.listing_type_filter:
            listing_types = [self.listing_type_filter]
        
        for listing_type in listing_types:
            url = self.BASE_URLS.get(listing_type)
            if not url:
                continue
            
            # Add region filter if specified
            if self.region_filter:
                url = f"{url}/{self.region_filter.lower()}"
            
            yield Request(
                url=url,
                callback=self.parse_listing,
                meta={
                    'listing_type': listing_type,
                    'page': 1,
                },
                errback=self.errback_handler
            )
    
    def parse_listing(self, response: Response) -> Generator:
        """Parse listing page and yield property page requests."""
        
        self.pages_scraped += 1
        listing_type = response.meta.get('listing_type', 'sale')
        current_page = response.meta.get('page', 1)
        
        logger.info(f"Parsing GPC {listing_type} page {current_page}: {response.url}")
        
        # GPC HTML structure (verified 2024):
        # Property links are like: /for-sale/houses/detached-duplexes/greater-accra/.../58774-title
        # They contain a numeric ID at the start of the last path segment
        
        # Get all property links that match GPC's URL pattern
        all_links = response.css('a::attr(href)').getall()
        property_links = []
        
        for link in all_links:
            # GPC property URLs have format: /for-sale/.../58774-title or /for-rent/.../58774-title
            if link and ('for-sale' in link or 'for-rent' in link):
                # Check if it's a property detail page (has numeric ID in last segment)
                parts = link.rstrip('/').split('/')
                if len(parts) > 4:  # Has enough segments to be a property detail page
                    last_part = parts[-1]
                    # Property pages have format like "58774-4-bedroom-..."
                    if last_part and last_part[0].isdigit():
                        property_links.append(link)
        
        # Deduplicate while preserving order
        seen = set()
        unique_links = []
        for link in property_links:
            if link not in seen:
                seen.add(link)
                unique_links.append(link)
        property_links = unique_links
        
        logger.info(f"Found {len(property_links)} properties on page {current_page}")
        
        for link in property_links:
            property_url = self.make_absolute_url(link, response)
            
            yield Request(
                url=property_url,
                callback=self.parse_property,
                meta={'listing_type': listing_type},
                errback=self.errback_handler
            )
        
        # Pagination - GPC uses ?page=N format
        max_pages = int(self.max_pages) if self.max_pages else 50
        
        if current_page < max_pages and len(property_links) > 0:
            # Look for "Next" link
            next_page_link = response.css('a:contains("Next")::attr(href), a[rel="next"]::attr(href)').get()
            
            if next_page_link:
                yield Request(
                    url=self.make_absolute_url(next_page_link, response),
                    callback=self.parse_listing,
                    meta={
                        'listing_type': listing_type,
                        'page': current_page + 1,
                    },
                    errback=self.errback_handler
                )
            else:
                # Construct next page URL manually
                base_url = response.url.split('?')[0]
                next_url = f"{base_url}?page={current_page + 1}"
                
                yield Request(
                    url=next_url,
                    callback=self.parse_listing,
                    meta={
                        'listing_type': listing_type,
                        'page': current_page + 1,
                    },
                    errback=self.errback_handler
                )
    
    def parse_property(self, response: Response) -> Generator[PropertyItem, None, None]:
        """Parse individual property page using actual GPC HTML structure."""
        
        self.items_scraped += 1
        listing_type = response.meta.get('listing_type', 'sale')
        
        loader = self.create_item_loader(response)
        
        # Property ID from URL
        property_id = self.extract_gpc_id(response.url)
        loader.add_value('source_id', property_id)
        
        # Title - GPC uses simple h1
        title = response.css('h1::text').get()
        loader.add_value('title', title)
        
        # Description - uses itemprop="description"
        description = response.css('[itemprop="description"]::text').get()
        if description:
            loader.add_value('description', description.strip())
        
        # Price - GPC uses span.price within .property-details-price
        # Structure: <span class="price">$</span><span class="price">350,000</span>
        price_spans = response.css('.property-details-price span.price::text').getall()
        if price_spans:
            price_text = ''.join(price_spans)
            loader.add_value('price_raw', price_text)
            price_value, currency = self.clean_price_text(price_text)
            loader.add_value('price', price_value)
            loader.add_value('currency', currency)
        
        # Property type and listing type
        loader.add_value('listing_type', listing_type)
        
        # Property type from breadcrumb or title
        property_type = response.css('.breadcrumb li:nth-child(4) a span::text').get()
        if not property_type and title:
            property_type = self.normalize_property_type(title)
        loader.add_value('property_type', property_type or 'house')
        
        # Location - from breadcrumbs
        # Structure varies by listing - collect all breadcrumb text then filter
        breadcrumb_items = response.css('.breadcrumb li')
        all_crumbs = []
        for li in breadcrumb_items:
            link_text = li.css('a span::text').get()
            if link_text:
                all_crumbs.append(link_text)
        
        # Filter out navigation items and property type categories
        skip_terms = {'home', 'for sale', 'for rent', 
                      # Property types
                      'houses', 'apartments', 'land', 'commercial', 'flats', 'plots', 
                      'warehouses', 'offices', 'shops', 'townhouses',
                      # Property subtypes
                      'detached duplexes', 'semi-detached', 'detached bungalows', 
                      'semi-detached bungalows', 'semi-detached duplexes',
                      'residential land', 'commercial land', 'industrial land',
                      'mixed-use land', 'agricultural land',
                      'office space', 'shop', 'warehouse', 'factory', 'hotel',
                      'guest house', 'hostel', 'school', 'church', 'hospital'}
        
        # Pattern to detect title-like text (has number + bedroom/bathroom, or words like "discount", "invest")
        import re
        title_pattern = re.compile(r'(\d+\s*(bed|bath|room|plot|acre))|(discount|invest|dream|exclusive|luxury\s+\d|special)', re.IGNORECASE)
        
        location_parts = []
        for crumb in all_crumbs:
            crumb_lower = crumb.lower()
            # Skip navigation items
            if crumb_lower in skip_terms:
                continue
            # Skip if it looks like a listing title
            if title_pattern.search(crumb):
                continue
            # This is likely a location
            location_parts.append(crumb)
        
        # location_parts should now be like: ['Accra', 'East Legon', 'East Legon Hills']
        # or ['Accra', 'Accra Metropolitan']
        region = location_parts[0] if len(location_parts) > 0 else None
        locality = location_parts[1] if len(location_parts) > 1 else None
        sublocality = location_parts[2] if len(location_parts) > 2 else None
        
        # Set city to first location part (main city/region like "Accra")
        if region:
            loader.add_value('city', region)
            loader.add_value('region', region)
        
        # Build address from specific location parts (excluding main region)
        address_parts = [p for p in [sublocality, locality] if p]
        if address_parts:
            loader.add_value('address', ', '.join(address_parts))
        elif locality:
            loader.add_value('address', locality)
        
        if sublocality:
            loader.add_value('neighborhood', sublocality)
        elif locality:
            loader.add_value('neighborhood', locality)
            
        loader.add_value('country', 'Ghana')
        
        # Property specs - GPC uses schema.org PropertyValue in li elements
        # <li><span itemprop="value">4</span> <span itemprop="name">Bedrooms</span></li>
        bedrooms = response.xpath('//li[.//span[text()="Bedrooms"]]/span[@itemprop="value"]/text()').get()
        if bedrooms:
            loader.add_value('bedrooms', int(bedrooms))
            
        bathrooms = response.xpath('//li[.//span[text()="Bathrooms"]]/span[@itemprop="value"]/text()').get()
        if bathrooms:
            loader.add_value('bathrooms', int(bathrooms))
            
        toilets = response.xpath('//li[.//span[text()="Toilets"]]/span[@itemprop="value"]/text()').get()
        if toilets:
            loader.add_value('toilets', int(toilets))
            
        parking = response.xpath('//li[.//span[contains(text(),"Parking")]]/span[@itemprop="value"]/text()').get()
        if parking:
            loader.add_value('parking_spaces', int(parking))
        
        # Area/Size - GPC uses schema.org structure with separate value and name spans
        # Structure: <span itemprop="value">1,300</span> <span itemprop="unitText">sqm</span> <span itemprop="name">Total Area</span>
        area_li = response.xpath('//li[.//span[@itemprop="name" and contains(text(),"Area")]]').get()
        if area_li:
            # Extract value and unit from the same li element
            area_value = response.xpath('//li[.//span[@itemprop="name" and contains(text(),"Area")]]//span[@itemprop="value"]/text()').get()
            area_unit = response.xpath('//li[.//span[@itemprop="name" and contains(text(),"Area")]]//span[@itemprop="unitText"]/text()').get()
            
            if area_value:
                # Clean the value (remove commas)
                area_text = area_value.replace(',', '')
                if area_unit:
                    area_text += ' ' + area_unit
                
                value, unit = self.extract_area(area_text)
                if value:
                    if unit == 'sqm':
                        loader.add_value('building_size_sqm', value)
                    elif unit == 'sqft':
                        loader.add_value('building_size_sqm', value * 0.0929)
        
        # Images - GPC uses images.ghanapropertycentre.com/properties/
        images = response.css('img[src*="properties/images"]::attr(src)').getall()
        if images:
            loader.add_value('images', images)
        
        # Amenities - from description for now
        amenities = []
        desc_text = response.css('[itemprop="description"]::text').get() or ''
        if 'pool' in desc_text.lower() or 'swimming' in desc_text.lower():
            amenities.append('Swimming Pool')
        if 'air condition' in desc_text.lower() or 'ac' in desc_text.lower():
            amenities.append('Air Conditioning')
        if 'fitted kitchen' in desc_text.lower():
            amenities.append('Fitted Kitchen')
        if 'garden' in desc_text.lower():
            amenities.append('Garden')
        if amenities:
            loader.add_value('amenities', amenities)
        
        # Agent info - GPC shows agent in sidebar
        agent_name = response.css('.panel-sidebar-1 a strong::text').get()
        if agent_name:
            loader.add_value('agent_name', agent_name)
        
        agent_company = response.css('.panel-sidebar-1 p a[href*="/agents/"] strong::text').get()
        if agent_company:
            loader.add_value('agent_company', agent_company)
        
        # Metadata
        loader.add_css('date_listed', '.listing-date::text, .posted-date::text')
        loader.add_value('is_featured', bool(response.css('.featured-badge, .is-featured')))
        
        yield loader.load_item()
    
    def extract_gpc_id(self, url: str) -> str:
        """Extract property ID from GPC URL."""
        # URLs like: https://www.ghanapropertycentre.com/for-sale/houses/details/house-for-sale-123456
        match = re.search(r'-(\d+)$', url.rstrip('/'))
        if match:
            return match.group(1)
        
        # Fallback
        import hashlib
        return hashlib.md5(url.encode()).hexdigest()[:12]
