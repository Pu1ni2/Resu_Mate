"""The AI's reading of a résumé, by a background job
(app/services/resume_analysis.py).

The upload waited for it inside the request: a minute when the AI was slow,
and an AI busy for a moment left the résumé unread for good.
"""
import asyncio
import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from conftest import register

from app.services.resume_rag import resume_rag

READING = {
    "summary": "Builds compilers.", "total_experience_years": 6, "predicted_role": "Compiler Engineer",
    "experience_level": "Senior", "location": "London, UK", "skills": ["C", "LLVM"],
    "education": [{"degree": "BSc", "institution": "UCL", "year": 2016}],
    "work_experience": [{"title": "Engineer", "company": "Acme", "start_date": "Jan 2019",
                         "end_date": "Present", "duration_months": 70}],
    "badges": [{"label": "Senior", "color": "blue"}], "key_strengths": ["Depth"],
}


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class _Reader:
    """The AI reading a résumé: says `answer` (as JSON when it isn't text),
    or raises it, or calls it first when it's a function. Each call records
    the database connections held meanwhile."""

    def __init__(self):
        self.answer, self.calls = READING, []

    async def ainvoke(self, messages):
        from app.core import database
        self.calls.append({"held": database.engine.sync_engine.pool.checkedout(), "prompt": messages[0].content})
        answer = self.answer
        if callable(answer):
            answer = await answer()
        if isinstance(answer, BaseException):
            raise answer
        return SimpleNamespace(content=answer if isinstance(answer, str) else json.dumps(answer))


@pytest.fixture()
def reader(monkeypatch):
    model = _Reader()
    monkeypatch.setattr(resume_rag, "llm", model)
    return model


async def _waiting(manager_id, text="Ada Lovelace, ada@x.com. Compiler engineer at Acme.", in_memory=True):
    """A candidate whose résumé waits to be read, its job queued, as an
    upload leaves them; and the server's copy of them, unless not."""
    from app.core import database
    from app.models.candidate import Candidate
    from app.services import resume_analysis
    async with database.async_session() as db:
        row = Candidate(manager_id=manager_id, name="Ada", email="ada@x.com", full_text=text, is_resume=True,
                        analysis_status="pending")
        db.add(row)
        await db.flush()
        await resume_analysis.queue(db, row.id, manager_id)
        await db.commit()
        candidate_id = row.id
    if in_memory:
        resume_rag.candidates.setdefault(manager_id, {})[candidate_id] = {
            "id": candidate_id, "manager_id": manager_id, "name": "Ada", "analysis_status": "pending",
            "analysis_failed": False}
    return candidate_id


async def _row(candidate_id):
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        row = await db.get(Candidate, candidate_id)
        return row and {
            "status": row.analysis_status, "failed": row.analysis_failed, "summary": row.summary,
            "role": row.predicted_role, "level": row.experience_level, "years": row.total_experience_years,
            "location": row.location, "skills": row.skills, "education": row.education,
            "work": row.work_experience, "badges": row.badges, "strengths": row.key_strengths, "name": row.name}


def _copy(manager_id, candidate_id):
    return resume_rag.candidates.get(manager_id, {}).get(candidate_id)


async def _set(candidate_id, **values):
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        row = await db.get(Candidate, candidate_id)
        for column, value in values.items():
            setattr(row, column, value)
        await db.commit()


def test_the_server_registers_the_resume_reader():
    import main  # noqa: F401
    from app.services import jobs
    handler = jobs.handler_for("resume.analyze")
    # Two at a time, so a dozen uploads don't hold up every other job.
    assert (handler.lane, handler.concurrency, handler.on_failure is not None) == ("work", 2, True)


