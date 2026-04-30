"""meeting_recording meeting_id not null

Revision ID: a2b3c4d5e6f7
Revises: f7a8b9c0d1e2
Create Date: 2026-02-17 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DELETE FROM meeting_recording_sales_rep
        WHERE meeting_recording_id IN (
            SELECT id FROM meeting_recordings WHERE meeting_id IS NULL
        )
    """)
    op.execute("""
        DELETE FROM meeting_recording_person
        WHERE meeting_recording_id IN (
            SELECT id FROM meeting_recordings WHERE meeting_id IS NULL
        )
    """)
    op.execute("""
        DELETE FROM meeting_recording_company
        WHERE meeting_recording_id IN (
            SELECT id FROM meeting_recordings WHERE meeting_id IS NULL
        )
    """)
    op.execute("DELETE FROM meeting_recordings WHERE meeting_id IS NULL")
    op.alter_column(
        'meeting_recordings',
        'meeting_id',
        existing_type=sa.Integer(),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'meeting_recordings',
        'meeting_id',
        existing_type=sa.Integer(),
        nullable=True,
    )
