# -*- coding: utf-8 -*-
"""
Basic Middlewares for Propmetrik Scrapers
"""
import logging
from datetime import datetime

from scrapy import signals

logger = logging.getLogger(__name__)


class PropmetrikSpiderMiddleware:
    """
    Spider middleware to process spider input/output.
    """
    
    @classmethod
    def from_crawler(cls, crawler):
        s = cls()
        crawler.signals.connect(s.spider_opened, signal=signals.spider_opened)
        crawler.signals.connect(s.spider_closed, signal=signals.spider_closed)
        return s
    
    def process_spider_input(self, response, spider):
        """Called for each response that goes through the spider middleware."""
        return None
    
    def process_spider_output(self, response, result, spider):
        """Process spider output (items and requests)."""
        for item_or_request in result:
            if hasattr(item_or_request, 'get'):  # It's an item
                # Add metadata if not present
                if not item_or_request.get('scraped_at'):
                    item_or_request['scraped_at'] = datetime.utcnow().isoformat()
                if not item_or_request.get('spider_name'):
                    item_or_request['spider_name'] = spider.name
            yield item_or_request
    
    def process_spider_exception(self, response, exception, spider):
        """Handle exceptions raised by spider."""
        logger.error(f"Spider exception for {response.url}: {exception}")
        
    def spider_opened(self, spider):
        logger.info(f"Spider middleware enabled for spider: {spider.name}")
    
    def spider_closed(self, spider, reason):
        logger.info(f"Spider middleware closed for spider: {spider.name} (reason: {reason})")


class PropmetrikDownloaderMiddleware:
    """
    Downloader middleware for handling request/response processing.
    """
    
    @classmethod
    def from_crawler(cls, crawler):
        return cls()
    
    def process_request(self, request, spider):
        """Process a download request before it is sent to the downloader."""
        # Add common headers
        request.headers.setdefault('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
        request.headers.setdefault('Accept-Language', 'en-US,en;q=0.5')
        request.headers.setdefault('Accept-Encoding', 'gzip, deflate')
        request.headers.setdefault('DNT', '1')
        request.headers.setdefault('Connection', 'keep-alive')
        return None
    
    def process_response(self, request, response, spider):
        """Process download response."""
        # Log response status for debugging
        if response.status != 200:
            logger.warning(f"Non-200 response ({response.status}): {request.url}")
        elif response.status >= 500:
            logger.warning(f"Server error ({response.status}): {request.url}")
        
        return response
    
    def process_exception(self, request, exception, spider):
        """Handle download exceptions."""
        logger.error(f"Download exception for {request.url}: {exception}")
    
    def spider_opened(self, spider):
        logger.info(f"Downloader middleware enabled for spider: {spider.name}")