"""add trigger_events to lead_strategic_contexts

Revision ID: 30107e0ed336
Revises: 715e1b263d61
Create Date: 2026-02-25 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '30107e0ed336'
down_revision: Union[str, Sequence[str], None] = '715e1b263d61'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('lead_strategic_contexts', sa.Column('trigger_events', postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('lead_strategic_contexts', 'trigger_events')
