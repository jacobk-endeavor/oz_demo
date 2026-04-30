"""rename meetings to meeting recordings

Revision ID: b8e9a5d2c4f1
Revises: 9ab3f7d4c1e2
Create Date: 2026-02-16 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b8e9a5d2c4f1"
down_revision: Union[str, Sequence[str], None] = "9ab3f7d4c1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.rename_table("meetings", "meeting_recordings")
    op.execute("ALTER INDEX ix_meetings_id RENAME TO ix_meeting_recordings_id")
    op.execute(
        "ALTER INDEX ix_meetings_engagement_id "
        "RENAME TO ix_meeting_recordings_engagement_id"
    )

    op.rename_table("meeting_company", "meeting_recording_company")
    op.alter_column(
        "meeting_recording_company",
        "meeting_id",
        new_column_name="meeting_recording_id",
    )

    op.rename_table("meeting_person", "meeting_recording_person")
    op.alter_column(
        "meeting_recording_person",
        "meeting_id",
        new_column_name="meeting_recording_id",
    )

    op.rename_table("meeting_user", "meeting_recording_user")
    op.alter_column(
        "meeting_recording_user",
        "meeting_id",
        new_column_name="meeting_recording_id",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "meeting_recording_user",
        "meeting_recording_id",
        new_column_name="meeting_id",
    )
    op.rename_table("meeting_recording_user", "meeting_user")

    op.alter_column(
        "meeting_recording_person",
        "meeting_recording_id",
        new_column_name="meeting_id",
    )
    op.rename_table("meeting_recording_person", "meeting_person")

    op.alter_column(
        "meeting_recording_company",
        "meeting_recording_id",
        new_column_name="meeting_id",
    )
    op.rename_table("meeting_recording_company", "meeting_company")

    op.execute(
        "ALTER INDEX ix_meeting_recordings_engagement_id "
        "RENAME TO ix_meetings_engagement_id"
    )
    op.execute("ALTER INDEX ix_meeting_recordings_id RENAME TO ix_meetings_id")
    op.rename_table("meeting_recordings", "meetings")
