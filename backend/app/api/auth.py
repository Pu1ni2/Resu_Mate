"""Auth API — register, login, refresh, OTP for candidates"""
import random
import string
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import get_db
from app.models.auth import HiringManager, OTPCode
from app.models.candidate import CandidateAccess, Interview, Candidate
from app.services.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    create_candidate_token,
    decode_token,
    get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


# ── Request / Response schemas ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    company: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class SendOTPRequest(BaseModel):
    email: str

class VerifyOTPRequest(BaseModel):
    email: str
    code: str


# ── Hiring Manager Auth ───────────────────────────────────────────────────────

@router.post("/register", status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new hiring manager account."""
    result = await db.execute(select(HiringManager).where(HiringManager.email == req.email.lower().strip()))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    manager = HiringManager(
        name=req.name.strip(),
        email=req.email.lower().strip(),
        password_hash=get_password_hash(req.password),
        company=req.company,
    )
    db.add(manager)
    await db.commit()
    await db.refresh(manager)

    access_token = create_access_token({"sub": str(manager.id)})
    refresh_token = create_refresh_token({"sub": str(manager.id)})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": manager.to_dict(),
    }


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate a hiring manager and return JWT tokens."""
    result = await db.execute(select(HiringManager).where(HiringManager.email == req.email.lower().strip()))
    manager = result.scalar_one_or_none()

    if not manager or not verify_password(req.password, manager.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not manager.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    access_token = create_access_token({"sub": str(manager.id)})
    refresh_token = create_refresh_token({"sub": str(manager.id)})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 1800,
        "user": manager.to_dict(),
    }


@router.post("/refresh")
async def refresh_token(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a refresh token for a new access token."""
    payload = decode_token(req.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    manager_id = payload.get("sub")
    result = await db.execute(select(HiringManager).where(HiringManager.id == int(manager_id)))
    manager = result.scalar_one_or_none()

    if not manager or not manager.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    access_token = create_access_token({"sub": str(manager.id)})
    return {"access_token": access_token, "token_type": "bearer", "expires_in": 1800}


@router.get("/me")
async def get_me(current_user: HiringManager = Depends(get_current_user)):
    """Get the currently authenticated hiring manager's profile."""
    return current_user.to_dict()


# ── Candidate OTP Auth ────────────────────────────────────────────────────────

def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


@router.post("/candidate/send-otp")
@limiter.limit("3/minute")
async def send_otp(request: Request, req: SendOTPRequest, db: AsyncSession = Depends(get_db)):
    """Send a 6-digit OTP to the candidate's email."""
    email = req.email.lower().strip()

    # Check if this email has been granted access by any hiring manager
    result = await db.execute(
        select(CandidateAccess).where(CandidateAccess.email == email)
    )
    access = result.scalars().first()
    if not access:
        raise HTTPException(status_code=404, detail="No interview access found for this email. Please check with your hiring manager.")

    # Invalidate any previous unused OTPs for this email
    old_otps = await db.execute(
        select(OTPCode).where(OTPCode.email == email, OTPCode.used == False)
    )
    for otp in old_otps.scalars().all():
        otp.used = True

    code = _generate_otp()
    otp_record = OTPCode(
        email=email,
        code=get_password_hash(code),  # store bcrypt hash, never the plaintext OTP
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(otp_record)
    await db.commit()

    # Send email (import lazily to avoid circular imports)
    try:
        from app.services.email_service import email_service
        await email_service.send_otp(email, code)
    except Exception:
        # Fallback: print to console so development still works
        print(f"[OTP] {email} → {code}")

    return {"message": "OTP sent to your email", "email": email}


@router.post("/candidate/verify-otp")
@limiter.limit("5/minute")
async def verify_otp(request: Request, req: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    """Verify OTP and return a candidate session token + profile data."""
    email = req.email.lower().strip()
    submitted = (req.code or "").strip()
    now = datetime.utcnow()

    # Find all valid, unused, non-expired OTPs for this email; bcrypt-compare each.
    # We cannot SQL-match on the code since it is now stored as a bcrypt hash.
    result = await db.execute(
        select(OTPCode).where(
            OTPCode.email == email,
            OTPCode.used == False,
            OTPCode.expires_at > now,
        ).order_by(OTPCode.created_at.desc())
    )
    candidates = result.scalars().all()
    otp_record = None
    for rec in candidates:
        try:
            if verify_password(submitted, rec.code):
                otp_record = rec
                break
        except Exception:
            continue

    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    # Mark OTP as used
    otp_record.used = True
    await db.commit()

    # Fetch access record
    access_result = await db.execute(
        select(CandidateAccess).where(CandidateAccess.email == email)
    )
    access = access_result.scalars().first()
    if not access:
        raise HTTPException(status_code=404, detail="Access record not found")

    # Fetch candidate profile if linked
    candidate_data = None
    if access.candidate_id:
        cand_result = await db.execute(
            select(Candidate).where(Candidate.id == access.candidate_id)
        )
        cand = cand_result.scalar_one_or_none()
        if cand:
            candidate_data = {
                "name": cand.name,
                "predicted_role": cand.predicted_role,
                "experience_level": cand.experience_level,
                "skills": cand.skills or [],
                "summary": cand.summary,
            }

    # Fetch interview info
    interview_result = await db.execute(
        select(Interview)
        .where(Interview.candidate_email == email)
        .order_by(Interview.created_at.desc())
    )
    interview = interview_result.scalars().first()

    has_interview = interview is not None
    interview_completed = interview.status == "completed" if interview else False
    interview_config = None
    interview_report = None

    if interview:
        interview_config = {
            "role": interview.role,
            "level": interview.level,
            "num_questions": interview.num_questions,
            "focus_areas": interview.focus_areas or [],
            "questions": interview.questions or [],
        }
        if interview_completed:
            interview_report = {
                "scores": interview.scores,
                "report": interview.report,
                "duration": interview.duration,
                "transcript": interview.transcript,
            }

    access_token = create_candidate_token(email)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "candidate_data": {
            "email": email,
            "name": access.name,
            "candidate_id": access.candidate_id,
            "has_interview": has_interview,
            "interview_config": interview_config,
            "interview_completed": interview_completed,
            "interview_report": interview_report,
            "profile": candidate_data,
        },
    }
