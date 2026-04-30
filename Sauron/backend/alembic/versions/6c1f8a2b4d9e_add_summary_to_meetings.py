"""add summary to meetings

Revision ID: 6c1f8a2b4d9e
Revises: 4e7f6a8b9c0d
Create Date: 2026-02-18 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6c1f8a2b4d9e"
down_revision: Union[str, Sequence[str], None] = "4e7f6a8b9c0d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("meetings", sa.Column("summary", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("meetings", "summary")
