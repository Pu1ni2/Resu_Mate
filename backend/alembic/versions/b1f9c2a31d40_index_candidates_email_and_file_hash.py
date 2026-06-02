"""index candidates.email and candidates.file_hash

Both columns are queried on every upload / candidate lookup. Without an index
they are O(n) scans which becomes painful past a few hundred candidates.

Revision ID: b1f9c2a31d40
Revises: 34faf437dcf4
Create Date: 2026-05-29
"""
from typing import Sequence, Union

from alembic import op


revision: str = "b1f9c2a31d40"
down_revision: Union[str, Sequence[str], None] = "34faf437dcf4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_candidates_email", "candidates", ["email"], unique=False)
    op.create_index("ix_candidates_file_hash", "candidates", ["file_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_candidates_file_hash", table_name="candidates")
    op.drop_index("ix_candidates_email", table_name="candidates")
