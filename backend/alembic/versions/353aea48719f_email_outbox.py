"""email_outbox: each email the server sends, kept until a background job has sent it

Revision ID: 353aea48719f
Revises: ec8d4d876c75
Create Date: 2026-11-18

Eight places sent email, each its own way: some inside the request, some
just after the response, where a restart lost them, and none tried again
when the email service was busy. Each email is kept here until a background
job has sent it, or given up and said why.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "353aea48719f"
down_revision: Union[str, Sequence[str], None] = "ec8d4d876c75"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("manager_id", sa.Integer(), sa.ForeignKey("hiring_managers.id"), nullable=True),
        sa.Column("interview_id", sa.Integer(), nullable=True),
        sa.Column("to_address", sa.String(length=320), nullable=True),
        sa.Column("subject", sa.String(length=300), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("counts_to_quota", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("error", sa.String(length=300), nullable=True),
        sa.Column("dedupe_key", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("dedupe_key", name="uq_email_outbox_dedupe_key"),
    )
    op.create_index("ix_email_outbox_manager_id", "email_outbox", ["manager_id"])
    op.create_index("ix_email_outbox_interview_id", "email_outbox", ["interview_id"])


def downgrade() -> None:
    op.drop_index("ix_email_outbox_interview_id", table_name="email_outbox")
    op.drop_index("ix_email_outbox_manager_id", table_name="email_outbox")
    op.drop_table("email_outbox")
