"""add sourcing_runs and sourced_profiles for the candidate sourcer

Revision ID: a7c4e1f9b203
Revises: f6b3d2e8a915
Create Date: 2026-09-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c4e1f9b203"
down_revision: Union[str, Sequence[str], None] = "f6b3d2e8a915"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sourcing_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("manager_id", sa.Integer(), sa.ForeignKey("hiring_managers.id"), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("plan", sa.JSON(), nullable=True),
        sa.Column("stats", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_sourcing_runs_id", "sourcing_runs", ["id"])
    op.create_index("ix_sourcing_runs_manager_id", "sourcing_runs", ["manager_id"])
    op.create_index("ix_sourcing_runs_created_at", "sourcing_runs", ["created_at"])

    op.create_table(
        "sourced_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("sourcing_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("manager_id", sa.Integer(), sa.ForeignKey("hiring_managers.id"), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("external_id", sa.String(length=300), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("headline", sa.String(length=300), nullable=True),
        sa.Column("verdict", sa.String(length=20), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("criteria", sa.JSON(), nullable=True),
        sa.Column("judgement", sa.Text(), nullable=True),
        sa.Column("filter_match", sa.Boolean(), nullable=True),
        sa.Column("miss_reason", sa.String(length=40), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_sourced_profiles_id", "sourced_profiles", ["id"])
    op.create_index("ix_sourced_profiles_run_id", "sourced_profiles", ["run_id"])
    op.create_index("ix_sourced_profiles_manager_id", "sourced_profiles", ["manager_id"])


def downgrade() -> None:
    op.drop_index("ix_sourced_profiles_manager_id", table_name="sourced_profiles")
    op.drop_index("ix_sourced_profiles_run_id", table_name="sourced_profiles")
    op.drop_index("ix_sourced_profiles_id", table_name="sourced_profiles")
    op.drop_table("sourced_profiles")
    op.drop_index("ix_sourcing_runs_created_at", table_name="sourcing_runs")
    op.drop_index("ix_sourcing_runs_manager_id", table_name="sourcing_runs")
    op.drop_index("ix_sourcing_runs_id", table_name="sourcing_runs")
    op.drop_table("sourcing_runs")
