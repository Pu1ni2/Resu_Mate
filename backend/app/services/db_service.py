"""Database CRUD operations for candidates, interviews, and access control."""
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.candidate import Candidate, Interview, CandidateAccess, AuditLog


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


async def save_interview_result(session: AsyncSession, email: str, report_data: dict) -> Optional[Interview]:
    """Save interview result and mark as completed."""
    import json
    email = email.strip().lower()
    interview = await get_interview_by_email(session, email)
    if not interview:
        # Create a minimal record if one doesn't exist
        interview = Interview(
            candidate_id=0,
            candidate_email=email,
            status="completed",
            report=json.dumps(report_data),
            completed_at=datetime.utcnow(),
            transcript=report_data.get("transcript"),
        )
        session.add(interview)
    else:
        interview.status = "completed"
        interview.report = json.dumps(report_data)
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
    # Check if this manager already granted access to this email.
    existing = await get_candidate_access(session, email, manager_id=manager_id)
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

    Candidate portal calls this email-only (returns any manager's grant — the
    candidate authenticates by email/OTP, not by manager). Manager-facing calls
    pass manager_id to scope to their own grants.
    """
    stmt = select(CandidateAccess).where(CandidateAccess.email == email.strip().lower())
    if manager_id is not None:
        stmt = stmt.where(CandidateAccess.manager_id == manager_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()
