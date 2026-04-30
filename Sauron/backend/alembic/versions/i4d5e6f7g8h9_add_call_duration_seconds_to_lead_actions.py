"""add call_duration_seconds to lead_actions

Revision ID: i4d5e6f7g8h9
Revises: h3c4d5e6f7g8
Create Date: 2026-02-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'i4d5e6f7g8h9'
down_revision: Union[str, Sequence[str], None] = 'h3c4d5e6f7g8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lead_actions', sa.Column('call_duration_seconds', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('lead_actions', 'call_duration_seconds')
