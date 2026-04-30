"""add safety equipment to leadindustry enum

Revision ID: s2t3u4v5w6x7
Revises: r1s2t3u4v5w6
Create Date: 2026-03-07 13:45:00.000000
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "s2t3u4v5w6x7"
down_revision: Union[str, Sequence[str], None] = "r1s2t3u4v5w6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_LEADINDUSTRY_VALUES_WITHOUT_SAFETY = (
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
)


def upgrade() -> None:
    op.execute("ALTER TYPE leadindustry ADD VALUE IF NOT EXISTS 'Safety Equipment'")


def downgrade() -> None:
    op.execute(
        """
        UPDATE lead_company_profiles
        SET primary_industry = 'Other / Unknown'
        WHERE primary_industry = 'Safety Equipment'
        """
    )
    op.execute("ALTER TYPE leadindustry RENAME TO leadindustry_old")

    bind = op.get_bind()
    leadindustry = postgresql.ENUM(
        *_LEADINDUSTRY_VALUES_WITHOUT_SAFETY,
        name="leadindustry",
        create_type=False,
    )
    leadindustry.create(bind, checkfirst=False)

    op.execute(
        """
        ALTER TABLE lead_company_profiles
        ALTER COLUMN primary_industry
        TYPE leadindustry
        USING primary_industry::text::leadindustry
        """
    )
    op.execute("DROP TYPE leadindustry_old")
