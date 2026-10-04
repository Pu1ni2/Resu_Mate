"""Database CRUD operations for candidates, interviews, and access control."""
import json
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.candidate import Candidate, Interview, Evaluation, CandidateAccess, AuditLog


# ═══════ AUDIT LOG ═══════

async def log_event(
    session: AsyncSession,
    action: str,
    actor: str = "system",
    manager_id: int = None,
    target_email: str = None,
    detail: str = None,
) -> None:
    """Append an audit record. Best-effort — never raise into the caller."""
    try:
        session.add(AuditLog(
            action=action,
            actor=actor,
            manager_id=manager_id,
            target_email=(target_email or None),
            detail=detail[:500] if detail else None,
        ))
        await session.commit()
    except Exception as e:
        await session.rollback()
        print(f"[WARN] audit log_event failed: {e}")


# ═══════ CANDIDATE ═══════

async def create_candidate_db(session: AsyncSession, data: dict, manager_id: int = None) -> Optional[Candidate]:
    """Persist a candidate to the database (alongside in-memory/ChromaDB storage)."""
    try:
        candidate = Candidate(
            manager_id=manager_id if manager_id is not None else data.get("manager_id"),
            name=data.get("name", ""),
            email=data.get("email") or (data.get("embedded_links", {}) or {}).get("email"),
            file_name=data.get("file_name", ""),
            file_hash=data.get("file_hash"),
            is_resume=data.get("is_resume", True),
            raw_text=(data.get("raw_text") or "")[:5000],
            full_text=(data.get("text") or data.get("raw_text") or "")[:10000],
            predicted_role=data.get("predicted_role"),
            experience_level=data.get("experience_level"),
            total_experience_years=data.get("total_experience_years", 0),
            location=data.get("location"),
            summary=data.get("summary"),
            skills=data.get("skills", []),
            work_experience=data.get("work_experience", []),
            education=data.get("education", []),
            key_strengths=data.get("key_strengths", []),
            badges=data.get("badges", []),
            embedded_links=data.get("embedded_links", {}),
            enriched_data=data.get("enriched_data", {}),
        )
        session.add(candidate)
        await session.commit()
        await session.refresh(candidate)
        return candidate
    except Exception as e:
        await session.rollback()
        print(f"[WARN] DB create_candidate error: {e}")
        return None


async def delete_candidates(session: AsyncSession, *where) -> None:
    """Delete the candidates matching `where`, their interviews and evaluations first.

    Neither foreign key to candidates has ON DELETE CASCADE, and the ORM cascade
    on Candidate.interviews covers only deletes made through the session, not a
    bulk DELETE. So Postgres refused to delete anyone who had been invited to an
    interview, while SQLite, which enforces foreign keys only when asked to, let
    it through and left the interviews pointing at nobody.

    Does not commit: the caller commits along with the rest of its work.
    """
    ids = select(Candidate.id).where(*where)
    await session.execute(delete(Interview).where(Interview.candidate_id.in_(ids)))
    await session.execute(delete(Evaluation).where(Evaluation.candidate_id.in_(ids)))
    await session.execute(delete(Candidate).where(*where))


# ═══════ INTERVIEW ═══════

async def create_interview(session: AsyncSession, data: dict) -> Optional[Interview]:
    """Create an interview record."""
    try:
        interview = Interview(
            candidate_id=data.get("candidate_id", 0),
            manager_id=data.get("manager_id"),
            candidate_email=data["candidate_email"].strip().lower(),
            role=data.get("role", "General"),
            level=data.get("level", "Mid-Level"),
            experience_required=data.get("experience_required"),
            num_questions=data.get("num_questions", 8),
            focus_areas=data.get("focus_areas", []),
            status="pending",
            mode=data.get("mode", "avatar"),
        )
        session.add(interview)
        await session.commit()
        await session.refresh(interview)
        return interview
    except Exception as e:
        await session.rollback()
        print(f"[WARN] DB create_interview error: {e}")
        return None


async def get_interview_by_email(session: AsyncSession, email: str, manager_id: int = None) -> Optional[Interview]:
    """Get the most recent interview for a candidate email.

    When manager_id is provided (manager-facing calls), the result is scoped to
    that manager so one tenant can't read another's interview. The candidate
    portal calls this without manager_id (the candidate doesn't know it).
    """
    stmt = select(Interview).where(Interview.candidate_email == email.strip().lower())
    if manager_id is not None:
        stmt = stmt.where(Interview.manager_id == manager_id)
    stmt = stmt.order_by(Interview.created_at.desc()).limit(1)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def update_interview_status(
    session: AsyncSession, email: str, status: str,
    report: str = None, scores: list = None, duration: int = None
) -> Optional[Interview]:
    """Update interview status (e.g., mark as completed with report)."""
    interview = await get_interview_by_email(session, email)
    if not interview:
        return None
    try:
        interview.status = status
        if report is not None:
            interview.report = report if isinstance(report, str) else str(report)
        if scores is not None:
            interview.scores = scores
        if duration is not None:
            interview.duration = duration
        if status == "completed":
            interview.completed_at = datetime.utcnow()
        await session.commit()
        await session.refresh(interview)
        return interview
    except Exception as e:
        await session.rollback()
        print(f"[WARN] DB update_interview error: {e}")
        return None


