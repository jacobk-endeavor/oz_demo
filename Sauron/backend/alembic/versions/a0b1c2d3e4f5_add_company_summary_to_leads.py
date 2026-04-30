"""add company_summary to leads

Revision ID: a0b1c2d3e4f5
Revises: c1d2e3f4a5b6
Create Date: 2026-02-25 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'a0b1c2d3e4f5'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('leads', sa.Column('company_summary', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('leads', 'company_summary')
