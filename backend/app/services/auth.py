"""JWT Authentication — real token validation with bcrypt password hashing"""
import hashlib
import bcrypt
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.models.auth import HiringManager

# ── Password hashing (direct bcrypt, no passlib) ──────────────────────────────

def _prepare(password: str) -> bytes:
    """SHA-256 pre-hash keeps bcrypt input under 72 bytes for any password length."""
    return hashlib.sha256(password.encode()).hexdigest().encode()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(_prepare(plain_password), hashed_password.encode())

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode()


# ── JWT token creation ────────────────────────────────────────────────────────
security = HTTPBearer(auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)

def create_candidate_token(email: str) -> str:
    """Short-lived token for candidate portal access (24h)."""
    to_encode = {
        "sub": email,
        "type": "candidate",
        "exp": datetime.utcnow() + timedelta(hours=24),
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)

def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises 401 on any error."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI dependency ────────────────────────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> HiringManager:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    manager_id = payload.get("sub")
    if not manager_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(HiringManager).where(HiringManager.id == int(manager_id)))
    manager = result.scalar_one_or_none()

    if not manager or not manager.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return manager


# ── Candidate-side authentication ─────────────────────────────────────────────
# Candidate portal tokens are minted by create_candidate_token (type="candidate",
# sub=email) at OTP login. get_current_user REJECTS them (it requires
# type="access"), so candidate-facing routes need their own dependency. Without
# this, candidate endpoints were left unauthenticated and took the email from the
# request body — meaning anyone could read anyone's data by guessing an address.
#
# The rule these enforce: a candidate's identity comes from their TOKEN, never
# from a path/body/query parameter.

async def get_current_candidate(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    """Return the authenticated candidate's email, or raise 401/403.

    No DB lookup: the candidate's identity IS the signed email claim. Access
    rights are checked per-endpoint against CandidateAccess / Interview rows.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Candidate session token required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)

    if payload.get("type") != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires a candidate session token",
        )

    email = (payload.get("sub") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has no email subject")

    return email


class Actor:
    """Who is calling — a hiring manager or a candidate.

    For the handful of endpoints (realtime session/checkpoint/finalize) that both
    roles legitimately hit. Callers MUST branch on `is_candidate` and use
    `email` rather than trusting a request-body email.
    """

    def __init__(self, manager: Optional[HiringManager] = None, email: str = ""):
        self.manager = manager
        self.email = email

    @property
    def is_candidate(self) -> bool:
        return self.manager is None

    @property
    def manager_id(self) -> Optional[int]:
        return self.manager.id if self.manager else None


async def get_current_actor(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Actor:
    """Accept EITHER a hiring-manager access token or a candidate session token."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)
    token_type = payload.get("type")

    if token_type == "candidate":
        email = (payload.get("sub") or "").strip().lower()
        if not email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has no email subject")
        return Actor(email=email)

    if token_type == "access":
        manager_id = payload.get("sub")
        if not manager_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
        result = await db.execute(select(HiringManager).where(HiringManager.id == int(manager_id)))
        manager = result.scalar_one_or_none()
        if not manager or not manager.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
        return Actor(manager=manager)

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
