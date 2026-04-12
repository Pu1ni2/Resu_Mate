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
        # These were skipped in Phase 2 migration for SQLite — apply them now on PostgreSQL
        op.drop_index('ix_candidate_access_email', table_name='candidate_access')
        op.create_index('ix_candidate_access_email', 'candidate_access', ['email'], unique=False)
        op.create_unique_constraint('uq_access_email_manager', 'candidate_access', ['email', 'manager_id'])
        op.create_foreign_key('fk_ca_manager', 'candidate_access', 'hiring_managers', ['manager_id'], ['id'])
        op.create_foreign_key('fk_candidates_manager2', 'candidates', 'hiring_managers', ['manager_id'], ['id'])
        op.create_foreign_key('fk_evaluations_manager2', 'evaluations', 'hiring_managers', ['manager_id'], ['id'])


def downgrade() -> None:
    if not _is_sqlite():
        op.drop_constraint('fk_evaluations_manager2', 'evaluations', type_='foreignkey')
        op.drop_constraint('fk_candidates_manager2', 'candidates', type_='foreignkey')
        op.drop_constraint('fk_ca_manager', 'candidate_access', type_='foreignkey')
        op.drop_constraint('uq_access_email_manager', 'candidate_access', type_='unique')
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
