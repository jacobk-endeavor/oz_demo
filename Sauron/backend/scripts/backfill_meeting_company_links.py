import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, insert, select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import async_session, engine as db_engine
from app.models.associations import meeting_company, meeting_person
from app.models.company import Company
from app.models.entity_domain import EntityDomain
from app.models.person import Person
from app.models.sales_rep import SalesRep
from app.domain_utils import normalize_domain
from app.services.calendar_sync.models import (
    extract_domain_from_email,
    is_personal_email_domain,
)
from app.services.calendar_sync.user_filters import is_excluded_user_email


def _terminal(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[meeting-company-backfill {ts}] {message}", flush=True)


class BackfillStats:
    def __init__(self) -> None:
        self.meetings_scanned = 0
        self.meetings_updated = 0
        self.links_added = 0
        self.companies_created = 0
        self.domains_skipped_personal = 0
        self.domains_skipped_empty = 0
        self.domains_skipped_sales_rep = 0


async def _load_sales_rep_emails() -> set[str]:
    async with async_session() as db:
        result = await db.execute(
            select(func.lower(SalesRep.email)).where(SalesRep.email.is_not(None))
        )
        return {email for email in result.scalars().all() if email}


async def _candidate_meeting_ids(meeting_id: int | None) -> list[int]:
    async with async_session() as db:
        stmt = (
            select(meeting_person.c.meeting_id)
            .select_from(
                meeting_person.outerjoin(
                    meeting_company,
                    meeting_person.c.meeting_id == meeting_company.c.meeting_id,
                )
            )
            .where(meeting_company.c.meeting_id.is_(None))
            .distinct()
            .order_by(meeting_person.c.meeting_id.asc())
        )
        if meeting_id is not None:
            stmt = stmt.where(meeting_person.c.meeting_id == meeting_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())


async def _find_company_by_domain(db, domain: str) -> Company | None:
    normalized = normalize_domain(domain) or domain.lower()
    result = await db.execute(
        select(Company)
        .join(EntityDomain, EntityDomain.company_id == Company.id)
        .where(func.lower(EntityDomain.domain) == normalized)
    )
    return result.scalar_one_or_none()


async def _derive_domains_for_meeting(
    meeting_id: int,
    *,
    sales_rep_emails: set[str],
    include_personal_domains: bool,
    stats: BackfillStats,
) -> set[str]:
    async with async_session() as db:
        result = await db.execute(
            select(Person.email)
            .join(meeting_person, meeting_person.c.person_id == Person.id)
            .where(meeting_person.c.meeting_id == meeting_id)
        )
        emails = [email for email in result.scalars().all() if email]

    domains: set[str] = set()
    for email in emails:
        normalized_email = email.lower()
        if is_excluded_user_email(normalized_email):
            continue
        if normalized_email in sales_rep_emails:
            stats.domains_skipped_sales_rep += 1
            continue

        domain = extract_domain_from_email(normalized_email)
        if not domain:
            stats.domains_skipped_empty += 1
            continue
        if not include_personal_domains and is_personal_email_domain(domain):
            stats.domains_skipped_personal += 1
            continue
        domains.add(domain)
    return domains


async def run_backfill(
    *,
    force: bool,
    meeting_id: int | None,
    create_missing_companies: bool,
    include_personal_domains: bool,
) -> None:
    stats = BackfillStats()
    sales_rep_emails = await _load_sales_rep_emails()
    meeting_ids = await _candidate_meeting_ids(meeting_id)

    if not meeting_ids:
        _terminal("No meetings matched the backfill criteria.")
        return

    _terminal(f"Found {len(meeting_ids)} meeting(s) with missing company links.")
    if not force:
        _terminal("Dry run only. Re-run with --force to persist changes.")

    company_cache: dict[str, Company | None] = {}
    planned_new_domains: set[str] = set()

    async with async_session() as db:
        for mid in meeting_ids:
            stats.meetings_scanned += 1
            domains = await _derive_domains_for_meeting(
                mid,
                sales_rep_emails=sales_rep_emails,
                include_personal_domains=include_personal_domains,
                stats=stats,
            )
            if not domains:
                continue

            existing_link_rows = await db.execute(
                select(meeting_company.c.company_id).where(
                    meeting_company.c.meeting_id == mid
                )
            )
            existing_company_ids = {
                cid for cid in existing_link_rows.scalars().all() if cid is not None
            }

            added_for_meeting = 0
            for domain in sorted(domains):
                company = company_cache.get(domain)
                if domain not in company_cache:
                    company = await _find_company_by_domain(db, domain)
                    company_cache[domain] = company

                if company is None and create_missing_companies:
                    if force:
                        company = Company(
                            name=domain,
                            is_named_account=False,
                        )
                        db.add(company)
                        await db.flush()
                        db.add(EntityDomain(domain=domain, company_id=company.id))
                        await db.flush()
                        company_cache[domain] = company
                        stats.companies_created += 1
                    else:
                        if domain not in planned_new_domains:
                            planned_new_domains.add(domain)
                            stats.companies_created += 1
                        continue

                if company is None:
                    continue

                if company.id in existing_company_ids:
                    continue

                if force:
                    await db.execute(
                        insert(meeting_company).values(
                            meeting_id=mid,
                            company_id=company.id,
                        )
                    )
                existing_company_ids.add(company.id)
                added_for_meeting += 1
                stats.links_added += 1

            if added_for_meeting > 0:
                stats.meetings_updated += 1
                _terminal(
                    f"Meeting {mid}: {'would add' if not force else 'added'} "
                    f"{added_for_meeting} company link(s)"
                )

        if force:
            await db.commit()
        else:
            await db.rollback()

    _terminal("Backfill complete.")
    _terminal(
        "Summary: "
        f"meetings_scanned={stats.meetings_scanned} "
        f"meetings_updated={stats.meetings_updated} "
        f"links_added={stats.links_added} "
        f"companies_created={stats.companies_created}"
    )
    _terminal(
        "Skipped domains: "
        f"sales_rep={stats.domains_skipped_sales_rep} "
        f"personal={stats.domains_skipped_personal} "
        f"empty={stats.domains_skipped_empty}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill missing meeting_company links from meeting attendee emails."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Persist DB changes. Without this flag, the script runs in dry-run mode.",
    )
    parser.add_argument(
        "--meeting-id",
        type=int,
        default=None,
        help="Optional: backfill only a single meeting ID.",
    )
    parser.add_argument(
        "--create-missing-companies",
        action="store_true",
        help="Create Company rows when an attendee domain does not exist yet.",
    )
    parser.add_argument(
        "--include-personal-domains",
        action="store_true",
        help="Include common personal-email domains (gmail/outlook/etc).",
    )
    args = parser.parse_args()

    async def _run() -> None:
        try:
            await run_backfill(
                force=args.force,
                meeting_id=args.meeting_id,
                create_missing_companies=args.create_missing_companies,
                include_personal_domains=args.include_personal_domains,
            )
        finally:
            await db_engine.dispose()

    asyncio.run(_run())
