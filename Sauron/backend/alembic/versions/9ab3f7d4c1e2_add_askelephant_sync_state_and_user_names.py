"""add askelephant sync state and user names

Revision ID: 9ab3f7d4c1e2
Revises: c7a4f9d12b61
Create Date: 2026-02-14 16:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9ab3f7d4c1e2"
down_revision: Union[str, Sequence[str], None] = "c7a4f9d12b61"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("first_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("nick_name", sa.String(), nullable=True))

    op.create_table(
        "ask_elephant_sync_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("last_successful_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source"),
    )
    op.create_index(op.f("ix_ask_elephant_sync_state_id"), "ask_elephant_sync_state", ["id"], unique=False)
    op.create_index(
        op.f("ix_ask_elephant_sync_state_source"),
        "ask_elephant_sync_state",
        ["source"],
        unique=True,
    )

    op.create_table(
        "ask_elephant_sync_failures",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("engagement_id", sa.String(), nullable=False),
        sa.Column("error", sa.Text(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("engagement_id"),
    )
    op.create_index(op.f("ix_ask_elephant_sync_failures_id"), "ask_elephant_sync_failures", ["id"], unique=False)
    op.create_index(
        op.f("ix_ask_elephant_sync_failures_engagement_id"),
        "ask_elephant_sync_failures",
        ["engagement_id"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_ask_elephant_sync_failures_engagement_id"), table_name="ask_elephant_sync_failures")
    op.drop_index(op.f("ix_ask_elephant_sync_failures_id"), table_name="ask_elephant_sync_failures")
    op.drop_table("ask_elephant_sync_failures")

    op.drop_index(op.f("ix_ask_elephant_sync_state_source"), table_name="ask_elephant_sync_state")
    op.drop_index(op.f("ix_ask_elephant_sync_state_id"), table_name="ask_elephant_sync_state")
    op.drop_table("ask_elephant_sync_state")

    op.drop_column("users", "nick_name")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
