"""multi hubspot company ids

Revision ID: f1a2b3c4d5e6
Revises: e9b2d1f4a6c7
Create Date: 2026-02-20 00:00:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"
down_revision = "e9b2d1f4a6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_hubspot_ids",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("hubspot_company_id", sa.String(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("hubspot_company_id"),
    )
    op.create_index(
        op.f("ix_company_hubspot_ids_id"),
        "company_hubspot_ids",
        ["id"],
        unique=False,
    )

    op.execute("""
        INSERT INTO company_hubspot_ids (hubspot_company_id, company_id)
        SELECT hubspot_company_id, id
        FROM companies
        WHERE hubspot_company_id IS NOT NULL
    """)

    op.drop_constraint(
        "companies_hubspot_company_id_key", "companies", type_="unique"
    )
    op.drop_column("companies", "hubspot_company_id")


def downgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("hubspot_company_id", sa.String(), nullable=True),
    )

    op.execute("""
        UPDATE companies c
        SET hubspot_company_id = sub.hubspot_company_id
        FROM (
            SELECT DISTINCT ON (company_id)
                company_id, hubspot_company_id
            FROM company_hubspot_ids
            ORDER BY company_id, id
        ) sub
        WHERE c.id = sub.company_id
    """)

    op.create_unique_constraint(
        "companies_hubspot_company_id_key",
        "companies",
        ["hubspot_company_id"],
    )
    op.drop_index(
        op.f("ix_company_hubspot_ids_id"), table_name="company_hubspot_ids"
    )
    op.drop_table("company_hubspot_ids")
