"""jobs: slow work, done in the background and kept until it's finished

Revision ID: 476d4f1c76f9
Revises: b4d9e2a7c615
Create Date: 2026-11-13

Uploads, invitations, reports and searches ran inside the request that asked
for them: closing the page, or a restart, lost the work, and a slow one
outlasted the browser's wait.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "476d4f1c76f9"
down_revision: Union[str, Sequence[str], None] = "b4d9e2a7c615"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("run_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("locked_by", sa.String(length=64), nullable=True),
        sa.Column("locked_until", sa.DateTime(), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(), nullable=True),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("dedupe_key", sa.String(length=128), nullable=True),
        sa.Column("manager_id", sa.Integer(), sa.ForeignKey("hiring_managers.id"), nullable=True),
        sa.Column("last_error", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("dedupe_key", name="uq_jobs_dedupe_key"),
    )
    op.create_index("ix_jobs_status_run_at", "jobs", ["status", "run_at"])
    op.create_index("ix_jobs_status_locked_until", "jobs", ["status", "locked_until"])
    op.create_index("ix_jobs_manager_id", "jobs", ["manager_id"])
    op.create_index("ix_jobs_finished_at", "jobs", ["finished_at"])


def downgrade() -> None:
    op.drop_index("ix_jobs_finished_at", table_name="jobs")
    op.drop_index("ix_jobs_manager_id", table_name="jobs")
    op.drop_index("ix_jobs_status_locked_until", table_name="jobs")
    op.drop_index("ix_jobs_status_run_at", table_name="jobs")
    op.drop_table("jobs")
