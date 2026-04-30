"""add hq_address and employee_count to lead_company_profiles

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-02-26 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lead_company_profiles", sa.Column("hq_address", sa.String(), nullable=True))
    op.add_column("lead_company_profiles", sa.Column("employee_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("lead_company_profiles", "employee_count")
    op.drop_column("lead_company_profiles", "hq_address")
