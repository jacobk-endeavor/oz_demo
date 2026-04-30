from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import httpx
from pydantic import BaseModel
from sqlalchemy import func, insert, select

from app.config import settings
from app.database import async_session
from app.domain_utils import normalize_domain
from app.models.associations import meeting_company, meeting_person
from app.models.company import Company
from app.models.company_hubspot_id import CompanyHubspotId
from app.models.deal import Deal
from app.models.entity_domain import EntityDomain
from app.models.enums import DealStatus
from app.models.person import Person
from app.models.position import Position
from app.models.sales_rep import SalesRep
from app.repositories.company_repo import CompanyRepo
from app.repositories.deal_repo import DealRepo
from app.repositories.entity_domain_repo import EntityDomainRepo
from app.repositories.person_repo import PersonRepo
from app.repositories.position_repo import PositionRepo
from app.repositories.sales_rep_repo import SalesRepRepo
from app.services.calendar_sync.models import (
    extract_domain_from_email,
    is_personal_email_domain,
)
from app.services.calendar_sync.user_filters import is_excluded_user_email
from app.services.company_email_sync import HubSpotCompanyEmailSyncService

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.hubapi.com"
_MAX_ATTEMPTS = 4

STAGE_MAP: dict[str, DealStatus] = {
    "appointmentscheduled": DealStatus.NEW_LEAD,
    "qualifiedtobuy": DealStatus.OPEN,
    "presentationscheduled": DealStatus.OPEN,
    "decisionmakerboughtin": DealStatus.OPEN,
    "contractsent": DealStatus.OPEN,
    "closedwon": DealStatus.CLOSED,
    "closedlost": DealStatus.DEAD,
}


