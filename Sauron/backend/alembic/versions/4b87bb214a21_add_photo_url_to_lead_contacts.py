"""add photo_url to lead_contacts

Revision ID: 4b87bb214a21
Revises: 5f53d7ceadf1
Create Date: 2026-02-25 14:17:19.177840

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b87bb214a21'
down_revision: Union[str, Sequence[str], None] = '5f53d7ceadf1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('lead_contacts', sa.Column('photo_url', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('lead_contacts', 'photo_url')
