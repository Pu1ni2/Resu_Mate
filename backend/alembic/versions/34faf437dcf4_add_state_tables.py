"""add_state_tables

Revision ID: 34faf437dcf4
Revises: a3b65984032c
Create Date: 2026-04-11 21:19:57.771981

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '34faf437dcf4'
down_revision: Union[str, Sequence[str], None] = 'a3b65984032c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_sqlite():
    return op.get_bind().dialect.name == 'sqlite'


# a3b65984032c already makes these on PostgreSQL: the composite unique
# constraint, the non-unique email index, and a manager foreign key on each of
# the three tables. Making them again failed on a fresh database ("relation
# uq_access_email_manager already exists"), so `alembic upgrade head` stopped
# here. Each is now made only if it is missing. A database that has already run
# this migration is unaffected: alembic never runs it again.
_MANAGER_FKS = (
    ('fk_ca_manager', 'candidate_access'),
    ('fk_candidates_manager2', 'candidates'),
    ('fk_evaluations_manager2', 'evaluations'),
)


def _has_manager_fk(inspector, table):
    return any(
        fk['referred_table'] == 'hiring_managers' and fk['constrained_columns'] == ['manager_id']
        for fk in inspector.get_foreign_keys(table)
    )


def upgrade() -> None:
    op.create_table(
        'advisor_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=200), nullable=False),
        sa.Column('resume_text', sa.Text(), nullable=True),
        sa.Column('resume_metadata', sa.JSON(), nullable=True),
        sa.Column('chat_history', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_advisor_sessions_email', 'advisor_sessions', ['email'], unique=True)
    op.create_index('ix_advisor_sessions_id', 'advisor_sessions', ['id'], unique=False)

    op.create_table(
        'chat_histories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.String(length=100), nullable=False),
        sa.Column('manager_id', sa.Integer(), nullable=False),
        sa.Column('messages', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'manager_id', name='uq_chat_session_manager'),
    )
    op.create_index('ix_chat_histories_id', 'chat_histories', ['id'], unique=False)
    op.create_index('ix_chat_histories_manager_id', 'chat_histories', ['manager_id'], unique=False)
    op.create_index('ix_chat_histories_session_id', 'chat_histories', ['session_id'], unique=False)

    # PostgreSQL-only: add FK constraints (SQLite doesn't support ALTER TABLE constraints)
    if not _is_sqlite():
        op.create_foreign_key('fk_chat_histories_manager', 'chat_histories', 'hiring_managers', ['manager_id'], ['id'])
        inspector = sa.inspect(op.get_bind())
        if any(ix['name'] == 'ix_candidate_access_email' and ix['unique']
               for ix in inspector.get_indexes('candidate_access')):
            op.drop_index('ix_candidate_access_email', table_name='candidate_access')
            op.create_index('ix_candidate_access_email', 'candidate_access', ['email'], unique=False)
        if not any(uc['name'] == 'uq_access_email_manager'
                   for uc in inspector.get_unique_constraints('candidate_access')):
            op.create_unique_constraint('uq_access_email_manager', 'candidate_access', ['email', 'manager_id'])
        for name, table in _MANAGER_FKS:
            if not _has_manager_fk(inspector, table):
                op.create_foreign_key(name, table, 'hiring_managers', ['manager_id'], ['id'])


def downgrade() -> None:
    if not _is_sqlite():
        # Only this migration's own foreign keys, and only where it made them.
        # The unique constraint is a3b65984032c's, and its downgrade drops it.
        inspector = sa.inspect(op.get_bind())
        for name, table in _MANAGER_FKS:
            if any(fk['name'] == name for fk in inspector.get_foreign_keys(table)):
                op.drop_constraint(name, table, type_='foreignkey')
        op.drop_index('ix_candidate_access_email', table_name='candidate_access')
        op.create_index('ix_candidate_access_email', 'candidate_access', ['email'], unique=True)
        op.drop_constraint('fk_chat_histories_manager', 'chat_histories', type_='foreignkey')

    op.drop_index('ix_chat_histories_session_id', table_name='chat_histories')
    op.drop_index('ix_chat_histories_manager_id', table_name='chat_histories')
    op.drop_index('ix_chat_histories_id', table_name='chat_histories')
    op.drop_table('chat_histories')
    op.drop_index('ix_advisor_sessions_id', table_name='advisor_sessions')
    op.drop_index('ix_advisor_sessions_email', table_name='advisor_sessions')
    op.drop_table('advisor_sessions')
