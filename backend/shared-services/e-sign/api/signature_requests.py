"""
Signature Request API
Handles creation and management of signature requests
"""

import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from auth import get_current_user
from database import get_db
from config import settings
from models import (
    SignatureRequest, SignatureRequestStatus, Signer, SignerStatus,
    Document, SignatureField
)
from api.documents import get_or_create_user, log_audit_event
from email_service import send_signature_request_email, send_signature_completed_email


router = APIRouter()


# Pydantic schemas
class SignerCreate(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    order: int = 1


class SignatureFieldCreate(BaseModel):
    signer_email: EmailStr
    page: int
    x: float
    y: float
    width: float
    height: float


class SignerResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    order: int
    status: SignerStatus
    signed_at: Optional[datetime] = None
    declined_at: Optional[datetime] = None
    decline_reason: Optional[str] = None

    class Config:
        from_attributes = True


class SignatureRequestCreate(BaseModel):
    document_id: int
    title: str
    message: Optional[str] = None
    signers: List[SignerCreate]
    expires_in_days: int = 30
    fields: Optional[List[SignatureFieldCreate]] = None


class SignatureRequestResponse(BaseModel):
    id: int
    document_id: int
    creator_id: int
    title: str
    message: Optional[str] = None
    status: SignatureRequestStatus
    expires_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    signers: List[SignerResponse]

    class Config:
        from_attributes = True


class SignatureRequestListResponse(BaseModel):
    total: int
    signature_requests: List[SignatureRequestResponse]


class SignatureRequestStatusUpdate(BaseModel):
    status: SignatureRequestStatus


def generate_access_token() -> str:
    """Generate secure access token for signer"""
    return secrets.token_urlsafe(48)


@router.post("/", response_model=SignatureRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_signature_request(
    request: SignatureRequestCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new signature request
    
    - **document_id**: ID of the document to be signed
    - **title**: Title of the signature request
    - **message**: Optional message to signers
    - **signers**: List of signers with email, name, and order
    - **expires_in_days**: Number of days until request expires (default: 30)
    """
    # Get or create user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Verify document exists and user owns it
    document = db.query(Document).filter(
        Document.id == request.document_id,
        Document.owner_id == user.id
    ).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or you don't have permission to use it"
        )
    
    # Validate signers
    if not request.signers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one signer is required"
        )
    
    # Create signature request
    expires_at = datetime.utcnow() + timedelta(days=request.expires_in_days)
    
    signature_request = SignatureRequest(
        document_id=document.id,
        creator_id=user.id,
        title=request.title,
        message=request.message,
        status=SignatureRequestStatus.PENDING,
        expires_at=expires_at
    )
    
    db.add(signature_request)
    db.flush()  # Get signature_request.id without committing
    
    # Create signers
    for signer_data in request.signers:
        signer_user = get_or_create_user(
            propmetrik_user_id=None,
            email=signer_data.email,
            full_name=signer_data.full_name,
            db=db
        )
        signer = Signer(
            signature_request_id=signature_request.id,
            email=signer_data.email,
            full_name=signer_data.full_name,
            order=signer_data.order,
            status=SignerStatus.PENDING,
            access_token=generate_access_token(),
            signer_pmt_id=signer_user.signer_id
        )
        db.add(signer)

    db.flush()

    # Create signature fields (optional)
    if request.fields:
        for field in request.fields:
            signer = db.query(Signer).filter(
                Signer.signature_request_id == signature_request.id,
                Signer.email == field.signer_email
            ).first()
            if not signer:
                continue
            signature_field = SignatureField(
                signer_id=signer.id,
                page=field.page,
                x=field.x,
                y=field.y,
                width=field.width,
                height=field.height,
                field_type="signature",
                required=True
            )
            db.add(signature_field)
    
    db.commit()
    db.refresh(signature_request)
    
    # Log audit event
    log_audit_event(
        db=db,
        user_id=user.id,
        event_type="signature_request_created",
        resource_type="signature_request",
        resource_id=signature_request.id,
        event_data={
            "title": request.title,
            "document_id": document.id,
            "signer_count": len(request.signers)
        }
    )
    
    # Send email notifications to signers
    for signer in signature_request.signers:
        signing_url = f"{settings.FRONTEND_URL}/sign/{signer.access_token}"
        expires_str = signature_request.expires_at.strftime("%B %d, %Y at %I:%M %p") if signature_request.expires_at else None
        
        send_signature_request_email(
            signer_email=signer.email,
            signer_name=signer.full_name or signer.email,
            document_title=document.title,
            creator_name=current_user.get("name") or current_user.get("email"),
            signing_url=signing_url,
            expires_at=expires_str
        )
    
    return signature_request


@router.get("/", response_model=SignatureRequestListResponse)
async def list_signature_requests(
    skip: int = 0,
    limit: int = 50,
    status_filter: Optional[SignatureRequestStatus] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    List user's signature requests
    
    - **skip**: Number of requests to skip (pagination)
    - **limit**: Maximum number of requests to return
    - **status**: Filter by request status
    """
    # Get or create user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Build query
    query = db.query(SignatureRequest).filter(SignatureRequest.creator_id == user.id)
    
    if status_filter:
        query = query.filter(SignatureRequest.status == status_filter)
    
    # Get total count
    total = query.count()
    
    # Get paginated results
    signature_requests = query.order_by(SignatureRequest.created_at.desc()).offset(skip).limit(limit).all()
    
    return SignatureRequestListResponse(total=total, signature_requests=signature_requests)


@router.get("/inbox", response_model=SignatureRequestListResponse)
async def get_inbox_signature_requests(
    skip: int = 0,
    limit: int = 50,
    status_filter: Optional[SignerStatus] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get signature requests where current user is a signer (Inbox)
    Shows documents that need your signature
    
    - **skip**: Number of requests to skip (pagination)
    - **limit**: Maximum number of requests to return  
    - **status_filter**: Filter by signer status (pending, signed, declined)
    """
    user_email = current_user.get("email")
    
    if not user_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User email not found in token"
        )
    
    # Find all signers for this email
    signer_query = db.query(Signer).filter(Signer.email == user_email)
    
    if status_filter:
        signer_query = signer_query.filter(Signer.status == status_filter)
    
    signers = signer_query.all()
    
    # Get unique signature request IDs
    request_ids = list(set([s.signature_request_id for s in signers]))
    
    if not request_ids:
        return SignatureRequestListResponse(total=0, signature_requests=[])
    
    # Get signature requests
    query = db.query(SignatureRequest).filter(
        SignatureRequest.id.in_(request_ids)
    )
    
    total = query.count()
    
    signature_requests = query.order_by(
        SignatureRequest.created_at.desc()
    ).offset(skip).limit(limit).all()
    
    return SignatureRequestListResponse(
        total=total,
        signature_requests=signature_requests
    )


@router.get("/{request_id}", response_model=SignatureRequestResponse)
async def get_signature_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get signature request details
    
    - **request_id**: ID of the signature request
    """
    # Get or create user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Get signature request
    signature_request = db.query(SignatureRequest).filter(
        SignatureRequest.id == request_id,
        SignatureRequest.creator_id == user.id
    ).first()
    
    if not signature_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signature request not found"
        )
    
    return signature_request


@router.patch("/{request_id}/status", response_model=SignatureRequestResponse)
async def update_signature_request_status(
    request_id: int,
    status_update: SignatureRequestStatusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Update signature request status
    
    - **request_id**: ID of the signature request
    - **status**: New status (pending, completed, cancelled, expired)
    """
    # Get or create user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Get signature request
    signature_request = db.query(SignatureRequest).filter(
        SignatureRequest.id == request_id,
        SignatureRequest.creator_id == user.id
    ).first()
    
    if not signature_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signature request not found"
        )
    
    old_status = signature_request.status
    signature_request.status = status_update.status
    
    if status_update.status == SignatureRequestStatus.COMPLETED:
        signature_request.completed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(signature_request)
    
    # Log audit event
    log_audit_event(
        db=db,
        user_id=user.id,
        event_type="signature_request_status_updated",
        resource_type="signature_request",
        resource_id=signature_request.id,
        event_data={"old_status": old_status.value, "new_status": status_update.status.value}
    )
    
    return signature_request


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_signature_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a signature request (only if in draft or cancelled status)
    
    - **request_id**: ID of the signature request to delete
    """
    # Get or create user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Get signature request
    signature_request = db.query(SignatureRequest).filter(
        SignatureRequest.id == request_id,
        SignatureRequest.creator_id == user.id
    ).first()
    
    if not signature_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signature request not found"
        )
    
    # Only allow deletion of draft or cancelled requests
    if signature_request.status not in [SignatureRequestStatus.DRAFT, SignatureRequestStatus.CANCELLED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete signature request with status: {signature_request.status.value}"
        )
    
    # Log audit event
    log_audit_event(
        db=db,
        user_id=user.id,
        event_type="signature_request_deleted",
        resource_type="signature_request",
        resource_id=signature_request.id,
        event_data={"title": signature_request.title}
    )
    
    # Delete signature request (cascade will delete signers)
    db.delete(signature_request)
    db.commit()
    
    return None


@router.get("/{request_id}/signers", response_model=List[SignerResponse])
async def get_signature_request_signers(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all signers for a signature request
    
    - **request_id**: ID of the signature request
    """
    # Get or create user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Get signature request
    signature_request = db.query(SignatureRequest).filter(
        SignatureRequest.id == request_id,
        SignatureRequest.creator_id == user.id
    ).first()
    
    if not signature_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signature request not found"
        )
    
    signers = db.query(Signer).filter(
        Signer.signature_request_id == request_id
    ).order_by(Signer.order).all()
    
    return signers
