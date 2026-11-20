"""The candidate list is read from the database.

It was the store's copy, made at start-up, so a start-up that couldn't reach
the database left every list empty until a restart.
"""
import asyncio

import pytest

from conftest import auth_headers, register

from app.services.resume_rag import resume_rag


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _rows(manager_id, *names):
    """Candidates in the database only, as after a start-up that couldn't load them."""
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        rows = [Candidate(manager_id=manager_id, name=name, email=f"{name.lower()}@x.com", is_resume=True,
                          predicted_role="Backend Engineer", skills=["Python"], file_hash=f"hash-{name}")
                for name in names]
        db.add_all(rows)
        await db.commit()
        return [row.id for row in rows]


def _listed(client, token):
    r = client.get("/api/candidates", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return r.json()["candidates"]


def test_the_list_is_read_from_the_database(client):
    token, user = register(client, "list@x.com")
    ids = _run(_rows(user["id"], "Ada", "Bea"))
    assert resume_rag.get_all_candidates(manager_id=user["id"]) == []
    assert [(c["id"], c["name"]) for c in _listed(client, token)] == list(zip(ids, ["Ada", "Bea"]))


def test_reading_it_puts_the_candidates_back_for_the_rest_of_the_app(client):
    token, user = register(client, "heal@x.com")
    [ada] = _run(_rows(user["id"], "Ada"))
    _listed(client, token)
    assert resume_rag.get_candidate(ada, manager_id=user["id"])["name"] == "Ada"
    # Their file's fingerprint too, so the same file isn't taken twice.
    assert "hash-Ada" in resume_rag.uploaded_file_hashes[user["id"]]
    # New uploads take ids past theirs.
    assert resume_rag.candidate_counter >= ada
    # And screening finds them.
    r = client.post("/api/pipeline/run", headers=auth_headers(token), json={"role": "Backend Engineer"})
    assert r.status_code == 200, r.text
    assert [c["name"] for c in r.json()["results"]] == ["Ada"]


def test_the_stores_own_record_is_listed_where_it_has_one(client):
    token, user = register(client, "own@x.com")
    [ada] = _run(_rows(user["id"], "Ada"))
    resume_rag.candidates.setdefault(user["id"], {})[ada] = {"id": ada, "name": "Ada", "resume_intel": {"kept": True}}
    [listed] = _listed(client, token)
    assert listed["resume_intel"] == {"kept": True}


def test_only_the_managers_own_are_listed(client):
    token, user = register(client, "mine@x.com")
    other_token, other = register(client, "theirs@x.com")
    _run(_rows(user["id"], "Ada"))
    _run(_rows(other["id"], "Bea"))
    assert [c["name"] for c in _listed(client, token)] == ["Ada"]
    assert resume_rag.get_all_candidates(manager_id=user["id"])[0]["name"] == "Ada"
    assert all(c["name"] != "Bea" for c in resume_rag.get_all_candidates(manager_id=user["id"]))


def test_without_the_database_the_stores_copy_is_listed(client, monkeypatch):
    from app.core import database
    token, user = register(client, "nodb@x.com")
    resume_rag.candidates.setdefault(user["id"], {})[7] = {"id": 7, "name": "Ada"}

    real = database.AsyncSession.execute

    async def no_candidates(self, statement, *args, **kwargs):
        # Signing in still reads the database; reading candidates fails.
        if "FROM candidates" in str(statement):
            raise ConnectionError("database away")
        return await real(self, statement, *args, **kwargs)
    monkeypatch.setattr(database.AsyncSession, "execute", no_candidates)
    assert [c["name"] for c in _listed(client, token)] == ["Ada"]


# ── how the reading of each résumé stands ────────────────────────────────────

async def _change(candidate_id, **values):
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        row = await db.get(Candidate, candidate_id)
        for column, value in values.items():
            setattr(row, column, value)
        await db.commit()


def test_each_candidate_says_how_the_reading_of_their_resume_stands(client):
    # Pending while it's being read, then done or failed. One from before
    # that was kept reads as done, or failed when its analysis failed.
    token, user = register(client, "status@x.com")
    ada, bea, cy, di = _run(_rows(user["id"], "Ada", "Bea", "Cy", "Di"))
    _run(_change(ada, analysis_status="pending"))
    _run(_change(bea, analysis_status="failed", analysis_failed=True))
    _run(_change(cy, analysis_failed=True))
    assert {c["name"]: c["analysis_status"] for c in _listed(client, token)} == {
        "Ada": "pending", "Bea": "failed", "Cy": "failed", "Di": "done"}


@pytest.mark.parametrize("reading, status", [("works", "done"), ("fails", "failed")])
def test_an_upload_says_so_too(client, monkeypatch, reading, status):
    from types import SimpleNamespace
    token, user = register(client, f"upload-{reading}@x.com")

    class Reader:
        async def ainvoke(self, messages):
            if reading == "fails":
                raise RuntimeError("the AI is away")
            return SimpleNamespace(content='{"summary": "Builds things.", "predicted_role": "Engineer"}')
    monkeypatch.setattr(resume_rag, "llm", Reader())
    r = client.post("/api/candidates/upload", headers=auth_headers(token), files={
        "file": ("ada.txt", b"Ada Lovelace, ada@x.com, engineer with experience in a team at a company. " * 3,
                 "text/plain")})
    assert r.status_code == 200, r.text
    assert r.json()["analysis_status"] == status
    assert [c["analysis_status"] for c in _listed(client, token)] == [status]
