"""State service — DB-backed persistent storage for chat histories and advisor sessions"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select

from app.models.state import ChatHistory, AdvisorSession


# ── Chat histories ────────────────────────────────────────────────────────────
#
# The selected-candidates chat's conversations, per manager and conversation
# id. They were kept in the server's memory: a restart, or the free plan's
# sleep, lost them, and each server process had its own.

async def read_chat_history(db: AsyncSession, session_id: str, manager_id: int) -> list:
    """The conversation's messages, oldest first: [] when there are none."""
    row = (await db.execute(
        select(ChatHistory).where(ChatHistory.session_id == session_id, ChatHistory.manager_id == manager_id)
    )).scalar_one_or_none()
    return list(row.messages or []) if row else []


async def remember_chat(db: AsyncSession, session_id: str, manager_id: int, question: str, answer: str) -> None:
    """Add one exchange to the conversation, which keeps its last 20 messages."""
    history = await read_chat_history(db, session_id, manager_id)
    history += [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]
    await update_chat_history(db, session_id, manager_id, history)


async def forget_chats(db: AsyncSession, manager_ids) -> None:
    """Delete these managers' conversations, in the caller's transaction: what
    the chat said may be about someone being deleted."""
    ids = [m for m in set(manager_ids) if m is not None]
    if ids:
        await db.execute(delete(ChatHistory).where(ChatHistory.manager_id.in_(ids)))


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
