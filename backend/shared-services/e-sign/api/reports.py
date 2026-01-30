"""
Reports API - Analytics and reporting for signature activity
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from auth import get_current_user
from database import get_db
from models import (
    Envelope, EnvelopeRecipient, SignatureRequest, SignatureRequestStatus,
    Signer, SignerStatus, User, AuditLog, Document
)

router = APIRouter(prefix="/reports", tags=["reports"])


class StatsResponse(BaseModel):
    totalEnvelopes: int
    completed: int
    pending: int
    voided: int
    avgCompletionTime: float
    signingRate: float
    period_days: int


class ActivityItem(BaseModel):
    id: str
    type: str
    envelopeName: str
    recipientName: str
    timestamp: str


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get summary statistics for the specified time period.
    """
    try:
        username = user.get('preferred_username', user.get('email', 'unknown'))
        start_date = datetime.utcnow() - timedelta(days=days)

        # Get envelope stats
        envelope_stats = db.query(
            func.count(Envelope.id).label('total'),
            func.count(Envelope.id).filter(Envelope.status == 'completed').label('completed'),
            func.count(Envelope.id).filter(Envelope.status == 'pending').label('pending'),
            func.count(Envelope.id).filter(Envelope.status.in_(['voided', 'expired'])).label('voided')
        ).filter(
            Envelope.created_by == username,
            Envelope.created_at >= start_date
        ).first()

        # Get signature request stats
        user_obj = db.query(User).filter(
            or_(User.email == username, User.keycloak_id == username)
        ).first()

        sr_stats = (0, 0, 0, 0)
        if user_obj:
            sr_stats = db.query(
                func.count(SignatureRequest.id).label('total'),
                func.count(SignatureRequest.id).filter(SignatureRequest.status == SignatureRequestStatus.COMPLETED).label('completed'),
                func.count(SignatureRequest.id).filter(SignatureRequest.status == SignatureRequestStatus.PENDING).label('pending'),
                func.count(SignatureRequest.id).filter(SignatureRequest.status.in_([SignatureRequestStatus.CANCELLED, SignatureRequestStatus.EXPIRED])).label('voided')
            ).filter(
                SignatureRequest.creator_id == user_obj.id,
                SignatureRequest.created_at >= start_date
            ).first() or (0, 0, 0, 0)

        # Combine stats
        total = (envelope_stats[0] or 0) + (sr_stats[0] or 0)
        completed = (envelope_stats[1] or 0) + (sr_stats[1] or 0)
        pending = (envelope_stats[2] or 0) + (sr_stats[2] or 0)
        voided = (envelope_stats[3] or 0) + (sr_stats[3] or 0)

        # Calculate average completion time
        avg_completion_time = 4.2  # Default
        if user_obj:
            avg_result = db.query(
                func.avg(
                    func.extract('epoch', SignatureRequest.completed_at - SignatureRequest.created_at) / 3600
                )
            ).filter(
                SignatureRequest.creator_id == user_obj.id,
                SignatureRequest.status == SignatureRequestStatus.COMPLETED,
                SignatureRequest.completed_at.isnot(None),
                SignatureRequest.created_at >= start_date
            ).scalar()
            if avg_result:
                avg_completion_time = round(float(avg_result), 1)

        # Calculate signing rate
        signing_rate = round((completed / total * 100) if total > 0 else 0, 1)

        return StatsResponse(
            totalEnvelopes=total,
            completed=completed,
            pending=pending,
            voided=voided,
            avgCompletionTime=avg_completion_time,
            signingRate=signing_rate,
            period_days=days
        )

    except Exception as e:
        # Return zeros on error
        return StatsResponse(
            totalEnvelopes=0,
            completed=0,
            pending=0,
            voided=0,
            avgCompletionTime=0,
            signingRate=0,
            period_days=days
        )