def test_a_waiting_resume_is_read_with_no_connection_held(client, run_jobs, reader):
    _, m = register(client, "ra1@co.com")
    cid = _run(_waiting(m["id"]))
    assert run_jobs() == ["done"]
    assert [call["held"] for call in reader.calls] == [0]
    assert "Compiler engineer at Acme." in reader.calls[0]["prompt"]
    assert _run(_row(cid)) == {
        "status": "done", "failed": False, "summary": "Builds compilers.", "role": "Compiler Engineer",
        "level": "Senior", "years": 6, "location": "London, UK", "skills": ["C", "LLVM"],
        "education": READING["education"], "work": READING["work_experience"], "badges": READING["badges"],
        "strengths": ["Depth"], "name": "Ada"}
    # The server's copy too, which the candidate list and screening read.
    copy = _copy(m["id"], cid)
    assert (copy["analysis_status"], copy["analysis_failed"], copy["predicted_role"], copy["skills"]) == (
        "done", False, "Compiler Engineer", ["C", "LLVM"])


def test_the_reading_is_kept_as_the_columns_hold_it(client, run_jobs, reader):
    _, m = register(client, "ra2@co.com")
    cid = _run(_waiting(m["id"]))
    reader.answer = {**READING, "predicted_role": "R" * 300, "experience_level": "L" * 80, "location": None,
                     "skills": "C, LLVM", "badges": None, "total_experience_years": 45}
    assert run_jobs() == ["done"]
    row = _run(_row(cid))
    assert (len(row["role"]), len(row["level"]), row["location"]) == (200, 50, None)
    assert (row["skills"], row["badges"], row["years"]) == ([], [], 30)


def test_a_busy_ai_is_tried_again(client, run_jobs, reader):
    _, m = register(client, "ra3@co.com")
    cid = _run(_waiting(m["id"]))
    reader.answer = ConnectionError("the AI is busy")
    assert run_jobs() == ["retry"]
    assert _run(_row(cid))["status"] == "pending"
    reader.answer = READING
    assert run_jobs(now=datetime.utcnow() + timedelta(minutes=15)) == ["done"]
    assert _run(_row(cid))["status"] == "done"


@pytest.mark.parametrize("answer", ["not a reading at all", ["a", "list"], RuntimeError("the AI answered nothing")])
def test_a_resume_the_ai_cant_read_is_marked_so(client, run_jobs, reader, answer):
    _, m = register(client, f"ra4-{type(answer).__name__}@co.com")
    cid = _run(_waiting(m["id"]))
    reader.answer = answer
    assert run_jobs() == ["failed"]
    row = _run(_row(cid))
    assert (row["status"], row["failed"], row["role"], row["skills"]) == ("failed", True, None, [])
    copy = _copy(m["id"], cid)
    assert (copy["analysis_status"], copy["analysis_failed"]) == ("failed", True)


def test_with_no_ai_set_up_it_is_marked_failed(client, run_jobs, monkeypatch):
    monkeypatch.setattr(resume_rag, "llm", None)
    _, m = register(client, "ra5@co.com")
    cid = _run(_waiting(m["id"]))
    assert run_jobs() == ["failed"]
    assert _run(_row(cid))["status"] == "failed"


def test_a_candidate_deleted_before_their_reading_is_left_alone(client, run_jobs, reader):
    from app.core import database
    from app.models.candidate import Candidate
    _, m = register(client, "ra6@co.com")
    cid = _run(_waiting(m["id"]))

    async def deleted():
        async with database.async_session() as db:
            await db.delete(await db.get(Candidate, cid))
            await db.commit()
    _run(deleted())
    assert run_jobs() == ["done"]
    assert reader.calls == [] and _run(_row(cid)) is None


@pytest.mark.parametrize("meanwhile", ["read", "deleted"])
def test_a_reading_that_comes_too_late_is_dropped(client, run_jobs, reader, meanwhile):
    # Read again while the AI read it (the manager asked again, say), or
    # deleted: what the AI says then is kept nowhere.
    from app.core import database
    from app.models.candidate import Candidate
    _, m = register(client, f"ra7-{meanwhile}@co.com")
    cid = _run(_waiting(m["id"]))

    async def changed_meanwhile():
        if meanwhile == "read":
            await _set(cid, analysis_status="done", predicted_role="Kept")
        else:
            async with database.async_session() as db:
                await db.delete(await db.get(Candidate, cid))
                await db.commit()
        return READING
    reader.answer = changed_meanwhile
    assert run_jobs() == ["done"]
    row = _run(_row(cid))
    assert row is None if meanwhile == "deleted" else (row["status"], row["role"]) == ("done", "Kept")
    assert _copy(m["id"], cid)["analysis_status"] == "pending"


