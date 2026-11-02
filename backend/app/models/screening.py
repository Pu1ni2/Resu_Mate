"""Screening models: a screening run, kept to be opened again."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from app.core.database import Base


class ScreeningRun(Base):
    """One screening run: the brief it was given, and what it worked out about
    each candidate (app/services/screening_runs.py), not who they are."""
    __tablename__ = "screening_runs"

    id = Column(Integer, primary_key=True)
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), nullable=False, index=True)
    role = Column(String(200))
    run = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
