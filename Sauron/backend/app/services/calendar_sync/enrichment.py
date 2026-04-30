from __future__ import annotations

import logging
import re
from urllib.parse import urlsplit

import httpx
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.company import Company
from app.models.entity_domain import EntityDomain
from app.models.person import Person
from app.repositories.company_repo import CompanyRepo
from app.repositories.entity_domain_repo import EntityDomainRepo
from app.repositories.person_repo import PersonRepo
from app.repositories.position_repo import PositionRepo
from app.repositories.sales_rep_repo import SalesRepRepo
from app.services.calendar_sync.models import (
    SyncStats,
    extract_domain_from_email,
    is_personal_email_domain,
    normalize_domain,
    normalize_str,
)
from app.services.calendar_sync.user_filters import is_excluded_user_email

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def derive_name_from_email(email: str) -> tuple[str, str]:
    local_part = email.split("@", 1)[0]
    pieces = [p for p in re.split(r"[._-]+", local_part) if p]
    if not pieces:
        return "Unknown", "Unknown"
    if len(pieces) == 1:
        return pieces[0].title(), "Unknown"
    return pieces[0].title(), pieces[-1].title()


def extract_company_domain(organization: dict) -> str | None:
    for key in ("primary_domain", "domain", "website_url", "website"):
        value = organization.get(key)
        if not isinstance(value, str):
            continue
        parsed = urlsplit(value if "://" in value else f"https://{value}")
        candidate = parsed.netloc or parsed.path
        normalized = normalize_domain(candidate)
        if normalized:
            return normalized
    return None


# ---------------------------------------------------------------------------
# AttendeeEnricher
# ---------------------------------------------------------------------------


