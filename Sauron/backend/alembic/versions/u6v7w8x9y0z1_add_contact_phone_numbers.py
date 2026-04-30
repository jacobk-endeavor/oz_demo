"""add contact phone numbers

Revision ID: u6v7w8x9y0z1
Revises: t4u5v6w7x8y9
Create Date: 2026-03-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "u6v7w8x9y0z1"
down_revision: Union[str, Sequence[str], None] = "t4u5v6w7x8y9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lead_contact_phones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contact_id", sa.Integer(), nullable=False),
        sa.Column("number", sa.String(), nullable=False),
        sa.Column("type", sa.String(), server_default="unknown", nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("confidence", sa.String(), nullable=True),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["contact_id"], ["lead_contacts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_lead_contact_phones_contact_id",
        "lead_contact_phones",
        ["contact_id"],
        unique=False,
    )

    op.add_column(
        "lead_actions",
        sa.Column("dialed_phone_number", sa.String(), nullable=True),
    )
    op.add_column(
        "lead_actions",
        sa.Column("dialed_phone_type", sa.String(), nullable=True),
    )

    op.add_column(
        "apollo_phone_cache",
        sa.Column("phone_numbers", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    conn = op.get_bind()

    lead_contacts = sa.table(
        "lead_contacts",
        sa.column("id", sa.Integer()),
        sa.column("phone", sa.String()),
    )
    lead_contact_phones = sa.table(
        "lead_contact_phones",
        sa.column("contact_id", sa.Integer()),
        sa.column("number", sa.String()),
        sa.column("type", sa.String()),
        sa.column("is_primary", sa.Boolean()),
    )
    contact_rows = conn.execute(
        sa.select(lead_contacts.c.id, lead_contacts.c.phone).where(
            lead_contacts.c.phone.is_not(None)
        )
    ).all()
    if contact_rows:
        conn.execute(
            sa.insert(lead_contact_phones),
            [
                {
                    "contact_id": row.id,
                    "number": row.phone,
                    "type": "unknown",
                    "is_primary": True,
                }
                for row in contact_rows
                if row.phone
            ],
        )

    apollo_phone_cache = sa.table(
        "apollo_phone_cache",
        sa.column("id", sa.Integer()),
        sa.column("phone", sa.String()),
        sa.column("phone_numbers", postgresql.JSONB(astext_type=sa.Text())),
    )
    cache_rows = conn.execute(
        sa.select(apollo_phone_cache.c.id, apollo_phone_cache.c.phone)
    ).all()
    for row in cache_rows:
        conn.execute(
            sa.update(apollo_phone_cache)
            .where(apollo_phone_cache.c.id == row.id)
            .values(
                phone_numbers=[
                    {
                        "number": row.phone,
                        "type": "unknown",
                        "is_primary": True,
                    }
                ]
            )
        )

    op.alter_column(
        "apollo_phone_cache",
        "phone_numbers",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
    )
    op.drop_column("apollo_phone_cache", "phone")


def downgrade() -> None:
    op.add_column(
        "apollo_phone_cache",
        sa.Column("phone", sa.String(), nullable=True),
    )

    conn = op.get_bind()
    apollo_phone_cache = sa.table(
        "apollo_phone_cache",
        sa.column("id", sa.Integer()),
        sa.column("phone", sa.String()),
        sa.column("phone_numbers", postgresql.JSONB(astext_type=sa.Text())),
    )
    cache_rows = conn.execute(
        sa.select(apollo_phone_cache.c.id, apollo_phone_cache.c.phone_numbers)
    ).all()
    for row in cache_rows:
        first_number = None
        if row.phone_numbers:
            first = row.phone_numbers[0]
            if isinstance(first, dict):
                first_number = first.get("number")
        conn.execute(
            sa.update(apollo_phone_cache)
            .where(apollo_phone_cache.c.id == row.id)
            .values(phone=first_number or "")
        )

    op.alter_column(
        "apollo_phone_cache",
        "phone",
        existing_type=sa.String(),
        nullable=False,
    )
    op.drop_column("apollo_phone_cache", "phone_numbers")

    op.drop_column("lead_actions", "dialed_phone_type")
    op.drop_column("lead_actions", "dialed_phone_number")

    op.drop_index("ix_lead_contact_phones_contact_id", table_name="lead_contact_phones")
    op.drop_table("lead_contact_phones")
