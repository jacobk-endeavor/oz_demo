"""enable pg_trgm for company fuzzy search

Revision ID: b9f1c2d3e4a5
Revises: b3c4d5e6f7a8
Create Date: 2026-02-17 23:40:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b9f1c2d3e4a5"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_companies_name_trgm ON companies USING gin (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_entity_domains_domain_trgm ON entity_domains USING gin (domain gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_entity_domains_domain_trgm")
    op.execute("DROP INDEX IF EXISTS ix_companies_name_trgm")
