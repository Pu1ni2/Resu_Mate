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
# Start from a clean file every session.
if os.path.exists(_TMP_DB):
    try:
        os.remove(_TMP_DB)
    except OSError:
        pass

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP_DB}"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-definitely-long-enough-1234567890"
os.environ["DEBUG"] = "true"
os.environ["AGENT_SHARED_SECRET"] = "test-agent-secret"
os.environ.pop("OPENAI_API_KEY", None)

# Import the app ONCE (no reload — reloading creates a second engine the routers
# don't use, which was the source of stale-data flakiness).
import asyncio  # noqa: E402
from app.core import database  # noqa: E402
import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.services.resume_rag import resume_rag  # noqa: E402

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


def register(client, email, password="pw12345678", name="Mgr"):
    """Register a hiring manager, return (token, user_dict)."""
    r = client.post("/api/auth/register", json={
        "name": name, "email": email, "password": password,
    })
    assert r.status_code in (200, 201), r.text
    data = r.json()
    return data["access_token"], data["user"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}
