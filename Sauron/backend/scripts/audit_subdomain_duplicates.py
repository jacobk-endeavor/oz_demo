"""Audit entity_domains for subdomain-based duplicates.

Finds groups of entity_domain rows whose stored domain differs but whose
root (registered) domain is the same, e.g. ``shop.example.com`` and
``blog.example.com`` both resolve to ``example.com``.

Usage:
    python scripts/audit_subdomain_duplicates.py
"""

import argparse
import asyncio
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select

from app.database import async_session, engine as db_engine
from app.domain_utils import extract_root_domain
from app.models.company import Company
from app.models.entity_domain import EntityDomain
from app.models.industry_group import IndustryGroup
from app.models.pe_group import PEGroup


def _terminal(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[subdomain-audit {ts}] {message}", flush=True)


def _entity_label(ed: EntityDomain, lookup: dict) -> str:
    if ed.company_id:
        name = lookup.get(("company", ed.company_id), "?")
        return f"Company #{ed.company_id} ({name})"
    if ed.pe_group_id:
        name = lookup.get(("pe", ed.pe_group_id), "?")
        return f"PE Group #{ed.pe_group_id} ({name})"
    if ed.industry_group_id:
        name = lookup.get(("ig", ed.industry_group_id), "?")
        return f"Industry Group #{ed.industry_group_id} ({name})"
    return "???"


async def run_audit() -> None:
    async with async_session() as db:
        result = await db.execute(select(EntityDomain))
        all_eds = list(result.scalars().all())

        lookup: dict[tuple[str, int], str] = {}
        for c in (await db.execute(select(Company))).scalars().all():
            lookup[("company", c.id)] = c.name
        for ig in (await db.execute(select(IndustryGroup))).scalars().all():
            lookup[("ig", ig.id)] = ig.name
        for pe in (await db.execute(select(PEGroup))).scalars().all():
            lookup[("pe", pe.id)] = pe.name

    groups: dict[str, list[EntityDomain]] = defaultdict(list)
    for ed in all_eds:
        root = extract_root_domain(ed.domain.lower())
        groups[root].append(ed)

    subdomain_rows = [
        ed
        for ed in all_eds
        if extract_root_domain(ed.domain.lower()) != ed.domain.lower()
    ]

    duplicate_groups = {
        root: eds for root, eds in sorted(groups.items()) if len(eds) > 1
    }

    _terminal("=" * 60)
    _terminal("SUBDOMAIN DUPLICATE AUDIT")
    _terminal("=" * 60)
    _terminal(f"Total entity_domain rows: {len(all_eds)}")
    _terminal(
        f"Rows stored as subdomain (not root domain): {len(subdomain_rows)}"
    )
    _terminal(
        f"Root domains with multiple entity_domain rows: "
        f"{len(duplicate_groups)}"
    )

    if subdomain_rows:
        _terminal("-" * 60)
        _terminal("DOMAINS STORED AS SUBDOMAINS (would be normalized to root)")
        _terminal("-" * 60)
        for ed in sorted(subdomain_rows, key=lambda e: e.domain.lower()):
            root = extract_root_domain(ed.domain.lower())
            owner = _entity_label(ed, lookup)
            _terminal(f"  {ed.domain:<40} -> {root:<25}  [{owner}]")

    if duplicate_groups:
        _terminal("-" * 60)
        _terminal("POTENTIAL DUPLICATES (same root domain, different entities)")
        _terminal("-" * 60)
        for root, eds in duplicate_groups.items():
            entity_ids = set()
            for ed in eds:
                entity_ids.add(
                    (ed.company_id, ed.pe_group_id, ed.industry_group_id)
                )
            if len(entity_ids) <= 1:
                continue
            _terminal(f"  Root domain: {root}")
            for ed in eds:
                owner = _entity_label(ed, lookup)
                _terminal(f"    {ed.domain:<40} {owner}")

    if not subdomain_rows and not duplicate_groups:
        _terminal("No subdomain issues found.")

    _terminal("=" * 60)
    _terminal("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Audit entity_domains table for subdomain-based duplicates. "
            "Reports domains stored as subdomains and groups of entity_domain "
            "rows that share the same root domain but belong to different entities."
        )
    )
    args = parser.parse_args()

    async def _run() -> None:
        await run_audit()

    async def _main() -> None:
        try:
            await _run()
        finally:
            await db_engine.dispose()

    asyncio.run(_main())
