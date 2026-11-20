"""invite_batch_items.email_id: the batch invitation's email in the outbox

Revision ID: 3a9905e58cb5
Revises: 353aea48719f
Create Date: 2026-11-19

A batch's job sent each invitation itself. It's queued in the outbox now, as
the job ends the candidate's part, and the batch follows it there.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3a9905e58cb5"
down_revision: Union[str, Sequence[str], None] = "353aea48719f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invite_batch_items", sa.Column("email_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("invite_batch_items", "email_id")
