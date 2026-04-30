"""add linkedin_url, likely_kpis, timestamps to lead_contacts

Revision ID: d4e5f6a7b8c0
Revises: c3d4e5f6a7b9
Create Date: 2026-02-25 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "d4e5f6a7b8c0"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lead_contacts", sa.Column("linkedin_url", sa.String, nullable=True))
    op.add_column("lead_contacts", sa.Column("likely_kpis", JSONB, nullable=True))
    op.add_column("lead_contacts", sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.add_column("lead_contacts", sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))


def downgrade() -> None:
    op.drop_column("lead_contacts", "updated_at")
    op.drop_column("lead_contacts", "created_at")
    op.drop_column("lead_contacts", "likely_kpis")
    op.drop_column("lead_contacts", "linkedin_url")
