"""add hq_phone to lead_company_profiles

Revision ID: r1s2t3u4v5w6
Revises: q1r2s3t4u5v6
Create Date: 2026-03-07 13:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r1s2t3u4v5w6"
down_revision: Union[str, Sequence[str], None] = "q1r2s3t4u5v6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lead_company_profiles", sa.Column("hq_phone", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("lead_company_profiles", "hq_phone")
