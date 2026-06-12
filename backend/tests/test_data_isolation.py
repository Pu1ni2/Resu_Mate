"""The most important test in the repo: two managers cannot see each other's
candidates or interviews. This is the regression guard for the multi-tenant
data-isolation work.
"""
from conftest import register, auth_headers


def _seed_candidate(resume_rag, manager_id, candidate_id, name, email):
    """Put a candidate straight into a manager's in-memory drawer."""
    resume_rag.candidates.setdefault(manager_id, {})[candidate_id] = {
        "id": candidate_id, "manager_id": manager_id, "name": name,
        "email": email, "is_resume": True, "text": "resume text",
        "skills": [], "predicted_role": "Engineer",
    }


def test_candidates_are_isolated_per_manager(client):
    from app.services.resume_rag import resume_rag

    tok_a, user_a = register(client, "a@co.com")
    tok_b, user_b = register(client, "b@co.com")
    mid_a, mid_b = user_a["id"], user_b["id"]

    _seed_candidate(resume_rag, mid_a, 1, "Alice", "alice@x.com")
    _seed_candidate(resume_rag, mid_b, 2, "Bob", "bob@x.com")

    # Manager A sees only Alice.
    ra = client.get("/api/candidates", headers=auth_headers(tok_a))
    assert ra.status_code == 200
    names_a = {c["name"] for c in ra.json()["candidates"]}
    assert names_a == {"Alice"}, names_a

    # Manager B sees only Bob.
    rb = client.get("/api/candidates", headers=auth_headers(tok_b))
    names_b = {c["name"] for c in rb.json()["candidates"]}
    assert names_b == {"Bob"}, names_b


def test_cannot_read_another_managers_candidate_by_id(client):
    from app.services.resume_rag import resume_rag

    tok_a, user_a = register(client, "a2@co.com")
    tok_b, user_b = register(client, "b2@co.com")
    _seed_candidate(resume_rag, user_b["id"], 5, "Carol", "carol@x.com")

    # A tries to fetch B's candidate id directly → 404 (existence not revealed).
    r = client.get("/api/candidates/5", headers=auth_headers(tok_a))
    assert r.status_code == 404

    # B can read it.
    r2 = client.get("/api/candidates/5", headers=auth_headers(tok_b))
    assert r2.status_code == 200
    assert r2.json()["name"] == "Carol"


def test_interview_results_are_isolated(client):
    """Completed interviews created under one manager are invisible to another."""
    import asyncio
    from app.core import database
    from app.services import db_service

    tok_a, user_a = register(client, "a3@co.com")
    tok_b, user_b = register(client, "b3@co.com")

    async def make_interview(manager_id, email):
        async with database.async_session() as db:
            iv = await db_service.create_interview(db, {
                "candidate_id": 0, "manager_id": manager_id,
                "candidate_email": email, "role": "Engineer",
            })
            await db_service.update_interview_status(
                db, email, "completed", report="done", scores=[8],
            )
            return iv

    asyncio.get_event_loop().run_until_complete(make_interview(user_a["id"], "ca@x.com"))
    asyncio.get_event_loop().run_until_complete(make_interview(user_b["id"], "cb@x.com"))

    ra = client.get("/api/chat/get-all-interview-results", headers=auth_headers(tok_a))
    assert ra.status_code == 200
    emails_a = {r["email"] for r in ra.json()["results"]}
    assert emails_a == {"ca@x.com"}, emails_a

    rb = client.get("/api/chat/get-all-interview-results", headers=auth_headers(tok_b))
    emails_b = {r["email"] for r in rb.json()["results"]}
    assert emails_b == {"cb@x.com"}, emails_b
