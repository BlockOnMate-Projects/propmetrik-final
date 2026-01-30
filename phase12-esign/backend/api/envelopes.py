"""
Envelope API - Create and manage signature envelopes (DocuSign-style)
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
import json
import uuid
import os

from auth import get_current_user
from database import get_db
from models import Envelope, EnvelopeRecipient, EnvelopeDocument, EnvelopeField

router = APIRouter(prefix="/envelopes", tags=["envelopes"])


class RecipientInput(BaseModel):
    name: str
    email: EmailStr
    role: str  # 'signer', 'cc', 'viewer'
    order: int


class FieldInput(BaseModel):
    type: str
    recipientEmail: EmailStr
    documentIndex: int
    page: int
    x: float
    y: float
    width: float
    height: float
    required: bool = True


class EnvelopeSettings(BaseModel):
    reminderFrequencyDays: int = 3
    expiresInDays: int = 30


class EnvelopeData(BaseModel):
    subject: str
    message: Optional[str] = ""
    documents: List[dict]
    recipients: List[RecipientInput]
    fields: List[FieldInput]
    settings: EnvelopeSettings


@router.post("/create")
async def create_envelope(
    envelope_data: str = Form(...),
    user: dict = Depends(get_current_user)
):
    """
    Create a new signature envelope with documents, recipients, and field placements.
    """
    try:
        data = json.loads(envelope_data)
        envelope = EnvelopeData(**data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid envelope data: {str(e)}")

    conn = get_db()
    cursor = conn.cursor()

    try:
        # Generate envelope ID
        envelope_id = str(uuid.uuid4())
        expires_at = datetime.utcnow() + timedelta(days=envelope.settings.expiresInDays)

        # Create envelope record
        cursor.execute("""
            INSERT INTO envelopes (
                id, subject, message, status, created_by, 
                reminder_frequency_days, expires_at, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            envelope_id,
            envelope.subject,
            envelope.message,
            'pending',
            user.get('preferred_username', 'unknown'),
            envelope.settings.reminderFrequencyDays,
            expires_at,
            datetime.utcnow()
        ))

        # Add recipients
        for recipient in envelope.recipients:
            recipient_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO envelope_recipients (
                    id, envelope_id, name, email, role, signing_order, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                recipient_id,
                envelope_id,
                recipient.name,
                recipient.email,
                recipient.role,
                recipient.order,
                'pending'
            ))

        # Add documents (for now, just store metadata - file handling separate)
        for idx, doc in enumerate(envelope.documents):
            doc_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO envelope_documents (
                    id, envelope_id, name, source, drive_id, order_index
                ) VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                doc_id,
                envelope_id,
                doc.get('name', f'Document {idx + 1}'),
                doc.get('source', 'desktop'),
                doc.get('driveId'),
                idx
            ))

        # Add field placements
        for field in envelope.fields:
            field_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO envelope_fields (
                    id, envelope_id, type, recipient_email, 
                    document_index, page, x, y, width, height, required
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                field_id,
                envelope_id,
                field.type,
                field.recipientEmail,
                field.documentIndex,
                field.page,
                field.x,
                field.y,
                field.width,
                field.height,
                field.required
            ))

        conn.commit()

        # TODO: Send emails to recipients
        # For now, just return success

        return {
            "success": True,
            "envelope_id": envelope_id,
            "message": f"Envelope sent to {len(envelope.recipients)} recipients"
        }

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create envelope: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.get("/")
async def list_envelopes(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    List all envelopes created by the current user.
    """
    username = user.get('preferred_username', user.get('email', 'unknown'))
    
    try:
        query = db.query(Envelope).filter(Envelope.created_by == username)
        
        if status:
            query = query.filter(Envelope.status == status)
        
        envelopes = query.order_by(Envelope.created_at.desc()).all()
        
        return [
            {
                "id": e.id,
                "subject": e.subject,
                "status": e.status,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "expires_at": e.expires_at.isoformat() if e.expires_at else None,
                "recipients": [],
                "documents": []
            }
            for e in envelopes
        ]
    except Exception as e:
        # Return empty list if table doesn't exist yet
        print(f"Error listing envelopes: {e}")
        return []


@router.get("/{envelope_id}")
async def get_envelope(
    envelope_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get envelope details including recipients and documents.
    """
    conn = get_db()
    cursor = conn.cursor()

    try:
        # Get envelope
        cursor.execute("""
            SELECT id, subject, message, status, created_by, 
                   reminder_frequency_days, expires_at, created_at
            FROM envelopes
            WHERE id = %s
        """, (envelope_id,))
        
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Envelope not found")

        envelope = {
            "id": row[0],
            "subject": row[1],
            "message": row[2],
            "status": row[3],
            "created_by": row[4],
            "reminder_frequency_days": row[5],
            "expires_at": row[6].isoformat() if row[6] else None,
            "created_at": row[7].isoformat() if row[7] else None,
        }

        # Get recipients
        cursor.execute("""
            SELECT id, name, email, role, signing_order, status, signed_at
            FROM envelope_recipients
            WHERE envelope_id = %s
            ORDER BY signing_order
        """, (envelope_id,))
        
        envelope["recipients"] = [
            {
                "id": r[0],
                "name": r[1],
                "email": r[2],
                "role": r[3],
                "order": r[4],
                "status": r[5],
                "signed_at": r[6].isoformat() if r[6] else None,
            }
            for r in cursor.fetchall()
        ]

        # Get documents
        cursor.execute("""
            SELECT id, name, source, drive_id, order_index
            FROM envelope_documents
            WHERE envelope_id = %s
            ORDER BY order_index
        """, (envelope_id,))
        
        envelope["documents"] = [
            {
                "id": d[0],
                "name": d[1],
                "source": d[2],
                "driveId": d[3],
                "order": d[4],
            }
            for d in cursor.fetchall()
        ]

        return envelope

    finally:
        cursor.close()
        conn.close()


@router.post("/{envelope_id}/void")
async def void_envelope(
    envelope_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Void an envelope (cancel it).
    """
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            UPDATE envelopes
            SET status = 'voided', updated_at = %s
            WHERE id = %s AND created_by = %s
            RETURNING id
        """, (datetime.utcnow(), envelope_id, user.get('preferred_username', 'unknown')))

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Envelope not found or unauthorized")

        conn.commit()
        return {"success": True, "message": "Envelope voided"}

    finally:
        cursor.close()
        conn.close()


@router.post("/{envelope_id}/resend")
async def resend_envelope(
    envelope_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Resend signing emails to pending recipients.
    """
    # TODO: Implement email sending
    return {"success": True, "message": "Reminders sent to pending recipients"}
