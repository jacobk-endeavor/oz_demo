from __future__ import annotations

import csv
import io
import json
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx

from app.database import async_session
from app.models.company import Company
from app.models.industry_group import IndustryGroup
from app.models.pe_group import PEGroup
from app.models.person import Person
from app.models.enums import Role
from app.repositories.association_repo import AssociationRepo
from app.repositories.company_repo import CompanyRepo
from app.repositories.donation_repo import DonationRepo
from app.repositories.entity_domain_repo import EntityDomainRepo
from app.repositories.industry_group_repo import IndustryGroupRepo
from app.repositories.pe_group_repo import PEGroupRepo
from app.repositories.person_repo import PersonRepo
from app.repositories.position_repo import PositionRepo

from app.domain_utils import normalize_domain as _normalize_domain
from app.services.csv_detector import detect_csv_type, CSVType
from app.services.csv_parsers import (
    parse_buying_groups,
    parse_donations,
    parse_ad_leads,
    parse_acquisitions,
    parse_mdm_list,
    parse_conexiom_canals,
    parse_bdr_leads,
    parse_pe_ownership,
)
from app.services.domain_resolver import DomainResolver
from app.services.email_enricher import EmailEnricher


PARSERS = {
    CSVType.BUYING_GROUPS: parse_buying_groups,
    CSVType.DONATIONS: parse_donations,
    CSVType.AD_LEADS: parse_ad_leads,
    CSVType.ACQUISITIONS: parse_acquisitions,
    CSVType.MDM_LIST: parse_mdm_list,
    CSVType.CONEXIOM_CANALS: parse_conexiom_canals,
    CSVType.BDR_LEADS: parse_bdr_leads,
    CSVType.PE_OWNERSHIP: parse_pe_ownership,
}

ROLE_MAP: dict[str, Role] = {r.value: r for r in Role}


@dataclass
class IngestionContext:
    """Groups all repos, caches, and services needed during CSV ingestion."""
    db: Any
    resolver: DomainResolver
    enricher: EmailEnricher
    company_repo: CompanyRepo
    ig_repo: IndustryGroupRepo
    pe_repo: PEGroupRepo
    person_repo: PersonRepo
    position_repo: PositionRepo
    donation_repo: DonationRepo
    assoc_repo: AssociationRepo
    entity_domain_repo: EntityDomainRepo
    company_cache: dict[str, Company] = field(default_factory=dict)
    ig_cache: dict[str, IndustryGroup] = field(default_factory=dict)
    pe_cache: dict[str, PEGroup] = field(default_factory=dict)
    stats: dict[str, int] = field(default_factory=lambda: {
        "companies": 0, "people": 0, "pe_groups": 0,
        "industry_groups": 0, "donations": 0, "positions": 0,
    })


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, default=str)}\n\n"


def _first_domain(entity: Any) -> str | None:
    """Get the first domain from an entity's entity_domains relationship."""
    if hasattr(entity, "entity_domains") and entity.entity_domains:
        return entity.entity_domains[0].domain
    return None


def _merge_fields(entity: Any, action: dict, field_names: tuple[str, ...]) -> None:
    """Overwrite entity fields with non-None values from *action*."""
    for f in field_names:
        new_val = action.get(f)
        if new_val is not None:
            setattr(entity, f, new_val)