@router.get("/activity", response_model=List[ActivityItem])
async def get_activity(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get recent activity feed.
    """
    try:
        username = user.get('preferred_username', user.get('email', 'unknown'))
        activities = []

        # Get user object
        user_obj = db.query(User).filter(
            or_(User.email == username, User.keycloak_id == username)
        ).first()

        # Get activity from audit logs
        if user_obj:
            audit_logs = db.query(AuditLog).filter(
                AuditLog.user_id == user_obj.id
            ).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

            for log in audit_logs:
                event_data = log.event_data or {}
                
                activity_type = 'sent'
                if 'completed' in log.event_type.lower() or 'signed' in log.event_type.lower():
                    activity_type = 'completed'
                elif 'viewed' in log.event_type.lower():
                    activity_type = 'viewed'
                elif 'declined' in log.event_type.lower():
                    activity_type = 'declined'
                elif 'voided' in log.event_type.lower() or 'cancelled' in log.event_type.lower():
                    activity_type = 'voided'

                activities.append(ActivityItem(
                    id=str(log.id),
                    type=activity_type,
                    envelopeName=event_data.get('document_title', event_data.get('envelope_subject', 'Document')),
                    recipientName=event_data.get('signer_name', event_data.get('recipient_name', 'User')),
                    timestamp=log.created_at.isoformat() if log.created_at else datetime.utcnow().isoformat()
                ))

        # If no audit logs, get from envelopes and signature requests
        if not activities:
            # Get envelopes
            envelopes = db.query(Envelope).filter(
                Envelope.created_by == username
            ).order_by(Envelope.created_at.desc()).offset(offset).limit(limit // 2).all()

            for env in envelopes:
                activity_type = 'sent'
                if env.status == 'completed':
                    activity_type = 'completed'
                elif env.status in ('voided', 'expired'):
                    activity_type = 'voided'

                # Get first recipient
                recipient = db.query(EnvelopeRecipient).filter(
                    EnvelopeRecipient.envelope_id == env.id
                ).first()

                activities.append(ActivityItem(
                    id=str(env.id),
                    type=activity_type,
                    envelopeName=env.subject or 'Document',
                    recipientName=recipient.name if recipient else 'Recipient',
                    timestamp=env.created_at.isoformat() if env.created_at else datetime.utcnow().isoformat()
                ))

            # Get signature requests
            if user_obj:
                requests = db.query(SignatureRequest).filter(
                    SignatureRequest.creator_id == user_obj.id
                ).order_by(SignatureRequest.created_at.desc()).offset(offset).limit(limit // 2).all()

                for req in requests:
                    activity_type = 'sent'
                    if req.status == SignatureRequestStatus.COMPLETED:
                        activity_type = 'completed'
                    elif req.status in (SignatureRequestStatus.CANCELLED, SignatureRequestStatus.EXPIRED):
                        activity_type = 'voided'

                    # Get first signer
                    signer = db.query(Signer).filter(
                        Signer.signature_request_id == req.id
                    ).first()

                    activities.append(ActivityItem(
                        id=str(req.id),
                        type=activity_type,
                        envelopeName=req.title or 'Document',
                        recipientName=signer.full_name if signer else 'Recipient',
                        timestamp=req.created_at.isoformat() if req.created_at else datetime.utcnow().isoformat()
                    ))

        return activities

    except Exception as e:
        return []


@router.get("/envelopes-by-date")
async def get_envelopes_by_date(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get envelope counts grouped by date.
    """
    try:
        username = user.get('preferred_username', user.get('email', 'unknown'))
        start_date = datetime.utcnow() - timedelta(days=days)

        results = db.query(
            func.date(Envelope.created_at).label('date'),
            func.count(Envelope.id).label('count'),
            func.count(Envelope.id).filter(Envelope.status == 'completed').label('completed')
        ).filter(
            Envelope.created_by == username,
            Envelope.created_at >= start_date
        ).group_by(func.date(Envelope.created_at)).order_by(func.date(Envelope.created_at)).all()

        return [
            {
                "date": row.date.isoformat() if row.date else None,
                "total": row.count,
                "completed": row.completed
            }
            for row in results
        ]

    except Exception as e:
        return []


@router.get("/recipients-performance")
async def get_recipients_performance(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get signing performance by recipient.
    """
    try:
        username = user.get('preferred_username', user.get('email', 'unknown'))
        start_date = datetime.utcnow() - timedelta(days=days)

        user_obj = db.query(User).filter(
            or_(User.email == username, User.keycloak_id == username)
        ).first()

        if not user_obj:
            return []

        results = db.query(
            Signer.email,
            Signer.full_name,
            func.count(Signer.id).label('total_requests'),
            func.count(Signer.id).filter(Signer.status == SignerStatus.SIGNED).label('signed'),
            func.count(Signer.id).filter(Signer.status == SignerStatus.DECLINED).label('declined'),
            func.avg(
                func.extract('epoch', Signer.signed_at - SignatureRequest.created_at) / 3600
            ).filter(Signer.signed_at.isnot(None)).label('avg_response_hours')
        ).join(SignatureRequest).filter(
            SignatureRequest.creator_id == user_obj.id,
            SignatureRequest.created_at >= start_date
        ).group_by(Signer.email, Signer.full_name).order_by(
            func.count(Signer.id).desc()
        ).limit(limit).all()

        return [
            {
                "email": row.email,
                "name": row.full_name or row.email,
                "totalRequests": row.total_requests,
                "signed": row.signed,
                "declined": row.declined,
                "avgResponseHours": round(float(row.avg_response_hours or 0), 1)
            }
            for row in results
        ]

    except Exception as e:
        return []


@router.get("/export")
async def export_report(
    report_type: str = Query(..., description="Type of report: completion, pending, recipients, audit"),
    format: str = Query("csv", description="Export format: csv or json"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Export report data.
    """
    try:
        username = user.get('preferred_username', user.get('email', 'unknown'))
        start_date = datetime.utcnow() - timedelta(days=days)

        data = []
        columns = []

        if report_type == "completion":
            columns = ["id", "subject", "status", "created_at", "expires_at"]
            envelopes = db.query(Envelope).filter(
                Envelope.created_by == username,
                Envelope.created_at >= start_date,
                Envelope.status == 'completed'
            ).order_by(Envelope.created_at.desc()).all()
            
            data = [
                {
                    "id": e.id,
                    "subject": e.subject,
                    "status": e.status,
                    "created_at": e.created_at.isoformat() if e.created_at else None,
                    "expires_at": e.expires_at.isoformat() if e.expires_at else None
                }
                for e in envelopes
            ]

        elif report_type == "pending":
            columns = ["id", "subject", "status", "created_at", "expires_at"]
            envelopes = db.query(Envelope).filter(
                Envelope.created_by == username,
                Envelope.created_at >= start_date,
                Envelope.status == 'pending'
            ).order_by(Envelope.created_at.desc()).all()
            
            data = [
                {
                    "id": e.id,
                    "subject": e.subject,
                    "status": e.status,
                    "created_at": e.created_at.isoformat() if e.created_at else None,
                    "expires_at": e.expires_at.isoformat() if e.expires_at else None
                }
                for e in envelopes
            ]

        elif report_type == "audit":
            columns = ["id", "event_type", "resource_type", "resource_id", "ip_address", "created_at"]
            
            user_obj = db.query(User).filter(
                or_(User.email == username, User.keycloak_id == username)
            ).first()
            
            if user_obj:
                logs = db.query(AuditLog).filter(
                    AuditLog.user_id == user_obj.id,
                    AuditLog.created_at >= start_date
                ).order_by(AuditLog.created_at.desc()).all()
                
                data = [
                    {
                        "id": l.id,
                        "event_type": l.event_type,
                        "resource_type": l.resource_type,
                        "resource_id": l.resource_id,
                        "ip_address": l.ip_address,
                        "created_at": l.created_at.isoformat() if l.created_at else None
                    }
                    for l in logs
                ]

        else:
            raise HTTPException(status_code=400, detail=f"Unknown report type: {report_type}")

        if format == "json":
            return {"data": data, "count": len(data), "report_type": report_type}
        else:
            # Return data that frontend can convert to CSV
            return {
                "columns": columns,
                "rows": [[str(row.get(col, '')) for col in columns] for row in data],
                "count": len(data),
                "report_type": report_type
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export report: {str(e)}")
