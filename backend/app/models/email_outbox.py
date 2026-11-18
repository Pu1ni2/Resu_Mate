"""Emails to send: each one the server sends, kept until a background job has
sent it or given up, and for a while after, so a page can say how it went.

Eight places sent email, each its own way: some inside the request, some just
after the response, where a restart lost them, and none tried again when the
email service was busy.

A row holds no more than it must, for no longer than it must: the address
typed in only for a code, which goes to whoever asked, and a reviewed draft's
own words, each only until the email has gone. Every other address is the
account's or the interview's, read when the email goes, and a code or a link
is made then too, so none is ever stored here.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.core.database import Base

# What each email is: the codes to sign in or to confirm a deletion, a
# manager's password reset and the link that confirms their address, an
# interview's invitation (the standard one, or a draft the manager reviewed),
# and the manager's "interview finished".
KINDS = ("sign_in_code", "erasure_code", "password_reset", "verify_email",
         "interview_invitation", "invitation_draft", "interview_done")


class EmailOutbox(Base):
    __tablename__ = "email_outbox"

    id = Column(Integer, primary_key=True)
    kind = Column(String(32), nullable=False)
    # Whose it is: the manager it's sent on behalf of, or to. None for the
    # codes, which anyone may ask for.
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), index=True)
    interview_id = Column(Integer, index=True)
    # The address typed in, for a code only, until it has gone.
    to_address = Column(String(320))
    # A reviewed draft's own words, until it has gone.
    subject = Column(String(300))
    body = Column(Text)
    # Sent to a candidate on the manager's behalf: counted toward the
    # manager's day's limit from the moment it's queued.
    counts_to_quota = Column(Boolean, nullable=False, default=False)
    # held (waiting, for an interview's questions say), queued, sent, failed,
    # skipped (nothing to send after all: an address no one has invited) or
    # cancelled.
    status = Column(String(16), nullable=False, default="queued")
    # Why not, in words a page can show.
    error = Column(String(300))
    # One invitation, and one "interview finished", per interview while it's
    # queued or sent (invite:<interview id>, done:<interview id>). Cleared
    # once it fails or is cancelled, so another may be queued.
    dedupe_key = Column(String(64))
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime)

    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_email_outbox_dedupe_key"),
    )
