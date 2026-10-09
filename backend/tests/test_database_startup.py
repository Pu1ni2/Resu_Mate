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


def test_startup_stops_when_the_database_cannot_be_used(monkeypatch):
    import main

    async def unusable():
        raise RuntimeError("The database is at migration x, but the code needs y.")

    monkeypatch.setattr(main, "init_db", unusable)
    with pytest.raises(RuntimeError, match="the code needs y"):
        with TestClient(main.app):
            pass
