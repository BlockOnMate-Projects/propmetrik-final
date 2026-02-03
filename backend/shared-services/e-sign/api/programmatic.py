"""
Programmatic Envelope API
Server-to-server API for creating envelopes from business services.
Uses internal API key authentication instead of user JWT.
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
import uuid
import os
import base64
import hashlib
import secrets
import httpx

from sqlalchemy import text
from database import get_db
from models import Envelope, EnvelopeRecipient, EnvelopeDocument, EnvelopeField, User
from services.certification import (
    embed_signatures_into_pdf,
    compute_security_hash,
    generate_certificate_pdf,
    append_certificate_to_pdf,
    persist_pdf,
)

router = APIRouter(prefix="/programmatic", tags=["programmatic"])


# ============================================================================
# Pydantic Models
# ============================================================================

class DocumentInput(BaseModel):
    """Document input for programmatic envelope creation"""
    name: str
    content_base64: str  # Base64 encoded PDF content
    mime_type: str = "application/pdf"


class SignerInput(BaseModel):
    """Signer input for programmatic envelope creation"""
    name: str
    email: EmailStr
    role: str = "signer"  # signer, cc, viewer
    order: int = 1


class FieldInput(BaseModel):
    """Signature field placement"""
    type: str  # signature, initials, date, text
    recipient_email: EmailStr
    document_index: int = 0
    page: int
    x: float  # 0-1 percentage or absolute pixels
    y: float
    width: float
    height: float
    required: bool = True


class ProgrammaticEnvelopeInput(BaseModel):
    """Input for programmatic envelope creation from business services"""
    subject: str
    message: Optional[str] = ""
    documents: List[DocumentInput]
    signers: List[SignerInput]
    fields: List[FieldInput]
    source_module: str  # property_management, valuation, crm, project_management
    source_entity_type: str  # tenancy, valuation_report, deal, change_order
    source_entity_id: str  # UUID
    callback_url: Optional[str] = None
    expires_in_days: int = 30
    auto_send: bool = True  # Immediately send for signing
    reminder_frequency_days: int = 3


class EnvelopeResponse(BaseModel):
    """Response after envelope creation"""
    envelope_id: str
    status: str
    signing_urls: dict  # email -> signing URL
    created_at: str
    expires_at: str
    source_context: dict


class WebhookPayload(BaseModel):
    """Webhook payload for envelope completion events"""
    event: str
    timestamp: str
    envelope: dict
    source_context: dict
    documents: List[dict]
    signers: List[dict]
    security: dict


# ============================================================================
# API Key Authentication
# ============================================================================

async def verify_internal_api_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: Session = Depends(get_db)
) -> dict:
    """
    Verify internal API key for server-to-server communication.
    Returns the key metadata if valid.
    """
    from models import ESIGN_SCHEMA
    
    # Hash the provided key
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    
    # Look up in database
    result = db.execute(
        text(f"""
        SELECT id, key_name, source_module, expires_at
        FROM {ESIGN_SCHEMA}.internal_api_keys
        WHERE api_key_hash = :key_hash
          AND is_active = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
        """),
        {"key_hash": key_hash}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=401, detail="Invalid or expired API key")
    
    # Update last_used_at
    db.execute(
        text(f"""
        UPDATE {ESIGN_SCHEMA}.internal_api_keys
        SET last_used_at = NOW()
        WHERE id = :key_id
        """),
        {"key_id": str(result.id)}
    )
    db.commit()
    
    return {
        "key_id": str(result.id),
        "key_name": result.key_name,
        "source_module": result.source_module
    }


def get_or_create_signer_pmt_id(db: Session, email: str, full_name: Optional[str] = None) -> str:
    """Get or create a permanent signer ID (PMT-XXXX) for a user by email."""
    user = db.query(User).filter(User.email == email).first()
    if user and user.signer_id:
        return user.signer_id
    
    # Generate new PMT ID
    pmt_id = f"PMT-{secrets.token_hex(6).upper()}"
    
    if user:
        user.signer_id = pmt_id
        db.commit()
        db.refresh(user)
    else:
        # Create a new user record for this signer
        user = User(
            email=email,
            full_name=full_name or email.split("@")[0],
            signer_id=pmt_id
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    return pmt_id


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/envelopes/create", response_model=EnvelopeResponse)
async def create_programmatic_envelope(
    data: ProgrammaticEnvelopeInput,
    db: Session = Depends(get_db),
    api_key_info: dict = Depends(verify_internal_api_key)
):
    """
    Create an envelope programmatically from a business service.
    
    This endpoint is for server-to-server communication only.
    Authentication is via X-API-Key header instead of user JWT.
    
    The envelope is created with source context linking it back to the
    originating business entity (tenancy, valuation report, deal, etc.).
    """
    try:
        # Validate source_module matches API key
        if api_key_info["source_module"] != data.source_module:
            raise HTTPException(
                status_code=403,
                detail=f"API key is for module '{api_key_info['source_module']}', not '{data.source_module}'"
            )
        
        envelope_id = str(uuid.uuid4())
        expires_at = datetime.utcnow() + timedelta(days=data.expires_in_days)
        
        # Create upload directory
        upload_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "uploads", "envelopes", envelope_id
        )
        os.makedirs(upload_dir, exist_ok=True)
        
        # Create envelope record
        envelope = Envelope(
            id=envelope_id,
            subject=data.subject,
            message=data.message,
            status="pending" if data.auto_send else "draft",
            created_by=f"system:{data.source_module}",
            reminder_frequency_days=data.reminder_frequency_days,
            expires_at=expires_at,
            source_module=data.source_module,
            source_entity_type=data.source_entity_type,
            source_entity_id=data.source_entity_id,
            callback_url=data.callback_url,
            is_programmatic=True,
            created_at=datetime.utcnow()
        )
        db.add(envelope)
        
        # Process and store documents
        for idx, doc in enumerate(data.documents):
            # Decode base64 content
            try:
                pdf_content = base64.b64decode(doc.content_base64)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid base64 content for document '{doc.name}': {str(e)}"
                )
            
            # Save to filesystem
            file_name = f"{doc.name.replace(' ', '_')}_{idx}.pdf"
            file_path = os.path.join(upload_dir, file_name)
            with open(file_path, "wb") as f:
                f.write(pdf_content)
            
            doc_record = EnvelopeDocument(
                id=str(uuid.uuid4()),
                envelope_id=envelope_id,
                name=doc.name,
                source="programmatic",
                file_path=file_path,
                order_index=idx
            )
            db.add(doc_record)
        
        # Add recipients with PMT signer IDs
        signing_urls = {}
        for signer in data.signers:
            # Generate permanent signer ID
            signer_pmt_id = get_or_create_signer_pmt_id(db, signer.email, signer.name)
            
            # Generate access token for signing URL
            access_token = secrets.token_urlsafe(32)
            
            recipient = EnvelopeRecipient(
                id=str(uuid.uuid4()),
                envelope_id=envelope_id,
                name=signer.name,
                email=signer.email,
                role=signer.role,
                signing_order=signer.order,
                status="pending",
                signer_pmt_id=signer_pmt_id,
                access_token=access_token
            )
            db.add(recipient)
            
            # Build signing URL
            # TODO: Configure base URL from settings
            base_url = os.getenv("ESIGN_UI_URL", "http://localhost:3001")
            signing_urls[signer.email] = f"{base_url}/sign/{envelope_id}?token={access_token}"
        
        # Add field placements
        for field in data.fields:
            field_record = EnvelopeField(
                id=str(uuid.uuid4()),
                envelope_id=envelope_id,
                type=field.type,
                recipient_email=field.recipient_email,
                document_index=field.document_index,
                page=field.page,
                x=field.x,
                y=field.y,
                width=field.width,
                height=field.height,
                required=field.required
            )
            db.add(field_record)
        
        db.commit()
        
        # TODO: If auto_send, trigger email notifications to signers
        
        return EnvelopeResponse(
            envelope_id=envelope_id,
            status=envelope.status,
            signing_urls=signing_urls,
            created_at=envelope.created_at.isoformat(),
            expires_at=expires_at.isoformat(),
            source_context={
                "module": data.source_module,
                "entity_type": data.source_entity_type,
                "entity_id": data.source_entity_id
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create envelope: {str(e)}")


@router.get("/envelopes/{envelope_id}")
async def get_programmatic_envelope(
    envelope_id: str,
    db: Session = Depends(get_db),
    api_key_info: dict = Depends(verify_internal_api_key)
):
    """
    Get envelope status and details.
    Only returns envelopes created by the same source_module.
    """
    envelope = db.query(Envelope).filter(
        Envelope.id == envelope_id,
        Envelope.source_module == api_key_info["source_module"]
    ).first()
    
    if not envelope:
        raise HTTPException(status_code=404, detail="Envelope not found")
    
    # Get recipients
    recipients = db.query(EnvelopeRecipient).filter(
        EnvelopeRecipient.envelope_id == envelope_id
    ).all()
    
    # Get documents
    documents = db.query(EnvelopeDocument).filter(
        EnvelopeDocument.envelope_id == envelope_id
    ).all()
    
    return {
        "envelope_id": envelope.id,
        "subject": envelope.subject,
        "status": envelope.status,
        "created_at": envelope.created_at.isoformat() if envelope.created_at else None,
        "completed_at": envelope.completed_at.isoformat() if envelope.completed_at else None,
        "expires_at": envelope.expires_at.isoformat() if envelope.expires_at else None,
        "source_context": {
            "module": envelope.source_module,
            "entity_type": envelope.source_entity_type,
            "entity_id": str(envelope.source_entity_id) if envelope.source_entity_id else None
        },
        "recipients": [
            {
                "email": r.email,
                "name": r.name,
                "role": r.role,
                "status": r.status,
                "pmt_id": r.signer_pmt_id,
                "signed_at": r.signed_at.isoformat() if r.signed_at else None
            }
            for r in recipients
        ],
        "documents": [
            {
                "id": d.id,
                "name": d.name,
                "order": d.order_index
            }
            for d in documents
        ],
        "security": {
            "hash": envelope.security_hash,
            "algorithm": envelope.security_hash_algorithm,
            "generated_at": envelope.security_hash_generated_at.isoformat() if envelope.security_hash_generated_at else None
        } if envelope.security_hash else None
    }


@router.post("/envelopes/{envelope_id}/void")
async def void_programmatic_envelope(
    envelope_id: str,
    reason: str,
    db: Session = Depends(get_db),
    api_key_info: dict = Depends(verify_internal_api_key)
):
    """
    Void an envelope (cancel it before completion).
    """
    envelope = db.query(Envelope).filter(
        Envelope.id == envelope_id,
        Envelope.source_module == api_key_info["source_module"]
    ).first()
    
    if not envelope:
        raise HTTPException(status_code=404, detail="Envelope not found")
    
    if envelope.status == "completed":
        raise HTTPException(status_code=400, detail="Cannot void a completed envelope")
    
    envelope.status = "voided"
    envelope.updated_at = datetime.utcnow()
    db.commit()
    
    return {"success": True, "envelope_id": envelope_id, "status": "voided"}
