"""
Application Configuration
Environment-based configuration with Ghana-specific defaults
"""

from pydantic import Field, PostgresDsn
from pydantic_settings import BaseSettings
from typing import Dict, Optional, List
import os

try:
    from .schemas import GhanaRegion, ValuationMethod
except ImportError:
    from schemas import GhanaRegion, ValuationMethod


class Settings(BaseSettings):
    """Application settings with Ghana-specific defaults"""
    
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
        "http://localhost:4000/api/data-hub", 
        alias='DATA_HUB_API_URL'
    )
    data_hub_api_timeout: int = Field(30, env='DATA_HUB_API_TIMEOUT')
    
    # Security Configuration
    secret_key: str = Field("dev-secret-key-change-in-production", env='SECRET_KEY')
    access_token_expire_minutes: int = Field(30, env='ACCESS_TOKEN_EXPIRE_MINUTES')
    api_debug: bool = Field(False, env='API_DEBUG')
    
    # CORS Configuration
    cors_origins: List[str] = Field(
        ["http://localhost:3000", "http://localhost:3001"], 
        env='CORS_ORIGINS'
    )
    
    # Ghana Market Configuration
    default_comparable_radius_km: float = Field(5.0, env='DEFAULT_COMPARABLE_RADIUS_KM')
    default_comparable_age_days: int = Field(365, env='DEFAULT_COMPARABLE_AGE_DAYS')
    min_comparables_required: int = Field(3, env='MIN_COMPARABLES_REQUIRED')
    max_comparables_to_analyze: int = Field(20, env='MAX_COMPARABLES_TO_ANALYZE')
    
    # Regional Pricing Multipliers (can be overridden via environment)
    regional_multipliers: Dict[str, float] = Field(default={
        "greater_accra": 1.30,
        "kumasi_metro": 1.00,
        "eastern": 1.00,
        "western_cluster": 1.00,
        "northern_cluster": 0.70
    })
    
    # Valuation Method Default Weights
    default_method_weights: Dict[str, float] = Field(default={
        "sales_comparison": 0.60,
        "cost_approach": 0.40,
        "income_approach": 0.30,  # When applicable
        "residual_method": 0.50,  # For development sites
        "profits_method": 0.40,   # For income-producing properties
        "drc_method": 0.35        # For specialized properties
    })
    
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
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        
        # Environment variable parsing for complex types
        @classmethod
        def parse_env_var(cls, field_name: str, raw_val: str) -> any:
            if field_name in ['cors_origins']:
                return raw_val.split(',') if raw_val else []
            elif field_name in ['regional_multipliers', 'default_method_weights', 'land_tenure_multipliers']:
                # Parse JSON-like string for dict fields
                import json
                try:
                    return json.loads(raw_val)
                except (json.JSONDecodeError, TypeError):
                    return cls.__fields__[field_name].default
            return raw_val
    
    def get_regional_multiplier(self, region: GhanaRegion) -> float:
        """Get pricing multiplier for a specific region"""
        return self.regional_multipliers.get(region.value, 1.0)
    
    def get_method_weight(self, method: ValuationMethod) -> float:
        """Get default weight for a valuation method"""
        return self.default_method_weights.get(method.value, 0.5)
    
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