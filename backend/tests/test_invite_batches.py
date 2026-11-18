"""Batch invitations, prepared by background jobs.

A batch invite made each candidate's interview, questions and email inside
the request, one after another: five people took minutes, closing the page
lost every result, and asking again made every interview again.
"""
import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _batch(manager_id, client_key="click-1", **fields):
    from app.core import database
    from app.models.invite_batch import InviteBatch
    async with database.async_session() as db:
        batch = InviteBatch(**{"manager_id": manager_id, "source": "screening", "client_key": client_key,
                               "role": "Data Engineer", "level": "Mid-Level", "num_questions": 8,
                               "focus_areas": [], "mode": "conversational", **fields})
        db.add(batch)
        await db.commit()
        return batch.id


async def _item(batch_id, candidate_id, position=0, **fields):
    from app.core import database
    from app.models.invite_batch import InviteBatchItem
    async with database.async_session() as db:
        item = InviteBatchItem(batch_id=batch_id, candidate_id=candidate_id, position=position, **fields)
        db.add(item)
        await db.commit()
        return item.id


async def _candidate(manager_id, name):
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name=name, email=f"{name.lower()}@x.com")
        db.add(cand)
        await db.commit()
        return cand.id


async def _rows():
    from app.core import database
    from app.models.invite_batch import InviteBatch, InviteBatchItem
    async with database.async_session() as db:
        batches = [(b.manager_id, b.client_key) for b in (await db.execute(select(InviteBatch))).scalars()]
        items = [(i.batch_id, i.candidate_id) for i in (await db.execute(select(InviteBatchItem))).scalars()]
        return batches, items


# ── the tables ────────────────────────────────────────────────────────────────

def test_asking_again_with_the_same_key_is_the_same_batch(client):
    _, m = register(client, "ib1@co.com")
    _, other = register(client, "ib1b@co.com")
    _run(_batch(m["id"], "click-1"))
    with pytest.raises(IntegrityError):
        _run(_batch(m["id"], "click-1"))
    # Keys are each manager's own.
    _run(_batch(other["id"], "click-1"))
    assert sorted(_run(_rows())[0]) == sorted([(m["id"], "click-1"), (other["id"], "click-1")])


def test_a_candidate_is_in_a_batch_once(client):
    _, m = register(client, "ib2@co.com")
    batch = _run(_batch(m["id"]))
    _run(_item(batch, candidate_id=7))
    with pytest.raises(IntegrityError):
        _run(_item(batch, candidate_id=7, position=1))


def test_a_new_item_waits_its_turn_with_nothing_done_yet(client):
    from app.core import database
    from app.models.invite_batch import InviteBatchItem
    _, m = register(client, "ib3@co.com")
    item_id = _run(_item(_run(_batch(m["id"])), candidate_id=7))

    async def read():
        async with database.async_session() as db:
            item = await db.get(InviteBatchItem, item_id)
            return item.status, item.interview_id, item.reused, item.email_status
    assert _run(read()) == ("queued", None, False, None)


# ── what goes when something is deleted ───────────────────────────────────────

def test_deleting_an_account_deletes_its_batches_and_their_drafts(client):
    tok, m = register(client, "ib4@co.com")
    _, other = register(client, "ib4b@co.com")
    _run(_item(_run(_batch(m["id"])), candidate_id=7, email_body="Hi Ada, ..."))
    kept = _run(_batch(other["id"]))
    _run(_item(kept, candidate_id=8))
    r = client.post("/api/auth/delete-account", headers=auth_headers(tok), json={"password": "pw12345678"})
    assert r.status_code == 200, r.text
    assert _run(_rows()) == ([(other["id"], "click-1")], [(kept, 8)])


def test_deleting_a_candidate_deletes_their_place_in_batches(client):
    tok, m = register(client, "ib5@co.com")
    ada = _run(_candidate(m["id"], "Ada"))
    grace = _run(_candidate(m["id"], "Grace"))
    batch = _run(_batch(m["id"]))
    _run(_item(batch, candidate_id=ada, email_body="Hi Ada, ..."))
    _run(_item(batch, candidate_id=grace, position=1))
    r = client.delete(f"/api/candidates/{ada}", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    # The batch stays, with the others in it.
    assert _run(_rows()) == ([(m["id"], "click-1")], [(batch, grace)])


# ── making an interview ───────────────────────────────────────────────────────

async def _grants(email):
    from sqlalchemy import func
    from app.core import database
    from app.models.candidate import CandidateAccess
    async with database.async_session() as db:
        return (await db.execute(select(func.count()).select_from(CandidateAccess)
                                 .where(CandidateAccess.email == email))).scalar()


def _make(manager_id, candidate_id, mode="conversational"):
    from app.core import database
    from app.services import interview_setup

    async def make():
        async with database.async_session() as db:
            interview, _ = await interview_setup.create_interview(
                db, manager_id=manager_id, candidate={"name": "Ada"}, candidate_id=candidate_id,
                email="Ada@X.com", name="Ada", role="Dev", level="Mid-Level", num_questions=5,
                focus_areas=[], mode=mode)
            return interview
    return _run(make())


@pytest.fixture()
def no_questions(monkeypatch):
    from app.agents.technical_agent import technical_agent

    async def none(*args, **kwargs):
        return {}
    monkeypatch.setattr(technical_agent, "generate_smart_questions", none)


def test_an_interview_that_cant_be_saved_leaves_no_portal_access(client, no_questions):
    # The access was committed on its own, and stayed.
    _, m = register(client, "ib6@co.com")
    # A candidate with no row (one only in the server's memory): the foreign
    # key refuses the interview, once the access was added.
    assert _make(m["id"], candidate_id=99999) is None
    assert _run(_grants("ada@x.com")) == 0


def test_an_address_gets_its_portal_access_once_however_many_interviews(client, no_questions):
    _, m = register(client, "ib7@co.com")
    cid = _run(_candidate(m["id"], "Ada"))
    assert _make(m["id"], cid) is not None and _make(m["id"], cid) is not None
    assert _run(_grants("ada@x.com")) == 1
