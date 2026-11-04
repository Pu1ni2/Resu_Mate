"""hiring_managers.hide_names: "Hide names", kept on the account

Revision ID: e3b7d1f5a926
Revises: c7a1e5d9b240
Create Date: 2026-11-04

The setting was only the page's, so the server sent candidates' names and
contact details to the AI wherever a request didn't say otherwise. Existing
accounts start with names shown, as they were.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3b7d1f5a926"
down_revision: Union[str, Sequence[str], None] = "c7a1e5d9b240"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A database built by create_all already has it.
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("hiring_managers")}
    if "hide_names" not in columns:
        op.add_column("hiring_managers", sa.Column("hide_names", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column("hiring_managers", "hide_names")
