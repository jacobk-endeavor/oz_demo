"""add trigram indexes for fuzzy search apis

Revision ID: d4e5f6a7b8c9
Revises: b9f1c2d3e4a5
Create Date: 2026-02-18 09:20:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "b9f1c2d3e4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_deals_name_trgm ON deals USING gin (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_deals_hubspot_deal_stage_trgm ON deals USING gin (hubspot_deal_stage gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sales_reps_first_name_trgm ON sales_reps USING gin (first_name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sales_reps_last_name_trgm ON sales_reps USING gin (last_name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sales_reps_email_trgm ON sales_reps USING gin (email gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_people_first_name_trgm ON people USING gin (first_name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_people_last_name_trgm ON people USING gin (last_name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_people_email_trgm ON people USING gin (email gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_pe_groups_name_trgm ON pe_groups USING gin (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_industry_groups_name_trgm ON industry_groups USING gin (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_events_name_trgm ON events USING gin (name gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_events_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_industry_groups_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_pe_groups_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_people_email_trgm")
    op.execute("DROP INDEX IF EXISTS ix_people_last_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_people_first_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_sales_reps_email_trgm")
    op.execute("DROP INDEX IF EXISTS ix_sales_reps_last_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_sales_reps_first_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_deals_hubspot_deal_stage_trgm")
    op.execute("DROP INDEX IF EXISTS ix_deals_name_trgm")
