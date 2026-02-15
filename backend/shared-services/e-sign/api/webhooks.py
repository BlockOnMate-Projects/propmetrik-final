"""
Webhook API
Handles webhook registration and delivery for envelope completion events.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
import uuid
import secrets
import hashlib
import hmac
import json
import httpx

from database import get_db
from models import Envelope, EnvelopeRecipient, EnvelopeDocument, ESIGN_SCHEMA
from api.programmatic import verify_internal_api_key

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ============================================================================
# Pydantic Models
# ============================================================================

class WebhookRegistration(BaseModel):
    """Input for webhook registration"""
    source_module: str
    callback_url: str


class WebhookRegistrationResponse(BaseModel):
    """Response after webhook registration"""
    id: str
    source_module: str
    callback_url: str
    secret_key: str  # Return once on creation - store securely!
    created_at: str


class WebhookTestResult(BaseModel):
    """Result of webhook test"""
    success: bool
    status_code: Optional[int]
    response_time_ms: Optional[int]
    error: Optional[str]


# ============================================================================
# Webhook Payload Builder
# ============================================================================

def build_completion_payload(
    envelope: Envelope,
    recipients: list,
    documents: list,
    db: Session
) -> dict:
    """Build the webhook payload for envelope completion events."""
    
    return {
        "event": "envelope.completed",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "envelope": {
            "id": envelope.id,
            "subject": envelope.subject,
            "completedAt": envelope.completed_at.isoformat() + "Z" if envelope.completed_at else None
        },
        "sourceContext": {
            "module": envelope.source_module,
            "entityType": envelope.source_entity_type,
            "entityId": str(envelope.source_entity_id) if envelope.source_entity_id else None
        },
        "documents": [
            {
                "id": doc.id,
                "name": doc.name,
                "signedUrl": f"/envelopes/{envelope.id}/document",  # Relative URL
                "certificateUrl": f"/envelopes/{envelope.id}/certificate" if envelope.certificate_file_path else None
            }
            for doc in documents
        ],
        "signers": [
            {
                "email": r.email,
                "name": r.name,
                "pmtId": r.signer_pmt_id,
                "signedAt": r.signed_at.isoformat() + "Z" if r.signed_at else None
            }
            for r in recipients if r.status == "completed"
        ],
        "security": {
            "hash": envelope.security_hash,
            "algorithm": envelope.security_hash_algorithm or "SHA-256",
            "verifyUrl": f"https://propmetrik.com/verify/{envelope.id}"
        } if envelope.security_hash else None
    }


def sign_payload(payload: dict, secret_key: str) -> str:
    """Generate HMAC-SHA256 signature for webhook payload."""
    payload_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    signature = hmac.new(
        secret_key.encode('utf-8'),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()
    return f"sha256={signature}"


async def deliver_webhook(
    envelope_id: str,
    callback_url: str,
    payload: dict,
    secret_key: str,
    db: Session
):
    """
    Deliver webhook to the registered callback URL.
    Logs the attempt and result.
    """
    delivery_id = str(uuid.uuid4())
    signature = sign_payload(payload, secret_key)
    
    start_time = datetime.utcnow()
    status_code = None
    response_body = None
    error_message = None
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                callback_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-PropMetrik-Signature": signature,
                    "X-PropMetrik-Event": "envelope.completed",
                    "X-PropMetrik-Delivery": delivery_id
                }
            )
            status_code = response.status_code
            response_body = response.text[:1000]  # Truncate for storage
            
            if response.status_code >= 200 and response.status_code < 300:
                # Update envelope webhook delivery status
                db.execute(
                    text(f"""
                    UPDATE {ESIGN_SCHEMA}.envelopes
                    SET webhook_delivered_at = NOW(),
                        webhook_delivery_attempts = webhook_delivery_attempts + 1
                    WHERE id = :envelope_id
                    """),
                    {"envelope_id": envelope_id}
                )
                
    except httpx.TimeoutException:
        error_message = "Request timed out after 30 seconds"
    except httpx.RequestError as e:
        error_message = f"Request failed: {str(e)}"
    except Exception as e:
        error_message = f"Unexpected error: {str(e)}"
    
    # Log the delivery attempt
    db.execute(
        text(f"""
        INSERT INTO {ESIGN_SCHEMA}.webhook_delivery_log
        (id, envelope_id, webhook_url, event_type, payload, response_status, response_body, error_message, delivered_at)
        VALUES (:id, :envelope_id, :webhook_url, :event_type, :payload, :status, :response_body, :error_message, :delivered_at)
        """),
        {
            "id": delivery_id,
            "envelope_id": envelope_id,
            "webhook_url": callback_url,
            "event_type": "envelope.completed",
            "payload": json.dumps(payload),
            "status": status_code,
            "response_body": response_body,
            "error_message": error_message,
            "delivered_at": datetime.utcnow() if status_code and status_code < 300 else None
        }
    )
    db.commit()
    
    return {
        "success": status_code is not None and status_code < 300,
        "status_code": status_code,
        "error": error_message
    }


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/register", response_model=WebhookRegistrationResponse)
async def register_webhook(
    data: WebhookRegistration,
    db: Session = Depends(get_db),
    api_key_info: dict = Depends(verify_internal_api_key)
):
    """
    Register a webhook URL for a source module.
    Returns a secret key that must be stored securely - it's only shown once.
    
    The secret key is used to verify webhook signatures using HMAC-SHA256.
    """
    # Validate that the API key matches the source module
    if api_key_info["source_module"] != data.source_module:
        raise HTTPException(
            status_code=403,
            detail=f"API key is for module '{api_key_info['source_module']}', not '{data.source_module}'"
        )
    
    # Generate secret key for HMAC signing
    secret_key = secrets.token_urlsafe(32)
    registration_id = str(uuid.uuid4())
    
    # Upsert webhook registration
    db.execute(
        text(f"""
        INSERT INTO {ESIGN_SCHEMA}.webhook_registrations
        (id, source_module, callback_url, secret_key, is_active, created_at, updated_at)
        VALUES (:id, :source_module, :callback_url, :secret_key, TRUE, NOW(), NOW())
        ON CONFLICT (source_module) DO UPDATE
        SET callback_url = EXCLUDED.callback_url,
            secret_key = EXCLUDED.secret_key,
            is_active = TRUE,
            updated_at = NOW()
        RETURNING id
        """),
        {
            "id": registration_id,
            "source_module": data.source_module,
            "callback_url": data.callback_url,
            "secret_key": secret_key
        }
    )
    db.commit()
    
    return WebhookRegistrationResponse(
        id=registration_id,
        source_module=data.source_module,
        callback_url=data.callback_url,
        secret_key=secret_key,
        created_at=datetime.utcnow().isoformat()
    )


@router.delete("/register/{source_module}")
async def unregister_webhook(
    source_module: str,
    db: Session = Depends(get_db),
    api_key_info: dict = Depends(verify_internal_api_key)
):
    """
    Unregister (deactivate) a webhook for a source module.
    """
    if api_key_info["source_module"] != source_module:
        raise HTTPException(
            status_code=403,
            detail=f"API key is for module '{api_key_info['source_module']}', not '{source_module}'"
        )
    
    result = db.execute(
        text(f"""
        UPDATE {ESIGN_SCHEMA}.webhook_registrations
        SET is_active = FALSE, updated_at = NOW()
        WHERE source_module = :source_module
        RETURNING id
        """),
        {"source_module": source_module}
    )
    db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Webhook registration not found")
    
    return {"success": True, "source_module": source_module}


@router.post("/test/{envelope_id}", response_model=WebhookTestResult)
async def test_webhook_delivery(
    envelope_id: str,
    db: Session = Depends(get_db),
    api_key_info: dict = Depends(verify_internal_api_key)
):
    """
    Test webhook delivery for a specific envelope.
    Sends a test payload to the registered webhook URL.
    """
    # Get envelope
    envelope = db.query(Envelope).filter(
        Envelope.id == envelope_id,
        Envelope.source_module == api_key_info["source_module"]
    ).first()
    
    if not envelope:
        raise HTTPException(status_code=404, detail="Envelope not found")
    
    # Get webhook registration
    result = db.execute(
        f"""
        SELECT callback_url, secret_key
        FROM {ESIGN_SCHEMA}.webhook_registrations
        WHERE source_module = :source_module AND is_active = TRUE
        """,
        {"source_module": envelope.source_module}
    ).fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="No webhook registered for this module")
    
    # Get recipients and documents
    recipients = db.query(EnvelopeRecipient).filter(
        EnvelopeRecipient.envelope_id == envelope_id
    ).all()
    
    documents = db.query(EnvelopeDocument).filter(
        EnvelopeDocument.envelope_id == envelope_id
    ).all()
    
    # Build and deliver payload
    payload = build_completion_payload(envelope, recipients, documents, db)
    payload["event"] = "envelope.test"  # Mark as test event
    
    delivery_result = await deliver_webhook(
        envelope_id=envelope_id,
        callback_url=result.callback_url,
        payload=payload,
        secret_key=result.secret_key,
        db=db
    )
    
    return WebhookTestResult(
        success=delivery_result["success"],
        status_code=delivery_result["status_code"],
        response_time_ms=None,  # TODO: Track timing
        error=delivery_result["error"]
    )


async def trigger_completion_webhook(envelope_id: str, db: Session):
    """
    Called when an envelope is completed to trigger the webhook.
    This is invoked from the signing completion flow.
    """
    envelope = db.query(Envelope).filter(Envelope.id == envelope_id).first()
    
    if not envelope or not envelope.source_module:
        return  # Not a programmatic envelope
    
    # Get webhook registration
    result = db.execute(
        text(f"""
        SELECT callback_url, secret_key
        FROM {ESIGN_SCHEMA}.webhook_registrations
        WHERE source_module = :source_module AND is_active = TRUE
        """),
        {"source_module": envelope.source_module}
    ).fetchone()
    
    if not result:
        return  # No webhook registered
    
    # Use callback_url from envelope if specified, otherwise use registered URL
    callback_url = envelope.callback_url or result.callback_url
    
    # Get recipients and documents
    recipients = db.query(EnvelopeRecipient).filter(
        EnvelopeRecipient.envelope_id == envelope_id
    ).all()
    
    documents = db.query(EnvelopeDocument).filter(
        EnvelopeDocument.envelope_id == envelope_id
    ).all()
    
    # Build and deliver payload
    payload = build_completion_payload(envelope, recipients, documents, db)
    
    await deliver_webhook(
        envelope_id=envelope_id,
        callback_url=callback_url,
        payload=payload,
        secret_key=result.secret_key,
        db=db
    )
