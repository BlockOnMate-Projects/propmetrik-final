"""
PROPMETRIK Shared Configuration Module

Centralized configuration for all ML/NLP services.
All secrets are loaded from environment variables.
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class DatabaseConfig(BaseSettings):
    """PostgreSQL database configuration."""
    database_url: Optional[str] = Field(default=None, alias="DATABASE_URL")
    host: str = Field(default="localhost", alias="DB_HOST")
    port: int = Field(default=5432, alias="DB_PORT")
    name: str = Field(default="propmetrik", alias="DB_NAME")
    user: str = Field(default="propmetrik_app", alias="DB_USER")
    password: str = Field(default="", alias="DB_PASSWORD")

    @property
    def url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.name}"

    class Config:
        env_prefix = ""
        populate_by_name = True


class RedisConfig(BaseSettings):
    """Redis configuration."""
    redis_url: Optional[str] = Field(default=None, alias="REDIS_URL")
    host: str = Field(default="localhost", alias="REDIS_HOST")
    port: int = Field(default=6379, alias="REDIS_PORT")
    password: Optional[str] = Field(default=None, alias="REDIS_PASSWORD")
    db: int = Field(default=0, alias="REDIS_DB")

    @property
    def url(self) -> Optional[str]:
        """Return REDIS_URL if set, else build from parts."""
        if self.redis_url:
            return self.redis_url
        if self.password:
            return f"redis://:{self.password}@{self.host}:{self.port}/{self.db}"
        return f"redis://{self.host}:{self.port}/{self.db}"

    class Config:
        env_prefix = ""
        populate_by_name = True


class LLMConfig(BaseSettings):
    """LLM / AI provider configuration."""
    anthropic_api_key: Optional[str] = Field(default=None, alias="ANTHROPIC_API_KEY")
    openai_api_key: Optional[str] = Field(default=None, alias="OPENAI_API_KEY")
    default_provider: str = Field(default="anthropic", alias="LLM_PROVIDER")
    default_model: str = Field(default="claude-sonnet-4-20250514", alias="LLM_MODEL")
    max_tokens: int = Field(default=4096, alias="LLM_MAX_TOKENS")
    temperature: float = Field(default=0.3, alias="LLM_TEMPERATURE")

    class Config:
        env_prefix = ""
        populate_by_name = True


class MLServingConfig(BaseSettings):
    """Top-level ML serving configuration."""
    model_storage_path: str = Field(default="./models", alias="MODEL_STORAGE_PATH")
    prediction_cache_ttl: int = Field(default=3600, alias="PREDICTION_CACHE_TTL")
    max_batch_size: int = Field(default=100, alias="MAX_BATCH_SIZE")
    default_model_version: str = Field(default="latest", alias="DEFAULT_MODEL_VERSION")

    # NLP model paths
    sentiment_model_path: str = Field(
        default="./models/sentiment", alias="SENTIMENT_MODEL_PATH"
    )
    ner_model_path: str = Field(default="./models/ner", alias="NER_MODEL_PATH")

    # Service URLs (for inter-service communication)
    backend_api_url: str = Field(
        default="http://localhost:4000", alias="BACKEND_API_URL"
    )

    # Rate limiting
    max_requests_per_minute: int = Field(default=60, alias="ML_RATE_LIMIT")

    class Config:
        env_prefix = ""
        populate_by_name = True


# Singleton instances
db_config = DatabaseConfig()
redis_config = RedisConfig()
llm_config = LLMConfig()
ml_config = MLServingConfig()
