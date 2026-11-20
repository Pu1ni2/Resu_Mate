"""interviews.questions_status: an interview's questions being written, ready, or not

Revision ID: c398f49a3dec
Revises: 9800e7354291
Create Date: 2026-11-20

A single interview was made with its questions inside the request: the AI
wrote them while the manager waited. A background job is to write them, and
the interview says how far it got: pending, ready or failed. Empty for what
came before, whose questions came with it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c398f49a3dec"
down_revision: Union[str, Sequence[str], None] = "9800e7354291"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("interviews", sa.Column("questions_status", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("interviews", "questions_status")
