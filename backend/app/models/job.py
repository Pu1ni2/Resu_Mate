"""Background jobs: slow work, kept until it's done, whatever a page or the
server does meanwhile."""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String, UniqueConstraint

from app.core.database import Base


class Job(Base):
    """One piece of work for the job runner (app/services/jobs.py).

    payload holds ids, flags and short codes only, never a name, an address
    or a résumé, so nothing in this table is anyone's personal data.
    dedupe_key is set only while the job is queued or running: its unique
    rule then means one active job per key. last_error is a short code and
    the exception's class, never its text.
    """
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True)
    kind = Column(String(64), nullable=False)
    payload = Column(JSON, nullable=False, default=dict)
    # queued, running, done, failed or cancelled.
    status = Column(String(16), nullable=False, default="queued")
    # The lower, the sooner: 0 for sign-in codes and password resets.
    priority = Column(Integer, nullable=False, default=100)
    run_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=5)
    # Who is running it (host:pid:random), and until when: past that, the
    # job is anyone's to take up again.
    locked_by = Column(String(64))
    locked_until = Column(DateTime)
    heartbeat_at = Column(DateTime)
    cancel_requested = Column(Boolean, nullable=False, default=False)
    dedupe_key = Column(String(128))
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), index=True)
    last_error = Column(String(200))
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime)
    finished_at = Column(DateTime, index=True)

    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_jobs_dedupe_key"),
        Index("ix_jobs_status_run_at", "status", "run_at"),
        Index("ix_jobs_status_locked_until", "status", "locked_until"),
    )
