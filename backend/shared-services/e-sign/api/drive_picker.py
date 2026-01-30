"""
Google Drive Picker for E-Sign
Allows users to browse and select files from their Google Drive for signing.
Uses Phase 8's Google Workspace API via the drive_bridge.
"""

from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from auth import get_current_user
from database import get_db
from config import settings
from models import User, GoogleToken, Document, DocumentStatus
from api.drive_bridge import drive_bridge
from api.google_drive import get_or_refresh_token


router = APIRouter()


class DriveFileResponse(BaseModel):
    """Response for a single drive file."""
    id: str
    name: str
    mime_type: str
    size: Optional[int] = None
    modified_time: Optional[str] = None
    web_view_link: Optional[str] = None
    thumbnail_link: Optional[str] = None
    can_sign: bool = False


class DriveFilesResponse(BaseModel):
    """Response for file listing."""
    files: List[Dict[str, Any]]
    next_page_token: Optional[str] = None
    folders: Optional[List[Dict[str, Any]]] = None


class FolderResponse(BaseModel):
    """Response for folder listing."""
    folders: List[Dict[str, Any]]
    current_folder: Optional[str] = None


class ImportRequest(BaseModel):
    """Request to import a file for signing."""
    file_id: str
    upload_to_drive_after_sign: bool = True
    destination_folder_id: Optional[str] = None


class ImportResponse(BaseModel):
    """Response after importing a file."""
    document_id: int
    title: str
    google_drive_id: str
    status: str
    ready_for_signing: bool


