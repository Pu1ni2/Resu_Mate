"""evaluation_requests: each role-fit evaluation asked for, written by a background job

Revision ID: 9800e7354291
Revises: ef1bf801303c
Create Date: 2026-11-20

An evaluation was written inside the request: a minute or more, lost when
the page closed, and a failure was gone with it. Each one asked for is kept
here with what it was asked and how far it got, and a background job writes
it, keeping the evaluation as before (candidate_evaluations).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9800e7354291"
down_revision: Union[str, Sequence[str], None] = "ef1bf801303c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "evaluation_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("manager_id", sa.Integer(), sa.ForeignKey("hiring_managers.id"), nullable=False),
        sa.Column("candidate_id", sa.Integer(), sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("role", sa.String(length=200), nullable=True),
        sa.Column("level", sa.String(length=50), nullable=True),
        sa.Column("experience_required", sa.String(length=50), nullable=True),
        sa.Column("job_description", sa.Text(), nullable=True),
        sa.Column("anonymized", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("error", sa.String(length=300), nullable=True),
        sa.Column("evaluation_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_evaluation_requests_manager_id", "evaluation_requests", ["manager_id"])
    op.create_index("ix_evaluation_requests_candidate_id", "evaluation_requests", ["candidate_id"])


def downgrade() -> None:
    op.drop_index("ix_evaluation_requests_candidate_id", table_name="evaluation_requests")
    op.drop_index("ix_evaluation_requests_manager_id", table_name="evaluation_requests")
    op.drop_table("evaluation_requests")
