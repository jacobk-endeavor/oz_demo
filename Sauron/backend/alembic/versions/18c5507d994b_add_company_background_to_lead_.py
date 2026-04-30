"""add company_background to lead_strategic_contexts

Revision ID: 18c5507d994b
Revises: 30107e0ed336
Create Date: 2026-02-25 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '18c5507d994b'
down_revision: Union[str, Sequence[str], None] = '30107e0ed336'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lead_strategic_contexts', sa.Column('company_background', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('lead_strategic_contexts', 'company_background')
