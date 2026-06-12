"""add audit_log table for PII action trail

Revision ID: e5a2b9c7f104
Revises: d3f7a1c4e920
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5a2b9c7f104"
down_revision: Union[str, Sequence[str], None] = "d3f7a1c4e920"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("manager_id", sa.Integer(), sa.ForeignKey("hiring_managers.id"), nullable=True),
        sa.Column("actor", sa.String(length=40), nullable=False),
        sa.Column("action", sa.String(length=60), nullable=False),
        sa.Column("target_email", sa.String(length=200), nullable=True),
        sa.Column("detail", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_audit_log_manager_id", "audit_log", ["manager_id"])
    op.create_index("ix_audit_log_target_email", "audit_log", ["target_email"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_log_created_at", table_name="audit_log")
    op.drop_index("ix_audit_log_target_email", table_name="audit_log")
    op.drop_index("ix_audit_log_manager_id", table_name="audit_log")
    op.drop_table("audit_log")
