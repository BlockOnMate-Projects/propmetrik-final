"""
Quick Sign API
Allows users to upload and sign documents directly without creating signature requests
"""

import uuid
import shutil
import io
from datetime import datetime
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from auth import get_current_user
from database import get_db
from config import settings
from models import Document, DocumentStatus, User, AuditLog

# PDF manipulation
try:
    from PyPDF2 import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.utils import ImageReader
    import base64
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False


router = APIRouter()


# Pydantic schemas
class QuickSignRequest(BaseModel):
    signature_data: str  # Base64 encoded signature image
    signature_type: str = "drawn"  # drawn, typed, uploaded
    page: int = 1  # Page number to place signature (1-indexed)
    x: float = 50  # X position (percentage from left)
    y: float = 80  # Y position (percentage from top)
    width: float = 200  # Signature width in pixels
    height: float = 80  # Signature height in pixels


class QuickSignResponse(BaseModel):
    id: int
    title: str
    original_file_path: Optional[str]
    signed_file_path: Optional[str]
    signed_at: datetime
    status: str
    download_url: str

    class Config:
        from_attributes = True


class DocumentSignStatus(BaseModel):
    id: int
    title: str
    is_signed: bool
    signed_at: Optional[datetime]
    signed_file_path: Optional[str]


def get_or_create_user(propmetrik_user_id: str, email: str, full_name: Optional[str], db: Session, organization_id: Optional[str] = None) -> User:
    """Get existing user or create new one"""
    user = db.query(User).filter(User.propmetrik_user_id == propmetrik_user_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user and not user.propmetrik_user_id:
            user.propmetrik_user_id = propmetrik_user_id
            if organization_id:
                user.organization_id = organization_id
            db.commit()
            db.refresh(user)
    if not user:
        user = User(
            propmetrik_user_id=propmetrik_user_id,
            organization_id=organization_id,
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


def embed_signature_in_pdf(
    pdf_path: Path,
    signature_data: str,
    page_num: int,
    x_percent: float,
    y_percent: float,
    sig_width: float,
    sig_height: float
) -> Path:
    """
    Embed signature image into a PDF document
    
    Args:
        pdf_path: Path to the original PDF
        signature_data: Base64 encoded signature image
        page_num: Page number (1-indexed)
        x_percent: X position as percentage from left
        y_percent: Y position as percentage from top
        sig_width: Signature width in pixels
        sig_height: Signature height in pixels
    
    Returns:
        Path to the signed PDF
    """
    if not PDF_SUPPORT:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="PDF signing not available. Install PyPDF2 and reportlab."
        )
    
    # Decode signature image
    if signature_data.startswith('data:'):
        # Remove data URL prefix
        signature_data = signature_data.split(',')[1]
    
    signature_bytes = base64.b64decode(signature_data)
    signature_image = ImageReader(io.BytesIO(signature_bytes))
    
    # Read the original PDF
    reader = PdfReader(str(pdf_path))
    writer = PdfWriter()
    
    # Get page dimensions
    target_page_idx = min(page_num - 1, len(reader.pages) - 1)
    page = reader.pages[target_page_idx]
    page_width = float(page.mediabox.width)
    page_height = float(page.mediabox.height)
    
    # Calculate signature position
    # x_percent is from left, y_percent is from top
    sig_x = (x_percent / 100) * page_width
    sig_y = page_height - (y_percent / 100) * page_height - sig_height
    
    # Create signature overlay
    packet = io.BytesIO()
    can = canvas.Canvas(packet, pagesize=(page_width, page_height))
    
    # Draw signature
    can.drawImage(
        signature_image,
        sig_x,
        sig_y,
        width=sig_width,
        height=sig_height,
        preserveAspectRatio=True,
        mask='auto'
    )
    
    # Add timestamp
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    can.setFont("Helvetica", 8)
    can.setFillColorRGB(0.3, 0.3, 0.3)
    can.drawString(sig_x, sig_y - 12, f"Digitally signed: {timestamp}")
    
    can.save()
    packet.seek(0)
    
    # Merge signature overlay with original PDF
    overlay_reader = PdfReader(packet)
    
    for i, page in enumerate(reader.pages):
        if i == target_page_idx:
            page.merge_page(overlay_reader.pages[0])
        writer.add_page(page)
    
    # Save signed PDF
    signed_path = pdf_path.parent / f"signed_{pdf_path.name}"
    with open(signed_path, 'wb') as output_file:
        writer.write(output_file)
    
    return signed_path


@router.post("/upload-and-sign", response_model=QuickSignResponse, status_code=status.HTTP_201_CREATED)
async def upload_and_sign(
    file: UploadFile = File(...),
    signature_data: str = None,
    signature_type: str = "drawn",
    page: int = 1,
    x: float = 50,
    y: float = 85,
    width: float = 200,
    height: float = 80,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload and sign a document in one step
    
    - **file**: Document file (PDF only for signing)
    - **signature_data**: Base64 encoded signature image
    - **signature_type**: Type of signature (drawn, typed, uploaded)
    - **page**: Page number to place signature (1-indexed)
    - **x**: X position as percentage from left (0-100)
    - **y**: Y position as percentage from top (0-100)
    - **width**: Signature width in pixels
    - **height**: Signature height in pixels
    """
    if not signature_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signature data is required"
        )
    
    # Only support PDF for now
    file_ext = Path(file.filename).suffix.lower()
    if file_ext != '.pdf':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files can be signed directly. Upload PDF or use signature requests for other formats."
        )
    
    # Get or create user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
        email=current_user.get("email"),
        full_name=current_user.get("name"),
        db=db
    )
    
    # Save uploaded file
    unique_filename = f"{uuid.uuid4()}.pdf"
    user_dir = Path(settings.UPLOAD_DIR) / str(user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    
    original_path = user_dir / unique_filename
    with open(original_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    file_size = original_path.stat().st_size
    
    # Embed signature
    try:
        signed_path = embed_signature_in_pdf(
            pdf_path=original_path,
            signature_data=signature_data,
            page_num=page,
            x_percent=x,
            y_percent=y,
            sig_width=width,
            sig_height=height
        )
        signed_file_path = str(signed_path.relative_to(settings.UPLOAD_DIR))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sign document: {str(e)}"
        )
    
    # Create document record
    document = Document(
        owner_id=user.id,
        title=file.filename,
        original_format="pdf",
        file_path=str(original_path.relative_to(settings.UPLOAD_DIR)),
        signed_file_path=signed_file_path,
        file_size=file_size,
        mime_type="application/pdf",
        status=DocumentStatus.CONVERTED,
        extra_data={
            "quick_signed": True,
            "signed_at": datetime.utcnow().isoformat(),
            "signature_type": signature_type,
            "signer_email": current_user.get("email"),
            "signer_name": current_user.get("name"),
            "signature_position": {
                "page": page,
                "x": x,
                "y": y,
                "width": width,
                "height": height
            }
        }
    )
    
    db.add(document)
    db.commit()
    db.refresh(document)
    
    # Log audit event
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("User-Agent") if request else None
    
    log_audit_event(
        db=db,
        user_id=user.id,
        event_type="quick_sign",
        resource_type="document",
        resource_id=document.id,
        event_data={
            "filename": file.filename,
            "signature_type": signature_type,
            "page": page
        },
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    return QuickSignResponse(
        id=document.id,
        title=document.title,
        original_file_path=document.file_path,
        signed_file_path=document.signed_file_path,
        signed_at=datetime.utcnow(),
        status="signed",
        download_url=f"/quick-sign/{document.id}/download"
    )


@router.post("/{document_id}/sign", response_model=QuickSignResponse)
async def sign_existing_document(
    document_id: int,
    sign_request: QuickSignRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Sign an existing uploaded document
    
    - **document_id**: ID of the document to sign
    - **signature_data**: Base64 encoded signature image
    - **page**: Page number to place signature
    - **x**: X position as percentage from left
    - **y**: Y position as percentage from top
    """
    # Get user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
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
    
    if document.signed_file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document is already signed"
        )
    
    # Check if PDF
    if document.original_format != 'pdf' and document.mime_type != 'application/pdf':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF documents can be signed directly"
        )
    
    # Get original file path
    original_path = Path(settings.UPLOAD_DIR) / document.file_path
    if not original_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found"
        )
    
    # Embed signature
    try:
        signed_path = embed_signature_in_pdf(
            pdf_path=original_path,
            signature_data=sign_request.signature_data,
            page_num=sign_request.page,
            x_percent=sign_request.x,
            y_percent=sign_request.y,
            sig_width=sign_request.width,
            sig_height=sign_request.height
        )
        signed_file_path = str(signed_path.relative_to(settings.UPLOAD_DIR))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sign document: {str(e)}"
        )
    
    # Update document
    document.signed_file_path = signed_file_path
    document.extra_data = {
        **(document.extra_data or {}),
        "quick_signed": True,
        "signed_at": datetime.utcnow().isoformat(),
        "signature_type": sign_request.signature_type,
        "signer_email": current_user.get("email"),
        "signer_name": current_user.get("name"),
        "signature_position": {
            "page": sign_request.page,
            "x": sign_request.x,
            "y": sign_request.y,
            "width": sign_request.width,
            "height": sign_request.height
        }
    }
    
    db.commit()
    db.refresh(document)
    
    # Log audit event
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    
    log_audit_event(
        db=db,
        user_id=user.id,
        event_type="quick_sign",
        resource_type="document",
        resource_id=document.id,
        event_data={
            "signature_type": sign_request.signature_type,
            "page": sign_request.page
        },
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    return QuickSignResponse(
        id=document.id,
        title=document.title,
        original_file_path=document.file_path,
        signed_file_path=document.signed_file_path,
        signed_at=datetime.utcnow(),
        status="signed",
        download_url=f"/quick-sign/{document.id}/download"
    )


@router.get("/{document_id}/status", response_model=DocumentSignStatus)
async def get_document_sign_status(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Check if a document has been signed
    """
    # Get user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
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
    
    is_signed = document.signed_file_path is not None
    signed_at = None
    
    if is_signed and document.extra_data:
        signed_at_str = document.extra_data.get("signed_at")
        if signed_at_str:
            signed_at = datetime.fromisoformat(signed_at_str)
    
    return DocumentSignStatus(
        id=document.id,
        title=document.title,
        is_signed=is_signed,
        signed_at=signed_at,
        signed_file_path=document.signed_file_path
    )


@router.get("/{document_id}/download")
async def download_signed_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Download the signed version of a document
    """
    # Get user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
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
    
    if not document.signed_file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document has not been signed yet"
        )
    
    signed_path = Path(settings.UPLOAD_DIR) / document.signed_file_path
    
    if not signed_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signed document file not found"
        )
    
    # Log audit event
    log_audit_event(
        db=db,
        user_id=user.id,
        event_type="download_signed",
        resource_type="document",
        resource_id=document.id,
        event_data={"title": document.title}
    )
    
    # Generate download filename
    original_name = Path(document.title).stem
    download_name = f"{original_name}_signed.pdf"
    
    return FileResponse(
        path=signed_path,
        media_type="application/pdf",
        filename=download_name
    )


@router.get("/{document_id}/preview")
async def preview_document(
    document_id: int,
    signed: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get document for preview (returns the PDF file inline)
    
    - **signed**: If true, return signed version; otherwise return original
    """
    # Get user
    user = get_or_create_user(
        propmetrik_user_id=current_user.get("sub"),
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
    
    if signed:
        if not document.signed_file_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document has not been signed yet"
            )
        file_path = Path(settings.UPLOAD_DIR) / document.signed_file_path
    else:
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
    
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"}
    )
