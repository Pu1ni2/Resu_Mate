"""match the schema to the models: audit_log id index, interviews.manager_id FK

Revision ID: c9f2d6e3a418
Revises: b8e1c5d2f307
Create Date: 2026-10-08

`alembic check` against a database built from empty found the last two
differences from the models: audit_log.id has index=True, but no migration
made the index, and d3f7a1c4e920 added interviews.manager_id without the
foreign key the model declares.

Every step looks at the schema first. The live database may have been built
another way (create_all, then stamped), so each is done only where it is
missing.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9f2d6e3a418"
down_revision: Union[str, Sequence[str], None] = "b8e1c5d2f307"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The manager keys 34faf437dcf4 used to add a second time, under these names,
# on top of a3b65984032c's. Dropped where another key covers the same column.
_DUPLICATE_MANAGER_FKS = (
    ("fk_ca_manager", "candidate_access"),
    ("fk_candidates_manager2", "candidates"),
    ("fk_evaluations_manager2", "evaluations"),
)


def _manager_fks(inspector, table):
    return [
        fk for fk in inspector.get_foreign_keys(table)
        if fk["referred_table"] == "hiring_managers" and fk["constrained_columns"] == ["manager_id"]
    ]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not any(ix["name"] == "ix_audit_log_id" for ix in inspector.get_indexes("audit_log")):
        op.create_index("ix_audit_log_id", "audit_log", ["id"], unique=False)

    # SQLite can't add a foreign key to an existing table.
    if bind.dialect.name == "sqlite":
        return

    if not _manager_fks(inspector, "interviews"):
        # An interview whose manager no longer exists would stop the key being
        # made. No manager can see such a row anyway, so it becomes unowned.
        op.execute(
            "UPDATE interviews SET manager_id = NULL WHERE manager_id IS NOT NULL "
            "AND manager_id NOT IN (SELECT id FROM hiring_managers)"
        )
        op.create_foreign_key("fk_interviews_manager", "interviews", "hiring_managers", ["manager_id"], ["id"])

    for name, table in _DUPLICATE_MANAGER_FKS:
        keys = _manager_fks(inspector, table)
        if len(keys) > 1 and any(fk["name"] == name for fk in keys):
            op.drop_constraint(name, table, type_="foreignkey")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if bind.dialect.name != "sqlite" and any(
        fk["name"] == "fk_interviews_manager" for fk in inspector.get_foreign_keys("interviews")
    ):
        op.drop_constraint("fk_interviews_manager", "interviews", type_="foreignkey")
    if any(ix["name"] == "ix_audit_log_id" for ix in inspector.get_indexes("audit_log")):
        op.drop_index("ix_audit_log_id", table_name="audit_log")
