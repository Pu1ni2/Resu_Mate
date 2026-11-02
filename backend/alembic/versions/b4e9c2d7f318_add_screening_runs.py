"""screening_runs: a screening run, kept to be opened again

Revision ID: b4e9c2d7f318
Revises: a8d3f5c1e927
Create Date: 2026-11-02

A run was kept only in the page, so leaving it, to open a candidate's file,
or refreshing it meant screening again.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b4e9c2d7f318"
down_revision: Union[str, Sequence[str], None] = "a8d3f5c1e927"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "screening_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("manager_id", sa.Integer(), sa.ForeignKey("hiring_managers.id"), nullable=False),
        sa.Column("role", sa.String(length=200), nullable=True),
        sa.Column("run", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_screening_runs_manager_id", "screening_runs", ["manager_id"])
    op.create_index("ix_screening_runs_created_at", "screening_runs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_screening_runs_created_at", table_name="screening_runs")
    op.drop_index("ix_screening_runs_manager_id", table_name="screening_runs")
    op.drop_table("screening_runs")
