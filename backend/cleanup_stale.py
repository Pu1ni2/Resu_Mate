"""Data-retention cleanup — delete candidates/interviews untouched for N days.

Run manually or via cron. NOT auto-scheduled. Honours the same DATABASE_URL the
app uses. Dry-run by default; pass --apply to actually delete.

Usage:
    python cleanup_stale.py                 # dry run, 180-day default
    python cleanup_stale.py --days 90 --apply
"""
import argparse
import asyncio
from datetime import datetime, timedelta

from sqlalchemy import select, delete as sql_delete

from app.core.database import async_session
from app.models.candidate import Candidate, Interview, CandidateAccess


async def run(days: int, apply: bool) -> None:
    cutoff = datetime.utcnow() - timedelta(days=days)
    async with async_session() as db:
        # Candidates whose most-recent update predates the cutoff.
        stale = (await db.execute(
            select(Candidate).where(Candidate.updated_at < cutoff)
        )).scalars().all()

        print(f"Cutoff: {cutoff.isoformat()}  ({days} days)")
        print(f"Stale candidates: {len(stale)}")
        for c in stale:
            print(f"  - id={c.id} email={c.email} updated={c.updated_at}")

        if not apply:
            print("\nDry run — nothing deleted. Re-run with --apply to delete.")
            return

        emails = [c.email for c in stale if c.email]
        ids = [c.id for c in stale]
        if ids:
            if emails:
                await db.execute(sql_delete(Interview).where(Interview.candidate_email.in_(emails)))
                await db.execute(sql_delete(CandidateAccess).where(CandidateAccess.email.in_(emails)))
            await db.execute(sql_delete(Candidate).where(Candidate.id.in_(ids)))
            await db.commit()
        print(f"\nDeleted {len(ids)} candidate(s) and their interviews/access.")
        print("Note: in-memory store + ChromaDB are refreshed on next app restart.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete stale candidate data.")
    parser.add_argument("--days", type=int, default=180, help="Retention window in days (default 180)")
    parser.add_argument("--apply", action="store_true", help="Actually delete (default is dry run)")
    args = parser.parse_args()
    asyncio.run(run(args.days, args.apply))


if __name__ == "__main__":
    main()
