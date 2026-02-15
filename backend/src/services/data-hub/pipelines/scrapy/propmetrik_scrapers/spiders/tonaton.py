# -*- coding: utf-8 -*-
"""
Tonaton Spider - DISABLED

This spider has been disabled due to anti-bot protection on tonaton.com.
The site implements aggressive bot detection that blocks scraping attempts.

Status: DISABLED
Reason: Anti-bot protection
Alternative: Manual data collection or API access if available
"""

import scrapy
from .base import BasePropertySpider


class TonatonSpider(BasePropertySpider):
    """
    DISABLED Spider for tonaton.com
    
    This spider is disabled due to anti-bot protection.
    """
    
    name = 'tonaton'
    source_name = 'Tonaton Ghana'
    source_slug = 'tonaton'
    trust_score = 0.55
    
    allowed_domains = ['tonaton.com']
    
    def start_requests(self):
        """Disabled spider - no requests generated."""
        self.logger.warning("Tonaton spider is disabled due to anti-bot protection")
        return
        yield  # Make this a generator function
    
    def parse(self, response):
        """Disabled spider - no parsing performed."""
        self.logger.warning("Tonaton spider is disabled due to anti-bot protection")
        return
        yield  # Make this a generator function
