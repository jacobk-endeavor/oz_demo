"""make meeting_recording meeting_id nullable again

Revision ID: 4e7f6a8b9c0d
Revises: d4e5f6a7b8c9
Create Date: 2026-02-18 17:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4e7f6a8b9c0d"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "meeting_recordings",
        "meeting_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "meeting_recordings",
        "meeting_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
