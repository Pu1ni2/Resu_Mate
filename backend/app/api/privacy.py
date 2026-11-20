"""Deletion requests from anyone, including people who were never invited.

A signed-in candidate can delete their data from the portal. Someone a sourcing
run found, or whose résumé a manager uploaded, never gets a portal sign-in, so
they had no way to have their data erased. Here they ask with their address,
get a code by email, and the code confirms the erasure.

Both steps answer the same whether or not anything is held about the address,
so the page can't be used to find out who is in the system.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import limiter
# One answer for any refused code, a used-up one too: "tried too many times"
# would say a code exists, so that data is held about the address.
from app.services import email_kinds, outbox  # noqa: F401  (email_kinds says what the code's email says)
from app.services.codes import WRONG_CODE, issue_code, redeem_code
from app.services.erasure import erase_person, holds_data

router = APIRouter(prefix="/api/privacy", tags=["privacy"])

CODE_SENT = "If we hold any data about that address, we've emailed it a code to confirm the deletion."


class ErasureCodeRequest(BaseModel):
    email: str = Field(..., max_length=320)


class ErasureRequest(BaseModel):
    email: str = Field(..., max_length=320)
    code: str = Field(..., max_length=12)


def _address(email: str) -> str:
    return (email or "").strip().lower()


@router.post("/erasure-code")
@limiter.limit("3/hour")
async def erasure_code(request: Request, req: ErasureCodeRequest, db: AsyncSession = Depends(get_db)):
    """Email a code that confirms a deletion, if any data is held about the address.

    The same answer either way, and the same work: an email is queued for
    any address, and the outbox's job checks what's held, issues the code
    and sends it. It went after the response, where a restart lost it.
    """
    from app.services.email_service import email_service
    email = _address(req.email)
    answer = {"message": CODE_SENT}
    if "@" not in email:
        return answer
    if settings.debug and not email_service.configured:
        # Local development without email, as send-otp's debug_code.
        if await holds_data(db, email):
            answer["debug_code"] = await issue_code(db, email)
        return answer
    await outbox.queue(db, "erasure_code", to_address=email)
    await db.commit()
    return answer


@router.post("/erase")
@limiter.limit("10/hour")
async def erase(request: Request, req: ErasureRequest, db: AsyncSession = Depends(get_db)):
    """Erase everything held about the address, with the code it was sent."""
    email = _address(req.email)
    if not email or not await redeem_code(db, email, req.code):
        raise HTTPException(status_code=400, detail=WRONG_CODE)
    removed = await erase_person(db, email, actor="requester")
    return {"status": "deleted", "records_removed": removed}
