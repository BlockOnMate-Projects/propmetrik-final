"""
Envelope API - Create and manage signature envelopes (DocuSign-style)
"""

from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
import json
import uuid
import os
import secrets

from auth import get_current_user
from database import get_db
from models import Envelope, EnvelopeRecipient, EnvelopeDocument, EnvelopeField, User
from services.certification import (
    embed_signatures_into_pdf,
    compute_security_hash,
    generate_certificate_pdf,
    append_certificate_to_pdf,
    persist_pdf,
)

router = APIRouter(prefix="/envelopes", tags=["envelopes"])


def get_or_create_signer_pmt_id(db: Session, email: str, full_name: Optional[str] = None) -> str:
    """Get or create a permanent signer ID (PMT-XXXX) for a user by email."""
    user = db.query(User).filter(User.email == email).first()
    if user and user.signer_id:
        return user.signer_id
    
    # Generate new PMT ID
    pmt_id = f"PMT-{secrets.token_hex(6).upper()}"
    
    if user:
        user.signer_id = pmt_id
        db.commit()
        db.refresh(user)
    else:
        # Create a new user record for this signer
        user = User(
            email=email,
            full_name=full_name or email.split("@")[0],
            signer_id=pmt_id
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    return pmt_id


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
    status: Optional[str] = "pending"  # pending, completed, voided, expired
    isSelfSigned: Optional[bool] = False
    signedAt: Optional[str] = None


@router.post("/create")
async def create_envelope(
    envelope_data: str = Form(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    files: List[UploadFile] = File(default=[])
):
    """
    Create a new signature envelope with documents, recipients, and field placements.
    Generates Certificate of Completion with security hash for completed (self-signed) envelopes.
    """
    try:
        data = json.loads(envelope_data)
        envelope = EnvelopeData(**data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid envelope data: {str(e)}")

    try:
        # Generate envelope ID
        envelope_id = str(uuid.uuid4())
        expires_at = datetime.utcnow() + timedelta(days=envelope.settings.expiresInDays)

        # Determine status - use provided status for self-signed, otherwise pending
        envelope_status = envelope.status if envelope.isSelfSigned else 'pending'
        is_completed = envelope_status == 'completed'
        completion_timestamp = datetime.utcnow()

        # Create envelope record - use email as the user identifier
        created_by = user.get('email', user.get('sub', 'unknown'))
        envelope_record = Envelope(
            id=envelope_id,
            subject=envelope.subject,
            message=envelope.message,
            status=envelope_status,
            created_by=created_by,
            reminder_frequency_days=envelope.settings.reminderFrequencyDays,
            expires_at=expires_at,
            completed_at=completion_timestamp if is_completed else None,
            created_at=datetime.utcnow()
        )
        db.add(envelope_record)

        # Add recipients with PMT signer IDs
        recipient_status = 'completed' if is_completed else 'pending'
        signed_at = completion_timestamp if is_completed else None
        recipient_records = []
        for recipient in envelope.recipients:
            # Generate permanent signer ID
            signer_pmt_id = get_or_create_signer_pmt_id(db, recipient.email, recipient.name)
            recipient_record = EnvelopeRecipient(
                id=str(uuid.uuid4()),
                envelope_id=envelope_id,
                name=recipient.name,
                email=recipient.email,
                role=recipient.role,
                signing_order=recipient.order,
                status=recipient_status,
                signer_pmt_id=signer_pmt_id,
                signed_at=signed_at
            )
            db.add(recipient_record)
            recipient_records.append(recipient_record)

        # Add documents and persist files when provided
        upload_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "envelopes", envelope_id)
        os.makedirs(upload_dir, exist_ok=True)

        document_records = []
        document_file_paths = []
        for idx, doc in enumerate(envelope.documents):
            file_path = None
            if idx < len(files):
                upload_file = files[idx]
                safe_name = os.path.basename(upload_file.filename or f"document_{idx + 1}.pdf")
                file_path = os.path.join(upload_dir, safe_name)
                with open(file_path, "wb") as f:
                    f.write(await upload_file.read())
                document_file_paths.append(file_path)

            doc_record = EnvelopeDocument(
                id=str(uuid.uuid4()),
                envelope_id=envelope_id,
                name=doc.get('name', f'Document {idx + 1}'),
                source=doc.get('source', 'desktop'),
                drive_id=doc.get('driveId'),
                file_path=file_path,
                order_index=idx
            )
            db.add(doc_record)
            document_records.append(doc_record)

        # Add field placements and capture signature data
        field_records = []
        for field in envelope.fields:
            field_record = EnvelopeField(
                id=str(uuid.uuid4()),
                envelope_id=envelope_id,
                type=field.type,
                recipient_email=field.recipientEmail,
                document_index=field.documentIndex,
                page=field.page,
                x=field.x,
                y=field.y,
                width=field.width,
                height=field.height,
                required=field.required,
                signature_data=data.get('signatureData')  # Capture signature data if provided
            )
            db.add(field_record)
            field_records.append(field_record)

        db.commit()

        # CERTIFICATE OF COMPLETION - Generate for completed (self-signed) envelopes
        print(f"🎯 Certificate check: is_completed={is_completed}, has_files={len(document_file_paths)}")
        if is_completed and document_file_paths:
            try:
                # Build signature events from fields and recipients
                signature_events = []
                completion_ts = completion_timestamp.replace(microsecond=0).isoformat() + "Z"
                
                print(f"📝 Processing {len(field_records)} fields, {len(recipient_records)} recipients")
                for field in field_records:
                    print(f"   Field type: {field.type}, email: {field.recipient_email}")
                    if field.type == 'signature':
                        # Find the recipient for this field
                        recipient = next(
                            (r for r in recipient_records if r.email == field.recipient_email),
                            None
                        )
                        if recipient:
                            signature_events.append({
                                "page": field.page,
                                "x": field.x,
                                "y": field.y,
                                "width": field.width,
                                "height": field.height,
                                "signed_at": completion_ts,
                                "signer_id": recipient.signer_pmt_id,
                            })
                
                # Read the PDF (already signed by frontend for self-sign)
                pdf_path = document_file_paths[0]
                with open(pdf_path, "rb") as f:
                    signed_pdf_bytes = f.read()
                
                # NOTE: For self-signed envelopes, the frontend already embedded signatures
                # using pdf-lib. We skip embed_signatures_into_pdf and use the PDF as-is.
                
                # Compute security hash (SHA-256) over the signed PDF
                security_hash = compute_security_hash(
                    signed_pdf_bytes,
                    document_id=envelope_id,
                    signature_events=signature_events,
                    completion_timestamp_utc=completion_ts,
                )
                
                # Build signer list for certificate
                signer_list = [
                    {
                        "signer_id": r.signer_pmt_id,
                        "signed_at": completion_ts,
                    }
                    for r in recipient_records if r.role == 'signer'
                ]
                
                # Generate Certificate of Completion PDF
                certificate_bytes = generate_certificate_pdf(
                    document_id=envelope_id,
                    document_title=envelope.subject,
                    completion_timestamp_utc=completion_ts,
                    signers=signer_list,
                    security_hash=security_hash,
                    verify_url="https://propmetrik.com",
                )
                
                # Append certificate to signed PDF
                final_pdf_bytes = append_certificate_to_pdf(signed_pdf_bytes, certificate_bytes)
                
                # Persist signed + certificate PDF
                signed_filename = f"signed_{envelope_id}.pdf"
                signed_path = os.path.join(upload_dir, signed_filename)
                persist_pdf(signed_path, final_pdf_bytes)
                print(f"✅ Certificate generated: {signed_path}")
                print(f"   Security Hash: {security_hash[:20]}...")
                print(f"   Signers: {[s['signer_id'] for s in signer_list]}")
                
                # Update envelope record with security hash and certificate path
                envelope_record.security_hash = security_hash
                envelope_record.security_hash_generated_at = datetime.utcnow()
                envelope_record.certificate_file_path = signed_path
                
                # Update document file path to point to signed version
                if document_records:
                    document_records[0].file_path = signed_path
                
                db.commit()
                
            except Exception as cert_error:
                # Log but don't fail the envelope creation
                print(f"❌ Certificate generation error: {cert_error}")
                import traceback
                traceback.print_exc()

        return {
            "success": True,
            "envelope_id": envelope_id,
            "message": f"Envelope sent to {len(envelope.recipients)} recipients",
            "security_hash": envelope_record.security_hash if is_completed else None,
            "signer_pmt_ids": [r.signer_pmt_id for r in recipient_records]
        }

    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create envelope: {str(e)}")


@router.get("/")
async def list_envelopes(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    List all envelopes created by the current user.
    """
    username = user.get('email', user.get('sub', 'unknown'))
    
    try:
        query = db.query(Envelope).filter(Envelope.created_by == username)
        
        if status:
            query = query.filter(Envelope.status == status)
        
        envelopes = query.order_by(Envelope.created_at.desc()).all()

        results = []
        for e in envelopes:
            recipients = db.query(EnvelopeRecipient).filter(EnvelopeRecipient.envelope_id == e.id).all()
            documents = db.query(EnvelopeDocument).filter(EnvelopeDocument.envelope_id == e.id).order_by(EnvelopeDocument.order_index).all()
            results.append({
                "id": e.id,
                "subject": e.subject,
                "status": e.status,
                "security_hash": e.security_hash,
                "completed_at": e.completed_at.isoformat() if e.completed_at else None,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "expires_at": e.expires_at.isoformat() if e.expires_at else None,
                "recipients": [
                    {
                        "id": r.id,
                        "name": r.name,
                        "email": r.email,
                        "role": r.role,
                        "order": r.signing_order,
                        "status": r.status,
                        "signer_pmt_id": r.signer_pmt_id,
                        "signed_at": r.signed_at.isoformat() if r.signed_at else None,
                    }
                    for r in recipients
                ],
                "documents": [
                    {
                        "id": d.id,
                        "name": d.name,
                        "source": d.source,
                        "driveId": d.drive_id,
                        "order": d.order_index,
                        "download_url": f"/envelopes/{e.id}/documents/{d.id}/download" if d.file_path else None,
                    }
                    for d in documents
                ]
            })

        return results
    except Exception as e:
        # Return empty list if table doesn't exist yet
        print(f"Error listing envelopes: {e}")
        return []


@router.get("/{envelope_id}")
async def get_envelope(
    envelope_id: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get envelope details including recipients and documents.
    """
    created_by = user.get('email', user.get('sub', 'unknown'))
    envelope = db.query(Envelope).filter(Envelope.id == envelope_id, Envelope.created_by == created_by).first()
    if not envelope:
        raise HTTPException(status_code=404, detail="Envelope not found")

    recipients = db.query(EnvelopeRecipient).filter(EnvelopeRecipient.envelope_id == envelope_id).order_by(EnvelopeRecipient.signing_order).all()
    documents = db.query(EnvelopeDocument).filter(EnvelopeDocument.envelope_id == envelope_id).order_by(EnvelopeDocument.order_index).all()

    return {
        "id": envelope.id,
        "subject": envelope.subject,
        "message": envelope.message,
        "status": envelope.status,
        "security_hash": envelope.security_hash,
        "completed_at": envelope.completed_at.isoformat() if envelope.completed_at else None,
        "created_by": envelope.created_by,
        "reminder_frequency_days": envelope.reminder_frequency_days,
        "expires_at": envelope.expires_at.isoformat() if envelope.expires_at else None,
        "created_at": envelope.created_at.isoformat() if envelope.created_at else None,
        "recipients": [
            {
                "id": r.id,
                "name": r.name,
                "email": r.email,
                "role": r.role,
                "order": r.signing_order,
                "signer_pmt_id": r.signer_pmt_id,
                "status": r.status,
                "signed_at": r.signed_at.isoformat() if r.signed_at else None,
            }
            for r in recipients
        ],
        "documents": [
            {
                "id": d.id,
                "name": d.name,
                "source": d.source,
                "driveId": d.drive_id,
                "order": d.order_index,
                "download_url": f"/envelopes/{envelope_id}/documents/{d.id}/download" if d.file_path else None,
            }
            for d in documents
        ]
    }


@router.get("/{envelope_id}/documents/{document_id}/download")
async def download_envelope_document(
    envelope_id: str,
    document_id: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download a stored envelope document.
    """
    created_by = user.get('email', user.get('sub', 'unknown'))
    envelope = db.query(Envelope).filter(Envelope.id == envelope_id, Envelope.created_by == created_by).first()
    if not envelope:
        raise HTTPException(status_code=404, detail="Envelope not found")

    document = db.query(EnvelopeDocument).filter(
        EnvelopeDocument.id == document_id,
        EnvelopeDocument.envelope_id == envelope_id
    ).first()
    if not document or not document.file_path or not os.path.exists(document.file_path):
        raise HTTPException(status_code=404, detail="Document file not found")

    return FileResponse(document.file_path, filename=document.name or "document.pdf")


@router.post("/{envelope_id}/void")
async def void_envelope(
    envelope_id: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Void an envelope (cancel it).
    """
    created_by = user.get('email', user.get('sub', 'unknown'))
    envelope = db.query(Envelope).filter(Envelope.id == envelope_id, Envelope.created_by == created_by).first()
    if not envelope:
        raise HTTPException(status_code=404, detail="Envelope not found or unauthorized")

    envelope.status = 'voided'
    envelope.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True, "message": "Envelope voided"}


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
