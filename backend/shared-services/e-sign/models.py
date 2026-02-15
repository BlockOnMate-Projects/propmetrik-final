"""
SQLAlchemy Models for E-Signature Platform
PropMetrik Integration: All tables use the 'esign' schema within propmetrik database
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, 
    ForeignKey, Enum, Float, JSON
)
from sqlalchemy.orm import relationship
from database import Base
import enum

# Schema name for all e-sign tables
ESIGN_SCHEMA = "esign"


class DocumentStatus(str, enum.Enum):
    """Document processing status"""
    PENDING = "pending"
    CONVERTED = "converted"
    FAILED = "failed"


class SignatureRequestStatus(str, enum.Enum):
    """Signature request workflow status"""
    DRAFT = "draft"
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class SignerStatus(str, enum.Enum):
    """Individual signer status"""
    PENDING = "pending"
    SIGNED = "signed"
    DECLINED = "declined"


class User(Base):
    """User model linked to PropMetrik (via userId in JWT)"""
    __tablename__ = "users"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(Integer, primary_key=True, index=True)
    propmetrik_user_id = Column(String(255), unique=True, nullable=True, index=True)  # PropMetrik user UUID
    organization_id = Column(String(255), nullable=True, index=True)  # PropMetrik organization UUID
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255))
    signer_id = Column(String(32), unique=True, nullable=True, index=True)  # Permanent signer ID (PMT-XXXX)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    google_tokens = relationship("GoogleToken", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="owner", cascade="all, delete-orphan")
    signature_requests_created = relationship("SignatureRequest", back_populates="creator", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")


class GoogleToken(Base):
    """Encrypted Google OAuth tokens"""
    __tablename__ = "google_tokens"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey(f"{ESIGN_SCHEMA}.users.id", ondelete="CASCADE"), nullable=False, index=True)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text)
    token_type = Column(String(50), default="Bearer")
    expires_at = Column(DateTime)
    scopes = Column(Text)  # JSON array of scopes
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="google_tokens")


class Document(Base):
    """Documents from Google Drive/Docs"""
    __tablename__ = "documents"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey(f"{ESIGN_SCHEMA}.users.id", ondelete="CASCADE"), nullable=False, index=True)
    google_drive_id = Column(String(255), index=True)
    title = Column(String(500), nullable=False)
    original_format = Column(String(50))  # 'google_doc', 'pdf', 'google_drive', etc.
    file_path = Column(String(1000))  # Local or S3 path
    signed_file_path = Column(String(1000))  # Path to signed document
    file_size = Column(Integer)
    mime_type = Column(String(100))
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING, nullable=False, index=True)
    conversion_error = Column(Text)
    # Google Drive integration fields
    signed_drive_id = Column(String(255), index=True)  # ID of signed doc in Drive
    extra_data = Column(JSON)  # Additional metadata (source, upload settings, etc.)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    owner = relationship("User", back_populates="documents")
    signature_requests = relationship("SignatureRequest", back_populates="document", cascade="all, delete-orphan")


class SignatureRequest(Base):
    """Signature request workflow"""
    __tablename__ = "signature_requests"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey(f"{ESIGN_SCHEMA}.documents.id", ondelete="CASCADE"), nullable=False, index=True)
    creator_id = Column(Integer, ForeignKey(f"{ESIGN_SCHEMA}.users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    message = Column(Text)
    status = Column(Enum(SignatureRequestStatus), default=SignatureRequestStatus.DRAFT, nullable=False, index=True)
    expires_at = Column(DateTime, index=True)
    completed_at = Column(DateTime)
    security_hash = Column(String(128), index=True)
    security_hash_algorithm = Column(String(20), default="SHA-256")
    security_hash_generated_at = Column(DateTime)
    certificate_file_path = Column(String(1000))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    document = relationship("Document", back_populates="signature_requests")
    creator = relationship("User", back_populates="signature_requests_created")
    signers = relationship("Signer", back_populates="signature_request", cascade="all, delete-orphan")
    signatures = relationship("Signature", back_populates="signature_request", cascade="all, delete-orphan")


class Signer(Base):
    """Individual signers in a signature request"""
    __tablename__ = "signers"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(Integer, primary_key=True, index=True)
    signature_request_id = Column(Integer, ForeignKey(f"{ESIGN_SCHEMA}.signature_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    full_name = Column(String(255))
    signer_pmt_id = Column(String(32), index=True)  # Permanent signer ID (PMT-XXXX)
    order = Column(Integer, default=1)  # For sequential signing
    status = Column(Enum(SignerStatus), default=SignerStatus.PENDING, nullable=False, index=True)
    access_token = Column(String(64), unique=True, index=True)  # Unique token for signing
    signed_at = Column(DateTime)
    declined_at = Column(DateTime)
    decline_reason = Column(Text)
    ip_address = Column(String(45))  # IPv6 compatible
    user_agent = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    signature_request = relationship("SignatureRequest", back_populates="signers")
    signature_fields = relationship("SignatureField", back_populates="signer", cascade="all, delete-orphan")


class SignatureField(Base):
    """Signature field positions on document"""
    __tablename__ = "signature_fields"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(Integer, primary_key=True, index=True)
    signer_id = Column(Integer, ForeignKey(f"{ESIGN_SCHEMA}.signers.id", ondelete="CASCADE"), nullable=False, index=True)
    page = Column(Integer, nullable=False)
    x = Column(Float, nullable=False)  # X coordinate (percentage or pixels)
    y = Column(Float, nullable=False)  # Y coordinate (percentage or pixels)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    field_type = Column(String(50), default="signature")  # 'signature', 'initial', 'date', 'text'
    required = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    signer = relationship("Signer", back_populates="signature_fields")


class Signature(Base):
    """Actual signature data"""
    __tablename__ = "signatures"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(Integer, primary_key=True, index=True)
    signature_request_id = Column(Integer, ForeignKey(f"{ESIGN_SCHEMA}.signature_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    signer_id = Column(Integer, ForeignKey(f"{ESIGN_SCHEMA}.signers.id", ondelete="CASCADE"), nullable=False, index=True)
    signature_data = Column(Text, nullable=False)  # Base64 encoded signature image
    signature_type = Column(String(50), default="drawn")  # 'drawn', 'typed', 'uploaded'
    ip_address = Column(String(45))
    user_agent = Column(Text)
    signed_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Relationships
    signature_request = relationship("SignatureRequest", back_populates="signatures")
    signer = relationship("Signer")


class AuditLog(Base):
    """Comprehensive audit trail"""
    __tablename__ = "audit_logs"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey(f"{ESIGN_SCHEMA}.users.id", ondelete="SET NULL"), index=True)
    event_type = Column(String(100), nullable=False, index=True)  # 'document_upload', 'signature_request_created', etc.
    resource_type = Column(String(50))  # 'document', 'signature_request', etc.
    resource_id = Column(Integer)
    event_data = Column(JSON)  # Additional structured data
    ip_address = Column(String(45))
    user_agent = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="audit_logs")


class Template(Base):
    """Reusable document templates"""
    __tablename__ = "templates"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(String(36), primary_key=True, index=True)  # UUID
    name = Column(String(255), nullable=False)
    description = Column(Text)
    category = Column(String(100), default="General")
    document_name = Column(String(500))
    document_drive_id = Column(String(255))  # Google Drive file ID
    fields = Column(JSON)  # Field positions and types
    is_shared = Column(Boolean, default=False, index=True)  # Starter templates
    used_count = Column(Integer, default=0)
    created_by = Column(String(255), nullable=False, index=True)  # Username/email
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Envelope(Base):
    """DocuSign-style envelopes containing documents and recipients"""
    __tablename__ = "envelopes"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(String(36), primary_key=True, index=True)  # UUID
    subject = Column(String(500), nullable=False)
    message = Column(Text)
    status = Column(String(50), default="pending", index=True)  # draft, pending, completed, voided, expired
    created_by = Column(String(255), nullable=False, index=True)
    reminder_frequency_days = Column(Integer, default=3)
    expires_at = Column(DateTime)
    completed_at = Column(DateTime)
    # Audit-grade security hash (computed after all signatures applied)
    security_hash = Column(String(128), index=True)
    security_hash_algorithm = Column(String(20), default="SHA-256")
    security_hash_generated_at = Column(DateTime)
    certificate_file_path = Column(String(1000))
    # Source context for programmatic integration
    source_module = Column(String(50), index=True)  # property_management, valuation, crm, project_management
    source_entity_type = Column(String(50))  # tenancy, valuation_report, deal, change_order
    source_entity_id = Column(String(36))  # UUID of source entity
    callback_url = Column(Text)  # Webhook URL for completion notification
    is_programmatic = Column(Boolean, default=False)  # TRUE if created via programmatic API
    webhook_delivered_at = Column(DateTime)
    webhook_delivery_attempts = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EnvelopeRecipient(Base):
    """Recipients for an envelope"""
    __tablename__ = "envelope_recipients"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(String(36), primary_key=True, index=True)
    envelope_id = Column(String(36), ForeignKey(f"{ESIGN_SCHEMA}.envelopes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255))
    email = Column(String(255), nullable=False)
    role = Column(String(50), default="signer")  # signer, cc, viewer
    signing_order = Column(Integer, default=1)
    status = Column(String(50), default="pending")
    signer_pmt_id = Column(String(32), index=True)  # Permanent signer ID (PMT-XXXX)
    signed_at = Column(DateTime)
    access_token = Column(String(64), unique=True, index=True)


class EnvelopeDocument(Base):
    """Documents within an envelope"""
    __tablename__ = "envelope_documents"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(String(36), primary_key=True, index=True)
    envelope_id = Column(String(36), ForeignKey(f"{ESIGN_SCHEMA}.envelopes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(500), nullable=False)
    source = Column(String(50))  # desktop, drive
    drive_id = Column(String(255))
    file_path = Column(String(1000))
    order_index = Column(Integer, default=0)


class EnvelopeField(Base):
    """Field placements on envelope documents"""
    __tablename__ = "envelope_fields"
    __table_args__ = {"schema": ESIGN_SCHEMA}

    id = Column(String(36), primary_key=True, index=True)
    envelope_id = Column(String(36), ForeignKey(f"{ESIGN_SCHEMA}.envelopes.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(50), nullable=False)  # signature, initial, date_signed, name, email, etc.
    recipient_email = Column(String(255))
    document_index = Column(Integer, default=0)
    page = Column(Integer, nullable=False)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    required = Column(Boolean, default=True)
    value = Column(Text)  # Filled value
    signature_data = Column(Text)  # Base64 signature if applicable
