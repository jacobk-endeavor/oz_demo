"""add social media columns to lead_contacts

Revision ID: e5f6a7b8c9d0
Revises: c2d3e4f5a6b7
Create Date: 2026-02-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lead_contacts', sa.Column('facebook_url', sa.String(), nullable=True))
    op.add_column('lead_contacts', sa.Column('instagram_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('lead_contacts', 'instagram_url')
    op.drop_column('lead_contacts', 'facebook_url')
