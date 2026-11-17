"""interviews.report_status and report_error: a report written after the interview

Revision ID: 3b9adf7bc7d2
Revises: 476d4f1c76f9
Create Date: 2026-11-17

An interview's report was written inside the request that finished it, and
the interview was completed and given its report in one commit, so a report
the AI couldn't write left nothing to say so. A background job now writes
it, and these say where it stands: pending, done or failed, and why.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3b9adf7bc7d2"
down_revision: Union[str, Sequence[str], None] = "476d4f1c76f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("interviews", sa.Column("report_status", sa.String(length=16), nullable=True))
    op.add_column("interviews", sa.Column("report_error", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("interviews", "report_error")
    op.drop_column("interviews", "report_status")