class AttendeeEnricher:
    """Enriches attendee emails via Apollo and manages Person/Company/Position rows."""

    def __init__(
        self,
        db: AsyncSession,
        client: httpx.AsyncClient,
        stats: SyncStats,
    ) -> None:
        self._db = db
        self._client = client
        self._stats = stats
        self._apollo_cache: dict[str, dict] = {}
        self._known_emails: set[str] = set()
        self._known_sales_rep_emails: set[str] = set()
        self._person_cache: dict[str, Person] = {}
        self._company_cache: dict[str, Company] = {}
        self._known_positions: set[tuple[int, int]] = set()
        self._person_repo = PersonRepo(db)
        self._company_repo = CompanyRepo(db)
        self._position_repo = PositionRepo(db)
        self._sales_rep_repo = SalesRepRepo(db)
        self._entity_domain_repo = EntityDomainRepo(db)

    async def preload_known_emails(self, emails: set[str]) -> None:
        """Batch-check which emails already exist in people/sales_reps tables."""
        if not emails:
            return

        normalized = [e.lower() for e in emails]

        person_emails = await self._person_repo.list_known_emails(normalized)
        self._known_emails.update(person_emails)

        sales_rep_emails = await self._sales_rep_repo.list_known_emails(normalized)
        self._known_sales_rep_emails.update(sales_rep_emails)
        self._known_emails.update(sales_rep_emails)

        logger.debug(
            "Preloaded %d known emails out of %d unique attendees",
            len(self._known_emails),
            len(normalized),
        )

    def clear_orm_caches(self) -> None:
        """Drop cached ORM instances after a session rollback."""
        self._person_cache.clear()
        self._company_cache.clear()
        self._known_positions.clear()

    async def enrich_attendees(
        self, attendee_emails: list[str]
    ) -> tuple[set[int], set[int]]:
        """Return (person_ids, company_ids) for the given attendee emails."""
        person_ids: set[int] = set()
        company_ids: set[int] = set()

        for email in attendee_emails:
            normalized_email = email.lower()
            if is_excluded_user_email(normalized_email):
                # Shared inboxes should never become Person rows.
                continue
            if normalized_email in self._known_sales_rep_emails:
                # Sales reps should be linked via meeting_sales_rep, not people.
                continue

            # Fallback for call sites that skip preload_known_emails.
            existing_sales_rep = await self._sales_rep_repo.get_by_email(normalized_email)
            if existing_sales_rep is not None:
                self._known_sales_rep_emails.add(normalized_email)
                continue

            apollo_data = await self._get_apollo_data(email)

            person_payload = (
                apollo_data.get("person", {}) if isinstance(apollo_data, dict) else {}
            )
            organization = (
                person_payload.get("organization", {})
                if isinstance(person_payload, dict)
                else {}
            )
            if not isinstance(organization, dict):
                organization = {}

            first_name = normalize_str(person_payload.get("first_name"))
            last_name = normalize_str(person_payload.get("last_name"))
            person_title = normalize_str(person_payload.get("title"))

            person = await self._get_or_create_person(
                email=email,
                first_name=first_name,
                last_name=last_name,
                title=person_title,
            )
            person_ids.add(person.id)

            email_company_domain = extract_domain_from_email(normalized_email)
            if is_personal_email_domain(email_company_domain):
                email_company_domain = None

            # Prefer an existing company that already owns the email domain.
            company = None
            if email_company_domain:
                cached = self._company_cache.get(email_company_domain)
                if cached is not None:
                    company = cached
                else:
                    company = await self._company_repo.get_by_domain(email_company_domain)
                    if company:
                        self._company_cache[email_company_domain] = company

            if company is None:
                apollo_company_domain = extract_company_domain(organization)
                company = await self._get_or_create_company(
                    name=normalize_str(organization.get("name")),
                    domain=apollo_company_domain or email_company_domain,
                )
            if company:
                company_ids.add(company.id)
                await self._ensure_person_company_position(
                    person_id=person.id,
                    company_id=company.id,
                    title=person.title,
                )

        return person_ids, company_ids

    # -- Apollo API ---------------------------------------------------------

    async def _get_apollo_data(self, email: str) -> dict:
        cached = self._apollo_cache.get(email)
        if cached is not None:
            return cached

        if email.lower() in self._known_emails:
            self._apollo_cache[email] = {}
            return {}

        try:
            data = await self._apollo_match_person(email)
        except httpx.HTTPError as exc:
            logger.warning("Apollo match failed for %s: %s", email, exc)
            data = {}

        self._apollo_cache[email] = data
        return data

    async def _apollo_match_person(self, email: str) -> dict:
        if not settings.apollo_api_key:
            raise RuntimeError(
                "APOLLO_API_KEY is not set \u2014 cannot enrich attendee data"
            )

        response = await self._client.post(
            "https://api.apollo.io/api/v1/people/match",
            headers={
                "Content-Type": "application/json",
                "Cache-Control": "no-cache",
                "accept": "application/json",
                "x-api-key": settings.apollo_api_key,
            },
            params={
                "email": email,
                "reveal_personal_emails": "false",
                "reveal_phone_number": "false",
            },
        )
        response.raise_for_status()
        return response.json()

    # -- Person management --------------------------------------------------

    async def _get_or_create_person(
        self,
        *,
        email: str,
        first_name: str | None,
        last_name: str | None,
        title: str | None,
    ) -> Person:
        normalized_email = email.lower()

        cached = self._person_cache.get(normalized_email)
        if cached is not None:
            await self._patch_person_fields(
                cached, first_name=first_name, last_name=last_name, title=title
            )
            return cached

        person = await self._person_repo.get_by_email(normalized_email)
        if person:
            await self._patch_person_fields(
                person, first_name=first_name, last_name=last_name, title=title
            )
            self._person_cache[normalized_email] = person
            return person

        derived_first, derived_last = derive_name_from_email(normalized_email)
        resolved_first = first_name or derived_first
        resolved_last = last_name or derived_last
        normalized_first = normalize_str(resolved_first)
        normalized_last = normalize_str(resolved_last)

        if normalized_first and normalized_last:
            matched_people = await self._person_repo.get_by_name_limited(
                normalized_first, normalized_last
            )
            if matched_people:
                person = matched_people[0]
                if len(matched_people) > 1:
                    logger.warning(
                        "Multiple people rows found for name %s %s; using id=%s",
                        normalized_first,
                        normalized_last,
                        person.id,
                    )
                await self._patch_person_fields(
                    person, first_name=first_name, last_name=last_name, title=title
                )
                self._person_cache[normalized_email] = person
                return person

        person = await self._person_repo.create(
            first_name=resolved_first,
            last_name=resolved_last,
            email=normalized_email,
            title=title,
        )
        self._stats.people_created += 1
        self._person_cache[normalized_email] = person
        return person

    async def _patch_person_fields(
        self,
        person: Person,
        *,
        first_name: str | None,
        last_name: str | None,
        title: str | None,
    ) -> None:
        state = inspect(person)
        if state.expired_attributes:
            # Async ORM instances cannot implicitly lazy-load expired fields.
            await self._db.refresh(
                person,
                attribute_names=["first_name", "last_name", "title"],
            )

        changed = False
        if first_name and person.first_name != first_name:
            person.first_name = first_name
            changed = True
        if last_name and person.last_name != last_name:
            person.last_name = last_name
            changed = True
        if title and not person.title:
            person.title = title
            changed = True
        if changed:
            await self._db.flush()

    # -- Company management -------------------------------------------------

    async def _get_or_create_company(
        self,
        *,
        name: str | None,
        domain: str | None,
    ) -> Company | None:
        normalized_domain = normalize_domain(domain)
        normalized_name = normalize_str(name)

        if normalized_domain:
            cached = self._company_cache.get(normalized_domain)
            if cached is not None:
                if normalized_name and cached.name != normalized_name:
                    cached.name = normalized_name
                return cached

            company = await self._company_repo.get_by_domain(normalized_domain)
            if company:
                if normalized_name and company.name != normalized_name:
                    company.name = normalized_name
                self._company_cache[normalized_domain] = company
                return company

        if normalized_name:
            company = await self._company_repo.get_by_name(normalized_name)
            if company:
                # Avoid lazy-loading relationship attributes in async contexts.
                if normalized_domain:
                    self._company_cache[normalized_domain] = company
                return company

        if not normalized_domain:
            return None

        try:
            async with self._db.begin_nested():
                company = await self._company_repo.create(
                    name=normalized_name or normalized_domain,
                    is_named_account=False,
                )
                self._db.add(EntityDomain(domain=normalized_domain, company_id=company.id))
                await self._db.flush()
        except IntegrityError:
            existing = await self._company_repo.get_by_domain(normalized_domain)
            if existing:
                if normalized_name and existing.name != normalized_name:
                    existing.name = normalized_name
                self._company_cache[normalized_domain] = existing
                return existing
            raise
        self._stats.companies_created += 1
        self._company_cache[normalized_domain] = company
        return company

    # -- Position management ------------------------------------------------

    async def _ensure_person_company_position(
        self,
        *,
        person_id: int,
        company_id: int,
        title: str | None,
    ) -> None:
        pair = (person_id, company_id)
        if pair in self._known_positions:
            return

        existing = await self._position_repo.find_by_person_and_company(
            person_id, company_id
        )
        if existing is not None:
            self._known_positions.add(pair)
            return

        if not title:
            return

        await self._position_repo.create(
            title=title,
            role=None,
            person_id=person_id,
            company_id=company_id,
        )
        self._known_positions.add(pair)
