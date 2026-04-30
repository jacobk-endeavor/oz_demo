"""merge buying groups into list

Revision ID: q1r2s3t4u5v6
Revises: p1q2r3s4t5u6
Create Date: 2026-03-07 12:30:00.000000
"""

from __future__ import annotations

import json
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "q1r2s3t4u5v6"
down_revision: Union[str, Sequence[str], None] = "p1q2r3s4t5u6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SPLIT_RE = re.compile(r"[,\n;]+")


def _combine_buying_groups(*values: str | None) -> list[str] | None:
    groups: list[str] = []
    seen: set[str] = set()

    for value in values:
        if not value:
            continue
        for part in _SPLIT_RE.split(value):
            cleaned = part.strip()
            if not cleaned or cleaned in {"-", "N/A", "n/a"}:
                continue
            key = cleaned.casefold()
            if key in seen:
                continue
            seen.add(key)
            groups.append(cleaned)

    return groups or None


def upgrade() -> None:
    op.add_column("lead_company_profiles", sa.Column("buying_groups", JSONB(), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT id, primary_buying_group, other_buying_group
            FROM lead_company_profiles
            """
        )
    ).mappings()

    for row in rows:
        groups = _combine_buying_groups(
            row["primary_buying_group"],
            row["other_buying_group"],
        )
        bind.execute(
            sa.text(
                """
                UPDATE lead_company_profiles
                SET buying_groups = CAST(:buying_groups AS JSONB)
                WHERE id = :id
                """
            ),
            {
                "id": row["id"],
                "buying_groups": json.dumps(groups) if groups is not None else None,
            },
        )

    op.drop_column("lead_company_profiles", "other_buying_group")
    op.drop_column("lead_company_profiles", "primary_buying_group")


def downgrade() -> None:
    op.add_column("lead_company_profiles", sa.Column("primary_buying_group", sa.String(), nullable=True))
    op.add_column("lead_company_profiles", sa.Column("other_buying_group", sa.String(), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT id, buying_groups
            FROM lead_company_profiles
            """
        )
    ).mappings()

    for row in rows:
        groups = row["buying_groups"] or []
        primary = groups[0] if groups else None
        other = ", ".join(groups[1:]) if len(groups) > 1 else None
        bind.execute(
            sa.text(
                """
                UPDATE lead_company_profiles
                SET primary_buying_group = :primary_buying_group,
                    other_buying_group = :other_buying_group
                WHERE id = :id
                """
            ),
            {
                "id": row["id"],
                "primary_buying_group": primary,
                "other_buying_group": other,
            },
        )

    op.drop_column("lead_company_profiles", "buying_groups")
