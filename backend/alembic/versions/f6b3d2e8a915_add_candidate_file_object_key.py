"""add candidates.file_object_key for object-stored resumes

Revision ID: f6b3d2e8a915
Revises: e5a2b9c7f104
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6b3d2e8a915"
down_revision: Union[str, Sequence[str], None] = "e5a2b9c7f104"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("candidates", sa.Column("file_object_key", sa.String(length=600), nullable=True))


def downgrade() -> None:
    op.drop_column("candidates", "file_object_key")
