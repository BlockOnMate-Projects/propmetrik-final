"""
Users API - Manage user signer IDs
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
import secrets

from auth import get_current_user
from database import get_db
from models import User

router = APIRouter(prefix="/users", tags=["users"])


class SignerIdRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = None


class SignerIdResponse(BaseModel):
    email: str
    signer_pmt_id: str
    name: Optional[str] = None


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


@router.post("/get-or-create-signer-id", response_model=SignerIdResponse)
async def get_or_create_signer_id(
    request: SignerIdRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get or create a permanent signer ID (PMT-XXXX) for a user.
    This ID is used for audit-grade e-signatures.
    """
    pmt_id = get_or_create_signer_pmt_id(db, request.email, request.name)
    
    # Get user record for the name
    user_record = db.query(User).filter(User.email == request.email).first()
    
    return SignerIdResponse(
        email=request.email,
        signer_pmt_id=pmt_id,
        name=user_record.full_name if user_record else request.name
    )


@router.get("/me/signer-id", response_model=SignerIdResponse)
async def get_my_signer_id(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the current user's permanent signer ID.
    """
    email = user.get('email')
    if not email:
        raise HTTPException(status_code=400, detail="User email not found in token")
    
    pmt_id = get_or_create_signer_pmt_id(db, email, user.get('name'))
    
    return SignerIdResponse(
        email=email,
        signer_pmt_id=pmt_id,
        name=user.get('name')
    )
