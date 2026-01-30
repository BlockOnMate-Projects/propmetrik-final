"""
Configuration module for Cedyn E-Signature Platform
All values are sourced from the repository root .env file (single source of truth).

Environment Resolution Order:
1. Root .env (authoritative)
2. OS environment variables
3. Built-in defaults
"""

import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings

# In Docker, .env is not accessible via file path
# Configuration is loaded from environment variables set by docker-compose
ROOT_DIR = Path(__file__).resolve().parent
ENV_FILE = None  # Not used - docker-compose injects env vars


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    Priority: root .env > environment variables > defaults
    """
    
    # Database Configuration (with development fallbacks)
    POSTGRES_USER: str = os.getenv("ESIGN_POSTGRES_USER") or os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("ESIGN_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD", "dev_password_123")
    POSTGRES_DB: str = os.getenv("ESIGN_POSTGRES_DB") or os.getenv("POSTGRES_DB_ESIGN", "esign_db")
    POSTGRES_HOST: str = os.getenv("ESIGN_POSTGRES_HOST") or os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: int = int(os.getenv("ESIGN_POSTGRES_PORT") or os.getenv("POSTGRES_PORT", "5432"))
    
    @property
    def DATABASE_URL(self) -> str:
        """Construct database URL from components"""
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    # Keycloak Configuration (with development fallbacks)
    KEYCLOAK_BASE_URL: str = os.getenv("ESIGN_KEYCLOAK_URL") or os.getenv("KEYCLOAK_URL") or os.getenv("KEYCLOAK_BASE_URL", "http://localhost:8080")
    KEYCLOAK_REALM: str = os.getenv("ESIGN_KEYCLOAK_REALM") or os.getenv("KEYCLOAK_REALM", "cedyn")
    KEYCLOAK_CLIENT_ID: str = os.getenv("ESIGN_KEYCLOAK_CLIENT_ID") or os.getenv("KEYCLOAK_CLIENT_ID", "cedyn-esign")
    KEYCLOAK_CLIENT_SECRET: str = os.getenv("ESIGN_KEYCLOAK_CLIENT_SECRET") or os.getenv("KEYCLOAK_CLIENT_SECRET", "dev-client-secret-change-me")
    
    @property
    def KEYCLOAK_ISSUER(self) -> str:
        """Construct Keycloak issuer URL"""
        return f"{self.KEYCLOAK_BASE_URL}/realms/{self.KEYCLOAK_REALM}"
    
    @property
    def KEYCLOAK_TOKEN_URL(self) -> str:
        """Keycloak token endpoint"""
        return f"{self.KEYCLOAK_ISSUER}/protocol/openid-connect/token"
    
    @property
    def KEYCLOAK_USERINFO_URL(self) -> str:
        """Keycloak userinfo endpoint"""
        return f"{self.KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo"
    
    @property
    def KEYCLOAK_JWKS_URL(self) -> str:
        """Keycloak JWKS endpoint"""
        return f"{self.KEYCLOAK_ISSUER}/protocol/openid-connect/certs"
    
    # Google OAuth Configuration (prioritizing temporary test credentials)
    # Using temporary CRMPILOTIQ approved credentials for testing
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID_TEMP") or os.getenv("GOOGLE_CLIENT_ID", "dev-google-client-id")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET_TEMP") or os.getenv("GOOGLE_CLIENT_SECRET", "dev-google-client-secret")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI_TEMP") or os.getenv("GOOGLE_OAUTH_REDIRECT_URI") or os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/google/auth/google/callback")
    GOOGLE_SCOPES: str = os.getenv("GOOGLE_SCOPES_TEMP") or os.getenv(
        "GOOGLE_SCOPES",
        "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email"
    )
    
    @property
    def GOOGLE_SCOPES_LIST(self) -> List[str]:
        """Parse Google scopes into list"""
        return self.GOOGLE_SCOPES.split()
    
    # Google API Endpoints
    GOOGLE_AUTH_URL: str = "https://accounts.google.com/o/oauth2/v2/auth"
    GOOGLE_TOKEN_URL: str = "https://oauth2.googleapis.com/token"
    GOOGLE_USERINFO_URL: str = "https://www.googleapis.com/oauth2/v1/userinfo"
    GOOGLE_DRIVE_API_URL: str = "https://www.googleapis.com/drive/v3"
    GOOGLE_DOCS_API_URL: str = "https://docs.googleapis.com/v1"
    
    # Phase 8 Google Workspace API (for Drive integration)
    GOOGLE_WORKSPACE_API_URL: str = os.getenv("GOOGLE_WORKSPACE_API_URL", "http://localhost:8008")
    
    # API Configuration
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8000")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3001")
    
    # CORS Configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:3001",
        "http://localhost:3000",
        os.getenv("FRONTEND_URL", "http://localhost:3001"),
        "https://esign.cedynhq.com",
    ]
    
    # S3-Compatible Storage (optional fallback)
    S3_ENDPOINT: str = os.getenv("S3_ENDPOINT", "")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "")
    S3_BUCKET: str = os.getenv("S3_BUCKET", "cedyn-esign-documents")
    S3_REGION: str = os.getenv("S3_REGION", "us-east-1")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Application Settings
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # File Upload Settings
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    ALLOWED_FILE_TYPES: List[str] = [".pdf", ".doc", ".docx"]
    UPLOAD_DIR: str = "/app/uploads"
    
    # Signature Settings
    SIGNATURE_IMAGE_MAX_SIZE: int = 5 * 1024 * 1024  # 5MB
    SIGNATURE_FORMATS: List[str] = ["png", "jpg", "jpeg"]
    
    # Email Configuration (Gmail SMTP in production, sourced from root .env)
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@cedynhq.com")
    
    class Config:
        case_sensitive = True
        # Don't load from file - use environment variables from docker-compose
        # env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"


# Create global settings instance
settings = Settings()


# Validation on startup
def validate_settings():
    """Validate critical settings are present"""
    errors = []
    warnings = []
    
    # In development mode, just warn about missing values
    is_dev = settings.ENVIRONMENT == "development"
    
    # Check Keycloak
    if not settings.KEYCLOAK_CLIENT_SECRET or settings.KEYCLOAK_CLIENT_SECRET == "dev-client-secret-change-me":
        msg = "KEYCLOAK_CLIENT_SECRET not set or using default dev value"
        warnings.append(msg) if is_dev else errors.append(msg)
    
    # Verify correct client ID
    if settings.KEYCLOAK_CLIENT_ID != "cedyn-esign":
        msg = f"KEYCLOAK_CLIENT_ID is '{settings.KEYCLOAK_CLIENT_ID}' but should be 'cedyn-esign'"
        warnings.append(msg)
    
    # Check Google OAuth
    if not settings.GOOGLE_CLIENT_ID or settings.GOOGLE_CLIENT_ID == "dev-google-client-id":
        msg = "GOOGLE_CLIENT_ID not set or using default dev value"
        warnings.append(msg) if is_dev else errors.append(msg)
    if not settings.GOOGLE_CLIENT_SECRET or settings.GOOGLE_CLIENT_SECRET == "dev-google-client-secret":
        msg = "GOOGLE_CLIENT_SECRET not set or using default dev value"
        warnings.append(msg) if is_dev else errors.append(msg)
    
    # Check Database
    if settings.POSTGRES_PASSWORD == "changeme":
        msg = "POSTGRES_PASSWORD using insecure default"
        warnings.append(msg) if is_dev else errors.append(msg)
    
    if errors:
        print("\n❌ CONFIGURATION ERRORS:")
        for error in errors:
            print(f"   - {error}")
        print("\n📝 Update: cedyn-sso/.env")
        print("   See phase12-esign/README.md for instructions\n")
        raise ValueError("Missing required configuration for production")
    
    if warnings:
        print("\n⚠️  DEVELOPMENT MODE - Configuration Warnings:")
        for warning in warnings:
            print(f"   - {warning}")
        print("\n💡 Running with defaults - OK for development\n")
    else:
        env_mode = "DEVELOPMENT" if is_dev else "PRODUCTION"
        print(f"✅ Configuration loaded successfully [{env_mode} mode]")
        print(f"   Database: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")
        print(f"   Keycloak: {settings.KEYCLOAK_BASE_URL}\n")


# Validate on import
validate_settings()
