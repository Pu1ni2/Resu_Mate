"""Database models"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    # Indexed: queried for owner-lookup, candidate-portal sign-in, and
    # candidate-access linking. file_hash is queried on every upload to detect
    # duplicate resumes — without an index this is O(n) per upload.
    email = Column(String(200), nullable=True, index=True)
    file_name = Column(String(500))
    file_hash = Column(String(64), nullable=True, index=True)
    is_resume = Column(Boolean, default=True)
    raw_text = Column(Text)
    full_text = Column(Text)
    predicted_role = Column(String(200))
    experience_level = Column(String(50))
    total_experience_years = Column(Float, default=0)
    location = Column(String(200))
    summary = Column(Text)
    skills = Column(JSON, default=list)
    work_experience = Column(JSON, default=list)
    education = Column(JSON, default=list)
    key_strengths = Column(JSON, default=list)
    badges = Column(JSON, default=list)
    embedded_links = Column(JSON, default=dict)
    enriched_data = Column(JSON, default=dict)  # GitHub, LinkedIn, portfolio data from agents
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    interviews = relationship("Interview", back_populates="candidate", cascade="all, delete-orphan")
    evaluations = relationship("Evaluation", back_populates="candidate", cascade="all, delete-orphan")

    def to_dict(self):
        """Convert to dict for API responses (matches current frontend expectations)"""
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "file_name": self.file_name,
            "file_hash": self.file_hash,
            "is_resume": self.is_resume,
            "raw_text": (self.raw_text or "")[:1500],
            "text": (self.full_text or "")[:5000],
            "predicted_role": self.predicted_role,
            "experience_level": self.experience_level,
            "total_experience_years": self.total_experience_years,
            "location": self.location,
            "summary": self.summary,
            "skills": self.skills or [],
            "work_experience": self.work_experience or [],
            "education": self.education or [],
            "key_strengths": self.key_strengths or [],
            "badges": self.badges or [],
            "embedded_links": self.embedded_links or {},
            "enriched_data": self.enriched_data or {},
        }


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    # Owning hiring manager — scopes interview reads to one tenant. Nullable so
    # legacy rows created before multi-tenancy don't break; scoped queries treat
    # NULL as "owned by nobody" and therefore invisible (safe default).
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), nullable=True, index=True)
    candidate_email = Column(String(200), nullable=False, index=True)
    role = Column(String(200))
    level = Column(String(50))
    experience_required = Column(String(50))
    num_questions = Column(Integer, default=8)
    focus_areas = Column(JSON, default=list)
    questions = Column(JSON, default=list)
    answers = Column(JSON, default=list)
    scores = Column(JSON, default=list)
    report = Column(Text)
    status = Column(String(20), default="pending")  # pending, in_progress, completed
    # Interview format: "avatar" (existing LiveKit + Simli flow with the
    # camera + lip-synced face) or "conversational" (audio-only OpenAI Realtime
    # over WebRTC, no LiveKit). Defaults to avatar to preserve existing rows.
    mode = Column(String(20), default="avatar", nullable=False)
    duration = Column(Integer, default=0)
    room_name = Column(String(200), nullable=True, index=True)
    room_config = Column(JSON, nullable=True)
    transcript = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    candidate = relationship("Candidate", back_populates="interviews")

    def to_dict(self):
        return {
            "id": self.id,
            "candidate_id": self.candidate_id,
            "manager_id": self.manager_id,
            "candidate_email": self.candidate_email,
            "candidate_name": self.candidate.name if self.candidate else "",
            "role": self.role,
            "level": self.level,
            "experience_required": self.experience_required,
            "num_questions": self.num_questions,
            "focus_areas": self.focus_areas or [],
            "questions": self.questions or [],
            "answers": self.answers or [],
            "scores": self.scores or [],
            "report": self.report,
            "status": self.status,
            "mode": self.mode or "avatar",
            "duration": self.duration,
        }


class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), nullable=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    role = Column(String(200))
    level = Column(String(50))
    job_description = Column(Text)
    report = Column(Text)
    score = Column(Integer)
    recommendation = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)

    candidate = relationship("Candidate", back_populates="evaluations")


class CandidateAccess(Base):
    __tablename__ = "candidate_access"

    id = Column(Integer, primary_key=True, index=True)
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), nullable=True, index=True)
    email = Column(String(200), index=True)
    candidate_id = Column(Integer, nullable=True)
    name = Column(String(200))
    granted_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("email", "manager_id", name="uq_access_email_manager"),
    )
