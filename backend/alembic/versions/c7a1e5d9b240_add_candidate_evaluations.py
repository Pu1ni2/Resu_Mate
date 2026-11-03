"""candidate_evaluations: a role-fit evaluation, kept to be read again

Revision ID: c7a1e5d9b240
Revises: b4e9c2d7f318
Create Date: 2026-11-02

An evaluation was only sent back, so opening another person's file, or a
refresh, lost it. Not the "evaluations" table f7c4a9e2b153 dropped, which
nothing ever wrote to.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7a1e5d9b240"
down_revision: Union[str, Sequence[str], None] = "b4e9c2d7f318"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "candidate_evaluations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("manager_id", sa.Integer(), sa.ForeignKey("hiring_managers.id"), nullable=False),
        sa.Column("candidate_id", sa.Integer(), sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("role", sa.String(length=200), nullable=True),
        sa.Column("level", sa.String(length=50), nullable=True),
        sa.Column("experience_required", sa.String(length=50), nullable=True),
        sa.Column("job_description", sa.Text(), nullable=True),
        sa.Column("anonymized", sa.Boolean(), nullable=False),
        sa.Column("report", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_candidate_evaluations_manager_id", "candidate_evaluations", ["manager_id"])
    op.create_index("ix_candidate_evaluations_candidate_id", "candidate_evaluations", ["candidate_id"])
    op.create_index("ix_candidate_evaluations_created_at", "candidate_evaluations", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_candidate_evaluations_created_at", table_name="candidate_evaluations")
    op.drop_index("ix_candidate_evaluations_candidate_id", table_name="candidate_evaluations")
    op.drop_index("ix_candidate_evaluations_manager_id", table_name="candidate_evaluations")
    op.drop_table("candidate_evaluations")
