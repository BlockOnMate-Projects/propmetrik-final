"""
Google OAuth and Drive Integration
Handles OAuth2 flow and Google Drive API interactions
"""

import os
import json
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

import requests
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from config import settings
from models import User, GoogleToken


router = APIRouter()


def get_google_oauth_url(state: str = None) -> str:
    """
    Generate Google OAuth authorization URL
    
    Args:
        state: Optional state parameter for CSRF protection
    
    Returns:
        Authorization URL
    """
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(settings.GOOGLE_SCOPES_LIST),
        "access_type": "offline",
        "prompt": "consent",  # Force consent to get refresh token
    }
    
    if state:
        params["state"] = state
    
    query_string = "&".join([f"{k}={requests.utils.quote(str(v))}" for k, v in params.items()])
    return f"{settings.GOOGLE_AUTH_URL}?{query_string}"


def exchange_code_for_tokens(code: str) -> Dict[str, Any]:
    """
    Exchange authorization code for access and refresh tokens
    
    Args:
        code: Authorization code from OAuth callback
    
    Returns:
        Token response with access_token, refresh_token, expires_in, etc.
    """
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    
    response = requests.post(settings.GOOGLE_TOKEN_URL, data=data)
    response.raise_for_status()
    
    return response.json()


def refresh_access_token(refresh_token: str) -> Dict[str, Any]:
    """
    Refresh an expired access token using refresh token
    
    Args:
        refresh_token: Google refresh token
    
    Returns:
        New token response
    """
    data = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    
    response = requests.post(settings.GOOGLE_TOKEN_URL, data=data)
    response.raise_for_status()
    
    return response.json()


def get_or_refresh_token(db: Session, user_id: int) -> str:
    """
    Get valid access token for user, refreshing if expired
    
    Args:
        db: Database session
        user_id: User ID
    
    Returns:
        Valid access token
    
    Raises:
        HTTPException: If no token exists or refresh fails
    """
    google_token = db.query(GoogleToken).filter(
        GoogleToken.user_id == user_id
    ).first()
    
    if not google_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google Drive not connected. Please authorize access."
        )
    
    # Check if token is expired
    if google_token.expires_at and google_token.expires_at <= datetime.utcnow():
        if not google_token.refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired and no refresh token available. Please re-authorize."
            )
        
        # Refresh the token
        try:
            token_response = refresh_access_token(google_token.refresh_token)
            
            google_token.access_token = token_response["access_token"]
            google_token.expires_at = datetime.utcnow() + timedelta(seconds=token_response.get("expires_in", 3600))
            google_token.updated_at = datetime.utcnow()
            
            db.commit()
            db.refresh(google_token)
            
            print(f"✅ Refreshed Google token for user {user_id}")
            
        except Exception as e:
            print(f"❌ Failed to refresh token: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to refresh token. Please re-authorize."
            )
    
    return google_token.access_token


@router.get("/auth/google")
async def google_auth(current_user: dict = Depends(get_current_user)):
    """
    Initiate Google OAuth flow
    Redirects user to Google consent screen
    """
    # Use user's Keycloak ID as state for CSRF protection
    state = current_user["sub"]
    auth_url = get_google_oauth_url(state)
    
    return {"auth_url": auth_url}


