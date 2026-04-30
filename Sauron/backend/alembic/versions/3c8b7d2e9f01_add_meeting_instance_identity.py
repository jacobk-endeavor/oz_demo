"""add meeting instance identity

Revision ID: 3c8b7d2e9f01
Revises: 9d1c6e9a44bb
Create Date: 2026-02-17 11:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3c8b7d2e9f01"
down_revision: Union[str, Sequence[str], None] = "9d1c6e9a44bb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("meetings", sa.Column("instance_uid", sa.String(), nullable=True))
    op.add_column("meetings", sa.Column("recurrence_id", sa.String(), nullable=True))

    # Existing rows were keyed by external_uid. Seed the new instance identity
    # from that value before enforcing NOT NULL + uniqueness.
    op.execute("UPDATE meetings SET instance_uid = external_uid WHERE instance_uid IS NULL")

    op.drop_index(op.f("ix_meetings_external_uid"), table_name="meetings")
    op.create_index(op.f("ix_meetings_external_uid"), "meetings", ["external_uid"], unique=False)
    op.create_index(op.f("ix_meetings_instance_uid"), "meetings", ["instance_uid"], unique=True)

    op.alter_column("meetings", "instance_uid", nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_meetings_instance_uid"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_external_uid"), table_name="meetings")
    op.create_index(op.f("ix_meetings_external_uid"), "meetings", ["external_uid"], unique=True)

    op.drop_column("meetings", "recurrence_id")
    op.drop_column("meetings", "instance_uid")
