"""add lead_strategic_contexts table

Revision ID: 6a774b3492c2
Revises: 4b87bb214a21
Create Date: 2026-02-25 15:14:42.173872

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6a774b3492c2'
down_revision: Union[str, Sequence[str], None] = '4b87bb214a21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('lead_strategic_contexts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('lead_id', sa.Integer(), nullable=False),
        sa.Column('recent_initiatives', sa.String(), nullable=True),
        sa.Column('public_priorities', sa.String(), nullable=True),
        sa.Column('operational_changes', sa.String(), nullable=True),
        sa.Column('workflow_modernization_signals', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['lead_id'], ['leads.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('lead_id')
    )
    op.create_index(op.f('ix_lead_strategic_contexts_id'), 'lead_strategic_contexts', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_lead_strategic_contexts_id'), table_name='lead_strategic_contexts')
    op.drop_table('lead_strategic_contexts')
