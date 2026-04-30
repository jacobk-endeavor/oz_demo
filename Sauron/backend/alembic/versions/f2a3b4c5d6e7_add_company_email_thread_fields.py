"""add company email thread fields

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-03-11 20:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "company_emails",
        sa.Column("hubspot_thread_id", sa.String(), nullable=True),
    )
    op.add_column(
        "company_emails",
        sa.Column("hubspot_message_id", sa.String(), nullable=True),
    )
    op.add_column(
        "company_emails",
        sa.Column("hubspot_thread_summary", sa.Text(), nullable=True),
    )
    op.add_column(
        "company_emails",
        sa.Column(
            "hubspot_member_of_forwarded_subthread",
            sa.Boolean(),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_company_emails_hubspot_thread_id",
        "company_emails",
        ["hubspot_thread_id"],
        unique=False,
    )
    op.create_index(
        "ix_company_emails_hubspot_message_id",
        "company_emails",
        ["hubspot_message_id"],
        unique=False,
    )
    op.create_index(
        "ix_company_emails_thread_id_occurred_at",
        "company_emails",
        ["hubspot_thread_id", "occurred_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_company_emails_thread_id_occurred_at", table_name="company_emails")
    op.drop_index("ix_company_emails_hubspot_message_id", table_name="company_emails")
    op.drop_index("ix_company_emails_hubspot_thread_id", table_name="company_emails")

    op.drop_column("company_emails", "hubspot_member_of_forwarded_subthread")
    op.drop_column("company_emails", "hubspot_thread_summary")
    op.drop_column("company_emails", "hubspot_message_id")
    op.drop_column("company_emails", "hubspot_thread_id")
