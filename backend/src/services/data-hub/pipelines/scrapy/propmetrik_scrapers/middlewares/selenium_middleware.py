# -*- coding: utf-8 -*-
"""
Selenium Middleware for Scrapy

Handles JavaScript-heavy websites by rendering pages with a real browser
before passing the HTML to Scrapy for parsing.

If ``selenium`` is not installed the module still exports a no-op
``SeleniumMiddleware`` class so that Scrapy can load it from settings
without crashing.
"""
import logging
from typing import Optional
from urllib.parse import urljoin

from scrapy import signals
from scrapy.http import HtmlResponse, Request
from scrapy.downloadermiddlewares.retry import RetryMiddleware
from scrapy.utils.response import response_status_message

logger = logging.getLogger(__name__)

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait
    from webdriver_manager.chrome import ChromeDriverManager
    _SELENIUM_AVAILABLE = True
except ImportError:
    _SELENIUM_AVAILABLE = False
    logger.info("selenium not installed — SeleniumMiddleware will be a no-op")


class SeleniumMiddleware:
    """
    Scrapy middleware that uses Selenium to render JavaScript-heavy pages.
    
    Only activates for requests that have 'selenium' meta key set to True.
    """
    
    def __init__(self, crawler):
        self.crawler = crawler
        self.driver = None
        self.enabled = _SELENIUM_AVAILABLE and crawler.settings.getbool('SELENIUM_ENABLED', True)
        
    @classmethod
    def from_crawler(cls, crawler):
        """Create middleware instance from crawler."""
        middleware = cls(crawler)
        crawler.signals.connect(middleware.spider_opened, signal=signals.spider_opened)
        crawler.signals.connect(middleware.spider_closed, signal=signals.spider_closed)
        return middleware
        
    def spider_opened(self, spider):
        """Initialize WebDriver when spider opens."""
        if not self.enabled:
            logger.info("Selenium middleware disabled")
            return
            
        logger.info("Starting Chrome WebDriver for spider: %s", spider.name)
        
        # Configure Chrome options for headless browsing
        chrome_options = Options()
        chrome_options.add_argument('--headless')  # Run in background
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--window-size=1920,1080')
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        chrome_options.add_argument('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        try:
            # Use ChromeDriverManager to automatically handle driver installation
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
            
            # Execute script to remove webdriver property
            self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            
            logger.info("Chrome WebDriver successfully initialized")
            
        except Exception as e:
            logger.error("Failed to initialize Chrome WebDriver: %s", e)
            self.driver = None
            
    def spider_closed(self, spider):
        """Clean up WebDriver when spider closes."""
        if self.driver:
            logger.info("Closing Chrome WebDriver for spider: %s", spider.name)
            try:
                self.driver.quit()
            except Exception as e:
                logger.error("Error closing WebDriver: %s", e)
            finally:
                self.driver = None
                
    def process_request(self, request: Request, spider):
        """
        Process request using Selenium if selenium=True in request meta.
        """
        # Only process requests marked for Selenium
        if not request.meta.get('selenium', False):
            return None
            
        if not self.enabled:
            logger.warning("Selenium request made but middleware is disabled")
            return None
            
        if not self.driver:
            logger.error("Selenium request made but WebDriver not available")
            return None
            
        try:
            logger.debug("Processing Selenium request: %s", request.url)
            
            # Load the page
            self.driver.get(request.url)
            
            # Wait for JavaScript content to load
            wait_timeout = request.meta.get('selenium_wait_timeout', 10)
            wait_selector = request.meta.get('selenium_wait_selector')
            
            if wait_selector:
                # Wait for specific element
                try:
                    WebDriverWait(self.driver, wait_timeout).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, wait_selector))
                    )
                    logger.debug("Found selector '%s' on page", wait_selector)
                except Exception as e:
                    logger.warning("Selector '%s' not found within %ds: %s", wait_selector, wait_timeout, e)
            else:
                # Wait for general page load
                WebDriverWait(self.driver, wait_timeout).until(
                    lambda driver: driver.execute_script("return document.readyState") == "complete"
                )
                
            # Additional wait time if specified
            additional_wait = request.meta.get('selenium_additional_wait', 2)
            if additional_wait > 0:
                import time
                time.sleep(additional_wait)
                
            # Get the rendered HTML
            html_content = self.driver.page_source
            
            # Create response object
            response = HtmlResponse(
                url=request.url,
                body=html_content.encode('utf-8'),
                encoding='utf-8',
                request=request
            )
            
            logger.debug("Selenium successfully rendered page: %s", request.url)
            return response
            
        except Exception as e:
            logger.error("Selenium middleware failed for %s: %s", request.url, e)
            # Return None to let other middlewares handle the request
            return None
            
    def process_exception(self, request, exception, spider):
        """Handle exceptions that occur during Selenium processing."""
        if request.meta.get('selenium', False):
            logger.error("Selenium exception for %s: %s", request.url, exception)
            
        # Return None to use default exception handling
        return None