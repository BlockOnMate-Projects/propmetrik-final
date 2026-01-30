"""
Signature Signing API
Handles the actual signing process for signers
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import (
    Signer, SignerStatus, Signature, SignatureRequest,
    SignatureRequestStatus, AuditLog
)
from email_service import send_signature_completed_email


router = APIRouter()


# Pydantic schemas
class SignatureSignRequest(BaseModel):
    signature_data: str  # Base64 encoded signature image
    signature_type: str = "drawn"  # drawn, typed, uploaded


class SignatureResponse(BaseModel):
    id: int
    signature_request_id: int
    signer_id: int
    signature_type: str
    signed_at: datetime
    
    class Config:
        from_attributes = True


class SignerPublicInfo(BaseModel):
    email: str
    full_name: Optional[str] = None
    status: SignerStatus
    signature_request_title: str
    document_title: str
    message: Optional[str] = None


def log_signing_audit_event(
    db: Session,
    signer_id: int,
    event_type: str,
    request: Request,
    event_data: dict = None
):
    """Create audit log entry for signing actions"""
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    
    audit = AuditLog(
        user_id=None,  # No user_id for public signing
        event_type=event_type,
        resource_type="signature",
        resource_id=signer_id,
        event_data=event_data or {},
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.add(audit)
    db.commit()


def get_signer_by_token(db: Session, access_token: str) -> Signer:
    """Get signer by access token"""
    signer = db.query(Signer).filter(Signer.access_token == access_token).first()
    if not signer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired signing link"
        )
    return signer


def check_signature_request_valid(signature_request: SignatureRequest):
    """Validate signature request is still active"""
    if signature_request.status == SignatureRequestStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This signature request has already been completed"
        )
    
    if signature_request.status == SignatureRequestStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This signature request has been cancelled"
        )
    
    if signature_request.status == SignatureRequestStatus.EXPIRED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This signature request has expired"
        )
    
    # Check expiration
    if signature_request.expires_at and signature_request.expires_at < datetime.utcnow():
        signature_request.status = SignatureRequestStatus.EXPIRED
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This signature request has expired"
        )


def check_signer_can_sign(signer: Signer):
    """Validate signer can still sign"""
    if signer.status == SignerStatus.SIGNED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already signed this document"
        )
    
    if signer.status == SignerStatus.DECLINED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have declined to sign this document"
        )


def check_all_signers_signed(db: Session, signature_request: SignatureRequest) -> bool:
    """Check if all signers have signed"""
    signers = db.query(Signer).filter(
        Signer.signature_request_id == signature_request.id
    ).all()
    
    return all(signer.status == SignerStatus.SIGNED for signer in signers)


@router.get("/access/{access_token}", response_model=SignerPublicInfo)
async def get_signer_info(
    access_token: str,
    db: Session = Depends(get_db)
):
    """
    Get signer information using access token (public endpoint)
    
    - **access_token**: Unique token from signing email link
    """
    signer = get_signer_by_token(db, access_token)
    signature_request = signer.signature_request
    document = signature_request.document
    
    check_signature_request_valid(signature_request)
    
    return SignerPublicInfo(
        email=signer.email,
        full_name=signer.full_name,
        status=signer.status,
        signature_request_title=signature_request.title,
        document_title=document.title,
        message=signature_request.message
    )


@router.post("/sign/{access_token}", response_model=SignatureResponse)
async def sign_document(
    access_token: str,
    sign_request: SignatureSignRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Sign a document using access token (public endpoint)
    
    - **access_token**: Unique token from signing email link
    - **signature_data**: Base64 encoded signature image
    - **signature_type**: Type of signature (drawn, typed, uploaded)
    """
    # Get signer
    signer = get_signer_by_token(db, access_token)
    signature_request = signer.signature_request
    
    # Validate request is still active
    check_signature_request_valid(signature_request)
    
    # Validate signer can sign
    check_signer_can_sign(signer)
    
    # Extract request metadata
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    
    # Create signature
    signature = Signature(
        signature_request_id=signature_request.id,
        signer_id=signer.id,
        signature_data=sign_request.signature_data,
        signature_type=sign_request.signature_type,
        ip_address=ip_address,
        user_agent=user_agent,
        signed_at=datetime.utcnow()
    )
    
    # Update signer status
    signer.status = SignerStatus.SIGNED
    signer.signed_at = datetime.utcnow()
    signer.ip_address = ip_address
    signer.user_agent = user_agent
    
    db.add(signature)
    db.commit()
    db.refresh(signature)
    
    # Check if all signers have signed
    all_signed = check_all_signers_signed(db, signature_request)
    if all_signed:
        signature_request.status = SignatureRequestStatus.COMPLETED
        signature_request.completed_at = datetime.utcnow()
        db.commit()
    
    # Send email notification to creator
    completed_count = db.query(Signer).filter(
        Signer.signature_request_id == signature_request.id,
        Signer.status == SignerStatus.SIGNED
    ).count()
    total_count = db.query(Signer).filter(
        Signer.signature_request_id == signature_request.id
    ).count()
    
    creator = signature_request.creator
    send_signature_completed_email(
        creator_email=creator.email,
        creator_name=creator.full_name or creator.email,
        document_title=signature_request.document.title,
        signer_name=signer.full_name or signer.email,
        completed_count=completed_count,
        total_count=total_count
    )
    
    # Log audit event
    log_signing_audit_event(
        db=db,
        signer_id=signer.id,
        event_type="document_signed",
        request=request,
        event_data={
            "signature_request_id": signature_request.id,
            "signer_email": signer.email,
            "signature_type": sign_request.signature_type
        }
    )
    
    return signature


