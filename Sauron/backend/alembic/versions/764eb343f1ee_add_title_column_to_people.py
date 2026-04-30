"""add title column to people

Revision ID: 764eb343f1ee
Revises: 6d49ae353680
Create Date: 2026-02-16 13:20:42.778182

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '764eb343f1ee'
down_revision: Union[str, Sequence[str], None] = '6d49ae353680'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("people", sa.Column("title", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("people", "title")
