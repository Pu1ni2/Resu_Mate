"""Data-retention cleanup — delete candidates untouched for N days.

The server does this itself, daily, once RETENTION_DAYS is set
(app/services/cleanup.py); this script shows whom it would delete, or deletes
them now. Untouched means the candidate's row hasn't changed in N days and no
interview of theirs was made, started or finished in them. Honours the same
DATABASE_URL the app uses. Dry-run by default; pass --apply to actually delete.

Usage:
    python cleanup_stale.py                 # dry run, 180-day default
    python cleanup_stale.py --days 90 --apply
"""
import argparse
import asyncio
from datetime import datetime, timedelta

from app.core.database import async_session
from app.services import cleanup


async def run(days: int, apply: bool) -> None:
    cutoff = datetime.utcnow() - timedelta(days=days)
    async with async_session() as db:
        stale = await cleanup.untouched_candidates(db, cutoff)

    print(f"Cutoff: {cutoff.isoformat()}  ({days} days)")
    print(f"Untouched candidates: {len(stale)}")
    for row in stale:
        print(f"  - id={row.id} updated={row.updated_at}")

    if not apply:
        print("\nDry run — nothing deleted. Re-run with --apply to delete.")
        return

    # By candidate, not by address. Deleting every interview and grant for a
    # stale row's email also took another manager's, for whom the same person
    # is a current candidate, and it missed interviews filed under the row at
    # another address, which the foreign key refuses.
    deleted = await cleanup.delete_untouched(cutoff)
    print(f"\nDeleted {deleted} candidate(s), with their interviews, access, evaluations and files.")
    print("Note: a running server keeps them in memory until it restarts.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete stale candidate data.")
    parser.add_argument("--days", type=int, default=180, help="Retention window in days (default 180)")
    parser.add_argument("--apply", action="store_true", help="Actually delete (default is dry run)")
    args = parser.parse_args()
    asyncio.run(run(args.days, args.apply))


if __name__ == "__main__":
    main()
