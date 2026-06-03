"""add interview.mode column

Distinguishes the existing LiveKit + Simli avatar flow ("avatar") from the new
audio-only OpenAI Realtime conversational flow ("conversational").

Revision ID: c2e4d8a91b55
Revises: b1f9c2a31d40
Create Date: 2026-05-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2e4d8a91b55"
down_revision: Union[str, Sequence[str], None] = "b1f9c2a31d40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add the column with a server default so existing rows backfill to "avatar",
    # then drop the server default so future inserts go through the model's
    # Python-level default.
    op.add_column(
        "interviews",
        sa.Column("mode", sa.String(length=20), server_default="avatar", nullable=False),
    )
    # SQLite doesn't support altering a column's server default cleanly in
    # alembic without a batch op; leaving the default in place is harmless.


def downgrade() -> None:
    op.drop_column("interviews", "mode")
