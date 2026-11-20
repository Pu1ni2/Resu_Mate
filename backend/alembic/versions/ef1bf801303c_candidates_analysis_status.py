"""candidates.analysis_status: a résumé being read, read, or not readable

Revision ID: ef1bf801303c
Revises: 3a9905e58cb5
Create Date: 2026-11-19

The upload waited for the AI's reading of the résumé, inside the request. A
background job is to read it, and the candidate says how far it got:
pending, done or failed. Empty for what came before, which reads as done,
or failed when its analysis failed (analysis_failed).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ef1bf801303c"
down_revision: Union[str, Sequence[str], None] = "3a9905e58cb5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("candidates", sa.Column("analysis_status", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("candidates", "analysis_status")
