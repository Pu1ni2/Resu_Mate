"""invite_batches and invite_batch_items: batch invitations, prepared by background jobs

Revision ID: fa3e6275a1da
Revises: 3b9adf7bc7d2
Create Date: 2026-11-18

A batch invite made each candidate's interview, questions and email inside
the request, one after another: five people took minutes, closing the page
lost every result, and asking again made every interview again. The request
now keeps a batch and one item per candidate, and background jobs do the
rest; client_key makes asking twice the same batch.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa3e6275a1da"
down_revision: Union[str, Sequence[str], None] = "3b9adf7bc7d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "invite_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("manager_id", sa.Integer(), sa.ForeignKey("hiring_managers.id"), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("client_key", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=200), nullable=False),
        sa.Column("level", sa.String(length=50), nullable=False),
        sa.Column("num_questions", sa.Integer(), nullable=False),
        sa.Column("focus_areas", sa.JSON(), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("email_type", sa.String(length=32), nullable=False),
        sa.Column("send_emails", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("manager_id", "client_key", name="uq_invite_batches_client_key"),
    )
    op.create_index("ix_invite_batches_manager_id", "invite_batches", ["manager_id"])
    op.create_table(
        "invite_batch_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("invite_batches.id"), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("skip_reason", sa.String(length=200), nullable=True),
        sa.Column("error", sa.String(length=200), nullable=True),
        sa.Column("interview_id", sa.Integer(), nullable=True),
        sa.Column("reused", sa.Boolean(), nullable=False),
        sa.Column("email_subject", sa.String(length=300), nullable=True),
        sa.Column("email_body", sa.Text(), nullable=True),
        sa.Column("email_status", sa.String(length=16), nullable=True),
        sa.Column("email_error", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("batch_id", "candidate_id", name="uq_invite_batch_items_candidate"),
    )
    op.create_index("ix_invite_batch_items_batch_id", "invite_batch_items", ["batch_id"])
    op.create_index("ix_invite_batch_items_candidate_id", "invite_batch_items", ["candidate_id"])


def downgrade() -> None:
    op.drop_index("ix_invite_batch_items_candidate_id", table_name="invite_batch_items")
    op.drop_index("ix_invite_batch_items_batch_id", table_name="invite_batch_items")
    op.drop_table("invite_batch_items")
    op.drop_index("ix_invite_batches_manager_id", table_name="invite_batches")
    op.drop_table("invite_batches")
