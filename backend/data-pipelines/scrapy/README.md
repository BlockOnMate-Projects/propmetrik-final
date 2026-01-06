# Propmetrik Scrapers

Python-based web scrapers for collecting Ghana real estate property listings from various sources.

## 🎯 Overview

This Scrapy project contains spiders for scraping property listings from Ghana's major real estate websites:

| Spider | Source | Trust Score | Description |
|--------|--------|-------------|-------------|
| `meqasa` | [meqasa.com](https://meqasa.com) | 0.65 | Ghana's premier property listing platform |
| `gpc` | [ghanapropertycentre.com](https://ghanapropertycentre.com) | 0.65 | Major property listing site |
| `housemaster` | [housemaster.com.gh](https://housemaster.com.gh) | 0.65 | Property listings platform |
| `realtor_international` | [realtorgh.com](https://realtorgh.com) | 0.65 | Agent listings platform |


## 📁 Project Structure

```
scrapy/
├── propmetrik_scrapers/
│   ├── __init__.py
│   ├── settings.py           # Scrapy configuration
│   ├── items.py              # Item definitions
│   ├── middlewares.py        # Custom middlewares
│   ├── pipelines.py          # Item processing pipelines
│   └── spiders/
│       ├── __init__.py
│       ├── base.py           # Base spider class
│       ├── meqasa.py         # Meqasa spider
│       ├── gpc.py            # Ghana Property Centre spider
│       ├── housemaster.py    # Housemaster spider
│       └── realtor_international.py # Realtor International spider

├── scrapy.cfg
├── requirements.txt
├── run_spider.py             # CLI runner script
├── .env.example
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Python 3.9+
- pip
- PostgreSQL (for storing data)
- OpenSearch (for search indexing)
- Redis (for deduplication)

### Installation

1. Create a virtual environment:
   ```bash
   cd backend/data-pipelines/scrapy
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

## 📖 Usage

### Using the Runner Script

```bash
# Run a single spider
python run_spider.py meqasa

# Run multiple spiders
python run_spider.py meqasa gpc

# Run all spiders
python run_spider.py all

# With filters
python run_spider.py meqasa --listing-type rent
python run_spider.py gpc --region accra

# Output to file
python run_spider.py meqasa --output properties.jsonl
```

### Using Scrapy Directly

```bash
# Run a spider
scrapy crawl meqasa

# With arguments
scrapy crawl meqasa -a listing_type=rent -a max_pages=10

# Output to file
scrapy crawl meqasa -o properties.json

# List available spiders
scrapy list
```



### Spider Arguments

| Argument | Description | Values |
|----------|-------------|--------|
| `listing_type` | Filter by listing type | `sale`, `rent` |
| `property_type` | Filter by property type | `house`, `apartment`, `land`, `commercial` |
| `region` | Filter by region | `accra`, `kumasi`, etc. |
| `max_pages` | Maximum pages to scrape | integer |
| `start_page` | Page number to start from | integer |

## 🔧 Configuration

### Settings (settings.py)

Key settings you may want to adjust:

```python
# Request delays
DOWNLOAD_DELAY = 2
CONCURRENT_REQUESTS_PER_DOMAIN = 4

# AutoThrottle (automatic rate limiting)
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_TARGET_CONCURRENCY = 2.0

# HTTP caching
HTTPCACHE_ENABLED = True
HTTPCACHE_EXPIRATION_SECS = 86400  # 24 hours

# Spider limits
CLOSESPIDER_ITEMCOUNT = 10000  # Max items per run
CLOSESPIDER_TIMEOUT = 14400    # 4 hours max
```

### Item Pipelines

The following pipelines process scraped items in order:

1. **ValidationPipeline** (100) - Validates required fields
2. **CleaningPipeline** (200) - Normalizes and cleans data
3. **GeocodingPipeline** (300) - Geocodes addresses
4. **DuplicateFilterPipeline** (400) - Redis-based deduplication
5. **PostgresPipeline** (500) - Stores in PostgreSQL
6. **OpenSearchPipeline** (600) - Indexes in OpenSearch

## 📊 Data Schema

Each scraped property includes:

```python
PropertyItem:
    # Identifiers
    source_id           # Unique ID from source
    source_url          # Original listing URL
    source_name         # Source website name
    source_slug         # Source identifier (meqasa, gpc, etc.)
    
    # Basic details
    title               # Property title
    description         # Full description
    property_type       # house, apartment, land, commercial
    listing_type        # sale, rent, short_term
    
    # Pricing
    price               # Numeric price
    currency            # GHS, USD, EUR, GBP
    price_usd           # Calculated USD equivalent
    price_ghs           # Calculated GHS equivalent
    
    # Location
    address             # Full address
    city                # City name
    region              # Ghana region
    neighborhood        # Specific area
    latitude            # GPS latitude
    longitude           # GPS longitude
    
    # Features
    bedrooms            # Number of bedrooms
    bathrooms           # Number of bathrooms
    parking_spaces      # Parking spots
    land_size_sqm       # Land area in sqm
    building_size_sqm   # Building area in sqm
    
    # Media
    images              # List of image URLs
    
    # Amenities
    amenities           # List of amenities
    
    # Agent/Seller
    agent_name          # Contact name
    agent_phone         # Contact phone
    agent_company       # Agency name
    
    # Metadata
    scraped_at          # Timestamp of scraping
    data_quality_score  # Quality score (0-1)
```

## 🔄 Integration with Propmetrik

The scrapers integrate with the Propmetrik backend via:

1. **PostgreSQL** - Direct insertion into `properties` table
2. **OpenSearch** - Full-text search indexing
3. **Redis** - Deduplication cache
4. **API** - Geocoding via `/api/v1/data-hub/geocode`

### ETL Job Integration

Spiders can be triggered via the Data Hub ETL system:

```typescript
// Trigger from backend
await etlJobService.create({
  source_id: 'meqasa-source-uuid',
  job_type: 'full_sync',
  initiated_by: 'system',
  config: {
    max_pages: 50,
    listing_type: 'sale',
  }
});
```

## 🧪 Testing

```bash
# Run tests
pytest tests/

# With coverage
pytest tests/ --cov=propmetrik_scrapers

# Test a single spider
scrapy check meqasa
```

## 📝 Adding a New Spider

1. Create a new spider file in `propmetrik_scrapers/spiders/`:

```python
from .base import BasePropertySpider

class NewSiteSpider(BasePropertySpider):
    name = 'newsite'
    source_name = 'New Site Name'
    source_slug = 'newsite'
    trust_score = 0.60
    
    allowed_domains = ['newsite.com']
    
    def start_requests(self):
        # Generate initial requests
        pass
    
    def parse_listing(self, response):
        # Parse listing page
        pass
    
    def parse_property(self, response):
        # Parse individual property
        pass
```

2. Add to `spiders/__init__.py`
3. Add data source entry to database

## ⚠️ Responsible Scraping

- All spiders respect `robots.txt`
- Rate limiting is enforced (2-3 seconds between requests)
- AutoThrottle adjusts based on server response
- HTTP caching reduces duplicate requests
- User-Agent identifies the bot

## 📄 License

Proprietary - Propmetrik/Cedyn Group
