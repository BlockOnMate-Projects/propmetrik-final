# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - Ownkey Spider

Ownkey (ownkey.com/gh) is a curated Ghana property portal built as a Next.js App
Router app. Listing pages are server-rendered, but the data lives in the React
Server Component stream (self.__next_f) as an escaped JSON payload of the shape:

    {"total_rows": N, "total_pages": M, "data": [ {id, slug, name, generated_title,
      price, currency, leasing, location:{city,suburb,district,street_address,...}}, ... ]}

We fetch each /gh/{buy|rent}/{type}/{location} page, un-escape the RSC, extract that
JSON blob and yield a PropertyItem per listing. No headless browser or proxy needed.
"""
import re
import json
import logging
from typing import Generator, Optional

from scrapy import Request
from scrapy.http import Response

from propmetrik_scrapers.items import PropertyItem
from .base import BasePropertySpider

logger = logging.getLogger(__name__)


class OwnkeySpider(BasePropertySpider):
    name = 'ownkey'
    source_name = 'Ownkey Ghana'
    source_slug = 'ownkey'
    trust_score = 0.70

    allowed_domains = ['ownkey.com']
    BASE = 'https://ownkey.com'
    LOCATION_SITEMAP = 'https://ownkey.com/gh/location/sitemap.xml'
    PROPERTY_TYPES = [
        'house', 'apartment', 'land', 'townhouse', 'office',
        'commercial', 'shop', 'warehouse',
    ]
    # Fallback localities if the sitemap can't be read.
    FALLBACK_LOCATIONS = ['accra', 'tema', 'kumasi', 'takoradi', 'east-legon', 'spintex']

    custom_settings = {
        'DOWNLOAD_DELAY': 1,
        'CONCURRENT_REQUESTS_PER_DOMAIN': 4,
        'ROBOTSTXT_OBEY': True,
    }

    # ── entry: discover locations, then sweep ────────────────────────────

    def start_requests(self) -> Generator[Request, None, None]:
        yield Request(self.LOCATION_SITEMAP, callback=self.parse_locations,
                      errback=self.errback_handler, dont_filter=True)

    def parse_locations(self, response: Response) -> Generator[Request, None, None]:
        locations = sorted(set(re.findall(r'/gh/location/([a-z0-9\-]+)', response.text)))
        # drop obvious non-location entries
        locations = [l for l in locations if l not in ('sitemap', '')] or self.FALLBACK_LOCATIONS
        if self.region_filter:
            locations = [self.region_filter]

        if self.listing_type_filter == 'sale':
            contracts = ['buy']
        elif self.listing_type_filter == 'rent':
            contracts = ['rent']
        else:
            contracts = ['buy', 'rent']

        logger.info(f"Ownkey: sweeping {len(contracts)} contracts × {len(self.PROPERTY_TYPES)} types × "
                    f"{len(locations)} locations")
        for contract in contracts:
            for ptype in self.PROPERTY_TYPES:
                for loc in locations:
                    yield Request(
                        f"{self.BASE}/gh/{contract}/{ptype}/{loc}",
                        callback=self.parse_category,
                        meta={'contract': contract, 'ptype': ptype, 'loc': loc, 'page': 1},
                        errback=self.errback_handler,
                    )

    # ── RSC JSON extraction ──────────────────────────────────────────────

    @staticmethod
    def _extract(html: str):
        """Return (total_rows, total_pages, [listing dicts]) from the RSC stream."""
        txt = html.replace('\\"', '"').replace('\\\\', '\\')
        m = re.search(r'"total_rows":(\d+),"total_pages":(\d+),"data":\[', txt)
        if not m:
            return 0, 0, []
        total, pages = int(m.group(1)), int(m.group(2))
        # scan back to the enclosing '{' then brace-match the object
        s = m.start()
        while s > 0 and txt[s] != '{':
            s -= 1
        depth, end = 0, None
        for i in range(s, min(len(txt), s + 5_000_000)):
            c = txt[i]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if not end:
            return total, pages, []
        try:
            return total, pages, json.loads(txt[s:end]).get('data', [])
        except (ValueError, TypeError):
            return total, pages, []

    def parse_category(self, response: Response) -> Generator:
        contract = response.meta['contract']
        ptype = response.meta['ptype']
        loc = response.meta['loc']
        page = response.meta['page']

        total, pages, listings = self._extract(response.text)
        if listings:
            logger.info(f"Ownkey: {len(listings)} listings on {contract}/{ptype}/{loc} "
                        f"(page {page}/{pages or 1}, total_rows={total})")
        for raw in listings:
            item = self._item_from_listing(raw, response)
            if item is not None:
                self.items_scraped += 1
                yield item

        # pagination
        if page < (pages or 1) and (not self.max_pages or page < int(self.max_pages)):
            yield Request(
                f"{self.BASE}/gh/{contract}/{ptype}/{loc}?page={page + 1}",
                callback=self.parse_category,
                meta={**response.meta, 'page': page + 1},
                errback=self.errback_handler,
            )

    def _item_from_listing(self, raw: dict, response: Response) -> Optional[PropertyItem]:
        if not isinstance(raw, dict):
            return None
        price = raw.get('price')
        if not price:
            return None  # no price → skip (NOT NULL)

        contract = response.meta['contract']
        ptype = response.meta['ptype']
        loc_meta = response.meta['loc']
        location = raw.get('location') or {}
        slug = raw.get('slug') or str(raw.get('id'))
        title = raw.get('generated_title') or raw.get('name') or slug.replace('-', ' ')
        url = raw.get('url') or raw.get('href') or f"{self.BASE}/gh/{contract}/{ptype}/{loc_meta}/{slug}"

        loader = self.create_item_loader(response)
        loader.replace_value('source_url', url if url.startswith('http') else f"{self.BASE}{url}")
        loader.add_value('source_id', str(raw.get('id')))
        loader.add_value('title', title.strip())

        leasing = (raw.get('leasing') or '').upper()
        loader.add_value('listing_type', 'rent' if 'RENT' in leasing else 'sale')
        loader.add_value('price', str(price))
        loader.add_value('currency', raw.get('currency') or 'GHS')
        loader.add_value('property_type', self.normalize_property_type(ptype))

        mb = re.search(r'(\d+)\s*bed', title, re.I)
        if mb:
            loader.add_value('bedrooms', int(mb.group(1)))
        mba = re.search(r'(\d+)\s*bath', title, re.I)
        if mba:
            loader.add_value('bathrooms', int(mba.group(1)))

        city = location.get('city') or loc_meta.replace('-', ' ')
        suburb = location.get('suburb') or location.get('district')
        loader.add_value('region', city)
        loader.add_value('city', city)
        loader.add_value('address', location.get('street_address') or suburb or city)
        if suburb:
            loader.add_value('neighborhood', suburb)
        loader.add_value('country', 'Ghana')
        return loader.load_item()
