"""add source columns to lead_strategic_contexts

Revision ID: 715e1b263d61
Revises: 6a774b3492c2
Create Date: 2026-02-25 15:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '715e1b263d61'
down_revision: Union[str, Sequence[str], None] = '6a774b3492c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('lead_strategic_contexts', sa.Column('recent_initiatives_sources', postgresql.JSONB(), nullable=True))
    op.add_column('lead_strategic_contexts', sa.Column('public_priorities_sources', postgresql.JSONB(), nullable=True))
    op.add_column('lead_strategic_contexts', sa.Column('operational_changes_sources', postgresql.JSONB(), nullable=True))
    op.add_column('lead_strategic_contexts', sa.Column('workflow_modernization_signals_sources', postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('lead_strategic_contexts', 'workflow_modernization_signals_sources')
    op.drop_column('lead_strategic_contexts', 'operational_changes_sources')
    op.drop_column('lead_strategic_contexts', 'public_priorities_sources')
    op.drop_column('lead_strategic_contexts', 'recent_initiatives_sources')
