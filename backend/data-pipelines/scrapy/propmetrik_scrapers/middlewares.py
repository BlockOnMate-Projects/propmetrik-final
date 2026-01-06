# -*- coding: utf-8 -*-
"""
Propmetrik Scrapers - Middlewares

Spider and Downloader Middlewares for handling requests and responses.
"""
import logging
import random
import hashlib
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from scrapy import signals
from scrapy.http import Request, Response
from scrapy.exceptions import IgnoreRequest, NotConfigured
from scrapy.dupefilters import BaseDupeFilter
import redis

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
        """Handle exceptions from spiders."""
        logger.error(f"Spider exception: {exception}", extra={
            'spider': spider.name,
            'url': response.url
        })
    
    def process_start_requests(self, start_requests, spider):
        """Process initial requests."""
        for request in start_requests:
            yield request
    
    def spider_opened(self, spider):
        logger.info(f"Spider opened: {spider.name}")
    
    def spider_closed(self, spider, reason):
        logger.info(f"Spider closed: {spider.name}, reason: {reason}")


class PropmetrikDownloaderMiddleware:
    """
    Downloader middleware for request/response processing.
    """
    
    @classmethod
    def from_crawler(cls, crawler):
        s = cls()
        crawler.signals.connect(s.spider_opened, signal=signals.spider_opened)
        return s
    
    def process_request(self, request, spider):
        """Process each request before sending."""
        # Add timestamp to request meta
        request.meta['request_time'] = datetime.utcnow()
        return None
    
    def process_response(self, request, response, spider):
        """Process each response."""
        # Calculate request duration
        if 'request_time' in request.meta:
            duration = (datetime.utcnow() - request.meta['request_time']).total_seconds()
            logger.debug(f"Request completed in {duration:.2f}s: {request.url}")
        
        # Handle common error responses
        if response.status == 403:
            logger.warning(f"Access forbidden (403): {request.url}")
        elif response.status == 404:
            logger.warning(f"Page not found (404): {request.url}")
        elif response.status == 429:
            logger.warning(f"Rate limited (429): {request.url}")
        elif response.status >= 500:
            logger.warning(f"Server error ({response.status}): {request.url}")
        
        return response
    
    def process_exception(self, request, exception, spider):
        """Handle download exceptions."""
        logger.error(f"Download exception for {request.url}: {exception}")
    
    def spider_opened(self, spider):
        logger.info(f"Downloader middleware enabled for spider: {spider.name}")


class RotatingUserAgentMiddleware:
    """
    Middleware to rotate User-Agent headers for each request.
    """
    
    def __init__(self, user_agents: list):
        self.user_agents = user_agents
    
    @classmethod
    def from_crawler(cls, crawler):
        user_agents = crawler.settings.getlist('USER_AGENT_LIST')
        if not user_agents:
            raise NotConfigured("USER_AGENT_LIST not configured")
        return cls(user_agents)
    
    def process_request(self, request, spider):
        """Assign a random user agent to each request."""
        user_agent = random.choice(self.user_agents)
        request.headers['User-Agent'] = user_agent
        return None


class ProxyMiddleware:
    """
    Middleware to rotate through proxy servers (if configured).
    """
    
    def __init__(self, proxy_enabled: bool, proxy_list: list):
        self.proxy_enabled = proxy_enabled
        self.proxy_list = proxy_list
        self.proxy_index = 0
    
    @classmethod
    def from_crawler(cls, crawler):
        proxy_enabled = crawler.settings.getbool('PROXY_ENABLED', False)
        proxy_list = crawler.settings.getlist('PROXY_LIST', [])
        
        if not proxy_enabled:
            logger.info("Proxy middleware disabled")
            raise NotConfigured("Proxy not enabled")
        
        if not proxy_list:
            logger.warning("Proxy enabled but no proxies configured")
            raise NotConfigured("No proxies configured")
        
        return cls(proxy_enabled, proxy_list)
    
    def process_request(self, request, spider):
        """Assign a proxy to the request."""
        if not self.proxy_list:
            return None
        
        # Round-robin proxy selection
        proxy = self.proxy_list[self.proxy_index % len(self.proxy_list)]
        self.proxy_index += 1
        
        request.meta['proxy'] = proxy
        logger.debug(f"Using proxy: {proxy} for {request.url}")
        return None
    
    def process_exception(self, request, exception, spider):
        """Handle proxy failures."""
        if 'proxy' in request.meta:
            logger.warning(f"Proxy failed: {request.meta['proxy']}, error: {exception}")
            # Could implement proxy blacklisting here


