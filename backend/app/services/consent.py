"""A candidate's say-so before an interview starts.

Both interview rooms first tell the candidate what happens: what they say is
transcribed and saved; an AI interviewer asks the questions and AI scores the
answers, which the hiring team sees; and in a video interview the camera checks
they stay in view. Nothing starts until they confirm.
"""
from datetime import datetime

from fastapi import HTTPException

CONSENT_NEEDED = "Please confirm you understand how the interview works before it starts."


def require_consent(interview, consent: bool) -> None:
    """Refuse to start without the candidate's consent, and note when they gave it.

    The caller commits, as it does the interview's other changes.
    """
    if not consent:
        raise HTTPException(status_code=400, detail=CONSENT_NEEDED)
    if interview.consented_at is None:
        interview.consented_at = datetime.utcnow()
