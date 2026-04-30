"""add email_read_status table and drop is_read from lead_emails

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-02-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j5k6l7m8n9o0"
down_revision: Union[str, Sequence[str], None] = "i4j5k6l7m8n9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_read_status",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lead_email_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["lead_email_id"], ["lead_emails.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lead_email_id", "user_id", name="uq_email_read_status_email_user"),
    )
    op.create_index(op.f("ix_email_read_status_id"), "email_read_status", ["id"], unique=False)
    op.create_index(op.f("ix_email_read_status_lead_email_id"), "email_read_status", ["lead_email_id"], unique=False)
    op.create_index(op.f("ix_email_read_status_user_id"), "email_read_status", ["user_id"], unique=False)

    op.drop_column("lead_emails", "is_read")


def downgrade() -> None:
    op.add_column(
        "lead_emails",
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.drop_index(op.f("ix_email_read_status_user_id"), table_name="email_read_status")
    op.drop_index(op.f("ix_email_read_status_lead_email_id"), table_name="email_read_status")
    op.drop_index(op.f("ix_email_read_status_id"), table_name="email_read_status")
    op.drop_table("email_read_status")