class RedisDupeFilter(BaseDupeFilter):
    """
    Redis-based duplicate filter for distributed crawling.
    Uses Redis sets to track seen URLs across multiple spider instances.
    """
    
    def __init__(self, server: redis.Redis, key: str, debug: bool = False):
        self.server = server
        self.key = key
        self.debug = debug
        self.logger = logging.getLogger(__name__)
    
    @classmethod
    def from_settings(cls, settings):
        # Use REDIS_URL if available (centralized config)
        redis_url = settings.get('REDIS_URL')
        
        if redis_url:
            server = redis.from_url(redis_url, decode_responses=True)
        else:
            # Fallback to individual settings
            host = settings.get('REDIS_HOST', 'localhost')
            port = settings.getint('REDIS_PORT', 6379)
            password = settings.get('REDIS_PASSWORD')
            db = settings.getint('REDIS_DB', 0)
            
            server = redis.Redis(
                host=host,
                port=port,
                password=password,
                db=db,
                decode_responses=True
            )
        
        key = settings.get('DUPEFILTER_KEY', 'scrapy:dupefilter')
        debug = settings.getbool('DUPEFILTER_DEBUG', False)
        
        return cls(server, key, debug)
    
    @classmethod
    def from_crawler(cls, crawler):
        return cls.from_settings(crawler.settings)
    
    def request_seen(self, request: Request) -> bool:
        """Check if request has been seen before."""
        fingerprint = self.request_fingerprint(request)
        added = self.server.sadd(self.key, fingerprint)
        
        if added == 0:  # Already in set
            if self.debug:
                self.logger.debug(f"Duplicate request: {request.url}")
            return True
        return False
    
    def request_fingerprint(self, request: Request) -> str:
        """Generate fingerprint for a request."""
        # Create hash from URL and method
        data = f"{request.method}:{request.url}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]
    
    def close(self, reason: str):
        """Clean up on spider close."""
        # Optionally clear the set for next run
        # self.server.delete(self.key)
        pass
    
    def clear(self):
        """Clear all fingerprints."""
        self.server.delete(self.key)
    
    def log(self, request: Request, spider):
        """Log duplicate."""
        if self.debug:
            self.logger.debug(f"Filtered duplicate: {request.url}")


class RetryWithProxyMiddleware:
    """
    Retry failed requests with different proxies.
    """
    
    max_retry_times = 3
    
    @classmethod
    def from_crawler(cls, crawler):
        return cls()
    
    def process_response(self, request, response, spider):
        """Retry on blocked responses."""
        if response.status in [403, 407, 429]:
            retries = request.meta.get('proxy_retries', 0)
            if retries < self.max_retry_times:
                request.meta['proxy_retries'] = retries + 1
                logger.info(f"Retrying with different proxy ({retries + 1}): {request.url}")
                return request.replace(dont_filter=True)
        return response


class RateLimitMiddleware:
    """
    Custom rate limiting middleware per domain.
    """
    
    def __init__(self, rate_limits: dict):
        self.rate_limits = rate_limits
        self.last_requests = {}
    
    @classmethod
    def from_crawler(cls, crawler):
        rate_limits = {
            'meqasa.com': 2,  # 2 seconds between requests
            'ghanapropertycentre.com': 3,
        }
        return cls(rate_limits)
    
    def process_request(self, request, spider):
        """Add delay based on domain rate limits."""
        domain = urlparse(request.url).netloc
        
        if domain in self.rate_limits:
            import time
            now = time.time()
            last_request = self.last_requests.get(domain, 0)
            wait_time = self.rate_limits[domain] - (now - last_request)
            
            if wait_time > 0:
                time.sleep(wait_time)
            
            self.last_requests[domain] = time.time()
        
        return None
