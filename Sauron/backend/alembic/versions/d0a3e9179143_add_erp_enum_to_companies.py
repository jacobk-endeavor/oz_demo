"""add erp enum to companies

Revision ID: d0a3e9179143
Revises: fea6a0707be8
Create Date: 2026-02-13 22:25:23.735820

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd0a3e9179143'
down_revision: Union[str, Sequence[str], None] = 'fea6a0707be8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    erp_enum = sa.Enum('EPICOR_PROPHET_21', 'SAP_S4HANA', 'SAP_ECC', 'ORACLE_NETSUITE', 'MICROSOFT_DYNAMICS_365', 'EPICOR_ECLIPSE', 'INFOR_CLOUDSUITE', 'INFOR_SXE', 'SALESFORCE', 'ORACLE_JD_EDWARDS', name='erp')
    erp_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('companies', sa.Column('erp', erp_enum, nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('companies', 'erp')
    sa.Enum(name='erp').drop(op.get_bind(), checkfirst=True)
