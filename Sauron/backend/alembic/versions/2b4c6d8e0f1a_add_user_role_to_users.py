"""add user role to users

Revision ID: 2b4c6d8e0f1a
Revises: f1a2b3c4d5e6
Create Date: 2026-02-20 00:00:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "2b4c6d8e0f1a"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role_enum = sa.Enum(
        "admin", "exec", "bdr", "ae", "pickworth", name="userrole"
    )
    user_role_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "users",
        sa.Column("role", user_role_enum, nullable=False, server_default="bdr"),
    )


def downgrade() -> None:
    op.drop_column("users", "role")
    sa.Enum(name="userrole").drop(op.get_bind(), checkfirst=True)
