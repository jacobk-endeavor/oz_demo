"""add_call_transcript_to_lead_actions

Revision ID: 977c6fafa987
Revises: i4d5e6f7g8h9
Create Date: 2026-02-27 20:06:53.523367

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '977c6fafa987'
down_revision: Union[str, Sequence[str], None] = 'i4d5e6f7g8h9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lead_actions', sa.Column('call_transcript', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('lead_actions', 'call_transcript')
