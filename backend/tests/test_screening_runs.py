"""Screening runs are kept, to be opened again.

A run lived only in the page, so opening a candidate's file, or a refresh,
meant screening again. A kept run holds what it worked out about each
candidate, and who they are is read from their record when it's opened.
"""
import asyncio
import json

from sqlalchemy import select

from conftest import auth_headers, register

from app.services import screening_runs
from app.services.resume_rag import resume_rag


def person(**extra):
    base = {"id": 1, "name": "Ada", "email": "ada@x.com", "skills": ["Python"],
            "total_experience_years": 5, "predicted_role": "Backend Engineer",
            "summary": "Builds APIs.", "key_strengths": [], "education": [],
            "is_resume": True, "file_hash": "hash-1"}
    base.update(extra)
    return base


def seed(manager_id, *candidates):
    drawer = resume_rag.candidates.setdefault(manager_id, {})
    for c in candidates:
        drawer[c["id"]] = c
    return drawer


def screen(client, token, role="Backend Engineer", **body):
    r = client.post("/api/pipeline/run", headers=auth_headers(token), json={"role": role, **body})
    assert r.status_code == 200, r.text
    return r.json()


def open_run(client, token, run_id):
    return client.get(f"/api/pipeline/runs/{run_id}", headers=auth_headers(token))


def listed(client, token):
    r = client.get("/api/pipeline/runs", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return r.json()["runs"]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _kept(manager_id):
    from app.core import database
    from app.models.screening import ScreeningRun
    async with database.async_session() as db:
        rows = await db.execute(select(ScreeningRun).where(ScreeningRun.manager_id == manager_id))
        return [row.run for row in rows.scalars()]


def test_a_run_opens_again_as_it_was_answered(client):
    token, user = register(client, "runs@x.com")
    seed(user["id"], person(id=1, name="Ada"),
         person(id=2, name="Bea", predicted_role="Pastry Chef", file_hash="hash-2"))
    ran = screen(client, token)
    assert ran["run_id"]
    r = open_run(client, token, ran["run_id"])
    assert r.status_code == 200, r.text
    opened = r.json()
    for key in ("role", "total_screened", "assessed", "excluded", "jd_requirements",
                "results", "shortlist", "stats"):
        assert opened[key] == ran[key], key
    assert opened["created_at"]


def test_who_a_candidate_is_comes_from_their_record_today(client):
    token, user = register(client, "today@x.com")
    drawer = seed(user["id"], person(name="Ada"))
    ran = screen(client, token)
    drawer[1]["name"] = "Ada Lovelace"
    opened = open_run(client, token, ran["run_id"]).json()
    assert opened["results"][0]["name"] == "Ada Lovelace"
    assert opened["results"][0]["ats_score"] == ran["results"][0]["ats_score"]


def test_a_kept_run_holds_no_names_or_addresses(client):
    token, user = register(client, "private@x.com")
    seed(user["id"], person(name="Ada Quill", email="ada.quill@x.com", summary="Builds APIs at Quillco."))
    ran = screen(client, token)
    kept = _run(_kept(user["id"]))
    assert [r["candidate_id"] for r in kept[0]["results"]] == [1]
    text = json.dumps(kept)
    for detail in ("Ada Quill", "ada.quill@x.com", "Quillco"):
        assert detail not in text
    assert open_run(client, token, ran["run_id"]).json()["results"][0]["email"] == "ada.quill@x.com"


def test_a_candidate_deleted_since_is_left_out(client):
    token, user = register(client, "deleted@x.com")
    seed(user["id"], person(id=1, name="Ada"), person(id=2, name="Bea", file_hash="hash-2"))
    ran = screen(client, token)
    assert ran["total_screened"] == 2
    resume_rag.delete_candidate(2, manager_id=user["id"])
    opened = open_run(client, token, ran["run_id"]).json()
    assert [c["name"] for c in opened["results"]] == ["Ada"]
    assert opened["total_screened"] == 1
    assert [c["candidate_id"] for c in opened["shortlist"]] == [1]
    assert sum(opened["stats"].values()) == 1


def test_an_id_now_holding_another_file_does_not_take_the_old_scores(client):
    token, user = register(client, "reused@x.com")
    drawer = seed(user["id"], person(name="Ada"))
    ran = screen(client, token)
    drawer[1] = person(name="Someone else", file_hash="hash-other")
    opened = open_run(client, token, ran["run_id"]).json()
    assert opened["results"] == []
    assert opened["shortlist"] == []
    assert opened["total_screened"] == 0


def test_runs_are_listed_newest_first(client):
    token, user = register(client, "list@x.com")
    seed(user["id"], person(id=1), person(id=2, file_hash="hash-2"))
    first = screen(client, token, role="Backend Engineer")
    second = screen(client, token, role="Data Engineer", candidate_ids=[1])
    runs = listed(client, token)
    assert [(r["run_id"], r["role"], r["total_screened"]) for r in runs] == [
        (second["run_id"], "Data Engineer", 1), (first["run_id"], "Backend Engineer", 2)]
    assert all(r["created_at"] for r in runs)


def test_only_a_managers_newest_runs_are_kept(client, monkeypatch):
    monkeypatch.setattr(screening_runs, "KEPT_RUNS", 2)
    other_token, other = register(client, "kept-other@x.com")
    seed(other["id"], person())
    theirs = screen(client, other_token)["run_id"]
    token, user = register(client, "kept@x.com")
    seed(user["id"], person())
    ids = [screen(client, token)["run_id"] for _ in range(3)]
    assert [r["run_id"] for r in listed(client, token)] == [ids[2], ids[1]]
    assert open_run(client, token, ids[0]).status_code == 404
    # Another manager's runs don't count towards them.
    assert open_run(client, other_token, theirs).status_code == 200


def test_another_manager_cannot_open_a_run(client):
    token, user = register(client, "mine@x.com")
    seed(user["id"], person())
    ran = screen(client, token)
    other_token, _ = register(client, "theirs@x.com")
    assert open_run(client, other_token, ran["run_id"]).status_code == 404
    assert listed(client, other_token) == []


def test_a_run_that_cannot_be_kept_is_still_answered(client, monkeypatch):
    async def broken(*args, **kwargs):
        raise RuntimeError("database away")
    monkeypatch.setattr(screening_runs, "save", broken)
    token, user = register(client, "unkept@x.com")
    seed(user["id"], person())
    ran = screen(client, token)
    assert ran["run_id"] is None
    assert [c["name"] for c in ran["results"]] == ["Ada"]


def test_deleting_the_account_deletes_its_runs(client):
    token, user = register(client, "gone@x.com")
    seed(user["id"], person())
    screen(client, token)
    assert len(_run(_kept(user["id"]))) == 1
    r = client.post("/api/auth/delete-account", headers=auth_headers(token), json={"password": "pw12345678"})
    assert r.status_code == 200, r.text
    assert _run(_kept(user["id"])) == []
