"""One-time codes sent by email, as proof that someone controls an address.

The candidate portal's sign-in codes and a deletion request's codes both live
in otp_codes and work the same way: they prove the same thing.
"""
import secrets
from datetime import datetime, timedelta
from enum import Enum

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import OTPCode
from app.services.auth import get_password_hash, verify_password

CODE_MINUTES = 15
# Wrong guesses allowed before an address's open codes stop working. Counted on
# the code in the database: kept in the server's memory, the count started again
# whenever the server restarted, and the free plan's server sleeps when idle.
MAX_WRONG = 5

# The answer to any refused code, a used-up one too: "tried too many times"
# would say a code had been sent, and so that the address is known.
WRONG_CODE = "That code is wrong or has expired. Ask for a new one."


class Outcome(Enum):
    """What a guess at a code came to.

    Only REDEEMED is true, so `if not await redeem_code(...)` reads "refused".
    USED_UP is a wrong guess that was the last one allowed.
    """
    REDEEMED = "redeemed"
    WRONG = "wrong"
    USED_UP = "used up"

    def __bool__(self):
        return self is Outcome.REDEEMED


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
    return code


async def redeem_code(db: AsyncSession, email: str, submitted: str) -> Outcome:
    """REDEEMED when `submitted` is this address's open code, which is then used up.

    A wrong guess counts against the address's open codes, and the MAX_WRONG-th
    uses them up (USED_UP), so a code can't be found by trying them all from
    many addresses.
    """
    submitted = (submitted or "").strip()
    now = datetime.utcnow()
    is_open = (OTPCode.email == email, OTPCode.used == False, OTPCode.expires_at > now)  # noqa: E712
    rows = (await db.execute(select(OTPCode).where(*is_open))).scalars().all()
    for row in rows:
        try:
            if submitted and verify_password(submitted, row.code):
                row.used = True
                await db.commit()
                return Outcome.REDEEMED
        except Exception:
            continue
    if not rows:
        return Outcome.WRONG

    # Added in the database rather than read, changed and written back, so two
    # guesses at the same moment both count.
    await db.execute(update(OTPCode).where(*is_open)
                     .values(wrong_guesses=OTPCode.wrong_guesses + 1)
                     .execution_options(synchronize_session=False))
    most = (await db.execute(select(func.max(OTPCode.wrong_guesses)).where(*is_open))).scalar() or 0
    if most >= MAX_WRONG:
        await db.execute(update(OTPCode).where(*is_open).values(used=True)
                         .execution_options(synchronize_session=False))
        await db.commit()
        return Outcome.USED_UP
    await db.commit()
    return Outcome.WRONG