async def run_ingestion(file_bytes: bytes) -> AsyncGenerator[str, None]:
    """Main ingestion coroutine. Yields SSE event strings."""
    text = file_bytes.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    header = next(reader)
    rows = list(reader)
    total_rows = len(rows)

    try:
        csv_type = detect_csv_type(header)
    except ValueError as e:
        yield _sse({"type": "error", "message": str(e)})
        return

    yield _sse(
        {"type": "detected", "csv_type": csv_type.value, "total_rows": total_rows}
    )

    parser = PARSERS[csv_type]
    stats = {
        "companies": 0,
        "people": 0,
        "pe_groups": 0,
        "industry_groups": 0,
        "donations": 0,
        "positions": 0,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resolver = DomainResolver(client)
        enricher = EmailEnricher(client)

        async with async_session() as db:
            ctx = IngestionContext(
                db=db,
                resolver=resolver,
                enricher=enricher,
                company_repo=CompanyRepo(db),
                ig_repo=IndustryGroupRepo(db),
                pe_repo=PEGroupRepo(db),
                person_repo=PersonRepo(db),
                position_repo=PositionRepo(db),
                donation_repo=DonationRepo(db),
                assoc_repo=AssociationRepo(db),
                entity_domain_repo=EntityDomainRepo(db),
            )
            stats = ctx.stats

            await _preload_caches(ctx)

            processed = 0
            skipped = 0
            errors: list[dict] = []

            for row in rows:
                try:
                    actions = parser(header, row)
                    for action in actions:
                        await _execute_action(ctx, action)
                    await db.commit()
                except Exception as e:
                    await db.rollback()
                    errors.append({"row": processed + 1, "error": str(e)})
                    skipped += 1

                processed += 1
                if processed % 10 == 0 or processed == total_rows:
                    yield _sse(
                        {
                            "type": "progress",
                            "processed": processed,
                            "total": total_rows,
                            "skipped": skipped,
                        }
                    )

    yield _sse(
        {
            "type": "complete",
            "processed": processed,
            "skipped": skipped,
            "stats": stats,
            "errors": errors[:50],
        }
    )


async def _preload_entity_cache(repo: Any, cache: dict) -> None:
    for entity in await repo.list_all():
        cache[entity.name.lower()] = entity
        for ed in entity.entity_domains:
            normalized = _normalize_domain(ed.domain) or ed.domain.lower()
            cache[f"domain:{normalized}"] = entity


async def _preload_caches(ctx: IngestionContext) -> None:
    await _preload_entity_cache(ctx.company_repo, ctx.company_cache)
    await _preload_entity_cache(ctx.ig_repo, ctx.ig_cache)
    await _preload_entity_cache(ctx.pe_repo, ctx.pe_cache)


async def _execute_action(ctx: IngestionContext, action: dict) -> None:
    act = action["action"]

    if act == "upsert_company":
        await _upsert_company(ctx, action)
    elif act == "upsert_industry_group":
        await _upsert_industry_group(ctx, action)
    elif act == "upsert_pe_group":
        await _upsert_pe_group(ctx, action)
    elif act == "link_company_industry_group":
        await _link_entities(
            ctx.assoc_repo, action,
            ctx.company_cache, "company_name",
            ctx.ig_cache, "industry_group_name",
            ctx.assoc_repo.link_company_industry_group,
        )
    elif act == "link_company_pe_group":
        await _link_entities(
            ctx.assoc_repo, action,
            ctx.company_cache, "company_name",
            ctx.pe_cache, "pe_group_name",
            ctx.assoc_repo.link_company_pe_group,
        )
    elif act == "upsert_person":
        await _upsert_person(ctx, action)
    elif act == "upsert_person_with_donation":
        await _upsert_person_with_donation(ctx, action)
    elif act == "set_parent_company":
        await _set_parent_company(ctx, action)


# ---------------------------------------------------------------------------
# Company
# ---------------------------------------------------------------------------


_COMPANY_MERGE_FIELDS = ("erp", "competitor", "employee_count", "location_count", "revenue")


async def _upsert_company(ctx: IngestionContext, action: dict) -> Company | None:
    name = action["name"].strip()
    key = name.lower()
    cache = ctx.company_cache

    if key in cache:
        company = cache[key]
        _merge_company_fields(company, action)
        return company

    domain = _normalize_domain(action.get("domain"))
    if not domain:
        domain = _normalize_domain(await ctx.resolver.resolve(name))
    if not domain:
        return None

    domain_key = f"domain:{domain}"
    if domain_key in cache:
        company = cache[domain_key]
        cache[key] = company
        _merge_company_fields(company, action)
        return company

    company = await ctx.company_repo.create(
        name=name,
        is_named_account=action.get("is_named_account", False),
        erp=action.get("erp"),
        competitor=action.get("competitor"),
        employee_count=action.get("employee_count"),
        location_count=action.get("location_count"),
        revenue=action.get("revenue"),
    )
    await ctx.entity_domain_repo.create(domain=domain, company_id=company.id)
    cache[key] = company
    cache[domain_key] = company
    ctx.stats["companies"] += 1
    return company


def _merge_company_fields(company: Company, action: dict) -> None:
    _merge_fields(company, action, _COMPANY_MERGE_FIELDS)
    if action.get("is_named_account"):
        company.is_named_account = True


# ---------------------------------------------------------------------------
# Industry Group
# ---------------------------------------------------------------------------


def _domain_claimed_elsewhere(domain: str, *other_caches: dict) -> bool:
    """Check if a domain is already in use by a different entity type."""
    normalized = _normalize_domain(domain) or domain.lower()
    key = f"domain:{normalized}"
    return any(key in cache for cache in other_caches)


async def _upsert_industry_group(ctx: IngestionContext, action: dict) -> IndustryGroup:
    name = action["name"].strip()
    key = name.lower()
    cache = ctx.ig_cache

    if key in cache:
        ig = cache[key]
        _merge_fields(ig, action, ("vertical",))
        return ig

    domain = _normalize_domain(await ctx.resolver.resolve(name))
    if domain and _domain_claimed_elsewhere(domain, ctx.company_cache, ctx.pe_cache):
        domain = None

    if domain:
        domain_key = f"domain:{domain}"
        if domain_key in cache:
            ig = cache[domain_key]
            cache[key] = ig
            _merge_fields(ig, action, ("vertical",))
            return ig

    ig = await ctx.ig_repo.create(name=name)
    if domain:
        await ctx.entity_domain_repo.create(domain=domain, industry_group_id=ig.id)
    cache[key] = ig
    if domain:
        cache[f"domain:{domain}"] = ig
    ctx.stats["industry_groups"] += 1
    return ig


async def _link_entities(
    assoc_repo: AssociationRepo,
    action: dict,
    from_cache: dict,
    from_key: str,
    to_cache: dict,
    to_key: str,
    link_fn: Any,
) -> None:
    """Generic linker: resolve two entities from caches and call *link_fn*."""
    from_entity = from_cache.get(action[from_key].lower())
    to_entity = to_cache.get(action[to_key].lower())
    if not from_entity or not to_entity:
        return
    await link_fn(from_entity.id, to_entity.id)


# ---------------------------------------------------------------------------
# PE Group
# ---------------------------------------------------------------------------


async def _upsert_pe_group(ctx: IngestionContext, action: dict) -> PEGroup | None:
    name = action["name"].strip()
    key = name.lower()
    cache = ctx.pe_cache

    if key in cache:
        pe = cache[key]
        _merge_fields(pe, action, ("aum",))
        return pe

    domain = _normalize_domain(await ctx.resolver.resolve(name))
    if not domain:
        return None

    if _domain_claimed_elsewhere(domain, ctx.company_cache, ctx.ig_cache):
        return None

    domain_key = f"domain:{domain}"
    if domain_key in cache:
        pe = cache[domain_key]
        cache[key] = pe
        _merge_fields(pe, action, ("aum",))
        return pe

    pe = await ctx.pe_repo.create(name=name)
    await ctx.entity_domain_repo.create(domain=domain, pe_group_id=pe.id)
    cache[key] = pe
    cache[domain_key] = pe
    ctx.stats["pe_groups"] += 1
    return pe


# ---------------------------------------------------------------------------
# Person
# ---------------------------------------------------------------------------


async def _upsert_person(ctx: IngestionContext, action: dict) -> Person | None:
    first_name = action["first_name"]
    last_name = action["last_name"]
    company_name = action.get("company_name", "")
    ig_name = action.get("industry_group_name", "")
    pe_group_name = action.get("pe_group_name", "")
    role_str = action.get("role", "Other")
    title = action.get("title", role_str)

    company = None
    if company_name:
        company = await _upsert_company(
            ctx,
            {
                "action": "upsert_company",
                "name": company_name,
                "is_named_account": action.get("is_named_account", False),
            },
        )

    ig = ctx.ig_cache.get(ig_name.lower()) if ig_name else None
    pe_group = ctx.pe_cache.get(pe_group_name.lower()) if pe_group_name else None

    if not company and not ig and not pe_group:
        return None

    enrichment_company = company
    if not enrichment_company:
        hint = action.get("_enrichment_company", "")
        if hint:
            enrichment_company = ctx.company_cache.get(hint.lower())
    enrichment_domain = None
    enrichment_org = ""
    if enrichment_company:
        enrichment_domain = _first_domain(enrichment_company)
        enrichment_org = enrichment_company.name
    elif pe_group:
        enrichment_domain = _first_domain(pe_group)
        if enrichment_domain:
            enrichment_org = pe_group.name

    person = await _find_or_create_person(
        ctx.person_repo, first_name, last_name,
        enrichment_org, enrichment_domain, ctx.enricher, ctx.stats,
    )
    if not person:
        return None

    role_enum = ROLE_MAP.get(role_str)
    await _ensure_position(
        ctx.position_repo, person, title, role_enum,
        company_id=company.id if company else None,
        industry_group_id=ig.id if ig else None,
        pe_group_id=pe_group.id if pe_group else None,
        stats=ctx.stats,
    )

    return person


async def _upsert_person_with_donation(ctx: IngestionContext, action: dict) -> None:
    first_name = action["first_name"]
    last_name = action["last_name"]
    company_name = action.get("company_name", "")
    role_str = action.get("role", "Other")
    title = action.get("title", role_str)

    company = None
    if company_name:
        company = await _upsert_company(
            ctx,
            {"action": "upsert_company", "name": company_name, "is_named_account": False},
        )
    if not company:
        return

    company_domain = _first_domain(company)
    person = await _find_or_create_person(
        ctx.person_repo, first_name, last_name,
        company_name, company_domain, ctx.enricher, ctx.stats,
    )
    if not person:
        return

    role_enum = ROLE_MAP.get(role_str)
    await _ensure_position(
        ctx.position_repo, person, title, role_enum,
        company_id=company.id, stats=ctx.stats,
    )

    donation_data = action.get("donation", {})
    if donation_data.get("committee"):
        await ctx.donation_repo.create(
            person_id=person.id,
            committee=donation_data["committee"],
            amount=donation_data.get("amount", 0.0),
            timestamp=donation_data.get("timestamp") or datetime(2020, 1, 1),
        )
        ctx.stats["donations"] += 1


async def _find_or_create_person(
    repo: PersonRepo,
    first_name: str,
    last_name: str,
    organization_name: str,
    domain: str | None,
    enricher: EmailEnricher,
    stats: dict[str, int],
    linkedin: str | None = None,
) -> Person | None:
    """Find existing person or create new one. Returns None if email can't be resolved."""
    # Try to find by name
    person = await repo.get_by_name(first_name, last_name)
    if person:
        if linkedin:
            person.linkedin = linkedin
        return person

    # Try email enrichment — required for new people
    email = None
    if domain:
        email = await enricher.enrich(first_name, last_name, organization_name, domain)

    if not email:
        return None

    # Check if email already belongs to someone
    person = await repo.get_by_email(email)
    if person:
        if linkedin:
            person.linkedin = linkedin
        return person

    person = await repo.create(
        first_name=first_name,
        last_name=last_name,
        email=email,
        linkedin=linkedin,
    )
    stats["people"] += 1
    return person


async def _ensure_position(
    repo: PositionRepo,
    person: Person,
    title: str,
    role: Role | None,
    company_id: int | None = None,
    pe_group_id: int | None = None,
    industry_group_id: int | None = None,
    stats: dict[str, int] | None = None,
) -> None:
    """Create a position if a similar one doesn't already exist.
    Exactly one of company_id, pe_group_id, industry_group_id must be set."""
    existing = await repo.find_existing(
        person.id,
        company_id=company_id,
        pe_group_id=pe_group_id,
        industry_group_id=industry_group_id,
        role=role,
    )
    if existing:
        return

    await repo.create(
        title=title,
        role=role,
        person_id=person.id,
        company_id=company_id,
        pe_group_id=pe_group_id,
        industry_group_id=industry_group_id,
    )
    if stats:
        stats["positions"] += 1


# ---------------------------------------------------------------------------
# Acquisitions
# ---------------------------------------------------------------------------


async def _set_parent_company(ctx: IngestionContext, action: dict) -> None:
    acquirer = await _upsert_company(
        ctx,
        {"action": "upsert_company", "name": action["acquirer_name"], "is_named_account": False},
    )
    acquiree = await _upsert_company(
        ctx,
        {"action": "upsert_company", "name": action["acquiree_name"], "is_named_account": False},
    )
    if acquirer and acquiree and acquirer.id != acquiree.id:
        acquiree.parent_company_id = acquirer.id
