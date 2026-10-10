"""One-time codes sent by email, as proof that someone controls an address.

They live in otp_codes with the candidate portal's sign-in codes: both prove
the same thing. A deletion request uses them so that only the person at an
address can have its data erased.
"""
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import OTPCode
from app.services.auth import get_password_hash, verify_password

CODE_MINUTES = 15
# Wrong guesses allowed before the address's open codes stop working. One
# server process (the free plan runs one), so the count lives here.
MAX_WRONG = 5
_wrong: dict = {}


def _new_code() -> str:
    # secrets, not random: random's output can be predicted from its past.
    return f"{secrets.randbelow(10**6):06d}"


async def issue_code(db: AsyncSession, email: str) -> str:
    """A fresh six-digit code for this address, stored hashed. Open ones stop working."""
    open_codes = await db.execute(select(OTPCode).where(OTPCode.email == email, OTPCode.used == False))  # noqa: E712
    for old in open_codes.scalars().all():
        old.used = True
    code = _new_code()
    db.add(OTPCode(email=email, code=get_password_hash(code),
                   expires_at=datetime.utcnow() + timedelta(minutes=CODE_MINUTES)))
    await db.commit()
    _wrong.pop(email, None)
    return code


async def redeem_code(db: AsyncSession, email: str, submitted: str) -> bool:
    """True when `submitted` is this address's open code, which is then used up.

    After MAX_WRONG wrong guesses the address's open codes are used up as
    well, so a code can't be found by trying them all from many addresses.
    """
    submitted = (submitted or "").strip()
    now = datetime.utcnow()
    rows = (await db.execute(
        select(OTPCode).where(OTPCode.email == email, OTPCode.used == False, OTPCode.expires_at > now)  # noqa: E712
    )).scalars().all()
    for row in rows:
        try:
            if submitted and verify_password(submitted, row.code):
                row.used = True
                await db.commit()
                _wrong.pop(email, None)
                return True
        except Exception:
            continue
    _wrong[email] = _wrong.get(email, 0) + 1
    if _wrong[email] >= MAX_WRONG:
        for row in rows:
            row.used = True
        await db.commit()
        _wrong.pop(email, None)
    return False
