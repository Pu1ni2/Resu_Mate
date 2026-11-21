"""sourcing runs as background jobs: where each stands, written as it goes

Revision ID: 9040d32d18ba
Revises: c398f49a3dec
Create Date: 2026-11-21

A search ran inside one request and was saved as it ended: Stop was the
browser closing the connection, and whoever was found but not yet judged
was lost. A background job is to run it, writing as it goes. A run is
queued, running, stopping, then complete, stopped or failed; it keeps where
it was asked to look, its warnings and why it failed, when it started and
ended, and counts its writes (seq), so a page following it asks only for
what changed. Each person found keeps the write that last changed them,
and what judging them took.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9040d32d18ba"
down_revision: Union[str, Sequence[str], None] = "c398f49a3dec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sourcing_runs", sa.Column("sources", sa.JSON(), nullable=True))
    op.add_column("sourcing_runs", sa.Column("warnings", sa.JSON(), nullable=True))
    op.add_column("sourcing_runs", sa.Column("error", sa.Text(), nullable=True))
    op.add_column("sourcing_runs", sa.Column("seq", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("sourcing_runs", sa.Column("started_at", sa.DateTime(), nullable=True))
    op.add_column("sourcing_runs", sa.Column("finished_at", sa.DateTime(), nullable=True))
    op.add_column("sourced_profiles", sa.Column("seq", sa.Integer(), nullable=True))
    op.add_column("sourced_profiles", sa.Column("judge_ms", sa.Integer(), nullable=True))
    op.add_column("sourced_profiles", sa.Column("judge_tokens", sa.Integer(), nullable=True))
    op.create_index("ix_sourced_profiles_run_id_seq", "sourced_profiles", ["run_id", "seq"])


def downgrade() -> None:
    op.drop_index("ix_sourced_profiles_run_id_seq", table_name="sourced_profiles")
    for column in ("judge_tokens", "judge_ms", "seq"):
        op.drop_column("sourced_profiles", column)
    for column in ("finished_at", "started_at", "seq", "error", "warnings", "sources"):
        op.drop_column("sourcing_runs", column)
