"""merge_heads

Revision ID: k6l7m8n9o0p1
Revises: j5e6f7g8h9i0, j5k6l7m8n9o0
Create Date: 2026-03-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k6l7m8n9o0p1"
down_revision: Union[str, Sequence[str], None] = ("j5e6f7g8h9i0", "j5k6l7m8n9o0")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
