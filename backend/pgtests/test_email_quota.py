"""What only Postgres shows: two requests reserving a manager's last email of
the day at the same time, only one of them taking it (app/services/
email_quota.py, reserve).

These run in CI's postgres job, on a database the migrations built, not in
the main suite, whose database is SQLite (tests/test_daily_email_limit.py
has the rest).
"""
import asyncio
import os

import pytest

if not os.environ.get("DATABASE_URL", "").startswith("postgres"):
    pytest.skip("needs DATABASE_URL to be a Postgres database", allow_module_level=True)
os.environ.setdefault("RESUMATE_ENV_FILE", os.devnull)

from sqlalchemy import delete  # noqa: E402

from app.core import database  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.models.auth import HiringManager  # noqa: E402
from app.models.email_outbox import EmailOutbox  # noqa: E402
from app.services import email_quota  # noqa: E402

ADDRESS = "pgtest-quota@co.com"


async def _manager():
    async with database.async_session() as db:
        await db.execute(delete(HiringManager).where(HiringManager.email == ADDRESS))
        manager = HiringManager(name="Pg", email=ADDRESS, password_hash="x", email_verified=True)
        db.add(manager)
        await db.commit()
        return manager.id


async def _clear(manager_id):
    async with database.async_session() as db:
        await db.execute(delete(EmailOutbox).where(EmailOutbox.manager_id == manager_id))
        await db.execute(delete(HiringManager).where(HiringManager.id == manager_id))
        await db.commit()
    await database.engine.dispose()


async def _take(manager_id, hold_for=0.0):
    """Reserve a place and queue an email in it, keeping the transaction open
    a while; or why there was none."""
    async with database.async_session() as db:
        manager = await db.get(HiringManager, manager_id)
        refused = await email_quota.reserve(db, manager)
        if refused is None:
            db.add(EmailOutbox(kind="interview_invitation", manager_id=manager_id, counts_to_quota=True))
            await db.flush()
            await asyncio.sleep(hold_for)
            await db.commit()
        return refused


def test_two_at_once_cannot_both_take_the_last_place(monkeypatch):
    monkeypatch.setattr(settings, "daily_email_limit", 1)

    async def scenario():
        manager_id = await _manager()
        try:
            first = asyncio.ensure_future(_take(manager_id, hold_for=0.5))
            await asyncio.sleep(0.1)
            # It waits for the first to commit, then counts the email it queued.
            second = await asyncio.wait_for(_take(manager_id), timeout=10)
            return await first, second
        finally:
            await _clear(manager_id)
    assert asyncio.run(scenario()) == (None, email_quota.limit_reached())
