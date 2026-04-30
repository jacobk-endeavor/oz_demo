"""add cancelled_at to meetings

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6, a7b8c9d0e1f2, b8e9a5d2c4f1
Create Date: 2026-02-20 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = (
    "a1b2c3d4e5f6",
    "a7b8c9d0e1f2",
    "b8e9a5d2c4f1",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_meetings_cancelled_at", "meetings", ["cancelled_at"])


def downgrade() -> None:
    op.drop_index("ix_meetings_cancelled_at", table_name="meetings")
    op.drop_column("meetings", "cancelled_at")
