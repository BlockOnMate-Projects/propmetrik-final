# -*- coding: utf-8 -*-
"""
Airbnb Ghana Spider

Scrapes short-stay rental listings from Airbnb for key Ghana neighborhoods.
Collects availability calendars and pricing for occupancy/ADR calculations.

Target neighborhoods: Osu, Cantonments, East Legon, Airport Residential, Labone

Usage:
    scrapy crawl airbnb_ghana -a neighborhood=osu -a max_listings=100
"""
import scrapy
from scrapy import Request
from itemloaders import ItemLoader
from datetime import datetime, timedelta
import json
import re
from typing import Generator, Optional, List
from urllib.parse import urlencode

from propmetrik_scrapers.critical_data_items import ShortStayListingItem, ShortStayAvailabilityItem


class AirbnbGhanaSpider(scrapy.Spider):
    """
    Spider for scraping Airbnb listings in Ghana.
    
    Uses Selenium middleware for JavaScript rendering.
    Focus: Entire homes in premium neighborhoods for investment analytics.
    """
    
    name = "airbnb_ghana"
    allowed_domains = ["airbnb.com", "www.airbnb.com"]
    
    custom_settings = {
        'DOWNLOAD_DELAY': 5,  # Airbnb is aggressive with rate limiting
        'CONCURRENT_REQUESTS_PER_DOMAIN': 1,  # Very conservative
        'ROBOTSTXT_OBEY': False,  # Airbnb blocks robots
        'SELENIUM_DRIVER_NAME': 'chrome',
        'SELENIUM_DRIVER_ARGUMENTS': ['--headless', '--disable-blink-features=AutomationControlled'],
        'DOWNLOADER_MIDDLEWARES': {
            'propmetrik_scrapers.middlewares.SeleniumMiddleware': 800,
        },
        'USER_AGENT': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
    
    # Target neighborhoods in Ghana
    GHANA_NEIGHBORHOODS = {
        'osu': {'lat': 5.5560, 'lng': -0.1820, 'city': 'Accra'},
        'cantonments': {'lat': 5.5800, 'lng': -0.1750, 'city': 'Accra'},
        'east_legon': {'lat': 5.6280, 'lng': -0.1670, 'city': 'Accra'},
        'airport_residential': {'lat': 5.6050, 'lng': -0.1720, 'city': 'Accra'},
        'labone': {'lat': 5.5670, 'lng': -0.1740, 'city': 'Accra'},
        'ridge': {'lat': 5.5760, 'lng': -0.2020, 'city': 'Accra'},
        'roman_ridge': {'lat': 5.5830, 'lng': -0.1950, 'city': 'Accra'},
    }
    
    def __init__(self, neighborhood=None, max_listings=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.neighborhood = neighborhood if neighborhood else 'osu'
        self.max_listings = int(max_listings) if max_listings else 100
        self.listing_count = 0
        self.availability_snapshots = 0
        
        if self.neighborhood not in self.GHANA_NEIGHBORHOODS:
            self.logger.warning(f"Unknown neighborhood '{self.neighborhood}', defaulting to 'osu'")
            self.neighborhood = 'osu'
    
    def start_requests(self) -> Generator[Request, None, None]:
        """Generate initial search requests for target neighborhood."""
        search_params = self._build_search_params(self.neighborhood)
        search_url = f"https://www.airbnb.com/s/homes?{urlencode(search_params)}"
        
        self.logger.info(f"Starting Airbnb scraper for {self.neighborhood}, max_listings={self.max_listings}")
        self.logger.info(f"Search URL: {search_url}")
        
        yield Request(
            url=search_url,
            callback=self.parse_search_results,
            errback=self.errback_handler,
            meta={
                'neighborhood': self.neighborhood,
                'page': 1,
                'selenium': True,  # Use Selenium middleware
            }
        )
    
    def _build_search_params(self, neighborhood: str) -> dict:
        """Build Airbnb search URL parameters."""
        location = self.GHANA_NEIGHBORHOODS[neighborhood]
        
        # Calculate search bounds (roughly 5km radius)
        ne_lat = location['lat'] + 0.045
        ne_lng = location['lng'] + 0.045
        sw_lat = location['lat'] - 0.045
        sw_lng = location['lng'] - 0.045
        
        params = {
            'ne_lat': ne_lat,
            'ne_lng': ne_lng,
            'sw_lat': sw_lat,
            'sw_lng': sw_lng,
            'search_by_map': 'true',
            'place_id': '',  # Accra, Ghana
            'room_types[]': 'Entire home/apt',  # Focus on entire homes
            'adults': 2,
            'children': 0,
            'infants': 0,
            'items_per_grid': 50,  # Max items per page
        }
        
        return params
    
    def parse_search_results(self, response) -> Generator:
        """
        Parse Airbnb search results page.
        
        Extract listing cards and follow to individual listing pages.
        """
        page = response.meta.get('page', 1)
        neighborhood = response.meta.get('neighborhood')
        
        self.logger.info(f"Parsing search results page {page} for {neighborhood}")
        
        # Airbnb uses React with data in script tags
        # Try to extract listing IDs from page data
        listing_data = self._extract_listing_data_from_scripts(response)
        
        if listing_data:
            self.logger.info(f"Found {len(listing_data)} listings from script data")
            for listing in listing_data[:self.max_listings - self.listing_count]:
                listing_id = listing.get('listing', {}).get('id') or listing.get('id')
                if listing_id:
                    listing_url = f"https://www.airbnb.com/rooms/{listing_id}"
                    yield Request(
                        url=listing_url,
                        callback=self.parse_listing,
                        errback=self.errback_handler,
                        meta={
                            'neighborhood': neighborhood,
                            'listing_id': listing_id,
                            'selenium': True,
                        }
                    )
        
        # Fallback: Parse listing cards from HTML
        listing_selectors = [
            '[data-testid="listing-card-title"]::attr(href)',
            'a[href*="/rooms/"]::attr(href)',
            '.c1yo0219 a::attr(href)',
        ]
        
        listing_urls = []
        for selector in listing_selectors:
            urls = response.css(selector).getall()
            if urls:
                listing_urls.extend(urls)
                break
        
        if listing_urls:
            listing_urls = list(set(listing_urls))[:self.max_listings - self.listing_count]
            self.logger.info(f"Found {len(listing_urls)} listing URLs from HTML")
            
            for url in listing_urls:
                full_url = response.urljoin(url)
                if '/rooms/' in full_url:
                    listing_id = re.search(r'/rooms/(\d+)', full_url)
                    if listing_id:
                        yield Request(
                            url=full_url,
                            callback=self.parse_listing,
                            errback=self.errback_handler,
                            meta={
                                'neighborhood': neighborhood,
                                'listing_id': listing_id.group(1),
                                'selenium': True,
                            }
                        )
    
    def parse_listing(self, response) -> Generator:
        """
        Parse individual Airbnb listing page.
        
        Extract property details, host info, and availability calendar.
        """
        listing_id = response.meta.get('listing_id')
        neighborhood = response.meta.get('neighborhood')
        
        self.logger.info(f"Parsing listing {listing_id}")
        
        # === EXTRACT LISTING DATA FROM PAGE ===
        listing_data = self._extract_listing_data_from_scripts(response)
        
        if not listing_data or not listing_data.get('pdp_listing_detail'):
            self.logger.warning(f"Could not extract listing data for {listing_id}")
            return
        
        listing_detail = listing_data.get('pdp_listing_detail', [{}])[0] if isinstance(listing_data.get('pdp_listing_detail'), list) else listing_data.get('pdp_listing_detail', {})
        
        # === CREATE LISTING ITEM ===
        loader = ItemLoader(item=ShortStayListingItem(), response=response)
        
        loader.add_value('platform', 'airbnb')
        loader.add_value('source_slug', 'airbnb')
        loader.add_value('source_name', 'Airbnb')
        loader.add_value('listing_type', 'short_term')
        loader.add_value('external_id', listing_id)
        loader.add_value('listing_url', response.url)
        loader.add_value('spider_name', self.name)
        loader.add_value('spider_version', '1.0.0')
        loader.add_value('scraped_at', datetime.utcnow().isoformat())
        loader.add_value('country', 'Ghana')
        
        # Property details
        loader.add_value('property_name', listing_detail.get('name', ''))
        
        # Validation fields
        loader.add_value('source_id', listing_id)
        loader.add_value('source_url', response.url)
        loader.add_value('title', listing_detail.get('name', ''))
        loader.add_value('property_type', self._normalize_property_type(listing_detail.get('room_and_property_type', '')))
        
        # Location
        loader.add_value('neighborhood', neighborhood)
        loader.add_value('city', self.GHANA_NEIGHBORHOODS[neighborhood]['city'])
        loader.add_value('region', 'Greater Accra')
        
        # Coordinates
        lat = listing_detail.get('lat') or listing_detail.get('listing', {}).get('lat')
        lng = listing_detail.get('lng') or listing_detail.get('listing', {}).get('lng')
        if lat:
            loader.add_value('latitude', lat)
        if lng:
            loader.add_value('longitude', lng)
        loader.add_value('coordinates_source', 'platform')
        loader.add_value('geocoding_confidence', 1.0)
        
        # Capacity
        loader.add_value('bedrooms', listing_detail.get('bedrooms', 0))
        loader.add_value('bathrooms', listing_detail.get('bathrooms', 0))
        loader.add_value('max_guests', listing_detail.get('person_capacity', 0))
        
        # Amenities
        amenities = listing_detail.get('listing_amenities', [])
        if isinstance(amenities, list):
            loader.add_value('amenities', [a.get('name', '') for a in amenities if a.get('name')])
        
        # Host info
        host = listing_detail.get('primary_host', {}) or listing_detail.get('host', {})
        loader.add_value('host_id', host.get('id', ''))
        loader.add_value('host_name', host.get('name', ''))
        loader.add_value('host_is_superhost', host.get('is_superhost', False))
        
        # Ratings
        loader.add_value('rating_average', listing_detail.get('star_rating', 0))
        loader.add_value('rating_count', listing_detail.get('review_details_interface', {}).get('review_count', 0))
        
        loader.add_value('is_active', True)
        loader.add_value('extracted_data', listing_detail)
        
        self.listing_count += 1
        yield loader.load_item()
        
        # === FETCH AVAILABILITY CALENDAR ===
        # Request next 12 months of availability using modern GraphQL persisted query
        # SHA256 hash for PdpAvailabilityCalendar GraphQL operation
        operation_hash = "8f08e03c7bd16fcad3c92a3592c19a8b559a0d0855a84028d1163d4733ed9ade"
        calendar_url = f"https://www.airbnb.com/api/v3/PdpAvailabilityCalendar/{operation_hash}"
        
        # Extract API key dynamically from the page
        api_key = self._extract_api_key(response) or "40ed737973752e505a468d601b34ea6c"
        self.logger.info(f"Using API Key: {api_key}")
        
        variables = {
            "request": {
                "count": 12,
                "listingId": str(listing_id),
                "month": datetime.now().month,
                "year": datetime.now().year,
                "returnPropertyLevelCalendarIfApplicable": False
            }
        }
        
        extensions = {
            "persistedQuery": {
                "version": 1,
                "sha256Hash": operation_hash
            }
        }
        
        calendar_params = {
            'operationName': 'PdpAvailabilityCalendar',
            'locale': 'en',
            'currency': 'USD',
            'variables': json.dumps(variables),
            'extensions': json.dumps(extensions)
        }
        
        yield Request(
            url=f"{calendar_url}?{urlencode(calendar_params)}",
            callback=self.parse_availability_calendar,
            cb_kwargs={'listing_id': listing_id},
            meta={'listing_id': listing_id},
            headers={
                'X-Airbnb-API-Key': api_key,
                'Content-Type': 'application/json'
            }
        )
    
    def parse_availability_calendar(self, response, listing_id) -> Generator:
        """
        Parse availability calendar API response.
        
        Create availability snapshot items for each date.
        """
        self.logger.info(f"Received calendar response for listing {listing_id} (Status: {response.status})")
        
        try:
            calendar_data = json.loads(response.text)
            # Debug: Save raw JSON to a file for inspection
            with open("calendar_debug.json", "w") as f:
                json.dump(calendar_data, f, indent=2)
            self.logger.info("Saved calendar data to calendar_debug.json")
        except json.JSONDecodeError:
            self.logger.error(f"Failed to parse calendar JSON for listing {listing_id}")
            return
        
        # Extract calendar days safely - Path identified: data.merlin.pdpAvailabilityCalendar.calendarMonths
        try:
            data_root = calendar_data.get('data', {}) or {}
            if not data_root and 'errors' in calendar_data:
                self.logger.error(f"GraphQL Errors for {listing_id}: {calendar_data.get('errors')}")
                return
                
            self.logger.info(f"Calendar response keys: {list(data_root.keys())}")
            merlin = data_root.get('merlin', {}) or {}
            pdp_avail = merlin.get('pdpAvailabilityCalendar', {}) or {}
            calendar_months = pdp_avail.get('calendarMonths', [])
            self.logger.info(f"Found {len(calendar_months)} calendar months")
        except (AttributeError, TypeError) as e:
            self.logger.error(f"Failed to extract calendar months for {listing_id}: {str(e)}")
            self.logger.debug(f"Raw response: {response.text[:1000]}")
            calendar_months = []
        
        snapshot_date = datetime.utcnow().date()
        
        for month in calendar_months:
            for day in month.get('days', []):
                check_date = day.get('calendarDate')
                if not check_date:
                    continue
                
                loader = ItemLoader(item=ShortStayAvailabilityItem())
                
                loader.add_value('listing_external_id', listing_id)
                loader.add_value('platform', 'airbnb')
                loader.add_value('source_slug', 'airbnb')
                loader.add_value('source_name', 'Airbnb')
                loader.add_value('check_date', check_date)
                loader.add_value('snapshot_date', snapshot_date.isoformat())
                loader.add_value('country', 'Ghana')
                
                loader.add_value('is_available', day.get('available', False))
                loader.add_value('min_nights', day.get('minNights', 1))
                loader.add_value('max_nights', day.get('maxNights', 365))
                
                # Validation fields
                loader.add_value('source_id', f"{listing_id}_{check_date}")
                loader.add_value('source_url', response.url) # Listing page is the source
                loader.add_value('title', f"Availability for {listing_id} on {check_date}")
                
                # Pricing
                price = day.get('price', {})
                price_usd = price.get('amount') if price else None
                if price_usd:
                    loader.add_value('price_per_night_usd', price_usd)
                    loader.add_value('currency', 'USD')
                
                loader.add_value('extracted_data', day)
                loader.add_value('scraped_at', datetime.utcnow().isoformat())
                
                self.availability_snapshots += 1
                yield loader.load_item()
    
    def _extract_listing_data_from_scripts(self, response) -> dict:
        """Extract listing data from embedded JSON in script tags."""
        # Priority 1: Check data-deferred-state scripts (New Airbnb Structure)
        deferred_scripts = response.css('script[id^="data-deferred-state"]::text').getall()
        
        for script_content in deferred_scripts:
            try:
                data = json.loads(script_content)
                if 'niobeClientData' in data:
                    self.logger.info("Found niobeClientData in deferred state script")
                    # Try to normalize this data directly
                    normalized_data = self._normalize_niobe_data(data)
                    if normalized_data:
                        return {'pdp_listing_detail': normalized_data}
            except json.JSONDecodeError:
                continue

        # Priority 2: Fallback to old regex method
        # ... (keep existing fallback logic if needed, or simplify)
        script_data = response.css('script[data-state]::text').get()
        if not script_data:
            scripts = response.css('script::text').getall()
            for script in scripts:
                if 'pdp_listing_detail' in script or '"listing":' in script:
                    script_data = script
                    break
        
        if script_data:
            try:
                json_match = re.search(r'\{.*\}', script_data, re.DOTALL)
                if json_match:
                    old_data = json.loads(json_match.group(0))
                    # Attempt to find pdp_listing_detail in old structure
                    detail = self._find_legacy_pdp_listing_detail(old_data)
                    return {'pdp_listing_detail': detail} if detail else {}
            except json.JSONDecodeError:
                pass
        
        return {}

    def _extract_api_key(self, response) -> Optional[str]:
        """Extract Airbnb API key from response content."""
        # Method 1: Search in data-deferred-state scripts
        deferred_scripts = response.css('script[id^="data-deferred-state"]::text').getall()
        for script in deferred_scripts:
            # Look for api_config or key directly
            key_match = re.search(r'"key"\s*:\s*"([a-zA-Z0-9]{32})"', script)
            if key_match:
                return key_match.group(1)
                
        # Method 2: Search in any script tag
        scripts = response.css('script::text').getall()
        for script in scripts:
            key_match = re.search(r'"api_config"\s*:\s*\{[^}]*"key"\s*:\s*"([a-zA-Z0-9]{32})"', script)
            if key_match:
                return key_match.group(1)
            
            # Direct key search as fallback
            key_match = re.search(r'"key"\s*:\s*"([a-zA-Z0-9]{32})"', script)
            if key_match:
                return key_match.group(1)
        
        return None


    def _normalize_niobe_data(self, data):
        """Normalize niobeClientData into the flat structure expected by parse_listing."""
        try:
            # Navigate to the main container
            # Expected path: niobeClientData[0][1]['data']['presentation']['stayProductDetailPage']['sections']
            client_data = data.get('niobeClientData', [])
            if not client_data or not isinstance(client_data, list):
                return None
            
            # Usually the relevant data is in the first element's query result
            details_container = None
            for item in client_data:
                try:
                    candidate = item[1].get('data', {}).get('presentation', {}).get('stayProductDetailPage', {})
                    if candidate and 'sections' in candidate:
                        details_container = candidate['sections']
                        break
                except (IndexError, AttributeError):
                    continue
            
            if not details_container:
                return None
                
            # Helpers to extract from sections
            sections_list = details_container.get('sections', [])
            metadata = details_container.get('metadata', {})
            logging_data = metadata.get('loggingContext', {}).get('eventDataLogging', {})
            
            def find_section(section_id):
                for s in sections_list:
                    if s.get('sectionId') == section_id:
                        return s.get('section', {})
                return {}

            # Construct the flat dictionary
            normalized = {}
            
            # 1. Basic Info
            section_title = find_section('TITLE_DEFAULT')
            normalized['name'] = section_title.get('title') if section_title else metadata.get('pageTitle')
            normalized['lat'] = logging_data.get('listingLat')
            normalized['lng'] = logging_data.get('listingLng')
            normalized['person_capacity'] = logging_data.get('personCapacity')
            normalized['star_rating'] = logging_data.get('guestSatisfactionOverall')
            normalized['review_count'] = logging_data.get('visibleReviewCount')
            normalized['room_and_property_type'] = logging_data.get('roomType') # e.g. "Entire home/apt"
            
            # 2. Host Info
            host_section = find_section('MEET_YOUR_HOST')
            if host_section:
                card_data = host_section.get('cardData', {})
                normalized['primary_host'] = {
                    'id': card_data.get('userId'),
                    'name': card_data.get('name'),
                    'is_superhost': 'Superhost' in (host_section.get('subtitle') or '')
                }
            
            # 3. Bedrooms/Bathrooms from Description items or reliable parsing
            # Try to find OVERVIEW_DEFAULT_V2 or TITLE_DEFAULT sharingConfig
            sharing_title = metadata.get('sharingConfig', {}).get('title', '')
            
            # Simple regex parser for extraction
            import re
            normalized['bedrooms'] = 0
            normalized['bathrooms'] = 0
            
            if sharing_title:
                bed_match = re.search(r'(\d+)\s+bedroom', sharing_title)
                bath_match = re.search(r'(\d+\.?\d*)\s+bath', sharing_title)
                if bed_match:
                    normalized['bedrooms'] = int(bed_match.group(1))
                if bath_match:
                    normalized['bathrooms'] = float(bath_match.group(1))
            
            # 4. Amenities
            amenities_section = find_section('AMENITIES_DEFAULT')
            amenities_list = []
            if amenities_section:
                amenity_groups = amenities_section.get('previewAmenitiesGroups', [])
                for group in amenity_groups:
                    for amenity in group.get('amenities', []):
                        if isinstance(amenity, dict):
                            amenities_list.append({'name': amenity.get('title')})
            normalized['listing_amenities'] = amenities_list

            return normalized

        except Exception as e:
            self.logger.error(f"Error normalizing niobe data: {e}")
            return None

    def _find_legacy_pdp_listing_detail(self, data):
        """Recursively search for pdp_listing_detail in legacy data."""
        if isinstance(data, dict):
            if 'pdp_listing_detail' in data:
                return data['pdp_listing_detail']
            for value in data.values():
                found = self._find_legacy_pdp_listing_detail(value)
                if found: return found
        elif isinstance(data, list):
            for item in data:
                found = self._find_legacy_pdp_listing_detail(item)
                if found: return found
        return None
    
    def _normalize_property_type(self, raw_type: str) -> str:
        """Normalize Airbnb property type to standard values."""
        raw_lower = raw_type.lower() if raw_type else ''
        
        if 'entire' in raw_lower and ('home' in raw_lower or 'apartment' in raw_lower or 'condo' in raw_lower):
            return 'entire_home'
        elif 'private' in raw_lower and 'room' in raw_lower:
            return 'private_room'
        elif 'shared' in raw_lower:
            return 'shared_room'
        else:
            return 'entire_home'  # Default
    
    def errback_handler(self, failure):
        """Handle request failures."""
        self.logger.error(f"Request failed: {failure.request.url}, error: {failure.value}")
    
    def closed(self, reason):
        """Called when spider closes."""
        self.logger.info(
            f"Airbnb Ghana spider closed. "
            f"Reason: {reason}. "
            f"Listings: {self.listing_count}. "
            f"Availability snapshots: {self.availability_snapshots}."
        )
