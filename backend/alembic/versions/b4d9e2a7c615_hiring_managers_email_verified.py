"""hiring_managers.email_verified: whether the manager confirmed their address

Revision ID: b4d9e2a7c615
Revises: e3b7d1f5a926
Create Date: 2026-11-04

Anyone could sign up with any address and email candidates from ResuMate.
New accounts confirm theirs first. The accounts already there count as
confirmed, as they could send before.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b4d9e2a7c615"
down_revision: Union[str, Sequence[str], None] = "e3b7d1f5a926"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A database built by create_all already has it.
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("hiring_managers")}
    if "email_verified" not in columns:
        op.add_column("hiring_managers", sa.Column("email_verified", sa.Boolean(), server_default=sa.true(), nullable=False))


def downgrade() -> None:
    op.drop_column("hiring_managers", "email_verified")
