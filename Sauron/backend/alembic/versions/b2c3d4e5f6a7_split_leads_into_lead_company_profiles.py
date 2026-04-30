"""split leads into lead_company_profiles

Revision ID: b2c3d4e5f6a7
Revises: a0b1c2d3e4f5
Create Date: 2026-02-25 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a0b1c2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PROFILE_COLUMNS = [
    "erp", "num_erp_users", "num_locations",
    "primary_buying_group", "other_buying_group", "associations",
    "primary_industry", "secondary_industry", "revenue_m",
    "type", "company_summary",
]


def upgrade() -> None:
    op.execute("""
        CREATE TABLE lead_company_profiles (
            id SERIAL PRIMARY KEY,
            lead_id INTEGER NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
            erp erp,
            num_erp_users INTEGER,
            num_locations INTEGER,
            primary_buying_group VARCHAR,
            other_buying_group VARCHAR,
            associations VARCHAR,
            primary_industry VARCHAR,
            secondary_industry VARCHAR,
            revenue_m VARCHAR,
            type leadtier,
            company_summary JSONB
        )
    """)
    op.create_index("ix_lead_company_profiles_id", "lead_company_profiles", ["id"])

    cols = ", ".join(_PROFILE_COLUMNS)
    op.execute(
        f"INSERT INTO lead_company_profiles (lead_id, {cols}) "
        f"SELECT id, {cols} FROM leads"
    )

    for col in _PROFILE_COLUMNS:
        op.drop_column("leads", col)


def downgrade() -> None:
    erp_enum = sa.Enum(name="erp", create_type=False)
    leadtier_enum = sa.Enum(name="leadtier", create_type=False)

    op.add_column("leads", sa.Column("erp", erp_enum, nullable=True))
    op.add_column("leads", sa.Column("num_erp_users", sa.Integer, nullable=True))
    op.add_column("leads", sa.Column("num_locations", sa.Integer, nullable=True))
    op.add_column("leads", sa.Column("primary_buying_group", sa.String, nullable=True))
    op.add_column("leads", sa.Column("other_buying_group", sa.String, nullable=True))
    op.add_column("leads", sa.Column("associations", sa.String, nullable=True))
    op.add_column("leads", sa.Column("primary_industry", sa.String, nullable=True))
    op.add_column("leads", sa.Column("secondary_industry", sa.String, nullable=True))
    op.add_column("leads", sa.Column("revenue_m", sa.String, nullable=True))
    op.add_column("leads", sa.Column("type", leadtier_enum, nullable=True))
    op.add_column("leads", sa.Column("company_summary", JSONB, nullable=True))

    cols = ", ".join(_PROFILE_COLUMNS)
    op.execute(
        f"UPDATE leads SET ({cols}) = "
        f"(SELECT {cols} FROM lead_company_profiles WHERE lead_company_profiles.lead_id = leads.id)"
    )

    op.drop_table("lead_company_profiles")
