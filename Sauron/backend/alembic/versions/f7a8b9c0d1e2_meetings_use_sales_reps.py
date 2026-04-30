"""meetings use sales_reps instead of users

Revision ID: f7a8b9c0d1e2
Revises: 5c8d71cd181e
Create Date: 2026-02-17 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = '5c8d71cd181e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create meeting_sales_rep junction table
    op.create_table(
        'meeting_sales_rep',
        sa.Column('meeting_id', sa.Integer(), sa.ForeignKey('meetings.id'), primary_key=True),
        sa.Column('sales_rep_id', sa.Integer(), sa.ForeignKey('sales_reps.id'), primary_key=True),
    )

    # 2. Create meeting_recording_sales_rep junction table
    op.create_table(
        'meeting_recording_sales_rep',
        sa.Column('meeting_recording_id', sa.Integer(), sa.ForeignKey('meeting_recordings.id'), primary_key=True),
        sa.Column('sales_rep_id', sa.Integer(), sa.ForeignKey('sales_reps.id'), primary_key=True),
    )

    # 3. Migrate data from meeting_user -> meeting_sales_rep
    op.execute(
        """
        INSERT INTO meeting_sales_rep (meeting_id, sales_rep_id)
        SELECT mu.meeting_id, sr.id
        FROM meeting_user mu
        JOIN users u ON u.id = mu.user_id
        JOIN sales_reps sr ON lower(sr.email) = lower(u.email)
        ON CONFLICT DO NOTHING
        """
    )

    # 4. Migrate data from meeting_recording_user -> meeting_recording_sales_rep
    op.execute(
        """
        INSERT INTO meeting_recording_sales_rep (meeting_recording_id, sales_rep_id)
        SELECT mru.meeting_recording_id, sr.id
        FROM meeting_recording_user mru
        JOIN users u ON u.id = mru.user_id
        JOIN sales_reps sr ON lower(sr.email) = lower(u.email)
        ON CONFLICT DO NOTHING
        """
    )

    # 5. Drop old junction tables
    op.drop_table('meeting_user')
    op.drop_table('meeting_recording_user')


def downgrade() -> None:
    # 1. Recreate old junction tables
    op.create_table(
        'meeting_user',
        sa.Column('meeting_id', sa.Integer(), sa.ForeignKey('meetings.id'), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), primary_key=True),
    )
    op.create_table(
        'meeting_recording_user',
        sa.Column('meeting_recording_id', sa.Integer(), sa.ForeignKey('meeting_recordings.id'), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), primary_key=True),
    )

    # 2. Migrate data back
    op.execute(
        """
        INSERT INTO meeting_user (meeting_id, user_id)
        SELECT msr.meeting_id, u.id
        FROM meeting_sales_rep msr
        JOIN sales_reps sr ON sr.id = msr.sales_rep_id
        JOIN users u ON lower(u.email) = lower(sr.email)
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO meeting_recording_user (meeting_recording_id, user_id)
        SELECT mrsr.meeting_recording_id, u.id
        FROM meeting_recording_sales_rep mrsr
        JOIN sales_reps sr ON sr.id = mrsr.sales_rep_id
        JOIN users u ON lower(u.email) = lower(sr.email)
        ON CONFLICT DO NOTHING
        """
    )

    # 3. Drop new junction tables
    op.drop_table('meeting_sales_rep')
    op.drop_table('meeting_recording_sales_rep')
