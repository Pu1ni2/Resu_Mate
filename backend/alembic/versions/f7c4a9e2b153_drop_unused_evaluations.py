"""Drop evaluations: nothing ever wrote to it

Revision ID: f7c4a9e2b153
Revises: e6f1a3b7c842
Create Date: 2026-10-10

It came with the first schema, for saved hiring-agent evaluations, but no
version of the app ever created a row in it: evaluations are sent back, not
stored. Only deleting a candidate or an account touched it, to delete rows
that couldn't exist.

The downgrade puts back an empty table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7c4a9e2b153"
down_revision: Union[str, Sequence[str], None] = "e6f1a3b7c842"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Its indexes and foreign keys go with it.
    if "evaluations" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("evaluations")


def downgrade() -> None:
    op.create_table(
        "evaluations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("manager_id", sa.Integer(), nullable=True),
        sa.Column("candidate_id", sa.Integer(), sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("role", sa.String(length=200), nullable=True),
        sa.Column("level", sa.String(length=50), nullable=True),
        sa.Column("job_description", sa.Text(), nullable=True),
        sa.Column("report", sa.Text(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("recommendation", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["manager_id"], ["hiring_managers.id"], name="fk_evaluations_manager"),
    )
    op.create_index("ix_evaluations_id", "evaluations", ["id"], unique=False)
    op.create_index("ix_evaluations_manager_id", "evaluations", ["manager_id"], unique=False)