def _terminal(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[hubspot-sync {ts}] {message}", flush=True)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _parse_float(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _parse_int(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def _normalize_domain(value: str | None) -> str | None:
    return normalize_domain(value)


_PROGRESS_EVERY = 50
_FLUSH_EVERY = 200


def _extract_company_domains(properties: dict) -> set[str]:
    """Collect and normalize all domains from HubSpot company properties."""
    domains: set[str] = set()
    primary = _normalize_domain(properties.get("domain"))
    if primary:
        domains.add(primary)
    for raw_d in (properties.get("hs_additional_domains") or "").split(";"):
        nd = _normalize_domain(raw_d.strip())
        if nd:
            domains.add(nd)
    return domains


class HubSpotSyncStats(BaseModel):
    owners_synced: int = 0
    companies_synced: int = 0
    contacts_synced: int = 0
    contacts_skipped: int = 0
    deals_synced: int = 0
    emails_synced: int = 0
    email_company_links: int = 0
    email_user_links: int = 0
    meeting_company_links_added: int = 0
    failed: int = 0


class HubSpotSyncer:
    def __init__(self, db, client: httpx.AsyncClient) -> None:
        self._db = db
        self._client = client
        self.stats = HubSpotSyncStats()
        self._sales_rep_repo = SalesRepRepo(db)
        self._company_repo = CompanyRepo(db)
        self._person_repo = PersonRepo(db)
        self._position_repo = PositionRepo(db)
        self._deal_repo = DealRepo(db)
        self._entity_domain_repo = EntityDomainRepo(db)

    # -- public entry point -------------------------------------------------------

    async def run(self) -> HubSpotSyncStats:
        self.step_times: dict[str, float] = {}
        run_start = datetime.now(timezone.utc)

        t0 = datetime.now(timezone.utc)
        await self._sync_owners()
        self.step_times["owners"] = (datetime.now(timezone.utc) - t0).total_seconds()

        t0 = datetime.now(timezone.utc)
        await self._sync_companies()
        self.step_times["companies"] = (datetime.now(timezone.utc) - t0).total_seconds()

        t0 = datetime.now(timezone.utc)
        await self._backfill_meeting_company_links()
        self.step_times["meeting_links"] = (
            datetime.now(timezone.utc) - t0
        ).total_seconds()

        t0 = datetime.now(timezone.utc)
        await self._sync_contacts()
        self.step_times["contacts"] = (datetime.now(timezone.utc) - t0).total_seconds()

        t0 = datetime.now(timezone.utc)
        await self._sync_deals()
        self.step_times["deals"] = (datetime.now(timezone.utc) - t0).total_seconds()

        t0 = datetime.now(timezone.utc)
        await self._sync_emails()
        self.step_times["emails"] = (datetime.now(timezone.utc) - t0).total_seconds()

        self.step_times["total"] = (
            datetime.now(timezone.utc) - run_start
        ).total_seconds()
        return self.stats

    # -- HTTP layer ---------------------------------------------------------------

    async def _api_request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json: dict | None = None,
    ) -> dict:
        url = f"{_BASE_URL}{path}"
        delay_seconds = 1.0
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                response = await self._client.request(
                    method,
                    url,
                    params=params,
                    json=json,
                    headers={"Authorization": f"Bearer {settings.hubspot_api_key}"},
                )
            except httpx.RequestError:
                if attempt == _MAX_ATTEMPTS:
                    raise
                await asyncio.sleep(delay_seconds)
                delay_seconds = min(delay_seconds * 2, 30.0)
                continue

            if response.status_code == 429 or response.status_code >= 500:
                if attempt == _MAX_ATTEMPTS:
                    response.raise_for_status()
                retry_after = response.headers.get("Retry-After")
                wait = (
                    float(retry_after)
                    if retry_after and retry_after.isdigit()
                    else delay_seconds
                )
                await asyncio.sleep(wait)
                delay_seconds = min(delay_seconds * 2, 30.0)
                continue

            response.raise_for_status()
            return response.json()
        return {}

    async def _api_get(self, path: str, *, params: dict | None = None) -> dict:
        return await self._api_request("GET", path, params=params)

    async def _api_post(self, path: str, *, json: dict) -> dict:
        return await self._api_request("POST", path, json=json)

    async def _paginated_get(
        self, path: str, *, properties: list[str] | None = None
    ) -> list[dict]:
        all_results: list[dict] = []
        params: dict[str, str] = {"limit": "100"}
        if properties:
            params["properties"] = ",".join(properties)
        after: str | None = None

        while True:
            if after:
                params["after"] = after
            data = await self._api_get(path, params=params)
            results = data.get("results", [])
            all_results.extend(results)
            paging = data.get("paging", {})
            next_page = paging.get("next", {})
            after = next_page.get("after")
            if not after:
                break

        return all_results

    # -- associations -------------------------------------------------------------

    async def _get_associations_batch(
        self,
        from_type: str,
        to_type: str,
        from_ids: list[str],
    ) -> dict[str, str | None]:
        """Batch-fetch associations. Returns {from_id: first_to_id}."""
        result: dict[str, str | None] = {fid: None for fid in from_ids}
        for i in range(0, len(from_ids), 100):
            chunk = from_ids[i : i + 100]
            try:
                data = await self._api_post(
                    f"/crm/v4/associations/{from_type}/{to_type}/batch/read",
                    json={"inputs": [{"id": fid} for fid in chunk]},
                )
            except Exception as exc:
                logger.warning(
                    "Failed to fetch %s→%s associations: %s",
                    from_type, to_type, exc,
                )
                continue

            for item in data.get("results", []):
                from_id = str(item.get("from", {}).get("id", ""))
                to_list = item.get("to", [])
                if from_id and to_list:
                    result[from_id] = str(to_list[0].get("toObjectId", ""))
        return result

    # -- batch flush helper -------------------------------------------------------

    async def _flush_batch(
        self, pending: int, step: str, position: str, *, commit: bool = False
    ) -> bool:
        """Flush pending ORM changes. Returns True on success."""
        try:
            async with self._db.begin_nested():
                await self._db.flush()
            if commit:
                await self._db.commit()
            return True
        except Exception as exc:
            for obj in list(self._db.new):
                self._db.expunge(obj)
            if commit:
                await self._db.rollback()
            self.stats.failed += pending
            logger.exception("%s flush failed", step)
            _terminal(f"{step} {position} flush failed: {exc}")
            return False

    # -- owners → SalesRep --------------------------------------------------------

    async def _sync_owners(self) -> None:
        _terminal("[1/5] Fetching HubSpot owners")
        try:
            owners = await self._paginated_get("/crm/v3/owners")
        except Exception as exc:
            self.stats.failed += 1
            _terminal(f"[1/5] Failed to fetch owners: {exc}")
            logger.exception("HubSpot owners fetch failed")
            return

        total = len(owners)
        result = await self._db.execute(
            select(SalesRep).where(SalesRep.hubspot_owner_id.is_not(None))
        )
        rep_by_hs = {r.hubspot_owner_id: r for r in result.scalars().all()}
        _terminal(
            f"[1/5] Fetched {total} owner(s), {len(rep_by_hs)} existing in DB, processing"
        )

        created = 0
        updated = 0
        unchanged = 0
        for idx, owner in enumerate(owners, 1):
            owner_id = str(owner.get("id", ""))
            if not owner_id:
                continue
            first_name = (owner.get("firstName") or "").strip() or None
            last_name = (owner.get("lastName") or "").strip() or None
            email = (owner.get("email") or "").strip().lower() or None

            rep = rep_by_hs.get(owner_id)
            if rep:
                changed = {}
                if first_name and rep.first_name != first_name:
                    changed["first_name"] = first_name
                if last_name and rep.last_name != last_name:
                    changed["last_name"] = last_name
                if email and rep.email != email:
                    changed["email"] = email
                if not changed:
                    unchanged += 1
                    continue
                try:
                    async with self._db.begin_nested():
                        await self._sales_rep_repo.update(rep, changed)
                    updated += 1
                except Exception as exc:
                    self.stats.failed += 1
                    logger.exception("Failed to update owner %s", owner_id)
                    _terminal(f"[1/5] Failed owner {owner_id}: {exc}")
            else:
                try:
                    async with self._db.begin_nested():
                        new_rep = await self._sales_rep_repo.create(
                            hubspot_owner_id=owner_id,
                            first_name=first_name,
                            last_name=last_name,
                            email=email,
                        )
                    rep_by_hs[owner_id] = new_rep
                    created += 1
                except Exception as exc:
                    self.stats.failed += 1
                    logger.exception("Failed to create owner %s", owner_id)
                    _terminal(f"[1/5] Failed owner {owner_id}: {exc}")

            if idx % _PROGRESS_EVERY == 0:
                _terminal(f"[1/5] Owners progress: {idx}/{total}")

        await self._sales_rep_repo.commit()
        self.stats.owners_synced = created + updated + unchanged
        _terminal(
            f"[1/5] Owners done: {created} created, {updated} updated, "
            f"{unchanged} unchanged, {self.stats.failed} failed"
        )

    # -- shared sync helpers -------------------------------------------------------

    async def _register_new_domains(
        self,
        company: Company,
        new_domains: set[str],
        known_domains: set[str],
        domain_company_map: dict[str, Company],
    ) -> None:
        """Add EntityDomain rows for domains not yet tracked."""
        if not new_domains:
            return
        already_exist = await self._domains_existing_in_db(new_domains)
        for d in new_domains:
            if d.lower() in already_exist:
                known_domains.add(d.lower())
                continue
            self._db.add(EntityDomain(domain=d, company=company))
            known_domains.add(d.lower())
            domain_company_map[d.lower()] = company

    def _ensure_position(
        self,
        person: Person,
        company_id: int,
        title: str | None,
        existing_positions: set[tuple[int, int]],
    ) -> None:
        """Add a Position if one doesn't already exist for (person, company)."""
        if person.id is not None:
            if (person.id, company_id) in existing_positions:
                return
            self._db.add(
                Position(
                    title=title or "Unknown",
                    role=None,
                    person_id=person.id,
                    company_id=company_id,
                )
            )
            existing_positions.add((person.id, company_id))
        else:
            self._db.add(
                Position(
                    title=title or "Unknown",
                    role=None,
                    person=person,
                    company_id=company_id,
                )
            )

    # -- entity-domain helpers -----------------------------------------------------

    async def _domains_existing_in_db(self, domains: set[str]) -> set[str]:
        """Return the subset of *domains* that already exist in entity_domains."""
        if not domains:
            return set()
        lowered = [d.lower() for d in domains]
        with self._db.no_autoflush:
            result = await self._db.execute(
                select(func.lower(EntityDomain.domain)).where(
                    func.lower(EntityDomain.domain).in_(lowered)
                )
            )
            return set(result.scalars().all())

    async def _find_company_by_domain_in_db(
        self,
        domains: set[str],
        company_by_id: dict[int, Company],
    ) -> Company | None:
        """Fall back to the DB to find a company by domain (handles concurrent inserts)."""
        if not domains:
            return None
        lowered = [d.lower() for d in domains]
        with self._db.no_autoflush:
            result = await self._db.execute(
                select(EntityDomain).where(
                    func.lower(EntityDomain.domain).in_(lowered)
                )
            )
            for ed in result.scalars().all():
                if not ed.company_id:
                    continue
                comp = company_by_id.get(ed.company_id)
                if comp:
                    return comp
                comp_result = await self._db.execute(
                    select(Company).where(Company.id == ed.company_id)
                )
                comp = comp_result.scalar_one_or_none()
                if comp:
                    company_by_id[comp.id] = comp
                    return comp
        return None

    # -- companies → Company ------------------------------------------------------

    async def _sync_companies(self) -> None:
        _terminal("[2/5] Fetching HubSpot companies")
        props = [
            "name",
            "domain",
            "hs_additional_domains",
            "annualrevenue",
            "numberofemployees",
            "linkedin_company_page",
        ]
        try:
            companies = await self._paginated_get(
                "/crm/v3/objects/companies", properties=props
            )
        except Exception as exc:
            self.stats.failed += 1
            _terminal(f"[2/5] Failed to fetch companies: {exc}")
            logger.exception("HubSpot companies fetch failed")
            return

        total = len(companies)

        result = await self._db.execute(select(Company))
        all_companies = list(result.scalars().all())
        company_by_id: dict[int, Company] = {c.id: c for c in all_companies}

        hs_id_result = await self._db.execute(select(CompanyHubspotId))
        hs_company_map: dict[str, Company] = {}
        for mapping in hs_id_result.scalars().all():
            comp = company_by_id.get(mapping.company_id)
            if comp:
                hs_company_map[mapping.hubspot_company_id] = comp

        # Pre-fetch: entity domains → known domains set + domain→company mapping
        result = await self._db.execute(select(EntityDomain))
        all_eds = list(result.scalars().all())
        known_domains: set[str] = set()
        domain_company_map: dict[str, Company] = {}
        for ed in all_eds:
            if ed.domain:
                norm = ed.domain.lower()
                known_domains.add(norm)
                if ed.company_id and ed.company_id in company_by_id:
                    domain_company_map[norm] = company_by_id[ed.company_id]

        _terminal(
            f"[2/5] Fetched {total} company(ies), "
            f"{len(hs_company_map)} existing in DB, processing"
        )

        created = 0
        updated = 0
        unchanged = 0
        pending = 0
        failed_before = self.stats.failed
        for idx, item in enumerate(companies, 1):
            hs_id = str(item.get("id", ""))
            p = item.get("properties", {})
            name = (p.get("name") or "").strip()
            if not hs_id or not name:
                continue

            all_domains = _extract_company_domains(p)
            revenue = (p.get("annualrevenue") or "").strip() or None
            employee_count = _parse_int(p.get("numberofemployees"))
            linkedin = (p.get("linkedin_company_page") or "").strip() or None
            new_domains = {d for d in all_domains if d.lower() not in known_domains}

            company = hs_company_map.get(hs_id)
            if company:
                changed: dict = {}
                if name and company.name != name:
                    changed["name"] = name
                if revenue is not None and company.revenue != revenue:
                    changed["revenue"] = revenue
                if (
                    employee_count is not None
                    and company.employee_count != employee_count
                ):
                    changed["employee_count"] = employee_count
                if linkedin is not None and company.linkedin != linkedin:
                    changed["linkedin"] = linkedin

                if not changed and not new_domains:
                    unchanged += 1
                    continue

                if changed:
                    for k, v in changed.items():
                        setattr(company, k, v)
                    updated += 1
                else:
                    unchanged += 1
                await self._register_new_domains(
                    company, new_domains, known_domains, domain_company_map
                )
                pending += 1
            else:
                matched_by_domain: Company | None = None
                for d in all_domains:
                    matched_by_domain = domain_company_map.get(d.lower())
                    if matched_by_domain:
                        break
                if not matched_by_domain:
                    matched_by_domain = await self._find_company_by_domain_in_db(
                        all_domains, company_by_id
                    )
                    if matched_by_domain:
                        for d in all_domains:
                            known_domains.add(d.lower())
                            domain_company_map[d.lower()] = matched_by_domain

                if matched_by_domain:
                    self._db.add(
                        CompanyHubspotId(
                            hubspot_company_id=hs_id,
                            company=matched_by_domain,
                        )
                    )
                    if name and matched_by_domain.name != name:
                        matched_by_domain.name = name
                    if revenue is not None:
                        matched_by_domain.revenue = revenue
                    if employee_count is not None:
                        matched_by_domain.employee_count = employee_count
                    if linkedin is not None:
                        matched_by_domain.linkedin = linkedin
                    hs_company_map[hs_id] = matched_by_domain
                    await self._register_new_domains(
                        matched_by_domain, new_domains, known_domains, domain_company_map
                    )
                    updated += 1
                else:
                    placeholder = f"{hs_id}.hubspot.placeholder"
                    if not all_domains:
                        all_domains.add(placeholder)
                        new_domains.add(placeholder)
                    new_company = Company(
                        name=name,
                        revenue=revenue,
                        employee_count=employee_count,
                        linkedin=linkedin,
                    )
                    self._db.add(new_company)
                    self._db.add(
                        CompanyHubspotId(
                            hubspot_company_id=hs_id,
                            company=new_company,
                        )
                    )
                    await self._register_new_domains(
                        new_company, new_domains, known_domains, domain_company_map
                    )
                    hs_company_map[hs_id] = new_company
                    created += 1
                pending += 1

            if pending >= _FLUSH_EVERY:
                await self._flush_batch(pending, "[2/5]", f"at {idx}/{total}")
                pending = 0

            if idx % _PROGRESS_EVERY == 0:
                _terminal(f"[2/5] Companies progress: {idx}/{total}")

        if pending > 0:
            await self._flush_batch(pending, "[2/5]", "final")

        await self._company_repo.commit()
        self.stats.companies_synced = created + updated + unchanged
        step_failed = self.stats.failed - failed_before
        _terminal(
            f"[2/5] Companies done: {created} created, {updated} updated, "
            f"{unchanged} unchanged, {step_failed} failed"
        )

    # -- meeting↔company backfill -------------------------------------------------

    async def _backfill_meeting_company_links(self) -> None:
        """Add missing meeting↔company links based on attendee email domains."""
        _terminal("[2b/5] Backfilling meeting↔company links from attendee emails")

        result = await self._db.execute(
            select(EntityDomain.domain, EntityDomain.company_id)
        )
        domain_to_company: dict[str, int] = {}
        for domain, company_id in result.all():
            if domain and company_id:
                domain_to_company[domain.lower()] = company_id

        if not domain_to_company:
            _terminal("[2b/5] No entity domains in DB, skipping")
            return

        result = await self._db.execute(
            select(func.lower(SalesRep.email)).where(SalesRep.email.is_not(None))
        )
        sales_rep_emails: set[str] = {e for e in result.scalars().all() if e}

        result = await self._db.execute(
            select(meeting_person.c.meeting_id, func.lower(Person.email))
            .join(Person, meeting_person.c.person_id == Person.id)
            .where(Person.email.is_not(None))
        )
        attendee_rows = result.all()

        result = await self._db.execute(
            select(meeting_company.c.meeting_id, meeting_company.c.company_id)
        )
        existing_links: set[tuple[int, int]] = set(result.all())

        new_links: list[dict[str, int]] = []
        for mid, email in attendee_rows:
            if not email or email in sales_rep_emails or is_excluded_user_email(email):
                continue
            domain = extract_domain_from_email(email)
            if not domain or is_personal_email_domain(domain):
                continue
            cid = domain_to_company.get(domain)
            if cid is None:
                continue
            pair = (mid, cid)
            if pair in existing_links:
                continue
            existing_links.add(pair)
            new_links.append({"meeting_id": mid, "company_id": cid})

        if new_links:
            try:
                for i in range(0, len(new_links), _FLUSH_EVERY):
                    batch = new_links[i : i + _FLUSH_EVERY]
                    await self._db.execute(insert(meeting_company), batch)
                await self._db.flush()
                await self._db.commit()
            except Exception as exc:
                for obj in list(self._db.new):
                    self._db.expunge(obj)
                await self._db.rollback()
                new_links = []
                logger.exception("Meeting↔company backfill flush failed")
                _terminal(f"[2b/5] Backfill flush failed: {exc}")

        self.stats.meeting_company_links_added = len(new_links)
        _terminal(f"[2b/5] Meeting↔company backfill: {len(new_links)} link(s) added")

    # -- contacts → Person --------------------------------------------------------

    async def _sync_contacts(self, *, allow_reconcile_retry: bool = True) -> None:
        _terminal("[3/5] Fetching HubSpot contacts")
        props = ["firstname", "lastname", "email", "jobtitle"]
        try:
            contacts = await self._paginated_get(
                "/crm/v3/objects/contacts", properties=props
            )
        except Exception as exc:
            self.stats.failed += 1
            _terminal(f"[3/5] Failed to fetch contacts: {exc}")
            logger.exception("HubSpot contacts fetch failed")
            return

        total = len(contacts)
        _terminal(f"[3/5] Fetched {total} contact(s), resolving company associations")
        contact_ids = [str(item.get("id", "")) for item in contacts if item.get("id")]
        associations = await self._get_associations_batch(
            "contacts", "companies", contact_ids
        )
        matched = sum(1 for v in associations.values() if v)

        result = await self._db.execute(
            select(CompanyHubspotId.hubspot_company_id, CompanyHubspotId.company_id)
        )
        hs_company_map: dict[str, int] = {
            row[0]: row[1] for row in result.all() if row[1] is not None
        }

        # Pre-fetch: people by hubspot_contact_id and by email
        result = await self._db.execute(select(Person))
        all_people = list(result.scalars().all())
        hs_person_map: dict[str, Person] = {}
        email_person_map: dict[str, Person] = {}
        for p_obj in all_people:
            if p_obj.hubspot_contact_id:
                hs_person_map[p_obj.hubspot_contact_id] = p_obj
            if p_obj.email:
                email_person_map[p_obj.email.lower()] = p_obj

        # Pre-fetch: existing positions as (person_id, company_id) pairs
        result = await self._db.execute(
            select(Position.person_id, Position.company_id).where(
                Position.company_id.is_not(None)
            )
        )
        existing_positions: set[tuple[int, int]] = {
            (row[0], row[1]) for row in result.all()
        }

        _terminal(
            f"[3/5] Associations resolved ({matched}/{len(contact_ids)} have a company), "
            f"{len(hs_person_map)} existing people, processing"
        )

        created = 0
        updated = 0
        unchanged = 0
        skipped = 0
        pending = 0
        failed_before = self.stats.failed
        for idx, item in enumerate(contacts, 1):
            hs_id = str(item.get("id", ""))
            p = item.get("properties", {})
            first_name = (p.get("firstname") or "").strip()
            last_name = (p.get("lastname") or "").strip()
            email = (p.get("email") or "").strip().lower() or None
            title = (p.get("jobtitle") or "").strip() or None

            if not hs_id or (not first_name and not last_name):
                continue
            first_name = first_name or "Unknown"
            last_name = last_name or "Unknown"

            associated_company_hs_id = associations.get(hs_id)
            company_id = (
                hs_company_map.get(associated_company_hs_id)
                if associated_company_hs_id
                else None
            )
            if not company_id:
                skipped += 1
                continue

            person = hs_person_map.get(hs_id)
            if person:
                changed: dict = {}
                if first_name and person.first_name != first_name:
                    changed["first_name"] = first_name
                if last_name and person.last_name != last_name:
                    changed["last_name"] = last_name
                if email and person.email != email:
                    changed["email"] = email
                if title is not None and person.title != title:
                    changed["title"] = title

                need_position = (person.id, company_id) not in existing_positions
                if not changed and not need_position:
                    unchanged += 1
                    continue

                if changed:
                    for k, v in changed.items():
                        setattr(person, k, v)
                    updated += 1
                else:
                    unchanged += 1
                self._ensure_position(person, company_id, title, existing_positions)
                pending += 1
            else:
                person = email_person_map.get(email) if email else None
                if person:
                    person.hubspot_contact_id = hs_id
                    if first_name and person.first_name != first_name:
                        person.first_name = first_name
                    if last_name and person.last_name != last_name:
                        person.last_name = last_name
                    if title is not None:
                        person.title = title
                    hs_person_map[hs_id] = person
                    updated += 1
                    self._ensure_position(person, company_id, title, existing_positions)
                else:
                    if not email:
                        email = f"hs-contact-{hs_id}@placeholder.invalid"
                    person = Person(
                        first_name=first_name,
                        last_name=last_name,
                        email=email,
                        title=title,
                        hubspot_contact_id=hs_id,
                    )
                    self._db.add(person)
                    self._ensure_position(person, company_id, title, existing_positions)
                    hs_person_map[hs_id] = person
                    if email:
                        email_person_map[email.lower()] = person
                    created += 1
                pending += 1

            if pending >= _FLUSH_EVERY:
                if not await self._flush_batch(
                    pending, "[3/5]", f"at {idx}/{total}", commit=True
                ):
                    # Refresh caches after rollback so subsequent attribute access
                    # never touches expired ORM instances.
                    result = await self._db.execute(select(Person))
                    all_people = list(result.scalars().all())
                    hs_person_map = {}
                    email_person_map = {}
                    for p_obj in all_people:
                        if p_obj.hubspot_contact_id:
                            hs_person_map[p_obj.hubspot_contact_id] = p_obj
                        if p_obj.email:
                            email_person_map[p_obj.email.lower()] = p_obj
                    result = await self._db.execute(
                        select(Position.person_id, Position.company_id).where(
                            Position.company_id.is_not(None)
                        )
                    )
                    existing_positions = {(row[0], row[1]) for row in result.all()}
                pending = 0

            if idx % _PROGRESS_EVERY == 0:
                _terminal(f"[3/5] Contacts progress: {idx}/{total}")

        if pending > 0:
            await self._flush_batch(pending, "[3/5]", "final", commit=True)
        self.stats.contacts_synced = created + updated + unchanged
        self.stats.contacts_skipped = skipped
        step_failed = self.stats.failed - failed_before
        _terminal(
            f"[3/5] Contacts done: {created} created, {updated} updated, "
            f"{unchanged} unchanged, {skipped} skipped (no company), {step_failed} failed"
        )

        if allow_reconcile_retry and step_failed > 0:
            _terminal(
                f"[3/5] Re-running contacts once immediately to recover "
                f"{step_failed} failed row(s) without waiting for next tick"
            )
            failed_before_retry = self.stats.failed
            await self._sync_contacts(allow_reconcile_retry=False)
            retry_step_failed = self.stats.failed - failed_before_retry
            if retry_step_failed == 0:
                # First-pass failures were transient conflicts recovered by retry.
                self.stats.failed = max(self.stats.failed - step_failed, 0)
                _terminal(
                    f"[3/5] Immediate reconcile succeeded; recovered "
                    f"{step_failed} previously failed row(s)"
                )
            else:
                _terminal(
                    f"[3/5] Immediate reconcile still has {retry_step_failed} failed row(s)"
                )

    # -- deals → Deal -------------------------------------------------------------

    async def _sync_deals(self) -> None:
        _terminal("[4/5] Fetching HubSpot deals")
        props = ["dealname", "dealstage", "amount", "closedate", "hubspot_owner_id"]
        try:
            deals = await self._paginated_get("/crm/v3/objects/deals", properties=props)
        except Exception as exc:
            self.stats.failed += 1
            _terminal(f"[4/5] Failed to fetch deals: {exc}")
            logger.exception("HubSpot deals fetch failed")
            return

        total = len(deals)
        _terminal(f"[4/5] Fetched {total} deal(s), resolving company associations")
        deal_ids = [str(item.get("id", "")) for item in deals if item.get("id")]
        deal_company_assoc = await self._get_associations_batch(
            "deals", "companies", deal_ids
        )
        matched = sum(1 for v in deal_company_assoc.values() if v)

        # Pre-fetch: sales reps by hubspot_owner_id
        result = await self._db.execute(
            select(SalesRep).where(SalesRep.hubspot_owner_id.is_not(None))
        )
        hs_rep_map = {r.hubspot_owner_id: r for r in result.scalars().all()}

        result = await self._db.execute(
            select(CompanyHubspotId, Company).join(
                Company, CompanyHubspotId.company_id == Company.id
            )
        )
        hs_company_map: dict[str, Company] = {
            row[0].hubspot_company_id: row[1] for row in result.all()
        }

        # Pre-fetch: deals by hubspot_deal_id
        result = await self._db.execute(
            select(Deal).where(Deal.hubspot_deal_id.is_not(None))
        )
        hs_deal_map = {d.hubspot_deal_id: d for d in result.scalars().all()}

        _terminal(
            f"[4/5] Associations resolved ({matched}/{len(deal_ids)} have a company), "
            f"{len(hs_deal_map)} existing deals, processing"
        )

        created = 0
        updated = 0
        unchanged = 0
        pending = 0
        failed_before = self.stats.failed
        for idx, item in enumerate(deals, 1):
            hs_id = str(item.get("id", ""))
            p = item.get("properties", {})
            name = (p.get("dealname") or "").strip() or None
            stage_raw = (p.get("dealstage") or "").strip().lower()
            status = STAGE_MAP.get(stage_raw, DealStatus.OPEN)
            amount = _parse_float(p.get("amount"))
            close_date = _parse_datetime(p.get("closedate"))
            hs_owner_id = (p.get("hubspot_owner_id") or "").strip() or None

            if not hs_id:
                continue

            rep = hs_rep_map.get(hs_owner_id) if hs_owner_id else None
            sales_rep_id = rep.id if rep else None

            assoc_company_hs_id = deal_company_assoc.get(hs_id)
            company_obj = (
                hs_company_map.get(assoc_company_hs_id) if assoc_company_hs_id else None
            )
            company_id = company_obj.id if company_obj else None

            deal = hs_deal_map.get(hs_id)
            if deal:
                changed: dict = {}
                if name and deal.name != name:
                    changed["name"] = name
                if deal.status != status:
                    changed["status"] = status
                if stage_raw and deal.hubspot_deal_stage != stage_raw:
                    changed["hubspot_deal_stage"] = stage_raw
                if amount is not None and deal.amount != amount:
                    changed["amount"] = amount
                if close_date and deal.close_date != close_date:
                    changed["close_date"] = close_date
                if sales_rep_id is not None and deal.sales_rep_id != sales_rep_id:
                    changed["sales_rep_id"] = sales_rep_id
                if company_id is not None and deal.company_id != company_id:
                    changed["company_id"] = company_id
                if not changed:
                    unchanged += 1
                    continue
                for k, v in changed.items():
                    setattr(deal, k, v)
                updated += 1
            else:
                new_deal = Deal(
                    name=name,
                    hubspot_deal_id=hs_id,
                    hubspot_deal_stage=stage_raw or None,
                    status=status,
                    amount=amount,
                    close_date=close_date,
                    sales_rep_id=sales_rep_id,
                    company_id=company_id,
                )
                self._db.add(new_deal)
                hs_deal_map[hs_id] = new_deal
                created += 1
            pending += 1

            if pending >= _FLUSH_EVERY:
                await self._flush_batch(pending, "[4/5]", f"at {idx}/{total}")
                pending = 0

            if idx % _PROGRESS_EVERY == 0:
                _terminal(f"[4/5] Deals progress: {idx}/{total}")

        if pending > 0:
            await self._flush_batch(pending, "[4/5]", "final")

        await self._deal_repo.commit()
        self.stats.deals_synced = created + updated + unchanged
        step_failed = self.stats.failed - failed_before
        _terminal(
            f"[4/5] Deals done: {created} created, {updated} updated, "
            f"{unchanged} unchanged, {step_failed} failed"
        )

    async def _sync_emails(self) -> None:
        _terminal("[5/5] Syncing HubSpot emails")
        try:
            stats = await HubSpotCompanyEmailSyncService(
                self._db,
                self._client,
                access_token=settings.hubspot_api_key,
            ).run_incremental()
        except Exception as exc:
            self.stats.failed += 1
            _terminal(f"[5/5] Failed to sync emails: {exc}")
            logger.exception("HubSpot email sync failed")
            return

        self.stats.emails_synced = stats.emails_synced
        self.stats.email_company_links = stats.company_links_upserted
        self.stats.email_user_links = stats.user_links_upserted
        self.stats.failed += stats.failed
        _terminal(
            f"[5/5] Emails done: {stats.emails_created} created, "
            f"{stats.emails_updated} updated, {stats.emails_unchanged} unchanged, "
            f"{stats.company_links_upserted} company link(s), "
            f"{stats.user_links_upserted} user link(s), {stats.failed} failed"
        )


