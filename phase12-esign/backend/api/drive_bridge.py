"""
Google Drive Bridge for E-Sign Integration
Connects Phase 12 E-Sign to Phase 8's Google Drive API
"""

import os
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel


class DriveFile(BaseModel):
    """Drive file model."""
    id: str
    name: str
    mime_type: str
    size: Optional[int] = None
    created_time: Optional[datetime] = None
    modified_time: Optional[datetime] = None
    web_view_link: Optional[str] = None
    thumbnail_link: Optional[str] = None
    icon_link: Optional[str] = None
    can_sign: bool = False


class GoogleDriveBridge:
    """
    Bridge service to connect Phase 12 E-Sign with Phase 8 Google Drive API.
    
    Instead of duplicating Google Drive logic, Phase 12 calls Phase 8's
    centralized Drive service.
    """
    
    def __init__(self):
        # Phase 8 Google Workspace API URL
        self.phase8_url = os.getenv("GOOGLE_WORKSPACE_API_URL", "http://localhost:8008")
    
    async def list_signable_files(
        self,
        access_token: str,
        folder_id: Optional[str] = None,
        query: Optional[str] = None,
        page_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List files from Google Drive that can be signed.
        Calls Phase 8's /api/v1/google/drive/esign/files endpoint.
        """
        params = {}
        if folder_id:
            params["folder_id"] = folder_id
        if query:
            params["query"] = query
        if page_token:
            params["page_token"] = page_token
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.phase8_url}/api/v1/google/drive/esign/files",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()
    
    async def list_folders(
        self,
        access_token: str,
        parent_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List folders for navigation."""
        params = {}
        if parent_id:
            params["parent_id"] = parent_id
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.phase8_url}/api/v1/google/drive/folders",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("folders", [])
    
    async def get_file(
        self,
        access_token: str,
        file_id: str,
    ) -> Dict[str, Any]:
        """Get file metadata."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.phase8_url}/api/v1/google/drive/files/{file_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()
    
    async def prepare_for_esign(
        self,
        access_token: str,
        file_id: str,
    ) -> Dict[str, Any]:
        """
        Prepare a file for e-signature.
        Returns file metadata and download information.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.phase8_url}/api/v1/google/drive/esign/import/{file_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()
    
    async def download_file(
        self,
        access_token: str,
        file_id: str,
        export_format: Optional[str] = None,
    ) -> bytes:
        """
        Download file content from Google Drive via Phase 8.
        For Google Docs, exports to PDF by default.
        """
        params = {}
        if export_format:
            params["export_format"] = export_format
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.phase8_url}/api/v1/google/drive/files/{file_id}/download",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
                timeout=60.0,
            )
            response.raise_for_status()
            return response.content
    
    async def upload_signed_document(
        self,
        access_token: str,
        file_content: bytes,
        original_file_id: str,
        filename: str,
        folder_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Upload a signed document back to Google Drive.
        """
        params = {"original_file_id": original_file_id}
        if folder_id:
            params["folder_id"] = folder_id
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.phase8_url}/api/v1/google/drive/esign/upload-signed",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
                files={"file": (filename, file_content, "application/pdf")},
                timeout=60.0,
            )
            response.raise_for_status()
            return response.json()
    
    async def get_shared_files(
        self,
        access_token: str,
        max_results: int = 20,
    ) -> List[Dict[str, Any]]:
        """List files shared with the user that can be signed."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.phase8_url}/api/v1/google/drive/shared",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"max_results": max_results, "signable_only": True},
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("files", [])
    
    async def get_recent_files(
        self,
        access_token: str,
        max_results: int = 10,
    ) -> Dict[str, Any]:
        """List recently modified signable files."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.phase8_url}/api/v1/google/drive/recent",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"max_results": max_results, "signable_only": True},
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()


# Singleton instance
drive_bridge = GoogleDriveBridge()
