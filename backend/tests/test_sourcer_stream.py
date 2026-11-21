"""A sourcing run, end to end: the search's events, as the background job reads
them, and the run it writes.

The outside world is faked (tests/sourcer_fakes.py), so these pin the order of
events the job relies on, the counts the page shows, and the fallbacks: no
LLM, and no prices.
"""
import sqlite3

from conftest import register, _TMP_DB
import sourcer_fakes as fakes


def _rows(sql, *args):
    with sqlite3.connect(_TMP_DB) as db:
        return db.execute(sql, args).fetchall()


def test_a_run_says_its_plan_then_people_then_done(client, monkeypatch):
    from app.services.resume_rag import resume_rag
    fakes.install(monkeypatch, github_people=3, web_people=2)
    _, user = register(client, "stream@co.com")
    fakes.seed_upload(resume_rag, user["id"], 1, "Maya Chen")

    evs = fakes.events_of(user["id"])
    types = [e["type"] for e in evs]

    assert types[0] == "plan"
    assert types[-1] == "done"
    found = [e["person"]["pid"] for e in evs if e["type"] == "found"]
    judged = [e["pid"] for e in evs if e["type"] == "judged"]
    # 1 upload + 3 GitHub + 2 web, each judged exactly once.
    assert len(found) == 6 and sorted(judged) == sorted(found)
    # Every person is announced before their judgement arrives.
    first = {pid: i for i, e in enumerate(evs) if e["type"] == "found" for pid in [e["person"]["pid"]]}
    for i, e in enumerate(evs):
        if e["type"] == "judged":
            assert first[e["pid"]] < i
    # The profile text the judge read is never passed on.
    assert all("text" not in e["person"] for e in evs if e["type"] == "found")


def test_the_final_stats_add_up(client, monkeypatch):
    from app.services.resume_rag import resume_rag
    fakes.install(monkeypatch, github_people=3, web_people=2, usage=(100, 20))
    _, user = register(client, "stats@co.com")
    fakes.seed_upload(resume_rag, user["id"], 1, "Maya Chen")

    evs = fakes.events_of(user["id"])
    stats = evs[-1]["stats"]
    assert stats["found"] == stats["judged"] == 6
    # Everyone is strong on the one must-have, so all six clear the line.
    assert stats["shortlisted"] == 6
    # The keyword filter needs "backend engineer" in the title: the upload and
    # the web people have it, the GitHub people ("Founding engineer") don't.
    assert stats["filter_would_show"] == 3
    assert stats["shortlisted_by_filter"] == 3
    assert stats["github_total"] == 4200


def test_a_finished_run_is_kept_with_everyone_it_judged(client, run_jobs, monkeypatch):
    fakes.install(monkeypatch, github_people=2, web_people=1)
    token, user = register(client, "save@co.com")

    run_id = fakes.search(client, run_jobs, token)["run"]["id"]
    [(status, manager_id)] = _rows("select status, manager_id from sourcing_runs where id = ?", run_id)
    assert (status, manager_id) == ("complete", user["id"])
    rows = _rows("select source, verdict, judgement from sourced_profiles where run_id = ?", run_id)
    assert len(rows) == 3 and all(r[1] in ("shortlist", "passed") and r[2] for r in rows)


def test_without_a_model_the_run_still_works_and_says_how_it_judged(client, monkeypatch):
    from app.tools.openai_tool import openai_tool
    calls = fakes.install(monkeypatch, github_people=2, web_people=1)
    monkeypatch.setattr(openai_tool, "llm", None)
    _, user = register(client, "nollm@co.com")

    evs = fakes.events_of(user["id"])
    plan = evs[0]["plan"]
    # The plan came from the description, not the (unconfigured) model.
    assert calls["plan"] == calls["judge"] == 0
    assert [c["label"] for c in plan["criteria"]][:2] == ["Backend engineer", "strong Python"]
    judged = [e for e in evs if e["type"] == "judged"]
    assert len(judged) == 3
    assert all(e["judgement"].startswith("Matched on keywords only") for e in judged)
    assert evs[-1]["type"] == "done"


def test_cost_is_shown_only_when_prices_are_configured(client, monkeypatch):
    from app.core.config import settings
    fakes.install(monkeypatch, github_people=2, web_people=0, usage=(1000, 200))
    _, user = register(client, "cost@co.com")

    stats = fakes.events_of(user["id"])[-1]["stats"]
    assert stats["cost_usd"] is None
    assert stats["tokens_in"] > 0 and stats["tokens_out"] > 0

    monkeypatch.setattr(settings, "sourcer_price_in_per_1m", 2.0)
    monkeypatch.setattr(settings, "sourcer_price_out_per_1m", 8.0)
    stats = fakes.events_of(user["id"])[-1]["stats"]
    expected = round((stats["tokens_in"] * 2.0 + stats["tokens_out"] * 8.0) / 1_000_000, 4)
    assert stats["cost_usd"] == expected > 0
