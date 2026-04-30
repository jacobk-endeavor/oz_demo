"""add_user_id_to_leads

Revision ID: ab252af542dd
Revises: 6b0877a9f81a
Create Date: 2026-02-24 13:44:26.496977

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ab252af542dd'
down_revision: Union[str, Sequence[str], None] = '6b0877a9f81a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('leads', sa.Column('user_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_leads_user_id', 'leads', 'users', ['user_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_leads_user_id', 'leads', type_='foreignkey')
    op.drop_column('leads', 'user_id')
