"""add apollo_phone_cache table

Revision ID: b1c2d3e4f5a6
Revises: a0c1d2e3f4a5
Create Date: 2026-02-26 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a0c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "apollo_phone_cache",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("apollo_person_id", sa.String, nullable=False, index=True),
        sa.Column("phone", sa.String, nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("apollo_phone_cache")
