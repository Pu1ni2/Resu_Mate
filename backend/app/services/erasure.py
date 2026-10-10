"""Erasing everything held about one person, by their email address.

Used by a signed-in candidate's "delete my data", and by the public deletion
request, which serves people who were never invited: someone a sourcing run
found, or whose résumé a manager uploaded.
"""
import logging

from sqlalchemy import delete as sql_delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import db_service

logger = logging.getLogger("resumate.erasure")


async def erase_person(db: AsyncSession, email: str, actor: str = "candidate") -> int:
    """Delete all data held about `email`; returns how many résumés went.

    Interviews, portal grants, their own résumés (database, in-memory store,
    ChromaDB and object storage), the career advisor's session, sign-in codes,
    and anything a sourcing run kept about them. An audit record is written.
    """
    from app.models.auth import OTPCode
    from app.models.candidate import Candidate, CandidateAccess, Interview
    from app.models.sourcing import SourcedProfile
    from app.models.state import AdvisorSession
    from app.services.resume_rag import resume_rag

    email = (email or "").strip().lower()

    # Their own résumés: those whose own address is theirs, in any case,
    # wherever it came from (the email column, the PDF's mailto: link or the
    # text). Matching the email column exactly missed the rest. A résumé an
    # invitation merely points at is someone's profile the manager linked to
    # this address, so it is unlinked (the grant goes below), not deleted. Read
    # before the grants are deleted, since the grants point at some of them.
    in_memory = resume_rag.candidates_with_email(email)
    cand_rows = await db_service.resumes_of(db, email, ids=[c["id"] for c in in_memory])

    # Database first: if it fails, nothing is half-erased. Memory went first, so
    # a failed commit left the résumé in the database, and the startup warm-up
    # put it back in the portal after the next restart.
    await db.execute(sql_delete(Interview).where(Interview.candidate_email == email))
    await db.execute(sql_delete(CandidateAccess).where(CandidateAccess.email == email))
    # Their résumé rows with any interview still attached under another address.
    await db_service.delete_candidates(db, Candidate.id.in_([row.id for row in cand_rows]))
    await db.execute(sql_delete(AdvisorSession).where(AdvisorSession.email == email))
    await db.execute(sql_delete(OTPCode).where(OTPCode.email == email))
    # In any case: a sourcing run keeps the address as it found it.
    await db.execute(sql_delete(SourcedProfile).where(func.lower(SourcedProfile.email) == email))
    await db.commit()

    # Then the in-memory store + ChromaDB + object storage, scoped to the row's
    # owning manager so we hit the right drawer.
    for row in cand_rows:
        try:
            resume_rag.delete_candidate(row.id, manager_id=row.manager_id)
        except Exception as exc:
            logger.warning("in-memory delete failed for candidate %s: %s", row.id, exc)
        # Object storage (no-op if S3 unconfigured).
        try:
            from app.services.storage_service import storage_service
            if getattr(row, "file_object_key", None):
                storage_service.delete(row.file_object_key)
        except Exception as exc:
            logger.warning("object-store delete failed: %s", exc)
    # And any in-memory copy kept under an id the database doesn't share.
    for cand in in_memory:
        try:
            resume_rag.delete_candidate(cand["id"], manager_id=cand.get("manager_id"))
        except Exception as exc:
            logger.warning("in-memory delete failed for candidate %s: %s", cand["id"], exc)

    try:
        from app.api.advisor_agent import _session_cache
        _session_cache.pop(email, None)
    except Exception as exc:
        logger.warning("advisor cache clear failed: %s", exc)

    await db_service.log_event(
        db, action="candidate.delete", actor=actor, target_email=email,
        detail=f"{actor}-initiated erasure of {len(cand_rows)} record(s)",
    )
    return len(cand_rows)


async def holds_data(db: AsyncSession, email: str) -> bool:
    """Is anything held about this address: a résumé, an interview, a grant,
    an advisor session, or a sourced profile?"""
    from sqlalchemy import select
    from app.models.candidate import CandidateAccess, Interview
    from app.models.sourcing import SourcedProfile
    from app.models.state import AdvisorSession
    from app.services.resume_rag import resume_rag

    email = (email or "").strip().lower()
    if not email:
        return False
    if resume_rag.candidates_with_email(email) or await db_service.resumes_of(db, email):
        return True
    for query in (
        select(Interview.id).where(Interview.candidate_email == email),
        select(CandidateAccess.id).where(CandidateAccess.email == email),
        select(AdvisorSession.id).where(AdvisorSession.email == email),
        select(SourcedProfile.id).where(func.lower(SourcedProfile.email) == email),
    ):
        if (await db.execute(query.limit(1))).first():
            return True
    return False
