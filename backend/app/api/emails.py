"""The emails a manager's actions queued, as their pages follow them: whether
each has gone yet, and why not (app/models/email_outbox.py). Never whom it
was to, nor what it said.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.email_outbox import EmailOutbox
from app.services.auth import get_current_user

router = APIRouter(prefix="/api/emails", tags=["emails"])

# The most a page asks after at once: a batch's invitations.
MAX_IDS = 100


@router.get("")
async def email_statuses(ids: str = Query(..., max_length=1000), user=Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    """How each of these emails went: queued, sent, failed (with why),
    skipped or cancelled. Only the manager's own: another's, and ids that
    don't exist, are left out."""
    try:
        wanted = [int(part) for part in ids.split(",") if part.strip()]
    except ValueError:
        raise HTTPException(400, "Ask after emails by their ids, separated by commas.")
    if len(wanted) > MAX_IDS:
        raise HTTPException(400, f"Ask after up to {MAX_IDS} emails at a time.")
    rows = (await db.execute(select(EmailOutbox).where(
        EmailOutbox.id.in_(wanted), EmailOutbox.manager_id == user.id,
    ).order_by(EmailOutbox.id))).scalars()
    return {"emails": [{"id": email.id, "kind": email.kind, "interview_id": email.interview_id,
                        "status": email.status, "error": email.error} for email in rows]}
