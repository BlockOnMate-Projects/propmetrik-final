# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - HouseMaster Ghana Spider

Spider for scraping property listings from housemaster.house
Quality-verified property listings with inspection reports.
"""
import re
import logging
from typing import Generator, Optional, Dict, Any
from datetime import datetime
from urllib.parse import urljoin, urlparse, parse_qs

import scrapy
from scrapy import Request
from scrapy.http import Response

from propmetrik_scrapers.spiders.base import BasePropertySpider
from propmetrik_scrapers.items import PropertyItem

logger = logging.getLogger(__name__)


class HouseMasterSpider(BasePropertySpider):
    """
    Spider for HouseMaster Ghana (housemaster.house)
    
    Features:
    - Quality-verified property listings
    - Professional photography and presentations
    - Property inspection reports and ratings
    - Focus on middle to high-end residential properties
    
    Usage:
        scrapy crawl housemaster
        scrapy crawl housemaster -a listing_type=sale
        scrapy crawl housemaster -a listing_type=rent
        scrapy crawl housemaster -a max_pages=10
    """
    
    name = 'housemaster'
    source_name = 'HouseMaster Ghana'
    source_slug = 'housemaster'
    trust_score = 0.75  # Higher trust due to quality verification
    
    allowed_domains = ['housemaster.house']
    
    # Base URLs for different listing types
    BASE_URL = 'https://housemaster.house'
    SALE_URL = 'https://housemaster.house/listings/sales/'
    RENT_URL = 'https://housemaster.house/listings/rentals/'
    
    custom_settings = {
        'DOWNLOAD_DELAY': 5,  # Respectful delay for smaller sites
        'CONCURRENT_REQUESTS_PER_DOMAIN': 1,
        'RANDOMIZE_DOWNLOAD_DELAY': 1.0,
        'ROBOTSTXT_OBEY': True,
        'USER_AGENT': 'Mozilla/5.0 (compatible; PROPMETRIKBot/1.0; +https://propmetrik.com/bot)',
    }
    
    def start_requests(self) -> Generator[Request, None, None]:
        """Generate initial requests based on listing type filter."""
        
        if self.listing_type_filter == 'sale':
            urls = [self.SALE_URL]
        elif self.listing_type_filter == 'rent':
            urls = [self.RENT_URL]
        else:
            # Scrape both sale and rent
            urls = [self.SALE_URL, self.RENT_URL]
        
        for url in urls:
            listing_type = 'sale' if 'sales' in url else 'rent'
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
        
        logger.info(f"Parsing HouseMaster {listing_type} listings - Page {current_page}")
        
        # Extract property links - links follow pattern /listings/details/[slug]
        property_links = response.css('a[href*="/listings/details/"]::attr(href)').getall()
        if not property_links:
            property_links = response.css('.property-card a::attr(href)').getall()
        if not property_links:
            property_links = response.css('.property-listing a.property-link::attr(href)').getall()
        
        # Deduplicate links
        property_links = list(set(property_links))
        
        logger.info(f"Found {len(property_links)} property links on page {current_page}")
        
        for link in property_links:
            full_url = urljoin(self.BASE_URL, link)
            yield Request(
                url=full_url,
                callback=self.parse_property,
                meta={
                    'listing_type': listing_type
                },
                errback=self.handle_error
            )
        
        # Handle pagination
        if self.max_pages and current_page >= int(self.max_pages):
            logger.info(f"Reached max pages limit ({self.max_pages})")
            return
        
        # Look for next page link
        next_page = response.css('.pagination .next a::attr(href)').get()
        if not next_page:
            next_page = response.css('.pagination a[rel="next"]::attr(href)').get()
        if not next_page:
            next_page = response.css('a.next-page::attr(href)').get()
        if not next_page:
            # Try page number pattern
            next_page = response.css(f'a[href*="page={current_page + 1}"]::attr(href)').get()
        
        if next_page:
            yield Request(
                url=response.urljoin(next_page),
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
        
        loader = self.create_item_loader(response)
        
        # Source ID from URL slug
        source_id = self._extract_external_id(response.url)
        loader.add_value('source_id', source_id)
        
        # Title from h5.card-title or og:title meta
        title = response.css('h5.card-title.page-title::text').get()
        if not title:
            title = response.css('meta[property="og:title"]::attr(content)').get()
        if title:
            # Clean "HouseMaster Ghana | " prefix
            title = re.sub(r'^HouseMaster Ghana\s*\|\s*', '', title)
        loader.add_value('title', title.strip() if title else None)
        
        # Price from og:price:amount meta tag (most reliable)
        price_amount = response.css('meta[property="og:price:amount"]::attr(content)').get()
        currency = response.css('meta[property="og:price:currency"]::attr(content)').get()
        
        if price_amount:
            try:
                loader.add_value('price', float(price_amount))
            except (ValueError, TypeError):
                pass
        loader.add_value('currency', currency if currency else 'GHS')
        
        # Property Type from title or description
        title_lower = (title or '').lower()
        property_type = None
        if 'apartment' in title_lower:
            property_type = 'apartment'
        elif 'house' in title_lower:
            property_type = 'house'
        elif 'townhouse' in title_lower:
            property_type = 'townhouse'
        elif 'duplex' in title_lower:
            property_type = 'duplex'
        elif 'land' in title_lower or 'plot' in title_lower:
            property_type = 'land'
        elif 'commercial' in title_lower or 'office' in title_lower:
            property_type = 'commercial'
        loader.add_value('property_type', property_type)
        
        # Listing Type
        loader.add_value('listing_type', listing_type)
        
        # Location/Address - extract from page structure
        # Look for text after "Address:" span
        address_section = response.css('p.card-text:contains("Address") *::text').getall()
        address = None
        for i, text in enumerate(address_section):
            if 'Address:' in text and i + 1 < len(address_section):
                potential = address_section[i + 1].strip()
                if potential and potential != 'Address:':
                    address = potential
                    break
        
        if not address:
            # Fallback: extract from JSON-LD
            address = response.css('script[type="application/ld+json"]::text').re_first(r'"addressLocality"\s*:\s*"([^"]+)"')
        
        loader.add_value('address', address)
        
        # Region from JSON-LD or default
        region = response.css('script[type="application/ld+json"]::text').re_first(r'"addressRegion"\s*:\s*"([^"]+)"')
        if not region:
            region = response.css('.region::text').get()
        loader.add_value('region', region.strip() if region else 'Greater Accra')
        
        # Bedrooms - extract number from section with fa-bed icon
        bedrooms = self._extract_spec_from_icon(response, 'fa-bed')
        bathrooms = self._extract_spec_from_icon(response, 'fa-bath')
        
        loader.add_value('bedrooms', bedrooms)
        loader.add_value('bathrooms', bathrooms)
        
        # Area/Size extraction - look for "Total Area:" followed by number
        area_text = None
        # Method 1: Look for "Total Area:" pattern in text - handle HTML structure
        # Look for total area span and get the following text
        area_element = response.xpath('//span[contains(text(), "total area:")]/following-sibling::text()[normalize-space()!=""][1]').get()
        if not area_element:
            # Try different structure - text after the span
            area_element = response.xpath('//span[contains(text(), "total area:")]/parent::*/following-sibling::text()[normalize-space()!=""][1]').get()
        
        if area_element:
            area_text = area_element.strip()
            
        # Method 2: Look in the page text for area information with flexible pattern
        if not area_text:
            page_text = response.text
            # Handle cases where number is on next line or separated by HTML tags
            area_match = re.search(r'total area:.*?([0-9,]+(?:\.[0-9]+)?)', page_text, re.IGNORECASE | re.DOTALL)
            if area_match:
                area_text = area_match.group(1)
        
        # Parse the area if found
        if area_text:
            area_sqm = self._parse_area(area_text + ' sqm')  # Assume sqm since no unit specified
            if area_sqm:
                loader.add_value('building_size_sqm', area_sqm)
        
        # Store HouseMaster-specific data in raw_data dict
        raw_data = {}
        
        # Amenities
        amenities = response.css('.amenities-list li::text').getall()
        if not amenities:
            amenities = response.css('[class*="amenities"] li::text').getall()
        if not amenities:
            amenities = response.css('[class*="features"] li::text').getall()
        loader.add_value('amenities', [a.strip() for a in amenities if a.strip()])
        
        # Description - from og:description or page content
        description = response.css('meta[property="og:description"]::attr(content)').get()
        if not description:
            description_parts = response.css('p.card-text.blue-txt::text').getall()
            if description_parts:
                description = ' '.join([p.strip() for p in description_parts if p.strip()])
        loader.add_value('description', description)
        
        # Images from JSON-LD (most reliable source)
        images_json = response.css('script[type="application/ld+json"]::text').re(r'"image"\s*:\s*\[\s*"([^"]+)"')
        if not images_json:
            # Fallback: find S3 image URLs
            images_json = response.css('img[src*="amazonaws.com"]::attr(src)').getall()
        if not images_json:
            images_json = response.css('.property-gallery img::attr(src)').getall()
        loader.add_value('images', images_json)
        
        # Inspection Report (HouseMaster specific feature) - store in raw_data
        inspection_report_link = response.css('.inspection-report-link::attr(href)').get()
        if inspection_report_link:
            raw_data['inspection_report_available'] = True
            raw_data['inspection_report_url'] = urljoin(self.BASE_URL, inspection_report_link)
        
        inspection_date = response.css('.inspection-date::text').get()
        if inspection_date:
            raw_data['inspection_date'] = inspection_date.strip()
        
        inspector_notes = response.css('.inspector-notes::text').get()
        if inspector_notes:
            raw_data['inspector_notes'] = inspector_notes.strip()
        
        # Agent Information
        agent_name = response.css('.listing-agent::text').get()
        if not agent_name:
            agent_name = response.css('.agent-name::text').get()
        
        agency_name = response.css('.listing-agency::text').get()
        if not agency_name:
            agency_name = response.css('.agency-name::text').get()
        
        agent_phone = response.css('.agent-phone::text').get()
        agent_email = response.css('.agent-email::text').get()
        
        if agent_name:
            loader.add_value('agent_name', agent_name.strip())
        if agency_name:
            loader.add_value('agent_company', agency_name.strip())
        if agent_phone:
            loader.add_value('agent_phone', self._clean_phone(agent_phone))
        if agent_email:
            loader.add_value('agent_email', agent_email.strip())
        
        # Listing Metadata - store in raw_data
        listed_date = response.css('.date-listed::text').get()
        last_updated = response.css('.last-updated::text').get()
        view_count = response.css('.view-count::text').get()
        
        if listed_date:
            raw_data['listed_date'] = listed_date.strip()
        if last_updated:
            raw_data['last_updated'] = last_updated.strip()
        if view_count:
            raw_data['views'] = self._extract_number(view_count)
        
        # Save all HouseMaster-specific data in raw_data
        if raw_data:
            loader.add_value('raw_data', raw_data)
        
        # Scraped timestamp
        loader.add_value('scraped_at', datetime.utcnow().isoformat())
        
        yield loader.load_item()
    
    # ========================================================================
    # HELPER METHODS
    # ========================================================================
    
    def _extract_external_id(self, url: str) -> str:
        """Extract property ID from URL."""
        # Try to extract ID from URL path
        path = urlparse(url).path
        parts = path.strip('/').split('/')
        
        # Look for numeric ID
        for part in reversed(parts):
            if part.isdigit():
                return f"hm_{part}"
            # Check for slug with ID
            match = re.search(r'-(\d+)$', part)
            if match:
                return f"hm_{match.group(1)}"
        
        # Fallback: use URL hash
        import hashlib
        return f"hm_{hashlib.md5(url.encode()).hexdigest()[:12]}"
    
    def _extract_spec_from_icon(self, response: Response, icon_class: str) -> Optional[int]:
        """Extract spec number (beds/baths) from section with icon.
        
        The page structure has:
        <i class="fas fa-bed"></i> ... Bedrooms: 4
        """
        # Find the paragraph containing the icon and extract the number after it
        # Use XPath to find text near the icon
        icon_xpath = f'//i[contains(@class, "{icon_class}")]/ancestor::p//text()'
        texts = response.xpath(icon_xpath).getall()
        
        # Look for a standalone number in the text fragments
        for text in texts:
            text = text.strip()
            if text and text.isdigit():
                return int(text)
        
        return None
    
    def _parse_price(self, price_text: Optional[str]) -> tuple:
        """Parse price text and return (amount, currency)."""
        if not price_text:
            return None, 'GHS'
        
        price_text = price_text.strip().upper()
        
        # Determine currency
        currency = 'GHS'
        if '$' in price_text or 'USD' in price_text:
            currency = 'USD'
        elif 'GH' in price_text or '₵' in price_text or 'CEDI' in price_text:
            currency = 'GHS'
        
        # Extract numeric value
        price_clean = re.sub(r'[^\d.]', '', price_text)
        if price_clean:
            try:
                return float(price_clean), currency
            except ValueError:
                pass
        
        return None, currency
    
    def _normalize_property_type(self, prop_type: Optional[str]) -> str:
        """Normalize property type to standard values."""
        if not prop_type:
            return 'unknown'
        
        prop_type = prop_type.lower().strip()
        
        type_mapping = {
            'house': 'house',
            'home': 'house',
            'detached': 'house',
            'bungalow': 'house',
            'villa': 'villa',
            'mansion': 'villa',
            'apartment': 'apartment',
            'flat': 'apartment',
            'studio': 'studio',
            'self-contain': 'studio',
            'selfcontain': 'studio',
            'chamber': 'chamber_and_hall',
            'townhouse': 'townhouse',
            'terrace': 'townhouse',
            'duplex': 'duplex',
            'penthouse': 'penthouse',
            'land': 'land',
            'plot': 'land',
            'commercial': 'commercial',
            'office': 'office',
            'shop': 'shop',
            'warehouse': 'warehouse',
        }
        
        for key, value in type_mapping.items():
            if key in prop_type:
                return value
        
        return 'other'
    
    def _extract_spec(self, response: Response, class_names: list) -> Optional[int]:
        """Extract numeric specification from various possible class names."""
        for class_name in class_names:
            value = response.css(f'.{class_name}::text').get()
            if value:
                num = self._extract_number(value)
                if num is not None:
                    return num
        return None
    
    def _extract_number(self, text: str) -> Optional[int]:
        """Extract first number from text."""
        if not text:
            return None
        match = re.search(r'\d+', text)
        return int(match.group()) if match else None
    
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
        
        # Convert to sqm if needed
        if 'acre' in area_text:
            value *= 4046.86  # acres to sqm
        elif 'hectare' in area_text or 'ha' in area_text:
            value *= 10000  # hectares to sqm
        elif 'plot' in area_text:
            value *= 669.66  # standard Ghana plot to sqm (approx)
        elif 'sqft' in area_text or 'sq ft' in area_text or 'sq.ft' in area_text:
            value *= 0.092903  # sqft to sqm
        
        return round(value, 2)
    
    def _clean_phone(self, phone: str) -> str:
        """Clean phone number."""
        if not phone:
            return ''
        # Keep only digits and plus sign
        return re.sub(r'[^\d+]', '', phone.strip())
    
    def handle_error(self, failure):
        """Handle request errors."""
        self.errors_count += 1
        logger.error(f"Request failed: {failure.request.url} - {failure.value}")
