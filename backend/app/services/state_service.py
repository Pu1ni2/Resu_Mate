"""State service — DB-backed persistent storage for chat histories and advisor sessions"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.state import ChatHistory, AdvisorSession


# ── Chat histories ────────────────────────────────────────────────────────────

async def get_or_create_chat_history(
    db: AsyncSession, session_id: str, manager_id: int
) -> ChatHistory:
    result = await db.execute(
        select(ChatHistory).where(
            ChatHistory.session_id == session_id,
            ChatHistory.manager_id == manager_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        row = ChatHistory(session_id=session_id, manager_id=manager_id, messages=[])
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def update_chat_history(
    db: AsyncSession, session_id: str, manager_id: int, messages: list
) -> None:
    result = await db.execute(
        select(ChatHistory).where(
            ChatHistory.session_id == session_id,
            ChatHistory.manager_id == manager_id,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        row.messages = messages[-20:]  # Keep last 20 messages
        await db.commit()
    else:
        row = ChatHistory(session_id=session_id, manager_id=manager_id, messages=messages[-20:])
        db.add(row)
        await db.commit()


async def clear_chat_histories(db: AsyncSession, manager_id: int) -> None:
    result = await db.execute(
        select(ChatHistory).where(ChatHistory.manager_id == manager_id)
    )
    for row in result.scalars().all():
        await db.delete(row)
    await db.commit()


# ── Advisor sessions ──────────────────────────────────────────────────────────

async def get_or_create_advisor_session(
    db: AsyncSession, email: str
) -> AdvisorSession:
    result = await db.execute(
        select(AdvisorSession).where(AdvisorSession.email == email.lower().strip())
    )
    row = result.scalar_one_or_none()
    if not row:
        row = AdvisorSession(email=email.lower().strip())
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def update_advisor_session(
    db: AsyncSession,
    email: str,
    *,
    resume_text: Optional[str] = None,
    resume_metadata: Optional[dict] = None,
    mode: Optional[str] = None,
    messages: Optional[list] = None,
) -> AdvisorSession:
    row = await get_or_create_advisor_session(db, email)

    if resume_text is not None:
        row.resume_text = resume_text
    if resume_metadata is not None:
        row.resume_metadata = resume_metadata

    if mode and messages is not None:
        history = dict(row.chat_history or {})
        history[mode] = messages[-20:]
        row.chat_history = history

    await db.commit()
    await db.refresh(row)
    return row
