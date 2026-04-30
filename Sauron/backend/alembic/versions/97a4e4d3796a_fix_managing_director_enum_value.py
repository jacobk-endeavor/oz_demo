"""fix managing director enum value

Revision ID: 97a4e4d3796a
Revises: df55c3f8de20
Create Date: 2026-02-14 01:27:21.192312

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '97a4e4d3796a'
down_revision: Union[str, Sequence[str], None] = 'df55c3f8de20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Postgres doesn't support ALTER TYPE RENAME VALUE, so recreate the type.
    # No rows use the bad value yet, so this is safe.
    op.execute("ALTER TYPE role RENAME TO role_old")
    op.execute(
        "CREATE TYPE role AS ENUM "
        "('CEO','CIO','CCO','COO','PRESIDENT','OTHER_C_SUITE',"
        "'VP_LEVEL','OTHER','BOARD_MEMBER','MANAGING_DIRECTOR')"
    )
    op.execute(
        "ALTER TABLE positions ALTER COLUMN role TYPE role "
        "USING role::text::role"
    )
    op.execute("DROP TYPE role_old")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TYPE role RENAME TO role_old")
    op.execute(
        "CREATE TYPE role AS ENUM "
        "('CEO','CIO','CCO','COO','PRESIDENT','OTHER_C_SUITE',"
        "'VP_LEVEL','OTHER','BOARD_MEMBER')"
    )
    op.execute(
        "ALTER TABLE positions ALTER COLUMN role TYPE role "
        "USING role::text::role"
    )
    op.execute("DROP TYPE role_old")
