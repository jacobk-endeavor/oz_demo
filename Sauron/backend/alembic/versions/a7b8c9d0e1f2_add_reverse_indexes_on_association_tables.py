"""add reverse indexes on association tables

Revision ID: a7b8c9d0e1f2
Revises: 2b4c6d8e0f1a
Create Date: 2026-02-20 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "2b4c6d8e0f1a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_meeting_sales_rep_sales_rep_id",
        "meeting_sales_rep",
        ["sales_rep_id"],
    )
    op.create_index(
        "ix_meeting_company_company_id",
        "meeting_company",
        ["company_id"],
    )
    op.create_index(
        "ix_meeting_recording_sales_rep_sales_rep_id",
        "meeting_recording_sales_rep",
        ["sales_rep_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_meeting_recording_sales_rep_sales_rep_id", table_name="meeting_recording_sales_rep")
    op.drop_index("ix_meeting_company_company_id", table_name="meeting_company")
    op.drop_index("ix_meeting_sales_rep_sales_rep_id", table_name="meeting_sales_rep")
