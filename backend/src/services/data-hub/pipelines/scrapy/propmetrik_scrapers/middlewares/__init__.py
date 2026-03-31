"""
PROPMETRIK Scrapers Middlewares Package
"""

from .basic_middlewares import PROPMETRIKSpiderMiddleware, PROPMETRIKDownloaderMiddleware
from .rotation_middlewares import RotatingUserAgentMiddleware, ProxyMiddleware

# SeleniumMiddleware requires selenium + Chrome — import lazily so spiders
# that don't need it (the majority) are not blocked by the missing dep.
try:
    from .selenium_middleware import SeleniumMiddleware
except ImportError:
    SeleniumMiddleware = None  # type: ignore[assignment,misc]

__all__ = [
    'PROPMETRIKSpiderMiddleware',
    'PROPMETRIKDownloaderMiddleware',
    'RotatingUserAgentMiddleware',
    'ProxyMiddleware',
    'SeleniumMiddleware',
]