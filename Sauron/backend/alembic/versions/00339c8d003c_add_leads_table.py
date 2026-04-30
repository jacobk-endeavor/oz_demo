"""add_leads_table

Revision ID: 00339c8d003c
Revises: f42f80a32a06
Create Date: 2026-02-23 15:37:20.938206

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '00339c8d003c'
down_revision: Union[str, Sequence[str], None] = 'f42f80a32a06'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('leads',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('company', sa.String(), nullable=False),
    sa.Column('domain', sa.String(), nullable=True),
    sa.Column('erp', postgresql.ENUM('EPICOR_PROPHET_21', 'SAP_S4HANA', 'SAP_ECC', 'ORACLE_NETSUITE', 'MICROSOFT_DYNAMICS_365', 'EPICOR_ECLIPSE', 'INFOR_CLOUDSUITE', 'INFOR_SXE', 'SALESFORCE', 'ORACLE_JD_EDWARDS', name='erp', create_type=False), nullable=True),
    sa.Column('num_users', sa.Integer(), nullable=True),
    sa.Column('num_locations', sa.Integer(), nullable=True),
    sa.Column('primary_buying_group', sa.String(), nullable=True),
    sa.Column('other_buying_group', sa.String(), nullable=True),
    sa.Column('associations', sa.String(), nullable=True),
    sa.Column('primary_industry', sa.String(), nullable=True),
    sa.Column('secondary_industry', sa.String(), nullable=True),
    sa.Column('revenue_m', sa.String(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_leads_id'), 'leads', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_leads_id'), table_name='leads')
    op.drop_table('leads')
