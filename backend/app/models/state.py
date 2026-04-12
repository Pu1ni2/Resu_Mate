"""State persistence models — ChatHistory and AdvisorSession"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey, UniqueConstraint
from app.core.database import Base


class ChatHistory(Base):
    __tablename__ = "chat_histories"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), nullable=False, index=True)
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), nullable=False, index=True)
    messages = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("session_id", "manager_id", name="uq_chat_session_manager"),
    )


class AdvisorSession(Base):
    __tablename__ = "advisor_sessions"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(200), unique=True, index=True, nullable=False)
    resume_text = Column(Text, nullable=True)
    resume_metadata = Column(JSON, default=dict)
    # Keyed by mode: "resume_coach", "interview_prep", "career_advisor"
    chat_history = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
