"""add company email tables

Revision ID: e1f2a3b4c5d6
Revises: c4d5e6f7a8b9, u6v7w8x9y0z1
Create Date: 2026-03-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = ("c4d5e6f7a8b9", "u6v7w8x9y0z1")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "company_email_sync_state",
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("last_modified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_successful_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("provider"),
    )
    op.create_index(
        "ix_company_email_sync_state_last_modified_at",
        "company_email_sync_state",
        ["last_modified_at"],
        unique=False,
    )

    op.create_table(
        "company_emails",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("hubspot_email_id", sa.String(), nullable=False),
        sa.Column("hubspot_owner_id", sa.String(), nullable=True),
        sa.Column("owner_sales_rep_id", sa.Integer(), nullable=True),
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "direction",
            postgresql.ENUM(
                "sent",
                "received",
                name="emaildirection",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("hubspot_direction", sa.String(), nullable=True),
        sa.Column("hubspot_status", sa.String(), nullable=True),
        sa.Column("subject", sa.String(), nullable=False, server_default=""),
        sa.Column("body_preview", sa.Text(), nullable=True),
        sa.Column("from_email", sa.String(), nullable=True),
        sa.Column(
            "to_emails",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "cc_emails",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "bcc_emails",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "participant_emails",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("hubspot_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hubspot_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hubspot_url", sa.String(), nullable=True),
        sa.Column(
            "raw_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["owner_sales_rep_id"], ["sales_reps.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("hubspot_email_id", name="uq_company_emails_hubspot_email_id"),
    )
    op.create_index(op.f("ix_company_emails_id"), "company_emails", ["id"], unique=False)
    op.create_index(
        op.f("ix_company_emails_hubspot_owner_id"),
        "company_emails",
        ["hubspot_owner_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_company_emails_owner_sales_rep_id"),
        "company_emails",
        ["owner_sales_rep_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_company_emails_owner_user_id"),
        "company_emails",
        ["owner_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_company_emails_occurred_at"),
        "company_emails",
        ["occurred_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_company_emails_hubspot_updated_at"),
        "company_emails",
        ["hubspot_updated_at"],
        unique=False,
    )

    op.create_table(
        "company_email_companies",
        sa.Column("company_email_id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["company_email_id"], ["company_emails.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("company_email_id", "company_id"),
    )
    op.create_index(
        "ix_company_email_companies_company_id_email_id",
        "company_email_companies",
        ["company_id", "company_email_id"],
        unique=False,
    )

    op.create_table(
        "company_email_users",
        sa.Column("company_email_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["company_email_id"], ["company_emails.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("company_email_id", "user_id"),
    )
    op.create_index(
        "ix_company_email_users_user_id_email_id",
        "company_email_users",
        ["user_id", "company_email_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_company_email_users_user_id_email_id", table_name="company_email_users")
    op.drop_table("company_email_users")

    op.drop_index("ix_company_email_companies_company_id_email_id", table_name="company_email_companies")
    op.drop_table("company_email_companies")

    op.drop_index(op.f("ix_company_emails_hubspot_updated_at"), table_name="company_emails")
    op.drop_index(op.f("ix_company_emails_occurred_at"), table_name="company_emails")
    op.drop_index(op.f("ix_company_emails_owner_user_id"), table_name="company_emails")
    op.drop_index(op.f("ix_company_emails_owner_sales_rep_id"), table_name="company_emails")
    op.drop_index(op.f("ix_company_emails_hubspot_owner_id"), table_name="company_emails")
    op.drop_index(op.f("ix_company_emails_id"), table_name="company_emails")
    op.drop_table("company_emails")

    op.drop_index(
        "ix_company_email_sync_state_last_modified_at",
        table_name="company_email_sync_state",
    )
    op.drop_table("company_email_sync_state")
