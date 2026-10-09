"""widen otp_codes.code to hold the hash it stores

Revision ID: b8e1c5d2f307
Revises: a7c4e1f9b203
Create Date: 2026-10-08

a3b65984032c made the column String(6), for the bare six-digit code, but the
app stores a bcrypt hash of the code (60 characters). On a Postgres database
built by the migrations every sign-in code failed to save, so candidates could
not sign in. The model has always said String(255).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8e1c5d2f307"
down_revision: Union[str, Sequence[str], None] = "a7c4e1f9b203"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _code_length() -> int:
    columns = sa.inspect(op.get_bind()).get_columns("otp_codes")
    return next(c["type"].length or 0 for c in columns if c["name"] == "code")


def upgrade() -> None:
    # SQLite doesn't enforce VARCHAR lengths. A database built by create_all
    # already has 255, so it is left alone.
    if op.get_bind().dialect.name == "sqlite" or _code_length() >= 255:
        return
    op.alter_column(
        "otp_codes", "code",
        existing_type=sa.String(length=6), type_=sa.String(length=255), existing_nullable=False,
    )


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    # Codes stored since are hashes, which no longer fit in six characters.
    # They last fifteen minutes, so dropping them only asks for a new code.
    op.execute("DELETE FROM otp_codes")
    op.alter_column(
        "otp_codes", "code",
        existing_type=sa.String(length=255), type_=sa.String(length=6), existing_nullable=False,
    )
