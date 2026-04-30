"""add competitor enum to companies

Revision ID: f80baf4daf6e
Revises: d0a3e9179143
Create Date: 2026-02-13 22:35:53.975116

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f80baf4daf6e'
down_revision: Union[str, Sequence[str], None] = 'd0a3e9179143'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    competitor_enum = sa.Enum('CANALS', 'CONEXIOM', 'REVALGO', name='competitor')
    competitor_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('companies', sa.Column('competitor', competitor_enum, nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('companies', 'competitor')
    sa.Enum(name='competitor').drop(op.get_bind(), checkfirst=True)
