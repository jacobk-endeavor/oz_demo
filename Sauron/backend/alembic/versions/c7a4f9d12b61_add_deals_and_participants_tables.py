"""add deals and participants tables

Revision ID: c7a4f9d12b61
Revises: e3c5f8ab2190
Create Date: 2026-02-14 13:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7a4f9d12b61"
down_revision: Union[str, Sequence[str], None] = "e3c5f8ab2190"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    deal_status_enum = sa.Enum("NEW_LEAD", "OPEN", "CLOSED", "DEAD", name="dealstatus")

    op.create_table(
        "deals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=True),
        sa.Column("status", deal_status_enum, nullable=False),
        sa.Column("estimated_arr", sa.Float(), nullable=True),
        sa.Column("point_of_contact_id", sa.Integer(), nullable=True),
        sa.Column("objections", sa.Text(), nullable=True),
        sa.Column("risks", sa.Text(), nullable=True),
        sa.Column("key_factors", sa.Text(), nullable=True),
        sa.Column("lean_into", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["point_of_contact_id"], ["people.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_deals_id"), "deals", ["id"], unique=False)

    op.create_table(
        "deal_participants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("deal_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"]),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("deal_id", "person_id", name="uq_deal_participants_deal_person"),
    )
    op.create_index(op.f("ix_deal_participants_id"), "deal_participants", ["id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_deal_participants_id"), table_name="deal_participants")
    op.drop_table("deal_participants")
    op.drop_index(op.f("ix_deals_id"), table_name="deals")
    op.drop_table("deals")

    deal_status_enum = sa.Enum("NEW_LEAD", "OPEN", "CLOSED", "DEAD", name="dealstatus")
    deal_status_enum.drop(op.get_bind(), checkfirst=True)
