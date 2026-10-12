"""otp_codes.wrong_guesses: a code's wrong guesses, kept with the code

Revision ID: a8d3f5c1e927
Revises: f7c4a9e2b153
Create Date: 2026-10-11

Five wrong guesses use a code up. The count was kept in the server's memory, so
it started again on every restart, and the free plan's server sleeps when idle;
sign-in codes had no limit at all. Codes already issued start at none.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8d3f5c1e927"
down_revision: Union[str, Sequence[str], None] = "f7c4a9e2b153"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A database built by create_all already has it.
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("otp_codes")}
    if "wrong_guesses" not in columns:
        op.add_column("otp_codes", sa.Column("wrong_guesses", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("otp_codes", "wrong_guesses")
