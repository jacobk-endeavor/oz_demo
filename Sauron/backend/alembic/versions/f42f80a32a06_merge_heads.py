"""merge_heads

Revision ID: f42f80a32a06
Revises: 4998f75a02b3, c3d4e5f6a7b8
Create Date: 2026-02-23 15:37:11.281883

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f42f80a32a06'
down_revision: Union[str, Sequence[str], None] = ('4998f75a02b3', 'c3d4e5f6a7b8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
