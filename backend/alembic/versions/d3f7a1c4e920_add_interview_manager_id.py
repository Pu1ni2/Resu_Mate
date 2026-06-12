"""add interviews.manager_id for multi-tenant isolation

Scopes interviews to the owning hiring manager. Backfills existing rows from
candidate_access (email -> manager_id) where a match exists; rows with no match
stay NULL and become invisible to manager-scoped queries (safe default).

Revision ID: d3f7a1c4e920
Revises: c2e4d8a91b55
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3f7a1c4e920"
down_revision: Union[str, Sequence[str], None] = "c2e4d8a91b55"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("interviews", sa.Column("manager_id", sa.Integer(), nullable=True))
    op.create_index("ix_interviews_manager_id", "interviews", ["manager_id"], unique=False)

    # Backfill: match each interview's candidate_email to a candidate_access row
    # and copy its manager_id. Works on both SQLite and Postgres (correlated
    # UPDATE ... SET = (SELECT ...)).
    op.execute(
        """
        UPDATE interviews
        SET manager_id = (
            SELECT ca.manager_id
            FROM candidate_access ca
            WHERE ca.email = interviews.candidate_email
              AND ca.manager_id IS NOT NULL
            LIMIT 1
        )
        WHERE manager_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_interviews_manager_id", table_name="interviews")
    op.drop_column("interviews", "manager_id")
