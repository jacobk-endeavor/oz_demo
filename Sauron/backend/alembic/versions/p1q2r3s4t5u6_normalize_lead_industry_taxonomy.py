"""normalize lead industry taxonomy

Revision ID: p1q2r3s4t5u6
Revises: o0p1q2r3s4t5
Create Date: 2026-03-07 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "p1q2r3s4t5u6"
down_revision: Union[str, Sequence[str], None] = "o0p1q2r3s4t5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


leadindustry = postgresql.ENUM(
    "Electrical",
    "Plumbing",
    "HVAC",
    "Building Materials",
    "Medical",
    "Automotive",
    "Services / Contractors",
    "Other / Unknown",
    "Lumber",
    "Fasteners",
    "PVF (Pipes, Valves, Fittings)",
    "Fluid Power",
    name="leadindustry",
    create_type=False,
)

leadcompanytype = postgresql.ENUM(
    "Distributor",
    "Manufacturer",
    "Other",
    name="leadcompanytype",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    leadindustry.create(bind, checkfirst=True)
    leadcompanytype.create(bind, checkfirst=True)

    op.execute("UPDATE lead_company_profiles SET primary_industry = NULL")

    op.alter_column(
        "lead_company_profiles",
        "primary_industry",
        existing_type=sa.String(),
        type_=leadindustry,
        existing_nullable=True,
        postgresql_using="NULL::leadindustry",
    )
    op.drop_column("lead_company_profiles", "secondary_industry")
    op.add_column(
        "lead_company_profiles",
        sa.Column("company_type", leadcompanytype, nullable=True),
    )


def downgrade() -> None:
    op.add_column(
        "lead_company_profiles",
        sa.Column("secondary_industry", sa.String(), nullable=True),
    )
    op.drop_column("lead_company_profiles", "company_type")
    op.alter_column(
        "lead_company_profiles",
        "primary_industry",
        existing_type=leadindustry,
        type_=sa.String(),
        existing_nullable=True,
        postgresql_using="primary_industry::text",
    )

    bind = op.get_bind()
    leadcompanytype.drop(bind, checkfirst=True)
    leadindustry.drop(bind, checkfirst=True)