def report_dict(raw) -> dict:
    """An interview's stored report as a dict, however it was written.

    The column holds either JSON (the scoring path) or plain markdown (the agent's
    and the Realtime room's quick report). Readers already treat markdown as
    {"report": text}; this is that rule in one place.
    """
    if not raw:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return {"report": raw}
    return parsed if isinstance(parsed, dict) else {"report": raw}


def merge_interview_report(interview: Interview, updates: dict) -> dict:
    """Add `updates` to an interview's stored report, keeping everything else.

    Three writers touch one column: the candidate's browser (proctoring
    numbers), the interview worker (its report) and the manager's scoring
    path. Each used to replace the whole value, so whichever wrote last wiped
    what the others had saved.
    """
    merged = report_dict(interview.report)
    merged.update(updates)
    interview.report = json.dumps(merged)
    return merged


async def save_interview_result(session: AsyncSession, email: str, report_data: dict,
                                manager_id: int = None) -> Optional[Interview]:
    """Save a scored interview result and mark the interview completed.

    Scoped to `manager_id` when given, so one tenant can't write another's
    interview for the same address. Returns None when there is no such
    interview; it used to invent one with candidate_id=0, an orphan row that
    breaks the foreign key on Postgres. The report is merged, so proctoring
    numbers saved earlier survive.
    """
    email = email.strip().lower()
    interview = await get_interview_by_email(session, email, manager_id=manager_id)
    if not interview:
        return None
    merge_interview_report(interview, report_data)
    interview.status = "completed"
    interview.completed_at = datetime.utcnow()
    if report_data.get("scores"):
        interview.scores = report_data["scores"]
    if report_data.get("timer"):
        interview.duration = report_data["timer"]
    if report_data.get("transcript") is not None:
        interview.transcript = report_data["transcript"]

    try:
        await session.commit()
        await session.refresh(interview)
        return interview
    except Exception as e:
        await session.rollback()
        print(f"[WARN] DB save_interview_result error: {e}")
        return None


# What the candidate's own browser may record about their interview: the
# proctoring it measured, nothing that judges them.
PROCTORING_FIELDS = {
    "violations": int, "eyeContact": float, "timer": int, "lookAwayCount": int, "terminated": bool,
}
TERMINATED_REPORT = (
    "## Interview Terminated\n\n"
    "Automatically terminated after exceeding the proctoring violation limit."
)


def _proctoring_numbers(data: dict) -> dict:
    out = {}
    for key, kind in PROCTORING_FIELDS.items():
        if key not in data or data[key] is None:
            continue
        value = data[key]
        try:
            if kind is bool:
                if not isinstance(value, bool):
                    continue
                out[key] = value
            else:
                out[key] = kind(value) if kind is float else int(value)
        except (TypeError, ValueError):
            continue
    return out


async def save_proctoring(session: AsyncSession, email: str, data: dict) -> Optional[Interview]:
    """Record the candidate browser's proctoring numbers on their latest interview.

    Only PROCTORING_FIELDS are taken, and only the first time: the candidate's
    own session must not be able to set its report or scores (it used to post a
    whole report, including a placeholder that could overwrite the real one) or
    lower its violation count later. A terminated interview is completed with a
    server-written note if no report exists yet; otherwise the status is left to
    the interviewer.
    """
    interview = await get_interview_by_email(session, email)
    if not interview:
        return None
    numbers = _proctoring_numbers(data or {})
    if not numbers or "violations" in report_dict(interview.report):
        return interview
    merged = merge_interview_report(interview, numbers)
    if numbers.get("terminated") and interview.status != "completed":
        if not merged.get("report"):
            merge_interview_report(interview, {"report": TERMINATED_REPORT})
        interview.status = "completed"
        interview.completed_at = datetime.utcnow()
    try:
        await session.commit()
        await session.refresh(interview)
        return interview
    except Exception as e:
        await session.rollback()
        print(f"[WARN] DB save_proctoring error: {e}")
        return None


