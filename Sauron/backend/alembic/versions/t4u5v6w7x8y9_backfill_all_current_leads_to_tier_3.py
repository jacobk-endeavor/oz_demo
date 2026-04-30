"""backfill all current leads to tier 3

Revision ID: t4u5v6w7x8y9
Revises: s2t3u4v5w6x7
Create Date: 2026-03-07 14:15:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "t4u5v6w7x8y9"
down_revision: Union[str, Sequence[str], None] = "s2t3u4v5w6x7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO lead_company_profiles (lead_id)
        SELECT leads.id
        FROM leads
        LEFT JOIN lead_company_profiles
            ON lead_company_profiles.lead_id = leads.id
        WHERE lead_company_profiles.lead_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE lead_company_profiles
        SET type = 'TIER_3'
        """
    )


def downgrade() -> None:
    """Downgrade schema.

    This data backfill intentionally does not attempt to restore prior tier
    values, because the previous per-row values are not recoverable.
    """
    pass
