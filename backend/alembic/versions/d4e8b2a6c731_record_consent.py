"""record consent: the Terms at sign-up, and the candidate's before an interview

Revision ID: d4e8b2a6c731
Revises: c9f2d6e3a418
Create Date: 2026-10-09

hiring_managers.terms_accepted_at and terms_version: when a manager agreed to
the Terms and the Privacy Policy, and which version. interviews.consented_at:
when the candidate confirmed they understood how the interview works before it
started. All empty for what came before.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e8b2a6c731"
down_revision: Union[str, Sequence[str], None] = "c9f2d6e3a418"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # A database built by create_all already has them.
    managers = _columns("hiring_managers")
    if "terms_accepted_at" not in managers:
        op.add_column("hiring_managers", sa.Column("terms_accepted_at", sa.DateTime(), nullable=True))
    if "terms_version" not in managers:
        op.add_column("hiring_managers", sa.Column("terms_version", sa.String(length=40), nullable=True))
    if "consented_at" not in _columns("interviews"):
        op.add_column("interviews", sa.Column("consented_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("interviews", "consented_at")
    op.drop_column("hiring_managers", "terms_version")
    op.drop_column("hiring_managers", "terms_accepted_at")
