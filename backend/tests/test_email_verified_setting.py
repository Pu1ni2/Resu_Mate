"""Whether a manager has confirmed their email address, kept on the account.

Anyone could sign up with any address and email candidates from ResuMate.
New accounts start unconfirmed; the accounts from before count as confirmed.
"""
import sqlite3

from sqlalchemy import create_engine

from app.core import database
from conftest import auth_headers, register


def test_a_new_account_starts_unconfirmed(client):
    token, user = register(client, "new@x.com", verified=False)
    assert user["email_verified"] is False
    assert client.get("/api/auth/me", headers=auth_headers(token)).json()["email_verified"] is False


def test_the_accounts_from_before_count_as_confirmed(tmp_path):
    path = tmp_path / "older.db"
    sync = create_engine(f"sqlite:///{path.as_posix()}")
    database.Base.metadata.create_all(sync)
    db = sqlite3.connect(path)
    try:
        db.execute("ALTER TABLE hiring_managers DROP COLUMN email_verified")
        db.execute("INSERT INTO hiring_managers (name, email, password_hash) VALUES ('Dana', 'dana@example.com', 'x')")
        db.commit()
    finally:
        db.close()
    try:
        with sync.begin() as conn:
            assert database.add_missing_columns(conn) == ["hiring_managers.email_verified"]
    finally:
        sync.dispose()
    db = sqlite3.connect(path)
    try:
        assert db.execute("SELECT email_verified FROM hiring_managers").fetchall() == [(1,)]
    finally:
        db.close()
