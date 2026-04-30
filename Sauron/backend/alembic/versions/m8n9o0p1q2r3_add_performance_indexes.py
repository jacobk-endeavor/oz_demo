"""add performance indexes for query optimization

Revision ID: m8n9o0p1q2r3
Revises: a3b4c5d6e7f8, l7m8n9o0p1q2
Create Date: 2026-03-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m8n9o0p1q2r3"
down_revision: Union[str, Sequence[str], None] = ("a3b4c5d6e7f8", "l7m8n9o0p1q2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "CREATE UNIQUE INDEX ix_entity_domains_domain_lower "
        "ON entity_domains (LOWER(domain))"
    ))

    op.create_index(
        "ix_lead_company_profiles_erp",
        "lead_company_profiles",
        ["erp"],
    )
    op.create_index(
        "ix_lead_company_profiles_primary_industry",
        "lead_company_profiles",
        ["primary_industry"],
    )
    op.create_index(
        "ix_lead_company_profiles_type",
        "lead_company_profiles",
        ["type"],
    )
    op.create_index(
        "ix_lead_company_profiles_hq_timezone",
        "lead_company_profiles",
        ["hq_timezone"],
    )


def downgrade() -> None:
    op.drop_index("ix_lead_company_profiles_hq_timezone", "lead_company_profiles")
    op.drop_index("ix_lead_company_profiles_type", "lead_company_profiles")
    op.drop_index("ix_lead_company_profiles_primary_industry", "lead_company_profiles")
    op.drop_index("ix_lead_company_profiles_erp", "lead_company_profiles")
    op.execute(sa.text("DROP INDEX ix_entity_domains_domain_lower"))
