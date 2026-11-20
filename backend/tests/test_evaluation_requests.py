"""Role-fit evaluations, each asked for kept and written by a background job
(app/models/evaluation.py).

An evaluation was written inside the request: a minute or more, lost when the
page closed, and a failure was gone with it.
"""
import asyncio

from sqlalchemy import select

from conftest import auth_headers, register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _candidate(manager_id, name="Ada", email="ada@x.com"):
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name=name, email=email, full_text=f"{name}\n{email}")
        db.add(cand)
        await db.commit()
        return cand.id


async def _asked(manager_id, candidate_id, **fields):
    from app.core import database
    from app.models.evaluation import EvaluationRequest
    async with database.async_session() as db:
        request = EvaluationRequest(manager_id=manager_id, candidate_id=candidate_id, role="Dev", **fields)
        db.add(request)
        await db.commit()
        return request.id


async def _requests():
    from app.core import database
    from app.models.evaluation import EvaluationRequest
    async with database.async_session() as db:
        return sorted((r.manager_id, r.candidate_id) for r in (await db.execute(select(EvaluationRequest))).scalars())


# ── the table ─────────────────────────────────────────────────────────────────

def test_an_evaluation_asked_for_waits_its_turn(client):
    from app.core import database
    from app.models.evaluation import EvaluationRequest
    _, m = register(client, "er1@co.com")
    request_id = _run(_asked(m["id"], _run(_candidate(m["id"]))))

    async def read():
        async with database.async_session() as db:
            request = await db.get(EvaluationRequest, request_id)
            return (request.status, request.error, request.evaluation_id, request.anonymized,
                    request.finished_at is None, request.created_at is not None)
    assert _run(read()) == ("pending", None, None, False, True, True)


def test_deleting_an_account_deletes_the_evaluations_it_asked_for(client):
    tok, m = register(client, "er2@co.com")
    _, other = register(client, "er2b@co.com")
    _run(_asked(m["id"], _run(_candidate(m["id"]))))
    theirs = _run(_candidate(other["id"], "Bea", "bea@x.com"))
    _run(_asked(other["id"], theirs))
    # One of theirs asked about another's candidate, as no page asks, goes
    # with them too, leaving the candidate.
    _run(_asked(m["id"], theirs))
    r = client.post("/api/auth/delete-account", headers=auth_headers(tok), json={"password": "pw12345678"})
    assert r.status_code == 200, r.text
    assert _run(_requests()) == [(other["id"], theirs)]


def test_deleting_a_candidate_deletes_the_evaluations_asked_of_them(client):
    tok, m = register(client, "er3@co.com")
    ada, bea = _run(_candidate(m["id"])), _run(_candidate(m["id"], "Bea", "bea@x.com"))
    _run(_asked(m["id"], ada))
    _run(_asked(m["id"], ada, status="done"))
    _run(_asked(m["id"], bea))
    r = client.delete(f"/api/candidates/{ada}", headers=auth_headers(tok))
    assert r.status_code == 200, r.text
    assert _run(_requests()) == [(m["id"], bea)]


def test_erasing_a_person_deletes_the_evaluations_asked_of_them(client):
    from app.core import database
    from app.services.erasure import erase_person
    _, m = register(client, "er4@co.com")
    ada, bea = _run(_candidate(m["id"])), _run(_candidate(m["id"], "Bea", "bea@x.com"))
    _run(_asked(m["id"], ada))
    _run(_asked(m["id"], bea))

    async def erase():
        async with database.async_session() as db:
            await erase_person(db, "ada@x.com")
    _run(erase())
    assert _run(_requests()) == [(m["id"], bea)]
