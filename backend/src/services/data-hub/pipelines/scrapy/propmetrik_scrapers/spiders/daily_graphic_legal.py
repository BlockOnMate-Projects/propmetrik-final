# -*- coding: utf-8 -*-
"""
Daily Graphic Legal Notices Spider

Scrapes land dispute legal notices from Daily Graphic newspaper (General News section).
Extracts case details, parties, property information, and location data.

Usage:
    scrapy crawl daily_graphic_legal -a max_pages=10
"""
import scrapy
from scrapy import Request
from itemloaders import ItemLoader
from datetime import datetime
import re
from typing import Generator

from propmetrik_scrapers.critical_data_items import LitigationItem


class DailyGraphicLegalSpider(scrapy.Spider):
    """
    Spider for scraping legal notices from Daily Graphic (https://www.graphic.com.gh).
    
    Now targets 'General News' section as no dedicated 'Legal Notices' page exists.
    Filters articles by keywords like 'Court', 'Suit', 'Notice', 'Land'.
    """
    
    name = "daily_graphic_legal"
    allowed_domains = ["www.graphic.com.gh", "graphic.com.gh"]
    
    custom_settings = {
        'DOWNLOAD_DELAY': 2,
        'CONCURRENT_REQUESTS_PER_DOMAIN': 2,
        'ROBOTSTXT_OBEY': False, # Sometimes robots.txt blocks news
        'USER_AGENT': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36'
    }
    
    # Base URLs
    base_url = "https://www.graphic.com.gh"
    # Fallback to General News since Legal Notices page 404s
    start_urls = ["https://www.graphic.com.gh/news/general-news.html"]
    
    def __init__(self, max_pages=None, start_page=1, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.max_pages = int(max_pages) if max_pages else 50
        self.start_page = int(start_page)
        self.items_scraped = 0
        self.pages_scraped = 0
        
    def start_requests(self) -> Generator[Request, None, None]:
        """Generate initial requests."""
        self.logger.info(f"Starting Daily Graphic scraper on General News (max_pages={self.max_pages})")
        
        for url in self.start_urls:
            yield Request(
                url=url,
                callback=self.parse_listing,
                errback=self.errback_handler,
                meta={'page': self.start_page}
            )
    
    def parse_listing(self, response) -> Generator:
        """
        Parse listing page.
        Extract article links and filter for legal/notice related content.
        """
        page = response.meta.get('page', 1)
        self.pages_scraped += 1
        
        self.logger.info(f"Parsing listing page {page}")
        
        # Debug: Log sample links
        all_links = response.css('a::attr(href)').getall()
        self.logger.info(f"DEBUG: Sample links: {all_links[:5]}")
        
        # General News Selectors - Try broader regex approach first
        # Extract any link that looks like a news article
        article_links_urls = response.css('a::attr(href)').re(r'.*\/news\/.*\.html')
        self.logger.info(f"DEBUG: Found {len(article_links_urls)} links matching /news/ pattern")
        
        article_links = [] # We will populate this manually if css fails OR just use the urls
        
        # If we have regex matches, use them
        if article_links_urls:
             # Create pseudo-objects or just iterate urls directly
             pass
        
        found_relevant = 0
        
        # Iterate over found URLs mixed with selector results
        # Prioritize Regex URLs for reliability
        final_urls = set(article_links_urls)
        
        # Also include CSS selector results if any (redundant but safe)
        css_links = response.css('h3.catItemTitle a::attr(href), .catItemTitle a::attr(href), .item-title a::attr(href)').getall()
        final_urls.update(css_links)
        
        self.logger.info(f"DEBUG: Processing {len(final_urls)} unique article URLs")
        
        found_relevant = 0
        
        for url in final_urls:
            # Title is harder to get without selector, but we check URL keywords
            if not url: continue
                
            full_url = response.urljoin(url)
            url_text = url.lower()
            
            # Keywords to identify potential legal notices or land disputes
            keywords = [
                'legal', 'notice', 'court', 'suit', 'judgment', 'litigation',
                'land', 'dispute', 'plaintiff', 'defendant', 'auction',
                'writ', 'summons', 'injunction', 'trespass', 'police'
            ]
            
            # For logging purposes, let's see what we are skipping
            # self.logger.debug(f"Checking URL: {url}")
            
            if any(k in url_text for k in keywords):
                found_relevant += 1
                yield Request(
                    url=full_url,
                    callback=self.parse_notice,
                    errback=self.errback_handler
                )
        
        self.logger.info(f"Found {found_relevant} relevant articles on page {page}")
        
        # Pagination
        if self.pages_scraped < self.max_pages:
            # Look for 'Next' or page numbers
            next_url = response.css('li.pagination-next a::attr(href), a[title="Next"]::attr(href)').get()
            
            if next_url:
                yield Request(
                    url=response.urljoin(next_url),
                    callback=self.parse_listing,
                    errback=self.errback_handler,
                    meta={'page': page + 1}
                )

    def parse_notice(self, response) -> Generator[LitigationItem, None, None]:
        """
        Parse individual article (potential legal notice).
        """
        self.logger.info(f"Parsing article: {response.url}")
        
        loader = ItemLoader(item=LitigationItem(), response=response)
        
        # Source Info
        loader.add_value('source_name', 'Daily Graphic')
        loader.add_value('source_url', response.url)
        # Generate source_id from URL slug or hash
        import hashlib
        source_id = hashlib.md5(response.url.encode('utf-8')).hexdigest()
        loader.add_value('source_id', source_id)
        
        loader.add_value('spider_name', self.name)
        loader.add_value('scraped_at', datetime.utcnow().isoformat())
        
        # Date
        pub_date = response.css('span.catItemDateCreated::text, .itemDateCreated::text, time::text').get()
        if pub_date:
            loader.add_value('publication_date', pub_date.strip())
        
        # Content
        # Check standard Joomla/CMS article body
        body_parts = response.css('.itemFullText p::text, .itemIntroText p::text, .article-content p::text').getall()
        full_text = ' '.join([t.strip() for t in body_parts if t.strip()])
        
        if not full_text:
            full_text = ' '.join(response.css('div[itemprop="articleBody"] p::text').getall())
            
        full_text = re.sub(r'\s+', ' ', full_text).strip()
        
        # Extract Data
        extracted_data = self._extract_litigation_data(full_text, response)
        
        # Populate Loader
        if extracted_data.get('case_number'): loader.add_value('case_number', extracted_data['case_number'])
        
        # Helper to get title
        title = response.css('h2.itemTitle::text, h1.title::text, h1.entry-title::text, h1.page-header::text, h1::text').get()
        if title:
            loader.add_value('case_title', title.strip())
            loader.add_value('title', title.strip()) # Required by ValidationPipeline
            # Also add to 'case_number' if missing, just to pass legacy validation if any
            # But correct field is case_title
            
        if extracted_data.get('court_name'): loader.add_value('court_name', extracted_data['court_name'])
        if extracted_data.get('plaintiffs'): loader.add_value('plaintiff_names', extracted_data['plaintiffs'])
        if extracted_data.get('defendants'): loader.add_value('defendant_names', extracted_data['defendants'])
        
        # Location & Property
        if extracted_data.get('raw_address'): loader.add_value('raw_address', extracted_data['raw_address'])
        if extracted_data.get('neighborhood'): loader.add_value('neighborhood', extracted_data['neighborhood'])
        if extracted_data.get('city'): loader.add_value('city', extracted_data['city'])
        if extracted_data.get('region'): loader.add_value('region', extracted_data['region'])
        if extracted_data.get('property_description'): loader.add_value('property_description', extracted_data['property_description'])
        
        # Details
        loader.add_value('dispute_type', extracted_data.get('dispute_type', 'other'))
        loader.add_value('status', 'active') # Assume active if published
        if extracted_data.get('judgment_date'): loader.add_value('judgment_date', extracted_data['judgment_date'])
        
        loader.add_value('involves_landguard', extracted_data.get('involves_landguard', False))
        loader.add_value('involves_violence', extracted_data.get('involves_violence', False))
        loader.add_value('extracted_data', extracted_data)
        
        self.items_scraped += 1
        yield loader.load_item()
    
    def _extract_litigation_data(self, text: str, response) -> dict:
        """Extract structured data using regex."""
        data = {}
        
        # Case No
        match = re.search(r'(?:Case|Suit|Writ)\s*No[\.:]?\s*([A-Z0-9/-]+)', text, re.IGNORECASE)
        if match: data['case_number'] = match.group(1).strip()
        
        # Court
        match = re.search(r'(High Court|Circuit Court|District Court|Supreme Court)', text, re.IGNORECASE)
        if match: data['court_name'] = match.group(1).strip()
        
        # Parties (X vs Y)
        match = re.search(r'([A-Z][A-Za-z\s\.]+) (?:VS|Vrs|Versus|Against) ([A-Z][A-Za-z\s\.]+)', text)
        if match:
            data['plaintiffs'] = [match.group(1).strip()]
            data['defendants'] = [match.group(2).strip()]
            
        # Address/Location
        # Simple extraction for major cities
        cities = ['Accra', 'Kumasi', 'Tema', 'Takoradi', 'Tamale']
        for city in cities:
            if city in text:
                data['city'] = city
                break
        
        # Dispute Type
        if 'land' in text.lower():
            if 'guard' in text.lower():
                data['dispute_type'] = 'landguard'
                data['involves_landguard'] = True
            elif 'boundary' in text.lower():
                data['dispute_type'] = 'boundary'
            else:
                data['dispute_type'] = 'land ownership'
        
        return data

    def errback_handler(self, failure):
        self.logger.error(f"Request failed: {failure.request.url}, error: {failure.value}")
