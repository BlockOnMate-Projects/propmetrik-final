# -*- coding: utf-8 -*-
"""
Propmetrik Scrapers - Spiders Package

Ghana Real Estate Property Spiders
"""
from .base import BasePropertySpider
from .meqasa import MeqasaSpider
from .gpc import GhanaPropertyCentreSpider
from .housemaster import HouseMasterSpider
from .realtor_international import RealtorInternationalSpider

__all__ = [
    'BasePropertySpider',
    'MeqasaSpider',
    'GhanaPropertyCentreSpider',
    'HouseMasterSpider',
    'RealtorInternationalSpider',
]
