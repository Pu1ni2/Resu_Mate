"""Sourcing models: a search for people, and the people it judged"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class SourcingRun(Base):
    """One "find candidates" run: what the manager asked for, the plan it
    became (criteria, keyword-filter baseline, searches) and the final stats."""
    __tablename__ = "sourcing_runs"

    id = Column(Integer, primary_key=True, index=True)
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), nullable=False, index=True)
    description = Column(Text, nullable=False)
    plan = Column(JSON, default=dict)
    stats = Column(JSON, default=dict)
    status = Column(String(20), default="complete")  # complete | stopped
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    profiles = relationship("SourcedProfile", back_populates="run", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "description": self.description,
            "plan": self.plan or {},
            "stats": self.stats or {},
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SourcedProfile(Base):
    """A person a run judged, with the written judgement.

    Only what the page shows is kept: the scraped profile text the judgement was
    written from is not stored.
    """
    __tablename__ = "sourced_profiles"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("sourcing_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    manager_id = Column(Integer, ForeignKey("hiring_managers.id"), nullable=False, index=True)
    source = Column(String(20), nullable=False)          # upload | github | web
    external_id = Column(String(300), nullable=False)    # candidate id, GitHub login, or profile URL
    name = Column(String(200), nullable=False)
    url = Column(String(500))
    avatar_url = Column(String(500))
    email = Column(String(200))                          # known for uploads only
    location = Column(String(200))
    headline = Column(String(300))
    verdict = Column(String(20))                         # shortlist | passed
    score = Column(Integer, default=0)
    criteria = Column(JSON, default=list)                # [{id, value, level}]
    judgement = Column(Text)
    filter_match = Column(Boolean, default=False)        # would a title + keyword filter have found them
    miss_reason = Column(String(40))                     # why a filter would have missed them
    status = Column(String(20), default="new")           # new | saved | dismissed
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("SourcingRun", back_populates="profiles")

    @property
    def pid(self) -> str:
        # The same id the live stream uses, so a reopened run and a live one
        # address people the same way.
        return f"{self.source}:{self.external_id}"

    def to_dict(self):
        return {
            "id": self.id,
            "pid": self.pid,
            "run_id": self.run_id,
            "source": self.source,
            "name": self.name,
            "url": self.url,
            "avatar_url": self.avatar_url,
            "email": self.email,
            "location": self.location,
            "headline": self.headline,
            "verdict": self.verdict,
            "score": self.score,
            "criteria": self.criteria or [],
            "judgement": self.judgement,
            "filter_match": bool(self.filter_match),
            "miss_reason": self.miss_reason,
            "status": self.status,
        }
