"""Auth API — register, login, refresh, OTP for candidates"""
import hmac
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.rate_limit import limiter

from app.core.config import settings
from app.core.database import get_db
from app.models.auth import HiringManager
from app.models.candidate import CandidateAccess
from app.services import db_service, email_kinds, outbox
from app.services import interview_modes
from app.services.codes import WRONG_CODE, issue_code, redeem_code
from app.services.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    create_candidate_token,
    decode_token,
    password_fingerprint,
    get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


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

class DeleteAccountRequest(BaseModel):
    password: str = Field(..., max_length=200)

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

class VerifyEmailRequest(BaseModel):
    token: str = Field(..., max_length=2000)


# ── Hiring Manager Auth ───────────────────────────────────────────────────────

@router.post("/register", status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new hiring manager account, and email them the link that
    confirms their address."""
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
        # Until they open the link emailed to them.
        email_verified=False,
    )
    db.add(manager)
    await db.commit()
    await db.refresh(manager)

    access_token = create_access_token({"sub": str(manager.id)})
    refresh_token = _session_token(manager)

    answer = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": manager.to_dict(),
    }
    answer.update(await _email_verification_link(db, manager))
    return answer


async def _email_verification_link(db: AsyncSession, manager: HiringManager) -> dict:
    """Queue the email with the link that confirms the manager's address:
    the outbox's job makes the link as it sends it. Returns what to add to
    the answer: the link itself in local development without email, as
    forgot-password does. It went after the response, and a restart lost it."""
    from app.services.email_service import email_service
    await outbox.queue(db, "verify_email", manager_id=manager.id)
    await db.commit()
    return {"debug_verify_link": email_kinds.verify_link(manager)} if settings.debug and not email_service.configured else {}


def _session_token(manager: HiringManager) -> str:
    """The 30-day refresh token, tied to the current password: changing the
    password ends the sessions from before (see refresh)."""
    return create_refresh_token({"sub": str(manager.id), "fp": password_fingerprint(manager.password_hash)})


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
    refresh_token = _session_token(manager)

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

    # A password reset left every older session signed in for up to 30 days,
    # including one belonging to whoever the reset was meant to lock out.
    # Tokens made before this check have no fingerprint; they last until
    # they expire.
    fp = payload.get("fp")
    if fp is not None and not hmac.compare_digest(str(fp), password_fingerprint(manager.password_hash)):
        raise HTTPException(status_code=401, detail="Your password was changed. Please sign in again.")

    access_token = create_access_token({"sub": str(manager.id)})
    return {"access_token": access_token, "token_type": "bearer", "expires_in": 1800}


# The same answer for every address, so it doesn't tell who has an account.
FORGOT_PASSWORD_ANSWER = "If there's an account for that address, we've emailed it a link to reset the password."
RESET_LINK_INVALID = "This reset link has expired or was already used. Ask for a new one."


@router.post("/forgot-password")
@limiter.limit("5/hour")
async def forgot_password(request: Request, req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Email a manager a link to choose a new password.

    There was no way back into an account with a forgotten password. The
    answer is the same whether or not the address has an account, and so is
    the work: an email is queued for any address, and the outbox's job
    finds the account as it sends it, so neither the words nor the time
    taken tell. It went after the response, and a restart lost it.
    """
    from app.services.email_service import email_service
    email = req.email.lower().strip()
    answer = {"message": FORGOT_PASSWORD_ANSWER}
    await outbox.queue(db, "password_reset", to_address=email)
    await db.commit()
    if settings.debug and not email_service.configured:
        # Local development without email, as send-otp's debug_code.
        manager = (await db.execute(select(HiringManager).where(HiringManager.email == email))).scalar_one_or_none()
        if manager and manager.is_active:
            answer["debug_reset_link"] = email_kinds.reset_link(manager)
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


@router.post("/delete-account")
@limiter.limit("5/hour")
async def delete_account(
    request: Request, req: DeleteAccountRequest,
    current_user: HiringManager = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """A manager deletes their account and all its data, with their password.

    There was no way to: Delete All removed the candidates but kept the
    account, its sourcing runs, chat histories and audit records.
    """
    if not verify_password(req.password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="That password isn't right.")
    manager_id = current_user.id
    files = await db_service.delete_manager(db, manager_id)
    # Then what lives outside the database: the in-memory store, and the
    # original files.
    from app.services.resume_rag import resume_rag
    from app.services.storage_service import storage_service
    import asyncio
    resume_rag.clear_all(manager_id=manager_id)
    for key in files:
        await asyncio.to_thread(storage_service.delete, key)
    return {"status": "deleted"}


@router.get("/me")
async def get_me(current_user: HiringManager = Depends(get_current_user)):
    """Get the currently authenticated hiring manager's profile."""
    return current_user.to_dict()


class PreferencesRequest(BaseModel):
    hide_names: bool


@router.put("/preferences")
async def set_preferences(req: PreferencesRequest, current_user: HiringManager = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    """The manager's settings, kept on the account. "Hide names" was only the
    page's, so the server couldn't keep names from the AI when a request
    didn't ask it to. Returns the profile."""
    if current_user.hide_names != req.hide_names:
        # The chat's kept conversation was had with the other setting: shown
        # again, or read by the model, it would bring the names back.
        from app.services import state_service
        await state_service.forget_chats(db, [current_user.id])
    current_user.hide_names = req.hide_names
    await db.commit()
    return current_user.to_dict()


# ── Confirming the manager's email ────────────────────────────────────────────

VERIFY_LINK_INVALID = "This link has expired or isn't valid."


@router.post("/verify-email")
@limiter.limit("20/hour")
async def verify_email(request: Request, req: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Confirm a manager's address with the link emailed to it. No sign-in
    needed: it may be opened on another device. Opening it again says it's
    confirmed."""
    try:
        payload = decode_token(req.token)
    except HTTPException:
        raise HTTPException(status_code=400, detail=VERIFY_LINK_INVALID)
    subject = str(payload.get("sub") or "")
    if payload.get("type") != "verify" or not subject.isdigit():
        raise HTTPException(status_code=400, detail=VERIFY_LINK_INVALID)
    manager = (await db.execute(select(HiringManager).where(HiringManager.id == int(subject)))).scalar_one_or_none()
    # Only for the address the account has now.
    if not manager or not manager.is_active or payload.get("email") != manager.email:
        raise HTTPException(status_code=400, detail=VERIFY_LINK_INVALID)
    if not manager.email_verified:
        manager.email_verified = True
        await db.commit()
        await db_service.log_event(db, action="account.email_verified", actor="manager", manager_id=manager.id)
    return {"message": "Your email is confirmed.", "user": manager.to_dict()}


@router.post("/send-verification")
@limiter.limit("3/hour")
async def send_verification(request: Request, current_user: HiringManager = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)):
    """Email the signed-in manager a new link to confirm their address."""
    if current_user.email_verified:
        return {"message": "Your email is already confirmed.", "user": current_user.to_dict()}
    answer = {"message": f"We've sent a new link to {current_user.email}."}
    answer.update(await _email_verification_link(db, current_user))
    return answer


# ── Candidate OTP Auth ────────────────────────────────────────────────────────

SIGN_IN_CODE_SENT = "If this address has been invited to an interview, we've emailed it a sign-in code."


@router.post("/candidate/send-otp")
@limiter.limit("3/minute")
async def send_otp(request: Request, req: SendOTPRequest, db: AsyncSession = Depends(get_db)):
    """Email a 6-digit sign-in code to an address a hiring manager has invited.

    The answer is the same whether or not one has, and so is the work: an
    email is queued for any address, and the outbox's job checks that it was
    invited, issues the code and sends it, as with a deletion request's
    code. It used to say "No interview access found" to an address no one
    had invited, so anyone could find out whom a company was interviewing;
    then it issued the code only for an invited one, and sent it after the
    response, where a restart lost it.
    """
    from app.services.email_service import email_service
    email = req.email.lower().strip()
    answer = {"message": SIGN_IN_CODE_SENT, "email": email}
    if settings.debug and not email_service.configured:
        # Local development without email: the code in the answer, as
        # forgot-password's debug_reset_link.
        access = (await db.execute(select(CandidateAccess).where(CandidateAccess.email == email))).scalars().first()
        if access:
            answer["debug_code"] = await issue_code(db, email)
        return answer
    await outbox.queue(db, "sign_in_code", to_address=email)
    await db.commit()
    return answer


@router.post("/candidate/verify-otp")
@limiter.limit("5/minute")
async def verify_otp(request: Request, req: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    """Verify OTP and return a candidate session token + profile data."""
    email = req.email.lower().strip()

    # Five wrong guesses use the code up; there was no limit, so a code could be
    # found by guessing from enough addresses. One answer for any refused code,
    # a used-up one too, as for a deletion request: "tried too many times"
    # would say a code had been sent, so that the address was invited.
    if not await redeem_code(db, email, req.code):
        raise HTTPException(status_code=400, detail=WRONG_CODE)

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
    report_status = None

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
            # report column, JSON text the candidate saw as-is. Only once
            # it's written: an empty one, sent while its job ran, was taken
            # as the report, and the page never asked again.
            report_status = db_service.report_state(interview)
            if report_status == "done":
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
            "report_status": report_status,
            "profile": candidate_data,
        },
    }
