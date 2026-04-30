"""rename_num_users_to_num_erp_users

Revision ID: 6b0877a9f81a
Revises: d50ee0fd3ce0
Create Date: 2026-02-24 13:42:38.665275

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '6b0877a9f81a'
down_revision: Union[str, Sequence[str], None] = 'd50ee0fd3ce0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('leads', 'num_users', new_column_name='num_erp_users')


def downgrade() -> None:
    op.alter_column('leads', 'num_erp_users', new_column_name='num_users')
