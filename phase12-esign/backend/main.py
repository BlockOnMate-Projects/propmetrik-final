"""
Cedyn E-Signature Platform - FastAPI Application
All configuration sourced from root ../.env via docker-compose
"""

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import uvicorn

from config import settings, validate_settings
from database import init_db
from auth import get_current_user, test_keycloak_connection

# Import API routers
from api import documents, signature_requests, signing, google_drive, drive_picker, quick_sign, envelopes, templates, reports

# Create FastAPI app
app = FastAPI(
    title="Cedyn E-Signature API",
    description="Open-source e-signature platform with Google Workspace integration",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """Initialize application on startup"""
    print("\n" + "="*60)
    print("🚀 Starting Cedyn E-Signature Platform")
    print("="*60)
    print(f"📊 Environment: {settings.ENVIRONMENT}")
    print(f"🔐 Keycloak URL: {settings.KEYCLOAK_BASE_URL}")
    print(f"🗄️  Database: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}")
    print(f"🌐 API URL: {settings.API_BASE_URL}")
    print(f"💻 Frontend URL: {settings.FRONTEND_URL}")
    print("="*60 + "\n")
    
    # Validate settings from root .env
    validate_settings()
    
    # Initialize database
    init_db()
    
    print("✅ Application started successfully\n")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Cedyn E-Signature API",
        "version": "1.0.0",
        "status": "running",
        "docs": f"{settings.API_BASE_URL}/docs",
        "config_source": "root .env file via docker-compose"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "database": "connected",
        "keycloak": settings.KEYCLOAK_BASE_URL,
        "google_oauth_configured": bool(settings.GOOGLE_CLIENT_ID)
    }


@app.get("/config/status")
async def config_status():
    """Check configuration status (non-sensitive values only)"""
    return {
        "keycloak_configured": bool(settings.KEYCLOAK_CLIENT_SECRET),
        "google_configured": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET),
        "database_configured": settings.POSTGRES_PASSWORD != "changeme",
        "s3_configured": bool(settings.S3_ENDPOINT and settings.S3_ACCESS_KEY),
        "smtp_configured": bool(settings.SMTP_HOST),
        "config_source": "../.env (root)",
        "environment": settings.ENVIRONMENT
    }


@app.get("/auth/test-keycloak")
async def test_keycloak():
    """Test Keycloak connectivity and configuration"""
    return test_keycloak_connection()


@app.get("/auth/me")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Get current authenticated user information
    Requires: Bearer token in Authorization header
    """
    return {
        "authenticated": True,
        "user": user
    }


@app.get("/auth/groups")
async def get_user_groups(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Get current user's Keycloak groups
    This endpoint shows which groups the user belongs to
    """
    return {
        "user_id": user.get("sub"),
        "email": user.get("email"),
        "groups": user.get("groups", []),
        "total_groups": len(user.get("groups", []))
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
# app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
# app.include_router(google.router, prefix="/google", tags=["Google Drive"])
# app.include_router(esign.router, prefix="/esign", tags=["E-Signature"])
# app.include_router(documents.router, prefix="/documents", tags=["Documents"])

if __name__ == "__main__":
    # Run with: python main.py
    # Or use docker-compose which runs: uvicorn main:app --reload
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
