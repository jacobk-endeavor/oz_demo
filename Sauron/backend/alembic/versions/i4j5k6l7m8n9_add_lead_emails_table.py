"""add lead_emails table and last_history_id to gmail_credentials

Revision ID: i4j5k6l7m8n9
Revises: aa9f3d4b2c10
Create Date: 2026-02-26 23:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i4j5k6l7m8n9"
down_revision: Union[str, Sequence[str], None] = "aa9f3d4b2c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lead_emails",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=False),
        sa.Column("contact_id", sa.Integer(), nullable=True),
        sa.Column("lead_action_id", sa.Integer(), nullable=True),
        sa.Column("sent_by_user_id", sa.Integer(), nullable=True),
        sa.Column("gmail_message_id", sa.String(), nullable=False),
        sa.Column("gmail_thread_id", sa.String(), nullable=True),
        sa.Column(
            "direction",
            sa.Enum("sent", "received", name="emaildirection", create_constraint=False),
            nullable=False,
        ),
        sa.Column("from_email", sa.String(), nullable=False),
        sa.Column("to_email", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=False, server_default=""),
        sa.Column("body_plain", sa.Text(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["lead_contacts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["lead_action_id"], ["lead_actions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sent_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gmail_message_id", name="uq_lead_emails_gmail_message_id"),
    )
    op.create_index(op.f("ix_lead_emails_id"), "lead_emails", ["id"], unique=False)
    op.create_index(op.f("ix_lead_emails_lead_id"), "lead_emails", ["lead_id"], unique=False)
    op.create_index(op.f("ix_lead_emails_gmail_thread_id"), "lead_emails", ["gmail_thread_id"], unique=False)

    op.add_column(
        "gmail_credentials",
        sa.Column("last_history_id", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("gmail_credentials", "last_history_id")
    op.drop_index(op.f("ix_lead_emails_gmail_thread_id"), table_name="lead_emails")
    op.drop_index(op.f("ix_lead_emails_lead_id"), table_name="lead_emails")
    op.drop_index(op.f("ix_lead_emails_id"), table_name="lead_emails")
    op.drop_table("lead_emails")
    sa.Enum(name="emaildirection").drop(op.get_bind(), checkfirst=True)
