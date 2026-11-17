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
