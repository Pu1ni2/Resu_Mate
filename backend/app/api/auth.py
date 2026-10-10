"""Auth API — register, login, refresh, OTP for candidates"""
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.rate_limit import limiter

from app.core.config import settings
from app.core.database import get_db
from app.models.auth import HiringManager, OTPCode
from app.models.candidate import CandidateAccess
from app.services import db_service
from app.services import interview_modes
from app.services.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    create_candidate_token,
    create_reset_token,
    decode_token,
    password_fingerprint,
    get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request / Response schemas ────────────────────────────────────────────────

# The Terms and Privacy Policy a manager agrees to at sign-up. Change it when
# their text (frontend/src/components/LegalPage.jsx) changes.
TERMS_VERSION = "2026-10-09"


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    company: Optional[str] = None
    # Agreement to the Terms and the Privacy Policy, which sign-up needs.
    accept_terms: bool = False

class LoginRequest(BaseModel):
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., max_length=320)

class ResetPasswordRequest(BaseModel):
    token: str = Field(..., max_length=2000)
    password: str = Field(..., max_length=200)

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
    if not req.accept_terms:
        raise HTTPException(status_code=400, detail="Please agree to the Terms and the Privacy Policy to sign up.")

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
        terms_accepted_at=datetime.utcnow(),
        terms_version=TERMS_VERSION,
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


# The same answer for every address, so it doesn't tell who has an account.
FORGOT_PASSWORD_ANSWER = "If there's an account for that address, we've emailed it a link to reset the password."
RESET_LINK_INVALID = "This reset link has expired or was already used. Ask for a new one."


@router.post("/forgot-password")
@limiter.limit("5/hour")
async def forgot_password(
    request: Request, req: ForgotPasswordRequest, background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Email a manager a link to choose a new password.

    There was no way back into an account with a forgotten password. The
    answer is the same whether or not the address has an account, and the
    email goes out after the response, so neither the words nor the time
    taken tell.
    """
    email = req.email.lower().strip()
    manager = (await db.execute(select(HiringManager).where(HiringManager.email == email))).scalar_one_or_none()
    answer = {"message": FORGOT_PASSWORD_ANSWER}
    if manager and manager.is_active:
        from app.services.email_service import email_service
        link = f"{settings.frontend_url.rstrip('/')}/hiring/reset?token={create_reset_token(manager)}"
        background.add_task(email_service.send_password_reset, manager.email, link)
        if settings.debug and not email_service.configured:
            # Local development without email, as send-otp's debug_code.
            answer["debug_reset_link"] = link
    return answer


@router.post("/reset-password")
@limiter.limit("10/hour")
async def reset_password(request: Request, req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Set a new password with the link from forgot-password. A link works once."""
    try:
        payload = decode_token(req.token)
    except HTTPException:
        raise HTTPException(status_code=400, detail=RESET_LINK_INVALID)
    subject = str(payload.get("sub") or "")
    if payload.get("type") != "reset" or not subject.isdigit():
        raise HTTPException(status_code=400, detail=RESET_LINK_INVALID)
    manager = (await db.execute(select(HiringManager).where(HiringManager.id == int(subject)))).scalar_one_or_none()
    # The fingerprint no longer matches once the password has changed.
    if not manager or not manager.is_active or not hmac.compare_digest(
        str(payload.get("fp") or ""), password_fingerprint(manager.password_hash)
    ):
        raise HTTPException(status_code=400, detail=RESET_LINK_INVALID)
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    manager.password_hash = get_password_hash(req.password)
    await db.commit()
    return {"message": "Password changed. You can sign in with it now."}


@router.get("/me")
async def get_me(current_user: HiringManager = Depends(get_current_user)):
    """Get the currently authenticated hiring manager's profile."""
    return current_user.to_dict()


# ── Candidate OTP Auth ────────────────────────────────────────────────────────

def _generate_otp() -> str:
    # secrets, not random: random's Mersenne Twister can be predicted from its
    # past output, and these codes are what stands between a guess and a login.
    return f"{secrets.randbelow(10**6):06d}"


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

    # Send email. In dev we expose the OTP code in the response so the candidate
    # portal works without SendGrid configured. In production a delivery failure
    # is a 503 so the candidate isn't left wondering why no email arrived.
    from app.services.email_service import email_service
    from app.core.config import settings as _settings
    try:
        delivered = await email_service.send_otp(email, code)
    except Exception as exc:
        delivered = False
        print(f"[OTP] send error: {exc}")

    if delivered:
        return {"message": "OTP sent to your email", "email": email}

    if _settings.debug:
        # Dev convenience: include the code in the response so flows work without SendGrid.
        print(f"[OTP] dev fallback for {email}: {code}")
        return {"message": "OTP generated (dev mode)", "email": email, "debug_code": code}

    raise HTTPException(status_code=503, detail="Could not send OTP email. Try again shortly.")


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

    # Grant, interview and profile all from one manager, and the profile only if
    # it really is this person's (see db_service.candidate_view).
    access, interview, cand = await db_service.candidate_view(db, email)
    if not access:
        raise HTTPException(status_code=404, detail="Access record not found")

    candidate_data = None
    if cand:
        candidate_data = {
            "name": cand.name,
            "predicted_role": cand.predicted_role,
            "experience_level": cand.experience_level,
            "skills": cand.skills or [],
            "summary": cand.summary,
        }

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
            "mode": interview_modes.mode_of(interview),
            "interview_id": interview.id,
        }
        if interview_completed:
            # Parsed, in the shape my-report sends: this used to be the raw
            # report column, JSON text the candidate saw as-is.
            interview_report = db_service.candidate_report(interview)

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
