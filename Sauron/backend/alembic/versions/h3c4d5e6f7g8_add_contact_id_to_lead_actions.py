"""add contact_id to lead_actions

Revision ID: h3c4d5e6f7g8
Revises: g2b3c4d5e6f7
Create Date: 2026-02-26 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h3c4d5e6f7g8'
down_revision: Union[str, Sequence[str], None] = 'g2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lead_actions', sa.Column('contact_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_lead_actions_contact_id',
        'lead_actions', 'lead_contacts',
        ['contact_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_lead_actions_contact_id', 'lead_actions', type_='foreignkey')
    op.drop_column('lead_actions', 'contact_id')
