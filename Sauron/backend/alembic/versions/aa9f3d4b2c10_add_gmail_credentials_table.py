"""add gmail credentials table

Revision ID: aa9f3d4b2c10
Revises: h3c4d5e6f7g8
Create Date: 2026-02-26 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "aa9f3d4b2c10"
down_revision: Union[str, Sequence[str], None] = "h3c4d5e6f7g8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gmail_credentials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "connection_key",
            sa.String(),
            nullable=False,
            server_default="shared",
        ),
        sa.Column("account_email", sa.String(), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("scopes", sa.Text(), nullable=True),
        sa.Column("token_expiry", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "connection_key",
            name="uq_gmail_credentials_connection_key",
        ),
    )
    op.create_index(
        op.f("ix_gmail_credentials_id"),
        "gmail_credentials",
        ["id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_gmail_credentials_id"), table_name="gmail_credentials")
    op.drop_table("gmail_credentials")
