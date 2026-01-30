"""
Templates API - Reusable document templates with pre-configured fields
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import json
import uuid

from auth import get_current_user
from database import get_db
from models import Template

router = APIRouter(prefix="/templates", tags=["templates"])


class FieldPosition(BaseModel):
    type: str
    page: int
    x: float
    y: float
    width: float
    height: float
    required: bool = True


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    category: Optional[str] = "General"
    document_name: Optional[str] = None
    document_drive_id: Optional[str] = None
    fields: List[FieldPosition] = []


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    fields: Optional[List[FieldPosition]] = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    category: str
    document_name: Optional[str]
    document_drive_id: Optional[str]
    fields: List[dict]
    is_shared: bool
    used_count: int
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.post("/", response_model=dict)
async def create_template(
    template: TemplateCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Create a new template from document and field configuration.
    """
    try:
        username = user.get('preferred_username', user.get('email', 'unknown'))
        template_id = str(uuid.uuid4())

        db_template = Template(
            id=template_id,
            name=template.name,
            description=template.description,
            category=template.category,
            document_name=template.document_name,
            document_drive_id=template.document_drive_id,
            fields=[f.dict() for f in template.fields],
            is_shared=False,
            used_count=0,
            created_by=username,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        db.add(db_template)
        db.commit()
        db.refresh(db_template)

        return {
            "id": template_id,
            "name": template.name,
            "message": "Template created successfully"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create template: {str(e)}")


@router.get("/", response_model=List[TemplateResponse])
async def list_templates(
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    List all templates accessible to the user.
    """
    try:
        username = user.get('preferred_username', user.get('email', 'unknown'))
        
        query = db.query(Template).filter(
            (Template.created_by == username) | (Template.is_shared == True)
        )

        if category:
            query = query.filter(Template.category == category)

        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                (Template.name.ilike(search_pattern)) | 
                (Template.description.ilike(search_pattern))
            )

        templates = query.order_by(Template.used_count.desc(), Template.created_at.desc()).all()

        return [
            TemplateResponse(
                id=t.id,
                name=t.name,
                description=t.description,
                category=t.category or "General",
                document_name=t.document_name,
                document_drive_id=t.document_drive_id,
                fields=t.fields if isinstance(t.fields, list) else json.loads(t.fields) if t.fields else [],
                is_shared=t.is_shared or False,
                used_count=t.used_count or 0,
                created_by=t.created_by,
                created_at=t.created_at,
                updated_at=t.updated_at
            )
            for t in templates
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list templates: {str(e)}")


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get template details.
    """
    username = user.get('preferred_username', user.get('email', 'unknown'))
    
    template = db.query(Template).filter(
        Template.id == template_id,
        (Template.created_by == username) | (Template.is_shared == True)
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return TemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        category=template.category or "General",
        document_name=template.document_name,
        document_drive_id=template.document_drive_id,
        fields=template.fields if isinstance(template.fields, list) else json.loads(template.fields) if template.fields else [],
        is_shared=template.is_shared or False,
        used_count=template.used_count or 0,
        created_by=template.created_by,
        created_at=template.created_at,
        updated_at=template.updated_at
    )


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    update: TemplateUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Update a template.
    """
    username = user.get('preferred_username', user.get('email', 'unknown'))

    template = db.query(Template).filter(
        Template.id == template_id,
        Template.created_by == username
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found or unauthorized")

    if update.name is not None:
        template.name = update.name
    if update.description is not None:
        template.description = update.description
    if update.category is not None:
        template.category = update.category
    if update.fields is not None:
        template.fields = [f.dict() for f in update.fields]
    
    template.updated_at = datetime.utcnow()

    try:
        db.commit()
        return {"success": True, "message": "Template updated"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update template: {str(e)}")


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Delete a template.
    """
    username = user.get('preferred_username', user.get('email', 'unknown'))

    template = db.query(Template).filter(
        Template.id == template_id,
        Template.created_by == username,
        Template.is_shared == False
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found, unauthorized, or is a shared template")

    try:
        db.delete(template)
        db.commit()
        return {"success": True, "message": "Template deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete template: {str(e)}")


@router.post("/{template_id}/use")
async def use_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Record template usage and return template data for envelope creation.
    """
    username = user.get('preferred_username', user.get('email', 'unknown'))

    template = db.query(Template).filter(
        Template.id == template_id,
        (Template.created_by == username) | (Template.is_shared == True)
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Increment usage count
    template.used_count = (template.used_count or 0) + 1

    try:
        db.commit()
        
        return {
            "id": template.id,
            "name": template.name,
            "description": template.description,
            "category": template.category,
            "document_name": template.document_name,
            "document_drive_id": template.document_drive_id,
            "fields": template.fields if isinstance(template.fields, list) else json.loads(template.fields) if template.fields else [],
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to use template: {str(e)}")


@router.get("/categories/list")
async def list_categories(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get list of all template categories.
    """
    username = user.get('preferred_username', user.get('email', 'unknown'))

    templates = db.query(Template.category).filter(
        (Template.created_by == username) | (Template.is_shared == True)
    ).distinct().all()

    categories = [t[0] for t in templates if t[0]]
    return sorted(set(categories))
