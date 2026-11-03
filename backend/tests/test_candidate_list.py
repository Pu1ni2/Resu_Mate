"""The candidate list is read from the database.

It was the store's copy, made at start-up, so a start-up that couldn't reach
the database left every list empty until a restart.
"""
import asyncio

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
