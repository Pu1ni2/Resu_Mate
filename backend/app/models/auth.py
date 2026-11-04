"""Auth models — HiringManager and OTPCode"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, false, true
from app.core.database import Base


class HiringManager(Base):
    __tablename__ = "hiring_managers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    company = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True)
    # When they agreed to the Terms and the Privacy Policy, and which version
    # (app/api/auth.py TERMS_VERSION). Empty for accounts made before.
    terms_accepted_at = Column(DateTime, nullable=True)
    terms_version = Column(String(40), nullable=True)
    # "Hide names", kept on the account so the server can keep candidates'
    # names and contact details from the AI. It was only the page's.
    hide_names = Column(Boolean, default=False, server_default=false(), nullable=False)
    # Whether they've shown the address is theirs, with the link emailed at
    # sign-up. Until then they can't email candidates: anyone could sign up
    # with any address and send from ResuMate. Off for a new account; the
    # server default, which the rows already there get, counts accounts from
    # before as confirmed.
    email_verified = Column(Boolean, default=False, server_default=true(), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "company": self.company,
            "hide_names": bool(self.hide_names),
            "email_verified": bool(self.email_verified),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class OTPCode(Base):
    __tablename__ = "otp_codes"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(200), nullable=False, index=True)
    # Stores a bcrypt hash of the 6-digit code, not the code itself. Verified
    # by hashing the submitted code and comparing — never by SQL equality.
    code = Column(String(255), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    # Wrong guesses at it; MAX_WRONG of them use it up (services/codes.py).
    wrong_guesses = Column(Integer, default=0, server_default="0", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
