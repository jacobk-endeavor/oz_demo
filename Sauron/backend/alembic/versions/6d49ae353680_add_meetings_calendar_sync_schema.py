"""add meetings calendar sync schema

Revision ID: 6d49ae353680
Revises: b8e9a5d2c4f1
Create Date: 2026-02-16 13:02:24.710889

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6d49ae353680'
down_revision: Union[str, Sequence[str], None] = 'b8e9a5d2c4f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "meetings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("external_uid", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("meeting_url", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column(
            "revision_history",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
        sa.Column("last_revision_sequence", sa.Integer(), nullable=True),
        sa.Column(
            "last_synced_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("meeting_recording_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["meeting_recording_id"], ["meeting_recordings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_meetings_id"), "meetings", ["id"], unique=False)
    op.create_index(op.f("ix_meetings_external_uid"), "meetings", ["external_uid"], unique=True)
    op.create_index(
        op.f("ix_meetings_meeting_recording_id"),
        "meetings",
        ["meeting_recording_id"],
        unique=False,
    )

    op.create_table(
        "meeting_company",
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"]),
        sa.PrimaryKeyConstraint("meeting_id", "company_id"),
    )
    op.create_table(
        "meeting_person",
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"]),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"]),
        sa.PrimaryKeyConstraint("meeting_id", "person_id"),
    )
    op.create_table(
        "meeting_user",
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("meeting_id", "user_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("meeting_user")
    op.drop_table("meeting_person")
    op.drop_table("meeting_company")
    op.drop_index(op.f("ix_meetings_meeting_recording_id"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_external_uid"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_id"), table_name="meetings")
    op.drop_table("meetings")
