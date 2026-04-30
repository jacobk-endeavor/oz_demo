"""add contact summary and experience table

Revision ID: 5f53d7ceadf1
Revises: d4e5f6a7b8c0
Create Date: 2026-02-25 14:15:52.428404

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '5f53d7ceadf1'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('contact_experiences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('contact_id', sa.Integer(), nullable=False),
        sa.Column('company', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('start_date', sa.String(), nullable=True),
        sa.Column('end_date', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['contact_id'], ['lead_contacts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_contact_experiences_id'), 'contact_experiences', ['id'], unique=False)
    op.add_column('lead_contacts', sa.Column('summary', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('lead_contacts', 'summary')
    op.drop_index(op.f('ix_contact_experiences_id'), table_name='contact_experiences')
    op.drop_table('contact_experiences')
