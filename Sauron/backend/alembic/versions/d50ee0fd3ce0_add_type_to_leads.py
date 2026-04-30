"""add_type_to_leads

Revision ID: d50ee0fd3ce0
Revises: 00339c8d003c
Create Date: 2026-02-23 15:42:21.131363

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd50ee0fd3ce0'
down_revision: Union[str, Sequence[str], None] = '00339c8d003c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


leadtier = postgresql.ENUM('TIER_1', 'TIER_2', 'TIER_3', name='leadtier', create_type=False)


def upgrade() -> None:
    op.execute("CREATE TYPE leadtier AS ENUM ('TIER_1', 'TIER_2', 'TIER_3')")
    op.add_column('leads', sa.Column('type', leadtier, nullable=True))


def downgrade() -> None:
    op.drop_column('leads', 'type')
    op.execute("DROP TYPE leadtier")
