"""A local SQLite file made before a new column gets the column at startup.

create_all makes missing tables, not missing columns, so a file made before
hiring_managers.hide_names broke every query on that table, signing in
included, as soon as the server ran the new code.
"""
import asyncio
import sqlite3

from sqlalchemy import Column, Integer, MetaData, String, Table, create_engine
from sqlalchemy.ext.asyncio import create_async_engine

import app.models.auth  # noqa: F401  (puts hiring_managers in the models)
from app.core import database


def _rows(path, sql):
    db = sqlite3.connect(path)
    try:
        return db.execute(sql).fetchall()
    finally:
        db.close()


def _run(path, *statements):
    db = sqlite3.connect(path)
    try:
        for sql in statements:
            db.execute(sql)
        db.commit()
    finally:
        db.close()


def test_starting_up_adds_the_new_column_to_an_older_file(tmp_path, monkeypatch, capsys):
    path = tmp_path / "older.db"
    # The tables as the models make them, less the new column, with a manager.
    sync = create_engine(f"sqlite:///{path.as_posix()}")
    database.Base.metadata.create_all(sync)
    sync.dispose()
    _run(path,
         "ALTER TABLE hiring_managers DROP COLUMN hide_names",
         "INSERT INTO hiring_managers (name, email, password_hash) VALUES ('Dana', 'dana@example.com', 'x')")

    engine = create_async_engine(f"sqlite+aiosqlite:///{path.as_posix()}")
    monkeypatch.setattr(database, "engine", engine)

    async def start_twice():
        try:
            await database.init_db()
            await database.init_db()
        finally:
            await engine.dispose()

    asyncio.get_event_loop().run_until_complete(start_twice())

    said = [line for line in capsys.readouterr().out.splitlines() if line.startswith("Database tables")]
    assert said == ["Database tables created; columns added: hiring_managers.hide_names",
                    "Database tables created"]
    # The manager who was there has names shown, as before.
    assert _rows(path, "SELECT name, hide_names FROM hiring_managers") == [("Dana", 0)]


def test_a_column_sqlite_cannot_add_is_left_with_a_warning(tmp_path, monkeypatch, capsys):
    path = tmp_path / "things.db"
    _run(path, "CREATE TABLE things (id INTEGER PRIMARY KEY)", "INSERT INTO things (id) VALUES (1)")

    class Models:
        metadata = MetaData()

    Table("things", Models.metadata,
          Column("id", Integer, primary_key=True),
          # NOT NULL with no default: there's nothing to give the row.
          Column("required", String(20), nullable=False),
          Column("optional", String(20)))
    monkeypatch.setattr(database, "Base", Models)

    sync = create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with sync.begin() as conn:
            added = database.add_missing_columns(conn)
    finally:
        sync.dispose()

    assert added == ["things.optional"]
    assert "[WARN] things.required could not be added" in capsys.readouterr().out
    # The one that could be added is kept.
    assert [row[1] for row in _rows(path, "PRAGMA table_info(things)")] == ["id", "optional"]
