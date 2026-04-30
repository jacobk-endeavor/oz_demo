"""entity_domains and orphan cleanup

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-02-17 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1 — Delete orphaned people (those with no positions)
    orphan_subquery = (
        "SELECT p.id FROM people p "
        "LEFT JOIN positions pos ON pos.person_id = p.id "
        "WHERE pos.id IS NULL"
    )
    op.execute(
        f"DELETE FROM meeting_person WHERE person_id IN ({orphan_subquery})"
    )
    op.execute(
        f"DELETE FROM meeting_recording_person WHERE person_id IN ({orphan_subquery})"
    )
    op.execute(
        f"DELETE FROM donations WHERE person_id IN ({orphan_subquery})"
    )
    op.execute(
        f"DELETE FROM people WHERE id IN ({orphan_subquery})"
    )

    # Step 2 — Create entity_domains table
    op.create_table(
        'entity_domains',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('domain', sa.String(), nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=True),
        sa.Column('pe_group_id', sa.Integer(), sa.ForeignKey('pe_groups.id', ondelete='CASCADE'), nullable=True),
        sa.Column('industry_group_id', sa.Integer(), sa.ForeignKey('industry_groups.id', ondelete='CASCADE'), nullable=True),
        sa.CheckConstraint(
            "(CASE WHEN company_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN pe_group_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN industry_group_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name='entity_domain_single_entity',
        ),
    )
    op.create_index('ix_entity_domains_domain', 'entity_domains', ['domain'], unique=True)
    op.create_index('ix_entity_domains_company_id', 'entity_domains', ['company_id'])
    op.create_index('ix_entity_domains_pe_group_id', 'entity_domains', ['pe_group_id'])
    op.create_index('ix_entity_domains_industry_group_id', 'entity_domains', ['industry_group_id'])

    # Step 3 — Migrate existing domain data (companies take priority)
    op.execute("""
        INSERT INTO entity_domains (domain, company_id)
        SELECT domain, id FROM companies
        WHERE domain IS NOT NULL AND domain != ''
    """)
    op.execute("""
        INSERT INTO entity_domains (domain, pe_group_id)
        SELECT domain, id FROM pe_groups
        WHERE domain IS NOT NULL AND domain != ''
          AND domain NOT IN (SELECT domain FROM entity_domains)
    """)
    op.execute("""
        INSERT INTO entity_domains (domain, industry_group_id)
        SELECT domain, id FROM industry_groups
        WHERE domain IS NOT NULL AND domain != ''
          AND domain NOT IN (SELECT domain FROM entity_domains)
    """)

    # Step 4 — Drop old domain columns and their unique constraints
    op.drop_constraint('companies_domain_key', 'companies', type_='unique')
    op.drop_column('companies', 'domain')

    op.drop_constraint('pe_groups_domain_key', 'pe_groups', type_='unique')
    op.drop_column('pe_groups', 'domain')

    op.drop_constraint('industry_groups_domain_key', 'industry_groups', type_='unique')
    op.drop_column('industry_groups', 'domain')


def downgrade() -> None:
    # Re-add domain columns
    op.add_column('companies', sa.Column('domain', sa.String(), nullable=True))
    op.add_column('pe_groups', sa.Column('domain', sa.String(), nullable=True))
    op.add_column('industry_groups', sa.Column('domain', sa.String(), nullable=True))

    # Restore data from entity_domains
    op.execute("""
        UPDATE companies SET domain = ed.domain
        FROM entity_domains ed WHERE ed.company_id = companies.id
    """)
    op.execute("""
        UPDATE pe_groups SET domain = ed.domain
        FROM entity_domains ed WHERE ed.pe_group_id = pe_groups.id
    """)
    op.execute("""
        UPDATE industry_groups SET domain = ed.domain
        FROM entity_domains ed WHERE ed.industry_group_id = industry_groups.id
    """)

    # Re-add unique constraints
    op.create_unique_constraint('companies_domain_key', 'companies', ['domain'])
    op.alter_column('companies', 'domain', nullable=False, existing_type=sa.String())

    op.create_unique_constraint('pe_groups_domain_key', 'pe_groups', ['domain'])
    op.alter_column('pe_groups', 'domain', nullable=False, existing_type=sa.String())

    op.create_unique_constraint('industry_groups_domain_key', 'industry_groups', ['domain'])

    # Drop entity_domains table
    op.drop_index('ix_entity_domains_industry_group_id', 'entity_domains')
    op.drop_index('ix_entity_domains_pe_group_id', 'entity_domains')
    op.drop_index('ix_entity_domains_company_id', 'entity_domains')
    op.drop_index('ix_entity_domains_domain', 'entity_domains')
    op.drop_table('entity_domains')
