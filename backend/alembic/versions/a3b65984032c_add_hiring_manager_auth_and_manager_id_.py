"""add_hiring_manager_auth_and_manager_id_fks

Revision ID: a3b65984032c
Revises: 10cc8f4d389e
Create Date: 2026-04-11 21:12:15.295840

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3b65984032c'
down_revision: Union[str, Sequence[str], None] = '10cc8f4d389e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_sqlite():
    return op.get_bind().dialect.name == 'sqlite'


def upgrade() -> None:
    # ── New auth tables ───────────────────────────────────────────────────────
    op.create_table(
        'hiring_managers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('email', sa.String(length=200), nullable=False),
        sa.Column('password_hash', sa.String(length=256), nullable=False),
        sa.Column('company', sa.String(length=200), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_hiring_managers_email', 'hiring_managers', ['email'], unique=True)
    op.create_index('ix_hiring_managers_id', 'hiring_managers', ['id'], unique=False)

    op.create_table(
        'otp_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=200), nullable=False),
        sa.Column('code', sa.String(length=6), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_otp_codes_email', 'otp_codes', ['email'], unique=False)
    op.create_index('ix_otp_codes_id', 'otp_codes', ['id'], unique=False)

    # ── Add manager_id to existing tables (SQLite supports ADD COLUMN) ────────
    op.add_column('candidate_access', sa.Column('manager_id', sa.Integer(), nullable=True))
    op.create_index('ix_candidate_access_manager_id', 'candidate_access', ['manager_id'], unique=False)

    op.add_column('candidates', sa.Column('manager_id', sa.Integer(), nullable=True))
    op.create_index('ix_candidates_manager_id', 'candidates', ['manager_id'], unique=False)

    op.add_column('evaluations', sa.Column('manager_id', sa.Integer(), nullable=True))
    op.create_index('ix_evaluations_manager_id', 'evaluations', ['manager_id'], unique=False)

    # ── Add room/transcript columns to interviews ─────────────────────────────
    op.add_column('interviews', sa.Column('room_name', sa.String(length=200), nullable=True))
    op.add_column('interviews', sa.Column('room_config', sa.JSON(), nullable=True))
    op.add_column('interviews', sa.Column('transcript', sa.JSON(), nullable=True))
    op.create_index('ix_interviews_room_name', 'interviews', ['room_name'], unique=False)

    # ── PostgreSQL-only: foreign keys and composite unique constraint ─────────
    if not _is_sqlite():
        op.create_foreign_key('fk_candidates_manager', 'candidates', 'hiring_managers', ['manager_id'], ['id'])
        op.create_foreign_key('fk_evaluations_manager', 'evaluations', 'hiring_managers', ['manager_id'], ['id'])
        op.create_foreign_key('fk_access_manager', 'candidate_access', 'hiring_managers', ['manager_id'], ['id'])
        op.create_unique_constraint('uq_access_email_manager', 'candidate_access', ['email', 'manager_id'])
        # Drop the old unique-email index on candidate_access
        op.drop_index('ix_candidate_access_email', table_name='candidate_access')
        op.create_index('ix_candidate_access_email', 'candidate_access', ['email'], unique=False)


def downgrade() -> None:
    if not _is_sqlite():
        op.drop_constraint('uq_access_email_manager', 'candidate_access', type_='unique')
        op.drop_constraint('fk_access_manager', 'candidate_access', type_='foreignkey')
        op.drop_constraint('fk_evaluations_manager', 'evaluations', type_='foreignkey')
        op.drop_constraint('fk_candidates_manager', 'candidates', type_='foreignkey')

    op.drop_index('ix_interviews_room_name', table_name='interviews')
    op.drop_column('interviews', 'transcript')
    op.drop_column('interviews', 'room_config')
    op.drop_column('interviews', 'room_name')

    op.drop_index('ix_evaluations_manager_id', table_name='evaluations')
    op.drop_column('evaluations', 'manager_id')

    op.drop_index('ix_candidates_manager_id', table_name='candidates')
    op.drop_column('candidates', 'manager_id')

    op.drop_index('ix_candidate_access_manager_id', table_name='candidate_access')
    op.drop_column('candidate_access', 'manager_id')

    op.drop_index('ix_otp_codes_id', table_name='otp_codes')
    op.drop_index('ix_otp_codes_email', table_name='otp_codes')
    op.drop_table('otp_codes')
    op.drop_index('ix_hiring_managers_id', table_name='hiring_managers')
    op.drop_index('ix_hiring_managers_email', table_name='hiring_managers')
    op.drop_table('hiring_managers')