# -- module-level public API -------------------------------------------------------


async def sync_hubspot_once() -> HubSpotSyncStats:
    if not settings.hubspot_sync_enabled:
        logger.debug("HubSpot sync disabled by configuration")
        return HubSpotSyncStats()
    if not settings.hubspot_api_key:
        logger.debug("HubSpot sync skipped because hubspot_api_key is empty")
        _terminal("Skipped run because HUBSPOT_API_KEY is empty")
        return HubSpotSyncStats()

    _terminal("Starting HubSpot sync run")

    async with async_session() as db:
        async with httpx.AsyncClient(timeout=30.0) as client:
            syncer = HubSpotSyncer(db, client)
            stats = await syncer.run()
            step_times = syncer.step_times

    timing = (
        f"total={step_times.get('total', 0):.1f}s "
        f"(owners={step_times.get('owners', 0):.1f}s, "
        f"companies={step_times.get('companies', 0):.1f}s, "
        f"meeting_links={step_times.get('meeting_links', 0):.1f}s, "
        f"contacts={step_times.get('contacts', 0):.1f}s, "
        f"deals={step_times.get('deals', 0):.1f}s, "
        f"emails={step_times.get('emails', 0):.1f}s)"
    )
    _terminal(
        f"HubSpot sync complete in {timing} "
        f"owners={stats.owners_synced} companies={stats.companies_synced} "
        f"meeting_links={stats.meeting_company_links_added} "
        f"contacts={stats.contacts_synced} contacts_skipped={stats.contacts_skipped} "
        f"deals={stats.deals_synced} emails={stats.emails_synced} "
        f"email_company_links={stats.email_company_links} "
        f"email_user_links={stats.email_user_links} "
        f"failed={stats.failed}"
    )
    return stats


async def run_periodic_hubspot_sync(*, run_immediately: bool = True) -> None:
    interval_seconds = max(settings.hubspot_sync_interval_seconds, 10)
    first_iteration = True
    while True:
        if first_iteration and not run_immediately:
            await asyncio.sleep(interval_seconds)
        first_iteration = False

        started = datetime.now(timezone.utc)
        try:
            stats = await sync_hubspot_once()
            _terminal(
                f"Tick done; sleeping for "
                f"{max(interval_seconds - (datetime.now(timezone.utc) - started).total_seconds(), 0):.1f}s "
                f"(owners={stats.owners_synced}, deals={stats.deals_synced}, failed={stats.failed})"
            )
        except asyncio.CancelledError:
            _terminal("Periodic HubSpot sync loop cancelled")
            raise
        except Exception:
            logger.exception("HubSpot periodic sync loop failed")
            _terminal("Periodic HubSpot sync loop failed; will retry next tick")

        elapsed_seconds = (datetime.now(timezone.utc) - started).total_seconds()
        sleep_seconds = max(interval_seconds - elapsed_seconds, 0)
        await asyncio.sleep(sleep_seconds)
