"""add summary to companies

Revision ID: e9b2d1f4a6c7
Revises: 6c1f8a2b4d9e
Create Date: 2026-02-18 12:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e9b2d1f4a6c7"
down_revision: Union[str, Sequence[str], None] = "6c1f8a2b4d9e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("companies", sa.Column("summary", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("companies", "summary")
