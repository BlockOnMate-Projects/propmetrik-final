"""
Application Configuration
Environment-based configuration with Ghana-specific defaults
"""

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Dict, Optional, List, Union, Any
import os

try:
    from .schemas import GhanaRegion, ValuationMethod
except ImportError:
    from schemas import GhanaRegion, ValuationMethod


class Settings(BaseSettings):
    """Application settings with Ghana-specific defaults"""
    
    # Configure .env file loading
    # Look for .env in current dir, or in the backend root
    model_config = SettingsConfigDict(
        env_file=['.env', '../../../../.env', '../../../../../.env'],
        env_file_encoding='utf-8',
        extra='ignore',
        case_sensitive=False
    )
    
    # Database Configuration - uses DATABASE_URL from .env (same as TypeScript backend)
    database_url: str = Field(
        "postgresql://propmetrik:propmetrik@localhost:5432/propmetrik", 
        alias='DATABASE_URL'
    )
    database_pool_min: int = Field(2, alias='DB_POOL_MIN')
    database_pool_max: int = Field(10, alias='DB_POOL_MAX')
    
    # Redis Configuration
    redis_url: str = Field("redis://localhost:6379/0", env='REDIS_URL')
    redis_cache_ttl: int = Field(3600, env='REDIS_CACHE_TTL')  # 1 hour default
    
    # API Configuration
    api_host: str = Field("0.0.0.0", env='API_HOST')
    api_port: int = Field(8001, env='API_PORT')  # Changed to 8001
    api_workers: int = Field(4, env='API_WORKERS')
    
    # TypeScript Backend Data Hub API (for live construction/labor/economic data)
    data_hub_api_url: str = Field(
        "http://localhost:4000/api/v1/data-hub", 
        alias='DATA_HUB_API_URL'
    )
    data_hub_api_timeout: int = Field(30, env='DATA_HUB_API_TIMEOUT')
    
    # Security Configuration
    secret_key: str = Field("dev-secret-key-change-in-production", env='SECRET_KEY')
    access_token_expire_minutes: int = Field(30, env='ACCESS_TOKEN_EXPIRE_MINUTES')
    api_debug: bool = Field(False, env='API_DEBUG')
    
    # CORS Configuration
    cors_origins: Union[str, List[str]] = Field(
        default=["http://localhost:3000", "http://localhost:3001"], 
        env='CORS_ORIGINS'
    )
    
    @field_validator('cors_origins')
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [i.strip() for i in v.split(",")]
        return v
    
    # Ghana Market Configuration
    default_comparable_radius_km: float = Field(5.0, env='DEFAULT_COMPARABLE_RADIUS_KM')
    default_comparable_age_days: int = Field(365, env='DEFAULT_COMPARABLE_AGE_DAYS')
    min_comparables_required: int = Field(3, env='MIN_COMPARABLES_REQUIRED')
    max_comparables_to_analyze: int = Field(20, env='MAX_COMPARABLES_TO_ANALYZE')

    # Regional pricing multipliers live solely in the sales-comparison path
    # (app/main.py regional_multipliers, keyed by the 5 clusters from
    # _shared._normalize_region). The former copy here + its get_regional_multiplier()
    # reader were dead (never called) and had divergent values — removed.

    # Valuation method reconciliation weights are owned solely by the reconcile
    # endpoint (app/methods/multi_method.py weight_profiles). The former
    # default_method_weights table + get_method_weight() reader here were dead
    # (never called) and a divergent copy — removed for a single source of truth.

    # Confidence Score Thresholds
    high_confidence_threshold: float = Field(0.80, env='HIGH_CONFIDENCE_THRESHOLD')
    medium_confidence_threshold: float = Field(0.60, env='MEDIUM_CONFIDENCE_THRESHOLD')
    
    # Data Quality Requirements
    min_data_quality_score: float = Field(0.60, env='MIN_DATA_QUALITY_SCORE')
    min_source_reliability: float = Field(0.70, env='MIN_SOURCE_RELIABILITY')
    
    # Adjustment Limits
    max_single_adjustment_pct: float = Field(0.50, env='MAX_SINGLE_ADJUSTMENT_PCT')
    max_total_adjustment_pct: float = Field(1.00, env='MAX_TOTAL_ADJUSTMENT_PCT')
    
    # Ghana-Specific Land Tenure Multipliers
    land_tenure_multipliers: Dict[str, float] = Field(default={
        "freehold": 1.10,
        "leasehold": 1.00,
        "stool_land": 0.95,
        "family_land": 0.90,
        "government_land": 0.85
    })
    
    # Logging Configuration
    log_level: str = Field("INFO", env='LOG_LEVEL')
    log_format: str = Field(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        env='LOG_FORMAT'
    )
    
    # External Services
    mapbox_api_key: Optional[str] = Field(None, env='MAPBOX_API_KEY')
    google_maps_api_key: Optional[str] = Field(None, env='GOOGLE_MAPS_API_KEY')
    
    # Performance Settings
    max_concurrent_valuations: int = Field(10, env='MAX_CONCURRENT_VALUATIONS')
    valuation_timeout_seconds: int = Field(300, env='VALUATION_TIMEOUT_SECONDS')  # 5 minutes
    
    # Caching Settings
    cache_valuation_results: bool = Field(True, env='CACHE_VALUATION_RESULTS')
    valuation_cache_ttl: int = Field(86400, env='VALUATION_CACHE_TTL')  # 24 hours
    cache_market_data: bool = Field(True, env='CACHE_MARKET_DATA')
    market_data_cache_ttl: int = Field(3600, env='MARKET_DATA_CACHE_TTL')  # 1 hour
    
    # Development/Testing
    enable_test_routes: bool = Field(False, env='ENABLE_TEST_ROUTES')
    mock_external_services: bool = Field(False, env='MOCK_EXTERNAL_SERVICES')
    
    # Custom parsers for environment variables
    # Note: simple comma-separated list parsing for cors_origins handled by Pydantic V2 if valid JSON or via validation if needed.
    # Complex parsing logic from Pydantic V1 Config.parse_env_var is removed for V2 compatibility.
    
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return os.getenv('ENVIRONMENT', 'development').lower() == 'production'
    
    def is_development(self) -> bool:
        """Check if running in development environment"""
        return os.getenv('ENVIRONMENT', 'development').lower() == 'development'


