"""add hq_timezone to lead_company_profiles

Revision ID: l7m8n9o0p1q2
Revises: k6l7m8n9o0p1
Create Date: 2026-03-02 12:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l7m8n9o0p1q2"
down_revision: Union[str, Sequence[str], None] = "k6l7m8n9o0p1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lead_company_profiles", sa.Column("hq_timezone", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("lead_company_profiles", "hq_timezone")
