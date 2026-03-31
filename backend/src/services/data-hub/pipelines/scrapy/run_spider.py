#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - Runner Script

Command-line interface for running property spiders.

Usage:
    python run_spider.py meqasa
    python run_spider.py gpc --listing-type rent
    python run_spider.py housemaster --max-pages 10
    python run_spider.py all --region accra
"""
import os
import sys
import argparse
import logging
from datetime import datetime
from typing import List, Optional

# Load .env before anything else reads env vars
from dotenv import load_dotenv
_script_dir = os.path.dirname(os.path.abspath(__file__))
# backend/.env is 5 levels up: scrapy → pipelines → data-hub → services → src → backend
_backend_env = os.path.join(_script_dir, '..', '..', '..', '..', '..', '.env')
load_dotenv(os.path.normpath(_backend_env), override=False)

# Add project root to path
sys.path.insert(0, _script_dir)

from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Available spiders
AVAILABLE_SPIDERS = [
    'meqasa',
    'gpc',
    'housemaster',
    'realtor_international',
    'airbnb_ghana',
    'daily_graphic_legal',
    'tonaton',
]

# Aliases for spider names (for .env compatibility)
SPIDER_ALIASES = {
    'realtor': 'realtor_international',
}


def get_spider_class(spider_name: str):
    """Get spider class by name."""
    from propmetrik_scrapers.spiders import (
        MeqasaSpider,
        GhanaPropertyCentreSpider,
        HouseMasterSpider,
        RealtorInternationalSpider,
        AirbnbGhanaSpider,
        DailyGraphicLegalSpider,
        TonatonSpider,
    )
    
    # Resolve alias if present
    spider_name = SPIDER_ALIASES.get(spider_name, spider_name)
    
    spider_map = {
        'meqasa': MeqasaSpider,
        'gpc': GhanaPropertyCentreSpider,
        'housemaster': HouseMasterSpider,
        'realtor_international': RealtorInternationalSpider,
        'airbnb_ghana': AirbnbGhanaSpider,
        'daily_graphic_legal': DailyGraphicLegalSpider,
        'tonaton': TonatonSpider,
    }
    
    return spider_map.get(spider_name)


def run_spiders(
    spider_names: List[str],
    listing_type: Optional[str] = None,
    property_type: Optional[str] = None,
    region: Optional[str] = None,
    max_pages: Optional[int] = None,
    output_file: Optional[str] = None,
):
    """Run specified spiders with given options."""
    
    # Get Scrapy settings
    settings = get_project_settings()
    
    # Override settings if output file specified
    if output_file:
        settings.set('FEEDS', {
            output_file: {
                'format': 'jsonlines',
                'encoding': 'utf8',
                'store_empty': False,
                'item_export_kwargs': {
                    'indent': None,
                },
            },
        })
    
    # Create crawler process
    process = CrawlerProcess(settings)
    
    # Build spider arguments
    spider_kwargs = {}
    if listing_type:
        spider_kwargs['listing_type'] = listing_type
    if property_type:
        spider_kwargs['property_type'] = property_type
    if region:
        spider_kwargs['region'] = region
    if max_pages:
        spider_kwargs['max_pages'] = max_pages
    
    # Add spiders to process
    for spider_name in spider_names:
        spider_class = get_spider_class(spider_name)
        if spider_class:
            logger.info(f"Adding spider: {spider_name} with kwargs: {spider_kwargs}")
            process.crawl(spider_class, **spider_kwargs)
        else:
            logger.warning(f"Unknown spider: {spider_name}")
    
    # Run all spiders
    logger.info(f"Starting crawl at {datetime.utcnow().isoformat()}")
    process.start()
    logger.info(f"Crawl completed at {datetime.utcnow().isoformat()}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Run PROPMETRIK property scrapers',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python run_spider.py meqasa
    python run_spider.py meqasa gpc --listing-type rent
    python run_spider.py all --max-pages 5
    python run_spider.py housemaster --region accra --output output.jsonl
        """
    )
    
    parser.add_argument(
        'spiders',
        nargs='+',
        choices=AVAILABLE_SPIDERS + ['all'],
        help='Spider(s) to run. Use "all" to run all spiders.'
    )
    
    parser.add_argument(
        '--listing-type', '-l',
        choices=['sale', 'rent'],
        help='Filter by listing type'
    )
    
    parser.add_argument(
        '--property-type', '-p',
        choices=['house', 'apartment', 'land', 'commercial'],
        help='Filter by property type'
    )
    
    parser.add_argument(
        '--region', '-r',
        help='Filter by region (e.g., accra, kumasi)'
    )
    
    parser.add_argument(
        '--max-pages', '-m',
        type=int,
        help='Maximum number of pages to scrape per spider'
    )
    
    parser.add_argument(
        '--output', '-o',
        help='Output file path (JSON Lines format)'
    )
    
    parser.add_argument(
        '--scrape-type', '-s',
        choices=['full', 'update'],
        default='update',
        help='Scrape type: "full" for all pages, "update" for recent only'
    )

    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose logging'
    )

    args = parser.parse_args()

    # Set log level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Determine which spiders to run
    spider_names = AVAILABLE_SPIDERS if 'all' in args.spiders else args.spiders

    # Apply scrape-type defaults if max_pages not explicitly set
    if args.max_pages is None and args.scrape_type == 'update':
        args.max_pages = 10

    logger.info(f"Running spiders: {spider_names} (scrape_type={args.scrape_type})")

    # Run spiders
    run_spiders(
        spider_names=spider_names,
        listing_type=args.listing_type,
        property_type=args.property_type,
        region=args.region,
        max_pages=args.max_pages,
        output_file=args.output,
    )


if __name__ == '__main__':
    main()
