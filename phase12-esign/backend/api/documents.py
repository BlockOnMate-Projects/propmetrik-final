"""
Document Management API
Handles document uploads, conversion, storage, and retrieval
"""

import uuid
import shutil
from datetime import datetime
from typing import List, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from auth import get_current_user
from database import get_db
from config import settings
from models import Document, DocumentStatus, User, AuditLog


router = APIRouter()


# Pydantic schemas
class DocumentBase(BaseModel):
    title: str
    original_format: Optional[str] = None


class DocumentCreate(DocumentBase):
    pass


class DocumentResponse(DocumentBase):
    id: int
    owner_id: int
    google_drive_id: Optional[str] = None
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    status: DocumentStatus
    conversion_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    total: int
    documents: List[DocumentResponse]


def get_or_create_user(keycloak_id: str, email: str, full_name: Optional[str], db: Session) -> User:
    """Get existing user or create new one"""
    user = db.query(User).filter(User.keycloak_id == keycloak_id).first()
    if not user:
        user = User(
            keycloak_id=keycloak_id,
            email=email,
            full_name=full_name or email.split("@")[0]
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def log_audit_event(
    db: Session,
    user_id: int,
    event_type: str,
    resource_type: str,
    resource_id: int,
    event_data: dict = None,
    ip_address: str = None,
    user_agent: str = None
):
    """Create audit log entry"""
    audit = AuditLog(
        user_id=user_id,
        event_type=event_type,
        resource_type=resource_type,
        resource_id=resource_id,
        event_data=event_data or {},
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.add(audit)
    db.commit()


def validate_file(file: UploadFile) -> None:
    """Validate uploaded file"""
    if file.size and file.size > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum allowed size of {settings.MAX_FILE_SIZE} bytes"
        )
    
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in settings.ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {file_ext} not allowed. Allowed types: {', '.join(settings.ALLOWED_FILE_TYPES)}"
        )


def save_uploaded_file(file: UploadFile, user_id: int) -> tuple[str, int]:
    """
    Save uploaded file to local storage or S3
    Returns: (file_path, file_size)
    """
    # Generate unique filename
    file_ext = Path(file.filename).suffix.lower()
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    
    # Create user directory
    user_dir = Path(settings.UPLOAD_DIR) / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = user_dir / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    file_size = file_path.stat().st_size
    
    # TODO: If S3 configured, upload to S3 instead of local storage
    # if settings.S3_ENDPOINT:
    #     s3_path = upload_to_s3(file_path, user_id, unique_filename)
    #     return s3_path, file_size
    
    return str(file_path.relative_to(settings.UPLOAD_DIR)), file_size


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a new document
    
    - **file**: Document file (PDF, DOC, DOCX)
    - **title**: Optional document title (defaults to filename)
    """
    # Validate file
    validate_file(file)
    
    # Get or create user
    user = get_or_create_user(
        keycloak_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Save file
    file_path, file_size = save_uploaded_file(file, user.id)
    
    # Create document record
    document = Document(
        owner_id=user.id,
        title=title or file.filename,
        original_format=Path(file.filename).suffix[1:],  # Remove leading dot
        file_path=file_path,
        file_size=file_size,
        mime_type=file.content_type,
        status=DocumentStatus.CONVERTED  # Mark as converted for simple files
    )
    
    db.add(document)
    db.commit()
    db.refresh(document)
    
    # Log audit event
    log_audit_event(
        db=db,
        user_id=user.id,
        event_type="document_upload",
        resource_type="document",
        resource_id=document.id,
        event_data={"filename": file.filename, "size": file_size}
    )
    
    return document


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    skip: int = 0,
    limit: int = 50,
    status_filter: Optional[DocumentStatus] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    List user's documents
    
    - **skip**: Number of documents to skip (pagination)
    - **limit**: Maximum number of documents to return
    - **status**: Filter by document status
    """
    # Get or create user
    user = get_or_create_user(
        keycloak_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Build query
    query = db.query(Document).filter(Document.owner_id == user.id)
    
    if status_filter:
        query = query.filter(Document.status == status_filter)
    
    # Get total count
    total = query.count()
    
    # Get paginated results
    documents = query.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()
    
    return DocumentListResponse(total=total, documents=documents)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get document details
    
    - **document_id**: ID of the document
    """
    # Get or create user
    user = get_or_create_user(
        keycloak_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Get document
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.owner_id == user.id
    ).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a document
    
    - **document_id**: ID of the document to delete
    """
    # Get or create user
    user = get_or_create_user(
        keycloak_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Get document
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.owner_id == user.id
    ).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Delete file from storage
    if document.file_path:
        file_path = Path(settings.UPLOAD_DIR) / document.file_path
        if file_path.exists():
            file_path.unlink()
    
    # Log audit event
    log_audit_event(
        db=db,
        user_id=user.id,
        event_type="document_delete",
        resource_type="document",
        resource_id=document.id,
        event_data={"title": document.title}
    )
    
    # Delete document record
    db.delete(document)
    db.commit()
    
    return None


@router.get("/{document_id}/download")
async def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Download a document file
    
    - **document_id**: ID of the document to download
    """
    from fastapi.responses import FileResponse
    
    # Get or create user
    user = get_or_create_user(
        keycloak_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Get document
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.owner_id == user.id
    ).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    if not document.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found"
        )
    
    file_path = Path(settings.UPLOAD_DIR) / document.file_path
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found on disk"
        )
    
    # Log audit event
    log_audit_event(
        db=db,
        user_id=user.id,
        event_type="document_download",
        resource_type="document",
        resource_id=document.id,
        event_data={"title": document.title}
    )
    
    return FileResponse(
        path=file_path,
        media_type=document.mime_type or "application/octet-stream",
        filename=document.title
    )
