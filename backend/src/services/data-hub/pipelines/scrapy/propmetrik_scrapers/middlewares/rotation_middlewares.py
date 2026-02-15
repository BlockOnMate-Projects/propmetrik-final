# -*- coding: utf-8 -*-
"""
User Agent and Proxy Rotation Middlewares
"""
import logging
import random

from scrapy.exceptions import NotConfigured

logger = logging.getLogger(__name__)


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
            # Use default user agents if none configured
            user_agents = [
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
            ]
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