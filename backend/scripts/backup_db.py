"""Back up the Postgres database to a file, or restore one into a database.

Render's free Postgres is deleted 30 days after it is created. Back it up about
every three weeks; when it expires, create a new one, restore the latest backup
into it, and point DATABASE_URL at it (see backend/DEPLOY.md).

    python backend/scripts/backup_db.py backup                 # backups/resumate-YYYY-MM-DD.dump
    python backend/scripts/backup_db.py backup --out my.dump
    python backend/scripts/backup_db.py restore backups/resumate-2026-10-09.dump

The database is DATABASE_URL, or --url. From your own machine use Render's
"External Database URL". Needs pg_dump and pg_restore from PostgreSQL 16 on the
PATH, or --pg-bin pointing at their folder.

A backup holds candidates' personal data: keep it private. Never commit one,
and never make it a CI artifact (the repository is public).
"""
import argparse
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


def pg_url(url: str) -> str:
    """The URL as pg_dump and pg_restore take it: the app's may name a driver
    (postgresql+asyncpg://), which libpq doesn't know."""
    parts = urlsplit((url or "").strip())
    scheme = parts.scheme.split("+", 1)[0]
    if scheme not in ("postgres", "postgresql"):
        raise SystemExit(f"Not a Postgres URL ({scheme or 'empty'}): this backs up the production database only.")
    return urlunsplit(("postgresql",) + tuple(parts)[1:])


def masked(url: str) -> str:
    """The URL with its password hidden, for printing."""
    parts = urlsplit(url)
    if parts.password:
        netloc = parts.netloc.replace(f":{parts.password}@", ":***@", 1)
        parts = parts._replace(netloc=netloc)
    return urlunsplit(parts)


def tool(name: str, pg_bin: str = "") -> str:
    path = shutil.which(name, path=pg_bin or None) if pg_bin else shutil.which(name)
    if not path:
        raise SystemExit(f"{name} not found. Install the PostgreSQL 16 client tools, or pass --pg-bin.")
    return path


def backup_command(url: str, out: Path, pg_bin: str = "") -> list:
    # Custom format: compressed, and pg_restore can rebuild it in one go.
    return [tool("pg_dump", pg_bin), "--format=custom", "--no-owner", "--no-privileges",
            f"--file={out}", f"--dbname={pg_url(url)}"]


def restore_command(url: str, dump: Path, pg_bin: str = "") -> list:
    # --clean --if-exists: restoring twice, or over a half-made database, works.
    return [tool("pg_restore", pg_bin), "--clean", "--if-exists", "--no-owner", "--no-privileges",
            "--exit-on-error", f"--dbname={pg_url(url)}", str(dump)]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Back up or restore the ResuMate Postgres database.")
    parser.add_argument("--url", default=os.environ.get("DATABASE_URL", ""), help="defaults to DATABASE_URL")
    parser.add_argument("--pg-bin", default=os.environ.get("PG_BIN", ""), help="folder holding pg_dump/pg_restore")
    sub = parser.add_subparsers(dest="action", required=True)
    b = sub.add_parser("backup", help="write the database to a file")
    b.add_argument("--out", type=Path, default=Path("backups") / f"resumate-{date.today().isoformat()}.dump")
    r = sub.add_parser("restore", help="load a backup into the database (replaces what is there)")
    r.add_argument("dump", type=Path)
    r.add_argument("--yes", action="store_true", help="don't ask before replacing the database's contents")
    args = parser.parse_args(argv)

    url = pg_url(args.url)
    if args.action == "backup":
        args.out.parent.mkdir(parents=True, exist_ok=True)
        print(f"Backing up {masked(url)} to {args.out} ...")
        subprocess.run(backup_command(url, args.out, args.pg_bin), check=True)
        print(f"Done: {args.out} ({args.out.stat().st_size:,} bytes). Keep it private.")
        return 0

    if not args.dump.is_file():
        raise SystemExit(f"No such backup: {args.dump}")
    if not args.yes:
        answer = input(f"This replaces everything in {masked(url)} with {args.dump}. Type 'restore' to go on: ")
        if answer.strip() != "restore":
            print("Nothing restored.")
            return 1
    print(f"Restoring {args.dump} into {masked(url)} ...")
    subprocess.run(restore_command(url, args.dump, args.pg_bin), check=True)
    print("Done. Point the backend's DATABASE_URL at this database if it is a new one, and redeploy.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
