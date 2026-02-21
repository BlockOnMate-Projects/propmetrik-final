# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - Scrapy Project Settings

Ghana Real Estate Property Data Collection
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from backend .env for centralized config
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent.parent
ENV_PATH = BACKEND_ROOT / '.env'
load_dotenv(ENV_PATH)

BOT_NAME = "propmetrik_scrapers"

SPIDER_MODULES = ["propmetrik_scrapers.spiders"]
NEWSPIDER_MODULE = "propmetrik_scrapers.spiders"

# Crawl responsibly by identifying yourself (and your website) on the user-agent
USER_AGENT = "PROPMETRIKBot/1.0 (+https://propmetrik.com/bot)"

# Obey robots.txt rules
ROBOTSTXT_OBEY = True

# Configure maximum concurrent requests performed by Scrapy (default: 16)
CONCURRENT_REQUESTS = 8

# Configure a delay for requests for the same website (default: 0)
# See https://docs.scrapy.org/en/latest/topics/settings.html#download-delay
DOWNLOAD_DELAY = 2

# The download delay setting will honor only one of:
CONCURRENT_REQUESTS_PER_DOMAIN = 4
# CONCURRENT_REQUESTS_PER_IP = 4  # Disabled - not supported with default priority queue

# Disable cookies (enabled by default)
COOKIES_ENABLED = True

# Disable Telnet Console (enabled by default)
TELNETCONSOLE_ENABLED = False

# Override the default request headers:
DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
}

# Enable or disable spider middlewares
SPIDER_MIDDLEWARES = {
    "propmetrik_scrapers.middlewares.PROPMETRIKSpiderMiddleware": 543,
}

# Enable or disable downloader middlewares
DOWNLOADER_MIDDLEWARES = {
    "propmetrik_scrapers.middlewares.PROPMETRIKDownloaderMiddleware": 543,
    "propmetrik_scrapers.middlewares.RotatingUserAgentMiddleware": 400,
    "propmetrik_scrapers.middlewares.ProxyMiddleware": 410,
    "propmetrik_scrapers.middlewares.SeleniumMiddleware": 420,
    "scrapy.downloadermiddlewares.retry.RetryMiddleware": 550,
}

# Download handlers for different URL schemes (commented out due to compatibility issues)
# DOWNLOAD_HANDLERS = {
#     "http": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
#     "https": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
# }

# Enable or disable extensions
# EXTENSIONS = {
#    "scrapy.extensions.telnet.TelnetConsole": None,
# }

# Configure item pipelines
# Note: DuplicateFilterPipeline disabled until Redis ACL is configured
ITEM_PIPELINES = {
    "propmetrik_scrapers.pipelines.ValidationPipeline": 100,
    "propmetrik_scrapers.pipelines.CleaningPipeline": 200,
    "propmetrik_scrapers.pipelines.GeocodingPipeline": 300,
    # "propmetrik_scrapers.pipelines.DuplicateFilterPipeline": 400,  # Disabled - Redis ACL issue
    "propmetrik_scrapers.pipelines.PostgresPipeline": 500,
    "propmetrik_scrapers.pipelines.OpenSearchPipeline": 600,
}

# Enable and configure the AutoThrottle extension (disabled by default)
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 2
AUTOTHROTTLE_MAX_DELAY = 30
AUTOTHROTTLE_TARGET_CONCURRENCY = 2.0
AUTOTHROTTLE_DEBUG = False

# Enable and configure HTTP caching (disabled for testing Playwright)
HTTPCACHE_ENABLED = False
# HTTPCACHE_EXPIRATION_SECS = 86400  # 24 hours
# HTTPCACHE_DIR = "httpcache"
# HTTPCACHE_IGNORE_HTTP_CODES = [500, 502, 503, 504, 408]
# HTTPCACHE_STORAGE = "scrapy.extensions.httpcache.FilesystemCacheStorage"

# Set settings whose default value is deprecated to a future-proof value
REQUEST_FINGERPRINTER_IMPLEMENTATION = "2.7"
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
FEED_EXPORT_ENCODING = "utf-8"

# Logging
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s [%(name)s] %(levelname)s: %(message)s"
LOG_DATEFORMAT = "%Y-%m-%d %H:%M:%S"

# Retry settings
RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# Timeout settings
DOWNLOAD_TIMEOUT = 30

