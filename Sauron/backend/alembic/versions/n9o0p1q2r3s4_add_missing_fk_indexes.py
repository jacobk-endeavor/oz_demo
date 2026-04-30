"""add missing fk indexes for company detail query

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-03-04 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "n9o0p1q2r3s4"
down_revision: Union[str, Sequence[str], None] = "m8n9o0p1q2r3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_meeting_person_person_id",
        "meeting_person",
        ["person_id"],
    )
    op.create_index(
        "ix_positions_company_id",
        "positions",
        ["company_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_positions_company_id", table_name="positions")
    op.drop_index("ix_meeting_person_person_id", table_name="meeting_person")
