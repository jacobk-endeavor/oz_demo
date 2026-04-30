"""move meeting_recording FK from meetings to meeting_recordings

Revision ID: a1b2c3d4e5f6
Revises: 3c8b7d2e9f01
Create Date: 2026-02-17 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "3c8b7d2e9f01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Move the FK from meetings.meeting_recording_id to meeting_recordings.meeting_id."""
    # Add the new column on meeting_recordings
    op.add_column(
        "meeting_recordings",
        sa.Column("meeting_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_meeting_recordings_meeting_id",
        "meeting_recordings",
        "meetings",
        ["meeting_id"],
        ["id"],
    )
    op.create_index(
        op.f("ix_meeting_recordings_meeting_id"),
        "meeting_recordings",
        ["meeting_id"],
        unique=False,
    )

    # Migrate existing data: for each meetings row that has a meeting_recording_id,
    # set the corresponding meeting_recordings.meeting_id to meetings.id.
    op.execute(
        "UPDATE meeting_recordings SET meeting_id = m.id "
        "FROM meetings m WHERE m.meeting_recording_id = meeting_recordings.id"
    )

    # Drop the old column from meetings
    op.drop_index(op.f("ix_meetings_meeting_recording_id"), table_name="meetings")
    op.drop_constraint(
        "meetings_meeting_recording_id_fkey", "meetings", type_="foreignkey"
    )
    op.drop_column("meetings", "meeting_recording_id")


def downgrade() -> None:
    """Reverse: move FK back from meeting_recordings.meeting_id to meetings.meeting_recording_id."""
    # Re-add the old column on meetings
    op.add_column(
        "meetings",
        sa.Column("meeting_recording_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "meetings_meeting_recording_id_fkey",
        "meetings",
        "meeting_recordings",
        ["meeting_recording_id"],
        ["id"],
    )
    op.create_index(
        op.f("ix_meetings_meeting_recording_id"),
        "meetings",
        ["meeting_recording_id"],
        unique=False,
    )

    # Migrate data back
    op.execute(
        "UPDATE meetings SET meeting_recording_id = mr.id "
        "FROM meeting_recordings mr WHERE mr.meeting_id = meetings.id"
    )

    # Drop the new column from meeting_recordings
    op.drop_index(
        op.f("ix_meeting_recordings_meeting_id"), table_name="meeting_recordings"
    )
    op.drop_constraint(
        "fk_meeting_recordings_meeting_id",
        "meeting_recordings",
        type_="foreignkey",
    )
    op.drop_column("meeting_recordings", "meeting_id")
