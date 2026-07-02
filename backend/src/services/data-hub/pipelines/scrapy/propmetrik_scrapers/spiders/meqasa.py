# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - Meqasa Spider

Spider for scraping property listings from meqasa.com
Ghana's leading property listing website.
"""
import re
import json
import logging
from typing import Generator, Optional
from datetime import datetime

import scrapy
from scrapy import Request
from scrapy.http import Response, HtmlResponse

from propmetrik_scrapers.items import PropertyItem
from .base import BasePropertySpider

logger = logging.getLogger(__name__)


class MeqasaSpider(BasePropertySpider):
    """
    Spider for meqasa.com - Ghana's premier property listing platform.
    
    Meqasa features:
    - Structured property data with detailed specifications
    - Multiple property types (houses, apartments, land, commercial)
    - Agent/owner listings
    - Verified properties
    
    Usage:
        scrapy crawl meqasa
        scrapy crawl meqasa -a listing_type=rent
        scrapy crawl meqasa -a max_pages=10
        scrapy crawl meqasa -a region=accra
    """
    
    name = 'meqasa'
    source_name = 'Meqasa Properties'
    source_slug = 'meqasa'
    trust_score = 0.65
    
    allowed_domains = ['meqasa.com']
    
    # Base URLs for different listing types
    BASE_URLS = {
        'sale': 'https://meqasa.com/properties-for-sale-in-ghana',
        'rent': 'https://meqasa.com/properties-for-rent-in-ghana',
    }
    
    custom_settings = {
        'DOWNLOAD_DELAY': 2,
        'CONCURRENT_REQUESTS_PER_DOMAIN': 4,
        'ROBOTSTXT_OBEY': True,
    }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.pages_scraped = 0
        self.items_scraped = 0
    
    # meqasa's public listing pages are now Angular shells that load listings via an XHR to
    # /filter2/selected (JSON: {propertycount, markup:<cards HTML>, items:<pagination>}). We POST that
    # endpoint directly — no headless browser needed. Detail pages are also Angular-rendered, so we
    # extract everything (price/title/beds/type/location) from the listing-card markup itself.
    FILTER_ENDPOINT = 'https://meqasa.com/filter2/selected'
    # Major Ghana localities to sweep (covers the bulk of national inventory).
    LOCALITIES = [
        'accra', 'kumasi', 'tema', 'takoradi', 'tamale', 'cape-coast', 'ho', 'koforidua',
        'sunyani', 'east-legon', 'spintex', 'airport-residential-area', 'cantonments', 'ridge',
        'oyarifa', 'kasoa', 'dansoman', 'adenta', 'madina', 'ashongman',
    ]

    def start_requests(self) -> Generator[Request, None, None]:
        """POST the /filter2/selected JSON feed per contract + locality."""
        contracts = ['sale', 'rent']
        if self.listing_type_filter:
            contracts = [self.listing_type_filter]
        localities = [self.region_filter] if self.region_filter else self.LOCALITIES

        for contract in contracts:
            for loc in localities:
                yield scrapy.FormRequest(
                    url=self.FILTER_ENDPOINT,
                    formdata={
                        'type': '- Any -', 'contract': contract, 'beds': '- Any -', 'baths': '- Any -',
                        'loask': '', 'hiask': '', 'isfurnished': '', 'region': '- Any -', 'fsbo': '',
                        'rentperiod': '- Any -', 'localities': loc, 'sort': 'date', 'handle': '___', 'kw': '',
                    },
                    headers={
                        'X-Requested-With': 'XMLHttpRequest',
                        'Referer': f'https://meqasa.com/properties-for-{contract}-in-{loc}',
                    },
                    callback=self.parse_filter,
                    meta={'listing_type': contract, 'locality': loc},
                    errback=self.errback_handler,
                )

    def parse_filter(self, response: Response) -> Generator:
        """Parse the /filter2/selected JSON feed → listing cards → PropertyItems."""
        listing_type = response.meta.get('listing_type', 'sale')
        locality = response.meta.get('locality', '')
        try:
            data = json.loads(response.text)
        except (ValueError, TypeError):
            logger.warning(f"meqasa filter2 returned non-JSON for {locality}/{listing_type}")
            return
        markup = data.get('markup') or ''
        if not markup:
            return
        sel = scrapy.Selector(text=markup)
        cards = sel.css('div.mqs-featured-prop-inner-wrap')
        logger.info(f"Found {len(cards)} meqasa {listing_type} listings for {locality}")
        for card in cards:
            item = self._item_from_card(card, response, listing_type, locality)
            if item is not None:
                self.items_scraped += 1
                yield item

    def _item_from_card(self, card, response: Response, listing_type: str, locality: str):
        """Build a PropertyItem from one meqasa listing card (all data is in the card markup)."""
        href = (card.css('.mqs-prop-dt-wrapper h2 a::attr(href)').get()
                or card.css('.mqs-prop-image-wrapper a::attr(href)').get())
        if not href:
            return None
        url = response.urljoin(href.split('?')[0])
        title = (card.css('.mqs-prop-dt-wrapper h2 a::text').get() or '').strip()

        loader = self.create_item_loader(response)
        loader.replace_value('source_url', url)  # override the filter endpoint URL with the listing URL
        loader.add_value('listing_type', listing_type)
        loader.add_value('title', title)

        m_id = re.search(r'-(\d{3,})$', url)
        loader.add_value('source_id', m_id.group(1) if m_id else url.rstrip('/').split('/')[-1])

        # Price: card renders "<span class='h3'>Price</span>GH₵1,637,262"
        price_text = ' '.join(t.strip() for t in card.css('p.h3 ::text').getall())
        pm = re.search(r'(?:GH₵|₵|US\$|\$|GHS)\s?[\d,]+', price_text)
        if not pm:
            pm = re.search(r'(?:GH₵|₵|US\$|\$|GHS)\s?[\d,]+', ' '.join(card.css('*::text').getall()))
        if pm:
            price_value, currency = self.clean_price_text(pm.group(0))
            loader.add_value('price', price_value)
            loader.add_value('price_raw', pm.group(0))
            loader.add_value('currency', currency)

        # Beds + property type + location parsed from the title, e.g.
        # "3 bedroom house for sale in East Legon Hills"
        mb = re.search(r'(\d+)\s*bed', title, re.I)
        if mb:
            loader.add_value('bedrooms', int(mb.group(1)))
        loader.add_value('property_type', self.normalize_property_type(title) if title else 'house')

        mloc = re.search(r'\bin\s+(.+)$', title, re.I)
        specific_loc = mloc.group(1).strip() if mloc else locality.replace('-', ' ')
        # region = broad locality (routes the DB partition, gets normalized downstream); keep the
        # precise area as address/neighborhood.
        loader.add_value('region', locality.replace('-', ' '))
        loader.add_value('city', locality.replace('-', ' '))
        loader.add_value('address', specific_loc)
        loader.add_value('neighborhood', specific_loc)
        loader.add_value('country', 'Ghana')

        return loader.load_item()

    def parse_listing(self, response: Response) -> Generator:
        """Legacy HTML listing parser (unused — meqasa is now API-driven via parse_filter)."""
        
        self.pages_scraped += 1
        listing_type = response.meta.get('listing_type', 'sale')
        current_page = response.meta.get('page', 1)
        
        logger.info(f"Parsing {listing_type} listing page {current_page}: {response.url}")
        
        # Extract property cards using current Meqasa HTML structure (verified 2024)
        # Primary selectors: featured and regular property cards
        # Note: Class names may vary (mqs-prop-inner-wrapx2, mqs-prop-inner-wrap, etc.)
        property_cards = response.css('div.mqs-featured-prop-inner-wrap, div.mqs-prop-inner-wrap, div.mqs-prop-inner-wrapx, div.mqs-prop-inner-wrapx2')
        
        logger.info(f"Found {len(property_cards)} properties on page {current_page}")
        
        for card in property_cards:
            # Extract property URL - Meqasa uses URLs like /house-for-sale-at-Location-123456
            # First try the title link which is most reliable
            property_url = card.css('.mqs-prop-dt-wrapper h2 a::attr(href)').get()
            
            # Fallback: try image link
            if not property_url:
                property_url = card.css('.mqs-prop-image-wrapper a::attr(href)').get()
            
            # Fallback: any link with property-related URL pattern
            if not property_url:
                for link in card.css('a::attr(href)').getall():
                    if any(x in link for x in ['-for-sale', '-for-rent', 'house-', 'apartment-', 'land-']):
                        property_url = link
                        break
            
            if not property_url:
                continue
            
            property_url = self.make_absolute_url(property_url, response)
            
            # Extract data from card for quick access
            title = card.css('.mqs-prop-dt-wrapper h2 a::text').get()
            if not title:
                title = card.css('.mqs-prop-dt-wrapper h2::text').get()
            
            # Price can be in h3 or p.h3
            price_raw = card.css('.mqs-prop-dt-wrapper h3::text').get()
            if not price_raw:
                price_raw = card.css('.mqs-prop-dt-wrapper p.h3::text').get()
            
            # Location from right wrapper
            location = card.css('.mqs-prop-right-wrapper p::text').get()
            
            # Extract features from prop-features list (beds, baths, area)
            features = {}
            for li in card.css('ul.prop-features li'):
                text = li.css('span::text').get()
                li_class = li.attrib.get('class', '')
                if 'bed' in li_class and text:
                    features['bedrooms'] = text.strip()
                elif 'shower' in li_class and text:
                    features['bathrooms'] = text.strip()
                elif 'garage' in li_class and text:
                    features['parking'] = text.strip()
                elif 'area' in li_class and text:
                    features['area'] = text.strip()
            
            card_data = {
                'title': title.strip() if title else None,
                'price_raw': price_raw.strip() if price_raw else None,
                'location': location.strip() if location else None,
                'features': features,
            }
            
            yield Request(
                url=property_url,
                callback=self.parse_property,
                meta={
                    'listing_type': listing_type,
                    'card_data': card_data,
                },
                errback=self.errback_handler
            )
        
        # Check for next page
        max_pages = int(self.max_pages) if self.max_pages else 50
        
        if current_page < max_pages:
            # Try to find next page link
            next_page = response.css('a.next::attr(href), a[rel="next"]::attr(href), .pagination a:contains("Next")::attr(href)').get()
            
            if next_page:
                next_url = self.make_absolute_url(next_page, response)
                yield Request(
                    url=next_url,
                    callback=self.parse_listing,
                    meta={
                        'listing_type': listing_type,
                        'page': current_page + 1,
                        'selenium': True,  # Enable Selenium middleware
                    },
                    errback=self.errback_handler
                )
            else:
                # Construct next page URL manually
                base_url = self.BASE_URLS.get(listing_type)
                if self.region_filter:
                    base_url = f"{base_url}-in-{self.region_filter}"
                
                next_url = f"{base_url}?page={current_page + 1}"
                
                yield Request(
                    url=next_url,
                    callback=self.parse_listing,
                    meta={
                        'listing_type': listing_type,
                        'page': current_page + 1,
                        'selenium': True,  # Enable Selenium middleware
                    },
                    errback=self.errback_handler
                )
    
    def parse_property(self, response: Response) -> Generator[PropertyItem, None, None]:
        """Parse individual property page and yield PropertyItem."""
        
        self.items_scraped += 1
        listing_type = response.meta.get('listing_type', 'sale')
        card_data = response.meta.get('card_data', {})
        
        logger.debug(f"Parsing property: {response.url}")
        
        # Create item loader
        loader = self.create_item_loader(response)
        
        # Extract property ID from URL
        property_id = self.extract_meqasa_id(response.url)
        loader.add_value('source_id', property_id)
        
        # Title
        title = response.css('h1.property-title::text, h1::text, .listing-title::text').get()
        if not title:
            title = card_data.get('title')
        loader.add_value('title', title)
        
        # Description
        description = response.css('.property-description::text, .description p::text, .listing-description::text').getall()
        loader.add_value('description', ' '.join(description) if description else None)
        
        # Price
        price_text = response.css('.property-price::text, .price::text, [class*="price"] span::text').get()
        if not price_text:
            price_text = card_data.get('price_raw')
        
        if price_text:
            loader.add_value('price_raw', price_text)
            price_value, currency = self.clean_price_text(price_text)
            loader.add_value('price', price_value)
            loader.add_value('currency', currency)
        
        # Listing type
        loader.add_value('listing_type', listing_type)
        
        # Property type
        property_type = response.css('.property-type::text, [class*="type"]::text').get()
        if not property_type:
            # Try to extract from breadcrumbs or title
            breadcrumbs = response.css('.breadcrumb a::text, .breadcrumbs a::text').getall()
            for crumb in breadcrumbs:
                if any(t in crumb.lower() for t in ['house', 'apartment', 'land', 'commercial']):
                    property_type = crumb
                    break
        
        loader.add_value('property_type', property_type or 'house')
        
        # Location and address
        location_text = response.css('.property-location::text, .location::text, [class*="address"]::text').get()
        
        # Try to extract location from title as backup - Meqasa titles often contain location
        if not location_text:
            title = loader.get_output_value('title')
            if title:
                # Extract location from titles like "2 bedroom apartment for rent at OSU Oxford Street"
                location_match = re.search(r'\bat\s+(.+?)(?:\s*-|\s*$)', title, re.IGNORECASE)
                if location_match:
                    location_text = location_match.group(1).strip()
        
        if location_text:
            loader.add_value('address_raw', location_text)
            # Parse the address to extract components
            parsed_location = self.parse_ghana_address(location_text)
            
            # Set address to the full location text initially
            loader.add_value('address', location_text)
            
            # Extract more specific components if possible
            loader.add_value('neighborhood', parsed_location.get('neighborhood'))
            loader.add_value('city', parsed_location.get('city', 'Accra'))  # Default to Accra for most Meqasa properties
            loader.add_value('region', parsed_location.get('region', 'Greater Accra'))  # Default to Greater Accra
        
        loader.add_value('country', 'Ghana')
        
        # Property features (bedrooms, bathrooms, etc.)
        self._extract_features(response, loader)
        
        # Area/Size
        self._extract_size(response, loader)
        
        # Images
        images = self.extract_images(response, [
            '.property-image img::attr(src)',
            '.gallery img::attr(src)',
            '.carousel img::attr(src)',
            '[class*="image"] img::attr(src)',
            'img[src*="property"]::attr(src)',
            '.property-photos img::attr(data-src)',
            '.property-photos img::attr(src)',
        ])
        loader.add_value('images', images)
        
        # Amenities
        amenities = self.extract_amenities(response, [
            '.amenities li::text',
            '.features li::text',
            '.property-features li::text',
            '[class*="amenity"]::text',
        ])
        loader.add_value('amenities', amenities)
        
        # Agent information
        agent_name = response.css('.agent-name::text, .realtor-name::text, [class*="agent"] .name::text').get()
        agent_phone = response.css('.agent-phone::text, .realtor-phone::text, [class*="phone"]::text').get()
        agent_company = response.css('.agent-company::text, .agency-name::text').get()
        
        loader.add_value('agent_name', agent_name)
        loader.add_value('agent_phone', agent_phone)
        loader.add_value('agent_company', agent_company)
        
        # Date listed
        date_listed = response.css('.date-listed::text, .posted-date::text, [class*="date"]::text').get()
        loader.add_value('date_listed', date_listed)
        
        # Featured/Verified status
        is_featured = bool(response.css('.featured, .is-featured, [class*="featured"]'))
        is_verified = bool(response.css('.verified, .is-verified, [class*="verified"]'))
        loader.add_value('is_featured', is_featured)
        loader.add_value('is_verified', is_verified)
        
        # Store raw data for debugging
        loader.add_value('raw_data', {
            'url': response.url,
            'card_data': card_data,
        })
        
        yield loader.load_item()
    
    def _extract_features(self, response: Response, loader):
        """Extract property features like bedrooms, bathrooms."""
        
        # First, try to extract from card_data features (most reliable for Meqasa)
        card_data = response.meta.get('card_data', {})
        features_from_card = card_data.get('features', {})
        
        # Extract bedrooms from card data
        if 'bedrooms' in features_from_card:
            try:
                bedrooms = int(features_from_card['bedrooms'])
                loader.add_value('bedrooms', bedrooms)
            except (ValueError, TypeError):
                pass
        
        # Extract bathrooms from card data  
        if 'bathrooms' in features_from_card:
            try:
                bathrooms = int(features_from_card['bathrooms'])
                loader.add_value('bathrooms', bathrooms)
            except (ValueError, TypeError):
                pass
        
        # Extract parking from card data
        if 'parking' in features_from_card:
            try:
                parking = int(features_from_card['parking'])
                loader.add_value('parking_spaces', parking)
            except (ValueError, TypeError):
                pass
        
        # Extract area from card data
        if 'area' in features_from_card:
            area_text = features_from_card['area']
            if area_text:
                # Parse area text like "150 m", "6,000 m"
                area_match = re.search(r'([\d,]+)\s*(?:m²?|sqm|sq\.?m\.?)', area_text, re.IGNORECASE)
                if area_match:
                    try:
                        area_value = float(area_match.group(1).replace(',', ''))
                        loader.add_value('building_size_sqm', area_value)
                    except (ValueError, TypeError):
                        pass
        
        # Try structured data from property page as fallback
        features = response.css('.property-features li, .features-list li, [class*="feature"]')
        
        for feature in features:
            text = feature.css('::text').get()
            if not text:
                continue
            
            text_lower = text.lower()
            
            if 'bed' in text_lower and not loader.get_output_value('bedrooms'):
                beds = self.extract_bedrooms(text)
                loader.add_value('bedrooms', beds)
            elif 'bath' in text_lower and not loader.get_output_value('bathrooms'):
                baths = self.extract_bathrooms(text)
                loader.add_value('bathrooms', baths)
            elif 'garage' in text_lower or 'parking' in text_lower or 'car' in text_lower:
                if not loader.get_output_value('parking_spaces'):
                    parking = re.search(r'(\d+)', text)
                    if parking:
                        loader.add_value('parking_spaces', int(parking.group(1)))
            elif 'toilet' in text_lower:
                toilets = re.search(r'(\d+)', text)
                if toilets:
                    loader.add_value('toilets', int(toilets.group(1)))
        
        # Fallback: try to extract from title and description
        title = loader.get_output_value('title')
        description = loader.get_output_value('description')
        combined_text = f"{title or ''} {description or ''}"
        
        if combined_text:
            if not loader.get_output_value('bedrooms'):
                beds = self.extract_bedrooms(combined_text)
                loader.add_value('bedrooms', beds)
            if not loader.get_output_value('bathrooms'):
                baths = self.extract_bathrooms(combined_text)
                loader.add_value('bathrooms', baths)
    
    def _extract_size(self, response: Response, loader):
        """Extract property size/area information."""
        
        # First try to get area from card data (most reliable for Meqasa)
        card_data = response.meta.get('card_data', {})
        features_from_card = card_data.get('features', {})
        
        if 'area' in features_from_card:
            area_text = features_from_card['area']
            if area_text:
                # Parse area text like "150 m", "6,000 m", "150 sqm"
                area_match = re.search(r'([\d,]+(?:\.\d+)?)\s*(?:m²?|sqm|sq\.?m\.?)', area_text, re.IGNORECASE)
                if area_match:
                    try:
                        area_value = float(area_match.group(1).replace(',', ''))
                        loader.add_value('building_size_sqm', area_value)
                        return  # Found area, no need to continue
                    except (ValueError, TypeError):
                        pass
        
        # Fallback: try property page selectors
        size_selectors = [
            '.property-size::text',
            '.area::text',
            '[class*="size"]::text',
            '[class*="area"]::text',
        ]
        
        for selector in size_selectors:
            size_text = response.css(selector).get()
            if size_text:
                value, unit = self.extract_area(size_text)
                if value:
                    if unit == 'sqm':
                        loader.add_value('building_size_sqm', value)
                    elif unit == 'sqft':
                        loader.add_value('building_size_sqm', value * 0.0929)  # Convert to sqm
                    elif unit == 'acres':
                        loader.add_value('land_size_acres', value)
                    elif unit == 'plots':
                        loader.add_value('land_size_plots', value)
                    break
    
    def extract_meqasa_id(self, url: str) -> str:
        """Extract Meqasa property ID from URL."""
        # URLs look like: https://meqasa.com/4-bedroom-house-for-sale-at-east-legon-1234567
        match = re.search(r'-(\d+)$', url.rstrip('/'))
        if match:
            return match.group(1)
        
        # Fallback: hash the URL
        import hashlib
        return hashlib.md5(url.encode()).hexdigest()[:12]
