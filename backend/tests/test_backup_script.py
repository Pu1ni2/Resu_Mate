"""backend/scripts/backup_db.py: back up the free Postgres before it expires.

The pg_dump and pg_restore calls are faked here; the script was also run end to
end against Postgres 16 (back up, restore, restore again).
"""
import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "backup_db.py"
spec = importlib.util.spec_from_file_location("backup_db", SCRIPT)
backup_db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup_db)

URL = "postgresql+asyncpg://resumate:s3cret@db.example:5432/resumate"


@pytest.fixture()
def tools(monkeypatch):
    """pg_dump and pg_restore found, and every command they'd run recorded."""
    ran = []
    monkeypatch.setattr(backup_db.shutil, "which", lambda name, path=None: f"/pg/{name}")

    def run(cmd, check):
        ran.append(cmd)
        for arg in cmd:
            if arg.startswith("--file="):
                Path(arg[len("--file="):]).write_bytes(b"PGDMP")
    monkeypatch.setattr(backup_db.subprocess, "run", run)
    return ran


def test_the_url_is_one_pg_dump_takes():
    assert backup_db.pg_url(URL) == "postgresql://resumate:s3cret@db.example:5432/resumate"
    assert backup_db.pg_url("postgres://u@h/d") == "postgresql://u@h/d"


def test_only_postgres_is_backed_up():
    with pytest.raises(SystemExit, match="Not a Postgres URL"):
        backup_db.pg_url("sqlite+aiosqlite:///resumate.db")


def test_the_password_is_never_printed():
    assert backup_db.masked(backup_db.pg_url(URL)) == "postgresql://resumate:***@db.example:5432/resumate"


def test_a_backup_writes_a_custom_format_dump(tools, tmp_path, capsys):
    out = tmp_path / "backups" / "b.dump"
    assert backup_db.main(["--url", URL, "backup", "--out", str(out)]) == 0
    assert tools == [["/pg/pg_dump", "--format=custom", "--no-owner", "--no-privileges",
                      f"--file={out}", "--dbname=postgresql://resumate:s3cret@db.example:5432/resumate"]]
    assert out.is_file()
    assert "s3cret" not in capsys.readouterr().out


def test_a_restore_asks_first(tools, tmp_path, monkeypatch):
    dump = tmp_path / "b.dump"
    dump.write_bytes(b"PGDMP")
    monkeypatch.setattr("builtins.input", lambda prompt: "no")
    assert backup_db.main(["--url", URL, "restore", str(dump)]) == 1
    assert tools == []


def test_a_confirmed_restore_replaces_the_contents(tools, tmp_path):
    dump = tmp_path / "b.dump"
    dump.write_bytes(b"PGDMP")
    assert backup_db.main(["--url", URL, "restore", str(dump), "--yes"]) == 0
    assert tools == [["/pg/pg_restore", "--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error",
                      "--dbname=postgresql://resumate:s3cret@db.example:5432/resumate", str(dump)]]


def test_a_missing_backup_is_refused(tools, tmp_path):
    with pytest.raises(SystemExit, match="No such backup"):
        backup_db.main(["--url", URL, "restore", str(tmp_path / "gone.dump"), "--yes"])
