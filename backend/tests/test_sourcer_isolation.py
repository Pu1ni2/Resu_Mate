"""Sourcing is per manager: every route needs a manager token, and one manager
can never read, change or delete another's runs, nor see their uploads in a run.
Another manager's run is a 404, not a 403, so ids can't be probed.
"""
from conftest import register, auth_headers
import sourcer_fakes as fakes


def _finish_run(client, token, description="Backend engineer in Boston, strong Python"):
    r = client.post("/api/sourcer/runs", json={"description": description}, headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return next(e for e in fakes.events(r) if e["type"] == "saved")


def test_history_lists_only_my_runs(client, monkeypatch):
    fakes.install(monkeypatch, github_people=1, web_people=0)
    tok_a, _ = register(client, "hist-a@co.com")
    tok_b, _ = register(client, "hist-b@co.com")
    _finish_run(client, tok_a, "First search for A")
    _finish_run(client, tok_a, "Second search for A")
    _finish_run(client, tok_b, "B's search")

    runs = client.get("/api/sourcer/runs", headers=auth_headers(tok_a)).json()["runs"]
    # Newest first, and nothing of B's.
    assert [r["description"] for r in runs] == ["Second search for A", "First search for A"]
    assert all(r["status"] == "complete" and r["judged"] == 1 for r in runs)


def test_a_run_reopens_with_everyone_it_judged(client, monkeypatch):
    fakes.install(monkeypatch, github_people=2, web_people=1)
    token, _ = register(client, "reopen@co.com")
    saved = _finish_run(client, token)

    body = client.get(f"/api/sourcer/runs/{saved['run_id']}", headers=auth_headers(token)).json()
    assert body["run"]["plan"]["criteria"]
    pids = [p["pid"] for p in body["profiles"]]
    assert sorted(pids) == sorted(saved["profile_ids"])
    scores = [p["score"] for p in body["profiles"]]
    assert scores == sorted(scores, reverse=True)


def test_another_managers_run_is_not_found(client, monkeypatch):
    fakes.install(monkeypatch, github_people=1, web_people=0)
    tok_a, _ = register(client, "own-a@co.com")
    tok_b, _ = register(client, "own-b@co.com")
    saved = _finish_run(client, tok_a)

    r = client.get(f"/api/sourcer/runs/{saved['run_id']}", headers=auth_headers(tok_b))
    assert r.status_code == 404


def test_i_can_save_and_dismiss_my_profiles(client, monkeypatch):
    fakes.install(monkeypatch, github_people=2, web_people=0)
    token, _ = register(client, "status@co.com")
    saved = _finish_run(client, token)
    first, second = saved["profile_ids"].values()

    r = client.post(f"/api/sourcer/profiles/{first}/status", json={"status": "saved"}, headers=auth_headers(token))
    assert r.status_code == 200 and r.json()["profile"]["status"] == "saved"
    client.post(f"/api/sourcer/profiles/{second}/status", json={"status": "dismissed"}, headers=auth_headers(token))

    body = client.get(f"/api/sourcer/runs/{saved['run_id']}", headers=auth_headers(token)).json()
    assert {p["id"]: p["status"] for p in body["profiles"]} == {first: "saved", second: "dismissed"}
    bad = client.post(f"/api/sourcer/profiles/{first}/status", json={"status": "hired"}, headers=auth_headers(token))
    assert bad.status_code == 422


def test_i_cannot_change_another_managers_profile(client, monkeypatch):
    fakes.install(monkeypatch, github_people=1, web_people=0)
    tok_a, _ = register(client, "st-a@co.com")
    tok_b, _ = register(client, "st-b@co.com")
    [profile_id] = _finish_run(client, tok_a)["profile_ids"].values()

    r = client.post(f"/api/sourcer/profiles/{profile_id}/status", json={"status": "dismissed"}, headers=auth_headers(tok_b))
    assert r.status_code == 404


def test_deleting_a_run_removes_its_profiles_and_is_audited(client, monkeypatch):
    import sqlite3
    from conftest import _TMP_DB
    fakes.install(monkeypatch, github_people=2, web_people=1)
    token, user = register(client, "del@co.com")
    saved = _finish_run(client, token)

    r = client.delete(f"/api/sourcer/runs/{saved['run_id']}", headers=auth_headers(token))
    assert r.status_code == 200
    assert client.get(f"/api/sourcer/runs/{saved['run_id']}", headers=auth_headers(token)).status_code == 404
    with sqlite3.connect(_TMP_DB) as db:
        assert db.execute("select count(*) from sourced_profiles where run_id = ?", (saved["run_id"],)).fetchone() == (0,)
        [(detail,)] = db.execute(
            "select detail from audit_log where action = 'sourcing.delete' and manager_id = ?", (user["id"],)
        ).fetchall()
    assert detail == f"run {saved['run_id']}, 3 profiles"


def test_i_cannot_delete_another_managers_run(client, monkeypatch):
    fakes.install(monkeypatch, github_people=1, web_people=0)
    tok_a, _ = register(client, "del-a@co.com")
    tok_b, _ = register(client, "del-b@co.com")
    saved = _finish_run(client, tok_a)

    assert client.delete(f"/api/sourcer/runs/{saved['run_id']}", headers=auth_headers(tok_b)).status_code == 404
    assert client.get(f"/api/sourcer/runs/{saved['run_id']}", headers=auth_headers(tok_a)).status_code == 200


def test_an_outreach_draft_cites_what_the_judge_saw(client, monkeypatch):
    from app.services.resume_rag import resume_rag
    from app.tools.openai_tool import openai_tool
    fakes.install(monkeypatch, github_people=0, web_people=0)
    token, user = register(client, "draft@co.com")
    fakes.seed_upload(resume_rag, user["id"], 1, "Maya Chen")
    [profile_id] = _finish_run(client, token)["profile_ids"].values()

    prompts = []

    async def write(prompt, system="", json_mode=False):
        prompts.append(prompt)
        return "SUBJECT: Your Python work\nBODY:\nHi Maya,\n[Your Name]"

    monkeypatch.setattr(openai_tool, "structured_call", write)
    r = client.post(f"/api/sourcer/profiles/{profile_id}/draft-outreach", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["subject"] == "Your Python work" and body["to"] == "maya@example.com"
    # The judge's evidence for the must-have reaches the prompt, labelled.
    assert "Python: c1 evidence" in prompts[0]
    assert "has not applied" in prompts[0]


def test_an_outreach_draft_without_a_model_is_a_plain_note(client, monkeypatch):
    from app.tools.openai_tool import openai_tool
    fakes.install(monkeypatch, github_people=1, web_people=0)
    token, _ = register(client, "draft2@co.com")
    [profile_id] = _finish_run(client, token)["profile_ids"].values()

    async def nothing(prompt, system="", json_mode=False):
        return ""

    monkeypatch.setattr(openai_tool, "structured_call", nothing)
    body = client.post(f"/api/sourcer/profiles/{profile_id}/draft-outreach", headers=auth_headers(token)).json()
    assert body["body"].startswith("Hi Dev0,") and "Backend Engineer" in body["subject"]
    assert body["profile_url"] == "https://github.com/dev0"


def test_i_cannot_draft_to_another_managers_profile(client, monkeypatch):
    fakes.install(monkeypatch, github_people=1, web_people=0)
    tok_a, _ = register(client, "dr-a@co.com")
    tok_b, _ = register(client, "dr-b@co.com")
    [profile_id] = _finish_run(client, tok_a)["profile_ids"].values()
    assert client.post(f"/api/sourcer/profiles/{profile_id}/draft-outreach", headers=auth_headers(tok_b)).status_code == 404


def test_every_sourcer_route_needs_a_manager(client):
    routes = [
        ("post", "/api/sourcer/runs", {"description": "Backend engineer"}),
        ("get", "/api/sourcer/runs", None),
        ("get", "/api/sourcer/runs/1", None),
        ("delete", "/api/sourcer/runs/1", None),
        ("post", "/api/sourcer/profiles/1/status", {"status": "saved"}),
        ("post", "/api/sourcer/profiles/1/draft-outreach", None),
    ]
    for method, path, body in routes:
        r = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
        assert r.status_code == 401, (method, path, r.status_code)


def test_a_run_never_reads_another_managers_uploads(client, monkeypatch):
    from app.services.resume_rag import resume_rag
    fakes.install(monkeypatch, github_people=0, web_people=0)
    tok_a, user_a = register(client, "pool-a@co.com")
    _, user_b = register(client, "pool-b@co.com")
    fakes.seed_upload(resume_rag, user_a["id"], 1, "Alice Mine")
    fakes.seed_upload(resume_rag, user_b["id"], 2, "Bob Theirs")

    r = client.post("/api/sourcer/runs", json={"description": "Backend engineer"}, headers=auth_headers(tok_a))
    names = [e["person"]["name"] for e in fakes.events(r) if e["type"] == "found"]
    assert names == ["Alice Mine"]
    assert "Bob Theirs" not in r.text


def test_a_run_needs_a_description_and_somewhere_to_look(client, monkeypatch):
    fakes.install(monkeypatch)
    token, _ = register(client, "valid@co.com")
    short = client.post("/api/sourcer/runs", json={"description": "  a "}, headers=auth_headers(token))
    assert short.status_code == 400
    nowhere = client.post("/api/sourcer/runs", json={
        "description": "Backend engineer", "sources": {"uploads": False, "github": False, "web": False},
    }, headers=auth_headers(token))
    assert nowhere.status_code == 400
