"""candidates.analysis_failed: the AI analysis of the résumé failed

Revision ID: e6f1a3b7c842
Revises: d4e8b2a6c731
Create Date: 2026-10-09

With it, role, level and years are unknown rather than the "Professional /
Entry / 0 years" a failed analysis used to save. Empty for what came before.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6f1a3b7c842"
down_revision: Union[str, Sequence[str], None] = "d4e8b2a6c731"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A database built by create_all already has it.
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("candidates")}
    if "analysis_failed" not in columns:
        op.add_column("candidates", sa.Column("analysis_failed", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("candidates", "analysis_failed")
