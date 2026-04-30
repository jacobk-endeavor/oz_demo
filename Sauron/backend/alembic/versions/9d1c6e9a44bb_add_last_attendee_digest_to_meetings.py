"""add last attendee digest to meetings

Revision ID: 9d1c6e9a44bb
Revises: 2f3d4a9c1b7e
Create Date: 2026-02-16 17:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9d1c6e9a44bb"
down_revision: Union[str, Sequence[str], None] = "2f3d4a9c1b7e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("meetings", sa.Column("last_attendee_digest", sa.String(length=64), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("meetings", "last_attendee_digest")
