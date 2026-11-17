"""Interview reports, written by a background job once the interview ends.

The report was written inside the request that finished the interview, and
the interview completed and got its report in one commit: the candidate's
browser and the interview worker waited on the AI, and a report it couldn't
write left nothing to say so. Each interview now says where its report
stands (report_status: pending, done or failed).
"""
import asyncio
import sqlite3

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine

from conftest import register


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _new_interview(manager_id, email):
    from app.core import database
    from app.models.candidate import Candidate
    from app.services import db_service
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Cand", email=email)
        db.add(cand)
        await db.commit()
        interview = await db_service.create_interview(db, {
            "candidate_id": cand.id, "manager_id": manager_id, "candidate_email": email, "role": "Dev",
        })
        return interview.report_status, interview.report_error


def test_an_interview_has_no_report_status_until_it_finishes(client):
    _, m = register(client, "rs1@co.com")
    assert _run(_new_interview(m["id"], "rs1@x.com")) == (None, None)


def test_an_older_local_database_gets_the_report_columns_at_start(tmp_path, monkeypatch, capsys):
    # The tables as the models make them, less the two new columns.
    import app.models.candidate  # noqa: F401
    from app.core import database
    path = tmp_path / "older.db"
    sync = create_engine(f"sqlite:///{path.as_posix()}")
    database.Base.metadata.create_all(sync)
    sync.dispose()
    db = sqlite3.connect(path)
    for column in ("report_status", "report_error"):
        db.execute(f"ALTER TABLE interviews DROP COLUMN {column}")
    db.commit()
    db.close()
    engine = create_async_engine(f"sqlite+aiosqlite:///{path.as_posix()}")
    monkeypatch.setattr(database, "engine", engine)

    async def start():
        try:
            await database.init_db()
        finally:
            await engine.dispose()
    _run(start())
    said = [line for line in capsys.readouterr().out.splitlines() if line.startswith("Database tables")]
    assert said == ["Database tables created; columns added: interviews.report_status, interviews.report_error"]


# ── finishing an interview, and its report job ────────────────────────────────

SAID = [{"role": "interviewer", "text": "Tell me about a hard bug."},
        {"role": "candidate", "text": "A race between two workers. " * 12}]


async def _started(manager_id, email, transcript=SAID, **fields):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    async with database.async_session() as db:
        cand = Candidate(manager_id=manager_id, name="Cand", email=email)
        db.add(cand)
        await db.flush()
        interview = Interview(candidate_id=cand.id, manager_id=manager_id, candidate_email=email, role="Dev",
                              mode="conversational", status="in_progress", transcript=transcript, **fields)
        db.add(interview)
        await db.commit()
        return interview.id


async def _complete(interview_id, duration=None, report=None):
    from app.core import database
    from app.models.candidate import Interview
    from app.services import db_service
    async with database.async_session() as db:
        interview = await db.get(Interview, interview_id)
        finished = await db_service.complete_interview(db, interview, duration, report=report)
        await db.commit()
        return finished


async def _state(interview_id):
    import json
    from app.core import database
    from app.models.candidate import Interview
    async with database.async_session() as db:
        iv = await db.get(Interview, interview_id)
        text = json.loads(iv.report)["report"] if iv.report else None
        return iv.status, iv.report_status, iv.report_error, text, iv.duration


async def _jobs():
    from sqlalchemy import select
    from app.core import database
    from app.models.job import Job
    async with database.async_session() as db:
        return [(j.kind, j.payload, j.dedupe_key, j.status) for j in (await db.execute(select(Job))).scalars()]


def _writer(monkeypatch, *answers):
    """The AI's report writer, answering each of `answers` in turn: a text,
    or an exception to raise. Records how many connections were checked out
    as it was called."""
    from app.core import database
    from app.services import interview_report
    calls = []
    answers = list(answers)

    async def write_report(transcript, role):
        calls.append(database.engine.sync_engine.pool.checkedout())
        answer = answers.pop(0)
        if isinstance(answer, BaseException):
            raise answer
        return answer
    monkeypatch.setattr(interview_report, "write_report", write_report)
    return calls


def test_the_server_registers_the_report_writer():
    import main  # noqa: F401
    from app.services import jobs
    assert jobs.handler_for("report.write").on_failure is not None


def test_an_interview_finishes_once_and_its_report_is_queued_with_it(client):
    _, m = register(client, "rj1@co.com")
    iid = _run(_started(m["id"], "rj1@x.com"))
    assert _run(_complete(iid, duration=300)) is True
    # A second post of the same ending changes nothing.
    assert _run(_complete(iid, duration=999)) is False
    assert _run(_state(iid)) == ("completed", "pending", None, None, 300)
    assert _run(_jobs()) == [("report.write", {"interview_id": iid}, f"report:{iid}", "queued")]


def test_the_report_is_written_with_no_database_connection_held(client, run_jobs, monkeypatch):
    calls = _writer(monkeypatch, "## A report")
    _, m = register(client, "rj2@co.com")
    iid = _run(_started(m["id"], "rj2@x.com"))
    _run(_complete(iid, duration=300))
    assert run_jobs() == ["done"]
    assert calls == [0]
    assert _run(_state(iid)) == ("completed", "done", None, "## A report", 300)


def test_a_busy_ai_is_tried_again_later(client, run_jobs, monkeypatch):
    from datetime import datetime, timedelta
    _writer(monkeypatch, TimeoutError(), "## A report")
    _, m = register(client, "rj3@co.com")
    iid = _run(_started(m["id"], "rj3@x.com"))
    _run(_complete(iid))
    assert run_jobs() == ["retry"]
    assert _run(_state(iid))[1] == "pending"
    assert run_jobs(now=datetime.utcnow() + timedelta(minutes=5)) == ["done"]
    assert _run(_state(iid))[1:4] == ("done", None, "## A report")