def test_a_failure_that_comes_too_late_is_dropped(client, run_jobs, reader):
    _, m = register(client, "ra7b@co.com")
    cid = _run(_waiting(m["id"]))

    async def read_meanwhile_then_failed():
        await _set(cid, analysis_status="done", predicted_role="Kept")
        return "not a reading at all"
    reader.answer = read_meanwhile_then_failed
    assert run_jobs() == ["failed"]
    row = _run(_row(cid))
    assert (row["status"], row["failed"], row["role"]) == ("done", False, "Kept")
    assert _copy(m["id"], cid)["analysis_status"] == "pending"


def test_a_candidate_the_server_has_no_copy_of_is_read_all_the_same(client, run_jobs, reader):
    _, m = register(client, "ra8@co.com")
    cid = _run(_waiting(m["id"], in_memory=False))
    assert run_jobs() == ["done"]
    assert _run(_row(cid))["status"] == "done"
    assert _copy(m["id"], cid) is None


def test_a_resume_is_read_once_at_a_time(client, run_jobs, reader):
    from app.core import database
    from app.models.job import Job
    from app.services import resume_analysis
    _, m = register(client, "ra9@co.com")
    cid = _run(_waiting(m["id"]))

    async def again():
        async with database.async_session() as db:
            queued = await resume_analysis.queue(db, cid, m["id"])
            await db.commit()
            jobs = (await db.execute(select(func.count()).select_from(Job).where(Job.kind == "resume.analyze"))).scalar()
            return queued, jobs
    assert _run(again()) == (None, 1)
    assert run_jobs() == ["done"] and len(reader.calls) == 1


# ── the upload ───────────────────────────────────────────────────────────────

# A résumé's words, 6,000 characters of them, then its last line: past what
# the upload's answer keeps of the text, within what the AI reads.
LONG = "Ada Lovelace, ada@x.com. Engineer with experience in a team at a company. " * 80 + "Mentored the compiler team."


def _upload(client, token, name, content):
    from conftest import auth_headers
    return client.post("/api/candidates/upload", headers=auth_headers(token),
                       files={"file": (name, content, "text/plain")})


async def _candidates(manager_id):
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        return (await db.execute(select(func.count()).select_from(Candidate)
                                 .where(Candidate.manager_id == manager_id))).scalar()


def test_an_upload_answers_before_the_ai_reads_it(client, run_jobs, reader):
    from conftest import auth_headers
    token, m = register(client, "ru1@co.com")
    r = _upload(client, token, "ada.txt", LONG.encode())
    assert r.status_code == 200, r.text
    said = r.json()
    # Not asked while the upload waited, and nothing made up meanwhile.
    assert reader.calls == []
    assert (said["analysis_status"], said["predicted_role"], said["experience_level"],
            said["total_experience_years"], said["skills"]) == ("pending", None, None, None, [])
    # The answer and the server's copy keep the shorter text.
    assert "full_text" not in said and "full_text" not in _copy(m["id"], said["id"])
    assert run_jobs() == ["done"]
    # The AI read the whole of it, from the database.
    assert "Mentored the compiler team." in reader.calls[0]["prompt"]
    listed = client.get("/api/candidates", headers=auth_headers(token)).json()["candidates"]
    assert [(c["analysis_status"], c["predicted_role"]) for c in listed] == [("done", "Compiler Engineer")]


def test_a_file_that_isnt_a_resume_is_done_at_once(client, run_jobs, reader):
    token, _ = register(client, "ru2@co.com")
    r = _upload(client, token, "list.txt", b"Milk, eggs, bread, apples, coffee, rice and tea for the week. " * 2)
    assert r.status_code == 200, r.text
    assert (r.json()["analysis_status"], r.json()["badges"]) == ("done", [{"label": "Not a Resume", "color": "orange"}])
    assert run_jobs() == [] and reader.calls == []