@router.get("/picker/files", response_model=DriveFilesResponse)
async def browse_drive_files(
    folder_id: Optional[str] = None,
    query: Optional[str] = None,
    page_token: Optional[str] = None,
    include_folders: bool = Query(default=True, description="Include folder list for navigation"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Browse Google Drive files available for signing.
    
    Returns signable files (PDF, DOCX, Google Docs) and optionally folders
    for navigation.
    
    This endpoint uses Phase 8's Google Workspace API.
    """
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's Google access token
    access_token = get_or_refresh_token(db, user.id)
    
    try:
        # Get files from Phase 8
        result = await drive_bridge.list_signable_files(
            access_token=access_token,
            folder_id=folder_id,
            query=query,
            page_token=page_token,
        )
        
        response = DriveFilesResponse(
            files=result.get("files", []),
            next_page_token=result.get("next_page_token"),
        )
        
        # Include folders for navigation if requested
        if include_folders:
            folders = await drive_bridge.list_folders(
                access_token=access_token,
                parent_id=folder_id,
            )
            response.folders = folders
        
        return response
        
    except Exception as e:
        if "401" in str(e):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google Drive access expired. Please re-authorize."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to browse Google Drive: {str(e)}"
        )


@router.get("/picker/folders", response_model=FolderResponse)
async def browse_folders(
    parent_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    List folders in Google Drive for navigation.
    """
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    access_token = get_or_refresh_token(db, user.id)
    
    try:
        folders = await drive_bridge.list_folders(
            access_token=access_token,
            parent_id=parent_id,
        )
        
        return FolderResponse(
            folders=folders,
            current_folder=parent_id,
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list folders: {str(e)}"
        )


@router.get("/picker/file/{file_id}")
async def get_file_details(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get detailed information about a specific file before importing.
    """
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    access_token = get_or_refresh_token(db, user.id)
    
    try:
        file_info = await drive_bridge.get_file(access_token, file_id)
        esign_info = await drive_bridge.prepare_for_esign(access_token, file_id)
        
        return {
            "file": file_info,
            "esign_info": esign_info,
            "can_import": esign_info.get("ready_for_esign", False),
        }
        
    except Exception as e:
        if "400" in str(e):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This file type cannot be signed"
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get file details: {str(e)}"
        )


@router.post("/picker/import", response_model=ImportResponse)
async def import_from_drive(
    request: ImportRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Import a file from Google Drive into E-Sign for signing.
    
    This:
    1. Fetches file metadata from Google Drive (via Phase 8)
    2. Downloads the file content (converts Google Docs to PDF)
    3. Creates a Document record in E-Sign
    4. Stores file locally for signing
    
    After signing, if upload_to_drive_after_sign is True, the signed
    document will be uploaded back to Google Drive.
    """
    from api.documents import get_or_create_user, log_audit_event
    import os
    
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        user = get_or_create_user(
            current_user["sub"],
            current_user.get("email"),
            current_user.get("name"),
            db
        )
    
    access_token = get_or_refresh_token(db, user.id)
    
    try:
        # Get file info and verify it can be signed
        esign_info = await drive_bridge.prepare_for_esign(access_token, request.file_id)
        
        if not esign_info.get("ready_for_esign"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This file cannot be signed"
            )
        
        file_meta = esign_info.get("file", {})
        download_info = esign_info.get("download_info", {})
        
        # Download the file content
        export_format = None
        if download_info.get("requires_export"):
            export_format = "application/pdf"
        
        file_content = await drive_bridge.download_file(
            access_token=access_token,
            file_id=request.file_id,
            export_format=export_format,
        )
        
        # Determine filename
        filename = file_meta.get("name", "document")
        if export_format == "application/pdf" and not filename.endswith(".pdf"):
            filename = f"{filename.rsplit('.', 1)[0]}.pdf" if "." in filename else f"{filename}.pdf"
        
        # Save file locally
        upload_dir = settings.UPLOAD_DIR if hasattr(settings, 'UPLOAD_DIR') else "/app/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        
        file_path = os.path.join(upload_dir, f"gdrive_{request.file_id}_{filename}")
        with open(file_path, "wb") as f:
            f.write(file_content)
        
        # Create document record
        document = Document(
            owner_id=user.id,
            google_drive_id=request.file_id,
            title=file_meta.get("name", filename),
            original_format="google_drive",
            mime_type=export_format or file_meta.get("mime_type"),
            file_size=len(file_content),
            file_path=file_path,
            status=DocumentStatus.CONVERTED,
            # Store metadata for uploading back after signing
            extra_data={
                "source": "google_drive",
                "upload_after_sign": request.upload_to_drive_after_sign,
                "destination_folder_id": request.destination_folder_id,
                "original_mime_type": file_meta.get("mime_type"),
            }
        )
        
        db.add(document)
        db.commit()
        db.refresh(document)
        
        # Log audit event
        log_audit_event(
            db=db,
            user_id=user.id,
            event_type="document_imported_from_drive",
            resource_type="document",
            resource_id=document.id,
            event_data={
                "google_drive_id": request.file_id,
                "file_name": file_meta.get("name"),
                "upload_after_sign": request.upload_to_drive_after_sign,
            }
        )
        
        print(f"✅ Imported Google Drive document: {file_meta.get('name')} -> Document ID: {document.id}")
        
        return ImportResponse(
            document_id=document.id,
            title=document.title,
            google_drive_id=request.file_id,
            status=document.status.value if hasattr(document.status, 'value') else str(document.status),
            ready_for_signing=True,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Failed to import from Google Drive: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import document: {str(e)}"
        )


@router.get("/picker/recent")
async def get_recent_files(
    max_results: int = Query(default=10, le=50),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get recently modified files that can be signed.
    Quick access for the file picker.
    """
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    access_token = get_or_refresh_token(db, user.id)
    
    try:
        result = await drive_bridge.get_recent_files(
            access_token=access_token,
            max_results=max_results,
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get recent files: {str(e)}"
        )


@router.get("/picker/shared")
async def get_shared_files(
    max_results: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get files shared with the user that can be signed.
    """
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    access_token = get_or_refresh_token(db, user.id)
    
    try:
        files = await drive_bridge.get_shared_files(
            access_token=access_token,
            max_results=max_results,
        )
        return {"files": files}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get shared files: {str(e)}"
        )


@router.post("/picker/upload-signed/{document_id}")
async def upload_signed_to_drive(
    document_id: int,
    folder_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a signed document back to Google Drive.
    
    Called after a document has been signed. Creates a new file
    with "_signed" suffix in Google Drive.
    """
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get the document
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.owner_id == user.id
    ).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.signed_file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document has not been signed yet"
        )
    
    access_token = get_or_refresh_token(db, user.id)
    
    try:
        # Read signed file
        with open(document.signed_file_path, "rb") as f:
            signed_content = f.read()
        
        # Determine filename
        base_name = document.title.rsplit(".", 1)[0] if "." in document.title else document.title
        signed_filename = f"{base_name}_signed.pdf"
        
        # Determine destination folder
        dest_folder = folder_id
        if not dest_folder and document.extra_data:
            dest_folder = document.extra_data.get("destination_folder_id")
        
        # Upload to Drive via Phase 8
        result = await drive_bridge.upload_signed_document(
            access_token=access_token,
            file_content=signed_content,
            original_file_id=document.google_drive_id,
            filename=signed_filename,
            folder_id=dest_folder,
        )
        
        # Update document record
        document.signed_drive_id = result.get("signed_file", {}).get("id")
        document.extra_data = document.extra_data or {}
        document.extra_data["uploaded_to_drive"] = True
        document.extra_data["signed_drive_id"] = document.signed_drive_id
        db.commit()
        
        # Log audit event
        from api.documents import log_audit_event
        log_audit_event(
            db=db,
            user_id=user.id,
            event_type="signed_document_uploaded_to_drive",
            resource_type="document",
            resource_id=document.id,
            event_data={
                "signed_drive_id": document.signed_drive_id,
                "folder_id": dest_folder,
            }
        )
        
        print(f"✅ Uploaded signed document to Google Drive: {signed_filename}")
        
        return {
            "uploaded": True,
            "signed_file": result.get("signed_file"),
            "document_id": document_id,
        }
        
    except Exception as e:
        print(f"❌ Failed to upload signed document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload signed document: {str(e)}"
        )
