"""convert meeting owner to meeting users

Revision ID: 2f3d4a9c1b7e
Revises: 764eb343f1ee
Create Date: 2026-02-16 15:10:00.000000

"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "2f3d4a9c1b7e"
down_revision: Union[str, Sequence[str], None] = "764eb343f1ee"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    This revision is intentionally a no-op.

    The canonical schema before and after this revision uses `meeting_user`
    links and does not include `meetings.owner_user_id`.
    """
    pass


def downgrade() -> None:
    """Downgrade schema.

    Intentionally a no-op so downgrading from this revision lands on the same
    schema shape expected by `764eb343f1ee`.
    """
    pass
