"""Batch invitations: several candidates invited at once, from the screening
results or the assistant, each one prepared by a background job.

The request that asks answers at once. These rows are what the page follows
while the jobs run, and what stays once they've ended: ended jobs are deleted
after a while (app/services/cleanup.py).
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint

from app.core.database import Base


class InviteBatch(Base):
    """One request to invite several candidates: who asked, from where
    (screening or jarvis), and the interviews' settings. client_key, one per
    Confirm on the page, makes asking again (a second click, a retry) the
    same batch, not a second set of interviews."""
    __tablename__ = "invite_batches"

    id = Column(Integer, primary_key=True)
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), nullable=False, index=True)
    source = Column(String(16), nullable=False)
    client_key = Column(String(64), nullable=False)
    role = Column(String(200), nullable=False)
    level = Column(String(50), nullable=False)
    num_questions = Column(Integer, nullable=False)
    focus_areas = Column(JSON, nullable=False, default=list)
    mode = Column(String(20), nullable=False)
    email_type = Column(String(32), nullable=False, default="interview")
    send_emails = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("manager_id", "client_key", name="uq_invite_batches_client_key"),
    )


class InviteBatchItem(Base):
    """One candidate of a batch, and how far their invitation got: queued,
    questions (the interview made, its questions being written), drafting
    (the email), done, skipped (with skip_reason) or failed (error, a short
    code, never an error's text). Each step is kept as it's done, so a job
    run again picks up where the last one stopped.

    email_status: None until an email is due, then sending (claimed before
    it's sent, so a job run again never sends it twice), sent, or refused
    or failed, with email_error saying why.
    """
    __tablename__ = "invite_batch_items"

    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("invite_batches.id"), nullable=False, index=True)
    candidate_id = Column(Integer, nullable=False, index=True)
    position = Column(Integer, nullable=False)
    status = Column(String(16), nullable=False, default="queued")
    skip_reason = Column(String(200))
    error = Column(String(200))
    interview_id = Column(Integer)
    # An open interview for the same role was used instead of a new one.
    reused = Column(Boolean, nullable=False, default=False)
    # The draft the AI wrote, for the manager to review and send.
    email_subject = Column(String(300))
    email_body = Column(Text)
    # Whether the AI wrote it (True) or the standard one stands in (False),
    # the AI unable to; None until there's a draft.
    email_drafted = Column(Boolean)
    email_status = Column(String(16))
    email_error = Column(String(300))
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime)

    __table_args__ = (
        UniqueConstraint("batch_id", "candidate_id", name="uq_invite_batch_items_candidate"),
    )
