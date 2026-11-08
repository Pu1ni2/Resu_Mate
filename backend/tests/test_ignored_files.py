"""Files that hold secrets or people's data can't be committed by mistake.

Only `.env` was ignored, not its variants (.env.local, .env.production);
nor SQLite files named .sqlite or .sqlite3, a second virtual environment,
logs or private keys. git itself is asked.
"""
import os
import shutil
import subprocess

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytestmark = pytest.mark.skipif(
    shutil.which("git") is None or not os.path.exists(os.path.join(ROOT, ".git")),
    reason="needs the repository and git",
)


def _ignored(path):
    return subprocess.run(["git", "check-ignore", "-q", path], cwd=ROOT).returncode == 0


@pytest.mark.parametrize("path", [
    ".env", ".env.local", "backend/.env.production", "frontend/.env.development.local",
    "backend/resumate.db", "local.sqlite", "backend/resumate.sqlite3",
    ".venv/lib/x.py", "backend/server.log", "backend/.coverage", "backend/htmlcov/index.html",
    "deploy/key.pem", "backend/backups/2026-11-08.dump", "backend/uploads/cv.pdf",
])
def test_secrets_and_peoples_data_are_ignored(path):
    assert _ignored(path), path


@pytest.mark.parametrize("path", ["backend/.env.example", "backend/uploads/.gitkeep", "backend/main.py"])
def test_what_belongs_in_the_repository_is_not(path):
    assert not _ignored(path), path
