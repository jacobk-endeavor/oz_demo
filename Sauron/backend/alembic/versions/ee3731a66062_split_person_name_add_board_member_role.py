"""split person name add board member role

Revision ID: ee3731a66062
Revises: f80baf4daf6e
Create Date: 2026-02-14 00:07:55.350022

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ee3731a66062'
down_revision: Union[str, Sequence[str], None] = 'f80baf4daf6e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add Board Member to role enum
    op.execute("ALTER TYPE role ADD VALUE IF NOT EXISTS 'BOARD_MEMBER'")

    # Add first_name and last_name as nullable first
    op.add_column('people', sa.Column('first_name', sa.String(), nullable=True))
    op.add_column('people', sa.Column('last_name', sa.String(), nullable=True))

    # Migrate data from name to first_name/last_name
    op.execute("""
        UPDATE people
        SET first_name = split_part(name, ' ', 1),
            last_name = CASE
                WHEN position(' ' in name) > 0
                THEN substring(name from position(' ' in name) + 1)
                ELSE ''
            END
    """)

    # Make NOT NULL
    op.alter_column('people', 'first_name', nullable=False)
    op.alter_column('people', 'last_name', nullable=False)

    # Drop old name column
    op.drop_column('people', 'name')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('people', sa.Column('name', sa.VARCHAR(), nullable=True))
    op.execute("UPDATE people SET name = first_name || ' ' || last_name")
    op.alter_column('people', 'name', nullable=False)
    op.drop_column('people', 'last_name')
    op.drop_column('people', 'first_name')
