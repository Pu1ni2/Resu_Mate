"""Starting up with a database: what gets logged, and when startup must stop.

The boot line used to print Postgres's user:password, and a database that was
down or not migrated was printed and ignored while the app came up anyway.
"""
import os
import re

import pytest
from fastapi.testclient import TestClient

from app.core import database

VERSIONS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "alembic", "versions")


def test_the_logged_url_masks_the_password():
    shown = database.display_url("postgresql+asyncpg://resumate:s3cret@db.example.com:5432/resumate")
    assert "s3cret" not in shown
    assert shown == "postgresql+asyncpg://resumate:***@db.example.com:5432/resumate"


def test_a_sqlite_url_is_logged_as_it_is():
    assert database.display_url("sqlite+aiosqlite:///./resumate.db") == "sqlite+aiosqlite:///./resumate.db"


def test_the_migration_head_is_the_revision_nothing_builds_on():
    revisions, parents = set(), set()
    for name in os.listdir(VERSIONS):
        if not name.endswith(".py"):
            continue
        text = open(os.path.join(VERSIONS, name), encoding="utf-8").read()
        revisions.add(re.search(r"^revision[^=]*=\s*['\"](\w+)['\"]", text, re.M).group(1))
        parent = re.search(r"^down_revision[^=]*=\s*['\"](\w+)['\"]", text, re.M)
        if parent:
            parents.add(parent.group(1))
    assert revisions - parents == {database.migration_head()}


def test_postgres_connections_are_checked_before_use():
    # One the server or a proxy closed while idle failed the next request.
    options = database.engine_options("postgresql+asyncpg://resumate:pw@db:5432/resumate")
    assert options["pool_pre_ping"] is True and options["pool_recycle"] == 1800
    assert options["hide_parameters"] is True
    local = database.engine_options("sqlite+aiosqlite:///./resumate.db")
    assert "pool_pre_ping" not in local and local["hide_parameters"] is True


def test_production_refuses_sqlite_and_an_unmigrated_postgres(monkeypatch):
    # With DATABASE_URL unset, production kept its data in a SQLite file that
    # every deploy wipes; a Postgres with no migration history was built from
    # the models, hiding what a migration left out.
    from app.core.config import settings
    monkeypatch.setattr(settings, "debug", False)
    assert "DATABASE_URL" in database.production_refusal("sqlite")
    assert "migration history" in database.production_refusal("postgresql", has_history=False)
    assert database.production_refusal("postgresql") is None


def test_local_runs_start_on_either():
    # The tests run with DEBUG, as local development does.
    assert database.production_refusal("sqlite") is None
    assert database.production_refusal("postgresql", has_history=False) is None


def test_production_does_not_start_on_sqlite(monkeypatch):
    import asyncio
    from app.core.config import settings
    monkeypatch.setattr(settings, "debug", False)
    with pytest.raises(RuntimeError, match="Production needs Postgres"):
        asyncio.get_event_loop().run_until_complete(database.init_db())


def test_startup_stops_when_the_database_cannot_be_used(monkeypatch):
    import main

    async def unusable():
        raise RuntimeError("The database is at migration x, but the code needs y.")

    monkeypatch.setattr(main, "init_db", unusable)
    with pytest.raises(RuntimeError, match="the code needs y"):
        with TestClient(main.app):
            pass


def test_local_sqlite_lets_a_write_commit_while_a_read_is_under_way(client):
    # WAL mode. In SQLite's default one, a commit waits for every read under
    # way to end: the job runner's lanes, writing every few seconds, and the
    # requests reading, held one another up.
    import asyncio
    import sqlite3
    from sqlalchemy.engine import make_url

    async def mode():
        async with database.engine.connect() as conn:
            return (await conn.exec_driver_sql("PRAGMA journal_mode")).scalar()
    assert asyncio.get_event_loop().run_until_complete(mode()) == "wal"
    path = make_url(database.DATABASE_URL).database
    setup = sqlite3.connect(path)
    setup.execute("CREATE TABLE wal_check (n INTEGER)")
    setup.commit()
    reader, writer = sqlite3.connect(path, timeout=0.2), sqlite3.connect(path, timeout=0.2)
    try:
        reader.execute("BEGIN")
        assert reader.execute("SELECT count(*) FROM wal_check").fetchone() == (0,)
        writer.execute("INSERT INTO wal_check VALUES (1)")
        writer.commit()  # the default mode: "database is locked", after 0.2 s
        # The read goes on seeing what was there when it began.
        assert reader.execute("SELECT count(*) FROM wal_check").fetchone() == (0,)
    finally:
        reader.rollback()
        for conn in (reader, writer):
            conn.close()
        setup.execute("DROP TABLE wal_check")
        setup.commit()
        setup.close()
