"""initial_schema

Revision ID: 10cc8f4d389e
Revises:
Create Date: 2026-04-11 21:04:36.978867

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '10cc8f4d389e'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'candidates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('email', sa.String(length=200), nullable=True),
        sa.Column('file_name', sa.String(length=500), nullable=True),
        sa.Column('file_hash', sa.String(length=64), nullable=True),
        sa.Column('is_resume', sa.Boolean(), nullable=True),
        sa.Column('raw_text', sa.Text(), nullable=True),
        sa.Column('full_text', sa.Text(), nullable=True),
        sa.Column('predicted_role', sa.String(length=200), nullable=True),
        sa.Column('experience_level', sa.String(length=50), nullable=True),
        sa.Column('total_experience_years', sa.Float(), nullable=True),
        sa.Column('location', sa.String(length=200), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('skills', sa.JSON(), nullable=True),
        sa.Column('work_experience', sa.JSON(), nullable=True),
        sa.Column('education', sa.JSON(), nullable=True),
        sa.Column('key_strengths', sa.JSON(), nullable=True),
        sa.Column('badges', sa.JSON(), nullable=True),
        sa.Column('embedded_links', sa.JSON(), nullable=True),
        sa.Column('enriched_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_candidates_id', 'candidates', ['id'], unique=False)

    op.create_table(
        'evaluations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('candidate_id', sa.Integer(), sa.ForeignKey('candidates.id'), nullable=False),
        sa.Column('role', sa.String(length=200), nullable=True),
        sa.Column('level', sa.String(length=50), nullable=True),
        sa.Column('job_description', sa.Text(), nullable=True),
        sa.Column('report', sa.Text(), nullable=True),
        sa.Column('score', sa.Integer(), nullable=True),
        sa.Column('recommendation', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_evaluations_id', 'evaluations', ['id'], unique=False)

    op.create_table(
        'interviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('candidate_id', sa.Integer(), sa.ForeignKey('candidates.id'), nullable=False),
        sa.Column('candidate_email', sa.String(length=200), nullable=False),
        sa.Column('role', sa.String(length=200), nullable=True),
        sa.Column('level', sa.String(length=50), nullable=True),
        sa.Column('experience_required', sa.String(length=50), nullable=True),
        sa.Column('num_questions', sa.Integer(), nullable=True),
        sa.Column('focus_areas', sa.JSON(), nullable=True),
        sa.Column('questions', sa.JSON(), nullable=True),
        sa.Column('answers', sa.JSON(), nullable=True),
        sa.Column('scores', sa.JSON(), nullable=True),
        sa.Column('report', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('duration', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_interviews_id', 'interviews', ['id'], unique=False)
    op.create_index('ix_interviews_candidate_email', 'interviews', ['candidate_email'], unique=False)

    op.create_table(
        'candidate_access',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=200), nullable=True),
        sa.Column('candidate_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('granted_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_candidate_access_id', 'candidate_access', ['id'], unique=False)
    op.create_index('ix_candidate_access_email', 'candidate_access', ['email'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_candidate_access_email', table_name='candidate_access')
    op.drop_index('ix_candidate_access_id', table_name='candidate_access')
    op.drop_table('candidate_access')
    op.drop_index('ix_interviews_candidate_email', table_name='interviews')
    op.drop_index('ix_interviews_id', table_name='interviews')
    op.drop_table('interviews')
    op.drop_index('ix_evaluations_id', table_name='evaluations')
    op.drop_table('evaluations')
    op.drop_index('ix_candidates_id', table_name='candidates')
    op.drop_table('candidates')