@router.post("/decline/{access_token}", status_code=status.HTTP_200_OK)
async def decline_signature(
    access_token: str,
    decline_reason: Optional[str] = None,
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Decline to sign a document (public endpoint)
    
    - **access_token**: Unique token from signing email link
    - **decline_reason**: Optional reason for declining
    """
    # Get signer
    signer = get_signer_by_token(db, access_token)
    signature_request = signer.signature_request
    
    # Validate request is still active
    check_signature_request_valid(signature_request)
    
    # Validate signer can decline
    check_signer_can_sign(signer)
    
    # Update signer status
    signer.status = SignerStatus.DECLINED
    signer.declined_at = datetime.utcnow()
    signer.decline_reason = decline_reason
    
    if request and request.client:
        signer.ip_address = request.client.host
        signer.user_agent = request.headers.get("User-Agent")
    
    # Update signature request status to cancelled
    signature_request.status = SignatureRequestStatus.CANCELLED
    
    db.commit()
    
    # Log audit event
    if request:
        log_signing_audit_event(
            db=db,
            signer_id=signer.id,
            event_type="signature_declined",
            request=request,
            event_data={
                "signature_request_id": signature_request.id,
                "signer_email": signer.email,
                "decline_reason": decline_reason
            }
        )
    
    return {
        "message": "Signature declined successfully",
        "status": "declined"
    }


@router.get("/signature-request/{access_token}/document")
async def get_document_for_signing(
    access_token: str,
    db: Session = Depends(get_db)
):
    """
    Get document details for signing (public endpoint)
    
    - **access_token**: Unique token from signing email link
    """
    signer = get_signer_by_token(db, access_token)
    signature_request = signer.signature_request
    document = signature_request.document
    
    check_signature_request_valid(signature_request)
    
    return {
        "document_id": document.id,
        "title": document.title,
        "mime_type": document.mime_type,
        "file_size": document.file_size,
        "signature_request_title": signature_request.title,
        "message": signature_request.message,
        "signer_email": signer.email,
        "signer_name": signer.full_name,
        "expires_at": signature_request.expires_at
    }
