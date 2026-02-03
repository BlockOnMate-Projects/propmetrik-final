"""
PropMetrik E-Signature Service - FastAPI Application
Integrated with PropMetrik authentication (JWT HS256)
Port: 8002 (following valuation service pattern on 8001)
"""

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import uvicorn

from config import settings, validate_settings
from database import init_db
from auth import get_current_user, test_keycloak_connection

# Import API routers
from api import documents, signature_requests, signing, google_drive, drive_picker, quick_sign, envelopes, templates, reports, users, programmatic, webhooks

# Create FastAPI app
app = FastAPI(
    title="PropMetrik E-Signature API",
    description="E-signature service for PropMetrik - integrated with PropMetrik JWT auth",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS - allow PropMetrik frontend origins
CORS_ORIGINS = [
    "http://localhost:3000",      # PropMetrik main frontend
    "http://localhost:3001",      # E-Sign UI
    "http://localhost:4000",      # PropMetrik API (for server-to-server)
    "https://app.propmetrik.com",
    "https://esign.propmetrik.com",
    *settings.CORS_ORIGINS,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """Initialize application on startup"""
    print("\n" + "="*60)
    print("🚀 Starting PropMetrik E-Signature Service")
    print("="*60)
    print(f"📊 Environment: {settings.ENVIRONMENT}")
    print(f"🔐 Auth Mode: PropMetrik JWT (Keycloak disabled)")
    # Parse database info from DATABASE_URL
    db_info = settings.DATABASE_URL.split("@")[1] if "@" in settings.DATABASE_URL else "configured"
    print(f"🗄️  Database: {db_info}")
    print(f"📁 Schema: {settings.ESIGN_SCHEMA}")
    print(f"🌐 PropMetrik API: {settings.PROPMETRIK_API_URL}")
    print("="*60 + "\n")
    
    # Validate settings
    validate_settings()
    
    # Initialize database
    init_db()
    
    print("✅ E-Signature service started successfully\n")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "PropMetrik E-Signature API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "auth_mode": "propmetrik_jwt"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    db_info = settings.DATABASE_URL.split("@")[1].split("/")[0] if "@" in settings.DATABASE_URL else "configured"
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "database": f"{db_info}/{settings.ESIGN_SCHEMA}",
        "auth_mode": "propmetrik_jwt",
        "keycloak_enabled": settings.KEYCLOAK_ENABLED,
        "google_oauth_configured": bool(settings.GOOGLE_CLIENT_ID)
    }


@app.get("/config/status")
async def config_status():
    """Check configuration status (non-sensitive values only)"""
    db_info = settings.DATABASE_URL.split("@")[1] if "@" in settings.DATABASE_URL else "configured"
    return {
        "auth_mode": "propmetrik_jwt",
        "keycloak_enabled": settings.KEYCLOAK_ENABLED,
        "jwt_secret_configured": bool(settings.JWT_SECRET and settings.JWT_SECRET != "your-jwt-secret-change-in-production"),
        "google_configured": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET),
        "database_configured": "@" in settings.DATABASE_URL and "localhost" not in settings.DATABASE_URL,
        "database": f"{db_info}/{settings.ESIGN_SCHEMA}",
        "s3_configured": bool(settings.S3_ENDPOINT and settings.S3_ACCESS_KEY),
        "smtp_configured": bool(settings.SMTP_HOST),
        "environment": settings.ENVIRONMENT
    }


@app.get("/auth/test-keycloak")
async def test_keycloak():
    """Test Keycloak connectivity - Returns disabled status for PropMetrik integration"""
    return test_keycloak_connection()


@app.get("/auth/me")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Get current authenticated user information
    Requires: PropMetrik Bearer token in Authorization header
    """
    return {
        "authenticated": True,
        "auth_mode": "propmetrik_jwt",
        "user": user
    }


@app.get("/auth/groups")
async def get_user_groups(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Get current user's role (legacy groups endpoint for compatibility)
    PropMetrik uses roles instead of groups
    """
    return {
        "user_id": user.get("sub"),
        "email": user.get("email"),
        "role": user.get("role"),
        "organizationId": user.get("organizationId"),
        "tier": user.get("tier"),
        "groups": [user.get("role")] if user.get("role") else []  # Legacy compatibility
    }


# TODO: Import and include routers once they're created
# from api import auth, google, esign, documents

# Register API routers
app.include_router(documents.router, prefix="/documents", tags=["Documents"])
app.include_router(signature_requests.router, prefix="/signature-requests", tags=["Signature Requests"])
app.include_router(signing.router, prefix="/signing", tags=["Signing"])
app.include_router(google_drive.router, prefix="/google", tags=["Google Drive OAuth"])
app.include_router(drive_picker.router, prefix="/drive", tags=["Google Drive Picker"])
app.include_router(quick_sign.router, prefix="/quick-sign", tags=["Quick Sign"])
app.include_router(envelopes.router, tags=["Envelopes"])
app.include_router(templates.router, tags=["Templates"])
app.include_router(reports.router, tags=["Reports"])
app.include_router(users.router, tags=["Users"])
app.include_router(programmatic.router, tags=["Programmatic API"])
app.include_router(webhooks.router, tags=["Webhooks"])
# app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
# app.include_router(google.router, prefix="/google", tags=["Google Drive"])
# app.include_router(esign.router, prefix="/esign", tags=["E-Signature"])
# app.include_router(documents.router, prefix="/documents", tags=["Documents"])

if __name__ == "__main__":
    # Run with: python main.py
    # Port 8002: Following PropMetrik Python service pattern (valuation on 8001)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8002,
        reload=True
    )
