"""Evaluation models: a role-fit evaluation of a candidate, kept to be read again."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey
from app.core.database import Base


class CandidateEvaluation(Base):
    """One role-fit evaluation from the candidate file or Jarvis: what it was
    asked, and the report it wrote (app/services/evaluations.py)."""
    __tablename__ = "candidate_evaluations"

    id = Column(Integer, primary_key=True)
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), nullable=False, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False, index=True)
    role = Column(String(200))
    level = Column(String(50))
    experience_required = Column(String(50))
    job_description = Column(Text)
    # Whether the candidate's name was kept from it. One written with the name
    # isn't shown while names are hidden.
    anonymized = Column(Boolean, nullable=False, default=False)
    report = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