def test_a_report_that_cant_be_written_says_so(client, run_jobs, monkeypatch):
    _writer(monkeypatch, "", ValueError("ada@x.com said something odd"))
    _, m = register(client, "rj4@co.com")
    empty = _run(_started(m["id"], "rj4@x.com"))
    wrong = _run(_started(m["id"], "rj4b@x.com"))
    _run(_complete(empty))
    _run(_complete(wrong))
    assert run_jobs() == ["failed", "failed"]
    assert _run(_state(empty))[1:3] == ("failed", "report_empty")  # no AI key, or nothing came back
    assert _run(_state(wrong))[1:3] == ("failed", "error:ValueError")  # never the error's text


def test_a_fixed_report_is_kept_at_once_with_no_job(client):
    from app.services.db_service import TERMINATED_REPORT
    _, m = register(client, "rj5@co.com")
    iid = _run(_started(m["id"], "rj5@x.com", duration=120))
    assert _run(_complete(iid, report=TERMINATED_REPORT)) is True
    assert _run(_state(iid)) == ("completed", "done", None, TERMINATED_REPORT, 120)
    assert _run(_jobs()) == []


def test_the_job_leaves_a_report_written_meanwhile_and_a_deleted_interview(client, run_jobs, monkeypatch):
    from sqlalchemy import update
    from app.core import database
    from app.models.candidate import Candidate, Interview
    calls = _writer(monkeypatch)
    _, m = register(client, "rj6@co.com")
    written = _run(_started(m["id"], "rj6@x.com"))
    deleted = _run(_started(m["id"], "rj6b@x.com"))
    _run(_complete(written))
    _run(_complete(deleted))

    async def meanwhile():
        async with database.async_session() as db:
            await db.execute(update(Interview).where(Interview.id == written).values(report_status="done"))
            gone = await db.get(Interview, deleted)
            candidate_id = gone.candidate_id
            await db.delete(gone)
            await db.flush()
            await db.delete(await db.get(Candidate, candidate_id))
            await db.commit()
    _run(meanwhile())
    assert run_jobs() == ["done", "done"]
    assert calls == []  # the AI wasn't asked


def test_an_interview_deleted_while_its_report_is_written_is_left_alone(client, run_jobs, monkeypatch):
    from app.core import database
    from app.models.candidate import Candidate, Interview
    from app.services import interview_report
    _, m = register(client, "rj7@co.com")
    iid = _run(_started(m["id"], "rj7@x.com"))
    _run(_complete(iid))

    async def write_report(transcript, role):
        # Its manager deletes the candidate while the AI writes.
        async with database.async_session() as db:
            gone = await db.get(Interview, iid)
            candidate_id = gone.candidate_id
            await db.delete(gone)
            await db.flush()
            await db.delete(await db.get(Candidate, candidate_id))
            await db.commit()
        return "## A report"
    monkeypatch.setattr(interview_report, "write_report", write_report)
    assert run_jobs() == ["done"]


# ── voice ─────────────────────────────────────────────────────────────────────

def _as_candidate(email):
    from app.services.auth import create_candidate_token
    return {"Authorization": f"Bearer {create_candidate_token(email)}"}


def _emails(monkeypatch):
    """The managers' 'interview completed' emails, by interview."""
    from app.api import chat
    sent = []

    async def notify(db, interview):
        sent.append(interview.id)
    monkeypatch.setattr(chat, "_notify_manager_interview_complete", notify)
    return sent


def test_voice_finalize_answers_without_waiting_for_the_ai(client, run_jobs, monkeypatch):
    calls, sent = _writer(monkeypatch, "## A report"), _emails(monkeypatch)
    _, m = register(client, "v1@co.com")
    iid = _run(_started(m["id"], "v1@x.com", transcript=None))
    r = client.post("/api/realtime/finalize", headers=_as_candidate("v1@x.com"),
                    json={"interview_id": iid, "transcript": SAID, "duration": 300})
    assert r.status_code == 200 and r.json() == {"saved": True, "turns": 2, "report_status": "pending"}
    assert calls == [] and sent == [iid]  # the AI not yet asked; the manager told once
    assert run_jobs() == ["done"]
    assert _run(_state(iid)) == ("completed", "done", None, "## A report", 300)


def test_a_finalize_that_loses_the_race_keeps_nothing_of_its_own(client, monkeypatch):
    from app.services import db_service
    sent = _emails(monkeypatch)
    _, m = register(client, "v2@co.com")
    iid = _run(_started(m["id"], "v2@x.com"))
    real = db_service.complete_interview

    async def finished_meanwhile(db, interview, duration=None, report=None):
        # Another request finishes it between this one's look and its update.
        from app.core import database
        from app.models.candidate import Interview
        async with database.async_session() as other:
            await real(other, await other.get(Interview, iid), 111)
            await other.commit()
        return await real(db, interview, duration, report=report)
    monkeypatch.setattr(db_service, "complete_interview", finished_meanwhile)
    sent_again = [{"role": "candidate", "text": "The same interview, sent again"}]
    r = client.post("/api/realtime/finalize", headers=_as_candidate("v2@x.com"),
                    json={"interview_id": iid, "transcript": sent_again, "duration": 999})
    assert r.status_code == 200
    assert r.json() == {"saved": False, "already_completed": True, "turns": 2, "report_status": "pending"}
    assert _run(_state(iid))[4] == 111 and sent == []
    assert len(_run(_jobs())) == 1  # the first one's report job only