@router.get("/auth/google/callback")
async def google_callback(
    code: str,
    state: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Handle Google OAuth callback
    Exchanges code for tokens and stores them
    """
    # Verify state matches user's Keycloak ID (CSRF protection)
    if state != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid state parameter"
        )
    
    try:
        # Exchange code for tokens
        token_response = exchange_code_for_tokens(code)
        
        # Get user from database
        user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
        if not user:
            # Create user if doesn't exist
            user = User(
                keycloak_id=current_user["sub"],
                email=current_user.get("email"),
                full_name=current_user.get("name")
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        
        # Store or update Google token
        google_token = db.query(GoogleToken).filter(
            GoogleToken.user_id == user.id
        ).first()
        
        expires_at = datetime.utcnow() + timedelta(seconds=token_response.get("expires_in", 3600))
        
        if google_token:
            google_token.access_token = token_response["access_token"]
            google_token.refresh_token = token_response.get("refresh_token") or google_token.refresh_token
            google_token.expires_at = expires_at
            google_token.scopes = " ".join(settings.GOOGLE_SCOPES_LIST)
            google_token.updated_at = datetime.utcnow()
        else:
            google_token = GoogleToken(
                user_id=user.id,
                access_token=token_response["access_token"],
                refresh_token=token_response.get("refresh_token"),
                token_type=token_response.get("token_type", "Bearer"),
                expires_at=expires_at,
                scopes=" ".join(settings.GOOGLE_SCOPES_LIST)
            )
            db.add(google_token)
        
        db.commit()
        
        print(f"✅ Google Drive connected for user {user.email}")
        
        # Redirect back to frontend
        return RedirectResponse(url=f"{settings.FRONTEND_URL}?google_auth=success")
        
    except Exception as e:
        print(f"❌ Google OAuth callback error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete Google authorization: {str(e)}"
        )


@router.get("/drive/files")
async def list_drive_files(
    page_token: Optional[str] = None,
    folder_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    List files from user's Google Drive
    
    Query params:
    - page_token: Token for pagination
    - folder_id: Optional folder ID to list files from specific folder
    """
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    access_token = get_or_refresh_token(db, user.id)
    
    # Build query
    query_parts = [
        "trashed = false",
        "(mimeType contains 'document' or mimeType contains 'pdf' or mimeType contains 'word')"
    ]
    
    if folder_id:
        query_parts.append(f"'{folder_id}' in parents")
    
    query = " and ".join(query_parts)
    
    # Call Google Drive API
    params = {
        "q": query,
        "fields": "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, iconLink, webViewLink, thumbnailLink)",
        "pageSize": 50,
        "orderBy": "modifiedTime desc"
    }
    
    if page_token:
        params["pageToken"] = page_token
    
    headers = {"Authorization": f"Bearer {access_token}"}
    
    try:
        response = requests.get(
            f"{settings.GOOGLE_DRIVE_API_URL}/files",
            headers=headers,
            params=params
        )
        response.raise_for_status()
        
        data = response.json()
        
        return {
            "files": data.get("files", []),
            "next_page_token": data.get("nextPageToken")
        }
        
    except requests.exceptions.HTTPError as e:
        print(f"❌ Google Drive API error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch Google Drive files"
        )


@router.get("/drive/file/{file_id}")
async def get_drive_file_metadata(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get metadata for a specific Google Drive file
    """
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    access_token = get_or_refresh_token(db, user.id)
    
    headers = {"Authorization": f"Bearer {access_token}"}
    
    try:
        response = requests.get(
            f"{settings.GOOGLE_DRIVE_API_URL}/files/{file_id}",
            headers=headers,
            params={"fields": "id, name, mimeType, size, createdTime, modifiedTime, webViewLink, exportLinks"}
        )
        response.raise_for_status()
        
        return response.json()
        
    except requests.exceptions.HTTPError as e:
        print(f"❌ Failed to get file metadata: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied"
        )


@router.post("/drive/import/{file_id}")
async def import_drive_document(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Import a Google Drive document into the E-Sign system
    Downloads the file and creates a document record
    """
    from models import Document, DocumentStatus, AuditLog
    from api.documents import get_or_create_user, log_audit_event
    
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        user = get_or_create_user(
            current_user["sub"],
            current_user.get("email"),
            current_user.get("name"),
            db
        )
    
    access_token = get_or_refresh_token(db, user.id)
    
    # Get file metadata
    headers = {"Authorization": f"Bearer {access_token}"}
    
    try:
        # Get metadata
        metadata_response = requests.get(
            f"{settings.GOOGLE_DRIVE_API_URL}/files/{file_id}",
            headers=headers,
            params={"fields": "id, name, mimeType, size, exportLinks"}
        )
        metadata_response.raise_for_status()
        metadata = metadata_response.json()
        
        # Create document record
        document = Document(
            owner_id=user.id,
            google_drive_id=file_id,
            title=metadata["name"],
            original_format="google_drive",
            mime_type=metadata.get("mimeType"),
            file_size=metadata.get("size"),
            status=DocumentStatus.CONVERTED  # Google Drive files are already accessible
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
                "google_drive_id": file_id,
                "file_name": metadata["name"]
            }
        )
        
        print(f"✅ Imported Google Drive document: {metadata['name']}")
        
        return {
            "id": document.id,
            "title": document.title,
            "google_drive_id": file_id,
            "status": document.status
        }
        
    except Exception as e:
        print(f"❌ Failed to import document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import document from Google Drive: {str(e)}"
        )


@router.get("/drive/status")
async def check_drive_connection(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Check if user has connected their Google Drive
    """
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        return {"connected": False}
    
    google_token = db.query(GoogleToken).filter(
        GoogleToken.user_id == user.id
    ).first()
    
    if not google_token:
        return {"connected": False}
    
    return {
        "connected": True,
        "expires_at": google_token.expires_at.isoformat() if google_token.expires_at else None,
        "scopes": google_token.scopes.split() if google_token.scopes else []
    }


@router.delete("/drive/disconnect")
async def disconnect_drive(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Disconnect user's Google Drive by deleting stored tokens
    """
    user = db.query(User).filter(User.keycloak_id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    google_token = db.query(GoogleToken).filter(
        GoogleToken.user_id == user.id
    ).first()
    
    if google_token:
        db.delete(google_token)
        db.commit()
        print(f"✅ Disconnected Google Drive for user {user.email}")
    
    return {"message": "Google Drive disconnected successfully"}
