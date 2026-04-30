"""add lead_actions table

Revision ID: g2b3c4d5e6f7
Revises: e5f6a7b8c9d0
Create Date: 2026-02-26 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g2b3c4d5e6f7'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'lead_actions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('lead_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('category', sa.Enum('call', 'email', 'meeting', 'note', 'site_visit', 'other', name='actioncategory', create_constraint=False), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('occurred_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['lead_id'], ['leads.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_lead_actions_id'), 'lead_actions', ['id'], unique=False)
    op.create_index(op.f('ix_lead_actions_lead_id'), 'lead_actions', ['lead_id'], unique=False)
    op.create_index(op.f('ix_lead_actions_user_id'), 'lead_actions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_lead_actions_user_id'), table_name='lead_actions')
    op.drop_index(op.f('ix_lead_actions_lead_id'), table_name='lead_actions')
    op.drop_index(op.f('ix_lead_actions_id'), table_name='lead_actions')
    op.drop_table('lead_actions')
    sa.Enum(name='actioncategory').drop(op.get_bind(), checkfirst=True)
