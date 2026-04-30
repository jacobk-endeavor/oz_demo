"""add basic user role

Revision ID: a3b4c5d6e7f8
Revises: 2b4c6d8e0f1a
Create Date: 2026-03-04 00:00:00.000000+00:00
"""

from alembic import op

revision = "a3b4c5d6e7f8"
down_revision = "2b4c6d8e0f1a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'basic'")


def downgrade() -> None:
    pass