# Global settings instance
settings = Settings()


# Logging configuration
import logging

def setup_logging():
    """Setup application logging"""
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper()),
        format=settings.log_format,
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler('valuation-engine.log') if settings.is_production() else logging.NullHandler()
        ]
    )
    
    # Set specific loggers
    logging.getLogger('uvicorn').setLevel(logging.INFO)
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    
    # Ghana-specific logger
    logging.getLogger('propmetrik.ghana').setLevel(logging.DEBUG if settings.is_development() else logging.INFO)


# Ghana regional configuration
GHANA_REGIONS_CONFIG = {
    GhanaRegion.GREATER_ACCRA: {
        "name": "Greater Accra Region",
        "major_cities": ["Accra", "Tema", "Kasoa"],
        "economic_tier": "premium",
        "market_maturity": "high",
        "data_availability": "excellent"
    },
    GhanaRegion.KUMASI_METRO: {
        "name": "Kumasi Metropolitan Area",
        "major_cities": ["Kumasi", "Ejisu", "Oforikrom"],
        "economic_tier": "standard",
        "market_maturity": "medium-high",
        "data_availability": "good"
    },
    GhanaRegion.EASTERN: {
        "name": "Eastern Region",
        "major_cities": ["Koforidua", "Akosombo", "Nkawkaw"],
        "economic_tier": "standard",
        "market_maturity": "medium",
        "data_availability": "moderate"
    },
    GhanaRegion.WESTERN_CLUSTER: {
        "name": "Western Cluster",
        "major_cities": ["Takoradi", "Tarkwa", "Cape Coast"],
        "economic_tier": "standard",
        "market_maturity": "medium",
        "data_availability": "moderate"
    },
    GhanaRegion.NORTHERN_CLUSTER: {
        "name": "Northern Cluster",
        "major_cities": ["Tamale", "Bolgatanga", "Wa"],
        "economic_tier": "economy",
        "market_maturity": "low-medium",
        "data_availability": "limited"
    }
}


def get_region_config(region: GhanaRegion) -> dict:
    """Get configuration for a specific Ghana region"""
    return GHANA_REGIONS_CONFIG.get(region, {})


# Valuation constants
class ValuationConstants:
    """Constants used in valuation calculations"""
    
    # Ghana market constants
    TYPICAL_RENTAL_YIELD_RANGE = (4.0, 18.0)  # 4% to 18% annual yield
    TYPICAL_CAPITALIZATION_RATE = (8.0, 15.0)  # 8% to 15%
    STANDARD_VACANCY_RATE = 0.10  # 10% vacancy assumption
    
    # Construction constants
    AVERAGE_BUILDING_LIFE_YEARS = 50
    TYPICAL_DEPRECIATION_RATE = 0.025  # 2.5% per year
    
    # Adjustment constants
    DISTANCE_WEIGHT_DECAY = 0.1  # 10% reduction per km
    TIME_DECAY_FACTOR = 0.002  # 0.2% per day for time adjustments
    
    # Quality thresholds
    MINIMUM_SIMILARITY_SCORE = 0.60
    EXCELLENT_SIMILARITY_SCORE = 0.85
    
    # Market timing
    STALE_DATA_THRESHOLD_DAYS = 180  # 6 months
    VERY_OLD_DATA_THRESHOLD_DAYS = 365  # 1 year