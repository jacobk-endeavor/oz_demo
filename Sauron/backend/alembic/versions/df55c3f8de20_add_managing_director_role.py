"""add managing director role

Revision ID: df55c3f8de20
Revises: 35740be99bf1
Create Date: 2026-02-14 01:05:35.316590

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'df55c3f8de20'
down_revision: Union[str, Sequence[str], None] = '35740be99bf1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TYPE role ADD VALUE IF NOT EXISTS 'Managing Director'")


def downgrade() -> None:
    """Downgrade schema."""
    pass
