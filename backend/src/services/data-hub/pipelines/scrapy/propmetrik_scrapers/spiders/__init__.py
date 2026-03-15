# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - Spiders Package

Ghana Real Estate Property Spiders
"""
from .base import BasePropertySpider
from .meqasa import MeqasaSpider
from .gpc import GhanaPropertyCentreSpider
from .housemaster import HouseMasterSpider
from .realtor_international import RealtorInternationalSpider
from .airbnb_ghana import AirbnbGhanaSpider
from .daily_graphic_legal import DailyGraphicLegalSpider
from .tonaton import TonatonSpider

__all__ = [
    'BasePropertySpider',
    'MeqasaSpider',
    'GhanaPropertyCentreSpider',
    'HouseMasterSpider',
    'RealtorInternationalSpider',
    'AirbnbGhanaSpider',
    'DailyGraphicLegalSpider',
    'TonatonSpider',
]
