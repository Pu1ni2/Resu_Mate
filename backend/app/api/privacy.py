"""Deletion requests from anyone, including people who were never invited.

A signed-in candidate can delete their data from the portal. Someone a sourcing
run found, or whose résumé a manager uploaded, never gets a portal sign-in, so
they had no way to have their data erased. Here they ask with their address,
get a code by email, and the code confirms the erasure.

Both steps answer the same whether or not anything is held about the address,
so the page can't be used to find out who is in the system.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.services.codes import issue_code, redeem_code
from app.services.erasure import erase_person, holds_data

router = APIRouter(prefix="/privacy", tags=["privacy"])

CODE_SENT = "If we hold any data about that address, we've emailed it a code to confirm the deletion."
WRONG_CODE = "That code is wrong or has expired. Ask for a new one."


class ErasureCodeRequest(BaseModel):
    email: str = Field(..., max_length=320)


class ErasureRequest(BaseModel):
    email: str = Field(..., max_length=320)
    code: str = Field(..., max_length=12)


def _address(email: str) -> str:
    return (email or "").strip().lower()


@router.post("/erasure-code")
@limiter.limit("3/hour")
async def erasure_code(request: Request, req: ErasureCodeRequest, background: BackgroundTasks,
                       db: AsyncSession = Depends(get_db)):
    """Email a code that confirms a deletion, if any data is held about the address.

    The same answer either way, and the email goes out after the response.
    """
    email = _address(req.email)
    answer = {"message": CODE_SENT}
    if "@" in email and await holds_data(db, email):
        from app.services.email_service import email_service
        code = await issue_code(db, email)
        background.add_task(email_service.send_erasure_code, email, code)
        if settings.debug and not email_service.configured:
            # Local development without email, as send-otp's debug_code.
            answer["debug_code"] = code
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
