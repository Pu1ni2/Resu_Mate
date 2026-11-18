"""invite_batch_items.email_drafted: whether the AI wrote the invitation's draft

Revision ID: ec8d4d876c75
Revises: fa3e6275a1da
Create Date: 2026-11-18

A batch invitation's draft is the AI's, or the standard one when the AI
couldn't write it, and the manager is told which.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ec8d4d876c75"
down_revision: Union[str, Sequence[str], None] = "fa3e6275a1da"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invite_batch_items", sa.Column("email_drafted", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("invite_batch_items", "email_drafted")