# ============================================================================
# DATABASE CONFIGURATION - Using URL-based connection strings
# ============================================================================

# PostgreSQL Configuration (using DATABASE_URL for consistency with backend)
DATABASE_URL = os.getenv("DATABASE_URL", "")

# OpenSearch Configuration (using OPENSEARCH_URL)
OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "https://opensearch.propmetrik.com")
OPENSEARCH_TIMEOUT = int(os.getenv("OPENSEARCH_TIMEOUT", "30"))
OPENSEARCH_USERNAME = os.getenv("OPENSEARCH_USERNAME", "")
OPENSEARCH_PASSWORD = os.getenv("OPENSEARCH_PASSWORD", "")
OPENSEARCH_INDEX_PREFIX = os.getenv("OPENSEARCH_INDEX_PREFIX", "propmetrik_")

# Redis Configuration (using REDIS_URL)
# For scrapy, we use REDIS_DB_QUEUE (db=2) for job queues and deduplication
REDIS_URL = os.getenv("REDIS_URL", "")
REDIS_DB = int(os.getenv("REDIS_DB_QUEUE", 2))  # Use queue DB for scrapy

# Append database number to REDIS_URL if not already specified
if REDIS_URL and "/2" not in REDIS_URL and "?db=" not in REDIS_URL:
    REDIS_URL = f"{REDIS_URL}/2"

# ============================================================================
# GEOCODING CONFIGURATION
# ============================================================================

MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN", "")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

# Rate limiting for geocoding
GEOCODING_RATE_LIMIT = 10  # requests per second
GEOCODING_CACHE_ENABLED = True
GEOCODING_CACHE_TTL = 86400 * 30  # 30 days

# ============================================================================
# PROPMETRIK API CONFIGURATION
# ============================================================================

PROPMETRIK_API_URL = os.getenv("PROPMETRIK_API_URL", "http://localhost:4000")
PROPMETRIK_API_KEY = os.getenv("PROPMETRIK_API_KEY", "")

# ============================================================================
# PROXY CONFIGURATION
# ============================================================================

# Proxy settings for rotating proxies (optional)
PROXY_ENABLED = os.getenv("PROXY_ENABLED", "false").lower() == "true"
PROXY_LIST_URL = os.getenv("PROXY_LIST_URL", "")
PROXY_ROTATION_ENABLED = True

# ============================================================================
# USER AGENT ROTATION
# ============================================================================

USER_AGENT_LIST = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

# ============================================================================
# SPIDER-SPECIFIC SETTINGS
# ============================================================================

# Meqasa.com settings
MEQASA_PAGES_PER_RUN = int(os.getenv("MEQASA_PAGES_PER_RUN", 50))
MEQASA_START_PAGE = int(os.getenv("MEQASA_START_PAGE", 1))

# GhanaPropertyCentre settings
GPC_PAGES_PER_RUN = int(os.getenv("GPC_PAGES_PER_RUN", 50))
GPC_START_PAGE = int(os.getenv("GPC_START_PAGE", 1))



# ============================================================================
# DEDUPLICATION SETTINGS
# ============================================================================

# Disable Redis deduplication filter until Redis ACL is properly configured
# DUPEFILTER_CLASS = "propmetrik_scrapers.middlewares.RedisDupeFilter"
# Use Scrapy's built-in request deduplication instead
DUPEFILTER_DEBUG = True
DUPEFILTER_KEY = "propmetrik:scrapy:dupefilter"  # Key prefix for Redis deduplication

# Similarity threshold for detecting duplicate properties
DUPLICATE_SIMILARITY_THRESHOLD = 0.85

# Fields to use for duplicate detection
DUPLICATE_CHECK_FIELDS = [
    "title",
    "address",
    "price_usd",
    "bedrooms",
    "bathrooms",
    "property_type",
]

# ============================================================================
# CLOSESPIDER SETTINGS
# ============================================================================

# Close spider after certain conditions
CLOSESPIDER_TIMEOUT = 3600 * 4  # 4 hours max
CLOSESPIDER_ITEMCOUNT = 10000  # Max 10000 items per run
CLOSESPIDER_PAGECOUNT = 0  # No page limit
CLOSESPIDER_ERRORCOUNT = 100  # Stop after 100 errors
