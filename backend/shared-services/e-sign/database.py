"""
Database configuration and session management
Connects using credentials from root .env file
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings

# Create database engine using URL from settings (which sources root .env)
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.DEBUG
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """
    Dependency function to get database session.
    Use in FastAPI routes with: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize database tables.
    Called on application startup.
    """
    from models import (
        User, GoogleToken, Document, SignatureRequest, Signature, AuditLog,
        Template, Envelope, EnvelopeRecipient, EnvelopeDocument, EnvelopeField
    )
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables initialized")
