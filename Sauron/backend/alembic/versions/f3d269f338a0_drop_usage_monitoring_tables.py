"""drop usage monitoring tables

Revision ID: f3d269f338a0
Revises: 6f8e7d6c5b4a
Create Date: 2026-04-11 13:00:14.701896

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f3d269f338a0'
down_revision: Union[str, Sequence[str], None] = '6f8e7d6c5b4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("DROP TABLE IF EXISTS order_status_history CASCADE")
    op.execute("DROP TABLE IF EXISTS order_line_item CASCADE")
    op.execute('DROP TABLE IF EXISTS "order" CASCADE')
    op.execute("DROP TABLE IF EXISTS hub_organization CASCADE")


def downgrade() -> None:
    """Downgrade schema."""
    # This migration intentionally does not recreate the removed usage-monitoring
    # tables because dropping them is destructive and the app no longer uses them.
    pass