async def get_all_completed_interviews(session: AsyncSession, manager_id: int = None) -> list:
    """Get completed interviews for a hiring manager's dashboard, scoped to them."""
    # selectinload the candidate so the name is available without an N+1 --
    # this list previously showed raw email addresses because the relationship
    # was never loaded.
    stmt = select(Interview).options(selectinload(Interview.candidate)).where(
        Interview.status == "completed"
    )
    if manager_id is not None:
        stmt = stmt.where(Interview.manager_id == manager_id)
    stmt = stmt.order_by(Interview.completed_at.desc())
    result = await session.execute(stmt)
    interviews = result.scalars().all()
    out = []
    for iv in interviews:
        import json
        report = iv.report
        if report and isinstance(report, str):
            try:
                report = json.loads(report)
            except:
                pass
        out.append({
            "email": iv.candidate_email,
            # candidate_id is needed by the manager-side report view to run
            # credibility analysis; without it that section stays hidden.
            "candidate_id": iv.candidate_id,
            "candidate_name": (iv.candidate.name if iv.candidate and iv.candidate.name
                               else iv.candidate_email),
            "timestamp": iv.completed_at.isoformat() if iv.completed_at else None,
            "report": report,
            "role": iv.role,
            "scores": iv.scores or [],
        })
    return out


# ═══════ ACCESS CONTROL ═══════

async def create_candidate_access(session: AsyncSession, email: str, name: str, candidate_id: int = None, manager_id: int = None) -> Optional[CandidateAccess]:
    """Grant portal access to a candidate email, owned by a manager."""
    email = email.strip().lower()
    # Check if THIS manager already granted access to this email. With no
    # manager the check must be "no manager" too: get_candidate_access treats
    # None as "any manager", which returned another tenant's grant as "existing".
    owner = (CandidateAccess.manager_id == manager_id) if manager_id is not None else CandidateAccess.manager_id.is_(None)
    existing = (await session.execute(
        select(CandidateAccess).where(CandidateAccess.email == email, owner)
    )).scalars().first()
    if existing:
        return existing
    try:
        access = CandidateAccess(
            email=email,
            name=name,
            candidate_id=candidate_id,
            manager_id=manager_id,
        )
        session.add(access)
        await session.commit()
        await session.refresh(access)
        return access
    except Exception as e:
        await session.rollback()
        print(f"[WARN] DB create_access error: {e}")
        return None


async def get_candidate_access(session: AsyncSession, email: str, manager_id: int = None) -> Optional[CandidateAccess]:
    """Check if a candidate email has portal access.

    Candidate portal calls this email-only (the candidate authenticates by
    email/OTP, not by manager), and gets the newest grant. Manager-facing calls
    pass manager_id to scope to their own grants.

    Grants are unique per (email, manager), so one person invited by two
    companies has two rows. This used scalar_one_or_none(), which raised
    MultipleResultsFound for them and turned verify-email and the candidate
    portal into 500s.
    """
    stmt = select(CandidateAccess).where(CandidateAccess.email == email.strip().lower())
    if manager_id is not None:
        stmt = stmt.where(CandidateAccess.manager_id == manager_id)
    stmt = stmt.order_by(CandidateAccess.granted_at.desc(), CandidateAccess.id.desc())
    result = await session.execute(stmt)
    return result.scalars().first()


def _is_this_candidate(row: Candidate, email: str, access: CandidateAccess) -> bool:
    """Is this Candidate row really the person holding this grant?

    Their resume's own address is the email they signed in with, or, when the
    manager invited them at a different address, the grant was made out to the
    row's name. Anything else is a different person reached by a wrong id.
    """
    from app.services.resume_rag import primary_email  # lazy: resume_rag starts Chroma on import
    own = primary_email({
        "email": row.email, "embedded_links": row.embedded_links or {},
        "text": row.full_text or row.raw_text or "",
    })
    if own and own == email:
        return True
    return bool(access.name and row.name and access.name.strip().lower() == row.name.strip().lower())


async def candidate_view(session: AsyncSession, email: str):
    """What the candidate portal shows one person: (access, interview, candidate).

    A person can be invited by several managers. Everything shown must come from
    one of them: the newest interview, the grant of THAT interview's manager
    (else the newest grant), and the profile only if it is the same manager's
    Candidate row and really this person (_is_this_candidate). The profile used
    to be loaded by bare id with no owner check, so a wrong or stale
    candidate_id showed someone else's profile.
    """
    email = (email or "").strip().lower()
    interview = await get_interview_by_email(session, email)
    access = None
    if interview is not None and interview.manager_id is not None:
        access = await get_candidate_access(session, email, manager_id=interview.manager_id)
    if access is None:
        access = await get_candidate_access(session, email)

    candidate = None
    if access is not None and access.candidate_id:
        owner = (Candidate.manager_id == access.manager_id) if access.manager_id is not None else Candidate.manager_id.is_(None)
        row = (await session.execute(
            select(Candidate).where(Candidate.id == access.candidate_id, owner)
        )).scalar_one_or_none()
        if row is not None and _is_this_candidate(row, email, access):
            candidate = row
    return access, interview, candidate
