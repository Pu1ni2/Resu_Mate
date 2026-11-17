"""Shared test fixtures.

Spins the FastAPI app against a throwaway SQLite file DB and a real (but
isolated) resume_rag store. Each test gets a clean DB. Auth uses the real JWT
path so the data-isolation guarantees are exercised end to end.
"""
import os
import tempfile

import pytest

# Configure env BEFORE importing the app so settings + the DB engine pick it up.
_TMP_DB = os.path.join(tempfile.gettempdir(), "resumate_pytest.db")
# Start from a clean file every session, without the files SQLite keeps beside
# it in WAL mode: a -wal left by an earlier run would be replayed into the new
# file, rows and all.
for _leftover in (_TMP_DB, _TMP_DB + "-wal", _TMP_DB + "-shm"):
    if os.path.exists(_leftover):
        try:
            os.remove(_leftover)
        except OSError:
            pass

# No settings file: backend/.env holds a developer's real keys, and with them a
# test run could send real email and reach OpenAI and S3.
os.environ["RESUMATE_ENV_FILE"] = os.devnull
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP_DB}"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-definitely-long-enough-1234567890"
os.environ["DEBUG"] = "true"
os.environ["AGENT_SHARED_SECRET"] = "test-agent-secret"
os.environ.pop("OPENAI_API_KEY", None)
# No background job runner in the app: tests run due jobs themselves, at the
# moment they choose (tests/test_job_runner.py starts its own runners).
os.environ["JOBS_RUNNER"] = "false"

# Import the app ONCE (no reload — reloading creates a second engine the routers
# don't use, which was the source of stale-data flakiness).
import asyncio  # noqa: E402
from app.core import database  # noqa: E402
import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.services.resume_rag import resume_rag  # noqa: E402
from sqlalchemy import event  # noqa: E402


@event.listens_for(database.engine.sync_engine, "connect")
def _enforce_foreign_keys(dbapi_conn, _record):
    """Make SQLite check foreign keys, as Postgres always does.

    SQLite skips them unless asked. Deleting a candidate who had an interview
    passed here and failed in production, and tests could file interviews
    under candidates that did not exist.
    """
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

# Disable per-router rate limiters once — TestClient shares one IP so limits
# would trip across unrelated tests.
import sys as _sys  # noqa: E402
for _modname, _mod in list(_sys.modules.items()):
    if _modname.startswith("app.api.") and hasattr(_mod, "limiter"):
        try:
            _mod.limiter.enabled = False
        except Exception:
            pass
try:
    main.app.state.limiter.enabled = False
except Exception:
    pass


@pytest.fixture(autouse=True)
def _current_event_loop():
    """Make sure synchronous test code has an open event loop to run on.

    The client fixture and many tests run coroutines with
    asyncio.get_event_loop().run_until_complete(...). pytest-asyncio 0.24 and
    later close their loop after every async test and leave none current, so on
    a fresh install (which is what CI does) every database test that ran after
    an async one failed with "There is no current event loop". Older versions
    left a loop behind, which is why it passed locally.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())
    yield


@pytest.fixture()
def client():
    """A TestClient with a freshly-created schema and empty resume_rag store."""

    async def _reset_schema():
        async with database.engine.begin() as conn:
            await conn.run_sync(database.Base.metadata.drop_all)
            await conn.run_sync(database.Base.metadata.create_all)
    asyncio.get_event_loop().run_until_complete(_reset_schema())

    # Empty the in-memory candidate store between tests.
    resume_rag.candidates = {}
    resume_rag.uploaded_file_hashes = {}
    resume_rag.candidate_counter = 0

    with TestClient(main.app) as c:
        yield c


@pytest.fixture()
def kinds():
    """Register kinds of background job for one test: kinds(kind, run, **options),
    as app.services.jobs.handler takes them. They're gone after the test.

    The app's own kinds, such as the clean-up tasks, are set aside meanwhile:
    a test sees only the kinds it registers, and a runner it starts runs only
    those."""
    from app.services import jobs
    own = dict(jobs._handlers)
    jobs._handlers.clear()

    def register(kind, run, **options):
        jobs.handler(kind, **options)(run)
    yield register
    jobs._handlers.clear()
    jobs._handlers.update(own)


@pytest.fixture()
def run_jobs():
    """Run the background jobs that are due, as the app's runner would (it's
    off in tests), until none is: run_jobs(), or run_jobs(now=later) to reach
    a retry's time. Returns each one's outcome, in order."""
    from datetime import datetime
    from app.services import jobs
    worker = "test:0:runjobs0"

    def run(now=None):
        async def all_due():
            outcomes = []
            for _ in range(50):
                async with database.async_session() as db:
                    rows = await jobs.claim(db, list(jobs._handlers), limit=100, now=now or datetime.utcnow(),
                                            worker=worker, lease_seconds=60)
                if not rows:
                    return outcomes
                for row in rows:
                    outcomes.append(await jobs.run_claimed(row, worker, now=(lambda: now) if now else datetime.utcnow))
            raise AssertionError("jobs kept coming due")
        return asyncio.get_event_loop().run_until_complete(all_due())
    return run


def register(client, email, password="pw12345678", name="Mgr", verified=True):
    """Register a hiring manager, return (token, user_dict).

    The account's email is confirmed, as a manager's who opened the link
    sign-up emails, and that email isn't sent, so a test about other emails
    sees only those. verified=False leaves the account as sign-up does, the
    email sent.
    """
    import sqlite3
    from app.services.email_service import email_service
    patched = "send_email_verification" in vars(email_service)
    before = email_service.send_email_verification
    if verified:
        async def _not_sent(*_args, **_kwargs):
            return True
        email_service.send_email_verification = _not_sent
    try:
        r = client.post("/api/auth/register", json={
            "name": name, "email": email, "password": password, "accept_terms": True,
        })
    finally:
        if verified:
            if patched:
                email_service.send_email_verification = before
            else:
                del email_service.send_email_verification
    assert r.status_code in (200, 201), r.text
    data = r.json()
    if verified:
        db = sqlite3.connect(_TMP_DB)
        try:
            db.execute("UPDATE hiring_managers SET email_verified = 1 WHERE id = ?", (data["user"]["id"],))
            db.commit()
        finally:
            db.close()
        data["user"]["email_verified"] = True
    return data["access_token"], data["user"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}