def test_a_candidate_is_saved_with_their_reading_or_not_at_all(client, run_jobs, reader, monkeypatch):
    # Saved alone, they would wait for a reading that never comes.
    from sqlalchemy.exc import OperationalError
    from app.services import resume_analysis
    token, m = register(client, "ru3@co.com")

    async def refused(*args, **kwargs):
        raise OperationalError("INSERT", {}, Exception("database is locked"))
    monkeypatch.setattr(resume_analysis, "queue", refused)
    r = _upload(client, token, "ada.txt", LONG.encode())
    assert r.status_code == 500
    assert _run(_candidates(m["id"])) == 0
    assert resume_rag.candidates.get(m["id"], {}) == {}


# ── reading it again ─────────────────────────────────────────────────────────

async def _failed(manager_id, in_memory=False, **fields):
    """A candidate whose reading failed, as the job leaves them; with this
    server's copy of them, as the list leaves it, or none (after a
    restart)."""
    from app.core import database
    from app.models.candidate import Candidate
    async with database.async_session() as db:
        row = Candidate(**{"manager_id": manager_id, "name": "Ada", "email": "ada@x.com", "is_resume": True,
                           "full_text": "Ada Lovelace, ada@x.com. Compiler engineer at Acme.",
                           "analysis_status": "failed", "analysis_failed": True, **fields})
        db.add(row)
        await db.commit()
        if in_memory:
            resume_rag.add_missing(manager_id, [resume_rag.record_from_row(row)])
        return row.id


def _read_again(client, token, candidate_id, status=202):
    from conftest import auth_headers
    r = client.post(f"/api/candidates/{candidate_id}/analyze", headers=auth_headers(token))
    assert r.status_code == status, r.text
    return r.json()


@pytest.mark.parametrize("kept, in_memory", [("failed", True), ("failed", False), (None, False)])
def test_a_resume_that_couldnt_be_read_is_read_again(client, run_jobs, reader, kept, in_memory):
    # None: one whose reading failed before the job read résumés.
    from conftest import auth_headers
    token, m = register(client, f"rr1-{kept}-{int(in_memory)}@co.com")
    cid = _run(_failed(m["id"], in_memory=in_memory, analysis_status=kept))
    said = _read_again(client, token, cid)
    assert (said["id"], said["analysis_status"], said["analysis_failed"]) == (cid, "pending", False)
    # The page asks after them, from the server's copy.
    asked = client.get(f"/api/candidates/{cid}", headers=auth_headers(token))
    assert asked.status_code == 200 and asked.json()["analysis_status"] == "pending"
    assert run_jobs() == ["done"]
    assert _run(_row(cid))["status"] == "done"
    asked = client.get(f"/api/candidates/{cid}", headers=auth_headers(token)).json()
    assert (asked["analysis_status"], asked["predicted_role"]) == ("done", "Compiler Engineer")


def test_only_a_resume_that_couldnt_be_read_is_read_again(client, run_jobs, reader):
    token, m = register(client, "rr2@co.com")
    _, other = register(client, "rr2b@co.com")
    read = _run(_failed(m["id"], analysis_status="done", analysis_failed=False))
    not_one = _run(_failed(m["id"], is_resume=False))
    theirs = _run(_failed(other["id"]))
    assert "read already" in _read_again(client, token, read, status=409)["detail"]
    assert "isn't a résumé" in _read_again(client, token, not_one, status=400)["detail"]
    _read_again(client, token, theirs, status=404)
    _read_again(client, token, 99999, status=404)
    assert run_jobs() == [] and reader.calls == []
    assert _run(_row(theirs))["status"] == "failed"


def test_one_being_read_is_left_to_it(client, run_jobs, reader):
    token, m = register(client, "rr3@co.com")
    cid = _run(_waiting(m["id"]))
    assert _read_again(client, token, cid)["analysis_status"] == "pending"
    assert run_jobs() == ["done"] and len(reader.calls) == 1
