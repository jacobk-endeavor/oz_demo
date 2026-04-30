"""add color to users

Revision ID: c1d2e3f4a5b6
Revises: ab252af542dd
Create Date: 2026-02-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'ab252af542dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('color', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'color')
