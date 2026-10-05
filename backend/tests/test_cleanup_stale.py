"""The data-retention script deletes stale candidates by candidate, not address.

It used to delete every interview and grant for a stale row's email, across
all managers, so a person stale for one manager lost their current interview
with another.
"""
import asyncio
from datetime import datetime, timedelta

from sqlalchemy import func, select

from conftest import register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _person(manager_id, updated_at):
    """Maya as one manager's candidate, invited and interviewed by them."""
    from app.core import database
    from app.models.candidate import Candidate
    from app.services import db_service
    async with database.async_session() as db:
        row = Candidate(manager_id=manager_id, name="Maya", email="maya@x.com", updated_at=updated_at)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        await db_service.create_candidate_access(db, "maya@x.com", "Maya", row.id, manager_id=manager_id)
        await db_service.create_interview(db, {
            "candidate_id": row.id, "manager_id": manager_id, "candidate_email": "maya@x.com", "role": "Dev",
        })


async def _held_by(manager_id):
    """(candidates, interviews, grants) this manager holds."""
    from app.core import database
    from app.models.candidate import Candidate, CandidateAccess, Interview
    async with database.async_session() as db:
        return tuple([
            (await db.execute(select(func.count()).select_from(model).where(model.manager_id == manager_id))).scalar()
            for model in (Candidate, Interview, CandidateAccess)
        ])


def test_a_person_stale_for_one_manager_keeps_the_other_managers_data(client):
    import cleanup_stale
    _tok_a, a = register(client, "stale-a@co.com")
    _tok_b, b = register(client, "stale-b@co.com")
    _run(_person(a["id"], updated_at=datetime.utcnow() - timedelta(days=400)))
    _run(_person(b["id"], updated_at=datetime.utcnow()))

    _run(cleanup_stale.run(days=180, apply=True))
    assert _run(_held_by(a["id"])) == (0, 0, 0)
    assert _run(_held_by(b["id"])) == (1, 1, 1)


def test_a_dry_run_deletes_nothing(client):
    import cleanup_stale
    _tok, a = register(client, "stale-c@co.com")
    _run(_person(a["id"], updated_at=datetime.utcnow() - timedelta(days=400)))

    _run(cleanup_stale.run(days=180, apply=False))
    assert _run(_held_by(a["id"])) == (1, 1, 1)
