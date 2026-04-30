"""add lead_contacts table

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6a7
Create Date: 2026-02-25 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b9"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lead_contacts",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "lead_id",
            sa.Integer,
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("first_name", sa.String, nullable=False),
        sa.Column("last_name", sa.String, nullable=True),
        sa.Column("email", sa.String, nullable=True),
        sa.Column("phone", sa.String, nullable=True),
        sa.Column("title", sa.String, nullable=True),
    )
    op.create_index("ix_lead_contacts_lead_id", "lead_contacts", ["lead_id"])


def downgrade() -> None:
    op.drop_index("ix_lead_contacts_lead_id", table_name="lead_contacts")
    op.drop_table("lead_contacts")
