"""add apollo_person_id to lead_contacts

Revision ID: a0c1d2e3f4a5
Revises: 30107e0ed336
Create Date: 2026-02-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a0c1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = "18c5507d994b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lead_contacts", sa.Column("apollo_person_id", sa.String, nullable=True))
    op.create_index("ix_lead_contacts_apollo_person_id", "lead_contacts", ["apollo_person_id"])


def downgrade() -> None:
    op.drop_index("ix_lead_contacts_apollo_person_id", table_name="lead_contacts")
    op.drop_column("lead_contacts", "apollo_person_id")
